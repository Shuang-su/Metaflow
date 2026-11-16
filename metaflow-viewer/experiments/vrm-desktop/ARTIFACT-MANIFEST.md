# vrm-desktop artifact manifest

## Floor-contact audit fix (post GO-set FAIL) — candidate

| Field | Value |
| --- | --- |
| Tip commit | `2499c29d751d0a6d0a1dc1d8875e4472d450795d` |
| ZIP | `/opt/cursor/artifacts/metaflow-desktop-preview.zip` |
| ZIP SHA256 | `b2256bb850394231afd4afb56c95e987a116b35c3195db084fecd3c1af9b38fd` |
| Failed 13-idle draft (leave Netlify) | `6afa7134154b3cce1e8c391d` / ZIP `cf056f06…` / tip `30d3c014…` |
| Prior three-clip draft | `64790aa1…` / Netlify `6afa64a14cde7a8f0a275429` — **leave** |
| Production / live | **Preserve** `6af9df4cf8b7ab03f7970227` / ZIP `b1246a48…` |
| This candidate | **NOT promoted** — no merge/deploy from agent |

### Findings (own conclusions)

1. **Quaternius mid-torso sink**: converter wrote Unreal `pelvis.position` local Y (~0.08) as VRMA hips translation while `restHipsPosition.y` ≈ 0.92 → `createVRMAnimationClip` scaled hips ≈ 0 → figurine sank. **Fix**: rotation-only Quaternius VRMA (hips translation omitted) + per-frame mesh/foot `groundFeetToFloor()`.
2. **ACCAD Swing / SwingT2 / Urban**: hands rise into/across face on Wenjing — **dropped** from autoPlaylist (files remain on disk; not auto).
3. **Quaternius Talking / FoldArms**: hand→face / arms too high after Unreal→VRM retarget — **dropped**.
4. **Foot plant**: ankle-only plant left shoe soles visually embedded; now plant using `min(skinned AABB min.y, footBoneY − soleBelowBone)` against EnvFloor world Y + `SOLE_LIFT≈0.0028`. Camera zoom/masking not used.
5. **`preserveDrawingBuffer`**: enabled so GPU QA / `canvas.toDataURL` captures the last frame.

### Auto playlist (8) — no count quota

ChatVRM idle → ACCAD Wait / Sway / Stand / SwayT2 / Look / Conversation → Quaternius Idle_Loop

### Per-clip QA (Wenjing VRM0 + pixiv VRM1; room + minimal)

| Clip | Auto | Floor math | Face/hands (Wenjing) | Notes |
| --- | --- | --- | --- | --- |
| chatvrm-idle | yes | PASS | PASS | Keep |
| accad-wait | yes | PASS | PASS | Keep |
| accad-sway | yes | PASS | PASS | Keep |
| accad-stand | yes | PASS | PASS (hands ~waist) | Keep |
| accad-sway-t2 | yes | PASS | PASS | Arms-near-hips analogue |
| accad-look | yes | PASS | PASS | Keep |
| accad-conversation | yes | PASS | PASS | Keep |
| quat-idle | yes | PASS | PASS | Sink fixed |
| accad-swing | no | n/a | FAIL face | Dropped |
| accad-swing-t2 | no | n/a | FAIL face | Dropped |
| accad-urban | no | n/a | FAIL high cross | Dropped |
| quat-talk | no | n/a | FAIL face | Dropped |
| quat-fold | no | n/a | FAIL high fold | Dropped |

Floor report: `floor-contact-report.json` — `allFloorPass` true (sole above contact ≈ 0.004–0.008 m, no sink/hover samples).

### Evidence artifacts

- Before: `before-accad-swing-face.png`, `before-quat-idle-sunk.png`
- After: `after-floor-*-*.jpg`, `floor-contact-normal-raf.mp4`
- Auto-cycle: `qa-auto-cycle-*.jpg` / `qa-auto-cycle-motion.mp4` / `qa-auto-cycle-report.json`

### Limitations

- Headless SwiftShader; Box WebGL2 unavailable — cloud GPU QA only.
- Production dwell 12–25s; QA shortens dwell via `setQaDwellSec` for multi-clip evidence.
- Mild sole z-fight can still appear at extreme camera angles; plant targets EnvFloor world Y, not camera framing.
