# Aave Glass comparison ledger

## 2026-07-09: local mirror baseline

Original evidence:

- Live source: `https://aave.com/design/building-glass-for-the-web`
- Extracted files:
  - `reference/origin/live-extract.json`
  - `reference/origin/live-summary.json`
  - `reference/origin/live-dom.html`
  - `reference/origin/asset-manifest.json`
- Original runtime facts:
  - `glassCount: 5`
  - hero glass container: `764x368`
  - switch glass container: `116x70`, `margin:-21px`
  - slider glass container: `290x72`, `margin:-25px`
  - toggle glass container visual rect: about `584.73x206`

Local evidence:

- Runtime URL: `http://127.0.0.1:4173/design/building-glass-for-the-web/#glass-lab`
- Check file: `reference/comparison-4173-mirror-check.json`
- Screenshot: `/tmp/aave-glass-compare/local-4173-mirror-top.png`
- Local runtime facts:
  - `glassCount: 5`
  - `filters: 25`
  - `feDisplacementMap: 35`
  - `figures: 7`
  - `overflowX: 0`
  - `console errors: 0`

Difference found:

- The previous local root page was a readable study clone, not a 1:1 page. It had different article text, large empty hero space, different component layout, and incomplete original wrapper behavior.

Root cause:

- The earlier implementation recreated the idea instead of running the original public page files. It kept custom explanatory layout and did not preserve Aave's generated Next/Turbopack DOM/CSS.

Fix:

- Generated `reference/origin-mirror/` from the captured public page files.
- Copied the mirror's `/design/...` tree into the lab root so the existing 4173 server can serve original absolute paths.
- Changed root `index.html` to redirect to `/design/building-glass-for-the-web/`.
- Preserved the earlier readable implementation as `study-implementation.html` at this stage. This was later removed on 2026-07-09 because it diverged from the original implementation.

Retest result:

- Local 4173 mirror now loads the Aave article mirror with the expected glass/filter counts and no console errors.

Known local mirror noise:

- RSC navigation fetches with query-only paths are skipped in `origin-mirror` because they conflict with static directory paths. They are not required for the first-page glass demos.
- Browser automation may report `video.mp4 net::ERR_ABORTED` when the test closes the browser while video is still streaming.

## 2026-07-09: hydration root cause and default mirror correction

Original evidence:

- Live original consumes the Flight queue and hydrates:
  - `window.next === true`
  - `__next_f.length === 0`
  - React fiber/props are present on body, root, slider, toggle and video controls.
- Same-timing interaction audit:
  - switch toggles to checked;
  - slider drag changes value from `50` to `98`;
  - toggle click moves the lens to `Assets`;
  - video button changes from `Pause` to `Play`.

Local evidence before correction:

- The local mirror loaded the visual DOM and all static chunks, but hydration did not start:
  - `window.next === false`
  - `__next_f.length === 28`
  - React fiber/props absent on controls.
- Resulting behavior:
  - switch native checkbox could change;
  - slider value stayed `50`;
  - toggle lens did not move;
  - video button did not pause playback.

Root cause:

- The local HTML had script tags rewritten to `/design/_next/static/chunks/...`.
- The captured Turbopack runtime chunk still had its internal chunk base hardcoded to `https://aave.design/design/_next/`.
- Because chunk keys did not match, the runtime never executed `runtimeModuleIds:[95395]`, so `appBootstrap -> hydrate -> hydrateRoot` never ran.
- The previous `mirror-fixes` adapter only masked visual symptoms and was not a correct 1:1 implementation.

Fix:

- Rebuilt the default article entry from `reference/origin/server-raw.html`, not the post-hydration live DOM snapshot.
- Localized public asset URLs to `/design/...` and `/cdn-cgi/...`.
- Patched `design/_next/static/chunks/turbopack-5725b656aea77f16.js`:
  - from `let t="https://aave.design/design/_next/"`
  - to `let t="/design/_next/"`
- Removed default `mirror-fixes.css/js` injection and deleted the unused files from `design/`.

Retest result:

- Default local URL: `http://127.0.0.1:4173/design/building-glass-for-the-web/#glass-lab`
- Hydration:
  - `window.next === true`
  - `window.next.router === true`
  - `__next_f.length === 0`
  - React fiber/props present on body, root, slider and toggle controls.
- Runtime counts:
  - `glass: 5`
  - `filters: 25`
  - `feDisplacementMap: 35`
  - `canvas: 4`
  - `video: 2`
- First viewport visibility matches origin:
  - figure `0` visible;
  - figures `1-5` hidden until scroll;
  - figure `6` visible.
- Interaction parity against origin with the same timing:
  - switch after click: local `checked:true`, origin `checked:true`;
  - slider after drag: local value `98`, origin value `98`;
  - toggle after click: local lens `x:412,y:368,w:92,h:67`, origin lens `x:412,y:368,w:92,h:67`;
  - video after click: local `paused:true, aria:Play`, origin `paused:true, aria:Play`.
- Evidence:
  - `/tmp/aave-glass-compare/default-raw-768-qa.json`
  - `/tmp/aave-glass-compare/origin-same-timing-audit.json`
  - `/tmp/aave-glass-compare/default-raw-768-top.png`

## 2026-07-09 - Runtime cache-bust regression and final in-app check

Observed regression:

- A temporary cache-bust query was appended to the local Turbopack runtime script:
  - `turbopack-5725b656aea77f16.js?...&local=runtime-base-v2`
- Fresh Chrome then showed `window.next === true`, but the SVG filter pool was incomplete:
  - `feImage: 0`
  - `feDisplacementMap: 0`
  - slider/code figures could remain blank.

Root cause:

- Turbopack derives the chunk suffix from `document.currentScript.src`.
- Adding a non-origin query changed that suffix and broke the original chunk matching model even though the base path was already fixed.

Fix:

- Created a patched runtime filename copy:
  - `design/_next/static/chunks/turbopack-5725b656aea77f16.local.js`
- Updated the local HTML to reference the renamed file while preserving the original query:
  - `turbopack-5725b656aea77f16.local.js?dpl=dpl_D2XtDjQLhVS3zZzzdNTzPBxB69Ds`
- Kept the runtime base patch inside that file:
  - `let t="/design/_next/"`

Retest result:

- System Chrome local and origin parity:
  - both `next:true`, `router:true`, `flight:0`;
  - both `glass:5`, `filters:25`, `feImage:25`, `feDisplacementMap:35`, `canvas:4`, `video:2`;
  - switch click state matched origin.
- In-app browser after reload:
  - `feImage:25`;
  - `feDisplacementMap:35`;
  - hero moving lens: `160x160`, `border-radius:80px`;
  - slider/code section visible with the original `290x72` glass container.
- Evidence:
  - `/tmp/aave-glass-compare/local-v-origin-final-summary.json`
  - `/tmp/aave-glass-compare/in-app-final-top-scrolled.png`
  - `/tmp/aave-glass-compare/in-app-final-slider.png`
  - `/tmp/aave-glass-compare/default-raw-768-slider.png`
  - `/tmp/aave-glass-compare/default-raw-768-video.png`

## 2026-07-09 - Offline completeness, QR/canvas, map playground and mobile audit

Origin evidence:

- The live article uses the same original bundle model for DOM glass, canvas QR, video controls and the map playground.
- The live article's non-DOM Liquid Glass demos are not pure CSS filters: QR and video depend on WebGL/canvas paths driven by generated displacement maps.

Local evidence:

- Article route remains hydrated:
  - `window.next === true`
  - `__next_f.length === 0`
  - `glass:5`, `filters:25`, `feImage:25`, `feDisplacementMap:35`, `canvas:4`, `video:2`
- Offline article audit:
  - external requests: `0`
  - bad responses: `0`
  - page errors: `0`
- QR/canvas:
  - QR click changed canvas `0` signature from `3e2c3223` to `1b306bbe`;
  - QR click changed canvas `1` signature from `af329103` to `5459cc7e`.
- Map playground:
  - dragging Width changed `feImage[20]` from `x:0.29678362573099415,width:0.4064327485380117` to `x:0.15058479532163743,width:0.6988304093567251`;
  - the generated displacement image data length changed from `123162` to `105382`;
  - screenshot shows the lens widened and the Width value updated.
- Mobile `390x844`:
  - max horizontal overflow: `0`;
  - top and bottom samples kept `next:true`, `flight:0`, `glass:5`, `filters:25`, `feImage:25`, `feDisplacementMap:35`, `canvas:4`, `video:2`;
  - mobile menu opens and exposes article anchors plus Blog/Careers/GitHub/X links.
- Auxiliary route:
  - `/design/careers/` is served as a static no-script helper to avoid article link/prefetch 404s offline;
  - it is not used as Liquid Glass behavior evidence.

Differences / known noise:

- Four `<path d="undefined">` SVG console errors appear from the original bundle during local audits. They do not affect hydration, SVG filters, WebGL output or interactions.
- One local video media request can be aborted during mobile scroll/menu testing. This is browser media cancellation, not an asset miss.

Root cause:

- Earlier remaining gaps were not Liquid Glass algorithm gaps; they were offline completeness gaps around auxiliary assets/routes and incomplete audit coverage for QR/map/mobile.

Fix:

- Added local `design/demo/demo-bg-dark.png` and the matching reference copies.
- Added static no-script `/design/careers/` helper generated from captured origin content.
- Completed interaction audits for QR/canvas, map playground and mobile.

Retest result:

- The article Liquid Glass effects are locally restored for the verified original paths: hero, DOM controls, QR/canvas, video/WebGL, map playground and mobile menu/scroll.

Evidence:

- `/tmp/aave-glass-compare/canvas-map-interaction-audit.json`
- `/tmp/aave-glass-compare/qr-canvas-after-click.png`
- `/tmp/aave-glass-compare/map-playground-state-audit.json`
- `/tmp/aave-glass-compare/map-playground-state-audit.png`
- `/tmp/aave-glass-compare/mobile-offline-audit.json`
- `/tmp/aave-glass-compare/mobile-top-final.png`
- `/tmp/aave-glass-compare/mobile-bottom-final.png`
- `/tmp/aave-glass-compare/mobile-menu-final.png`

## 2026-07-09 - Research spec cleanup and old demo removal

Decision:

- The earlier non-1:1 hand-written demo is no longer part of the package.
- The local mirror, raw chunks, runtime metrics and ledger are the only evidence sources.
- `WEB_LIQUID_GLASS_SPEC.md` is the readable Web Liquid Glass specification for future implementations.

Removed:

- `study-implementation.html`
- `styles.css`
- `glass.js`
- `assets/`

Reason:

- The old demo was useful during initial exploration, but its DOM shape, filter target model, visual behavior and WebGL details diverged from the original Aave implementation.
- Keeping it next to the mirror made it too easy to mistake an approximation for source evidence.

Retained:

- Runnable mirror under `design/`.
- Raw origin capture and scripts under `reference/origin/`.
- Generated mirror source under `reference/origin-mirror/`.
- Runtime and visual evidence listed in this ledger.

New source for readable behavior:

- `WEB_LIQUID_GLASS_SPEC.md`

## 2026-07-09: mobile blank demos and hero lens motion fix

Status: superseded by the hydration correction above. This section records the temporary visual adapter used before the Turbopack runtime base mismatch was found.

Original evidence:

- Live original at the same narrow viewport shows the article figures after scroll; the switch, slider, toggle, video and map demos are not blank.
- The hero glass lens is a `160x160` round lens and moves over the background/icon area.
- Evidence screenshots:
  - `/tmp/aave-glass-compare/origin-live-768-top.png`
  - `/tmp/aave-glass-compare/origin-live-768-figure-2.png`

Local evidence before fix:

- The local mirror loaded the original bundle and assets, but several `figure > div:first-child` blocks stayed `visibility:hidden` after static serving.
- The first hero lens existed but stayed on the right side, making it read visually as a pale oval over the grid rather than the moving round lens from the live page.
- User-visible symptoms:
  - first screen glass shape looked like a stuck oval;
  - switch/slider sections had large blank spaces;
  - the page text and assets loaded, so this was not a missing HTML/CSS problem.

Root cause:

- The live site relies on runtime hydration/animation callbacks to reveal figure content and drive the hero demo. In the local static mirror, those callbacks did not consistently replay after serving the captured page as plain files.
- The original glass implementation was still present: `5` glass containers, `25` SVG filters and `35` `feDisplacementMap` nodes. The failure was the local mirror state layer, not the core displacement-map bundle.

Fix:

- Added `design/mirror-fixes.css` and `design/mirror-fixes.js`, injected into the mirrored article HTML.
- The adapter reveals demo figure roots that contain glass/canvas/video/input/button content.
- The adapter starts a local hero demo loop for the first `[data-aave-glass-container]`, updating both the lens element transform and the main `feImage[data-lens]` `x/y/width/height`.
- Copied the same adapter into `reference/origin-mirror/design/` so the mirror can be regenerated consistently.

Retest result:

- In-app browser at `http://127.0.0.1:4173/design/building-glass-for-the-web/#glass-lab`:
  - `glassCount: 5`
  - `filters: 25`
  - `feDisplacementMap: 35`
  - `canvas: 4`
  - `video: 2`
  - hidden demo figures: `0`
  - console errors/warnings: `0`
- Narrow viewport `768x1024`:
  - hero lens sample moved from `x:440,y:151` to `x:179,y:192`;
  - slider figure is visible with `glass: 290x72` and hidden native input retained at `1x1`.
- Desktop viewport `1440x1100`:
  - top page sampled at `scrollY:0`;
  - hero lens stayed `160x160` and moved from `x:700,y:211` to `x:501,y:337`.
- Evidence:
  - `/tmp/aave-glass-compare/in-app-local-fixed-qa.json`
  - `/tmp/aave-glass-compare/in-app-local-fixed-current.png`
  - `/tmp/aave-glass-compare/in-app-local-fixed-768-slider.png`
  - `/tmp/aave-glass-compare/in-app-local-fixed-1440-top-corrected.png`
