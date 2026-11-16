# Third-Party Attributions

## Three.js
- **License**: MIT License
- **Copyright**: Copyright © 2010-2024 three.js authors
- **Source**: https://github.com/mrdoob/three.js
- **License Text**: https://github.com/mrdoob/three.js/blob/dev/LICENSE

## @pixiv/three-vrm
- **License**: MIT License
- **Copyright**: Copyright (c) 2019-2024 pixiv Inc.
- **Source**: https://github.com/pixiv/three-vrm
- **License Text**: https://github.com/pixiv/three-vrm/blob/dev/LICENSE

## @pixiv/three-vrm-animation
- **License**: MIT License
- **Copyright**: Copyright (c) 2019-2024 pixiv Inc.
- **Source**: https://github.com/pixiv/three-vrm (packages/three-vrm-animation)
- **License Text**: https://github.com/pixiv/three-vrm/blob/release/LICENSE
- **Bundled**: `vendor/three-vrm-animation.module.js` (v3.1.4)

## Authored idle animations (VRMA)

Catalog: `animations/CATALOG.json`. Default playback is authored VRMA, not homemade bone sway.

### ChatVRM idle_loop (Waiting / relaxed idle **substitute**)
- **Bundled**: `animations/chatvrm_idle_loop.vrma`
- **SHA256**: `ace95ba6dcc0bdf2ed1081c002332b4184441117c8d543b6f642b3d2c5cf99be`
- **Upstream**: https://github.com/pixiv/ChatVRM/blob/main/public/idle_loop.vrma
- **License**: MIT — https://github.com/pixiv/ChatVRM/blob/main/LICENSE
- **Copyright**: Copyright (c) 2023 pixiv Inc.
- **Credit**: idle_loop.vrma from pixiv/ChatVRM (MIT)
- **Why substitute**: Persona animation-library entry “Waiting — pixiv Inc.'s VRoid Project” is **not** in the free BOOTH VRM Animation 7-pack (https://booth.pm/ja/items/5512385 lists Show full body / Greeting / Peace / Shoot / Spin / Model pose / Squat only). Private Persona app assets are not copied.

### ACCAD Female1 standing idle / wait / sway / fidget (CC BY 3.0)
- **Upstream mocap**: https://accad.osu.edu/research/motion-lab/mocap-system-and-data
- **Source archive**: https://accad.osu.edu/sites/accad.osu.edu/files/Female1_bvh.zip
- **License**: CC BY 3.0 — https://creativecommons.org/licenses/by/3.0/
- **Credit**: Motion data © ACCAD / The Ohio State University — CC BY 3.0
- **Conversion**: BVH→VRMA via https://github.com/vrm-c/bvh2vrma (MIT) pipeline (scale `0.01`).
- **In auto-cycle + registered UI** after Wenjing floor+face visual QA (7 total with ChatVRM + Quat Idle; locomotion / dance / combat / crouch / box / cartwheel omitted; RandomStuff1/2 dropped):

| File | Source BVH | SHA256 |
| --- | --- | --- |
| `animations/accad_female1_sway.vrma` | `Female1_A02_Sway.bvh` | `268efba627344b7d78a369f2e378845fc0b070242191a3b3c3f58bf3a0802058` |
| `animations/accad_female1_stand.vrma` | `Female1_A01_Stand.bvh` | `269c842586e6e0cabd5fc301b6027d77da1366df2b63103a5725aff021a484f5` |
| `animations/accad_female1_sway_t2.vrma` | `Female1_A02_SwayT2.bvh` | `4b94b7c3065a5b6613a2cc9e0a3f6963f25f784ca97fa5ef3978d162bbf26cba` |
| `animations/accad_female1_look.vrma` | `Female1_A04_Look.bvh` | `7982d25984a415adeda55c9666896de74969f0123806718d7960bd74f43dfdeb` |
| `animations/accad_female1_conversation.vrma` | `Female1_D3_ConversationGestures.bvh` | `d07f723215a6bd0f2abef23d88899941abd6841abe04014691c03dab7ce6763f` |

- **On disk; legal attribution retained; removed from auto-cycle and registered anim UI** (see `CATALOG.json` `bundledButNotAuto`):
  - `accad_female1_wait.vrma` ← `Female1_D2_Wait.bvh` — SHA256 `5d077a5d5c8313ece1820d8a7a9f4e263a5f2b5ed868e06aab296a2bad8425a7`. Source near-face wait gesture retargets to forearm/hand face-cover on Wenjing — unsuitable for default standing auto-idle.
  - `accad_female1_swing.vrma`, `accad_female1_swing_t2.vrma`, `accad_female1_urban.vrma` — face-obscuring / non-calm idle on Wenjing.

### Quaternius Universal Animation Library Standard (CC0 1.0)
- **UAL1**: https://opengameart.org/content/universal-animation-library · https://quaternius.itch.io/universal-animation-library
- **UAL2**: https://opengameart.org/content/universal-animation-library-2
- **License**: CC0 1.0 — License.txt in official Standard zips (bundled copies: `animations/LICENSE-Quaternius-UAL-CC0.txt`, `LICENSE-Quaternius-UAL2-CC0.txt`)
- **Credit**: Models/animations by @Quaternius — CC0 1.0
- **Conversion**: Rotation-only extract from Standard GLB → VRMA (hips translation omitted — Unreal local pelvis Y is not world height; exporting it caused figurine sink). Humanoid map adapted from vrm-c/bvh2vrma.
- **In auto-cycle** (Wenjing floor+face QA pass):

| File | Source clip | SHA256 |
| --- | --- | --- |
| `animations/quaternius_idle_loop.vrma` | UAL1 `Idle_Loop` | `08cf15e5f1e897f00ac24b67b1c88f57e8f1c9c85dc277dd967dd68d2b319e6f` |

- **On disk but removed from auto-cycle** after Wenjing visual QA: `quaternius_idle_talking.vrma` (hand→face), `quaternius_idle_fold_arms.vrma` (arms too high). Idle_No_Loop never bundled (head-shake gag).

### Screenshot / research entries **not** bundled (honest unavailability)
| Label | Why not bundled |
| --- | --- |
| Waiting — pixiv Inc.'s VRoid Project | No free official file; not in BOOTH 7-pack; Persona listing ≠ redistribution grant. |
| Model Pose — pixiv Inc.'s VRoid Project | BOOTH terms prohibit extractable redistribution. |
| Hands Behind Back / Hand on Hip — Quaternius | Absent from UAL Standard; Pro/QAL site-only not used. Closest analogue: ACCAD SwayT2 (not a rename). |
| Mixamo idles | Project-use license; file redistribution unclear — not bundled. |
| CMU standing waits (141_20 etc.) | FAQ allows redistribute, but official ASF/AMC → VRMA path not established here yet — deferred, not invented. |
| tk256ailab / three-vrm test.vrma / Bandai Namco | Undocumented animation provenance or no standing idle. |

## Default Model: 文镜（Wenjing）
- **Name**: 文镜 / Wenjing
- **Authors**: LAPLACE Live! × 彩茫
- **License**: Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International (CC BY-NC-SA 4.0)
- **License URL**: https://creativecommons.org/licenses/by-nc-sa/4.0/
- **Source ZIP**: https://downloads.vrp.moe/persona-marketplace/Wenjing-VRM/3920112d9727/Wenjing-VRM.zip
- **Bundled file**: `models/wenjing.vrm` (unmodified bytes)
- **SHA256**: `a2fcc39bb93b57519aa718b10873a9d39f53f24b70e03c17ba9c6291e01a8add`
- **Size**: 32,201,048 bytes
- **Usage**: Non-commercial attribution ShareAlike only. Preserve author credit. Do not claim as original or CC0.

## Optional Sample: VRM1_Constraint_Twist_Sample
- **Name**: VRM1_Constraint_Twist_Sample
- **Authors**: pixiv Inc.
- **Copyright**: Copyright (c) 2022 pixiv Inc.
- **License**: VRM License 1.0 (https://vrm.dev/licenses/1.0/)
- **Source**: https://github.com/pixiv/three-vrm/tree/dev/packages/three-vrm/examples/models
- **Permissions**: allowRedistribution true; commercialUsage corporation; modification allowModificationRedistribution
- **Bundled file**: `models/minimal-avatar.vrm`

## Scene environment
- **Room / Minimal dioramas**: original procedural Three.js geometry + canvas textures authored in `environment.mjs` (no remote scene packs, no Persona branding clone).
- Reference videos (BV15TxE6rE7H / BV1DzaL6CESP) informed intent only; assets are not copied.

## Not included
- Milky Green / 明前奶绿 and other restricted models are intentionally excluded.
