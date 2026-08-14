---
change_id: MF-30
terminal_state: ready-for-release
generated_at: 2026-08-14T10:29:15Z
---

# MF-30 release closure source

## Closure Decision

The Change remains ready for release, not closed. Product implementation, decision audit, PR #41 integration, the failed immutable `5.19.0` release attempt, recovery PR #45, and `5.19.1` record reconciliation are complete. The `5.19.1` release packet, new Tag, controlled deployment, production smoke, 15-minute observation, final packet regeneration, and Issue closure are still required.

## Task Disposition

- `MF-30-T01` is complete: Viewer v1.29.1 implementation, decision completion, browser validation, branch delivery, and squash integration are recorded.
- `MF-30-T02` is partial: release-channel preparation, the initial failed Tag/run, recovery implementation and merge, exact-sparse validation, and `5.19.1` record alignment are complete. The ordinary-main Netlify record must first reach a clear non-publishing outcome; then the new immutable Tag, workflow/deploy, smoke, observation, final closure commit, Release update, and Issue closure remain.

## Plan Amendments and Deviations

Revision 1 covered the staged product upgrade and originally stopped at review. Revision 2 authorized the first formal production release. Its immutable `viewer-v5.19.0` prepare failed before deployment because sparse checkout omitted root `.nvmrc`, BitCity, and SZCAF15 fixtures and package-consumer tests ran before build. Production and GitHub Release were unchanged. Revision 3, explicitly authorized on 2026-08-14, uses PATCH `5.19.1`, repairs those deterministic release controls in separate PR #45, gates ordinary `main` Git builds while retaining Preview builds, preserves both the failed Tag and run, and requires a clean new Tag before deployment. No Viewer runtime, route, schema, resource payload, or preference-migration marker changed. The exact-sparse local run passed Viewer `85/85`; the first on-demand workflow preserved the `81/85` failure and the corrected workflow path-routed the Viewer job, so that skip is not presented as cloud test evidence. D2 validation also found and corrected an R2-only stale E2E version assertion; the amended R2 is `f0fb740d`. A temporary hardlink-fixture mistake briefly touched two divergent-main data records, which were restored atomically from that main's own `HEAD` and confirmed clean before continuing.

## Implementation and External Effects

PR #41 squash merged as runtime product `26e311c010aea4a6202521453a034d5aef3cea54`; release-record commit `18a164d64f5415f3dba9eed354192dd99f81bbec` aligned the original version surfaces. Failed packet `f1986097f81cf15db95d33fa76c090b2066d4bd1`, immutable `viewer-v5.19.0` tag object `c9a19ea438e604333af2d3158bebea7d16f1a33e`, and run `31779246997` are retained. Three stale non-published production jobs were canceled without deleting history. Recovery PR #45 squash merged as `534b01308f13732c58600cef571b5dfea14df51b`; release-record commit `f0fb740dd77d67e4f1be781934ce7a4fa095c30a` aligns `5.19.1` version surfaces and the E2E version assertion to that recovery SHA. GitHub `production` Environment, main-only policy, required secret names, and reusable controlled hook remain configured; no secret value or hook URL is stored here.

## Verification and Review

The Viewer product and first packet retain their recorded clean matrices. Recovery validation additionally passed a fresh exact sparse checkout in corrected order: Viewer `85/85`, format, lint, typecheck, publint, DOMPurify `3.4.13`, production audit 0, default/Debug builds, CSS map, pack, and fixed Webpack consumers. Corrected E2E passed WebGL desktop/mobile `4/4` plus Chromium WebGPU `1/1`. Repository validation passed Node `75/75`, Python `9/9`, strict MCL, release contract, full 87-resource/10,179-file checks, Platform/CI routing, 109 Markdown files, 12,763 hygiene files, 12 local reference digests, and 11 online identities. Recovery workflow/static tests prove exact Tag/version/gitRef smoke, package-consumer ordering, root/event fixture coverage, ordinary-main skip semantics, and retained controlled-hook/Preview paths. No independent reviewer completed a review; the release proceeds under explicit user authorization with that limitation disclosed.

## Release, Rollback and Observation

The failed immutable `viewer-v5.19.0` Tag exists and is not a production release. The new `viewer-v5.19.1` Tag and deploy do not yet exist. The new Tag must point to D2; production must use the controlled workflow and a Netlify deploy whose `commit_ref` matches D2. Netlify integration record `6a7ee320ef4dbd0008dd089f` for recovery SHA F is currently non-published but still `new`, so push/Tag remain gated on a clear non-publishing outcome. Rollback deploy is `6a7a18b49094c6c76eff2482`; observation length is 15 minutes after immediate smoke.

## Remaining Risks and Follow-up Changes

Physical iOS/Android and immersive XR remain unverified. SH `1/0.2` can increase small-motion updates; on-demand rendering requires future dynamic surfaces to request frames; top-level fetches have no new timeout or `Retry-After`. Future streaming/highest-quality source labels and switching are a separate data-label Change.

## Ledger, Version, PR, and Release Links

- Issue: https://github.com/Shuang-su/Metaflow/issues/30
- Integrated PR: https://github.com/Shuang-su/Metaflow/pull/41
- Product commit: `26e311c010aea4a6202521453a034d5aef3cea54`
- Merge-record commit: `18a164d64f5415f3dba9eed354192dd99f81bbec`
- Failed release packet: `f1986097f81cf15db95d33fa76c090b2066d4bd1`
- Failed Tag: `viewer-v5.19.0`, object `c9a19ea438e604333af2d3158bebea7d16f1a33e`, target `f1986097f81cf15db95d33fa76c090b2066d4bd1`
- Failed workflow: https://github.com/Shuang-su/Metaflow/actions/runs/31779246997
- Recovery PR: https://github.com/Shuang-su/Metaflow/pull/45
- Recovery squash: `534b01308f13732c58600cef571b5dfea14df51b`
- Recovery record: `f0fb740dd77d67e4f1be781934ce7a4fa095c30a`
- New Tag, successful workflow, Netlify immutable deploy, production smoke, observation, GitHub Release, and final closure commit will be recorded after they exist.

## Redactions

No repository text redactions were required. Credentials, secret values, and the build-hook URL were excluded at source and are not represented by placeholders.

## Final Response Delivery

The user has received progress updates through failed prepare, recovery merge, and `5.19.1` release-record preparation. The final response remains withheld until the Netlify main-gating result, controlled production smoke, observation, final external readback, and Issue closure are complete.
