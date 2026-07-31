# Aave origin source notes

Captured on 2026-07-09 from `https://aave.com/design/building-glass-for-the-web`.

## Key chunks

- `504982d42d3368e6.js-P2RwbD1kcG`
  - DOM `AaveGlass`
  - `DEFAULT_LENS_PARAMS`
  - `AAVE_GLASS_SELECTOR`
  - generated displacement map
  - SVG filter pool
  - `feImage`, `feColorMatrix`, `feDisplacementMap`

- `3963356e871bc455.js-P2RwbD1kcG`
  - video/WebGL renderer
  - source texture and displacement map texture
  - circular button lenses
  - progress-bar lens
  - blurred texture/specular/adaptive brightness path

- `36e75939a1c38671.js-P2RwbD1kcG`
  - switch call site and wrapper parameters

- `45f52371f14d4928.js-P2RwbD1kcG`
  - slider/toggle related component call sites

- `25ef42f3c325a091.js-P2RwbD1kcG`
  - map playground and demo orchestration

## Runtime selectors

- Container marker: `[data-aave-glass-container]`
- Refraction target marker: `[data-refraction-target]`
- Original article live count: `5` glass containers.

## Important runtime dimensions

- Hero: `764x368`, objectBoundingBox filter, circular lens `160x160`.
- Switch:
  - wrapper `74x28`
  - glass container `116x70`
  - `margin:-21px`
  - filtered target `232x140`
  - `transform: scale(0.5)`
  - lens `44x22`
- Slider:
  - wrapper `240x22`
  - glass container `290x72`
  - `margin:-25px`
  - filtered target `580x144`
  - `transform: scale(0.5)`
  - lens `44x22`
- Toggle:
  - visual container about `584.73x206`
  - content height `46px`
  - padding `80px 40px`
  - first lens about `87.05x40`
- Map playground:
  - container `342x320`
  - lens `140x120`

## Safari note

Safari supports the final visible effect because Aave does not rely on a Chromium-only backdrop capture path. DOM content uses SVG displacement maps; video/canvas surfaces use WebGL.
