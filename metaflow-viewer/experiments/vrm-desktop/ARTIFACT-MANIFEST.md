# vrm-desktop artifact manifest

## Composition fix (visible arms + corner room + idle) — QA PASS

| Field | Value |
| --- | --- |
| Tip commit | `43218f7e64a65a33af2a52fe4302867056f6ca8c` |
| ZIP | `/opt/cursor/artifacts/metaflow-desktop-preview.zip` |
| ZIP SHA256 | `b1246a48e14b59c7476c5364527e25e34e0733951273b73a9e8a3f156b2fe038` |
| Production | **NOT promoted** — coordinator draft/promote only |
| Supersedes | `56b554d6…` (buried arms, blank wall/giant cabinet, static idle — motion review FAIL) |

### Delivered

- Natural hang beside hips (`armFoldRad=1.26`, OUT `0.28`, FWD `0.14`); hands clear skirt silhouette
- Shallow **corner** room: window + small cabinet + shelf + plant in default full-body frustum
- Idle perceptible over 20s: breathAmp `0.085`, weight `0.028`, blink ~2.2s (forced unpaused in QA)
- Wenjing springs default OFF; feet planted; no spring explosion
- Evidence: `qa-natural-room-full.png`, `qa-natural-arms-side.png`, `qa-natural-idle-motion.mp4` (20s), `qa-natural-comp-report.json`, `qa-idle-diff-0-05.png`

### QA gates (`verify-composition.mjs`)

`armsVisible` · `propsInView` · `idleAlive` · visual screenshot+motion PASS

### Box Chrome note

WebGL2 unavailable blanks production and candidates alike — not a code regression.
