# MF-30 Viewer v1.29.1 implementation evidence

## Outcome and scope

The active source now uses SuperSplat Viewer `v1.29.1` behavior and PlayCanvas `2.21.3`. The review candidate is Metaflow Viewer `5.19.0`; production remains `5.18.1` until merge, final-SHA reconciliation, tag, deployment, smoke, and observation. Existing routes, resource payloads, settings, collision data, Editor, Transform, and deployment state were not changed.

The initial acceptance runs used the local production build at `http://127.0.0.1:4175`; the 2026-08-14 follow-up used the final product/package checkpoint at `http://127.0.0.1:4191`. Both mounted real repository assets outside the build tree and distinguished Chromium's actual `webgpu` and `webgl2` backends. Full temporary command output, console records, request lists, package fixtures, and follow-up screenshots remain under `.codex-work/`; the images below are the selected durable evidence from the initial matrix.

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
| Repeated model `503` | The initial browser checkpoint stopped after its then-current three attempts and produced the durable terminal-UI screenshot. The final executable policy test stops after four total attempts with `500/1000/2000 ms` waits, releases every failed body, sets `error`, and disables `autoRender` | Pass; [terminal error UI](evidence/model-503-terminal-error.jpg) |
| `503` succeeds on fourth attempt | Final executable policy test returns `503`, `503`, `503`, then `200`; the fourth response is returned and the first three bodies are released | Pass |
| Permanent model `404` | Exactly one request, no retry; same explicit terminal error state | Pass |
| Delayed model/environment | SOG delayed 2.5 s and environment 5 s; main first frame completed before the independently attached environment; final scene/canvas remained valid | Pass; wall timings include browser/asset overhead and are not performance benchmarks |
| Blocked Analytics | endpoint aborted while Cyrene loaded; subsequent 30.0 s observation produced two paced attempts at about 14.5 s and 29.2 s, with no loading impact or error-beacon storm | Pass |
| XR detection | `navigator.xr` and app XR manager existed on tested Chromium backends; unavailable immersive AR/VR left controls hidden without non-XR regression | API/detection pass; immersive hardware unverified |

## 2026-08-14 decision-completion browser rerun

The final product/package checkpoint was `72bd20118708daf72b9c0e0130cd1267b4a0d62c`. A deterministic Chromium WebGL run passed all four desktop/mobile checks; the extended Chromium run passed its WebGPU fixture check. The real-route rerun then established:

- Cyrene WebGL completed legacy SOG, environment, settings-v2, single voxel, synthetic animation, canvas reveal, and on-demand rendering with zero console warnings/errors. A `64×32` capture succeeded, camera pose restored, and Annotation state persisted. The `360×732` mobile run reported touch input, device-derived performance mode, migration marker `5.19.0`, and no persisted `performanceMode` default.
- Xunyangpai completed on both actual WebGPU and WebGL. WebGPU reported `navigator.gpu=true`, requested/actual/device renderer `webgpu`, streaming complete, environment and collision ready, and `autoRender=false`. Runtime SH read `1` in performance mode and `0.2` in quality mode.
- Dayun completed on actual WebGPU with 293 indexed voxel tiles, a 3×3 active neighborhood, `metaflow-rz180`, collision ready, and on-demand rendering. Bijiashan completed with 320 indexed tiles and a fully loaded active neighborhood; the earlier forced-missing-tile recovery evidence remains the negative-path source because the follow-up did not repeat that deliberate fault.
- C2-Lib completed on actual WebGPU and the first synthetic-animation interrupt changed `anim→orbit` while preserving animation time. BitCity Xielian completed from its current SOG. Yunuo and `/acg/szcaf15/akari` both completed and resolved the same selected SOG.
- Cyrene `?webgl&heatmap` completed with exactly one controlled WebGPU-required warning and no error. Cyrene on actual WebGPU reported `heatmap=true`, `overlayMode=heatmap`, collision ready, `autoRender=false`, and zero console warning/error.
- `navigator.xr` existed on actual WebGPU; `immersive-ar` and `immersive-vr` both reported unavailable, matching `state.hasAR=false / hasVR=false`. This is detection/non-XR evidence only.

No follow-up route changed `files.model`, showed a blank/black scene, remained in loading, lost collision coordinates, or generated an error-beacon storm.

## SH decision and A/B

The initial compatibility candidate kept Metaflow `colorUpdateAngle = performanceMode ? 4 : 2` while comparing upstream `1/0.2`. On 2026-08-13 the user explicitly selected the `v1.29.1` policy. Final source commit `cb4a3f1` therefore uses performance `1°` and quality `0.2°`; live Xunyangpai reruns confirmed both values on actual WebGPU and WebGL2, with the route complete and on-demand `autoRender=false`.

At a fixed Xunyangpai camera on WebGPU, each comparison value received 31 frame commits. The quality screenshots (`2` versus `0.2`) measured SSIM `0.999902` and average PSNR `65.50 dB`: [local 2](evidence/xunyang-sh-local-2.jpg), [upstream 0.2](evidence/xunyang-sh-upstream-0.2.jpg). Exploratory wall timings were quality `2: 2074 ms`, `0.2: 3817 ms`; performance `4: 2773 ms`, `1: 513 ms`. These timings are explicitly rejected as a benchmark because warm-up, order, streaming cache, and background work were not randomized. They document the decision surface but do not claim a measured performance win.

## Build, size, and dependency evidence

Node remained `20.19.0`. The final product/package checkpoint produced:

| Output | Before decision-completion pass | Final default build | Raw/gzip change |
|---|---:|---:|---:|
| `public/index.js` | 3,126,846 / 682,013 B | 3,130,946 / 682,864 B | +4,100 / +851 B |
| `public/index.css` | 21,942 / 4,025 B | 21,980 / 4,055 B | +38 / +30 B |
| `dist/index.js` | 3,505,952 / 714,208 B | 3,510,686 / 715,215 B | +4,734 / +1,007 B |
| `dist/settings.js` | — | 15,022 / 3,283 B | no material source change |

No runtime output grew by 1%, far below the 10% explanation gate. The production CSS map is 30,993 B raw / 6,246 B gzip and is tracked separately as a debug artifact. It is source-map v3, names only `src/index.scss`, has exactly one relative `sourceMappingURL=index.css.map`, is included in `npm pack`, and contains no `/Volumes`, `/Users`, user-directory, or cache path.

The opt-in Debug Engine build succeeded and measured `public/index.js` 4,810,225 B raw / 1,035,344 B gzip and `dist/index.js` 5,070,306 B raw / 1,064,314 B gzip. Its expected size increase does not affect the default production artifact. The final tarball contained 25 files, measured 3,109,721 B packed / 16,272,580 B unpacked, and included the CSS and JavaScript maps.

DOMPurify changed only in `package-lock.json`, from `3.4.11` to exact `3.4.13` through unchanged `posthog-js@1.386.8`. Clean `npm ci`, `npm ls dompurify`, and `npm audit --omit=dev` succeeded; the production audit reported zero vulnerabilities at every severity. The full development audit still reports four high findings and remains separate maintenance work. No `npm audit fix` was run.

Package-purity evidence used two independent consumers. Node import added no `window`, DOM, or global state. Rollup retained used root/settings exports and removed an unused bare import. A disposable consumer installed only the local tarball plus fixed `webpack@5.109.2` and `webpack-cli@7.2.2`; named root and settings imports retained their code, while the bare import produced a 55-byte empty runtime. Publint then passed without the former `sideEffects` suggestion.

The complete read-only fixture contained current Viewer source plus Editor/reference inputs and the 87-resource data checkout. After release-record reconciliation, the final complete `npm test` passed `85/85`, with 0 failures, exit code 0, and 6.129 s TAP duration. It covered product, resource, package, settings, Analytics, collision, locale, parser, retry, Version History, Ledger, and MCL contracts. It also established 9 streaming routes, 78 SOG routes, 44 SOG+environment compositions, 34 SOG-only compositions, six Firefly routes that retain selected SOG despite an available streaming candidate, and successful validation of all nine current `lod-meta.json` manifests. The generator rerun produced an identical 87-entry route/model digest (`63a9a6a752acfe9539e944c0a6084d7a11fc999b2502e4f089c8d98863f3007d`).

Final governance passed local validation for all 12 registered snapshots and online tag/commit/tree verification for all 11 pure-upstream snapshots; the historical Metaflow snapshot was correctly skipped for upstream identity and retained local-content-only verification. Reference/CI-routing tests passed `22/22`; targeted Version History/Ledger/MCL tests passed `17/17`; data validation, full resource-file validation, direct platform validation, combined platform/data fixtures `8/8`, MCL `check-all`, CI route selection, 101-file Markdown-link validation, the 12,749-file repository scan, and `git diff --check` all passed. The earlier pre-reconciliation mismatch was the expected self-reference guard and disappeared once `3a711880` was registered by the successor delivery record.

## Explicit limitations

- No iOS Safari or Android Chrome physical device was available. `360 × 732` Pixel 10 is browser emulation, not a real-device claim.
- No XR headset/controller/hand-input hardware was available. Only API/detection and non-XR regression are verified.
- This evidence covers local implementation and the `5.19.0` PR candidate. Merge, final-squash-SHA reconciliation, tag, deployment, production CDN smoke, device telemetry, and observation remain outside it.
- The deliberately failed requests and deliberately blocked Analytics endpoint are test evidence, not product incidents. No production backend was used.
