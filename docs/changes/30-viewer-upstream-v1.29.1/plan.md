# MF-30 Viewer upstream v1.29.1 implementation Plan

This Plan implements [`spec.md`](spec.md). It does not introduce product or architecture decisions beyond that Spec.

## 1. Isolation and checkpoints

- Worktree: `/Volumes/Prism/Metaflow-viewer-upstream-v1.29.1`.
- Branch: `codex/viewer-upstream-v1.29.1`.
- Base: `origin/main` at `dbbd0015a8d13d4380d100fad4e5121dc2b29746`.
- Upstream candidate: `v1.29.1` at commit `3a61fa606e12640b1e87f9a733ed43d7fbc5d925` and tree `671059c4b4a3693115ad010207b66312f5cbbc8c`.
- Cache and generated evidence: `.codex-work/` only.

Checkpoint order is normative:

1. Merge the latest `origin/main` and the four baseline-review checkpoints, retaining Viewer `5.18.1`, newly released route contracts, registry, and review navigation.
2. Add and verify the immutable `v1.29.1` snapshot; update the three-way review, this Spec/Plan, and the conflict register.
3. Add pre-upgrade compatibility tests for routes, loading phases, settings, camera/input, collision, the original SH `4/2` behavior, Analytics, locale, and debug contracts.
4. Upgrade PlayCanvas and the build chain. Keep required API/type changes separate from any broad upstream formatting.
5. Port on-demand rendering, near clip, `GSplatComponent` LOD range, work-buffer parameter timing, settings normalization, and canvas readiness.
6. Port `captureFrame`, annotation visibility, heatmap semantics, and backend-aware XR detection.
7. Run route, negative, renderer, viewport, dependency, repository, and snapshot validation; finalize conflict evidence.
8. Apply the follow-up product decision to adopt Viewer `v1.29.1` SH `1/0.2`, replace the compatibility lock, and retain the earlier `4/2` A/B only as decision evidence.
9. Prepare Viewer `5.19.0` package, Version History, public index/history, Ledger, research supplement, Issue, and detailed draft PR. Merge/tag/deploy remain out of scope.

The subsequent decision-completion pass is also normative and keeps `5.19.0` because the candidate has not been released:

10. `fix(viewer): adopt v1.29.1 preference lifecycle` — one-time preference cleanup, read-only startup, and interaction-only persistence.
11. `feat(viewer): expose configured locale selection` — `Config.lang`, URL injection, programmatic configuration, and fallback tests.
12. `build(viewer): add opt-in PlayCanvas debug engine` — `ENGINE=debug` without changing the default build.
13. `fix(viewer): align source identity with engine parsers` — internal source classification, strict LOD manifest validation, Analytics classification, and zero route/model drift.
14. `fix(viewer): extend bounded resource retries` — four total attempts and `500/1000/2000 ms` backoff for the initial subject/environment prefetch only.
15. `build(viewer): publish composed CSS source maps` — valid production CSS map with no local-path disclosure.
16. `fix(deps): update DOMPurify security patch` — lockfile-only `3.4.13` resolution and zero production audit findings.
17. `build(viewer): declare side-effect-free package exports` — commit only after Rollup and packed-tarball Webpack consumers agree.
18. `docs(review): close MF-30 decision audit` — update the Spec, Plan, conflict sources, research, evidence, upstream review, and resource-loading documentation.
19. `chore(release): reconcile Viewer 5.19.0 follow-up` — point candidate version surfaces at the actual step-17 product checkpoint and register preceding Viewer work.
20. `docs(review): record MF-30 follow-up delivery` — record actual validation, remote state, commit manifest, and the step-19 release-support commit.

Each checkpoint stages only its intended files. No commit may include `.codex-work/`, `node_modules`, `dist`, generated public assets, `.DS_Store`, downloads, or unrelated user files.

## 2. Test-first compatibility lock

Before engine changes, tests must assert:

- route/index/alias/query precedence including BitCity and SZCAF15;
- legacy and streaming load phase transitions, environment parallelism, poster/canvas visibility, timeout and first-frame ordering;
- radial reveal, synthetic animation, `?noreveal`, Orbit/walk/fly, and first animation exit;
- single/tiled voxel, missing-tile degradation, cache, and `metaflow-rz180` transforms;
- settings v1/v2 normalization for partial post effects;
- the pre-upgrade compatibility checkpoint records SH `4/2`; the final release candidate explicitly adopts upstream `1/0.2` by later product authorization;
- nine-locale key parity, branding, Analytics failure isolation, and debug flags.

These tests form the `test(viewer): lock Metaflow upstream compatibility` checkpoint.

## 3. Engine and rendering port

1. Update exact package and lock versions without changing product package version.
2. Run clean install and audit. Stop on an unresolved new production high/critical finding.
3. Resolve PlayCanvas 2.21.3 type/API failures using supported APIs only.
4. Run loading with `autoRender = true`; switch to false at the specified legacy or streaming readiness boundary.
5. Wire `frame:request` and all Metaflow dynamic paths to explicit frame requests.
6. Remove the four-second fallback only after tests prove every dynamic path schedules rendering.
7. Clamp near clip, move LOD range to `GSplatComponent`, and apply streaming work-buffer parameters before creation.
8. Initially compare SH `4/2` and upstream `1/0.2`; after the explicit follow-up decision, set the product default to `1/0.2` and lock both performance modes in tests/runtime evidence.

## 4. Public capability port

1. Port capture into a queue-owning implementation with strict option normalization and `finally` restoration.
2. Declare the global API and test default, explicit, invalid, consecutive, scrubbed, post-effect, WebGL, WebGPU, and failure behavior.
3. Add `state.showAnnotations`, the upstream storage key, a branded setting row, nine locale values, tooltip closure, and no-annotation hiding.
4. Preserve the single existing `?heatmap` meaning with backend-aware fallback.
5. Replace XR capability detection with the upstream backend-aware check while retaining local navigation and UI.

## 5. Browser matrix

| Route | Assertions |
|---|---|
| `/acg/fireflyfes38/cyrene` | legacy SOG, partial settings-v2, first frame, reveal, synthetic animation, single voxel; desktop WebGL, `360 × 732`, local WebGPU |
| `/acg/j05/xunyangpai` | streaming LOD, environment, single voxel, fly, performance mode; WebGPU and WebGL fallback |
| `/shenzhen/dayun` | streaming LOD, tiled voxel, coordinates, tile switching; WebGPU |
| `/shenzhen/bijiashan` | missing-tile warning is controlled and main scene completes; WebGPU |
| `/sztu/c2-lib` | first Orbit input exits synthetic animation and restores the expected timeline state |
| `/acg/bitcity260711/xielian` | released legacy resource, first frame, synthetic animation |
| `/acg/szcaf15/yunuo` and `/acg/szcaf15/akari` | canonical/alias consistency, visible resource, camera and branded UI |

For each representative run, retain a selected screenshot and a concise DOM/console/network summary. Full temporary browser logs remain under `.codex-work/`. Run delayed SOG/environment, tile 404, retry, blocked Analytics, invalid/consecutive/failing capture, and fixed-camera SH A/B. A loading hang, black/blank scene, unbounded beacon errors, camera restoration failure, or coordinate drift is a stop condition.

## 6. Final validation

- `npm ci`, format check, lint, typecheck, publint, default production build, and `ENGINE=debug npm run build`;
- all current and new Viewer tests, including event resource contracts, using a complete read-only data/Editor/reference fixture and retaining TAP plus the shell exit code;
- `npm ls dompurify` must resolve `3.4.13`; `npm audit --omit=dev` must report zero production vulnerabilities;
- `npm pack --json`, CSS-map JSON/reference/path checks, Node import purity, Rollup consumers, and fixed Webpack `5.109.2` / `webpack-cli 7.2.2` consumers installed from the local tarball;
- exact `route → files.model` equality for all 87 resources, the expected `9 streaming / 78 SOG / 44 SOG+environment / 34 SOG-only` classification, six still-SOG Firefly dual-source candidates, and validation of all nine current `lod-meta.json` manifests;
- local and online reference identity validation;
- CI routing and platform checks selected for the changed paths;
- Markdown links, repository scan, reference digests, and `git diff --check`;
- raw/gzip JS/CSS size comparison and disk/status cleanup.

The final worktree must be clean. The handoff must list every checkpoint SHA, the rollback SHA, resolved conflicts, remaining risks, and unverified hardware. It must not claim mobile-device or immersive-XR verification without actual hardware evidence. The GitHub delivery must stop at an open draft PR and an `In Review` Issue; a final squash SHA, release tag, deployment, and production observation require later authorization.
