# vrm-desktop artifact manifest

Filled by build/report scripts. Do not treat as a release tag.

## Current candidate (framing fix)

| Field | Value |
| --- | --- |
| Intent | Hair/toes framing margin; keep boot diagnostics; QA exact Netlify draft |
| Tip commit | *(fill after push)* |
| ZIP | `/opt/cursor/artifacts/metaflow-desktop-preview.zip` |
| ZIP SHA256 | `ea5c589c6ff8ad8be26859ee72d25e0da6bf7aed496fc48da73c4c027f7e6e77` |
| Deployed draft tested | `https://6af9c51602b9bd7fc82107f0--vrm-desktop-portrait-20261114.netlify.app/` (ZIP `14835152…` / tip `51ddc23c`) |
| Production | **NOT promoted** — remains `6af9bbe46caab4bd5afd9e02` |

### Evidence

- Deployed (WebGL OK here; hair AABB clips): `/opt/cursor/artifacts/qa-deployed-wenjing.png`, `deployed-candidate/deploy-qa-report.json`
- Fixed ZIP HTTP: `qa-fixed-wenjing-fullbody.png`, `qa-fixed-wizard-saved.png`, `qa-fixed-pixiv.png`, `qa-fixed-mobile.png`, `qa-fixed-idle.png`

### Box Chrome note

Box Chrome WebGL2 disabled/unavailable blanks **both** old production and candidates — not a code regression. Boot `#bootError` still useful when WebGL missing.
