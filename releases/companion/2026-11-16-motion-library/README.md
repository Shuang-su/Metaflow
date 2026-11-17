# Companion full-motion release handoff

This directory is an **immutable browser-runtime release description**, not a second development tree. The authoritative application is maintained in private `Shuang-su/Metaflow-Companion`; its PR #2 is merged. No private repository history, test fixtures, credentials, or restricted pixiv animation binaries are included here.

The user explicitly requested the complete referenced Persona animation inventory and actual publication at the existing independent Netlify hostname. This handoff uses the already authorized protected production publisher without copying secrets, widening permissions, changing the main MetaFlow site, or changing the Companion repository visibility.

## Fixed accepted candidate

- Tested source: `f1a476f7a6fa4d60ad16bd8d401eed4433704eff`
- Full successful push CI: `43880838595`
- Static candidate artifact: `14232986665`
- Artifact ZIP SHA-256: `085e3d37acd6ce9c95ef9b0143283cedb1d8778cf543a4b32fd6ab33283e989e`
- Candidate release: `companion-2026-11-16-motion-library`
- Expected browser files: **68**, every file verified against the candidate
- Previous production source: `d5785c9b87079f6c4b9a2c16978e0d5cdd2f418a`, release `companion-2026-11-15.1`
- Target: `https://polite-semolina-b478fc.netlify.app/`

`runtime-manifest.xz.01.b64` and `.02.b64` concatenate into a strict base64-encoded XZ stream. XZ bytes SHA-256: `bf5e8b5b3d19547e6b9e0d3905ef0b5dc35757847848bd8a9db0fa103371f383`; decompressed JSON: 82,940 bytes, SHA-256 `89cc7c2fbc84a4e1f52583f4fa545e6a2a3ea127dea8f6f1e85324e137a5f991`.

The JSON contains exact UTF-8 deltas from the prior immutable public deployment, original motion archive/member hashes, the official MIT adapter integrity, and SHA-256/size checks for every output. It has no executable build commands. Reconstruction downloads only fixed approved origins and applies bounded data deltas; the output must match the tested candidate byte-for-byte. Temporary signed artifact URLs are not stored.

## Animation inventory and limits

16 catalogue entries: 9 idles and 7 single-shot actions. Seven original Quaternius CC0 idles are included unchanged (Hands Behind Back, Hand on Hip, Folded Arms, Leaning, Talking, Sitting, Dance). Waiting and seven pixiv actions are supported local imports, with optional browser-only persistence; their extractable source files are not publicly redistributed. Standing remains explicitly pending its original file. Catalogue completeness is not a claim that all sixteen are preinstalled.

The adapted terrace entry and derived scene assets are absent. Original complete-scene fidelity, physical Safari/hardware displays, real side-face detection rate and sustained thermal performance remain unverified.

## Build and publish controls

```sh
python3 scripts/companion-motion-release.py build
python3 scripts/companion-motion-release.py verify
```

Branch checks reconstruct and verify without deployment credentials. Only main runs publication in the existing `production` environment. The publish step checks exact site identity, current baseline release/app hash and deployment lock. It creates a draft, verifies all 68 remote resources, and exercises actual models, all seven included animations, catalogue filtering, pause/resume, local one-shot and stopping in desktop/mobile Chromium. Only after that and a concurrent-deploy check does it promote. Production repeats file and browser checks; failure rolls back only if the current deploy is still the one created by this run.

Browser child processes receive a minimal environment without Netlify/GitHub tokens. No camera or screen-management permission is requested by the test. Physical-device claims are excluded. Publication results and screenshots are stored as CI artifacts outside the public runtime.

This record is preparation, not proof of live publication. Actual success must be supported by `companion-motion-publication.json` and the corresponding workflow result. New-repository credential cutover remains separate; this does not enable competing automatic publishers.
