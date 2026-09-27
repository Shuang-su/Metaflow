# MF-85: Viewer v1.35.2 / Metaflow 5.20.0

Status: released as 5.20.0; see [production completion](completion.md).
Issue: https://github.com/Shuang-su/Metaflow/issues/85
Risk: T3; owners: viewer, platform release records. Plan: [plan.md](plan.md).

## Target
Adopt upstream stable v1.35.2 at c52f5258df424635323f26aaeebe51361dc0f8e6 and PlayCanvas 2.22.4. Follow the new upstream layout with Metaflow branding. Exclude post-tag experimental renderer #314; include stable pick-depth changes. Publish website/repository version 5.20.0 after verification, not an npm release. Editor is independent and unchanged.

## Contracts
- Preserve all 99 resource IDs, canonical routes/aliases, schema 1.2, models, settings, environment, voxels and covers. Explicit content wins over route resolution.
- Preserve filename-based format classification, four-attempt retry policy, terminal subject failure, non-blocking environment failure, first-frame reveal and LOD timing. Collision never gates subject reveal; walk requires local collision readiness.
- Preserve authored camera/FOV/background/post effects, animation first-exit policy, synthetic animation, partial v2 effects and legacy v1 migration. Settings import does not mutate callers. Authoring limits are opt-in, not runtime read limits.
- Preserve tiled voxel coordinates, cache and missing-tile degradation, on-demand rendering, existing XR navigation and WebGL fallback. Do not reset preferences again: migration marker remains 5.19.0.
- Add createViewer / ViewerHandle, per-instance state/events, seek/camera/annotation/movement/capture/fullscreen/XR and idempotent destroy; no global exposure by default. Destroy releases listeners, graphics resources, pending captures, analysis and DOM.
- Add ./viewer, ./viewer.css and renderViewerHtml while retaining html/css/js and ./settings. Node entries must not load the engine. Standalone globals retain capture RGBA shape, serial execution, readiness waiting and camera restoration; scrubTo keeps pause-and-wait semantics.
- Follow upstream controls, hints, annotations/occlusion and mobile layout; retain Metaflow branding, nine locales, loader diagnostics, analytics and debug tools. Reticle defaults off with explicit opt-in.

## Acceptance
Build/type/lint/unit/package tests; 99 settings/file/LFS/route integrity checks; desktop/mobile Chromium WebGL/WebGPU and WebKit WebGL; ordinary SOG, environment composition, large streaming LOD, delayed and failing collision. Test animation/capture/error recovery, annotation variants, multiple instances, UI-less instances, repeated mounts and destruction during load. Compare cameras, orientation, backgrounds, cover transition and fixed baseline performance; review intended screenshot differences before updating fixtures. Physical headset validation is explicitly unverified without hardware.

## Release
Squash product PR, record final product SHA, tag viewer-v5.20.0 and GitHub release. Validate Netlify candidate, deploy production, read back actual deployment/version/assets and observe for at least 15 minutes. On blocking regressions restore verified 5.19.3 deployment (current candidate 6ab904dffb745ba5eb1e07f6) and append records. Merge remote release history into local main normally, preserving local research.

## Accepted performance exception
On 2026-09-28 the user accepted the measured upstream Dayun LOD residency/texture allocation increase at the unchanged 4M budget and authorized release after the remaining checks. Measurements and limits are recorded in [completion.md](completion.md).
