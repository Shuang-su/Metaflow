# Motion feedback maintenance release

Development remains in private Shuang-su/Metaflow-Companion, merged PR8 / 0313eaabd48eb64727e9d670ed715e2cb2d5f00b. This directory only transfers the accepted browser runtime to the existing protected publisher; no private history, tests, credentials or restricted animation files are included. Wenjing remains the default.

## Fixed candidate

- Tested source: `8886f8c707d244469763949814f19a5f09a2a039`
- Complete CI: `44104892632`, build and six browser flows successful
- Verified artifact: `14339556871`
- ZIP SHA256: `84db1ad791f3abc9765222712ee4a2ea4fef0cede99e5b589655b71bf2cd823a`
- Release: `companion-2026-11-17-motion-feedback`
- Prior immutable deployment: `6afc5a95cfa5fd32b207590e`, Wenjing-default release
- Exact target: `https://polite-semolina-b478fc.netlify.app/`

The first native Air check timed out polling a short-lived 2.5-second single-shot state at roughly 0.94fps software rendering; it had no JavaScript error and had returned to the original idle. One unchanged failed-job retry passed. The first failure is retained; its root cause is not claimed proven. Source, assertions, timeouts and assets were not changed to obtain acceptance.

The final ZIP was downloaded and its digest and all 70 files compared against the original CI build. Only motion-controls.mjs, new motion-presentation.mjs, motion-library.css and release.json differ from the live baseline. All original assets and vendor bytes are identical.

Data-only `delta.xz.b64`: packed SHA256 `0c0060b5223805b76f6dd6365a20385401348bedbef4326e525da281624df359`; decompressed 8,884-byte JSON SHA256 `3bcf498094749c84b4540c3912051fb0f04a02388c95a52e6525e61b79611267`. The exact prior manifest is inherited through a Git-blob-pinned publisher. Deltas are bounded UTF-8 replacements; every output must match accepted SHA256 and size.

## Behavior

Player state determines current-row highlighting, paused/single-shot/loading text and the current-idle selector. Failed/cancelled switches retain the actual prior idle and offer retry. A loaded idle resumes without another download or restart; single-shots remain replayable. Playable-only filtering includes bundled and locally imported motions; empty results have a clear-filter action with keyboard focus recovery. The full 16-entry inventory remains intact: 7 bundled, 8 local-import and Standing pending its original source.

## Publication gates

Only main publishes through existing production protection and the shared Companion publication lock. Verify previous release/source/app hash, exact hostname, deploy lock and concurrent changes. Draft and production each verify 68 HTTP resources plus 2 applied Netlify configurations and run actual desktop/mobile Wenjing rendering, seven original idles, same-idle request counting, pause/resume, explicit corrupt-response recovery, retry and filtering. Browser child processes receive no credentials. A failed production verification only rolls back this run's own current deployment. The old deployment remains available.

The Browser connection lacks originating context, so established CI Playwright/Chromium software WebGL is used. Desktop/mobile simulations do not establish physical Safari, hardware screens, tracking accuracy, thermals or complete original-scene fidelity. Those remain unverified. New-repository credential cutover is separate; no competing automatic publisher is enabled. This document is not proof of publication; the actual run and companion-feedback-publication.json establish the final result.
