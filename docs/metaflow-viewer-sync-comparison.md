# Metaflow Viewer Sync Comparison

> **历史比较材料。** 本文记录 2026-06-08 的来源路径、差异规模和待采纳判断，包含当时机器的绝对路径，不是当前操作说明。当前同步流程见 [上游同步](maintenance/upstream-sync.md)，当前资源加载边界见 [资源加载链路](concepts/resource-loading.md)。原文不改写，以保留当时证据。

Date: 2026-06-08

## Sources

- Metaflow baseline: `/Volumes/Prism/Metaflow/metaflow-viewer`
- Latest upstream: SuperSplat Viewer `v1.26.2`, commit `f1327060f0a17c342de518712aabf7f30f2747c5`
- Tiled voxel reference: `/Volumes/Prism_初号機/supersplat-viewer-tiled-voxel-20260528/viewer`
- Dayun tiled voxel data: `/Volumes/Prism_初号機/3D高斯/250917 其域 大运/derived_lodply_tiled_base_v2.4.0_lod1_r0.08_a0.20_tile64_o8`

## Diff Scale

- Metaflow `src` vs upstream `v1.26.2` `src`: 73 files changed, 9760 insertions, 5159 deletions.
- Upstream `v1.26.2` `src` vs tiled voxel reference `src`: 71 files changed, 2842 insertions, 7560 deletions.
- Metaflow `src` vs tiled voxel reference `src`: 47 files changed, 3746 insertions, 3863 deletions.

## Metaflow Features To Preserve

- `/data/index.json` route and alias lookup, including JSONC settings parsing and relative `/data/...` URL resolution.
- Metaflow branding, favicon, Open Graph metadata, and Chinese UI/loading text.
- Version history metadata from `metadata/version-history.json` and generated `/data/version-history.json`.
- Resource selection rules: LOD manifest selection, `viewer.defaultCameraMode`, `viewer.syntheticAnimation`, environment gsplat, and voxel fallback.
- Existing animation behavior: ACG synthetic figure-eight policy and first animation exit to orbit for character routes.
- Loading diagnostics: structured loading stages, Chinese status labels, conflict reporting, indeterminate progress for cached or post-processing phases.
- Existing walk/fly/mobile controls and old single `walk.voxel.json` collision fallback.

## Upstream `v1.26.2` Features To Adopt

- Programmatic PlayCanvas `App`/graphics device initialization with WebGPU request and WebGL fallback.
- Latest collision abstraction: `Collision`, mesh collision, voxel collision, spawn search, nav cursor, mesh/voxel overlays.
- Refactored input modules, pointer lock, target navigation, gamepad/keyboard/touch/trackpad handling.
- Latest renderer controls: performance mode, splat budget override, full-load mode, heatmap/debug modes, post effects and high precision rendering flags.
- Localization infrastructure and `dist/settings.js` export.

## Tiled Voxel Features To Adopt

- `voxelManifest` URL/config path for tiled collision manifests.
- Dynamic 3x3 tile activation around the current query position, unloading far tiles.
- Active-tile voxel overlay.
- `nodeStride` / `nodeWordCount` compatibility for newer tile binary layouts.
- Coordinate convention from the reference viewer: update tiled collision using `updateForQueryPosition(-p.x, p.z)`.

## Dayun Data Notes

- Manifest contains 483 tile entries with `voxelResolution=0.08`, `tileSize=64`, `overlap=8`.
- Source directory currently has 293 concrete `tiles/**/walk.voxel.json` files; implementation must copy only real JSON/BIN tile pairs and validate manifest references.
- Destination is `data/Shenzhen/250917 Dayun/tiled-voxel/`.
- `.gitattributes` already routes `data/Shenzhen/250917 Dayun/**` through Git LFS.
