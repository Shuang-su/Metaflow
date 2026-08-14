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
9. Prepare Viewer `5.19.0` package, Version History, public index/history, Ledger, research supplement, Issue, and detailed draft PR. This was the initial delivery boundary before the later formal-release authorization.

The subsequent decision-completion pass was normative and kept `5.19.0` because it had not yet been released:

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

The final worktree must be clean. The handoff must list every checkpoint SHA, the rollback SHA, resolved conflicts, remaining risks, and unverified hardware. It must not claim mobile-device or immersive-XR verification without actual hardware evidence. The initial GitHub delivery stopped at PR review; revision 2 records the first formal-release attempt and revision 3 governs its controlled recovery.

## 7. Formal release revision 2

The user explicitly authorized the full formal release on 2026-08-14. This is an explicit audit-mode release because the task changes production and requires immutable merge, tag, deploy, smoke, rollback, observation, and closure evidence. The retained fields are authorized user requests, the effective plan, actual actions, validations, external effects, failures, rollback targets, and final links. System/developer instructions, hidden reasoning, credentials, token values, and the build-hook URL are excluded. The owner is Shuang-su; `scripts/mcl.mjs check --strict` is the validation mechanism; closure requires the controlled deploy, immediate smoke, 15-minute observation, final packet, and Issue closure.

1. Recheck the official latest stable, exact PR HEAD/base, `origin/main`, unresolved review threads, merge policy, and production release controls. Stop on drift.
2. Run the exact PR HEAD through the clean Viewer, package, security, source-map, reference, data, platform, governance, and browser preflight. Record the absence of independent review and retain the hardware limitations.
3. Squash merge PR #41 with the approved title. Re-read the merged PR, real squash SHA, `origin/main`, deleted head branch, and open Issue. The resulting product SHA is `26e311c010aea4a6202521453a034d5aef3cea54`.
4. From that SHA, use a fresh isolated sparse worktree. Commit `chore(release): align Viewer 5.19.0 merge record` to align Version History, public mirrors, index release, E2E fixture, README navigation, and Ledger to the real product SHA; remove non-main branch refs from the machine/Ledger ancestry while preserving them in historical delivery evidence.
5. Commit `chore(release): prepare Viewer 5.19.0 production` to add this formal Proposal, consistent Spec/Plan/Evidence front matter, the Completion sources, generated Dossier/Manifest, and the step-4 release maintenance ref. The commit containing this complete packet is the immutable Tag target; it must not self-reference a fabricated SHA.
6. Validate strict MCL, Version History/Ledger ancestry, Viewer tests/build/audit/package, data/platform/reference, repository hygiene, and that `origin/main` has not advanced. Fast-forward the two record commits together to `main` only after all checks pass.
7. Create the annotated `viewer-v5.19.0` Tag at the complete release-packet commit and never move it. Dispatch `.github/workflows/release.yml` from that `main`, with the MF-30 change directory and production promotion enabled.
8. Wait for prepare and production jobs. Require the Netlify ready deploy to have `commit_ref` equal to the Tag target and become the published deploy before accepting workflow smoke or GitHub Release creation.
9. On the immutable deploy URL and production domain, verify version metadata, representative legacy/streaming/tiled routes, WebGPU/WebGL, desktop/mobile viewport, capture, Annotation, heatmap fallback, preference migration, and on-demand rendering. Do not inject destructive production faults.
10. Observe for 15 minutes, then re-read the published deploy, version metadata, Cyrene and Xunyangpai first frames, console/network health, workflow artifacts, and GitHub Release.
11. If observation passes, create `docs(release): close MF-30 Viewer 5.19.0 delivery`, mark the Task and Change complete, regenerate/strict-check the packet, fast-forward it to `main`, update Release/PR/Issue, close Issue #30, and read back every remote surface.

Stop before Tag if validation or ancestry fails. If deployment publishes and smoke/observation fails, invoke the repository rollback workflow for deploy `6a7a18b49094c6c76eff2482`, verify production recovery, keep MF-30 open, and append the failure evidence. If product code must change after Tag, open a separate `5.19.1` fix; never move `viewer-v5.19.0`.

## 8. Controlled release recovery revision 3

The immutable `viewer-v5.19.0` release attempt failed before deployment, so it is historical evidence rather than a production release. The user explicitly selected Viewer `5.19.1` instead of `5.20.0`: PR #41 already delivered the backwards-compatible Viewer capabilities, while this revision repairs release validation and the production trigger boundary only. Production therefore moves directly from `5.18.1` to `5.19.1` if and only if this recovery completes.

The fixed identities are:

- runtime product `S = 26e311c010aea4a6202521453a034d5aef3cea54`;
- merge record `R = 18a164d64f5415f3dba9eed354192dd99f81bbec`;
- failed release packet `D = f1986097f81cf15db95d33fa76c090b2066d4bd1`;
- immutable `viewer-v5.19.0` tag object `c9a19ea438e604333af2d3158bebea7d16f1a33e`, peeled to `D`;
- failed workflow [31779246997](https://github.com/Shuang-su/Metaflow/actions/runs/31779246997), whose prepare job stopped at Viewer `81/85` and skipped production;
- recovery PR [#45](https://github.com/Shuang-su/Metaflow/pull/45), squash commit `F = 534b01308f13732c58600cef571b5dfea14df51b`;
- production rollback deploy `6a7a18b49094c6c76eff2482` (`viewer-v5.18.1`).

Revision 3 is normative for the remaining release:

1. Re-read official stable, `origin/main`, PR/Issue/Tag/Release state, the failed run, GitHub `production` Environment, secret names, Netlify production pointer, and deploy queue. Stop if upstream exceeds `v1.29.1` or Viewer/version/data contracts drift.
2. Cancel only stale non-published production deploys after exact identity checks. Do not delete deploy history or touch PR/branch Deploy Previews.
3. Repair the release sparse checkout with root `.nvmrc`, BitCity, and SZCAF15 fixtures; build before the package-consumer tests; parse `viewer-vX.Y.Z` exactly; verify package/lock, metadata/public history, index version, and expected product `gitRef`; require exact immutable and production index smoke; and select only a Netlify deploy matching Tag target, Tag title, and production context.
4. Gate ordinary Netlify `main` Git builds with `ignore = "test \"$BRANCH\" = \"main\""`, retain PR/feature previews, and leave the controlled build hook as the only production path. Apply the same sparse/build-order contract to the repository's on-demand Viewer job after its first run reproduces the identical four omissions.
5. Validate the recovery in a fresh exact sparse checkout. The authoritative Viewer result must be `85/85` after build, plus fmt, lint, typecheck, publint, DOMPurify `3.4.13`, and zero production vulnerabilities. A path-routed skipped Viewer job must never be presented as a pass.
6. Squash merge the Ready recovery PR with explicit user authority while disclosing that no independent reviewer completed a review. Re-read `F`, deleted remote branch, open Issue, main ancestry, and unchanged production.
7. From `F`, create a fresh isolated release-record worktree. Commit `R2 = chore(release): align Viewer 5.19.1 recovery record` to bump package/lock, append the `5.19.1` fix entry, align metadata/public/index/E2E/Ledger/current docs to `F`, and preserve `5.19.0` as a pre-deployment failure. The one-time `metaflowViewerPreferenceMigration` value remains `5.19.0`.
8. Commit `D2 = chore(release): prepare Viewer 5.19.1 production` to update this revision, keep T02 partial, add the failure/recovery evidence, register only real main-ancestor maintenance refs, and regenerate the strict Completion Dossier. D2 must not self-reference.
9. Before pushing R2+D2, require complete release validation, unchanged `origin/main=F`, an unchanged `5.18.1` production pointer, and a clear non-publishing outcome for ordinary main Git integration. Push the two record commits by one fast-forward only; no executable workflow, runtime, route, schema, or payload change may be added.
10. Create immutable annotated Tag `viewer-v5.19.1` at D2. Its annotation distinguishes S, F, R2, D2, the failed 5.19.0 attempt, Issue #30, PR #41, and PR #45. Read back both tag object and peeled target; never move or rebuild it.
11. Dispatch `.github/workflows/release.yml` from D2 on `main` with the MF-30 directory, `viewer-v5.19.1`, and production promotion. Prepare must prove Tag/D2 identity, all `5.19.1` version surfaces, strict dossier, platform, exact sparse Viewer `85/85`, build/tooling/security gates, and immutable Git evidence.
12. Require the production job to use the existing main-only Environment and controlled hook, find a ready production deploy whose `commit_ref=D2`, publish that exact deploy, and observe both immutable and production `/data/index.json` as Viewer `5.19.1`, upstream `1.29.1`, `gitRef=F`. GitHub Release creation may occur only after workflow HTTP smoke succeeds.
13. Run clean-browser immediate smoke on both URLs for Cyrene, Xunyangpai, Dayun, Bijiashan, C2-Lib, BitCity, SZCAF canonical/alias, and a dual-source resource still selecting SOG. Cover legacy/streaming, environment, first frame/reveal, WebGPU/WebGL, desktop/`360×732`, SH `1/0.2`, capture, Annotation, heatmap fallback, on-demand frames, unchanged routes, and migration marker `5.19.0`. Do not inject destructive production faults.
14. Observe for 15 minutes, then re-read the production pointer/index, Cyrene and Xunyangpai first frames, console/network health, workflow, artifacts, Release, and immutable URL. Physical iOS/Android and immersive XR remain explicitly unverified.
15. If observation passes, create `E2 = docs(release): close MF-30 Viewer 5.19.1 delivery`. Mark Plan/Closure/T02 complete, record every real SHA/Tag/workflow/deploy/smoke/observation/rollback fact, regenerate strict artifacts, push E2, update Release notes and both merged PRs, update and close Issue #30 as Completed, then re-read every external surface.
16. Only after Issue closure, remove the approved completed worktrees after clean/process checks while retaining local branch refs and all historical evidence.

The `5.19.0` and `5.19.1` Tags are immutable. A transient external failure with unchanged code and Tag may retry the same Tag; any tracked workflow, version, Viewer, or deployment-code correction after the `5.19.1` Tag requires `5.19.2`. If a new deploy is published and smoke/observation fails, immediately run the rollback workflow for deploy `6a7a18b49094c6c76eff2482`, verify production recovery, keep MF-30 open, and append the failure. Stop before Tag on version/gitRef drift, production movement, unverified main gating, failed exact-sparse `85/85`, unresolved production vulnerability, reference/data/platform failure, or any need to change Viewer runtime, routes, schema, or resource payload. LICENSE, Editor, Transform, SPZ/KHR product scope, and streaming/highest-quality switching remain excluded.
