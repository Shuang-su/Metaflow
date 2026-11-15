# VRM Desktop Portrait Viewer

Standalone Three.js + `@pixiv/three-vrm` desktop portrait experiment (not SuperSplat / PlayCanvas).

## Features

- Full VRM0/VRM1 lifecycle (MToon, expressions, lookAt, spring bones)
- `VRMUtils.rotateVRM0` applied once for VRM0 models facing the camera
- Off-axis calibrated projection + desk foot anchor
- Default model: **文镜 Wenjing** (CC BY-NC-SA 4.0, LAPLACE Live! × 彩茫)
- Optional pixiv VRM1 sample (`minimal-avatar.vrm`)

## Build

```bash
node build.mjs
```

Artifact: `/opt/cursor/artifacts/metaflow-desktop-preview.zip`

See `ATTRIBUTIONS.md` for licenses. Do not bundle restricted models.
