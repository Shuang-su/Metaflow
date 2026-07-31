# Aave Liquid Glass Lab

This folder is a local research package for Aave's "Building Glass for the Web" page.

The default local entry runs the captured Aave article SSR/Flight mirror for 1:1 visual and behavior comparison. The earlier hand-written approximation has been removed because it diverged from the original implementation. The mirror, raw chunks, runtime metrics, and research notes are now the source of truth.

## Run Locally

Original mirror:

```bash
python3 -m http.server 4173 --directory /Volumes/Prism/Metaflow/aave-liquid-glass-lab
```

Open:

```text
http://127.0.0.1:4173/
```

The root page redirects to:

```text
http://127.0.0.1:4173/design/building-glass-for-the-web/
```

That route is the local Aave mirror. It uses the captured server HTML plus Next/Turbopack chunks, CSS, fonts, images and videos under `design/`.

Web Liquid Glass：原理与实现 Storybook:

```bash
npm --prefix /Volumes/Prism/Metaflow/aave-liquid-glass-lab/storybook install
npm --prefix /Volumes/Prism/Metaflow/aave-liquid-glass-lab/storybook run storybook -- --host 127.0.0.1 --port 6006
```

Open:

```text
http://127.0.0.1:6006/
```

The Storybook is a reader-facing implementation research guide. Its standard preview initializes the captured Aave Turbopack runtime once, blocks the original Next page entry, and mounts the exact original component export required by the current story. Each page then places the live component beside Chinese implementation notes, runtime metrics, and raw chunk excerpts. It does not hydrate the complete article, crop a page, create a nested iframe, or run a hand-written Liquid Glass substitute. `How It Works / Displacement Map` is the only parameter playground.

All npm, Storybook, TypeScript, and Playwright cache/temp paths are pinned under `storybook/.cache/` on this external volume. The project scripts do not use the system `/tmp` or the default home-directory npm cache.

## Folder Roles

- `index.html`: small redirect entry to the local Aave mirror.
- `design/`: runnable local mirror using the original captured public page files. The article entry is generated from `reference/origin/server-raw.html`, not the post-hydration live DOM snapshot. The runtime script is served as `turbopack-5725b656aea77f16.local.js` to avoid stale browser cache while keeping the original `?dpl=...` chunk suffix.
- `reference/origin/`: raw capture, live DOM extraction, metrics, original screenshots and chunk copies.
- `reference/origin-mirror/`: generated mirror source used to populate `design/`.
- `reference/takram-storybook/`: pinned MIT-licensed Takram Storybook source and runtime-layout reference. It is not imported by the Liquid Glass runtime.
- `storybook/`: independent Storybook research guide titled `Web Liquid Glass：原理与实现`. `scripts/generate-study-pages.mjs` extracts reader-facing prose, metrics, source excerpts, and the locked module manifest; `src/origin/runtime.ts` mounts the corresponding original Aave module in the standard Storybook preview.
- `AAVE_GLASS_IMPLEMENTATION_NOTES.md`: source research master note with chunk mapping, short source excerpts, runtime evidence, DOM/SVG path, WebGL path and component call layers.
- `WEB_LIQUID_GLASS_SPEC.md`: Chinese Web Liquid Glass specification distilled from the source research notes, original bundle and live DOM evidence.
- `流程与代码说明.md`: Chinese workflow notes for using the local mirror and research evidence.

## Source Of Truth

Use the mirror and captured evidence as the oracle for any future implementation:

- Original route: `design/building-glass-for-the-web/index.html`
- Raw chunks: `reference/origin/scripts/`
- Runtime metrics: `reference/origin/runtime-metrics.json`
- Live summary: `reference/origin/live-summary.json`
- Comparison ledger: `reference/comparison-ledger.md`
- Source research master note: `AAVE_GLASS_IMPLEMENTATION_NOTES.md`
- Reproducible specification distilled from the notes: `WEB_LIQUID_GLASS_SPEC.md`
- Reader-facing Storybook guide: `storybook/`

Do not use the deleted iframe slice, deleted article-copy runtime, or deleted early Playground approximation as implementation evidence. The current Storybook cases do not share a replacement glass implementation: they mount the retained original component modules directly. This direct bundle execution is research-only; future production code should still follow the readable specification rather than depend on minified module IDs. The mirror and reference evidence remain the acceptance oracle.

## Verified Local Mirror

Latest local checks:

- URL: `http://127.0.0.1:4173/design/building-glass-for-the-web/#glass-lab`
- Next hydration: `window.next === true`
- Flight queue: `__next_f.length === 0`
- React event layer: present on body/root/slider/toggle controls
- Glass containers: `5`
- SVG filters: `25`
- `feDisplacementMap` nodes: `35`
- Figures: `7`
- First-viewport figure visibility matches origin: figures `1-5` start hidden and reveal on scroll; figure `6` starts visible.
- Canvas nodes: `4`
- Video nodes: `2`
- Hero lens samples: `160x160`, moving across both lens DOM and `feImage[data-lens]`.
- Interaction checks match origin: switch toggles, slider drags to `98`, toggle moves to `Assets`, video button changes `Pause` to `Play`.
- In-app browser after reload: `feImage === 25`, `feDisplacementMap === 35`, hero moving lens `160x160`, slider/code section visible.
- Offline/static coverage: no external requests during the article audit; captured dark demo background `design/demo/demo-bg-dark.png` is local.
- QR/canvas path: clicking the Aave mark changes the QR/WebGL canvas signatures, proving the original interactive canvas refraction path is active locally.
- Map playground: dragging the Width control updates both the lens `feImage` region and the generated displacement image data.
- Mobile `390x844`: no horizontal overflow, menu opens, glass/filter/canvas/video counts stay stable from top to bottom.
- Auxiliary `/design/careers/`: served as a static no-script helper route so article prefetch/link checks do not 404 offline. It is not the source of truth for Liquid Glass behavior.
- Known console noise: the original bundle emits four `<path d="undefined">` SVG errors during these audits; they do not stop hydration, filters, canvas/video, or controls.

Evidence file:

```text
/tmp/aave-glass-compare/local-v-origin-final-summary.json
/tmp/aave-glass-compare/in-app-final-top.png
/tmp/aave-glass-compare/in-app-final-top-scrolled.png
/tmp/aave-glass-compare/in-app-final-slider.png
/tmp/aave-glass-compare/default-raw-768-qa.json
/tmp/aave-glass-compare/origin-same-timing-audit.json
/tmp/aave-glass-compare/canvas-map-interaction-audit.json
/tmp/aave-glass-compare/map-playground-state-audit.json
/tmp/aave-glass-compare/mobile-offline-audit.json
```

Screenshots:

```text
/tmp/aave-glass-compare/default-raw-768-top.png
/tmp/aave-glass-compare/default-raw-768-slider.png
/tmp/aave-glass-compare/default-raw-768-video.png
/tmp/aave-glass-compare/qr-canvas-after-click.png
/tmp/aave-glass-compare/map-playground-state-audit.png
/tmp/aave-glass-compare/mobile-top-final.png
/tmp/aave-glass-compare/mobile-menu-final.png
```

## Sources

- Aave page: https://aave.com/design/building-glass-for-the-web
- Aave public assets and chunks captured from `aave.com` / `aave.design`
- Abhijeet Singh X/Twitter link recorded as source context; the text body was not accessible during capture.

## Boundaries

- No wallet, login, finance, account, or production Aave interaction.
- No changes to Metaflow viewer/editor, `data/`, `metadata/`, or `scripts/`.
- The mirror is for local study and behavior comparison. Future implementations should use the specification and evidence, not ship the mirrored Aave bundle.
