---
change_id: MF-30
title: Viewer 5.19.1 controlled release recovery
status: ready-for-release
risk: T3
component:
  - viewer
plan_revision: 3
owner: Shuang-su
issue: https://github.com/Shuang-su/Metaflow/issues/30
completion_state: pending
---

# MF-30 Viewer 5.19.1 controlled release recovery proposal

## Decision

Release Metaflow Viewer `5.19.1` as the controlled recovery for the already-merged runtime product commit `26e311c010aea4a6202521453a034d5aef3cea54`, based on SuperSplat Viewer `v1.29.1` commit `3a61fa606e12640b1e87f9a733ed43d7fbc5d925`, tree `671059c4b4a3693115ad010207b66312f5cbbc8c`, and PlayCanvas `2.21.3`. Release-control recovery PR #45 merged as `534b01308f13732c58600cef571b5dfea14df51b`; it changes validation, version smoke, and Netlify trigger boundaries without changing Viewer runtime behavior.

The user explicitly authorized the squash merge and full formal release on 2026-08-14. The first immutable Tag, `viewer-v5.19.0` (object `c9a19ea438e604333af2d3158bebea7d16f1a33e`, target `f1986097f81cf15db95d33fa76c090b2066d4bd1`), failed prepare run `31779246997` before deployment, created no GitHub Release, and never changed production. The user then selected PATCH `5.19.1`, a separate recovery PR, a new immutable Tag only after clean validation, the controlled GitHub Actions to Netlify path, production smoke, a 15-minute observation, final audit records, and Issue closure. Production remains `5.18.1` until that entire recovery sequence succeeds.

## Why release

The upstream line adds and corrects on-demand rendering, near-clip handling, streamed work-buffer ordering, capture, Annotation preference, WebGPU/WebXR detection, preference lifecycle, programmable locale selection, and SH update cadence. The Metaflow implementation preserves the local product layer instead of replacing it: route/index/alias contracts, legacy SOG and streamed LOD, non-blocking environment, first-frame/reveal sequencing, Orbit/walk/fly/mobile controls, single/tiled voxel collision, `metaflow-rz180`, settings v1/v2, brand, nine locales, Analytics, XR navigation, and diagnostics. The recovery is necessary because the initial release sparse checkout omitted `.nvmrc` and current event fixtures and ran consumer tests before build; it also closes the gap where ordinary main pushes could trigger production outside the controlled Tag workflow.

The final explicit decisions are SH performance `1°` / quality `0.2°`, one-time preference migration followed by user-change persistence, `Config.lang`, opt-in Debug Engine, entry-identity parser selection with structure validation, four total top-level attempts, composed production CSS maps, DOMPurify `3.4.13`, and `sideEffects:false` after Rollup/Webpack evidence. All 87 current `files.model` choices remain unchanged.

## Alternatives considered

1. Keep production on `5.18.1`: rejected because the reviewed `v1.29.1` correctness, API, package, and security improvements would remain unavailable.
2. Deploy the pre-squash branch commit: rejected because Version History and the immutable release must identify the real main-history product SHA.
3. Upload directly to Netlify: rejected because it would bypass the controlled workflow, commit-ref verification, immutable evidence, and rollback automation.
4. Delay for physical mobile and XR hardware: not selected for this release. Browser mobile viewport and XR API/detection evidence are retained, while physical iOS/Android and immersive XR remain explicitly unverified.
5. Reuse or move `viewer-v5.19.0`: rejected because a pushed Tag is immutable historical evidence.
6. Call the release `5.20.0`: rejected because the recovery adds no new backwards-compatible Viewer capability; PATCH `5.19.1` is the correct version.

## Release controls

- GitHub `production` Environment has no required reviewer or wait timer, permits only `main`, and exposes only the required Netlify secret names.
- The release workflow must validate the Tag target, strict Completion Dossier, platform, clean Viewer build/tests, and immutable Git tree before production.
- Netlify must produce a ready deploy whose `commit_ref` equals the release-packet Tag target and make that deploy the published production pointer before success is accepted.
- Ordinary Git `main` builds must not publish production; PR/feature Deploy Previews remain available, and the controlled build hook is the only production trigger.
- The production smoke and 15-minute observation must both pass before `5.19.1` is recorded as stable and Issue #30 is closed.
- No independent reviewer completed a review. The user's explicit authorization is the merge and release authority, and this limitation remains in the release record.

## Risks and rollback

Residual product risks are additional SH work during small camera motions, missed explicit frame requests in future dynamic surfaces, no per-request timeout or `Retry-After`, future Engine parser/work-buffer changes, and unverified physical mobile/XR hardware. The code baseline is `dbbd0015a8d13d4380d100fad4e5121dc2b29746`; the production deploy rollback target is `6a7a18b49094c6c76eff2482` (`viewer-v5.18.1`).

If the new deploy is published but smoke or observation fails, invoke the repository rollback workflow with that exact deploy ID, verify production recovery, keep MF-30 open, and append the failure evidence. The pushed `viewer-v5.19.0` Tag is immutable and remains a failed pre-deployment attempt. Once pushed, `viewer-v5.19.1` is also immutable; any tracked post-Tag correction requires `5.19.2`.

## Scope boundaries

This release does not add streaming/highest-quality source labels or switching UI, change any resource route/payload/schema, advertise SPZ/KHR as a Metaflow product contract, modify Editor or Transform, handle LICENSE, merge through local divergent `main`, force-push, or perform a manual production upload.
