# Companion reliability maintenance release

Application development remains in private `Shuang-su/Metaflow-Companion`; PR #4 merged as `cd20cd05923e7744a22c6bb66c4e97621155dc6e`. This directory only transfers an already-accepted browser runtime to the existing protected production executor. It contains no private history, tests, credentials or restricted animation binaries. MetaFlow main-site application and deployment targets are unchanged.

## Fixed candidate

- Tested source: `8555630aa63e31e6339d0b5dbef3a5917385feb9`
- Full successful CI: `44075962416`, build and four browser flows (mobile, native, catalogue, reliability)
- Verified artifact: `14325542101`
- Artifact ZIP SHA-256: `140d5aaf2e6d802ee68991abea25c842307e1c32d80fc7037fb6f4022e1df2d7`
- Release: `companion-2026-11-17-reliability`
- 68 runtime files; only display-manager, display-controls, motion-library, motion-controls and release.json differ from the current published version
- Existing immutable baseline: `https://6afc2ff6bf40939437cf963a--polite-semolina-b478fc.netlify.app`
- Target remains `https://polite-semolina-b478fc.netlify.app/`

`runtime.xz.b64` is a fixed data description, not executable build instructions. Decode strict base64 then XZ (packed SHA-256 `18b063af59d92efa541639346839d2bc871742856bb6d79ac05cd7472db874de`). JSON is 24,267 bytes, SHA-256 `714ce261d1699eab8aec35c15462bc50c6f894d2b62c9a855dbc8f23e098b6e3`. It contains exact line deltas from the immutable baseline, the two Netlify configuration files and SHA-256/size for all output files. Reconstructed output must equal the tested artifact byte-for-byte.

## User-visible behavior

Local-import removal preserves builtin idle playback, removes saved files without late restore/write resurrection, and reports storage failures honestly. One-shot clips no longer appear as idle suggestions. Catalogue filtering delegates clicks rather than retaining removed buttons. Per-screen saved calibration includes screen geometry, screen/page DPR and pinch zoom, rejects mismatched or unversioned scale baselines, and drops detailed screen data after permission revocation. No permission is requested automatically. Original animation/model bytes and scene rendering are unchanged; no simplified original-scene replacement is enabled.

## Gates and rollback

Branch builds have no deployment credential. Main publishes only in the existing protected production environment. The fixed current source/release/app hash and exact target are checked. Draft must pass all 66 served-file byte checks plus 2 applied configuration checks, then real desktop/mobile browser flows with models, seven idles, real IndexedDB import/clear/reload, scale refusal/restoration and permission fallback. Scaling/permission events are simulated, not hardware measurements. Browser subprocesses receive no credentials.

Promotion is blocked if another deployment changed production. Production repeats HTTP/browser checks; failure rolls back only if the failed deploy is still the current one. The former deploy is retained. Source merge and this documentation do not prove publication; the workflow result and `companion-reliability-publication.json` do.

Physical Safari, real external monitors, side-face detection accuracy, sustained thermals and complete original-scene fidelity remain outside this acceptance. New-repository credential cutover is still separate; this adds no competing automatic publisher.
