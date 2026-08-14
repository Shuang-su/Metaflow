# MF-30 Viewer v1.29.1 follow-up delivery

## 1. Delivery state

- Change: `MF-30` / [Issue #30](https://github.com/Shuang-su/Metaflow/issues/30), **Open / In Review**.
- Draft PR: [#41](https://github.com/Shuang-su/Metaflow/pull/41), **Open Draft**.
- Branch: `codex/viewer-upstream-v1.29.1`.
- Candidate: Metaflow Viewer `5.19.0` on SuperSplat Viewer `v1.29.1` / PlayCanvas `2.21.3`.
- Final product/package checkpoint: `72bd20118708daf72b9c0e0130cd1267b4a0d62c`.
- Release-record reconciliation checkpoint: `3a7118803766d82fda98d34475d6e8f0a9c3e492`.
- Production: Viewer `5.18.1` on implementation base `dbbd0015a8d13d4380d100fad4e5121dc2b29746`.
- Release state: no merge, Ready transition, tag, GitHub Release, deployment, production smoke, observation, or Issue closure occurred.

The candidate version remains `5.19.0`; the follow-up decisions were made before release and do not create `5.19.1`. `metadata/version-history.json`, its public mirror, `data/index.json.release`, the E2E fixture, README, and Viewer Ledger point the candidate at the final product/package checkpoint `72bd201`. A later squash merge creates a different SHA and requires another release-record reconciliation before any tag or deployment claim.

## 2. What changed after the first delivery checkpoint

The earlier delivery at `af63b512` correctly implemented the core v1.29.1 port, but the follow-up audit found local defaults or omitted upstream engineering capabilities that required explicit decisions. The final outcomes are:

| Area | Final outcome | Authority |
|---|---|---|
| streamed SH | upstream `performance=1°`, `quality=0.2°`; old `4°/2°` remains historical evidence only | `explicit-user` |
| preference lifecycle | one-time `5.19.0` cleanup of performance/Gaming Controls/retina; initialization reads only; later user state changes persist | `explicit-user` |
| language | `Config.lang`, with bundled `?lang=` source, programmatic config, navigator fallback, then English | `explicit-user` / `upstream-default` |
| Debug Engine | `ENGINE=debug npm run build`; production resolver remains default | `upstream-default` |
| parser identity | selected entry basename/extension decides parser; structure validates only; `meta.json` is loose SOG metadata | `explicit-user` |
| retry | four total subject/environment prefetch attempts and `500/1000/2000ms`; permanent 4xx stops once | `explicit-user` |
| CSS source map | composed production map, one relative annotation, no local absolute paths | `explicit-user` |
| production advisory | transitive DOMPurify patched exactly to `3.4.13`; production audit zero | security correctness |
| package side effects | `sideEffects:false` after Node, Rollup, and packed-tarball Webpack agreement | `explicit-user` |
| current source default | all 87 `files.model` values remain; future dual-source assets may default streaming and expose highest-quality SOG through a separate data-label Change | `explicit-user` |

The 23-row source/authority audit is in [`conflicts.md`](conflicts.md). No final authority remains `agent-implementation`.

## 3. Atomic commit manifest

### Reference and three-way review ancestry

| Commit | Purpose | Product effect |
|---|---|---|
| `1c947e5f` | Consolidate historical baselines and reference governance. | None. |
| `c343d4a4` | Add exact Viewer/Editor/Transform upstream snapshots. | None. |
| `c1cbe3f0` | Record stable candidates discovered by the stop/recheck gate. | None. |
| `606fdb29` | Record independent three-way reviews and evidence. | None. |
| `ac23d495` | Merge the baseline-review history into this isolated branch. | None. |
| `a1034123` | Add the immutable Viewer v1.29.1 snapshot and initial MF-30 artifacts. | No active Viewer behavior. |

### Viewer implementation and review history

| Commit | Purpose | Review / rollback meaning |
|---|---|---|
| `3f7baa0c` | Lock route/loading/settings/camera/input/collision/Analytics/locale/debug contracts. | Pre-dependency compatibility baseline. |
| `04051b55` | Upgrade PlayCanvas to `2.21.3` and align the v1.29.1 toolchain. | Dependency/API checkpoint. |
| `1a86d23b` | Isolate mechanical formatting. | Last point before rendering behavior. |
| `0d67ac5e` | Port on-demand rendering, near clip, LOD/work-buffer timing, and settings compatibility. | Core rendering/loading checkpoint. |
| `773468ac` | Port capture, Annotation preference, heatmap behavior, and XR detection. | Public-capability checkpoint. |
| `332ad44d` | Add the historical three-attempt retry/error UI policy. | Superseded only in parameters by `0c1a2f6a`; remains factual history. |
| `874149f4` | Record the first route/browser/negative evidence. | Evidence checkpoint. |
| `cb4a3f16` | Adopt final SH `1°/0.2°`. | Explicit SH decision checkpoint. |
| `b30a15eb` | Prepare the initial 5.19.0 release-review records. | Release support. |
| `af63b512` | Record the first MF-30 delivery checkpoint. | Start of this follow-up. |
| `4f20ac2c` | Adopt the v1.29.1 preference lifecycle. | Preference checkpoint. |
| `f5075412` | Expose configured locale selection. | Public config checkpoint. |
| `8d115d51` | Add opt-in PlayCanvas Debug Engine. | Diagnostic build checkpoint. |
| `d41a28ce` | Align source identity with Engine parsers and validate LOD manifests. | Parser/data-contract checkpoint. |
| `0c1a2f6a` | Extend to four total bounded attempts. | Final reliability policy. |
| `cc0e106c` | Publish composed CSS source maps. | Build/debug artifact checkpoint. |
| `bc1f4a9f` | Patch transitive DOMPurify to `3.4.13`. | Production security checkpoint. |
| `72bd2011` | Declare package exports side-effect-free after double-bundler evidence. | Final product/package checkpoint for `5.19.0`. |
| `fda17f50` | Close decision audit and update the active resource-loading documentation. | Review/documentation checkpoint. |
| `3a711880` | Reconcile the 5.19.0 machine surfaces and Ledger to `72bd2011`. | Release-support checkpoint registered by this delivery record. |

This delivery commit records `3a711880` in `maintenanceCommits`; it does not move the product/package reference away from `72bd201`.

## 4. Resource and source-default outcome

The selected entry determines the Engine parser:

| Entry | Internal source | Public loading mode |
|---|---|---|
| exact `lod-meta.json` basename | `streaming-lod` | `streaming-json` |
| `.sog` | `sog-bundle` | `legacy-sog` |
| other `.json`, including `meta.json` | `sog-meta` | `legacy-sog` |
| `.ply` | `ply` | `legacy-sog` |
| other | unsupported | no load |

Current resource facts remained stable: 87 routes, 9 streaming, 78 SOG, 44 SOG + environment, 34 SOG-only. Six Firefly resources continue to select SOG despite an available unselected streaming candidate. The generator produced the same route/model digest before and after the parser correction: `63a9a6a752acfe9539e944c0a6084d7a11fc999b2502e4f089c8d98863f3007d`.

No source-label schema, switch UI, URL flag, runtime hot swap, or resource payload change was added. Future switching must define resource release, camera/animation continuity, environment/settings/Annotation/collision continuity, first-frame fallback, memory peak, mobile behavior, and persistence before it becomes a product contract.

## 5. Static, build, dependency, and package validation

The repository Node contract remained `20.19.0`.

| Check | Result | Qualification |
|---|---|---|
| clean dependency install | `npm ci` passed | No `npm audit fix` was used. |
| production dependency tree | `npm ls --omit=dev --all` passed | PostHog remains `1.386.8`. |
| format / lint / typecheck / publint | passed | `sideEffects` suggestion is resolved by executable evidence. |
| production build | passed | Final bundle values are recorded below. |
| `ENGINE=debug npm run build` | passed | Debug bundle is opt-in and not a deployment default. |
| DOMPurify | exact `3.4.13` | Lockfile-only transitive patch. |
| production audit | 0 vulnerabilities | Full development audit separately reports 4 high findings. |
| production CSS map | passed | source-map v3, one relative reference, included in pack, no local absolute path. |
| package consumers | passed | Node import purity, Rollup, and packed-tarball Webpack `5.109.2` / CLI `7.2.2`. |
| package | 25 files; `3,109,721 B` packed / `16,272,580 B` unpacked | Includes CSS and JavaScript maps. |

The final default bundle was:

| Output | Raw / gzip |
|---|---:|
| `public/index.js` | `3,130,946 / 682,864 B` |
| `public/index.css` | `21,980 / 4,055 B` |
| `public/index.css.map` | `30,993 / 6,246 B` (debug artifact, excluded from runtime-growth comparison) |
| `dist/index.js` | `3,510,686 / 715,215 B` |
| `dist/settings.js` | `15,022 / 3,283 B` |

Runtime artifacts grew by less than 1% relative to the decision-completion baseline, below the 10% stop gate. Debug Engine output is intentionally larger and is not the production artifact.

The gzip figures use Node `zlib.gzipSync` consistently for the before/after comparison. The packed-tarball figures come from the final `npm pack --json` result and therefore supersede the earlier pre-delivery package measurement.

## 6. Tests and repository governance

The complete disposable fixture contains current Viewer source, the Editor/reference inputs, and the full 87-resource data checkout.

| Test / check | Result |
|---|---|
| all product/resource/package tests except the self-referential release-governance test | `77/77`, exit 0 |
| package-side-effects tests after restoring the fixture-only dependency symlink | passed |
| parser/manifest tests after restoring the same fixture link | passed |
| version/Ledger/MCL targeted tests before this delivery record | `17/17`, exit 0 |
| final complete `npm test` after `3a711880` is registered by this delivery record | **`85/85`, 0 failed, exit 0; 6.129 s** |

An earlier fixture run omitted Editor/reference inputs; it was invalid and is not counted. A later full run at `3a711880` returned 77/80 because fixture refresh had removed its temporary `node_modules` symlink (two module-resolution failures) and because release-governance correctly required a successor commit to register `3a711880` (one expected sequencing failure). Restoring the fixture-only dependency link made the 77 non-version tests pass without a source change. After this delivery record registered `3a711880`, the complete fixture passed all 85 tests; none of the intermediate fixture failures required a product-source change.

Final repository governance passed all of the following:

- local validation of all 12 registered snapshots and online identity verification of all 11 pure-upstream snapshots; the one `metaflow-history` snapshot remained correctly limited to local-content validation;
- reference-registry and CI-routing tests `22/22`, CI route selection against `origin/main`, and CI-routing configuration validation;
- data validation, full file-existence validation against the disposable 87-resource checkout, direct platform validation, and combined platform/data fixtures `8/8`;
- Version History/Ledger/MCL targeted tests `17/17`, MCL `check-all`, 101-file Markdown-link validation, and a 12,749-file repository hygiene/secret scan;
- `git diff --check` with no whitespace error.

## 7. Real-browser acceptance

The decision-completion browser run used the final product/package checkpoint `72bd2011`:

- Cyrene completed legacy SOG + environment, partial settings v2, reveal, synthetic animation, single voxel, capture, Annotation persistence, actual WebGPU, WebGL, and `360×732` mobile viewport. The mobile session set migration marker `5.19.0` while leaving inferred `performanceMode` absent from localStorage.
- Xunyangpai completed on actual WebGPU and WebGL with streaming, environment, collision, Fly, on-demand rendering, and final SH values `1/0.2`.
- Dayun completed on actual WebGPU with 293 tiled voxel entries, a 3×3 active neighborhood, `metaflow-rz180`, and collision.
- Bijiashan completed with 320 tiles. Deliberately missing tiles disabled Walk only in the affected area, left the main subject loaded, and recovered after returning to valid tiles.
- C2-Lib first input changed Anim to Orbit while preserving animation time.
- BitCity Xielian, SZCAF Yunuo, and the Akari alias completed using their unchanged selected SOG entries.
- WebGL heatmap emitted one controlled warning with no overlay; actual WebGPU heatmap/collision completed with no new warning/error.
- XR API/detection and non-XR regression passed; the host reported immersive AR/VR unavailable.

No checked route changed `files.model`, stayed in loading, rendered blank/black, lost collision coordinates, or emitted an error-beacon storm. Mobile viewport is not a physical iOS/Android claim. No XR headset/controller/hand input was available.

## 8. Remote delivery and readback

The branch was pushed from `af63b512` to `3a711880` using HTTP/1.1 after an initial GitHub empty-response failure. `git ls-remote` then returned the exact remote branch SHA `3a7118803766d82fda98d34475d6e8f0a9c3e492`.

Issue/PR body delivery used REST PATCH with only the `body` field, preserving state and Draft status. Initial API attempts encountered TLS handshake timeouts; retrying with HTTP/2 disabled succeeded. Readback on 2026-08-14 established:

| Object | Remote state | Readback |
|---|---|---|
| Issue #30 | Open; labels `component/viewer`, `type/upstream-sync`, `risk/T3` | body updated `2026-08-14T02:51:36Z`; content matches the local payload aside from the reader adding one trailing newline |
| Draft PR #41 | Open Draft; base `dbbd0015`; head `3a711880` | body updated `2026-08-14T02:52:30Z`; content matches the local payload aside from the reader adding one trailing newline |

The push response also displayed GitHub's aggregate default-branch Dependabot banner. It is not treated as the Viewer production dependency audit; that scoped audit is independently zero. Transport errors were not counted as successful writes until REST/readback confirmed the state.

The finalized delivery commit is pushed only after the `85/85` and governance results above are recorded. Issue #30 and Draft PR #41 are then refreshed to that final branch head and read back once more. The exact post-push SHA and readback timestamps live on those remote objects and in the final Codex handoff rather than as an impossible self-reference inside this commit. The PR remains Draft and the Issue remains Open.

## 9. Known limitations and rollback

- The smaller SH thresholds may schedule more work during small camera movements; fixed-camera timing was exploratory, not a benchmark.
- Top-level retry has no new per-request timeout and does not process `Retry-After`.
- Physical iOS Safari and Android Chrome are unverified.
- XR headset, controller, hand input, and immersive rendering are unverified.
- Merge/squash SHA, tag, deployment, CDN smoke, production telemetry, and observation are unverified and unauthorized.

Rollback points:

1. follow-up start: `af63b512030704820ee163632c484c3b754f50a0`;
2. final product/package checkpoint: `72bd20118708daf72b9c0e0130cd1267b4a0d62c`;
3. before final SH decision: `874149f4`;
4. before rendering behavior: `1a86d23b`;
5. full implementation/production baseline: `dbbd0015a8d13d4380d100fad4e5121dc2b29746`.

Rolling back product code must not delete immutable references or historical review evidence.

## 10. Research and completion boundary

- [`spec.md`](spec.md)
- [`plan.md`](plan.md)
- [`conflicts.md`](conflicts.md)
- [`research-supplement.md`](research-supplement.md)
- [`evidence.md`](evidence.md)
- [three-way Viewer review](../../history/upstream-reviews/2026-08-10/viewer-v1.26.2-to-v1.28.0.md)
- deep research task (streamed SOG, parser, LOD, voxel/collision, and resource lifecycle): `codex://threads/019ff933-fc9b-7063-9f4e-dc5cbee87df2`

The deep research keeps offline conversion, streamed SOG/LOD, Engine parser behavior, Metaflow tiled-voxel runtime, collision coordinates, and future source switching as separate layers. Engine format recognition alone is not a public Metaflow format/lifecycle contract.

Completion in this branch means implementation, local verification, detailed Draft review, version/Ledger reconciliation, same-branch push, and remote readback. It explicitly does not mean released. A future authorized squash merge must be followed by a new release-record reconciliation to the actual merge SHA before tag or deployment.
