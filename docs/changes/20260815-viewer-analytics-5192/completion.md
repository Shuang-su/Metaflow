# Completion

## Result

Viewer `5.19.2` analytics recovery was published to production on 2026-08-15. The final immutable deploy `6a8087d8ee37ee534090c5a2` is ready and the production alias points to it. Both immutable and production HTML expose the Supabase collector endpoint; `/data/index.json` reports `5.19.2`, `92d11b0`, and 87 resources. The final deploy also carries the exact public `data/version-history.json` mirror from the release checkpoint.

## Production evidence

- Browser navigation to `/acg/j05/01` emitted a collector request to `https://bziyumtuzvfmhgghvpcs.functions.supabase.co/analytics-collect`; preflight and POST both returned HTTP 200.
- The request context contained `app_version=5.19.2`, `release_display_version=5.19.2`, `git_ref=92d11b0`, `route=/acg/j05/01`, and `analytics_sink=supabase`.
- Supabase readback received `session_started`, `page_viewed`, `first_frame_ready`, `navigation_completed`, and `session_heartbeat` for the new 5.19.2 session. The heartbeat included the observed pointer counters.

## Validation

- `npm test` (86/86), lint, typecheck, analytics regression test, formatting, publint, production npm audit, MCL lightweight tests, release-contract tests, platform validation, release contract validation, and `git diff --check` passed.
- Production build fails closed when a Supabase endpoint is absent and succeeds with the fixed endpoint.

## Known limits

The browser pass used the Codex in-app desktop browser, not a physical iPad/Safari device. No database schema or Edge Function change was made. The previously observed unrelated RLS advisory on `analytics.events_raw_default` remains unchanged.
