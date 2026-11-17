# Wenjing startup default — approved runtime handoff

User request: default to 文静 (Wenjing, existing author-catalogue 文镜 asset), while continuing improvements. Application development remains in private Shuang-su/Metaflow-Companion. PR #6 merged as e5f70fc5f9539be07a6070d6a1eac68a52a71c68. This directory only publishes already-tested browser runtime, not private source history/test fixtures or additional asset licenses.

## Immutable candidate

- Tested source: 61da2ae3984c2b20a99c417cbc9e4d50df5ecfaa
- Full successful push CI: 44093332864 (build, mobile, native, catalogue, reliability, startup)
- Static candidate: 14332492415
- Candidate ZIP SHA256: 79b9a471939626cb4edd5fd9309a09563d8f186975fb3ca01a2d2989c9cb14e0
- Source startup evidence: 14332503469, SHA256 f01ca1400a0bd9534d50c19f6ce8147deb22161af8b2dfaf6a895ed4259e0b1a
- Release: companion-2026-11-17-wenjing-default
- Output: 69 files; only experience.mjs, new startup-model.mjs and release.json differ from the prior deployed runtime
- Baseline deploy: 6afc413f205730f12c2e8e7a (source8555630, reliability release)
- Exact target: https://polite-semolina-b478fc.netlify.app/

The data-only delta.xz.b64 reconstructs the accepted three-file delta. Packed SHA256 df0f105df7766a247a90414fef2736ee7bacaf139324be4e9f146b212658dc96; decoded 7649-byte JSON SHA256 d6473e13e63272e56e97967dd5666518a5ed5d9606d93b0bf70be4dce8aa90e8. Remaining file records and exact Netlify configuration bytes are inherited from the validated prior 68-file manifest. All output bytes must match the accepted candidate. No private history, tests, restricted motion files, credentials or temporary signed artifact URLs are embedded.

## Behavior and acceptance

Default always resolves to Wenjing, including legacy browsers whose last model was Milk. Remember-last-built-in is an explicit opt-in. Temporary switches do not change the startup policy. One-click return restores Wenjing/default without redownloading an already-ready Wenjing. Retained old-avatar identity is shown on a failed switch; retry remains available. Saved scene, calibration and per-avatar native idle preferences are preserved. No model/animation/rendering or permission changes.

Source CI passed the existing four browser suites plus desktop/mobile startup tests. Actual deployed draft and production must each repeat legacy preference -> Wenjing -> failed alternate model retains Wenjing -> retry Milk -> default reload Wenjing -> opt-in remember -> Milk reload -> one-click Wenjing with prior idle. Initial actual default render is inspected before explicit low-quality software-WebGL budget. No physical Apple/Safari claim.

## Protected publication

Reuse scripts/companion-reliability-release.py only if its Git blob matches f6b3bdf653f771752639d4deb7fd23681091bd02. The thin adapter keeps exact target, deploy lock, previous release/source/app validation, all-byte HTTP checks, no-concurrent-publish guard and conditional rollback. Branch builds receive no deployment credentials. Main only publishes in existing production protection, using the shared companion publication lock. Browser processes receive no Netlify/GitHub credentials.

The exact 69 output files are verified; 67 served resources are checked remotely and 2 consumed Netlify configuration files are verified through applied headers and /about rewrite. Publication outcome is recorded in companion-startup-publication.json, not inferred from a merged PR. Original scene parity and new-repo credential cutover remain separate unfinished items.
