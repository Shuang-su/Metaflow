# vrm-desktop artifact manifest

## Natural pose + room diorama (t33u)

| Field | Value |
| --- | --- |
| Tip commit | `61e33c01b98f65c40b7fed54cd74ab8cf4153064` |
| ZIP | `/opt/cursor/artifacts/metaflow-desktop-preview.zip` |
| ZIP SHA256 | `56b554d61f6a6d7690909d00b9315416a9dcd456fc171ebcdbfdfd5b7fd939af` |
| Production | **NOT promoted** — coordinator draft/promote only |
| Prior live tip | `c62714d5` / ZIP `ea5c589c…` (mild A-pose + bare desk) |

### Delivered

- Natural relaxed hang (`armFoldRad=1.52`, elbow `0.72`), not A/T-pose; Wenjing springs default OFF
- Procedural **Room** diorama (walls/window light/shelf/plant/cabinet) + **Minimal** mode
- Idle: breath / blink / weight shift / lookAt; pause control; reduced-motion
- Evidence: `qa-natural-room-full.png`, `qa-natural-arms-close.png`, `qa-natural-minimal.png`, `qa-natural-idle-60s.png`, `qa-natural-idle-motion.mp4`, `qa-natural-scene-report.json`

### Box Chrome note

WebGL2 unavailable blanks production and candidates alike — not a code regression.
