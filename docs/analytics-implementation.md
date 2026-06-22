# Metaflow Analytics Implementation

This document describes the v1 analytics implementation for Metaflow Viewer.
Supabase is the canonical analytics store. PostHog is optional and should only
mirror low-frequency product analytics events.

## Runtime Behavior

- Analytics is disabled unless an endpoint is configured.
- Configure the endpoint with one of:
  - Netlify build env `METAFLOW_ANALYTICS_ENDPOINT`
  - URL param `analyticsEndpoint=...`
  - `localStorage.setItem('metaflow.analytics.endpoint', '...')`
- Configure the sink with one of:
  - Netlify build env `METAFLOW_ANALYTICS_SINK=supabase|posthog|dual`
  - URL param `analyticsSink=supabase|posthog|dual`
  - `localStorage.setItem('metaflow.analytics.sink', 'dual')`
- The default sink is `supabase`.
- Disable analytics with `?noanalytics`, `?analytics=0`, `localStorage.setItem('metaflow.analytics.disabled', 'true')`, or browser Do Not Track.
- Heartbeats run every 15 seconds while the document is visible.
- `page_hidden` and `session_ended` use `sendBeacon` when possible.
- Replay uses rrweb only for sampled sessions, masks inputs, and does not record canvas.
- `session_summary` is emitted best-effort on unload/stop for low-frequency rollups and optional PostHog mirroring.
- Device context includes viewport, screen, DPR, language, timezone, touch points,
  hardware concurrency, device memory, network information, User-Agent, and
  Client Hints when available.
- Trusted host device context can additionally provide `device_model_raw`,
  `device_model_source`, and `device_model_confidence`. Supported exact-model
  sources are User-Agent Client Hints, Alipay Mini Program, WeChat Mini Program,
  native WebView, and manual test injection through `window.MetaflowDeviceInfo`.
  Ordinary mobile Safari/Chrome web traffic does not expose exact iPhone model
  identifiers, so the pipeline reports iOS as `iPhone` or `iPad` unless a
  trusted host injects a raw identifier such as `iPhone17,3`.
- Acquisition context stores only privacy-safe attribution fields: referrer
  without query string, referrer domain, entry path, query-presence flag, and
  whitelisted UTM parameters.
- Performance context records Web Vitals snapshots and sanitized Resource Timing
  entries for key viewer assets. It stores paths, roles, durations, and byte
  sizes, not full URLs with arbitrary query strings.
- Interaction depth is aggregated into heartbeat/session fields. Pointer moves,
  camera drags, wheel zooms, keyboard movement duration, joystick duration, and
  annotation view counts are counters, not high-frequency raw streams.

## Supabase CLI

The local CLI is intended to be installed globally with Homebrew:

```bash
brew install supabase
supabase --version
supabase --help
```

Do not use `npm install -g supabase`; Supabase does not support npm global
installation for the CLI. Local stack commands such as `supabase start` require
Docker.

## Supabase Setup

Apply the migration:

```bash
supabase db push
```

If the Supabase CLI is unavailable, run `supabase/migrations/20260616000000_analytics_v1.sql` in the SQL editor.

Expose the `analytics` schema in Supabase Dashboard:

- Project > Integrations > Data API > Settings
- Exposed schemas should include `public`, `graphql_public`, and `analytics`
- Keep individual analytics tables unexposed for anon/authenticated access
- Keep "Automatically expose new tables" disabled

The collector uses the service-role key from Supabase Edge Functions. The
`analytics_service_role_grants` migration grants the service role table access
inside the private analytics schema while anon/authenticated roles remain
revoked.

Deploy the Edge Function:

```bash
supabase functions deploy analytics-collect
```

Set function secrets:

```bash
supabase secrets set ANALYTICS_ALLOWED_ORIGINS=https://metaflow.shuang-su.com
supabase secrets set ANALYTICS_HASH_SALT=<random-long-secret>
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase in hosted Edge Functions. Do not expose the service role key in frontend code.

## Optional PostHog Mirror

PostHog is optional. Use it for funnels, retention, cohorts, feature flags, and
selected replay workflows. Do not use it as the canonical analytics database.

Configure PostHog with:

```bash
METAFLOW_ANALYTICS_SINK=dual
METAFLOW_POSTHOG_KEY=<public-project-key>
METAFLOW_POSTHOG_HOST=https://us.i.posthog.com
```

Runtime overrides:

```text
?analyticsSink=dual&posthogKey=<public-project-key>&posthogHost=https://us.i.posthog.com
```

PostHog receives only this allowlist:

- `page_viewed`
- `first_frame_ready`
- `resource_load_failed`
- `ui_clicked`
- `settings_changed`
- `camera_mode_changed`
- `navigation_completed`
- `fullscreen_changed`
- `xr_started`
- `xr_failed`
- `client_error`
- `session_summary`

PostHog explicitly does not receive heartbeat events, loading-stage chatter,
replay chunk payloads, or future high-frequency collaboration cursor/camera
updates. The SDK disables PostHog autocapture, automatic pageview/pageleave, and
PostHog session recording by default. If `METAFLOW_POSTHOG_REPLAY=true` or
`?posthogReplay=1` is set, PostHog replay starts with inputs/text masked and
canvas recording disabled.

## Collaboration Events

Future collaborative viewing should use Supabase Realtime Presence/Broadcast for live state.
Analytics should only receive aggregate collaboration events:

- `collab_room_created`
- `collab_room_joined`
- `collab_room_left`
- `collab_presence_changed`
- `shared_camera_started`
- `shared_camera_stopped`
- `collab_session_summary`

Do not write high-frequency cursor, camera, or pointer broadcast payloads into
`analytics.events_raw`.

## Resource Dimension Sync

After `data/index.json` changes, sync `analytics.dim_resource`:

```bash
node scripts/export_analytics_resources.mjs > /tmp/metaflow-analytics-resources.sql
```

Run the generated SQL with `psql` or the Supabase SQL editor.

## Metabase

Create a database login for Metabase and grant it the `analytics_reader` role created by the migration:

```sql
create user metabase_analytics_reader with password '<change-me>';
grant analytics_reader to metabase_analytics_reader;
```

Point Metabase at Supabase Postgres and expose these datasets first:

- `analytics.fact_page_views`
- `analytics.fact_sessions`
- `analytics.fact_resource_loads`
- `analytics.fact_resource_stage_timings`
- `analytics.fact_resource_timings`
- `analytics.fact_web_vitals`
- `analytics.fact_interactions`
- `analytics.fact_collaboration`
- `analytics.fact_users`
- `analytics.daily_route_metrics`
- `analytics.daily_resource_metrics`
- `analytics.daily_device_metrics`
- `analytics.daily_error_metrics`
- `analytics.daily_collaboration_metrics`
- `analytics.daily_performance_metrics`
- `analytics.daily_user_metrics`
- `analytics.daily_data_quality_metrics`
- `analytics.hourly_usage_metrics`
- `analytics.daily_retention_cohorts`
- `analytics.daily_acquisition_metrics`
- `analytics.daily_device_model_metrics`

Refresh rollups after ingestion batches:

```sql
select analytics.refresh_rollups();
```

### Dashboard Rollups

Metabase dashboards should use facts and rollups instead of scanning
`analytics.events_raw`. The current dashboard automation is built around these
summary layers:

- `analytics.hourly_usage_metrics` powers "today vs yesterday" hourly bars and
  cumulative curves for PV, UV, sessions, engaged sessions, load failures,
  client errors, and p50/p95 first-frame timing.
- `analytics.daily_kpi_metrics` stores daily dashboard KPI inputs for dense
  metric grids and period comparison.
- `analytics.daily_retention_cohorts` stores anonymous-user D0-D30 retention by
  first-visit date for cohort heat-table style analysis.
- `analytics.daily_session_duration_metrics` stores session-duration buckets for
  access-depth profiling.
- `analytics.daily_hourly_profile_metrics` stores hour-of-day usage distribution
  across the selected period.
- `analytics.daily_acquisition_metrics` groups visits by privacy-safe source
  dimensions: channel group, referrer domain, UTM source, UTM medium, and UTM
  campaign. It includes share, new users, returning users, engaged sessions,
  and first-frame success.
- `analytics.daily_device_model_metrics` groups browser, OS, device class,
  renderer, trusted raw model code/source/confidence, privacy-safe device model
  display, viewport bucket, and DPR with visit, load-quality, and error metrics.
- `analytics.daily_goal_conversion_metrics` stores Metaflow-native conversion
  goals: `first_frame_ready`, `engaged_session`, `annotation_opened`,
  `fullscreen_changed`, `xr_started`, and `navigation_completed`.
- `analytics.daily_dashboard_freshness_metrics` exposes latest event timestamps
  and 24-hour raw/page-view volume for the top-of-dashboard freshness card.

Device model display is intentionally conservative:

- Android shows the Client Hints model only when it is available; otherwise it
  reports `Android unknown`.
- iOS is reported as `iPhone` or `iPad`; the pipeline does not infer exact
  iPhone models from viewport and DPR.
- Apple raw identifiers such as `iPhone17,3` are stored as raw codes when a
  trusted host provides them. Marketing names are intentionally optional because
  those mappings can drift and are not required for compatibility diagnosis.
- Desktop uses OS, browser, and renderer dimensions rather than trying to infer
  hardware model.

The dashboard intentionally does not include age, gender, province/city, trade
amount, repeat purchase, search-to-transaction, or collection-to-transaction
metrics. Those either have no trustworthy Metaflow source today or would require
additional consent, account data, or commerce features.

Suggested first SQL checks after a deploy:

```sql
select count(*) from analytics.dim_resource;
select event_name, count(*) from analytics.events_raw group by 1 order by 2 desc;
select browser, os, device_class, renderer, count(*) from analytics.fact_page_views group by 1, 2, 3, 4;
select route, p95_ttf_ms, p95_lcp_ms, p95_inp_ms from analytics.daily_performance_metrics order by metric_date desc limit 20;
select * from analytics.daily_data_quality_metrics order by metric_date desc limit 20;
select metric_date, hour_of_day, page_views from analytics.hourly_usage_metrics order by metric_hour desc limit 24;
select cohort_date, day_number, retention_rate from analytics.daily_retention_cohorts order by cohort_date desc, day_number limit 32;
select channel_group, referrer_domain, unique_users from analytics.daily_acquisition_metrics order by metric_date desc, unique_users desc limit 20;
select device_model_display, device_model_raw, device_model_source, exact_model_available, unique_users from analytics.daily_device_model_metrics order by metric_date desc, unique_users desc limit 20;
select duration_bucket, sessions from analytics.daily_session_duration_metrics order by metric_date desc, bucket_sort limit 20;
select goal_name, channel_group, route, goal_sessions, session_conversion_rate from analytics.daily_goal_conversion_metrics order by metric_date desc, goal_sessions desc limit 20;
```

## Metabase Dashboard Entry

The internal dashboard entry is:

```text
https://dashboard.metaflow.shuang-su.com/metaflow/
```

This page is a lightweight bilingual shell served by Caddy. Metabase remains the
system of record for cards, SQL, filters, permissions, and login. The shell only
stores the Chinese/English preference in `localStorage` and switches between:

- `Metaflow 使用总览`
- `Metaflow Usage Overview`

The main site `/dashboard` redirect points to this shell. `/dashboard/*` remains
a passthrough redirect to native Metabase dashboard paths for deep links.

Run or rerun the dashboard automation on the Metabase server with:

```bash
sudo bash scripts/configure_metabase_bilingual_dashboard.sh
```

On the current server, Caddy is containerized. The script writes the shell to
`/opt/metaflow-metabase/dashboard-shell`, syncs it into the Caddy data mount at
`/opt/metaflow-metabase/caddy/data/dashboard-shell`, and configures
`/opt/metaflow-metabase/caddy/Caddyfile` to serve `/metaflow/` from
`/data/dashboard-shell`. It preserves the rest of the dashboard subdomain as a
reverse proxy to Metabase on `127.0.0.1:3000`.

The Metabase reverse proxy strips upstream `Content-Security-Policy` and
`X-Frame-Options` response headers so the same-origin `/metaflow/` shell can
embed the native dashboard. The dashboard is still protected by Metabase login;
public sharing remains disabled.

The dashboard follows product-analytics visualization patterns rather than a
separate business-domain information architecture. The first version includes
dense focus-metric tables with previous-period deltas, today/yesterday hourly
comparison, multi-metric trend charts, route/resource detail tables, retention
cohorts, D1/D7/D30 retention summary, source TOP/detail views, visit-duration
and hour-of-day profiles, trusted device model detail, exact-model coverage,
device quality rankings, device-by-renderer comparison, renderer quality tables,
conversion goals, metric definitions, data-quality trends, and bottom-of-page
diagnostic sessions.

## Privacy Defaults

- Input contents are not collected.
- Sensitive property keys are redacted by the frontend SDK.
- The collector stores a salted hash of `anonymous_id`; raw anonymous IDs are not persisted.
- IP addresses are not written to analytics tables.
- Replay payloads are stored in the private `analytics-replays` bucket.
