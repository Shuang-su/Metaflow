# MF-30 Viewer v1.29.1 implementation evidence

## Outcome and scope

The active source now uses SuperSplat Viewer `v1.29.1` behavior and PlayCanvas `2.21.3`. The review candidate is Metaflow Viewer `5.19.0`; production remains `5.18.1` until merge, final-SHA reconciliation, tag, deployment, smoke, and observation. Existing routes, resource payloads, settings, collision data, Editor, Transform, and deployment state were not changed.

All browser runs used the local production build at `http://127.0.0.1:4175`, real repository assets mounted outside the build tree, and Chromium's actual `webgpu` or `webgl2` backend. Full Playwright command output, console records, and request lists remain under `.codex-work/tmp/viewer-v1.29.1/browser/`; the images below are the selected durable evidence.

## Browser matrix

| Route / case | Backend and viewport | Runtime result | Console / network result | Selected evidence |
|---|---|---|---|---|
| `/acg/fireflyfes38/cyrene` | WebGPU desktop | legacy SOG, partial settings-v2, first frame, reveal, synthetic animation, single voxel, post effects, and branded UI loaded | no unexpected warning, error, or failed request in the clean route run | [Cyrene WebGPU](evidence/cyrene-webgpu-desktop.jpg) |
| Cyrene | WebGL2 desktop, `?webgl&heatmap` | scene, settings, post effects, collision, and capture loaded; voxel heatmap overlay was omitted | exactly one expected controlled warning that heatmap requires WebGPU; no failed route request | [Cyrene WebGL fallback](evidence/cyrene-webgl-heatmap-fallback.jpg) |
| Cyrene | emulated Pixel 10, `360 × 732`, DPR 3, WebGPU | `inputMode=touch`, mobile controls/layout, performance mode, canvas, and single voxel loaded | no unexpected warning/error or failed request | [Cyrene mobile emulation](evidence/cyrene-mobile-360x732.jpg) |
| `/acg/j05/xunyangpai` | WebGPU desktop | streaming LOD, environment, five annotations, single voxel, fly, and performance mode loaded; high-detail LOD opened to `0…1000` | clean route run had no unexpected warning/error or failed request | [Xunyangpai WebGPU](evidence/xunyangpai-webgpu.jpg) |
| Xunyangpai | WebGL2 desktop, `?webgl&noreveal` | streaming, environment, single collision, fly, performance toggle, pre-decision SH `2→4→2`, and LOD `0…1000` passed; final rerun confirmed quality `0.2` / performance `1` | no unexpected warning/error or failed request | [Xunyangpai WebGL](evidence/xunyangpai-webgl.jpg) |
| `/shenzhen/dayun` | WebGPU desktop | streaming LOD, environment, tiled voxel, reveal, and walk loaded; moving to manifest tile `x0_z10` loaded the expected four edge tiles | no unexpected route failure; numeric query used `(-camera.x, camera.z)` under `metaflow-rz180` and `walkAllowed=true` | [Dayun tiled scene](evidence/dayun-webgpu-tiled.jpg) |
| `/shenzhen/bijiashan` | WebGPU desktop | streaming scene and 3×3 tiled neighborhood loaded; forced missing `x0_z0/x0_z1/x1_z0/x1_z1` disabled walk only in that region, then restored 3×3 tiles and walk | four deliberate tile `404` responses produced four bounded warnings; main scene stayed loaded, visible, and at LOD `0…1000` | [Bijiashan recovery](evidence/bijiashan-missing-tile-restored.jpg) |
| `/sztu/c2-lib` | WebGPU desktop | first user input changed `anim→orbit`; later fly selection survived another animation exit | no unexpected route error | [C2-Lib animation exit](evidence/c2-lib-animation-exit.jpg) |
| `/acg/bitcity260711/xielian` | WebGPU desktop | published legacy SOG, first frame, synthetic animation, camera, and brand loaded | no unexpected warning/error or failed request | [Xielian](evidence/xielian-webgpu.jpg) |
| `/acg/szcaf15/yunuo` and Akari alias | WebGPU desktop | canonical and alias resolve the expected same resource/settings identities and both produce visible scenes | clean runs completed without unexpected warning/error or failed request; screenshots are not claimed pixel-identical because animation time differs | [Yunuo](evidence/yunuo-webgpu.jpg), [Akari alias](evidence/akari-alias-webgpu.jpg) |

## Public capability and negative results

| Contract | Runtime evidence | Result |
|---|---|---|
| Capture normalization and serialization | Two concurrent WebGPU captures returned in series: default `480×480`, and invalid `-12×0 / supersample 99` normalized to `1×1 / 8`; camera pose and target were identical/restored | Pass |
| WebGL/post-effect capture | Cyrene WebGL captured `160×90`, supersample 2 at animation time 1.25; pose and target restored | Pass |
| Capture rejection recovery | A one-shot rejection was injected only into the capture target's texture `read()`. The Promise rejected with the injected error; camera pose, animation pause state, and `renderTarget=null` restored; an immediate `8×8` follow-up capture succeeded | Pass |
| Annotation persistence | Xunyangpai toggle changed `showAnnotations true→false`, wrote localStorage, hid markers/active UI, survived reload, then restored to true | Pass |
| Transient model `503` | Yunuo `.sog` returned `503` once and `200` on attempt 2; route reached `loadingStage=complete`, canvas visible, WebGPU on-demand active | Pass |
| Repeated model `503` | Three responses (`503`, `503`, `503`) stopped after bounded backoff; state became `error`, overlay said to refresh, canvas remained gated, `autoRender=false` | Pass; [terminal error UI](evidence/model-503-terminal-error.jpg) |
| Permanent model `404` | Exactly one request, no retry; same explicit terminal error state | Pass |
| Delayed model/environment | SOG delayed 2.5 s and environment 5 s; main first frame completed before the independently attached environment; final scene/canvas remained valid | Pass; wall timings include browser/asset overhead and are not performance benchmarks |
| Blocked Analytics | endpoint aborted while Cyrene loaded; subsequent 30.0 s observation produced two paced attempts at about 14.5 s and 29.2 s, with no loading impact or error-beacon storm | Pass |
| XR detection | `navigator.xr` and app XR manager existed on tested Chromium backends; unavailable immersive AR/VR left controls hidden without non-XR regression | API/detection pass; immersive hardware unverified |

## SH decision and A/B

The initial compatibility candidate kept Metaflow `colorUpdateAngle = performanceMode ? 4 : 2` while comparing upstream `1/0.2`. On 2026-08-13 the user explicitly selected the `v1.29.1` policy. Final source commit `cb4a3f1` therefore uses performance `1°` and quality `0.2°`; live Xunyangpai reruns confirmed both values on actual WebGPU and WebGL2, with the route complete and on-demand `autoRender=false`.

At a fixed Xunyangpai camera on WebGPU, each comparison value received 31 frame commits. The quality screenshots (`2` versus `0.2`) measured SSIM `0.999902` and average PSNR `65.50 dB`: [local 2](evidence/xunyang-sh-local-2.jpg), [upstream 0.2](evidence/xunyang-sh-upstream-0.2.jpg). Exploratory wall timings were quality `2: 2074 ms`, `0.2: 3817 ms`; performance `4: 2773 ms`, `1: 513 ms`. These timings are explicitly rejected as a benchmark because warm-up, order, streaming cache, and background work were not randomized. They document the decision surface but do not claim a measured performance win.

## Build, size, and dependency evidence

Node remained `20.19.0`. After feature port, the production outputs were:

| Output | Before public-capability checkpoint | Final feature build | Change |
|---|---:|---:|---:|
| `public/index.js` raw | 3,079,439 B | 3,126,412 B | +1.53% |
| `public/index.js` gzip | 666,256 B | 681,132 B | +2.23% |
| `public/index.css` raw | 21,864 B | 21,942 B | +0.36% |
| `public/index.css` gzip | 4,027 B | 4,044 B | +0.42% |
| `dist/index.js` raw | 3,446,926 B | 3,505,441 B | +1.70% |
| `dist/index.js` gzip | 696,649 B | 712,809 B | +2.32% |
| `dist/settings.js` raw | 14,977 B | 15,022 B | +0.30% |
| `dist/settings.js` gzip | 3,286 B | 3,304 B | +0.55% |

No output grew by 10%. At the implementation checkpoint, `npm audit --omit=dev` reported zero high and zero critical production vulnerabilities; the remaining production finding was one moderate DOMPurify advisory. The release-record checkpoint did not change the dependency graph: clean `npm ci` and `npm ls --omit=dev --all` both passed. Two attempts to refresh the audit then failed at npm's retiring `quick audit` service, first with HTTP 400 and then with `socket hang up`. Those endpoint failures are recorded as unavailable current refreshes, not as passing audits and not as dependency findings. No `npm audit fix` was run.

The implementation checkpoint passed clean `npm ci`, format, lint, typecheck, publint, production build, all `73/73` Viewer tests, `9/9` reference validator tests, local and online identity for all 12 registered snapshots, `13/13` CI-routing tests, `7/7` platform tests, 99-file Markdown link validation, a 12,742-file repository hygiene/secret scan, and `git diff --check`.

The `5.19.0` release-record revalidation passed clean `npm ci`, `npm ls --omit=dev --all`, all `73/73` Viewer tests using the published BitCity/SZCAF15 and existing Cyrene/Dayun fixtures, fixed-fixture Playwright E2E `4/4` on desktop/mobile WebGL, format, lint, typecheck, publint, production build, local reference validation plus all `9/9` validator tests, all `13/13` CI-routing tests, all `7/7` platform tests, data validation, Version History validation, MCL `check-all`, 101-file Markdown link validation, a 12,745-file repository hygiene/secret scan, and `git diff --check`. The online reference retry was interrupted at the first historical Viewer tag by GitHub TLS/empty-response failures; it does not supersede the successful all-snapshot online identity run at the implementation checkpoint. Publint passed with one non-blocking suggestion to declare `sideEffects`; the package was not changed because the Viewer has global/UI side effects and this upstream-sync task did not authorize a package-consumption semantic change.

## Explicit limitations

- No iOS Safari or Android Chrome physical device was available. `360 × 732` Pixel 10 is browser emulation, not a real-device claim.
- No XR headset/controller/hand-input hardware was available. Only API/detection and non-XR regression are verified.
- This evidence covers local implementation and the `5.19.0` PR candidate. Merge, final-squash-SHA reconciliation, tag, deployment, production CDN smoke, device telemetry, and observation remain outside it.
- The deliberately failed requests and deliberately blocked Analytics endpoint are test evidence, not product incidents. No production backend was used.
