# MF-30 Viewer upstream v1.29.1 implementation Spec

## 1. Status and authority

- **Status:** implementation complete; remote review and Viewer `5.19.0` release-candidate records authorized. Merge, tag, deploy, and production release remain separately controlled.
- **Component:** `viewer`.
- **Risk:** T3 upstream synchronization.
- **Discovery record:** [Issue #30](https://github.com/Shuang-su/Metaflow/issues/30).
- **Draft review:** [PR #41](https://github.com/Shuang-su/Metaflow/pull/41).
- **Decision evidence:** [`viewer-v1.26.2-to-v1.28.0.md`](../../history/upstream-reviews/2026-08-10/viewer-v1.26.2-to-v1.28.0.md).
- **Implementation target:** SuperSplat Viewer tag `v1.29.1`, commit `3a61fa606e12640b1e87f9a733ed43d7fbc5d925`, tree `671059c4b4a3693115ad010207b66312f5cbbc8c`.
- **Implementation base:** `origin/main` commit `dbbd0015a8d13d4380d100fad4e5121dc2b29746`, Metaflow Viewer `5.18.1`.
- **Research supplement:** [`research-supplement.md`](research-supplement.md), distilled from `codex://threads/019ff933-fc9b-7063-9f4e-dc5cbee87df2` and rechecked against official releases, diffs, issues, and PRs.

Issue #30 began as an Open discovery-only record. The 2026-08-13 follow-up authorizes synchronizing that Issue, pushing this implementation branch, preparing Viewer `5.19.0` version records, and opening a detailed draft PR. It does not authorize merging, tagging, deploying, publishing a GitHub Release, or closing the Issue as released. Because a squash merge produces a new commit, a later release-record commit must replace the provisional implementation ref before the release can be called stable.

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
| MFV-21 | `npm audit --omit=dev` must not introduce production high or critical vulnerabilities. No automatic `npm audit fix` is permitted. Development-only findings must be recorded rather than hidden through unrelated major upgrades. |
| MFV-22 | The PR candidate is Viewer `5.19.0`, because it adds backwards-compatible public, interaction, loader, and rendering capabilities. Package/lock, Version History, public history/index release metadata, Viewer Ledger, tests, and current-version documentation must agree on `5.19.0 / upstream 1.29.1`. This is a release candidate until merge, final-SHA reconciliation, tag, deployment, smoke, and observation are separately completed. |

## 4. Evidence and acceptance

Static and automated acceptance requires clean `npm ci`, formatting check, lint, typecheck, publint, production build, Viewer unit tests, reference registry local and upstream identity checks, CI routing, platform validation, Markdown link checks, repository scan, and `git diff --check`. Build JS/CSS raw and gzip size must be recorded; unexplained growth above 10% is a reported conflict.

Browser evidence must distinguish static, DOM, runtime, console, network, WebGL, WebGPU, desktop viewport, and `360 × 732` mobile viewport results. It must cover Cyrene, Xunyangpai, Dayun, Bijiashan, C2-Lib, BitCity Xielian, SZCAF15 Yunuo, and the Akari alias. Negative coverage must include delayed SOG, delayed environment, missing tile, request retry, capture validation/serialization/failure, and blocked Analytics.

Mobile viewport does not equal iOS/Android hardware. XR API checks do not equal an immersive hardware session. Both limitations must remain explicit if hardware is unavailable.

## 5. Prohibited changes

- Do not replace `metaflow-viewer/` with `references/**`.
- Do not edit existing resource data, routes, aliases, settings, collision metadata, or schemas to evade a compatibility failure.
- Do not change Editor or Transform product source, version, dependency, decision, or release state.
- Do not install or build inside `references/**`.
- Do not merge, tag, deploy, publish a GitHub Release, close Issue #30 as released, or claim production observation under this authorization.
- Do not claim Viewer `v1.29.1` adds voxel conversion or byte-range/page/LOD voxel streaming. Preserve Metaflow tiled voxel runtime and its coordinate compatibility layer.

## 6. Rollback and stop boundary

The code rollback target is the `metaflow-viewer/` tree at `dbbd0015a8d13d4380d100fad4e5121dc2b29746`. Immutable reference and review evidence remain even if implementation is rolled back.

Implementation must stop at the last clean checkpoint if adopting PlayCanvas 2.21.3 requires deleting an MFV-01 through MFV-08 contract, if a required scene cannot reach a valid first frame or retains incorrect collision coordinates, if existing data must change, if reference identity fails, if a new production high/critical vulnerability cannot be removed within scope, or if task changes cannot remain isolated from user work.
