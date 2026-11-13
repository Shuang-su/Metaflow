# Desktop Portrait Experiment - Deployment Guide

## Overview

This document describes how to deploy the desktop portrait experiment as a standalone static site on Netlify.

## Current Status

**Runtime Verified**: ✅ VRM loading, animations, eye position tracking, audio interaction  
**Tests Passing**: ✅ 69 unit tests  
**Visual Issues**: ⚠️ Character may be cropped, desk brightness needs adjustment  
**Ready for Deploy**: After visual QA passes

## Deployment Requirements

### 1. Static File Structure

The experiment requires:
- `index.html` - Main page with importmap
- `*.mjs` - Application modules (app, vrm-loader, vrm-animation, etc.)
- `node_modules/` subset:
  - `playcanvas/build/playcanvas.mjs`
  - `three/build/three.module.js`
  - `@pixiv/three-vrm/lib/three-vrm.module.js`
  - All transitive dependencies for Three.js/VRM

### 2. VRM Model Strategy

**MUST NOT** bundle `Seed-san.vrm` in public deployment:
- ✅ License permits redistribution with attribution
- ❌ Document says "not distributed"
- ❌ 11MB file not appropriate for experiment demo

**Options for Public Deployment**:

**Option A: Built-in minimal VRM** (RECOMMENDED)
- Create original test avatar (< 1MB)
- Simple humanoid with MToon materials
- CC0 or original license
- Purpose-built for this experiment

**Option B: User-supplied VRM**
- Document: "Open your own VRM file"
- No default character
- Landing page explains file picker

**Option C: Verified CC0 VRM**
- Find public domain VRM on VRoid Hub
- Verify CC0 license explicitly
- Include license file

### 3. Module Path Resolution

**Current**: Importmap with relative paths
```json
{
  "imports": {
    "three": "./node_modules/three/build/three.module.js",
    "@pixiv/three-vrm": "./node_modules/@pixiv/three-vrm/lib/three-vrm.module.js"
  }
}
```

**For Deployment**: Keep relative paths, bundle required subset of `node_modules/`

### 4. Build Artifact Structure

```
build/
├── index.html
├── app.mjs
├── vrm-loader.mjs
├── vrm-animation.mjs
├── test-audio.mjs
├── asset-loader.mjs
├── projection.mjs
├── tracking.mjs
├── sample.mjs
├── node_modules/
│   ├── playcanvas/build/playcanvas.mjs
│   ├── three/build/three.module.js
│   ├── three/examples/jsm/loaders/GLTFLoader.js
│   ├── @pixiv/three-vrm/lib/three-vrm.module.js
│   └── ... (only required transitive deps)
├── models/
│   └── (optional: built-in test VRM if created)
├── _headers (Netlify MIME types)
└── LICENSE.md (attributions)
```

### 5. Netlify Configuration

**`netlify.toml`**:
```toml
[build]
  publish = "build"
  
[[headers]]
  for = "/*.mjs"
  [headers.values]
    Content-Type = "text/javascript"
    
[[headers]]
  for = "/*.js"
  [headers.values]
    Content-Type = "text/javascript"
    
[[headers]]
  for = "/*.vrm"
  [headers.values]
    Content-Type = "model/gltf-binary"
    
[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
  force = false
```

### 6. Security & Privacy

**MUST Strip**:
- ❌ No API keys or credentials
- ❌ No internal URLs or file paths
- ❌ No development-only debug code
- ❌ No node_modules wholesale (only required subset)

**MUST Include**:
- ✅ License attributions (PlayCanvas, Three.js, @pixiv/three-vrm)
- ✅ VRM license if including model
- ✅ Experiment status notice (prototype, not production)

### 7. License Attributions

**Required in deployment**:

```markdown
## Third-Party Licenses

### PlayCanvas Engine
- MIT License
- Copyright (c) 2011-2024 PlayCanvas Ltd
- https://playcanvas.com

### Three.js
- MIT License  
- Copyright © 2010-2024 three.js authors
- https://threejs.org

### @pixiv/three-vrm
- MIT License
- Copyright (c) 2020 pixiv Inc.
- https://github.com/pixiv/three-vrm

### MediaPipe Face Landmarker
- Apache 2.0 License
- Copyright 2023 The MediaPipe Authors
- https://developers.google.com/mediapipe

[If including VRM model]
### [Model Name]
- [License]
- [Attribution]
```

## Deployment Steps (Post Visual QA)

1. **Create Build Script**
   ```bash
   npm run build
   ```
   - Copy required files to `build/`
   - Subset node_modules (only required deps)
   - Generate/include test VRM or remove VRM references
   - Create `_headers` for MIME types
   - Bundle license attributions

2. **Test Build Locally**
   ```bash
   cd build && python3 -m http.server 8080
   # Open http://localhost:8080
   # Verify all modules load
   # Verify Gaussian works
   # Verify VRM works (if included)
   ```

3. **Prepare for Netlify**
   - Ensure `netlify.toml` is in root
   - Verify no secrets in build/
   - Verify all HTTPS assets
   - Document .netlify.app subdomain will be new/separate

4. **Parent Coordinates Deployment**
   - Parent authenticates Netlify
   - Parent creates new site (separate from any existing)
   - Deploy `build/` directory
   - Verify .netlify.app URL works

## Open Issues Before Deployment

1. **Visual QA**:
   - [ ] Character fully visible (not cropped)
   - [ ] Desk properly lit (not too dark)
   - [ ] Face visible for blink/lookAt tests
   - [ ] Foot anchoring correct

2. **VRM Decision**:
   - [ ] Create built-in test VRM (original content) OR
   - [ ] Document user-supplied VRM only OR
   - [ ] Find and verify CC0 VRM

3. **Build Automation**:
   - [ ] Write build script
   - [ ] Test local build serves correctly
   - [ ] Verify module resolution in built artifact

## No Merge to Production

- ✅ Experiment stays on separate branch
- ✅ Netlify site is NEW .netlify.app subdomain
- ✅ No modifications to production Viewer
- ✅ No overwrite of existing sites/domains
- ✅ No paid domain purchase

---

**Status**: Awaiting visual QA completion  
**Next**: Fix rendering issues, then create build script  
**Deploy**: After parent coordinates Netlify auth
