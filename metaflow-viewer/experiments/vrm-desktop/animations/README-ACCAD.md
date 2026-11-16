# ACCAD Converted VRMA Files

These `.vrma` files were generated from the official ACCAD / Open Motion Project `Female1_bvh.zip` archive.

Source material:

- Source page: https://accad.osu.edu/research/motion-lab/mocap-system-and-data
- Source archive: https://accad.osu.edu/sites/accad.osu.edu/files/Female1_bvh.zip
- Source license: CC BY 3.0 https://creativecommons.org/licenses/by/3.0/

Conversion tool:

- https://github.com/vrm-c/bvh2vrma
- Tool license: MIT
- Conversion scale: `0.01`

Standing idle / wait / sway / fidget bundled after Wenjing visual QA:

| VRMA | Source BVH |
| --- | --- |
| `accad_female1_stand.vrma` | `Female1_A01_Stand.bvh` |
| `accad_female1_sway.vrma` | `Female1_A02_Sway.bvh` |
| `accad_female1_sway_t2.vrma` | `Female1_A02_SwayT2.bvh` |
| `accad_female1_swing.vrma` | `Female1_A03_Swing.bvh` |
| `accad_female1_swing_t2.vrma` | `Female1_A03_SwingT2.bvh` |
| `accad_female1_look.vrma` | `Female1_A04_Look.bvh` |
| `accad_female1_wait.vrma` | `Female1_D2_Wait.bvh` |
| `accad_female1_conversation.vrma` | `Female1_D3_ConversationGestures.bvh` |
| `accad_female1_urban.vrma` | `Female1_D1_Urban.bvh` |

Inspected and **not** bundled: `Female1_D4_RandomStuff` (T-pose/broken on Wenjing), `Female1_D5_RandomStuff2` (kick/gesture, not idle).

Also omitted: locomotion, box carry, crouch/lie/crawl, skip, cartwheel, and other non-standing clips.
