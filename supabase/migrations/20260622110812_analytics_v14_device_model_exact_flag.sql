-- Normalize trusted device-model coverage to a strict boolean.
-- v13 can return null for historical rows that have a model string but no
-- source. The dashboard coverage card should classify those as not exact.

drop materialized view if exists analytics.daily_device_model_metrics;

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
        coalesce((
            dp.device_model_raw is not null
            and dp.device_model_source in (
                'ua_ch',
                'alipay_mini_program',
                'wechat_mini_program',
                'native_webview',
                'manual_test'
            )
        ), false) as exact_model_available
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

grant select on analytics.daily_device_model_metrics to analytics_reader;
