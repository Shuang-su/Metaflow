-- Metaflow analytics v1.
-- Apply with `supabase db push` or through the Supabase SQL editor.

create schema if not exists analytics;

create table if not exists analytics.events_raw (
    event_id text not null,
    event_name text not null,
    event_version integer not null,
    schema_version text not null,
    source_app text not null,
    anonymous_user_id_hash text,
    session_id text not null,
    page_view_id text,
    replay_id text,
    route text,
    resource_id text,
    occurred_at timestamptz not null,
    received_at timestamptz not null default now(),
    app_version text,
    release_display_version text,
    git_ref text,
    context jsonb not null default '{}'::jsonb,
    device jsonb not null default '{}'::jsonb,
    properties jsonb not null default '{}'::jsonb,
    sampling_rate numeric,
    primary key (event_id, occurred_at)
) partition by range (occurred_at);

create table if not exists analytics.events_raw_default
    partition of analytics.events_raw default;

create table if not exists analytics.events_rejected (
    rejected_id bigserial primary key,
    received_at timestamptz not null default now(),
    source_app text,
    session_id text,
    reason text not null,
    payload jsonb not null default '{}'::jsonb
);

create table if not exists analytics.replay_chunks (
    replay_id text not null,
    chunk_id text not null,
    session_id text not null,
    page_view_id text,
    anonymous_user_id_hash text,
    storage_bucket text not null default 'analytics-replays',
    storage_path text not null,
    event_count integer not null,
    occurred_at timestamptz not null,
    received_at timestamptz not null default now(),
    primary key (replay_id, chunk_id)
);

create table if not exists analytics.dim_resource (
    resource_id text primary key,
    route text not null,
    title text,
    category text[] not null default '{}',
    experience_type text,
    model_file text,
    settings_file text,
    thumbnail_file text,
    model_size_bytes bigint,
    total_size_bytes bigint,
    default_camera_mode text,
    has_voxel boolean not null default false,
    has_environment boolean not null default false,
    added_in text,
    updated_in text,
    indexed_at timestamptz not null default now()
);

alter table analytics.events_raw enable row level security;
alter table analytics.events_rejected enable row level security;
alter table analytics.replay_chunks enable row level security;
alter table analytics.dim_resource enable row level security;

revoke all on schema analytics from anon, authenticated;
revoke all on all tables in schema analytics from anon, authenticated;

do $$
begin
    if not exists (select 1 from pg_roles where rolname = 'analytics_reader') then
        create role analytics_reader nologin;
    end if;
end;
$$;
grant usage on schema analytics to analytics_reader;
grant select on
    analytics.events_raw,
    analytics.events_rejected,
    analytics.replay_chunks,
    analytics.dim_resource
to analytics_reader;

create policy "analytics_reader can read raw events"
on analytics.events_raw for select
to analytics_reader
using (true);

create policy "analytics_reader can read rejected events"
on analytics.events_rejected for select
to analytics_reader
using (true);

create policy "analytics_reader can read replay chunks"
on analytics.replay_chunks for select
to analytics_reader
using (true);

create policy "analytics_reader can read resources"
on analytics.dim_resource for select
to analytics_reader
using (true);

create index if not exists events_raw_session_idx on analytics.events_raw (session_id, occurred_at desc);
create index if not exists events_raw_page_view_idx on analytics.events_raw (page_view_id, occurred_at desc);
create index if not exists events_raw_name_time_idx on analytics.events_raw (event_name, occurred_at desc);
create index if not exists events_raw_route_time_idx on analytics.events_raw (route, occurred_at desc);
create index if not exists events_raw_resource_time_idx on analytics.events_raw (resource_id, occurred_at desc);
create index if not exists events_raw_properties_gin_idx on analytics.events_raw using gin (properties);
create index if not exists events_rejected_received_idx on analytics.events_rejected (received_at desc);
create index if not exists replay_chunks_session_idx on analytics.replay_chunks (session_id, received_at desc);

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
    context#>>'{device,language}' as language,
    (context#>>'{device,viewport,width}')::integer as viewport_width,
    (context#>>'{device,viewport,height}')::integer as viewport_height,
    (context#>>'{device,device_pixel_ratio}')::numeric as device_pixel_ratio,
    properties
from analytics.events_raw
where event_name = 'page_viewed';

create or replace view analytics.fact_sessions
with (security_invoker = true)
as
with session_events as (
    select
        session_id,
        anonymous_user_id_hash,
        min(occurred_at) filter (where event_name = 'session_started') as session_started_at,
        max(occurred_at) filter (where event_name in ('session_heartbeat', 'page_hidden', 'session_ended')) as last_seen_at,
        min(route) filter (where event_name = 'page_viewed') as entry_route,
        max(route) filter (where event_name = 'page_viewed') as exit_route,
        bool_or(event_name = 'first_frame_ready') as first_frame_ready,
        bool_or(event_name in ('ui_clicked', 'settings_changed', 'camera_mode_changed', 'navigation_requested', 'annotation_opened')) as had_interaction,
        max((properties->>'active_ms')::bigint) filter (where properties ? 'active_ms') as active_ms,
        max((properties->>'engaged_ms')::bigint) filter (where properties ? 'engaged_ms') as engaged_ms,
        max((properties->>'session_duration_ms')::bigint) filter (where event_name = 'session_summary') as session_duration_ms,
        count(*) as event_count,
        count(*) filter (where event_name = 'session_heartbeat') as heartbeat_count,
        bool_or(event_name = 'session_summary') as has_session_summary,
        count(distinct page_view_id) filter (where page_view_id is not null) as page_view_count
    from analytics.events_raw
    group by session_id, anonymous_user_id_hash
)
select
    *,
    coalesce(
        (session_duration_ms / 1000)::integer,
        extract(epoch from (coalesce(last_seen_at, session_started_at) - session_started_at))::integer
    ) as duration_seconds,
    (first_frame_ready or coalesce(active_ms, 0) >= 10000 or had_interaction) as engaged_session,
    (not first_frame_ready and not had_interaction and coalesce(active_ms, 0) < 10000) as bounce
from session_events;

create or replace view analytics.fact_resource_loads
with (security_invoker = true)
as
with loads as (
    select
        session_id,
        page_view_id,
        anonymous_user_id_hash,
        coalesce(resource_id, context->>'resource_id') as resource_id,
        route,
        min(occurred_at) filter (where event_name = 'resource_load_started') as started_at,
        min(occurred_at) filter (where event_name = 'first_frame_ready') as first_frame_at,
        min(occurred_at) filter (where event_name = 'resource_load_failed') as failed_at,
        max(properties->>'loading_stage') filter (where event_name in ('resource_load_failed', 'session_heartbeat', 'page_hidden')) as last_loading_stage,
        max(properties->>'error_name') filter (where event_name = 'resource_load_failed') as error_name,
        max(properties->>'error_message') filter (where event_name = 'resource_load_failed') as error_message
    from analytics.events_raw
    where event_name in (
        'resource_load_started',
        'first_frame_ready',
        'resource_load_failed',
        'session_heartbeat',
        'page_hidden'
    )
    group by session_id, page_view_id, anonymous_user_id_hash, coalesce(resource_id, context->>'resource_id'), route
)
select
    *,
    case
        when first_frame_at is not null then 'loaded'
        when failed_at is not null then 'failed'
        else 'abandoned'
    end as load_result,
    extract(epoch from (first_frame_at - started_at)) * 1000 as time_to_first_frame_ms,
    (started_at is not null and first_frame_at is null and failed_at is null) as loading_abandonment
from loads
where started_at is not null;

create or replace view analytics.fact_interactions
with (security_invoker = true)
as
select
    event_id,
    occurred_at,
    event_name,
    session_id,
    page_view_id,
    anonymous_user_id_hash,
    coalesce(resource_id, context->>'resource_id') as resource_id,
    route,
    properties->>'element_id' as element_id,
    properties->>'action' as action,
    properties->>'setting' as setting,
    properties->>'camera_mode' as camera_mode,
    properties
from analytics.events_raw
where event_name in (
    'ui_clicked',
    'settings_changed',
    'camera_mode_changed',
    'navigation_requested',
    'navigation_completed',
    'navigation_cancelled',
    'annotation_opened',
    'fullscreen_changed',
    'xr_requested',
    'xr_started',
    'xr_failed'
);

create or replace view analytics.fact_collaboration
with (security_invoker = true)
as
select
    event_id,
    occurred_at,
    event_name,
    session_id,
    page_view_id,
    anonymous_user_id_hash,
    coalesce(resource_id, context->>'resource_id') as resource_id,
    route,
    properties->>'room_id' as room_id,
    properties->>'participant_role' as participant_role,
    nullif(properties->>'participant_count', '')::integer as participant_count,
    nullif(properties->>'participant_peak_count', '')::integer as participant_peak_count,
    nullif(properties->>'duration_ms', '')::bigint as duration_ms,
    properties
from analytics.events_raw
where event_name in (
    'collab_room_created',
    'collab_room_joined',
    'collab_room_left',
    'collab_presence_changed',
    'shared_camera_started',
    'shared_camera_stopped',
    'collab_session_summary'
);

create materialized view if not exists analytics.daily_route_metrics as
select
    date_trunc('day', page_viewed_at)::date as metric_date,
    route,
    count(*) as page_views,
    count(distinct anonymous_user_id_hash) as unique_users,
    count(distinct session_id) as sessions
from analytics.fact_page_views
group by 1, 2
with no data;

create unique index if not exists daily_route_metrics_pk
    on analytics.daily_route_metrics (metric_date, route);

create materialized view if not exists analytics.daily_resource_metrics as
select
    date_trunc('day', started_at)::date as metric_date,
    resource_id,
    route,
    count(*) as load_attempts,
    count(*) filter (where load_result = 'loaded') as loaded_count,
    count(*) filter (where load_result = 'failed') as failed_count,
    count(*) filter (where loading_abandonment) as abandoned_count,
    percentile_disc(0.5) within group (order by time_to_first_frame_ms) filter (where time_to_first_frame_ms is not null) as p50_ttf_ms,
    percentile_disc(0.95) within group (order by time_to_first_frame_ms) filter (where time_to_first_frame_ms is not null) as p95_ttf_ms
from analytics.fact_resource_loads
group by 1, 2, 3
with no data;

create unique index if not exists daily_resource_metrics_pk
    on analytics.daily_resource_metrics (metric_date, resource_id, route);

create materialized view if not exists analytics.daily_device_metrics as
select
    date_trunc('day', page_viewed_at)::date as metric_date,
    renderer,
    language,
    device_pixel_ratio,
    count(*) as page_views,
    count(distinct anonymous_user_id_hash) as unique_users,
    count(distinct session_id) as sessions
from analytics.fact_page_views
group by 1, 2, 3, 4
with no data;

create unique index if not exists daily_device_metrics_pk
    on analytics.daily_device_metrics (metric_date, renderer, language, device_pixel_ratio);

create materialized view if not exists analytics.daily_error_metrics as
select
    date_trunc('day', occurred_at)::date as metric_date,
    route,
    properties->>'error_name' as error_name,
    count(*) as error_count,
    count(distinct session_id) as affected_sessions
from analytics.events_raw
where event_name in ('client_error', 'resource_load_failed', 'replay_failed', 'xr_failed')
group by 1, 2, 3
with no data;

create unique index if not exists daily_error_metrics_pk
    on analytics.daily_error_metrics (metric_date, route, error_name);

create materialized view if not exists analytics.daily_collaboration_metrics as
select
    date_trunc('day', occurred_at)::date as metric_date,
    route,
    resource_id,
    count(*) filter (where event_name = 'collab_room_created') as rooms_created,
    count(*) filter (where event_name = 'collab_room_joined') as joins,
    count(*) filter (where event_name = 'collab_room_left') as leaves,
    count(distinct room_id) filter (where room_id is not null) as active_rooms,
    max(participant_peak_count) as max_participants_per_room,
    percentile_disc(0.5) within group (order by duration_ms) filter (where duration_ms is not null) as p50_room_duration_ms
from analytics.fact_collaboration
group by 1, 2, 3
with no data;

create unique index if not exists daily_collaboration_metrics_pk
    on analytics.daily_collaboration_metrics (
        metric_date,
        coalesce(route, ''),
        coalesce(resource_id, '')
    );

grant select on
    analytics.fact_page_views,
    analytics.fact_sessions,
    analytics.fact_resource_loads,
    analytics.fact_interactions,
    analytics.fact_collaboration,
    analytics.daily_route_metrics,
    analytics.daily_resource_metrics,
    analytics.daily_device_metrics,
    analytics.daily_error_metrics,
    analytics.daily_collaboration_metrics
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
end;
$$;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('analytics-replays', 'analytics-replays', false, 10485760, array['application/json'])
on conflict (id) do update set
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;
