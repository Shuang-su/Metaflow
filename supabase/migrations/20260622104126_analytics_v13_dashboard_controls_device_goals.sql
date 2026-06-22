-- Metaflow analytics v1.3 dashboard controls, trusted device models, and conversion goals.
-- Extends modeled analytics tables without changing the append-only raw event contract.

drop materialized view if exists analytics.daily_goal_conversion_metrics;
drop materialized view if exists analytics.daily_session_duration_metrics;
drop materialized view if exists analytics.daily_hourly_profile_metrics;
drop materialized view if exists analytics.daily_dashboard_freshness_metrics;
drop materialized view if exists analytics.daily_device_model_metrics;
drop materialized view if exists analytics.daily_acquisition_metrics;
drop materialized view if exists analytics.daily_retention_cohorts;
drop materialized view if exists analytics.daily_kpi_metrics;
drop view if exists analytics.metric_definitions;
drop view if exists analytics.dim_channel_group;

create table if not exists analytics.dim_device_model (
    raw_model_code text primary key,
    vendor text not null,
    marketing_name text,
    device_family text,
    os_family text,
    release_year integer,
    confidence text not null default 'identifier_only',
    updated_at timestamptz not null default now()
);

alter table analytics.dim_device_model enable row level security;

drop policy if exists "analytics_reader can read device models" on analytics.dim_device_model;
create policy "analytics_reader can read device models"
on analytics.dim_device_model for select
to analytics_reader
using (true);

insert into analytics.dim_device_model (
    raw_model_code,
    vendor,
    marketing_name,
    device_family,
    os_family,
    release_year,
    confidence
) values
    ('iPhone17,1', 'Apple', null, 'iPhone', 'iOS', 2024, 'identifier_only'),
    ('iPhone17,2', 'Apple', null, 'iPhone', 'iOS', 2024, 'identifier_only'),
    ('iPhone17,3', 'Apple', null, 'iPhone', 'iOS', 2024, 'identifier_only'),
    ('iPhone17,4', 'Apple', null, 'iPhone', 'iOS', 2024, 'identifier_only'),
    ('iPhone17,5', 'Apple', null, 'iPhone', 'iOS', 2025, 'identifier_only'),
    ('iPhone18,1', 'Apple', null, 'iPhone', 'iOS', 2025, 'identifier_only'),
    ('iPhone18,2', 'Apple', null, 'iPhone', 'iOS', 2025, 'identifier_only'),
    ('iPhone18,3', 'Apple', null, 'iPhone', 'iOS', 2025, 'identifier_only'),
    ('iPhone18,4', 'Apple', null, 'iPhone', 'iOS', 2025, 'identifier_only')
on conflict (raw_model_code) do update
set
    vendor = excluded.vendor,
    marketing_name = excluded.marketing_name,
    device_family = excluded.device_family,
    os_family = excluded.os_family,
    release_year = excluded.release_year,
    confidence = excluded.confidence,
    updated_at = now();

create or replace view analytics.fact_page_views
with (security_invoker = true)
as
select
    event_id as page_view_event_id,
    occurred_at as page_viewed_at,
    session_id,
    page_view_id,
    anonymous_user_id_hash,
    coalesce(resource_id, context->>'resource_id') as resource_id,
    route,
    app_version,
    release_display_version,
    git_ref,
    context->>'renderer' as renderer,
    context->>'input_mode' as input_mode,
    context->>'camera_mode' as camera_mode,
    coalesce(device->>'language', context#>>'{device,language}') as language,
    coalesce(device->>'timezone', context#>>'{device,timezone}') as timezone,
    nullif(coalesce(device#>>'{viewport,width}', context#>>'{device,viewport,width}'), '')::integer as viewport_width,
    nullif(coalesce(device#>>'{viewport,height}', context#>>'{device,viewport,height}'), '')::integer as viewport_height,
    nullif(coalesce(device#>>'{screen,width}', context#>>'{device,screen,width}'), '')::integer as screen_width,
    nullif(coalesce(device#>>'{screen,height}', context#>>'{device,screen,height}'), '')::integer as screen_height,
    nullif(coalesce(device->>'device_pixel_ratio', context#>>'{device,device_pixel_ratio}'), '')::numeric as device_pixel_ratio,
    nullif(coalesce(device->>'max_touch_points', context#>>'{device,max_touch_points}'), '')::integer as max_touch_points,
    nullif(coalesce(device->>'hardware_concurrency', context#>>'{device,hardware_concurrency}'), '')::integer as hardware_concurrency,
    nullif(coalesce(device->>'device_memory_gb', context#>>'{device,device_memory_gb}'), '')::numeric as device_memory_gb,
    coalesce(device#>>'{network,effective_type}', context#>>'{device,network,effective_type}') as network_effective_type,
    nullif(coalesce(device#>>'{network,downlink}', context#>>'{device,network,downlink}'), '')::numeric as network_downlink,
    nullif(coalesce(device#>>'{network,rtt}', context#>>'{device,network,rtt}'), '')::integer as network_rtt,
    nullif(coalesce(device#>>'{network,save_data}', context#>>'{device,network,save_data}'), '')::boolean as network_save_data,
    coalesce(device->>'browser', context#>>'{device,browser}') as browser,
    coalesce(device->>'browser_version', context#>>'{device,browser_version}') as browser_version,
    coalesce(device->>'os', context#>>'{device,os}') as os,
    coalesce(device->>'os_version', context#>>'{device,os_version}') as os_version,
    coalesce(device->>'device_class', context#>>'{device,device_class}') as device_class,
    coalesce(device->>'device_model', device->>'device_model_raw', context#>>'{device,device_model}') as device_model,
    nullif(coalesce(device->>'is_mobile', context#>>'{device,is_mobile}'), '')::boolean as is_mobile,
    nullif(coalesce(device->>'is_tablet', context#>>'{device,is_tablet}'), '')::boolean as is_tablet,
    context#>>'{acquisition,referrer}' as referrer,
    context#>>'{acquisition,referrer_domain}' as referrer_domain,
    context#>>'{acquisition,entry_path}' as entry_path,
    nullif(context#>>'{acquisition,entry_has_query}', '')::boolean as entry_has_query,
    context#>>'{acquisition,utm_source}' as utm_source,
    context#>>'{acquisition,utm_medium}' as utm_medium,
    context#>>'{acquisition,utm_campaign}' as utm_campaign,
    context#>>'{acquisition,utm_content}' as utm_content,
    context#>>'{acquisition,utm_term}' as utm_term,
    properties,
    coalesce(device->>'device_model_raw', device->>'device_model', context#>>'{device,device_model_raw}', context#>>'{device,device_model}') as device_model_raw,
    coalesce(device->>'device_brand_raw', context#>>'{device,device_brand_raw}') as device_brand_raw,
    coalesce(device->>'device_model_source', context#>>'{device,device_model_source}') as device_model_source,
    coalesce(device->>'device_model_confidence', context#>>'{device,device_model_confidence}') as device_model_confidence
from analytics.events_raw
where event_name = 'page_viewed';

create or replace view analytics.metric_definitions
with (security_invoker = true)
as
select *
from (
    values
        ('PV', 'Page views', 'Count of page_viewed events in the selected period.', 'page_viewed events', 'count'),
        ('UV', 'Unique visitors', 'Distinct anonymous_user_id_hash values with at least one page view.', 'anonymous users', 'count'),
        ('Sessions', 'Sessions', 'Modeled browser sessions started in the selected period.', 'fact_sessions', 'count'),
        ('New users', 'New users', 'Users whose first observed page view falls in the selected period.', 'fact_users.first_seen_at', 'count'),
        ('Returning users', 'Returning users', 'Users first seen before the selected period and active in it.', 'fact_users.first_seen_at', 'count'),
        ('Engaged rate %', 'Engaged session rate', 'Sessions with first frame, at least 10 seconds active time, or an interaction.', 'engaged_sessions / sessions', 'percent'),
        ('Avg duration s', 'Average session duration', 'Average modeled session duration in seconds.', 'fact_sessions.duration_seconds', 'seconds'),
        ('Bounce rate %', 'Bounce rate', 'Sessions with no first frame, no interaction, and less than 10 seconds active time.', 'bounces / sessions', 'percent'),
        ('First-frame rate %', 'First frame success rate', 'Resource load attempts that reached first_frame_ready.', 'loaded / load_attempts', 'percent'),
        ('P95 first-frame ms', 'P95 first frame', '95th percentile time from load start to first frame.', 'fact_resource_loads.time_to_first_frame_ms', 'milliseconds'),
        ('Error sessions', 'Error sessions', 'Distinct sessions affected by client/load/XR/replay errors.', 'daily_error_metrics.affected_sessions', 'count'),
        ('Data freshness', 'Data freshness', 'Latest raw analytics event received by the warehouse.', 'events_raw.received_at', 'timestamp')
) as definitions(metric, title, definition, calculation, unit);

create or replace view analytics.dim_channel_group
with (security_invoker = true)
as
select *
from (
    values
        ('direct', 'Direct', 'private_or_owned', 'No referrer or UTM source was observed.'),
        ('internal', 'Internal', 'private_or_owned', 'Traffic from Metaflow owned domains.'),
        ('referral', 'Referral', 'external', 'Traffic from an external referrer domain.'),
        ('utm', 'UTM campaign', 'campaign', 'Traffic with explicit UTM source metadata.')
) as channels(channel_group, label, traffic_domain, definition);

create materialized view analytics.daily_kpi_metrics as
with dates as (
    select metric_date from analytics.daily_user_metrics
    union
    select session_started_at::date from analytics.fact_sessions where session_started_at is not null
    union
    select started_at::date from analytics.fact_resource_loads where started_at is not null
    union
    select metric_date from analytics.daily_error_metrics
),
sessions as (
    select
        session_started_at::date as metric_date,
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
        started_at::date as metric_date,
        count(*) as load_attempts,
        count(*) filter (where load_result = 'loaded') as first_frame_ready,
        percentile_disc(0.95) within group (order by time_to_first_frame_ms)
            filter (where time_to_first_frame_ms is not null) as p95_ttf_ms
    from analytics.fact_resource_loads
    where started_at is not null
    group by 1
),
errors as (
    select
        metric_date,
        sum(error_count) as errors,
        sum(affected_sessions) as error_sessions
    from analytics.daily_error_metrics
    group by 1
)
select
    d.metric_date,
    coalesce(u.page_views, 0) as page_views,
    coalesce(u.active_users, 0) as active_users,
    coalesce(s.sessions, 0) as sessions,
    coalesce(u.new_users, 0) as new_users,
    coalesce(u.returning_users, 0) as returning_users,
    coalesce(s.engaged_sessions, 0) as engaged_sessions,
    coalesce(s.bounces, 0) as bounces,
    round(s.avg_duration_seconds, 1) as avg_duration_seconds,
    coalesce(l.load_attempts, 0) as load_attempts,
    coalesce(l.first_frame_ready, 0) as first_frame_ready,
    l.p95_ttf_ms,
    coalesce(e.errors, 0) as errors,
    coalesce(e.error_sessions, 0) as error_sessions,
    case when coalesce(s.sessions, 0) > 0 then s.engaged_sessions::numeric / s.sessions end as engaged_rate,
    case when coalesce(s.sessions, 0) > 0 then s.bounces::numeric / s.sessions end as bounce_rate,
    case when coalesce(l.load_attempts, 0) > 0 then l.first_frame_ready::numeric / l.load_attempts end as first_frame_rate
from dates d
left join analytics.daily_user_metrics u using (metric_date)
left join sessions s using (metric_date)
left join loads l using (metric_date)
left join errors e using (metric_date)
where d.metric_date is not null
with no data;

create unique index daily_kpi_metrics_pk
    on analytics.daily_kpi_metrics (metric_date);

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
    cross join generate_series(0, 30) as day_number
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

create materialized view analytics.daily_session_duration_metrics as
select
    session_started_at::date as metric_date,
    case
        when duration_seconds is null then 'unknown'
        when duration_seconds < 5 then '0-5s'
        when duration_seconds < 15 then '5-15s'
        when duration_seconds < 30 then '15-30s'
        when duration_seconds < 60 then '30-60s'
        when duration_seconds < 180 then '1-3m'
        when duration_seconds < 600 then '3-10m'
        else '10m+'
    end as duration_bucket,
    case
        when duration_seconds is null then 0
        when duration_seconds < 5 then 1
        when duration_seconds < 15 then 2
        when duration_seconds < 30 then 3
        when duration_seconds < 60 then 4
        when duration_seconds < 180 then 5
        when duration_seconds < 600 then 6
        else 7
    end as bucket_sort,
    count(*) as sessions,
    count(distinct anonymous_user_id_hash) as unique_users,
    count(*) filter (where engaged_session) as engaged_sessions,
    count(*) filter (where bounce) as bounces,
    round(avg(duration_seconds)::numeric, 1) as avg_duration_seconds
from analytics.fact_sessions
where session_started_at is not null
group by 1, 2, 3
with no data;

create unique index daily_session_duration_metrics_pk
    on analytics.daily_session_duration_metrics (metric_date, duration_bucket);

create materialized view analytics.daily_hourly_profile_metrics as
select
    metric_date,
    hour_of_day,
    sum(page_views) as page_views,
    sum(unique_users) as unique_users,
    sum(sessions) as sessions,
    sum(engaged_sessions) as engaged_sessions,
    sum(load_failures) as load_failures,
    sum(client_errors) as client_errors,
    avg(p95_ttf_ms)::numeric as avg_p95_ttf_ms
from analytics.hourly_usage_metrics
group by 1, 2
with no data;

create unique index daily_hourly_profile_metrics_pk
    on analytics.daily_hourly_profile_metrics (metric_date, hour_of_day);

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
        bool_or(load_result = 'failed') as load_failed
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
    coalesce(c.traffic_domain, 'unknown') as traffic_domain,
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
left join analytics.dim_channel_group c using (channel_group)
group by
    b.metric_date,
    b.channel_group,
    c.traffic_domain,
    b.referrer_domain,
    b.utm_source,
    b.utm_medium,
    b.utm_campaign,
    dt.daily_unique_users
with no data;

create index daily_acquisition_metrics_lookup_idx
    on analytics.daily_acquisition_metrics (metric_date, channel_group, traffic_domain, referrer_domain, utm_source, utm_medium);

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
page_errors as (
    select
        page_view_id,
        count(*) as error_count
    from analytics.events_raw
    where page_view_id is not null
        and event_name in ('client_error', 'resource_load_failed', 'xr_failed', 'replay_failed')
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
        nullif(pv.device_model_raw, '') as device_model_raw,
        nullif(pv.device_brand_raw, '') as device_brand_raw,
        nullif(pv.device_model_source, '') as device_model_source,
        nullif(pv.device_model_confidence, '') as device_model_confidence,
        coalesce(pl.first_frame_ready, false) as first_frame_ready,
        coalesce(pl.load_failed, false) as load_failed,
        coalesce(pe.error_count, 0) as client_errors,
        pl.time_to_first_frame_ms
    from analytics.fact_page_views pv
    left join page_loads pl
        on pl.page_view_id = pv.page_view_id
    left join page_errors pe
        on pe.page_view_id = pv.page_view_id
),
displayed as (
    select
        dp.*,
        dm.marketing_name,
        case
            when dp.device_model_raw is not null then dp.device_model_raw
            when dp.os = 'Android' then 'Android unknown'
            when dp.os = 'iOS' and dp.device_class = 'tablet' then 'iPad'
            when dp.os = 'iOS' then 'iPhone'
            when dp.device_class = 'desktop' then trim(both ' ' from concat_ws(' ', nullif(dp.os, ''), nullif(dp.browser, '')))
            else 'Unknown'
        end as device_model_display,
        (dp.device_model_raw is not null and dp.device_model_source in (
            'ua_ch',
            'alipay_mini_program',
            'wechat_mini_program',
            'native_webview',
            'manual_test'
        )) as exact_model_available
    from device_pages dp
    left join analytics.dim_device_model dm
        on dm.raw_model_code = dp.device_model_raw
)
select
    metric_date,
    browser,
    os,
    device_class,
    renderer,
    device_model_display,
    device_model_raw,
    device_brand_raw,
    device_model_source,
    device_model_confidence,
    marketing_name,
    exact_model_available,
    viewport_bucket,
    device_pixel_ratio,
    count(*) as page_views,
    count(distinct anonymous_user_id_hash) as unique_users,
    count(distinct session_id) as sessions,
    count(*) filter (where first_frame_ready) as first_frame_ready,
    count(*) filter (where load_failed) as load_failures,
    sum(client_errors) as errors,
    percentile_disc(0.5) within group (order by time_to_first_frame_ms)
        filter (where time_to_first_frame_ms is not null) as p50_ttf_ms,
    percentile_disc(0.95) within group (order by time_to_first_frame_ms)
        filter (where time_to_first_frame_ms is not null) as p95_ttf_ms,
    case when count(*) > 0
        then count(*) filter (where first_frame_ready)::numeric / count(*)
        else null
    end as first_frame_rate,
    case when count(*) > 0
        then count(*) filter (where load_failed)::numeric / count(*)
        else null
    end as load_failure_rate
from displayed
group by 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14
with no data;

create index daily_device_model_metrics_lookup_idx
    on analytics.daily_device_model_metrics (metric_date, os, device_class, renderer, browser);

create index daily_device_model_metrics_model_idx
    on analytics.daily_device_model_metrics (device_model_display, metric_date);

create index daily_device_model_metrics_exact_idx
    on analytics.daily_device_model_metrics (metric_date, exact_model_available, device_model_source);

create materialized view analytics.daily_goal_conversion_metrics as
with page_context as (
    select
        page_view_id,
        session_id,
        anonymous_user_id_hash,
        page_viewed_at,
        page_viewed_at::date as metric_date,
        route,
        case
            when nullif(utm_source, '') is not null then 'utm'
            when nullif(referrer_domain, '') is null then 'direct'
            when referrer_domain in ('metaflow.shuang-su.com', 'dashboard.metaflow.shuang-su.com') then 'internal'
            else 'referral'
        end as channel_group
    from analytics.fact_page_views
),
session_entry_context as (
    select distinct on (session_id, anonymous_user_id_hash)
        session_id,
        anonymous_user_id_hash,
        metric_date,
        route,
        channel_group,
        page_view_id
    from page_context
    where session_id is not null
    order by session_id, anonymous_user_id_hash, page_viewed_at, page_view_id
),
goal_events as (
    select
        pc.metric_date,
        'first_frame_ready' as goal_name,
        pc.channel_group,
        pc.route,
        pc.session_id,
        pc.anonymous_user_id_hash,
        pc.page_view_id
    from analytics.fact_resource_loads l
    join page_context pc using (page_view_id)
    where l.load_result = 'loaded'
    union all
    select
        s.session_started_at::date as metric_date,
        'engaged_session' as goal_name,
        coalesce(pc.channel_group, 'direct') as channel_group,
        coalesce(pc.route, s.entry_route) as route,
        s.session_id,
        s.anonymous_user_id_hash,
        pc.page_view_id
    from analytics.fact_sessions s
    left join session_entry_context pc
        on pc.session_id = s.session_id
        and pc.anonymous_user_id_hash = s.anonymous_user_id_hash
    where s.engaged_session and s.session_started_at is not null
    union all
    select
        e.occurred_at::date as metric_date,
        e.event_name as goal_name,
        coalesce(pc.channel_group, 'direct') as channel_group,
        coalesce(pc.route, e.route) as route,
        e.session_id,
        e.anonymous_user_id_hash,
        e.page_view_id
    from analytics.events_raw e
    left join page_context pc
        on pc.page_view_id = e.page_view_id
    where e.event_name in ('annotation_opened', 'fullscreen_changed', 'xr_started', 'navigation_completed')
),
denominators as (
    select
        metric_date,
        channel_group,
        route,
        count(distinct session_id) as total_sessions,
        count(distinct anonymous_user_id_hash) as total_users,
        count(*) as page_views
    from page_context
    group by 1, 2, 3
)
select
    g.metric_date,
    g.goal_name,
    g.channel_group,
    coalesce(c.traffic_domain, 'unknown') as traffic_domain,
    coalesce(g.route, '(unknown)') as route,
    count(*) as goal_events,
    count(distinct g.session_id) as goal_sessions,
    count(distinct g.anonymous_user_id_hash) as goal_users,
    coalesce(d.total_sessions, 0) as total_sessions,
    coalesce(d.total_users, 0) as total_users,
    coalesce(d.page_views, 0) as page_views,
    case when coalesce(d.total_sessions, 0) > 0
        then count(distinct g.session_id)::numeric / d.total_sessions
        else null
    end as session_conversion_rate,
    case when coalesce(d.total_users, 0) > 0
        then count(distinct g.anonymous_user_id_hash)::numeric / d.total_users
        else null
    end as user_conversion_rate
from goal_events g
left join denominators d
    on d.metric_date = g.metric_date
    and d.channel_group = g.channel_group
    and d.route = g.route
left join analytics.dim_channel_group c
    on c.channel_group = g.channel_group
where g.metric_date is not null
group by
    g.metric_date,
    g.goal_name,
    g.channel_group,
    c.traffic_domain,
    g.route,
    d.total_sessions,
    d.total_users,
    d.page_views
with no data;

create index daily_goal_conversion_metrics_lookup_idx
    on analytics.daily_goal_conversion_metrics (metric_date, goal_name, channel_group, route);

create materialized view analytics.daily_dashboard_freshness_metrics as
select
    current_date as metric_date,
    max(received_at) as latest_event_received_at,
    max(occurred_at) as latest_event_occurred_at,
    max(received_at) filter (where event_name = 'page_viewed') as latest_page_view_received_at,
    count(*) filter (where received_at >= now() - interval '24 hours') as raw_events_24h,
    count(*) filter (where event_name = 'page_viewed' and received_at >= now() - interval '24 hours') as page_views_24h
from analytics.events_raw
with no data;

create unique index daily_dashboard_freshness_metrics_pk
    on analytics.daily_dashboard_freshness_metrics (metric_date);

grant select on
    analytics.dim_device_model,
    analytics.metric_definitions,
    analytics.dim_channel_group,
    analytics.fact_page_views,
    analytics.daily_kpi_metrics,
    analytics.daily_retention_cohorts,
    analytics.daily_session_duration_metrics,
    analytics.daily_hourly_profile_metrics,
    analytics.daily_acquisition_metrics,
    analytics.daily_device_model_metrics,
    analytics.daily_goal_conversion_metrics,
    analytics.daily_dashboard_freshness_metrics
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
    refresh materialized view analytics.daily_kpi_metrics;
    refresh materialized view analytics.daily_retention_cohorts;
    refresh materialized view analytics.daily_session_duration_metrics;
    refresh materialized view analytics.daily_hourly_profile_metrics;
    refresh materialized view analytics.daily_acquisition_metrics;
    refresh materialized view analytics.daily_device_model_metrics;
    refresh materialized view analytics.daily_goal_conversion_metrics;
    refresh materialized view analytics.daily_dashboard_freshness_metrics;
end;
$$;
