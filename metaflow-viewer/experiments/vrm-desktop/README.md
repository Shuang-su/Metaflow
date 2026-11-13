# VRM Desktop Portrait Viewer

**Standalone Three.js + @pixiv/three-vrm Web3D Application**

This is an independent desktop portrait viewer with off-axis projection calibration for physical screen viewing. It uses pure Three.js with the VRM library for full VRM 1.0 support including MToon materials, expressions, lookAt, and spring bone physics.

## Architecture

- **Pure Three.js rendering** (no PlayCanvas, no SuperSplat framework dependency)
- **Full VRM 1.0 adapter** via `@pixiv/three-vrm` (3.1.4)
- **Off-axis projection** calibrated for physical desktop viewing with eye tracking
- **Idle animations**: breathing, blinking, gaze toward camera
- **Audio-reactive mouth** sync with test audio playback
- **Desk plane** anchored at screen bottom with proper tilt support

## Supersedes

This standalone app supersedes the earlier dual-renderer experiment in `experiments/desktop-portrait/` which attempted to share WebGL context between PlayCanvas and Three.js. The calibration math from `projection.mjs` is reused but applied directly to Three.js camera matrices.

## Default Model

Ships with a CC0/original minimal humanoid VRM for unrestricted public deployment. Custom VRM models can be loaded via the UI.

## Deployment

Designed for standalone static hosting. Build with `node build.mjs` to generate deployable artifact in `/opt/cursor/artifacts/metaflow-desktop-preview.zip`.

## License

See `LICENSE.txt` and `ATTRIBUTIONS.md` for third-party dependencies.
