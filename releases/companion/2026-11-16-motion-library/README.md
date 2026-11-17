# Companion full-motion release handoff

This is an **immutable browser-runtime release description**, not a second development tree. Application development remains in private `Shuang-su/Metaflow-Companion`; PR #2 is merged. No private history, test fixtures, credentials, or restricted pixiv motion files are included here.

The user requested the complete referenced animation inventory and publication at the existing independent Netlify hostname. This handoff uses the already authorized protected production publisher without copying secrets, widening permissions, changing the main MetaFlow site or changing Companion repository visibility.

## Fixed accepted candidate

- Tested source: `f1a476f7a6fa4d60ad16bd8d401eed4433704eff`
- Full successful push CI: `43880838595`
- Static artifact: `14232986665`
- Artifact SHA-256: `085e3d37acd6ce9c95ef9b0143283cedb1d8778cf543a4b32fd6ab33283e989e`
- Candidate release: `companion-2026-11-16-motion-library`
- Output: **68 files**, all byte-verified against the candidate
- Previous source: `d5785c9b87079f6c4b9a2c16978e0d5cdd2f418a`, release `companion-2026-11-15.1`
- Target: `https://polite-semolina-b478fc.netlify.app/`

The two `runtime-manifest.xz.*.b64` parts form a strict base64 XZ stream. Packed SHA-256: `bf5e8b5b3d19547e6b9e0d3905ef0b5dc35757847848bd8a9db0fa103371f383`. Decompressed JSON: 82,940 bytes, SHA-256 `89cc7c2fbc84a4e1f52583f4fa545e6a2a3ea127dea8f6f1e85324e137a5f991`.

The description contains exact UTF-8 deltas from the prior immutable public deployment, original motion archive/member hashes, official MIT adapter integrity, and every output digest. It contains no executable build commands or temporary signed download URL. Reconstruction is bounded and must match the accepted artifact exactly.

## Inventory

16 catalogue entries: 9 idles and 7 single-shot actions. Seven unchanged Quaternius CC0 idles are bundled: Hands Behind Back, Hand on Hip, Folded Arms, Leaning, Talking, Sitting and Dance. Waiting and seven pixiv actions support local import with optional browser-only persistence; their extractable source files are not publicly redistributed. Standing remains explicitly pending its original file. This is not a claim that all sixteen are preinstalled.

The adapted terrace entry and derived scene assets are absent. Complete-scene fidelity, physical Safari/displays, real side-face detection and sustained thermal behavior remain unverified.

## Validation and publication

`python3 scripts/companion-motion-release.py build` reconstructs the candidate; `verify` checks every file. Branch run **44066892153** passed these checks. Branch builds have no deployment credentials.

Only main publishes through existing `production` protection. It checks exact site identity, old release/app digest and deploy lock, creates a draft, then verifies **66 served resources byte-for-byte**. Netlify consumes `_headers` and `_redirects` rather than serving their URLs: their exact upload bytes are checked locally, and their actual security headers and `/about` rewrite are checked remotely. No file is silently omitted.

Desktop/mobile browser checks load real models and all seven built-in clips, exercise catalogue filtering/search, pause/resume and local single-shot/stop-to-idle. Promotion requires draft success and no concurrent deployment. Production repeats HTTP and browser checks; failed production verification conditionally restores the prior deploy. Browser child processes receive no deployment/GitHub credentials and never request camera or screen permissions.

This file does not prove live publication. The main run and `companion-motion-publication.json` establish the result. Runtime metadata is kept identical to the accepted build; new-repository credential cutover remains separate. No competing automatic publisher is enabled.
