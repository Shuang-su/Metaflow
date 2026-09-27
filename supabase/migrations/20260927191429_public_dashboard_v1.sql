-- MF-89. Backend-only aggregates; this schema MUST NOT be exposed in PostgREST.
create role metaflow_dashboard_owner nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls;
create role metaflow_dashboard_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls connection limit 2;
alter role metaflow_dashboard_reader set statement_timeout = '20s';
alter role metaflow_dashboard_reader set idle_in_transaction_session_timeout = '30s';
alter role metaflow_dashboard_reader set default_transaction_read_only = on;

create schema dashboard_private;
revoke all on schema dashboard_private from public, anon, authenticated;
grant usage on schema dashboard_private to metaflow_dashboard_owner, metaflow_dashboard_reader;
grant usage on schema analytics to metaflow_dashboard_owner;
grant select (event_name, occurred_at, received_at, session_id, page_view_id,
    anonymous_user_id_hash, resource_id, route, context, device, properties)
    on analytics.events_raw to metaflow_dashboard_owner;
create policy dashboard_aggregate_source on analytics.events_raw for select
    to metaflow_dashboard_owner using (true);

create table dashboard_private.public_resources (
    resource_id text not null check (length(resource_id) between 1 and 200),
    route text primary key check (length(route) between 1 and 500),
    title text not null check (length(title) between 1 and 300)
);
alter table dashboard_private.public_resources enable row level security;
grant select on dashboard_private.public_resources to metaflow_dashboard_owner;
create policy dashboard_catalog_read on dashboard_private.public_resources for select
    to metaflow_dashboard_owner using (true);

create function dashboard_private.analytics_snapshot(p_days integer)
returns jsonb language plpgsql stable security definer
set search_path = '' set row_security = on set timezone = 'UTC'
as $$
declare
    v_cut timestamptz := statement_timestamp();
    v_start timestamptz;
    v_result jsonb;
begin
    if p_days is null or p_days not in (7, 30) then
        raise exception 'unsupported period' using errcode = '22023';
    end if;
    v_start := ((v_cut at time zone 'Asia/Shanghai')::date - (p_days - 1))::timestamp
        at time zone 'Asia/Shanghai';
    with events as materialized (
        select event_name, occurred_at, session_id, page_view_id,
            nullif(anonymous_user_id_hash, '') as visitor,
            coalesce(nullif(resource_id,''), nullif(context->>'resource_id','')) as resource,
            rtrim(route,'/') as route, coalesce(device->>'device_class', context#>>'{device,device_class}') as device_class,
            properties
        from analytics.events_raw
        where occurred_at >= v_start and occurred_at <= v_cut and received_at <= v_cut
          and event_name in ('page_viewed','resource_load_started','first_frame_ready','resource_load_failed')
    ), pages as (
        select *, (occurred_at at time zone 'Asia/Shanghai')::date as day
        from events where event_name = 'page_viewed'
    ), starts as (
        select session_id, page_view_id, resource, route,
            min(occurred_at) as started_at
        from events where event_name='resource_load_started' and nullif(page_view_id,'') is not null
        group by session_id, page_view_id, resource, route
    ), loads as materialized (
        select s.resource, s.route, (s.started_at at time zone 'Asia/Shanghai')::date as day,
            extract(epoch from (min(e.occurred_at) filter (where e.event_name='first_frame_ready') - s.started_at))*1000 as ttf_ms,
            bool_or(e.event_name='resource_load_failed') as failed
        from starts s left join events e
          on e.session_id=s.session_id and e.page_view_id=s.page_view_id
          and e.resource is not distinct from s.resource and e.route is not distinct from s.route
          and e.event_name in ('first_frame_ready','resource_load_failed')
          and e.occurred_at>=s.started_at and e.occurred_at<=s.started_at+interval '24 hours'
        group by s.session_id, s.page_view_id, s.resource, s.route, s.started_at
    ), page_daily as (
        select day, count(*) as pv, count(distinct visitor) as uv from pages group by day
    ), daily as (
        select d::date as date, coalesce(p.pv,0) as pv, coalesce(p.uv,0) as uv
        from pg_catalog.generate_series(v_start at time zone 'Asia/Shanghai',
            (v_cut at time zone 'Asia/Shanghai')::date::timestamp, interval '1 day') d
        left join page_daily p on p.day=d::date
    ), resource_pages as (
        select resource, route, count(*) as pv, count(distinct visitor) as uv from pages group by resource, route
    ), resource_loads as (
        select resource, route, count(*) as attempts, count(ttf_ms) as successes,
            percentile_cont(0.95) within group (order by ttf_ms) as p95_ms
        from loads group by resource, route
    ), resources as (
        select c.route as id, c.title, coalesce(p.pv,0) as pv, coalesce(p.uv,0) as uv,
            coalesce(l.attempts,0) as attempts, coalesce(l.successes,0) as successes,
            l.successes::numeric / nullif(l.attempts,0) as success_rate,
            l.p95_ms, coalesce(l.successes,0) as p95_samples
        from dashboard_private.public_resources c
        left join resource_pages p on p.resource=c.resource_id and p.route=rtrim(c.route,'/')
        left join resource_loads l on l.resource=c.resource_id and l.route=rtrim(c.route,'/')
    ), device_counts as (
        select case when device_class in ('mobile','desktop','tablet') then device_class else 'unknown' end as category,
            count(*) as count from pages group by 1
    ), errors as (
        select case
            when lower(coalesce(properties->>'error_name','')) in ('networkerror','timeouterror','aborterror') then 'network'
            when lower(coalesce(properties->>'error_name','')) in ('webglerror','webgpuerror','contextlosterror') then 'renderer'
            when lower(coalesce(properties->>'error_name','')) in ('decodeerror','parseerror','resourceerror') then 'resource'
            else 'other' end as category, count(*) as count
        from events where event_name='resource_load_failed' group by 1
    )
    select jsonb_build_object(
        'schema_version',1, 'kind','analytics', 'timezone','Asia/Shanghai',
        'period',jsonb_build_object('days',p_days,'start',v_start,'end',v_cut),
        'source_cutoff_at',v_cut,'generated_at',v_cut,
        'latest_event_at',(select max(occurred_at) from events),
        'kpis',jsonb_build_object(
            'pv',(select count(*) from pages),'uv',(select count(distinct visitor) from pages),
            'uv_missing_pv',(select count(*) from pages where visitor is null),
            'attempts',(select count(*) from loads),'successes',(select count(ttf_ms) from loads),
            'success_rate',(select count(ttf_ms)::numeric/nullif(count(*),0) from loads),
            'p95_ms',(select percentile_cont(0.95) within group (order by ttf_ms) from loads),
            'p95_samples',(select count(ttf_ms) from loads)),
        'daily',(select coalesce(jsonb_agg(to_jsonb(daily) order by date),'[]'::jsonb) from daily),
        'resources',(select coalesce(jsonb_agg(to_jsonb(resources) order by pv desc,id),'[]'::jsonb) from resources),
        'devices',(select coalesce(jsonb_agg(to_jsonb(device_counts) order by category),'[]'::jsonb) from device_counts),
        'errors',(select coalesce(jsonb_agg(to_jsonb(errors) order by category),'[]'::jsonb) from errors)
    ) into v_result;
    return v_result;
end;
$$;
revoke all on function dashboard_private.analytics_snapshot(integer) from public, anon, authenticated;
grant execute on function dashboard_private.analytics_snapshot(integer) to metaflow_dashboard_reader;
comment on function dashboard_private.analytics_snapshot(integer) is
    'MF-89: backend DB ACL only, no web auth context; fixed 7/30-day aggregate, no raw identifiers.';
-- Ownership transfer needs temporary membership; the login reader never receives it.
grant metaflow_dashboard_owner to postgres;
grant create on schema dashboard_private to metaflow_dashboard_owner;
alter function dashboard_private.analytics_snapshot(integer) owner to metaflow_dashboard_owner;
revoke create on schema dashboard_private from metaflow_dashboard_owner;
revoke metaflow_dashboard_owner from postgres;
