# vrm-desktop artifact manifest

## Authored VRMA idle (t34u) — clearance + motion fix

| Field | Value |
| --- | --- |
| Tip commit | `c64f78feeb59cbc5d169e880c7f37ef6a1fa6682` |
| ZIP | `/opt/cursor/artifacts/metaflow-desktop-preview.zip` |
| ZIP SHA256 | `842df070bb700ab07aecdad675d9a4da492cb6aa638141ac5c4b80f1247a4887` |
| Prior failed candidate | `72723d976031517db768833a7a33ab5173e159e4f968498c7f330b751c7f0d37` — **NOT approved** (hands/skirt + static look) |
| Production / live draft | **Preserve** `6af9df4cf8b7ab03f7970227` / ZIP `b1246a48…` as rollback |
| This candidate | **NOT promoted** — no merge/deploy from agent |

### Runtime fixes vs 72723d

- Relative torso quaternion amplify (vs first key) so figurine-scale breath/sway reads; arm tracks **not** amplified (absolute/arm amp caused raised-hand glitch)
- Additive authored breath overlay on chest/spine/upperChest (does not replace VRMA)
- Stronger `applyAuthoredArmClearance` + world-X enforcement after mixer
- `stepSimulation` for QA (forced step; not rAF-throttled during capture)
- Order: mixer → hip XZ lock → arm clearance → animator (blink/lookAt/breath overlay) → `vrm.update`

### Evidence (forced-step QA)

- `qa-authored-idle-motion.mp4` — 18s @ 10fps encode, sim 30fps, HUD timestamps — SHA256 `066663d0405bd701baf00bd85e626673a764b1fe226ea211a05f9b09bb625b82`
- `qa-authored-t0.png` / `t3` / `t6` + `qa-authored-t0-t3-t6.png` side-by-side
- `qa-authored-arms-close.png`, `qa-authored-side.png`, `qa-authored-idle.png`
- `qa-authored-motion-report.json` — **PASS** (chestRange≈0.116, hips≈0.078, arm≈0.071, minClear L/R≈0.118/0.089)

### Licensing honesty

See `ATTRIBUTIONS.md` + `animations/CATALOG.json`. No new animation sources. Persona Waiting / VRoid Model Pose extractable redistrib / Quaternius Hands Behind Back & Hand on Hip (not in free Standard) are **not** bundled.
