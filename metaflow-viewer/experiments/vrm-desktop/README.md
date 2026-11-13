# VRM Desktop Portrait Viewer

**Standalone Three.js + @pixiv/three-vrm Web3D Application**

Independent desktop portrait viewer with calibrated off-axis projection for physical screen viewing. Pure Three.js with full VRM 1.0 support: MToon materials, expressions, lookAt, and spring bone physics.

## Features

- **Pure Three.js rendering** - no PlayCanvas or SuperSplat dependency
- **Full VRM 1.0 adapter** - `@pixiv/three-vrm` 3.1.4
- **Off-axis projection** - calibrated for physical desktop viewing
- **VRM expressions** - blink, aa (mouth), and 16+ preset expressions
- **Idle animations** - breathing, automatic blinking, gaze tracking
- **Audio-reactive mouth** - test audio with lip sync
- **Desk plane** - character anchored at screen bottom with tilt support
- **Interactive calibration** - sliders for screen size, tilt, eye position

## Validation Results

✅ VRM load and parsing  
✅ Expression manager (18 expressions including blink, aa)  
✅ Full character framing (head to feet in NDC bounds)  
✅ Feet anchored to desk (2mm tolerance)  
✅ Off-axis projection enabled  
✅ Responsive to eye position and tilt changes

## Deployment

Build artifact: `/opt/cursor/artifacts/metaflow-desktop-preview.zip` (7.5 MB)

Self-contained static site ready for Netlify drag-and-drop or any HTTP server. Includes bundled Three.js, three-vrm, and CC0 VRM sample (VRM1_Constraint_Twist_Sample).

See `ATTRIBUTIONS.md` for third-party licenses.
