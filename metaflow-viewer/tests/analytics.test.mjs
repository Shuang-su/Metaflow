import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const readJson = async (url) => JSON.parse(await readFile(url, 'utf8'));
const readText = (url) => readFile(url, 'utf8');

const requiredEvents = [
    'session_started',
    'page_viewed',
    'session_heartbeat',
    'page_hidden',
    'page_restored',
    'session_ended',
    'session_summary',
    'route_resolved',
    'resource_load_started',
    'loading_stage_changed',
    'first_frame_ready',
    'resource_load_failed',
    'web_vitals_observed',
    'resource_timing_collected',
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
    'xr_failed',
    'client_error',
    'replay_started',
    'replay_uploaded',
    'replay_failed',
    'collab_room_created',
    'collab_room_joined',
    'collab_room_left',
    'collab_presence_changed',
    'shared_camera_started',
    'shared_camera_stopped',
    'collab_session_summary'
];

test('tracking plan defines the v1 event contract', async () => {
    const plan = await readJson(new URL('../../analytics/tracking-plan.json', import.meta.url));

    assert.equal(plan.schema_version, 'analytics.v1.2');
    assert.equal(plan.source_app, 'metaflow-viewer');
    assert.equal(plan.heartbeat_interval_ms, 15000);
    assert.equal(plan.session_timeout_ms, 1800000);
    assert.equal(plan.privacy.input_text_policy, 'never_collect');
    assert.equal(plan.privacy.record_canvas, false);
    assert.equal(plan.privacy.mask_all_inputs, true);
    assert.equal(plan.sinks.default, 'supabase');
    assert.deepEqual(plan.sinks.allowed, ['supabase', 'posthog', 'dual']);
    assert.ok(plan.sinks.posthog_allowlist.includes('session_summary'));
    assert.ok(!plan.sinks.posthog_allowlist.includes('session_heartbeat'));
    assert.ok(plan.sinks.posthog_excluded.includes('web_vitals_observed'));
    assert.ok(plan.sinks.posthog_excluded.includes('resource_timing_collected'));
    assert.ok(plan.sinks.posthog_excluded.includes('collab_presence_changed'));
    assert.ok(plan.common_context.includes('acquisition'));
    assert.ok(plan.common_context.includes('device_model_raw'));
    assert.ok(plan.common_context.includes('device_model_source'));
    assert.ok(plan.common_context.includes('device_model_confidence'));
    assert.ok(plan.device_model_policy.exact_model_sources.includes('alipay_mini_program'));
    assert.equal(plan.device_model_policy.ios_web_policy, 'do_not_infer_exact_model_from_viewport_or_dpr');
    assert.ok(plan.dashboard_controls.parameters.includes('source'));
    assert.ok(plan.conversion_goals.includes('first_frame_ready'));

    for (const eventName of requiredEvents) {
        assert.ok(plan.events[eventName], `missing event ${eventName}`);
        assert.equal(plan.events[eventName].version, 1, `${eventName} should start at v1`);
        assert.ok(plan.events[eventName].owner, `${eventName} should have an owner`);
    }
});

test('frontend SDK implements heartbeat, beacon flushing, and replay privacy defaults', async () => {
    const source = await readText(new URL('../src/analytics/client.ts', import.meta.url));

    assert.match(source, /const HEARTBEAT_INTERVAL_MS = trackingPlan\.heartbeat_interval_ms/);
    assert.match(source, /setInterval\(\(\) => \{/);
    assert.match(source, /document\.addEventListener\('visibilitychange'/);
    assert.match(source, /window\.addEventListener\('pagehide'/);
    assert.match(source, /navigator\.sendBeacon/);
    assert.match(source, /keepalive: options\.beacon/);
    assert.match(source, /POSTHOG_ALLOWED_EVENTS/);
    assert.match(source, /import\('posthog-js'\)/);
    assert.match(source, /autocapture: false/);
    assert.match(source, /capture_pageview: false/);
    assert.match(source, /capture_pageleave: false/);
    assert.match(source, /disable_session_recording: !this\.posthogReplay/);
    assert.match(source, /ip: false/);
    assert.match(source, /if \(\s*!this\.supabaseEnabled \|\|\s*rate <= 0/s);
    assert.match(source, /maskAllInputs: true/);
    assert.match(source, /maskTextSelector: '\*'/);
    assert.match(source, /recordCanvas: false/);
    assert.match(source, /blockClass: 'rr-block'/);
    assert.match(source, /ignoreClass: 'rr-ignore'/);
    assert.match(source, /maskTextClass: 'rr-mask'/);
});

test('frontend SDK captures device hints, acquisition, performance, and aggregate interaction depth', async () => {
    const source = await readText(new URL('../src/analytics/client.ts', import.meta.url));

    assert.match(source, /navigator\.userAgent/);
    assert.match(source, /userAgentData/);
    assert.match(source, /getHighEntropyValues/);
    assert.match(source, /getAcquisitionContext/);
    assert.match(source, /utm_source/);
    assert.match(source, /PerformanceObserver/);
    assert.match(source, /largest-contentful-paint/);
    assert.match(source, /layout-shift/);
    assert.match(source, /first-input/);
    assert.match(source, /resource_timing_collected/);
    assert.match(source, /web_vitals_observed/);
    assert.match(source, /interaction_depth_since_last/);
    assert.match(source, /joystick_touch_ms/);
    assert.match(source, /error_stack_hash/);
    assert.match(source, /MetaflowDeviceInfo/);
    assert.match(source, /HOST_DEVICE_MODEL_SOURCES/);
    assert.match(source, /device_model_raw/);
});

test('viewer wires analytics into route, load, UI, navigation, and XR surfaces', async () => {
    const index = await readText(new URL('../src/index.ts', import.meta.url));
    const html = await readText(new URL('../src/index.html', import.meta.url));
    const ui = await readText(new URL('../src/ui.ts', import.meta.url));
    const xr = await readText(new URL('../src/xr.ts', import.meta.url));

    assert.match(html, /metaflow-analytics-endpoint/);
    assert.match(html, /metaflow-analytics-sink/);
    assert.match(html, /metaflow-posthog-key/);
    assert.match(html, /analyticsSink/);
    assert.match(index, /posthogKey: config\.posthogKey/);
    assert.match(index, /resourceUrls: config\.analyticsResourceUrls/);
    assert.match(index, /stage_elapsed_ms/);
    assert.match(html, /analyticsResource = \{/);
    assert.match(html, /analyticsResourceUrls/);
    assert.match(html, /noanalytics:/);
    assert.match(index, /createAnalyticsClient/);
    assert.match(index, /analytics\.track\('resource_load_started'/);
    assert.match(index, /analytics\.track\('loading_stage_changed'/);
    assert.match(index, /analytics\.markFirstFrame\(\)/);
    assert.match(index, /analytics\.track\('navigation_requested'/);
    assert.match(ui, /TRACKED_UI_ACTIONS/);
    assert.match(ui, /analytics\.track\('ui_clicked'/);
    assert.match(ui, /analytics\.track\('xr_requested'/);
    assert.match(xr, /analytics\.track\('xr_started'/);
    assert.match(xr, /analytics\.track\('xr_failed'/);
});

test('supabase migration exposes metabase-ready analytics models', async () => {
    const sql = await readText(new URL('../../supabase/migrations/20260616000000_analytics_v1.sql', import.meta.url));
    const v11 = await readText(new URL('../../supabase/migrations/20260616103041_analytics_v11_device_acquisition_performance.sql', import.meta.url));
    const v12 = await readText(new URL('../../supabase/migrations/20260622072037_analytics_v12_dashboard_visualizations.sql', import.meta.url));
    const v13 = await readText(new URL('../../supabase/migrations/20260622104126_analytics_v13_dashboard_controls_device_goals.sql', import.meta.url));
    const v14 = await readText(new URL('../../supabase/migrations/20260622110812_analytics_v14_device_model_exact_flag.sql', import.meta.url));
    const grants = await readText(new URL('../../supabase/migrations/20260616092508_analytics_service_role_grants.sql', import.meta.url));

    for (const tableName of ['events_raw', 'events_rejected', 'replay_chunks', 'dim_resource']) {
        assert.match(sql, new RegExp(`analytics\\.${tableName}`), `missing ${tableName}`);
        assert.match(sql, new RegExp(`alter table analytics\\.${tableName} enable row level security`), `${tableName} should enable RLS`);
    }

    for (const viewName of ['fact_page_views', 'fact_sessions', 'fact_resource_loads', 'fact_interactions', 'fact_collaboration']) {
        assert.match(sql, new RegExp(`analytics\\.${viewName}`), `missing ${viewName}`);
        assert.match(sql, /security_invoker = true/);
    }

    for (const rollupName of ['daily_route_metrics', 'daily_resource_metrics', 'daily_device_metrics', 'daily_error_metrics', 'daily_collaboration_metrics']) {
        assert.match(sql, new RegExp(`analytics\\.${rollupName}`), `missing ${rollupName}`);
    }

    for (const viewName of ['fact_web_vitals', 'fact_resource_timings', 'fact_resource_stage_timings', 'fact_users']) {
        assert.match(v11, new RegExp(`analytics\\.${viewName}`), `missing ${viewName}`);
        assert.match(v11, /security_invoker = true/);
    }

    for (const rollupName of ['daily_performance_metrics', 'daily_user_metrics', 'daily_data_quality_metrics']) {
        assert.match(v11, new RegExp(`analytics\\.${rollupName}`), `missing ${rollupName}`);
    }

    for (const rollupName of ['hourly_usage_metrics', 'daily_retention_cohorts', 'daily_acquisition_metrics', 'daily_device_model_metrics']) {
        assert.match(v12, new RegExp(`analytics\\.${rollupName}`), `missing ${rollupName}`);
        assert.match(v12, new RegExp(`refresh materialized view analytics\\.${rollupName}`), `${rollupName} should refresh in refresh_rollups`);
    }

    assert.match(v11, /browser/);
    assert.match(v11, /utm_source/);
    assert.match(v11, /heartbeat_coverage_rate/);
    assert.match(v12, /Android unknown/);
    assert.match(v12, /then 'iPhone'/);
    assert.match(v12, /then 'iPad'/);
    assert.doesNotMatch(v12, /iPhone\s+\d/);

    for (const rollupName of [
        'daily_kpi_metrics',
        'daily_retention_cohorts',
        'daily_session_duration_metrics',
        'daily_hourly_profile_metrics',
        'daily_acquisition_metrics',
        'daily_device_model_metrics',
        'daily_goal_conversion_metrics',
        'daily_dashboard_freshness_metrics'
    ]) {
        assert.match(v13, new RegExp(`analytics\\.${rollupName}`), `missing ${rollupName}`);
        assert.match(v13, new RegExp(`refresh materialized view analytics\\.${rollupName}`), `${rollupName} should refresh in refresh_rollups`);
    }

    assert.match(v13, /analytics\.dim_device_model/);
    assert.match(v13, /generate_series\(0, 30\)/);
    assert.match(v13, /device_model_raw/);
    assert.match(v13, /device_model_source/);
    assert.match(v13, /daily_goal_conversion_metrics/);
    assert.match(v13, /page_errors/);
    assert.doesNotMatch(v13, /iPhone\s+\d/);
    assert.match(v14, /drop materialized view if exists analytics\.daily_device_model_metrics/);
    assert.match(v14, /coalesce\(\(\s*dp\.device_model_raw is not null/);
    assert.match(v14, /grant select on analytics\.daily_device_model_metrics to analytics_reader/);

    assert.match(sql, /analytics_reader/);
    assert.match(sql, /analytics-replays/);
    assert.match(sql, /refresh materialized view analytics\.daily_route_metrics/);
    assert.match(grants, /grant usage on schema analytics to service_role/);
    assert.match(grants, /grant select, insert, update, delete on all tables in schema analytics to service_role/);
});

test('collector validates origins, schema, anonymous hashing, and service-role writes', async () => {
    const source = await readText(new URL('../../supabase/functions/analytics-collect/index.ts', import.meta.url));

    assert.match(source, /ANALYTICS_ALLOWED_ORIGINS/);
    assert.match(source, /Access-Control-Allow-Credentials': 'true'/);
    assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
    assert.match(source, /ANALYTICS_HASH_SALT/);
    assert.match(source, /crypto\.subtle\.digest\('SHA-256'/);
    assert.match(source, /MAX_BODY_BYTES/);
    assert.match(source, /MAX_EVENTS_PER_BATCH/);
    assert.match(source, /EVENT_NAMES/);
    assert.match(source, /collab_session_summary/);
    assert.match(source, /web_vitals_observed/);
    assert.match(source, /resource_timing_collected/);
    assert.match(source, /sec-ch-ua/);
    assert.match(source, /parseBrowser/);
    assert.match(source, /device_class/);
    assert.match(source, /DEVICE_MODEL_SOURCES/);
    assert.match(source, /device_model_raw/);
    assert.match(source, /device_model_source/);
    assert.match(source, /session_summary/);
    assert.match(source, /events_rejected/);
    assert.match(source, /from\('events_raw'\)/);
    assert.match(source, /from\(REPLAY_BUCKET\)/);
});

test('metabase dashboard automation uses aggregated models for bilingual visualizations', async () => {
    const source = await readText(new URL('../../scripts/configure_metabase_bilingual_dashboard.sh', import.meta.url));

    for (const cardName of [
        '我关注的数据',
        '数据新鲜度',
        '今日小时数据',
        '访问时段画像',
        '留存热力表',
        '留存摘要 D1/D7/D30',
        '来源明细',
        '机型明细',
        '精确机型覆盖率',
        '机型质量排行',
        '机型 × Renderer',
        '访问时长分布',
        '转化目标',
        '指标口径',
        'Renderer 质量',
        'Metaflow Focus Metrics',
        'Metaflow Data Freshness',
        'Metaflow Today vs Yesterday By Hour',
        'Metaflow Visit Hour Profile',
        'Metaflow Retention Cohorts',
        'Metaflow Retention Summary',
        'Metaflow Device Model Detail',
        'Metaflow Device Model Coverage',
        'Metaflow Device Quality Ranking',
        'Metaflow Device Renderer Matrix',
        'Metaflow Duration Distribution',
        'Metaflow Conversion Goals',
        'Metaflow Metric Definitions'
    ]) {
        assert.match(source, new RegExp(cardName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), `missing dashboard card ${cardName}`);
    }

    for (const modelName of [
        'analytics.hourly_usage_metrics',
        'analytics.daily_retention_cohorts',
        'analytics.daily_acquisition_metrics',
        'analytics.daily_device_model_metrics',
        'analytics.daily_kpi_metrics',
        'analytics.daily_session_duration_metrics',
        'analytics.daily_hourly_profile_metrics',
        'analytics.daily_goal_conversion_metrics',
        'analytics.daily_dashboard_freshness_metrics',
        'analytics.daily_route_metrics',
        'analytics.daily_resource_metrics',
        'analytics.daily_data_quality_metrics'
    ]) {
        assert.match(source, new RegExp(modelName.replace('.', '\\.')), `dashboard should query ${modelName}`);
    }

    assert.match(source, /DASHBOARD_PARAMETERS/);
    assert.match(source, /template-tags/);
    assert.match(source, /\{\{start_date\}\}/);
    assert.match(source, /\{\{route\}\}/);
    assert.match(source, /\{\{device_class\}\}/);
    assert.match(source, /\{\{renderer\}\}/);
    assert.match(source, /\{\{source\}\}/);
    assert.doesNotMatch(source, /spec\([^)]*events_raw/i);
});
