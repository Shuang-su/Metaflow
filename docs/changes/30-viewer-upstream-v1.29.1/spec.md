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

# MF-30 Viewer upstream v1.29.1 implementation Spec

## 1. Status and authority

- **Status:** Viewer runtime implementation and PR #41 squash integration are complete at product SHA `26e311c010aea4a6202521453a034d5aef3cea54`. The immutable `viewer-v5.19.0` prepare failed before deployment; recovery PR #45 merged as `534b01308f13732c58600cef571b5dfea14df51b`. Release packet D2, immutable Tag `viewer-v5.19.1`, controlled Prepare, exact-D2 CLI/API production deploy, real-browser smoke, 15-minute observation, GitHub Release, and final closure are complete.
- **Component:** `viewer`.
- **Risk:** T3 upstream synchronization.
- **Discovery record:** [Issue #30](https://github.com/Shuang-su/Metaflow/issues/30).
- **Integrated review records:** [PR #41](https://github.com/Shuang-su/Metaflow/pull/41), squash merged 2026-08-14 as the Viewer product; and recovery [PR #45](https://github.com/Shuang-su/Metaflow/pull/45), squash merged the same day as the release-control fix. No independent reviewer completed a review; the user's explicit authorization is the merge/release authority.
- **Decision evidence:** [`viewer-v1.26.2-to-v1.28.0.md`](../../history/upstream-reviews/2026-08-10/viewer-v1.26.2-to-v1.28.0.md).
- **Implementation target:** SuperSplat Viewer tag `v1.29.1`, commit `3a61fa606e12640b1e87f9a733ed43d7fbc5d925`, tree `671059c4b4a3693115ad010207b66312f5cbbc8c`.
- **Implementation base:** `origin/main` commit `dbbd0015a8d13d4380d100fad4e5121dc2b29746`, Metaflow Viewer `5.18.1`.
- **Research supplement:** [`research-supplement.md`](research-supplement.md), distilled from `codex://threads/019ff933-fc9b-7063-9f4e-dc5cbee87df2` and rechecked against official releases, diffs, issues, and PRs.

Issue #30 began as an Open discovery-only record. The 2026-08-13 follow-up authorized implementation, decision completion, branch delivery, and PR review. On 2026-08-14 the user explicitly authorized squash merge and the complete formal release flow. PR #41 produced product SHA `26e311c`; release-record commits aligned machine/public records to that real SHA. The `viewer-v5.19.0` Tag was created, but its controlled prepare failed at `81/85` because the release fixture omitted `.nvmrc`, BitCity, and SZCAF15 inputs and ran package consumers before build; production never left `5.18.1`. The user selected PATCH `5.19.1`, recovery PR #45, and a new Tag only after deterministic recovery validation. Controlled run `31795886847` then passed Prepare at D2; because Netlify Git builds again stalled, the user authorized a clean exact-D2 CLI fallback. Deploy `6a7efc396f36c800cfa0702e`, immediate smoke, and the 15-minute observation passed, so Viewer `5.19.1` is now the production-stable version.

## 2. Objective

The active source in `metaflow-viewer/` must adopt the applicable rendering, streaming, capture, annotation, heatmap, XR detection, engine, and build-chain behavior of upstream `v1.29.1` without replacing the active tree with an upstream snapshot. Every listed Metaflow behavior remains supported unless this Spec explicitly classifies it otherwise.

The immutable source snapshot is `references/supersplat-viewer-v1.29.1/`. It is evidence only and must never be installed, built, formatted, or edited in place.

## 3. Required contracts

### 3.1 Existing Metaflow behavior

| ID | Contract |
|---|---|
| MFV-01 | Stable route, index, canonical path, alias, explicit-query precedence, BitCity, and SZCAF15 behavior must remain unchanged. |
| MFV-02 | Legacy SOG and streaming LOD loading paths must continue to coexist. Environment loading must not block the main scene's first valid frame. |
| MFV-03 | Loading, sort/LOD timeout, first frame, radial reveal, low-to-high LOD reveal, synthetic animation, and canvas visibility must retain their observable order. `?noreveal` must remain available. |
| MFV-04 | Orbit, walk, fly, first user exit from synthetic animation, desktop input, mobile input, camera restoration, and timeline state must remain compatible. |
| MFV-05 | Single voxel, tiled voxel, cache behavior, missing-tile controlled degradation, collision overlay, and `metaflow-rz180` coordinate conversion must remain compatible. |
| MFV-06 | Settings v1/v2 and partial post-effect objects, including `{ enabled: false }`, must be normalized before Viewer construction or post-effect access. Existing data must not be rewritten. |
| MFV-07 | Gradient background, branding, all nine locales, Analytics, debug tools, and route-specific product UI must remain present. Analytics failures must not block loading or flood error beacons. |
| MFV-08 | Streaming SH behavior must match Viewer `v1.29.1`: `colorUpdateAngle = performanceMode ? 1 : 0.2`. The earlier local `4/2` candidate remains A/B evidence, not the final product policy. |

### 3.2 Upstream rendering and streaming behavior

| ID | Contract |
|---|---|
| MFV-09 | Loading must run with `app.autoRender = true`; after a legacy first valid frame or streaming `ready && loading === 0`, rendering must switch to on-demand. |
| MFV-10 | GSplat `frame:request`, camera matrix changes, reveal, animation, annotation, collision/debug overlay, performance changes, XR, and capture must each request a frame explicitly when dynamic output changes. The old generic four-second continuous-render fallback may be removed only after these paths are covered. |
| MFV-11 | The canvas must stay hidden while internal loading frames progress, and become visible only under the existing first-frame contract. Partial splats must not leak before readiness. |
| MFV-12 | Camera near clip must use the upstream clamp. LOD range must be written to `GSplatComponent`. Streaming `minContribution`, `alphaClip`, `antiAlias`, and debug values must be applied before work-buffer creation. |
| MFV-13 | Legacy sorter behavior, the three-second fallback, streaming status text, environment parallelism, and reveal sequencing must continue to work with on-demand rendering. |

### 3.3 New public and UI behavior

| ID | Contract |
|---|---|
| MFV-14 | `window.captureFrame(options?)` must return `Promise<{ width: number; height: number; data: string }>`; default size is `480 × 480`. Width and height normalize to positive integers; supersample clamps to `1–8`. Calls serialize. Camera state and render targets restore after success or failure. |
| MFV-15 | Capture must support `time`, `width`, `height`, and `supersample`, and be verified with WebGL, WebGPU, post effects, animation scrub, consecutive calls, and forced failure. A global TypeScript declaration is required. |
| MFV-16 | `state.showAnnotations` and a branded settings row must use the upstream `showAnnotations` localStorage key. The default is on. The row is hidden when annotations do not exist; disabling closes the active tooltip; persistence survives route changes. |
| MFV-17 | `?heatmap` remains the only public heatmap URL meaning. WebGPU may enable it; WebGL must degrade in a controlled way. No second same-name parameter or data schema is allowed. |
| MFV-18 | XR capability detection must be backend-aware as in `v1.29.1`. Metaflow teleport, smooth movement, snap vertical, branded messaging, and WebGL reload behavior remain. Without hardware, immersive XR must be marked unverified. |

### 3.4 Engine, build, security, and version boundaries

| ID | Contract |
|---|---|
| MFV-19 | PlayCanvas must be exactly `2.21.3`. Applicable Rollup, PostCSS, Sass, Autoprefixer, ESLint, Prettier, and publint versions must align with `v1.29.1` while preserving PostHog, rrweb, Playwright, Analytics injection, and multi-entry Rollup output. |
| MFV-20 | Root and Viewer Node remain `20.19.0`. API migration must use PlayCanvas 2.21.3 APIs without an implicit old-API shim. Mechanical formatting must be isolated from behavioral changes. |
| MFV-21 | `npm audit --omit=dev` must report zero production vulnerabilities. DOMPurify must resolve to exactly `3.4.13` through the existing PostHog range; PostHog must not be upgraded and DOMPurify must not become a direct dependency. No automatic `npm audit fix` is permitted. Development-only findings must be recorded separately rather than hidden through unrelated major upgrades. |
| MFV-22 | Viewer `5.19.0` identifies the merged MINOR capability set but remains an immutable pre-deployment failure. The production release is PATCH `5.19.1`, because it changes release validation and production-trigger compatibility without adding Viewer runtime capability. Package/lock, Version History, public history/index release metadata, Viewer Ledger, tests, and current-version documentation agree on `5.19.1 / upstream 1.29.1 / recovery SHA 534b013`; the runtime product remains SHA `26e311c`, release packet and Tag target are D2, and production deploy is `6a7efc396f36c800cfa0702e`. |

### 3.5 Follow-up preference, parser, and failure contracts

| ID | Contract |
|---|---|
| MFV-23 | On the first post-`5.18.1` run, `metaflowViewerPreferenceMigration=5.19.0` must clear `performanceMode`, `gamingControls`, and legacy `retinaDisplay` exactly once. The marker intentionally remains `5.19.0` under package version `5.19.1`, so users who exercised the candidate are not cleared twice. The current session then derives mobile/desktop defaults. Startup and UI redraw must not persist those defaults; only later state changes caused by user interaction may write `performanceMode` or `gamingControls`. `showAnnotations` is not cleared. |
| MFV-24 | `Config.lang?: string` is the single programmatic language input. The bundled HTML maps `?lang=` into `config.lang`; localization then resolves configured value, `navigator.languages` / `navigator.language`, and English in that order while retaining all nine locales, normalization, and base-language matching. |
| MFV-25 | `ENGINE=debug npm run build` must opt into PlayCanvas's `development` export condition. Ordinary production builds must continue to use the default export and must not expose a new UI, URL parameter, or deployment default. |
| MFV-26 | The selected entry identity decides the Engine parser: basename `lod-meta.json` is `streaming-lod`; `.sog` is `sog-bundle`; any other `.json`, including `meta.json`, is `sog-meta`; `.ply` is `ply`; everything else fails before load. Public `State.loadingMode` remains `legacy-sog | streaming-json`. JSON structure may validate an entry but must never silently select a different parser. |
| MFV-27 | Before Engine load, `lod-meta.json` must pass a bounded manifest contract covering positive `lodLevels`, nonempty filenames, finite root bounds, a nonempty recursive tree, at least one leaf, valid LOD file indices, and nonnegative byte spans. Invalid manifests set `loadingConflict=true` and terminate as manifest-invalid rather than guessing another format. |
| MFV-28 | Initial subject and environment prefetches retry only network errors and HTTP `408/425/429/5xx`, for four total attempts with `500/1000/2000 ms` waits. Other `4xx` stop after one request. Every abandoned response body is released. Subject exhaustion enters the actionable terminal UI; environment exhaustion remains non-blocking. The policy does not apply to streaming children, voxel tiles, settings, or Analytics and does not claim a per-request timeout or `Retry-After` implementation. |
| MFV-29 | Existing `files.model` remains the sole runtime source authority: all 87 route mappings stay byte-for-byte unchanged, including six Firefly resources that have an unselected streaming candidate but currently use SOG. Future `streaming | highest-quality` choice belongs to a separate data-label contract; this Change adds no schema, switch UI, URL parameter, or runtime source swap. |

### 3.6 Build and package contracts

| ID | Contract |
|---|---|
| MFV-30 | Production SCSS must emit a valid composed source-map-v3 pair `index.css` / `index.css.map` with exactly one relative `sourceMappingURL=index.css.map`; map sources must be repository-relative and must not contain local absolute paths. The map is a debug artifact and is excluded from runtime gzip-growth comparisons. |
| MFV-31 | The npm package may declare `sideEffects: false` only while Node import purity, Rollup named/settings/bare-import behavior, and Webpack `5.109.2` + `webpack-cli 7.2.2` consumers installed from the packed tarball all retain used exports and remove only an unused bare import. |
| MFV-32 | PlayCanvas parser availability alone does not establish a Metaflow route, upload, error, lifecycle, or public-format contract. This Change does not advertise SPZ or KHR Gaussian formats and does not modify route/index/upload schemas for them. |

## 4. Evidence and acceptance

Static and automated acceptance requires clean `npm ci`, formatting check, lint, typecheck, publint, default and Debug Engine production builds, Viewer unit tests, package/pack consumers, CSS-map integrity, production audit, reference registry local and upstream identity checks, CI routing, platform validation, Markdown link checks, repository scan, and `git diff --check`. Build JS/CSS raw and gzip size must be recorded; unexplained growth above 10% is a reported conflict.

Browser evidence must distinguish static, DOM, runtime, console, network, WebGL, WebGPU, desktop viewport, and `360 × 732` mobile viewport results. It must cover Cyrene, Xunyangpai, Dayun, Bijiashan, C2-Lib, BitCity Xielian, SZCAF15 Yunuo, and the Akari alias. Negative coverage must include delayed SOG, delayed environment, missing tile, request retry, capture validation/serialization/failure, and blocked Analytics.

Mobile viewport does not equal iOS/Android hardware. XR API checks do not equal an immersive hardware session. Both limitations must remain explicit if hardware is unavailable.

## 5. Prohibited changes

- Do not replace `metaflow-viewer/` with `references/**`.
- Do not edit existing resource data, routes, aliases, settings, collision metadata, or schemas to evade a compatibility failure.
- Do not change Editor or Transform product source, version, dependency, decision, or release state.
- Do not install or build inside `references/**`.
- Do not change any current route's `files.model`, infer a runtime default from discovered files, or introduce the future source-label schema/switch in this Change.
- Do not advertise SPZ/KHR Gaussian as a Metaflow Viewer product contract.
- Do not use an unverified manual production upload, move a pushed Tag, force-push, claim a smoke/observation result before it exists, or close Issue #30 before final production evidence is recorded. Revision 4 permits only the explicitly authorized clean exact-D2 CLI/API fallback after controlled Prepare passed and Netlify Git-build infrastructure stalled; it must retain truthful `commit_ref=null` provenance and the complete source/hash chain.
- Do not claim Viewer `v1.29.1` adds voxel conversion or byte-range/page/LOD voxel streaming. Preserve Metaflow tiled voxel runtime and its coordinate compatibility layer.

## 6. Rollback and stop boundary

The code rollback target is the `metaflow-viewer/` tree at `dbbd0015a8d13d4380d100fad4e5121dc2b29746`. Immutable reference and review evidence remain even if implementation is rolled back.

Implementation must stop at the last clean checkpoint if adopting PlayCanvas 2.21.3 requires deleting an MFV-01 through MFV-08 contract, if a required scene cannot reach a valid first frame or retains incorrect collision coordinates, if existing data must change, if reference identity fails, if a new production high/critical vulnerability cannot be removed within scope, or if task changes cannot remain isolated from user work.
