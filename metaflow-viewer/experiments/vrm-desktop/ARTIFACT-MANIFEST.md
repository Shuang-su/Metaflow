# vrm-desktop artifact manifest

Filled by build/report scripts. Do not treat as a release tag.

## P0 boot fix (this branch)

| Field | Value |
| --- | --- |
| Intent | Fix QA blank「正在初始化…」+ dead buttons; visible boot errors; clean ZIP HTTP proof |
| Commit | b1db69ba15ab1dc201fa3b08c910f2b7543738a9 |
| ZIP | `/opt/cursor/artifacts/metaflow-desktop-preview.zip` |
| ZIP SHA256 | `148351525fa07b2e328455a67e83d9ab6fd365cce1e414e1ab258b61a365d12d` |
| Verify | `node verify-p0-boot.mjs` → `/opt/cursor/artifacts/p0-boot-verify.json` |
| Evidence | `p0-empty-storage-wenjing-ready.png`, `p0-empty-storage-wizard-open.png`, `p0-legacy-v2-storage-wenjing-ready.png` |
| Production | **NOT promoted** — remains prior deploy; do not merge/deploy from this note |

### Boot hardening

- Dynamic `import('./app.mjs')` with UI `#bootError` / `#status` on module failure
- WebGLRenderer multi-attempt fallback
- UI controls wired before VRM fetch; 20s stall watchdog
- VRM load abort/network retry (2×)
- Legacy settings.v1/v2 → v3 migrate

### P0 verify result (clean HTTP from ZIP)

- empty localStorage: Wenjing ready ~1s, fullscreen wizard opens, pixiv sample loads
- legacy v2 localStorage: Wenjing ready, wizard opens, prior width/height/tilt applied
