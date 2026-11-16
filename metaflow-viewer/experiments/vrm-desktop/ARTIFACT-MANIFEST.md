# vrm-desktop artifact manifest

## Auto-cycle authored idles (t35u) — QA PASS

| Field | Value |
| --- | --- |
| Tip commit | *(filled after push)* |
| ZIP | `/opt/cursor/artifacts/metaflow-desktop-preview.zip` |
| ZIP SHA256 | `64790aa10ad97439fdde78a94a9c15e0e1d6ec88bc389adad39e927f98e2d33d` |
| Prior authored draft | `842df070…` / Netlify draft `6af9f72b09942bc643061570` (do not treat as production) |
| Production / live | **Preserve** `6af9df4cf8b7ab03f7970227` / ZIP `b1246a48…` |
| This candidate | **NOT promoted** — no merge/deploy from agent |

### Behavior

- Default **ON**: auto-cycle only the three bundled licensed clips — ChatVRM `idle_loop` (MIT) → ACCAD Female1 Wait → ACCAD Female1 Sway (CC BY 3.0)
- Dwell ≈ **12–25s** (≥1 full loop, slight variation); crossfade ≈ **0.9s**
- Manual selector overrides; **after manual pick, current dwell finishes then auto continues** (documented in Chinese UI)
- Local `.vrma` optional, **never** enters auto playlist; procedural / Persona / BOOTH Model Pose / Quaternius hip & behind-back stay unbundled

### Evidence

- `qa-auto-cycle-motion.mp4` (~22s) — all three clips + transitions (QA dwell shortened to 5s via `setQaDwellSec` only)
- `qa-auto-cycle-{chatvrm-idle,accad-wait,accad-sway}.png` + `qa-auto-cycle-trio.png`
- `qa-auto-cycle-report.json` — PASS (playlistThree, sawAllThree, transitionCountSane, arms/feet, scene/model switch)

### Limitations

- Headless capture uses `stepSimulation` + `setSuspendRafSimulation` for deterministic multi-clip proof (headless rAF alone under-advances)
- Production dwell is 12–25s; QA used 5s dwell override for evidence length
