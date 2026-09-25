---
change_id: MF-30
title: Viewer 5.19.1 controlled release recovery
status: closed
risk: T3
component:
  - viewer
plan_revision: 4
owner: Shuang-su
issue: https://github.com/Shuang-su/Metaflow/issues/30
completion_state: complete
---

# MF-30 Viewer 5.19.1 controlled release recovery proposal

## Decision

Release Metaflow Viewer `5.19.1` as the controlled recovery for the already-merged runtime product commit `26e311c010aea4a6202521453a034d5aef3cea54`, based on SuperSplat Viewer `v1.29.1` commit `3a61fa606e12640b1e87f9a733ed43d7fbc5d925`, tree `671059c4b4a3693115ad010207b66312f5cbbc8c`, and PlayCanvas `2.21.3`. Release-control recovery PR #45 merged as `534b01308f13732c58600cef571b5dfea14df51b`; it changes validation, version smoke, and Netlify trigger boundaries without changing Viewer runtime behavior.

The user explicitly authorized the squash merge and full formal release on 2026-08-14. The first immutable Tag, `viewer-v5.19.0` (object `c9a19ea438e604333af2d3158bebea7d16f1a33e`, target `f1986097f81cf15db95d33fa76c090b2066d4bd1`), failed prepare run `31779246997` before deployment, created no GitHub Release, and never changed production. The user then selected PATCH `5.19.1`, a separate recovery PR, a new immutable Tag only after clean validation, production smoke, a 15-minute observation, final audit records, and Issue closure. When Netlify Git builds again failed to progress reliably, the user explicitly authorized canceling the non-published queue and using a clean exact-D2 CLI fallback after the controlled Prepare gate passed. Production is now Viewer `5.19.1` on deploy `6a7efc396f36c800cfa0702e`.

## Why release

The upstream line adds and corrects on-demand rendering, near-clip handling, streamed work-buffer ordering, capture, Annotation preference, WebGPU/WebXR detection, preference lifecycle, programmable locale selection, and SH update cadence. The Metaflow implementation preserves the local product layer instead of replacing it: route/index/alias contracts, legacy SOG and streamed LOD, non-blocking environment, first-frame/reveal sequencing, Orbit/walk/fly/mobile controls, single/tiled voxel collision, `metaflow-rz180`, settings v1/v2, brand, nine locales, Analytics, XR navigation, and diagnostics. The recovery is necessary because the initial release sparse checkout omitted `.nvmrc` and current event fixtures and ran consumer tests before build; it also closes the gap where ordinary main pushes could trigger production outside the controlled Tag workflow.

The final explicit decisions are SH performance `1°` / quality `0.2°`, one-time preference migration followed by user-change persistence, `Config.lang`, opt-in Debug Engine, entry-identity parser selection with structure validation, four total top-level attempts, composed production CSS maps, DOMPurify `3.4.13`, and `sideEffects:false` after Rollup/Webpack evidence. All 87 current `files.model` choices remain unchanged.

## Alternatives considered

1. Keep production on `5.18.1`: rejected because the reviewed `v1.29.1` correctness, API, package, and security improvements would remain unavailable.
2. Deploy the pre-squash branch commit: rejected because Version History and the immutable release must identify the real main-history product SHA.
3. Upload directly to Netlify without a passed Prepare and an exact immutable source chain: rejected. After the controlled Prepare passed and Netlify Git-build infrastructure still failed to progress, the user explicitly authorized one clean exact-D2 CLI/API fallback. That path records `commit_ref=null` honestly and proves identity through main, Tag, detached tree, artifact hashes, online version records, deploy ID, smoke, and observation.
4. Delay for physical mobile and XR hardware: not selected for this release. Browser mobile viewport and XR API/detection evidence are retained, while physical iOS/Android and immersive XR remain explicitly unverified.
5. Reuse or move `viewer-v5.19.0`: rejected because a pushed Tag is immutable historical evidence.
6. Call the release `5.20.0`: rejected because the recovery adds no new backwards-compatible Viewer capability; PATCH `5.19.1` is the correct version.

## Release controls

- GitHub `production` Environment has no required reviewer or wait timer, permits only `main`, and exposes only the required Netlify secret names.
- Controlled run `31795886847` validated the Tag target, strict Completion Dossier, platform, clean Viewer build/tests, security gates, and immutable Git tree before any production upload. Its production job was intentionally skipped.
- The exact-D2 fallback produced ready production deploy `6a7efc396f36c800cfa0702e`. Netlify reports `deploy_source=api` and `commit_ref=null`; source identity is instead proven by D2 main/Tag equality, the detached D2 tree, local-to-online hashes, and the online `5.19.1 / gitRef 534b013` records.
- Ordinary Git `main` builds remain intended to skip production. In this release the F and D2 records did not reach a real skip because Netlify Git builds stalled; both exact unpublished records were canceled. Future production remains governed by the controlled release path unless separately authorized.
- Immediate production smoke and the 15-minute observation both passed before `5.19.1` was recorded as stable and Issue #30 was closed.
- No independent reviewer completed a review. The user's explicit authorization is the merge and release authority, and this limitation remains in the release record.

## Risks and rollback

Residual product risks are additional SH work during small camera motions, missed explicit frame requests in future dynamic surfaces, no per-request timeout or `Retry-After`, future Engine parser/work-buffer changes, and unverified physical mobile/XR hardware. The code baseline is `dbbd0015a8d13d4380d100fad4e5121dc2b29746`; the production deploy rollback target is `6a7a18b49094c6c76eff2482` (`viewer-v5.18.1`).

If the new deploy is published but smoke or observation fails, invoke the repository rollback workflow with that exact deploy ID, verify production recovery, keep MF-30 open, and append the failure evidence. The pushed `viewer-v5.19.0` Tag is immutable and remains a failed pre-deployment attempt. Once pushed, `viewer-v5.19.1` is also immutable; any tracked post-Tag correction requires `5.19.2`.

## Scope boundaries

This release does not add streaming/highest-quality source labels or switching UI, change any resource route/payload/schema, advertise SPZ/KHR as a Metaflow product contract, modify Editor or Transform, handle LICENSE, merge through local divergent `main`, or force-push. The only non-hook production transport was the explicitly authorized exact-D2 CLI/API fallback documented above; it is not a standing permission for unverified manual uploads.
