# Metaflow Current Sync Diff Audit

> **历史审计快照。** 本文描述 2026-06-08 同步与 hotfix 阶段，标题中的 “Current” 只指当时工作树，不代表现在的 `main`。不要直接按本文建议恢复代码。当前架构与同步方法见 [整体架构](concepts/architecture.md) 和 [上游同步](maintenance/upstream-sync.md)，当前 Viewer 事实见 [`metadata/version-history.json`](../metadata/version-history.json)。原文保留用于审计。

Date: 2026-06-08

Baseline: clean Metaflow `HEAD` / `origin/main` before the SuperSplat v1.26.2 sync.

Current: the synced viewer working tree after the Dayun tiled voxel hotfix.

This audit is intentionally descriptive. Do not restore these areas directly without an explicit user decision.

## Hotfix State

| Area | Current decision | Notes |
| --- | --- | --- |
| Dayun loading background | Fixed in current hotfix | Scene `background.gradient` is stored during camera setup and applied to root CSS only after the first rendered frame. |
| Dayun tiled voxel axis | Fixed in current hotfix | Tiled voxels no longer force `flipXY`; the query convention remains `updateForQueryPosition(-p.x, p.z)`. |
| Dayun legacy single voxel | Removed in current hotfix | `walk.voxel.json` and `walk.voxel.bin` are removed; Dayun index exposes only `files.voxelManifest`. |

## Difference Matrix

| Module | Baseline behavior | Current behavior | Source / reason | Risk | Suggested next action |
| --- | --- | --- | --- | --- | --- |
| Theme color | Metaflow cyan accent: `$clr-accent: #42d2f6`, `$clr-grip: #50c2ff`. Loading shimmer and active controls followed the cyan palette. | Accent was changed to orange: `$clr-accent: #F60`, `$clr-grip: #FFAF50`; loading bar and UI highlights now read as SuperSplat orange. | Upstream visual sync and partial rebrand replacement. | High visual regression for Metaflow brand. | Restore Metaflow cyan tokens and audit every hard-coded `#F60` in UI/loading after user confirmation. |
| Branding / logo | Fixed `#logoWrap` / `#logoContainer` with expandable `#logoIcon` + `#logoWord`; desktop hover and mobile tap expanded the wordmark. | Replaced by `#viewerBranding`, hidden until routed resource metadata wires a permalink; styling is smaller and embed-link oriented. | Upstream embed branding structure. | High, because the original logo interaction and brand presence changed. | Restore old expandable logo behavior or adapt it onto `viewerBranding`; decide whether route permalink behavior should remain. |
| Root / canvas background | Baseline CSS used `--app-background: #000` and `--canvas-background: transparent`; poster and first-frame timing hid the scene background during loading. | Current CSS defaults `--canvas-background: #000`; before this hotfix, scene gradient was written during camera setup and could show behind loading. | New gradient background support plus timing mismatch. | High for Dayun loading, now hotfixed; remaining risk is timing across other routes. | Keep hotfix. Later decide whether to restore transparent canvas default globally. |
| Loading UI | Baseline loading used cyan shimmer and poster blur hidden on `firstFrame`. | Current loading uses orange bar, localized loading stages, and poster hide is tied to `loaded:changed`. | Upstream sync plus new localization work. | Medium: color/brand and timing changed, but Chinese stages are needed. | Keep Chinese stage coverage; restore Metaflow colors and review `firstFrame` vs `loaded` poster timing after visual QA. |
| XR / VR navigation | Baseline created `XrControllers` and custom `XrVrNavigation`; it preserved XR near/far clip constants, AR DOM overlay setup, optional AR plane/anchor features, and XR error logging. | Current uses PlayCanvas `XrNavigation`; it gates XR setup to WebGL, removes custom navigation and several comments, and adds canvas reparenting after XR exit. | Upstream PlayCanvas/XR architecture sync. | High functional risk for VR locomotion and headset behavior. | Restore custom `XrVrNavigation`, XR clip constants, AR overlay/options, and error logging; keep WebGPU-to-WebGL gating and canvas restore if compatible. |
| Mobile annotation navigator | Baseline annotation nav hid or faded when modal/walk-hint overlays were open and listened to `uiModal` / `walkHint` changes. | Current nav only checks `state.loaded`, keeps desktop/touch classes, but no longer suppresses itself under top overlays. | Simplification during UI merge. | High for mobile marker UX, especially overlapping controls. | Restore overlay-aware hide/fade logic and retest mobile annotation navigation. |
| Annotation / hotspot scripts | Baseline annotation code was closer to SuperSplat plus Metaflow UI protections. | Current fires explicit `annotation.activate` / `annotation.deactivate` / `annotation.hover` events and drives nav from those events. | Needed for new navigator and camera behavior. | Medium: useful event plumbing, but UI regressions can ride on it. | Preserve event plumbing; restore missing UI protections around it. |
| Input controller | Baseline `input-controller.ts` contained most desktop/touch/gamepad handling in one file, including older walk/fly mode handling. | Current imports a new `src/input/*` architecture and much of the old controller was deleted or moved. | Upstream v1.26.2 input architecture. | High: broad behavior surface, hard to reason from diff alone. | Build a mode-by-mode checklist before restoring anything: orbit, fly, walk, keyboard, gamepad, touch tap, touch joystick. |
| Walk cursor / nav cursor | Baseline had `walk-cursor.ts`. | Current deletes `walk-cursor.ts` and adds `nav-cursor.ts`, collision overlays, and mesh/voxel debug overlays. | Latest collision/navigation architecture plus tiled voxel support. | Medium: new behavior is needed for tiled collision, but old cursor affordances may be lost. | Keep new collision plumbing; compare old walk cursor affordance visually before deciding restoration. |
| Camera manager | Baseline camera manager was smaller and used older walk/fly control assumptions. | Current camera manager integrates collision-aware walk/fly state, annotation activation, spawn/search helpers, and new camera utility files. | Required for collision architecture and upstream camera changes. | Medium-high, because walk/fly behavior is user-facing. | Keep current for Dayun hotfix; audit route-by-route camera defaults and annotation jumps before changing. |
| Picker | Baseline picker was substantially smaller. | Current picker expanded for point/cloud picking and navigation target support. | Upstream sync and walk/fly target navigation. | Medium: likely needed by new input flow, but could alter marker picking. | Preserve for now; test annotation click/tap hit targets on desktop and mobile. |
| Settings / schema / index | Baseline only had single voxel fields and older route/index assumptions. | Current adds `voxelManifest` / `voxelManifestUrl`, version history metadata, locales, validation helpers, and tiled index generation. | Required by Dayun tiled voxel and Chinese loading work. | Low for restoration; these are intentional capabilities. | Keep. Only adjust Dayun legacy voxel removal and test coverage. |
| Comments and local documentation | Baseline had more explanatory comments in XR, logo/mobile UI, and interaction code. | Several comments were removed or replaced during upstream merge; some new comments were added around collision/debug. | Manual merge and upstream sync. | Medium for maintainability, low runtime risk. | Restore comments where they explain Metaflow-specific behavior, especially XR, mobile annotations, and Dayun coordinate conventions. |
| Build / dependencies | Baseline package/rollup shape was older. | Current package/rollup/dependencies moved toward SuperSplat v1.26.2 / PlayCanvas 2.19.2 and adds locale/settings modules. | Upstream sync. | Low-medium: necessary for new viewer, but may affect deploy/build size. | Keep unless build or runtime regressions appear. |

## Confirmation Needed Before Restoration

For each row above, choose one of these actions before implementation:

- Restore baseline behavior exactly.
- Keep current synced behavior.
- Merge both: keep the new upstream architecture while restoring the Metaflow-specific UI/UX surface.

Recommended first restoration batch after the Dayun hotfix is:

1. Theme color and loading bar palette.
2. Expandable Metaflow logo / branding.
3. Mobile annotation navigator overlay suppression.
4. XR custom navigation and comments.
