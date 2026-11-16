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
- **Conversion**: BVH→VRMA via https://github.com/vrm-c/bvh2vrma (MIT) pipeline (scale `0.01`). Wait/Sway also mirrored from Sunwood-ai-labs/GeminiVRM `public/motions/`; Stand / SwayT2 / Look / ConversationGestures converted with the same pipeline for this experiment.
- **Bundled** (standing-only; locomotion / dance / combat / crouch / box / cartwheel omitted):

| File | Source BVH | SHA256 |
| --- | --- | --- |
| `animations/accad_female1_wait.vrma` | `Female1_D2_Wait.bvh` | `5d077a5d5c8313ece1820d8a7a9f4e263a5f2b5ed868e06aab296a2bad8425a7` |
| `animations/accad_female1_sway.vrma` | `Female1_A02_Sway.bvh` | `268efba627344b7d78a369f2e378845fc0b070242191a3b3c3f58bf3a0802058` |
| `animations/accad_female1_stand.vrma` | `Female1_A01_Stand.bvh` | `269c842586e6e0cabd5fc301b6027d77da1366df2b63103a5725aff021a484f5` |
| `animations/accad_female1_sway_t2.vrma` | `Female1_A02_SwayT2.bvh` | `4b94b7c3065a5b6613a2cc9e0a3f6963f25f784ca97fa5ef3978d162bbf26cba` |
| `animations/accad_female1_look.vrma` | `Female1_A04_Look.bvh` | `7982d25984a415adeda55c9666896de74969f0123806718d7960bd74f43dfdeb` |
| `animations/accad_female1_conversation.vrma` | `Female1_D3_ConversationGestures.bvh` | `d07f723215a6bd0f2abef23d88899941abd6841abe04014691c03dab7ce6763f` |

### Screenshot entries **not** bundled (honest unavailability)
| Screenshot label | Why not bundled |
| --- | --- |
| Waiting — pixiv Inc.'s VRoid Project | Not in free BOOTH 7-pack; Persona listing ≠ redistribution grant. Substitute: ChatVRM idle + ACCAD Wait. |
| Model Pose — pixiv Inc.'s VRoid Project | On BOOTH 5512385 as VRMA_06, but terms **prohibit redistributing** motions in extractable/re-riggable form without permission. Load via local VRMA picker if you hold a BOOTH download. |
| Hands Behind Back — Quaternius | Not in Universal Animation Library **[Standard]** free pack inventory verified 2026-11-15 (Idle_Loop etc. present; HandsBehindBack absent). Pro/Source not purchased — no invented rights. |
| Hand on Hip — Quaternius | Same as above. |

Quaternius free pack reference (CC0, **not** redistributed here as VRMA): https://quaternius.itch.io/universal-animation-library · https://creativecommons.org/publicdomain/zero/1.0/

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
