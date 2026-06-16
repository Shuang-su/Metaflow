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
- `analytics.fact_interactions`
- `analytics.fact_collaboration`
- `analytics.daily_route_metrics`
- `analytics.daily_resource_metrics`
- `analytics.daily_device_metrics`
- `analytics.daily_error_metrics`
- `analytics.daily_collaboration_metrics`

Refresh rollups after ingestion batches:

```sql
select analytics.refresh_rollups();
```

## Privacy Defaults

- Input contents are not collected.
- Sensitive property keys are redacted by the frontend SDK.
- The collector stores a salted hash of `anonymous_id`; raw anonymous IDs are not persisted.
- IP addresses are not written to analytics tables.
- Replay payloads are stored in the private `analytics-replays` bucket.
