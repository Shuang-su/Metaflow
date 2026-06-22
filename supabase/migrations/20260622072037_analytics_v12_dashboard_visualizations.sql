-- Metaflow analytics v1.2 dashboard visualizations.
-- Adds hourly, retention, acquisition, and device-model rollups for Metabase.

drop materialized view if exists analytics.hourly_usage_metrics;
drop materialized view if exists analytics.daily_retention_cohorts;
drop materialized view if exists analytics.daily_acquisition_metrics;
drop materialized view if exists analytics.daily_device_model_metrics;

create materialized view analytics.hourly_usage_metrics as
with hour_keys as (
    select date_trunc('hour', page_viewed_at) as metric_hour
    from analytics.fact_page_views
    union
    select date_trunc('hour', session_started_at) as metric_hour
    from analytics.fact_sessions
    where session_started_at is not null
    union
    select date_trunc('hour', started_at) as metric_hour
    from analytics.fact_resource_loads
    where started_at is not null
    union
    select date_trunc('hour', occurred_at) as metric_hour
    from analytics.events_raw
    where event_name in ('client_error', 'resource_load_failed', 'xr_failed', 'replay_failed')
),
page_views as (
    select
        date_trunc('hour', page_viewed_at) as metric_hour,
        count(*) as page_views,
        count(distinct anonymous_user_id_hash) as unique_users,
        count(distinct session_id) as page_view_sessions
    from analytics.fact_page_views
    group by 1
),
sessions as (
    select
        date_trunc('hour', session_started_at) as metric_hour,
        count(*) as sessions,
        count(*) filter (where engaged_session) as engaged_sessions,
        count(*) filter (where bounce) as bounces,
        avg(duration_seconds)::numeric as avg_duration_seconds
    from analytics.fact_sessions
    where session_started_at is not null
    group by 1
),
loads as (
    select
        date_trunc('hour', started_at) as metric_hour,
        count(*) as load_attempts,
        count(*) filter (where load_result = 'loaded') as first_frame_ready,
        count(*) filter (where load_result = 'failed') as load_failures,
        percentile_disc(0.5) within group (order by time_to_first_frame_ms)
            filter (where time_to_first_frame_ms is not null) as p50_ttf_ms,
        percentile_disc(0.95) within group (order by time_to_first_frame_ms)
            filter (where time_to_first_frame_ms is not null) as p95_ttf_ms
    from analytics.fact_resource_loads
    where started_at is not null
    group by 1
),
errors as (
    select
        date_trunc('hour', occurred_at) as metric_hour,
        count(*) as client_errors,
        count(distinct session_id) as error_sessions
    from analytics.events_raw
    where event_name in ('client_error', 'resource_load_failed', 'xr_failed', 'replay_failed')
    group by 1
)
select
    h.metric_hour,
    h.metric_hour::date as metric_date,
    extract(hour from h.metric_hour)::integer as hour_of_day,
    coalesce(p.page_views, 0) as page_views,
    coalesce(p.unique_users, 0) as unique_users,
    coalesce(s.sessions, 0) as sessions,
    coalesce(s.engaged_sessions, 0) as engaged_sessions,
    coalesce(s.bounces, 0) as bounces,
    round(s.avg_duration_seconds, 1) as avg_duration_seconds,
    coalesce(l.load_attempts, 0) as load_attempts,
    coalesce(l.first_frame_ready, 0) as first_frame_ready,
    coalesce(l.load_failures, 0) as load_failures,
    l.p50_ttf_ms,
    l.p95_ttf_ms,
    coalesce(e.client_errors, 0) as client_errors,
    coalesce(e.error_sessions, 0) as error_sessions,
    case when coalesce(l.load_attempts, 0) > 0
        then l.first_frame_ready::numeric / l.load_attempts
        else null
    end as first_frame_rate,
    case when coalesce(s.sessions, 0) > 0
        then s.engaged_sessions::numeric / s.sessions
        else null
    end as engaged_session_rate,
    case when coalesce(s.sessions, 0) > 0
        then s.bounces::numeric / s.sessions
        else null
    end as bounce_rate
from hour_keys h
left join page_views p using (metric_hour)
left join sessions s using (metric_hour)
left join loads l using (metric_hour)
left join errors e using (metric_hour)
where h.metric_hour is not null
with no data;

create unique index hourly_usage_metrics_pk
    on analytics.hourly_usage_metrics (metric_hour);

create index hourly_usage_metrics_date_idx
    on analytics.hourly_usage_metrics (metric_date, hour_of_day);

create materialized view analytics.daily_retention_cohorts as
with first_seen as (
    select
        anonymous_user_id_hash,
        min(page_viewed_at)::date as cohort_date
    from analytics.fact_page_views
    where anonymous_user_id_hash is not null
    group by anonymous_user_id_hash
),
active_days as (
    select distinct
        anonymous_user_id_hash,
        page_viewed_at::date as active_date
    from analytics.fact_page_views
    where anonymous_user_id_hash is not null
),
cohorts as (
    select
        cohort_date,
        count(*) as cohort_users
    from first_seen
    group by 1
),
cohort_days as (
    select
        c.cohort_date,
        c.cohort_users,
        day_number
    from cohorts c
    cross join generate_series(0, 7) as day_number
)
select
    cd.cohort_date,
    cd.day_number,
    cd.cohort_users,
    count(distinct fs.anonymous_user_id_hash) filter (
        where ad.active_date = cd.cohort_date + cd.day_number
    ) as retained_users,
    case when cd.cohort_users > 0
        then count(distinct fs.anonymous_user_id_hash) filter (
            where ad.active_date = cd.cohort_date + cd.day_number
        )::numeric / cd.cohort_users
        else null
    end as retention_rate
from cohort_days cd
left join first_seen fs
    on fs.cohort_date = cd.cohort_date
left join active_days ad
    on ad.anonymous_user_id_hash = fs.anonymous_user_id_hash
    and ad.active_date = cd.cohort_date + cd.day_number
group by cd.cohort_date, cd.day_number, cd.cohort_users
with no data;

create unique index daily_retention_cohorts_pk
    on analytics.daily_retention_cohorts (cohort_date, day_number);

create materialized view analytics.daily_acquisition_metrics as
with first_seen as (
    select
        anonymous_user_id_hash,
        min(page_viewed_at)::date as first_seen_date
    from analytics.fact_page_views
    where anonymous_user_id_hash is not null
    group by anonymous_user_id_hash
),
page_loads as (
    select
        page_view_id,
        bool_or(load_result = 'loaded') as first_frame_ready,
        bool_or(load_result = 'failed') as load_failed,
        min(time_to_first_frame_ms) filter (where time_to_first_frame_ms is not null) as time_to_first_frame_ms
    from analytics.fact_resource_loads
    where page_view_id is not null
    group by 1
),
base as (
    select
        pv.page_viewed_at::date as metric_date,
        pv.page_view_id,
        pv.session_id,
        pv.anonymous_user_id_hash,
        coalesce(nullif(pv.referrer_domain, ''), '(direct)') as referrer_domain,
        coalesce(nullif(pv.utm_source, ''), '(none)') as utm_source,
        coalesce(nullif(pv.utm_medium, ''), '(none)') as utm_medium,
        coalesce(nullif(pv.utm_campaign, ''), '(none)') as utm_campaign,
        case
            when nullif(pv.utm_source, '') is not null then 'utm'
            when nullif(pv.referrer_domain, '') is null then 'direct'
            when pv.referrer_domain in ('metaflow.shuang-su.com', 'dashboard.metaflow.shuang-su.com') then 'internal'
            else 'referral'
        end as channel_group,
        fs.first_seen_date,
        coalesce(s.engaged_session, false) as engaged_session,
        coalesce(pl.first_frame_ready, false) as first_frame_ready,
        coalesce(pl.load_failed, false) as load_failed
    from analytics.fact_page_views pv
    left join first_seen fs using (anonymous_user_id_hash)
    left join analytics.fact_sessions s
        on s.session_id = pv.session_id
        and s.anonymous_user_id_hash = pv.anonymous_user_id_hash
    left join page_loads pl
        on pl.page_view_id = pv.page_view_id
),
daily_totals as (
    select
        metric_date,
        count(distinct anonymous_user_id_hash) as daily_unique_users
    from base
    group by 1
)
select
    b.metric_date,
    b.channel_group,
    b.referrer_domain,
    b.utm_source,
    b.utm_medium,
    b.utm_campaign,
    count(*) as page_views,
    count(distinct b.anonymous_user_id_hash) as unique_users,
    count(distinct b.session_id) as sessions,
    count(distinct b.anonymous_user_id_hash) filter (where b.first_seen_date = b.metric_date) as new_users,
    count(distinct b.anonymous_user_id_hash) filter (where b.first_seen_date < b.metric_date) as returning_users,
    count(distinct b.session_id) filter (where b.engaged_session) as engaged_sessions,
    count(distinct b.page_view_id) filter (where b.first_frame_ready) as first_frame_ready,
    count(distinct b.page_view_id) filter (where b.load_failed) as load_failures,
    case when dt.daily_unique_users > 0
        then count(distinct b.anonymous_user_id_hash)::numeric / dt.daily_unique_users
        else null
    end as unique_user_share,
    case when count(distinct b.anonymous_user_id_hash) > 0
        then count(distinct b.anonymous_user_id_hash) filter (where b.first_seen_date < b.metric_date)::numeric
            / count(distinct b.anonymous_user_id_hash)
        else null
    end as returning_user_rate,
    case when count(distinct b.session_id) > 0
        then count(distinct b.session_id) filter (where b.engaged_session)::numeric / count(distinct b.session_id)
        else null
    end as engaged_session_rate,
    case when count(distinct b.page_view_id) > 0
        then count(distinct b.page_view_id) filter (where b.first_frame_ready)::numeric / count(distinct b.page_view_id)
        else null
    end as first_frame_rate
from base b
left join daily_totals dt using (metric_date)
group by
    b.metric_date,
    b.channel_group,
    b.referrer_domain,
    b.utm_source,
    b.utm_medium,
    b.utm_campaign,
    dt.daily_unique_users
with no data;

create index daily_acquisition_metrics_lookup_idx
    on analytics.daily_acquisition_metrics (metric_date, channel_group, referrer_domain, utm_source, utm_medium);

create materialized view analytics.daily_device_model_metrics as
with page_loads as (
    select
        page_view_id,
        bool_or(load_result = 'loaded') as first_frame_ready,
        bool_or(load_result = 'failed') as load_failed,
        min(time_to_first_frame_ms) filter (where time_to_first_frame_ms is not null) as time_to_first_frame_ms
    from analytics.fact_resource_loads
    where page_view_id is not null
    group by 1
),
device_pages as (
    select
        pv.page_viewed_at::date as metric_date,
        pv.page_view_id,
        pv.session_id,
        pv.anonymous_user_id_hash,
        coalesce(nullif(pv.browser, ''), 'Unknown') as browser,
        coalesce(nullif(pv.os, ''), 'Unknown') as os,
        coalesce(nullif(pv.device_class, ''), 'unknown') as device_class,
        coalesce(nullif(pv.renderer, ''), 'unknown') as renderer,
        pv.device_pixel_ratio,
        case
            when pv.viewport_width is null then 'unknown'
            when pv.viewport_width < 480 then '<480w'
            when pv.viewport_width < 768 then '480-767w'
            when pv.viewport_width < 1024 then '768-1023w'
            when pv.viewport_width < 1440 then '1024-1439w'
            else '1440w+'
        end as viewport_bucket,
        case
            when coalesce(pv.os, '') = 'Android' and nullif(pv.device_model, '') is not null
                then left(pv.device_model, 128)
            when coalesce(pv.os, '') = 'Android'
                then 'Android unknown'
            when coalesce(pv.os, '') = 'iOS' and coalesce(pv.device_class, '') = 'tablet'
                then 'iPad'
            when coalesce(pv.os, '') = 'iOS'
                then 'iPhone'
            when coalesce(pv.device_class, '') = 'desktop'
                then trim(both ' ' from concat_ws(' ', nullif(pv.os, ''), nullif(pv.browser, '')))
            when nullif(pv.device_model, '') is not null
                then left(pv.device_model, 128)
            else 'Unknown'
        end as device_model_display,
        coalesce(pl.first_frame_ready, false) as first_frame_ready,
        coalesce(pl.load_failed, false) as load_failed,
        pl.time_to_first_frame_ms
    from analytics.fact_page_views pv
    left join page_loads pl
        on pl.page_view_id = pv.page_view_id
)
select
    metric_date,
    browser,
    os,
    device_class,
    renderer,
    device_model_display,
    viewport_bucket,
    device_pixel_ratio,
    count(*) as page_views,
    count(distinct anonymous_user_id_hash) as unique_users,
    count(distinct session_id) as sessions,
    count(*) filter (where first_frame_ready) as first_frame_ready,
    count(*) filter (where load_failed) as load_failures,
    percentile_disc(0.5) within group (order by time_to_first_frame_ms)
        filter (where time_to_first_frame_ms is not null) as p50_ttf_ms,
    percentile_disc(0.95) within group (order by time_to_first_frame_ms)
        filter (where time_to_first_frame_ms is not null) as p95_ttf_ms,
    case when count(*) > 0
        then count(*) filter (where first_frame_ready)::numeric / count(*)
        else null
    end as first_frame_rate
from device_pages
group by 1, 2, 3, 4, 5, 6, 7, 8
with no data;

create index daily_device_model_metrics_lookup_idx
    on analytics.daily_device_model_metrics (metric_date, os, device_class, renderer, browser);

create index daily_device_model_metrics_model_idx
    on analytics.daily_device_model_metrics (device_model_display, metric_date);

grant select on
    analytics.hourly_usage_metrics,
    analytics.daily_retention_cohorts,
    analytics.daily_acquisition_metrics,
    analytics.daily_device_model_metrics
to analytics_reader;

create or replace function analytics.refresh_rollups()
returns void
language plpgsql
security definer
set search_path = analytics, public
as $$
begin
    refresh materialized view analytics.daily_route_metrics;
    refresh materialized view analytics.daily_resource_metrics;
    refresh materialized view analytics.daily_device_metrics;
    refresh materialized view analytics.daily_error_metrics;
    refresh materialized view analytics.daily_collaboration_metrics;
    refresh materialized view analytics.daily_performance_metrics;
    refresh materialized view analytics.daily_user_metrics;
    refresh materialized view analytics.daily_data_quality_metrics;
    refresh materialized view analytics.hourly_usage_metrics;
    refresh materialized view analytics.daily_retention_cohorts;
    refresh materialized view analytics.daily_acquisition_metrics;
    refresh materialized view analytics.daily_device_model_metrics;
end;
$$;
