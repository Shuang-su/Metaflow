# VRM Desktop Portrait Viewer

Standalone Three.js + `@pixiv/three-vrm` desktop portrait experiment (not SuperSplat / PlayCanvas).

## Features

- Full VRM0/VRM1 lifecycle (MToon, expressions, lookAt, spring bones)
- `VRMUtils.rotateVRM0` applied once for VRM0 models facing the camera
- Normalized humanoid A-pose (quaternion rest pose) + spring `setInitState` rebind
- Off-axis calibrated projection + bone-based desk foot anchor
- Quality tiers that change DPR / lights / shadows / springs
- Short calibration wizard + honest device capability hints
- Mac / external display presets (manual), optional Window Management recognition, credit-card ruler
- Per-screen local calibration profiles (privacy-conscious keys)
- Recoverable loading (progress bar + retry)
- Default model: **文镜 Wenjing** (CC BY-NC-SA 4.0, LAPLACE Live! × 彩茫)
- Optional pixiv VRM1 sample (`minimal-avatar.vrm`)

## Known limitations (honest)

- Wenjing skirt springs still flare after A-pose; **springs default OFF** for Wenjing (toggle +「重新稳定」to experiment).
- pixiv Constraint_Twist sample: hair spikes after idle/lookAt; **springs default OFF** with labeled policy.
- Web canvas ≠ OS transparent desktop pet window.
- No accessories / DOF / advanced Persona editor features.

## Build

```bash
node build.mjs
```

Artifact: `/opt/cursor/artifacts/metaflow-desktop-preview.zip`

See `ATTRIBUTIONS.md` for licenses. Do not bundle restricted models (no Milky Green).

## Local verify

```bash
node verify-baseline.mjs
node verify-display.mjs
```
