# Third-party resources

This prototype vendors fixed versions of its rendering and tracking dependencies. The v3 application defaults to 文镜 · 作者目录版, a noncommercial Wenjing sample from the credited author catalog. The existing Milky Green reconstruction remains a selectable model, following the user's instruction, and local VRM import is also available. The retained model is labelled 重建版; it is not described as an authenticated original or the model in the user's reference videos. No unrelated avatar is substituted when a model fails to load.

## Three.js 0.180.0

- Project: https://github.com/mrdoob/three.js
- Distribution: https://cdn.jsdelivr.net/npm/three@0.180.0/
- License: MIT, preserved in `dist/vendor/three.LICENSE.txt`.
- Vendored files: `three.module.js`, `three.core.js`, `GLTFLoader.js`, and `BufferGeometryUtils.js`.
- Modification: the GLTFLoader import of `../utils/BufferGeometryUtils.js` is rewritten to `./BufferGeometryUtils.js` to match the local directory layout. The application import map must map the bare `three` specifier to `./vendor/three.module.js`, so every dependency shares the same Three.js instance.

## @pixiv/three-vrm 3.5.5

- Project: https://github.com/pixiv/three-vrm
- Distribution: https://cdn.jsdelivr.net/npm/@pixiv/three-vrm@3.5.5/lib/three-vrm.module.min.js
- License: MIT, preserved in `dist/vendor/three-vrm.LICENSE.txt`.
- The vendored module is unmodified and imports Three.js through the bare `three` specifier.

## fflate 0.8.2

- Author: Arjun Barrett; project https://github.com/101arrowz/fflate .
- Official fixed npm distribution: https://registry.npmjs.org/fflate/-/fflate-0.8.2.tgz , obtained with `npm pack fflate@0.8.2 --ignore-scripts` and verified against the registry's SHA-512 integrity value.
- License: MIT, preserved verbatim in `dist/vendor/fflate/LICENSE.txt`.
- The official `esm/browser.js` is vendored byte-for-byte as `dist/vendor/fflate/browser.mjs` (89,198 bytes; SHA-256 `8cc1f687e0159e977addb6b85e274dbd11e622cf151f4fcb7b85d49622ea43e7`). Only the filename extension changes for explicit ESM loading.
- Original package metadata and detailed source/integrity records are retained beside it as `package.original.json` and `SOURCE.json`.
- Use: the streaming `Gunzip` decoder provides a local compatibility fallback for the lossless model transport; native `DecompressionStream` is preferred. This does not recompress or change the model's textures or geometry.

## Retained Milky Green / 明前奶绿 1.1.0 reconstruction — identity correction retained

- Required attribution: **LAPLACE Live! and Milky Green aka. 明前奶绿**.
- Persona documentation: https://laplace.live/persona/vrm?locale=en . This describes downloadable sample avatars, not an independently authenticated original character model.
- LAPLACE public catalog: https://marketplace.laplace.live/api/items , item `MilkyGreen`, kind `vrm`, version `1.1.0`.
- Source archive: https://downloads.vrp.moe/persona-marketplace/MilkyGreen/81c4921a9fae/MilkyGreen.zip .
- Downloaded archive: 9,265,848 bytes; SHA-256 `81c4921a9fae3a0987a77e4212cf7baa1528c9eb238825b9cd4c862f352b1261`, verified against the captured catalog entry.
- Archive member: `MilkyGreen_VRM1.vrm`; 18,507,380 bytes; SHA-256 `e4e277ebba12f3b07dde4bfcbe5664147e69a787ee2e40c14f6facae9d588ac8`.
- Current public model path: `dist/assets/milky-green-reconstruction.vrm`, visibly labelled **明前奶绿 · 重建版**. Its unmodified bytes were previously hosted at `dist/assets/milky-green.vrm` and temporarily archived outside `dist/` during the identity review. The user subsequently explicitly requested that this reconstruction be retained. It remains a selectable labelled model, while Wenjing is now the default.
- The embedded name is `明前奶绿 · V1 Perfect Sync`; the VRM 1.0 file contains 18 preset expressions and 52 custom Perfect Sync expressions, with resources embedded.
- The actual embedded metadata describes a generated reconstruction for the requesting user and geometry/textures reconstructed for the project. LAPLACE's own About page identifies the site as a fan project unaffiliated with Milky Green or related companies: https://laplace.live/about?locale=en .
- **Correction:** the earlier inference that the catalog/hash match established an authentic original Milky Green model was unsupported and is withdrawn. It established download integrity only. No verified original Milky Green model has been obtained. Retaining the explicitly labelled reconstruction does not reverse this identity correction.
- `dist/assets/milky-green.license.json` remains a public source/history/correction record. Original embedded metadata, catalog item, archive member records, hashes, and attribution are preserved; the corrective review is stored separately.
- Embedded license URL: https://vrm.dev/licenses/1.0/ , together with all embedded conditions. The metadata includes separate licensing and required attribution and does not grant a general public license. The user's previously confirmed authorization remains recorded; this correction concerns model identity and does not alter those original records.
- Model bytes are unchanged; the current filename distinguishes the reconstruction. The source record does not grant visitors a license to reuse the character.

## Default Wenjing / 文镜 author-catalog sample 1.0.0

- Required attribution: **LAPLACE Live! × 彩茫**.
- Publisher model documentation: https://laplace.live/persona/models?locale=en and https://laplace.live/persona/vrm?locale=en . These list Wenjing VRM under **CC BY-NC-SA 4.0**.
- License: https://creativecommons.org/licenses/by-nc-sa/4.0/ . The sample is offered here for **noncommercial evaluation**, retaining attribution and the stated ShareAlike terms. No commercial grant is claimed.
- Catalog: https://marketplace.laplace.live/api/items , item `Wenjing-VRM`, kind `vrm`, version `1.0.0`, author `LAPLACE Live! × 彩茫`.
- Source archive: https://downloads.vrp.moe/persona-marketplace/Wenjing-VRM/3920112d9727/Wenjing-VRM.zip .
- Archive: 17,966,649 bytes; SHA-256 `3920112d9727b33378971fe1a23c245a94733106b3cc9878a4830b22a6f0281a`, verified against the observed catalog.
- Sole archive member: `Wenjing.vrm`; 32,201,048 bytes; SHA-256 `a2fcc39bb93b57519aa718b10873a9d39f53f24b70e03c17ba9c6291e01a8add`.
- Embedded VRM 0.0 metadata: title `Wenjing`, author `LAPLACE Live! × 彩茫`, version `1.0`, `licenseName: CC_BY_NC_SA`, `commercialUssageName: Disallow`, with all resources embedded. The original field spellings and full metadata are preserved in `dist/assets/wenjing.license.json`.
- Current presentation: **文镜 · 作者目录版**, the default selection. **明前奶绿 · 重建版** remains available as a separate choice.
- Current transport: `dist/assets/wenjing.vrm.gz`, 17,958,450 bytes, SHA-256 `4e417a506cfe61b8c3fed49668b60c81a4b097ef4351830f774aa74992fcc67c`. It is deterministic gzip (level 9, mtime 0, no filename header). Decompression restores the exact original VRM bytes; no model, image, geometry, metadata, or animation bytes are changed.
- Transport history: the earlier two-file raw-byte trial used `wenjing-01.vrmpart` (16,777,216 bytes, SHA-256 `94c6cbddc4481d6f6c5abdcbf259b499b4b8236a8be4817f5693d13958d2c080`) and `wenjing-02.vrmpart` (15,423,832 bytes, SHA-256 `8ee9edfc8b5a0fd3f2d89f18ba12dd2d50e1746bc10d10e949de4a759ce8e54a`). These files are no longer published; their source history remains in `wenjing.license.json`.
- Runtime adapter: VRM0 arm-pose and gaze axes are corrected in memory. Thirteen empty expression slots are bound only to exact matching existing `Fcl_*` morph names; existing bindings and the VRM1 control pose are preserved. No changes are written back to the source VRM, textures, metadata, or lossless transport. CPU skin/morph checks confirmed actual blink and AA vertex changes, using mocked texture decoding; this is not GPU, texture/shader, Mac Safari, or video-pixel acceptance.
- Source scope: the model name and author match the first reference video's model credits. This does not establish that the particular file is identical to the video model or that the separate Live2D examples use this VRM. GPU rendering and physical-device appearance are not validated by a catalog/hash match.

## The three supplied video references

All three exact public video pages list **ハイルラプラス** as the author:

- https://www.bilibili.com/video/av117518123472460/ — **妈妈哄我 - LAPLACE Persona MCP场景测试**. The description credits **Wenjing / 文镜 — LAPLACE Live! × 彩茫**, a scene created with LAPLACE Persona MCP and Claude, **Japanese Apartment — SbbUtutuya**, and adapted **Baby’s View / あかちゃん視点, Baby_01, VARK SHORTS Premium** motion. The later English redirect displayed “Video missing”; a playable frame was not accepted for this reference. The named stage and motion are not bundled with this site.
- https://www.bilibili.com/video/av117349244016515/ — **如何实现类似VTS、Shoost的直播间特效 - LAPLACE Persona**. The description concerns bloom, chromatic aberration, and rim-light effects; tags include 文静 / Live2D.
- https://www.bilibili.com/video/av117302687176424/ — **如何绑定Live2D分层挂件 - LAPLACE Persona**; tags include 文静 / Live2D. At the observed 30.49-second frame, the attachment target reads 文镜 and an ArtMesh list is visible. This is evidence of a Live2D attachment workflow, not the identity of a VRM file.

These sources are recorded separately; none supplies a basis to identify all three as Milky Green VRM. Their live page metadata was read through ordinary public browser access after earlier search/API requests failed. No alternate AV identifier is substituted.

## VRM1_Constraint_Twist_Sample v1.0.1

- Author and copyright: pixiv Inc., `(c) 2022 pixiv Inc.`
- Original sample collection: https://github.com/vrm-c/vrm-specification/tree/master/samples
- Byte-identical official mirror: https://github.com/pixiv/three-vrm/blob/release/packages/three-vrm/examples/models/VRM1_Constraint_Twist_Sample.vrm
- Test fixture: `tests/fixtures/vrm/pixiv-vrm-sample.vrm`, moved byte-for-byte from its former `dist/assets/` location. It is not published as a website asset.
- License: VRM Public License 1.0, https://vrm.dev/licenses/1.0/ , together with the permissions embedded in the model. Complete embedded model metadata is preserved in `dist/assets/pixiv-vrm-sample.license.json`.
- The embedded metadata permits use by everyone, corporate commercial usage, redistribution, and modification with redistribution. It disallows antisocial or hate usage. The full metadata remains authoritative.
- The fixture bytes are unchanged; only its filename and repository location differ from the upstream sample. This retained test asset is not selected or automatically used as a replacement avatar in v3.

## Retained mint test fixture

- File: `tests/fixtures/vrm/mint-companion.vrm`, 159,376 bytes; SHA-256 `fb5b83b3f65161a7c5ef744d53b2556f0aa35af7ffec715adbd64c10255d5787`.
- This local test fixture was moved unchanged out of `dist/assets/`; it is not a selectable or fallback website avatar.
- Its existing source, license, and embedded metadata record remains unchanged and publicly accessible in `dist/assets/mint-companion.license.json`.

## MediaPipe Tasks Vision 0.10.32

- Project: https://github.com/google-ai-edge/mediapipe
- Package: `@mediapipe/tasks-vision`, version 0.10.32.
- Runtime license: Apache-2.0; the upstream license is preserved in `dist/vendor/mediapipe/LICENSE.txt`. The package metadata and README are preserved beside the runtime.
- Vendored files: `vision_bundle.mjs` and the package's complete `wasm/` directory, without changes.
- Face Landmarker model: official `face_landmarker/float16/1/face_landmarker.task` from https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task . The bytes are unchanged.
- Model documentation: https://ai.google.dev/edge/mediapipe/solutions/vision/face_landmarker . The runtime's license and the model's source are recorded separately; this notice does not invent additional model permissions.

Active runtime dependencies and the face-tracking model are served from this site's own origin, without a runtime CDN. Wenjing is the separately credited default sample; the retained Milky Green VRM is selectable and served explicitly as a reconstruction. User-selected avatar files are read in the current page and are not uploaded or persisted.
