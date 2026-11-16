# vrm-desktop artifact manifest

## Expanded auto-cycle standing idles (t36u) — QA PASS

| Field | Value |
| --- | --- |
| Tip commit | *(filled after commit)* |
| ZIP | `/opt/cursor/artifacts/metaflow-desktop-preview.zip` |
| ZIP SHA256 | `9cea5a06965dafa1a0011c619dd72aeadcf45ff4ffbae25a9e8bb92e32ce40e7` |
| Prior three-clip draft | `64790aa1…` / tip `98c5b098…` / Netlify draft `6afa64a14cde7a8f0a275429` — **leave as-is** |
| Prior authored draft | `842df070…` / Netlify draft `6af9f72b09942bc643061570` |
| Production / live | **Preserve** `6af9df4cf8b7ab03f7970227` / ZIP `b1246a48…` |
| This candidate | **NOT promoted** — no merge/deploy from agent |

### Behavior

- Default **ON**: auto-cycle **all 7** bundled licensed standing idles — ChatVRM `idle_loop` (MIT) → ACCAD Female1 Wait / Sway / Stand / SwayT2 / Look / ConversationGestures (CC BY 3.0)
- Dwell ≈ **12–25s** (≥1 full loop, slight variation); crossfade ≈ **0.9s**
- Manual selector overrides; **after manual pick, current dwell finishes then auto continues**
- Local `.vrma` optional, **never** enters auto playlist; procedural / Persona / BOOTH Model Pose / Quaternius hip & behind-back stay unbundled (honest unavailability documented)

### Evidence

- `qa-auto-cycle-motion.mp4` (~28s) — ≥4 distinct idles + transitions (QA dwell 5s via `setQaDwellSec` only)
- Per-clip stills: `qa-auto-cycle-{chatvrm-idle,accad-wait,accad-sway,accad-stand,accad-sway-t2,accad-look}.png`
- `qa-auto-cycle-report.json` — PASS (`playlistSeven`, `sawAtLeastFourDistinct`, `transitionCountSane`, arms/feet, scene/model switch)

### Limitations

- Headless capture uses `stepSimulation` + `setSuspendRafSimulation` for deterministic multi-clip proof (headless rAF alone under-advances)
- Production dwell is 12–25s; QA used 5s dwell override for evidence length
- 28s QA window observed 6 of 7 playlist ids; 7th (`accad-conversation`) is in the playlist and loads, just beyond the shortened capture window

## Prior: three-clip auto-cycle (t35u)

| ZIP SHA256 | `64790aa10ad97439fdde78a94a9c15e0e1d6ec88bc389adad39e927f98e2d33d` |
| Tip | `98c5b09802cbc70d936fbe09e393eb5fed99f7d9` |
| Playlist | ChatVRM → ACCAD Wait → ACCAD Sway only |
