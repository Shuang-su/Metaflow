# MF-93 — SZCAF15 A001C0190 resource review

Status: conversion and local review prepared; user camera confirmed; identity/naming approval pending. Production remains Viewer 5.20.0 with 99 resources. No public resource, index, version, tag or deployment changed in this checkpoint.

Issue: [MF-93](https://github.com/Shuang-su/Metaflow/issues/93). The user-approved plan in the Codex task is the sole execution plan.

## Source and conversion

Source group: `260726 深圳动漫节/A001C0190_260726_PQWJ ` (original directory has a trailing space). Preserve the source unchanged; normalized proposed admission directory: `data/ACG/SZCAF15/A001C0190_260726_PQWJ/`.

Inputs under `girl/ply-result/point_cloud/iteration_100/`:

- `point_cloud.ply`: 865,623 Gaussian splats, SH0; independently converted to SOG and voxel. No decimation, cropping, extra scale, environment merging or other LOD inputs.
- `environment.ply`: 55,029 Gaussian splats, independently converted to compressed PLY.
- Fixed converter: splat-transform 3.6.4, Node 22.20.0; Viewer remains 5.20.0 / PlayCanvas 2.22.4 with Node 20.19.0.
- Rotation `-90,0,0` for all outputs; SOG `--sh-iterations 10`; voxel `--voxel-size 0.08 --voxel-opacity 0.20`.

| Output | Bytes | SHA-256 |
| --- | ---: | --- |
| `scene.sog` | 10563265 | `fadd3649484d71533e421b511808fce062d705c5d82ef11a218657754e4913f6` |
| `environment.compressed.ply` | 896601 | `5e0513d527a2ea2da24ebad9a611eb8e0c68500cc7594c993ea5960e8a6f99ee` |
| `walk.voxel.json` | 628 | `c4125f8a342c2c9aa353c6e660f4535368dfb1f1a39a61fbf7a7acbd9d534434` |
| `walk.voxel.bin` | 2666132 | `9a1ca123a863adea1efcdc090364d4b148ed1b6dd07d168b4acece7c3871f305` |
| `settings.json` | 1148 | `836a24b0ce009cb68e0d5a634ee8bfc122ed77aa9348ef0ffe80beea5c0edd7d` |
| `cover-4096.webp` | 11514166 | `274e27f1b8b122d397e9c282dea5f1335e116fa6025bd71a151d3a3c1a1f17a8` |

## Confirmed camera and pending metadata

- User-confirmed position: `[-0.7729818820953369, 0.44409406185150146, 0.46443819999694824]`.
- User-confirmed forward: `[0.40358277472010734, -0.06873996439419851, -0.9123572552702716]`; FOV 65; subject plus environment.
- Settings target: `[-0.024445065209787065, 0.3166000324639885, -1.227737577812384]`, obtained by projecting the original candidate focus onto the confirmed viewing ray. Position, direction and FOV are preserved.
- Proposed ID: `szcaf15-a001c0190`; date `2026-07-26` is source-directory inference awaiting approval; equipment unknown.
- Visual identification proposal: **崩坏：星穹铁道 缇安 / Honkai: Star Rail — Trianne**, default outfit. Single-eye fringe, flowers, winged shoulder pieces and asymmetric black/white boots support this inference. Await user approval before admission.
- Proposed route `/acg/szcaf15/honkai_star_rail-trianne`; short alias `/acg/szcaf15/trianne`. Candidate tags remain review metadata, not a public schema extension.

Identification references: [official trailer](https://www.bilibili.com/video/BV16HPsezEgp/), [character reference](https://honkai-star-rail.fandom.com/wiki/Trianne), [appearance comparison](https://www.sohu.com/a/864923811_120230066), [bilingual game dialogue](https://wiki.biligame.com/sr/%E7%BC%87%E5%AE%9D/%E8%AF%AD%E9%9F%B3). Search snippets and image results were used; official Bilibili direct access returned 412 and Fandom direct access returned 402. Do not describe the costume inference as user confirmation.

## Local validation

- 48 original source files (163,113,405 bytes) rehashed without changes. No non-finite values found in the subject PLY rows.
- SOG ZIP/CRC passed; decoded 865,623 splats. Compressed environment decoded with 55,029 splats. Voxel binary is exactly `(nodeCount + leafDataCount) * 4 = 2,666,132` bytes.
- Four-angle visual review and subject/environment comparison completed; correct upright orientation. WebGPU voxel overlay visually aligns with the subject and captured venue geometry. The subject PLY itself includes part of the venue.
- Chromium WebGL, Chromium WebGPU, Chromium mobile emulation, WebKit WebGL desktop and WebKit mobile emulation: 5/5 pass loading, environment, collision and camera reset; no uncaught script or HTTP errors. Physical device testing not performed.
- Native `captureFrame({time:0,width:4096,height:4096,supersample:1})`; confirmed position/forward/FOV match within 0.00002. RGBA rendered directly, background-composited PNG encoded with `cwebp -lossless -exact -m 6`.
- WebP is 4096×4096, static, one VP8L frame; decoded pixels exactly match the PNG intermediate. No UI overlay or image enlargement.
- Square/landscape/portrait centered cover crops compared with same-camera Viewer frames: mean absolute channel differences 0.672 / 0.808 / 0.755 on the 0–255 scale; small rasterization/resampling differences remain.
- Existing 10,202 data files (14,414,758,248 bytes) rehashed in the primary checkout against the verified MF-85 baseline: zero changed or missing files.

## Resolved tooling issues and remaining work

- The first comparison harness used obsolete `#application-canvas` and timed out after native cover generation. Updated it to the instance canvas and completed all three comparisons without modifying the cover pixels.
- The reused implementation checkout is intentionally sparse. The initial integrity probe found absent local data by design; corrected the check to the complete primary checkout and verified all original hashes.
- Local review assets and detailed evidence are retained under the project `.codex-work/resource-review-szcaf15-a001c0190/`; server is loopback port 8968.
- Remaining: user metadata approval; formal admission and index generation; release/version validation and final production build; PR squash and final product SHA; tag and GitHub Release; candidate deployment and promotion; production readback and at least 15 minutes observation.
- Reverified rollback deployment: `6ab9587c6a912037fe9fa43e` (5.20.0), Netlify published pointer ready. Recheck again immediately before publication.
- This is implementer self-review, not independent review.
