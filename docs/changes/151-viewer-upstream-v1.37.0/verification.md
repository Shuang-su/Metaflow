# MF-151 verification and release record

Status: local acceptance complete; final exact-head CI and production release pending. [Issue #151](https://github.com/Shuang-su/Metaflow/issues/151), [Spec](spec.md), [approved Plan](plan.md).

2026-10-18 baseline: remote main `440ec98af66aaed83207e2ce8731a85814703a7b`; primary local main `2c548d14213e096a1f967475a534d3b5d881deda` with 22 local-only commits and the unrelated untracked Swiftgram directory. Reused clean isolated worktree on `codex/mf-151-viewer-1370`; protection branch `codex/protect-main-20261018-v5220` retains local main. No source resource edits.

Production HTTP readback confirms 5.21.11 / 100 resources / schema 1.2, product `a9b4f41782c9d96cae0aa1c2c81ea8eee7d3ebe9`, build `988c8e7cbe5844af3133a38ac4a988af2601092b`. Netlify actual published deployment is `6aca09261511aa373989bac4` (ready), the initial rollback target.

The project volume has 3.3 GiB available at execution start (1.4 GiB during planning). Existing Viewer dependencies are 359 MiB and browser cache 650 MiB. Reuse those caches and frozen resource/artifact payloads; do not copy the full data set or delete unrelated work.

Evidence is kept in project-local `.codex-work/viewer-upstream-1370-20261018/`. Baseline source/artifact hashes, browser/performance results, implementation corrections, package/CI checks, final identities and production observation will be appended as completed. No hardware XR acceptance is claimed.

## Integration checkpoint (not production)

Source comparison used exact archives for v1.35.2 (`c52f5258df424635323f26aaeebe51361dc0f8e6`) and v1.37.0 (`cd0e316e397929ffa87abd4833f73f8a0bd1fd2b`). New archive SHA-256: `ef937fd43c24dbaf56941b0f51679913ab7cd348ab69b8338a6a342889dd8327`. No open upstream PR, including #328, was imported. PlayCanvas is pinned to 2.23.0; Director/Editor source and dependency graphs are untouched.

The frozen 5.21.11 deployment was rehashed before reuse: 10,270 files / 14,480,661,572 logical bytes all match the recorded production artifact hashes. New staging will reuse those immutable bytes. Primary local research remains outside this worktree.

Implemented upstream renderer/picker, annotation, XR and watch fixes with these local adaptations:

- Instance scene root owns subject, environment and annotation/debug geometry. Late environment reparenting preserves its authored local rotation. XR remembers/restores root, camera/rig, clipping and automatic rendering; AR restores sky/postprocessing/background, and grabs pause custom dual-stick movement/teleport. Original collision coordinates remain unchanged.
- Optional stochastic WebGPU preview is disabled by default. The capture transaction switches both renderer and picker to sorted rendering, serializes existing capture calls, restores on failures and discards stale picking results. Returning to preview resets temporal accumulation.
- Removed drawTexture calls in depth and voxel overlays. Persistent tiled overlay quads are hidden when disabled. Debug keyboard handling is instance scoped; debug button clicks no longer propagate as scene clicks that clear annotation selection.
- Safari bootstrap/index retries, fine LOD byte progress, transparent percent/stage UI, poster readiness, official SVG branding and touch/keyboard reveal are retained. Node HTML/settings exports still do not import the engine. Development watch transpiles changed TS directly and watches the three local development pages.

Validation completed at this checkpoint:

- Typecheck, lint, formatting and production build pass. Existing suite: 173/173 pass before the additional actual-engine XR gesture test; focused XR/picker suite now 6/6. Engine package audit remains identical to baseline: 17 advisories (1 low, 1 moderate, 13 high, 2 critical), no newly introduced package/advisory; no unrelated automatic dependency repair.
- Browser smoke: 11/11 combinations, no script/console/request failures. Broader scenes/interaction: Chromium WebGL 12/12, Chromium WebGPU 7/7, WebKit WebGL 7/7, including Dayun, Bijiashan, Tribbie, Mangzhong, Sakura + environment and C1; mobile landscape controls, embedded dual instances, repeated destruction, source settings immutability, retry success, subject terminal error and nonblocking environment failure.
- Actual macOS Safari 18.5 (macOS 15.5), three scenes: Dayun, Bijiashan, Tribbie load and switch to fly mode successfully.
- 4096² RGBA capture: 9/9 across cat/Tribbie/Dayun × WebGL/WebGPU/stochastic; concurrent sizes, injected GPU readback failure, subsequent capture and exact camera restoration pass. Stochastic is confirmed disabled during readback and enabled afterwards; temporal accumulation reaches its 256-sample target again. Pending capture destruction settles without a leftover viewer in both sorted/stochastic modes.
- An initial exact hash comparison was inappropriate for independent GPU sorting runs: even repeated ordinary WebGPU captures have distinct hashes. Quantified sorted-vs-stochastic-transaction captures have mean RGB differences 0.00053/0.01017/0.00681 on a 0–255 scale, respectively; >99.92% pixels are within 2 levels, alpha is identical. Visual review confirms matched composition/background and no UI in capture. The stochastic preview itself retains sampling noise/quality differences and is not presented as the default renderer.
- Delayed environment joins a translated/rotated/scaled scene root after the subject first frame. Missing voxel metadata leaves the loaded subject usable with collision unavailable. Synthetic AR/VR state transitions restore background, sky, camera pose, clips and budget; these are not headset hardware acceptance.
- A test fixture initially treated the engine texture Set as an Array; corrected the fixture. Another used the old tooltip selector; corrected to the actual annotation element. Debug-button deselection was a real integration issue and was fixed, not waived. Data fixture traversal now handles the existing array-valued optional LOD records and allows normalized aliases owned by the same resource.

## Initial paired performance

Same machine/browser, 1280×800, fresh browser contexts over local HTTP, same source camera, no opening animation/reveal, 4M budget; three alternating baseline/candidate rounds. OS file caches are shared; these are controlled local timings, not public-network latency or headset measurements.

| Scene | First ready median 5.21.11 → candidate (ms) | Interaction P50 (ms) | Interaction P95 (ms) | Initial texture allocation (MiB) | Resident gsplat assets |
| --- | --- | --- | --- | --- | --- |
| Mangzhong | 337 → 297 | 8.3 → 8.4 | 16.6 → 17.0 | 58.95 → 58.95 | 1 → 1 |
| Tribbie + environment | 299 → 311 | 8.3 → 8.3 | 10.1 → 15.5 | 47.73 → 47.73 | 2 → 2 |
| Dayun LOD | 908 → 807 | 16.4 → 16.4 | 24.7 → 24.4 | 522.03 → 241.46 | 43 → 13 |

Storage buffers grow by ~0.11 MiB on single scenes and ~1.85 MiB initially on Dayun; the LOD texture reduction is measured, not inferred from the previous release's accepted memory increase. Tribbie tail frame variation requires a longer isolated repeat before release. Remaining acceptance, candidate/production deployment identities and observation are recorded below as completed. No headset is available; hardware XR ergonomics, optical quality and device stability remain unverified.

## Final acceptance corrections

- The longer isolated Tribbie repeat (240 gesture steps × 3 paired rounds) gives P50 8.3 → 8.3 ms and median P95 10.2 → 10.3 ms. Per-round new P95 is 15.0 / 10.1 / 10.3 ms; the initial tail increase is not a repeatable sustained regression. Source cameras and resource/point budgets were identical.
- Stochastic is measured separately (three rounds per scene): Mangzhong/Tribbie/Dayun first-ready medians 286/286/811 ms, interaction P50 8.3/8.3/15.9 ms, P95 9.9/9.8/18.3 ms. At 1280×800 it adds ~31.25 MiB temporal textures, while storage buffer use falls. It has visible sample noise / different fine detail, especially during motion; these measurements do not replace default-path acceptance.
- All 100 settings parsed through the actual JSONC parser and runtime migration/validation without mutating inputs. 121 separator-normalized routes/aliases have no cross-resource conflict. All indexed files are materialized and `validate_data.py --check-files` passes against the full retained payload. Raw JSON parsing initially failed on an existing commented settings file; verification now uses the product parser, not altered resource files.
- All nine locale labels match the maintained locale files. Controlled poster tests pass delayed Chromium/WebKit and image-404 degradation; branding checks pass official SVG paths/viewBoxes, transparent background/zero border, intermediate animation frames, keyboard expansion and mobile first/second tap. Six bootstrap/progress cases pass, including four-attempt exhaustion plus manual recovery, transient module/index failure, slow large scenes and mobile progress.
- Controlled streaming tests show Dayun 1,2,3…50% advancing between chunk completions on Chromium, and many intermediate percentages on WebKit. No estimated/measurable qualifier or new loading frame/background is introduced.
- Supplemental XR tests exposed a real gradient shader restoration failure: empty original `composeMainEndPS` was treated as missing, causing repeated gradient declarations after CameraFrame recreation. Preserve empty snapshots with nullish fallback; the actual method now passes four repeated restore/reapply cycles in both shader languages. Browser Dayun XR budget/gradient restoration is rechecked with no shader errors. HPR/postprocessing restoration, direct/light source flags, WebGL stochastic fallback and no monolithic point loss also pass.
- Initial local dev E2E was 5/6: trace proves the failing document was HTTP 200 with **zero bytes** while Rollup's initial watcher build replaced HTML. The assertion remains unchanged. The dev E2E launcher now waits for the watcher's full initial END before exposing its server, and owns watcher/server teardown. The watch source-mutation probe independently verifies changed TS reaches the bundle, restoration removes it, and all three development pages are emitted.
- Initial exact-head CI `39066837889` passed at `f9f020106`; the new gradient and dev-start corrections require a fresh exact-head run. Build E2E 6/6, package tarball validation (`publint 0.3.25`) passes; no package was published. Remaining final run results and production facts follow below.

- Corrected local dev E2E: 6/6 pass, unchanged assertions. Final local unit suite: 175/175. Optional renderer/XR browser matrix: 6/6, no console shader errors; all nine locales pass. The complete new stage reuses the verified old payload by hard links, with release JSON copied to new inodes; the old deployment is untouched.

## Product merge

PR152 normally squash-merged at `6fd4195d61ff3002a6fcea2caf7bd4eba3742ed7` after exact-head CI39067604582 passed at `1392c844c1cf8821623943fc91ce8c867e35d7d6`. No independent reviewer or administrator override is claimed. The final candidate also passes real WebGPU Dayun gradient/XR restoration followed by a 4096² sorted capture and resumed stochastic preview. Package Node entry checks use the AST of module declarations, avoiding false matches inside the exported JavaScript string.

Version mirrors and index.release now point to the final product SHA. Tag/build and production identities remain pending; the deployed production is still 5.21.11.
