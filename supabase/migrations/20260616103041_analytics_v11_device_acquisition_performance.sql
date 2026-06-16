-- Metaflow analytics v1.1.
-- Adds device/acquisition/performance modeling without changing the raw event contract.

drop materialized view if exists analytics.daily_route_metrics;
drop materialized view if exists analytics.daily_device_metrics;
drop materialized view if exists analytics.daily_performance_metrics;
drop materialized view if exists analytics.daily_user_metrics;
drop materialized view if exists analytics.daily_data_quality_metrics;
drop view if exists analytics.fact_page_views;

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
    coalesce(device->>'device_model', context#>>'{device,device_model}') as device_model,
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
    properties
from analytics.events_raw
where event_name = 'page_viewed';

create or replace view analytics.fact_web_vitals
with (security_invoker = true)
as
select
    event_id,
    occurred_at,
    session_id,
    page_view_id,
    anonymous_user_id_hash,
    coalesce(resource_id, context->>'resource_id') as resource_id,
    route,
    properties->>'source' as source,
    nullif(properties->>'ttfb_ms', '')::numeric as ttfb_ms,
    nullif(properties->>'lcp_ms', '')::numeric as lcp_ms,
    nullif(properties->>'cls', '')::numeric as cls,
    nullif(properties->>'inp_ms', '')::numeric as inp_ms,
    nullif(properties->>'fid_ms', '')::numeric as fid_ms,
    nullif(properties->>'dom_content_loaded_ms', '')::numeric as dom_content_loaded_ms,
    nullif(properties->>'load_event_ms', '')::numeric as load_event_ms,
    properties
from analytics.events_raw
where event_name = 'web_vitals_observed';

create or replace view analytics.fact_resource_timings
with (security_invoker = true)
as
select
    e.event_id,
    e.occurred_at,
    e.session_id,
    e.page_view_id,
    e.anonymous_user_id_hash,
    coalesce(e.resource_id, e.context->>'resource_id') as resource_id,
    e.route,
    e.properties->>'source' as source,
    entry->>'resource_role' as resource_role,
    entry->>'path' as path,
    entry->>'initiator_type' as initiator_type,
    nullif(entry->>'start_time_ms', '')::numeric as start_time_ms,
    nullif(entry->>'duration_ms', '')::numeric as duration_ms,
    nullif(entry->>'transfer_size_bytes', '')::bigint as transfer_size_bytes,
    nullif(entry->>'encoded_body_size_bytes', '')::bigint as encoded_body_size_bytes,
    nullif(entry->>'decoded_body_size_bytes', '')::bigint as decoded_body_size_bytes,
    entry->>'cache_result' as cache_result
from analytics.events_raw e
cross join lateral jsonb_array_elements(
    case
        when jsonb_typeof(e.properties->'entries') = 'array' then e.properties->'entries'
        else '[]'::jsonb
    end
) as entry
where e.event_name = 'resource_timing_collected';

create or replace view analytics.fact_resource_stage_timings
with (security_invoker = true)
as
select
    event_id,
    occurred_at,
    session_id,
    page_view_id,
    anonymous_user_id_hash,
    coalesce(resource_id, context->>'resource_id') as resource_id,
    route,
    properties->>'previous_stage' as previous_stage,
    properties->>'stage' as stage,
    nullif(properties->>'stage_elapsed_ms', '')::numeric as stage_elapsed_ms,
    nullif(properties->>'page_elapsed_ms', '')::numeric as page_elapsed_ms,
    properties->>'loading_mode' as loading_mode,
    nullif(properties->>'progress', '')::numeric as progress
from analytics.events_raw
where event_name = 'loading_stage_changed';

create or replace view analytics.fact_users
with (security_invoker = true)
as
select
    anonymous_user_id_hash,
    min(occurred_at) as first_seen_at,
    max(occurred_at) as last_seen_at,
    count(distinct session_id) as sessions,
    count(*) filter (where event_name = 'page_viewed') as page_views,
    bool_or(event_name = 'first_frame_ready') as ever_loaded
from analytics.events_raw
where anonymous_user_id_hash is not null
group by anonymous_user_id_hash;

create materialized view analytics.daily_device_metrics as
select
    date_trunc('day', page_viewed_at)::date as metric_date,
    coalesce(browser, 'Unknown') as browser,
    coalesce(os, 'Unknown') as os,
    coalesce(device_class, 'unknown') as device_class,
    coalesce(renderer, 'unknown') as renderer,
    coalesce(language, 'unknown') as language,
    device_pixel_ratio,
    count(*) as page_views,
    count(distinct anonymous_user_id_hash) as unique_users,
    count(distinct session_id) as sessions
from analytics.fact_page_views
group by 1, 2, 3, 4, 5, 6, 7
with no data;

create index daily_device_metrics_lookup_idx
    on analytics.daily_device_metrics (metric_date, browser, os, device_class, renderer);

create materialized view analytics.daily_route_metrics as
select
    date_trunc('day', page_viewed_at)::date as metric_date,
    route,
    count(*) as page_views,
    count(distinct anonymous_user_id_hash) as unique_users,
    count(distinct session_id) as sessions
from analytics.fact_page_views
group by 1, 2
with no data;

create unique index daily_route_metrics_pk
    on analytics.daily_route_metrics (metric_date, route);

create materialized view analytics.daily_performance_metrics as
select
    date_trunc('day', coalesce(l.started_at, v.occurred_at))::date as metric_date,
    coalesce(l.route, v.route) as route,
    coalesce(l.resource_id, v.resource_id) as resource_id,
    count(distinct l.page_view_id) filter (where l.page_view_id is not null) as load_attempts,
    percentile_disc(0.5) within group (order by l.time_to_first_frame_ms) filter (where l.time_to_first_frame_ms is not null) as p50_ttf_ms,
    percentile_disc(0.95) within group (order by l.time_to_first_frame_ms) filter (where l.time_to_first_frame_ms is not null) as p95_ttf_ms,
    percentile_disc(0.5) within group (order by v.lcp_ms) filter (where v.lcp_ms is not null) as p50_lcp_ms,
    percentile_disc(0.95) within group (order by v.lcp_ms) filter (where v.lcp_ms is not null) as p95_lcp_ms,
    percentile_disc(0.5) within group (order by v.inp_ms) filter (where v.inp_ms is not null) as p50_inp_ms,
    percentile_disc(0.95) within group (order by v.inp_ms) filter (where v.inp_ms is not null) as p95_inp_ms,
    percentile_disc(0.5) within group (order by v.cls) filter (where v.cls is not null) as p50_cls,
    percentile_disc(0.95) within group (order by v.cls) filter (where v.cls is not null) as p95_cls
from analytics.fact_resource_loads l
full outer join analytics.fact_web_vitals v
    on l.page_view_id = v.page_view_id
group by 1, 2, 3
with no data;

create index daily_performance_metrics_lookup_idx
    on analytics.daily_performance_metrics (metric_date, route, resource_id);

create materialized view analytics.daily_user_metrics as
with first_seen as (
    select
        anonymous_user_id_hash,
        min(page_viewed_at)::date as first_seen_date
    from analytics.fact_page_views
    where anonymous_user_id_hash is not null
    group by anonymous_user_id_hash
)
select
    date_trunc('day', pv.page_viewed_at)::date as metric_date,
    count(distinct pv.anonymous_user_id_hash) as active_users,
    count(distinct pv.anonymous_user_id_hash) filter (where fs.first_seen_date = pv.page_viewed_at::date) as new_users,
    count(distinct pv.anonymous_user_id_hash) filter (where fs.first_seen_date < pv.page_viewed_at::date) as returning_users,
    count(distinct pv.session_id) as sessions,
    count(*) as page_views
from analytics.fact_page_views pv
left join first_seen fs using (anonymous_user_id_hash)
group by 1
with no data;

create unique index daily_user_metrics_pk
    on analytics.daily_user_metrics (metric_date);

create materialized view analytics.daily_data_quality_metrics as
with event_counts as (
    select
        date_trunc('day', received_at)::date as metric_date,
        count(*) as raw_events,
        count(distinct session_id) as sessions,
        count(*) filter (where event_name = 'page_viewed') as page_view_events,
        count(*) filter (where event_name = 'session_heartbeat') as heartbeat_events,
        count(*) filter (where event_name = 'first_frame_ready') as first_frame_events
    from analytics.events_raw
    group by 1
),
rejected_counts as (
    select
        date_trunc('day', received_at)::date as metric_date,
        count(*) as rejected_events
    from analytics.events_rejected
    group by 1
),
session_counts as (
    select
        date_trunc('day', session_started_at)::date as metric_date,
        count(*) as modeled_sessions,
        count(*) filter (where heartbeat_count > 0) as sessions_with_heartbeat
    from analytics.fact_sessions
    where session_started_at is not null
    group by 1
)
select
    coalesce(e.metric_date, r.metric_date, s.metric_date) as metric_date,
    coalesce(e.raw_events, 0) as raw_events,
    coalesce(r.rejected_events, 0) as rejected_events,
    coalesce(e.page_view_events, 0) as page_view_events,
    coalesce(e.heartbeat_events, 0) as heartbeat_events,
    coalesce(e.first_frame_events, 0) as first_frame_events,
    coalesce(s.modeled_sessions, 0) as modeled_sessions,
    coalesce(s.sessions_with_heartbeat, 0) as sessions_with_heartbeat,
    case when coalesce(s.modeled_sessions, 0) > 0
        then coalesce(s.sessions_with_heartbeat, 0)::numeric / s.modeled_sessions
        else null
    end as heartbeat_coverage_rate,
    case when coalesce(e.page_view_events, 0) > 0
        then coalesce(e.first_frame_events, 0)::numeric / e.page_view_events
        else null
    end as first_frame_rate,
    case when coalesce(e.raw_events, 0) + coalesce(r.rejected_events, 0) > 0
        then coalesce(r.rejected_events, 0)::numeric / (coalesce(e.raw_events, 0) + coalesce(r.rejected_events, 0))
        else null
    end as rejected_rate
from event_counts e
full outer join rejected_counts r using (metric_date)
full outer join session_counts s using (metric_date)
with no data;

create unique index daily_data_quality_metrics_pk
    on analytics.daily_data_quality_metrics (metric_date);

grant select on
    analytics.fact_page_views,
    analytics.fact_web_vitals,
    analytics.fact_resource_timings,
    analytics.fact_resource_stage_timings,
    analytics.fact_users,
    analytics.daily_device_metrics,
    analytics.daily_performance_metrics,
    analytics.daily_user_metrics,
    analytics.daily_data_quality_metrics
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
end;
$$;
