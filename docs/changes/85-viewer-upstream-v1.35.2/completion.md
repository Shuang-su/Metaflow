# MF-85 production completion — Viewer 5.20.0

Status: released and observed. Production: https://metaflow.shuang-su.com

## Release identity

- Product PR [#86](https://github.com/Shuang-su/Metaflow/pull/86), squash `348f6fd549c5563a3c700e0f6da950b05c726e4c`.
- Release-record PR [#87](https://github.com/Shuang-su/Metaflow/pull/87), squash/tag target `0e32badbaa8a980889ef88298d70b53a8188dad1`.
- [viewer-v5.20.0](https://github.com/Shuang-su/Metaflow/releases/tag/viewer-v5.20.0); no npm publication.
- Upstream SuperSplat Viewer v1.35.2, `c52f5258df424635323f26aaeebe51361dc0f8e6`; PlayCanvas 2.22.4; Node 20.19.0.
- Exact candidate promoted to production: `6ab9587c6a912037fe9fa43e`, published 2026-09-27 17:58:44 UTC (2026-09-28 01:58:44 Asia/Shanghai). Netlify API subsequently confirmed the actual production pointer.
- [Immutable deployment](https://6ab9587c6a912037fe9fa43e--charming-salamander-fc1af0.netlify.app).
- Rollback retained: 5.19.3 deployment `6ab904dffb745ba5eb1e07f6`. No rollback was required.

## Acceptance and evidence

- Local unit tests **144/144**; typecheck, lint/format, production build, package exports/publint, release contract, version history and data/entity checks pass. Source SHA256 comparison covers **10,202 files / 14,414,758,248 bytes**, with zero changes. All 99 settings parse without mutation. Index records are identical except the release metadata; schema remains 1.2. Editor's 31 staged files are byte-identical.
- [Final implementation CI](https://github.com/Shuang-su/Metaflow/actions/runs/36337903493): Viewer unit/type/build/budget, Linux dev and production E2E, CodeQL, documentation and data jobs passed. The aggregate is red because an obsolete governance check requires legacy completionManifest fields absent from accepted existing history. This failure is disclosed; current candidate MCL does not make it a new gate. No obsolete records were invented or checks bypassed.
- Chromium WebGL **18/18** scene/API/fault cases; WebGPU **7/7** plus a dedicated gradient-direction fixture; WebKit WebGL **8/8** including gradient/mobile controls. Scenarios include ordinary SOG, environment composition, Firefly/Dayun streaming LOD, partial settings, delayed/missing collision, retry and terminal errors, annotations, no-UI/double embeds, input isolation, destruction during loading, native 4096² captures and queued failure recovery. Expected desktop/mobile layout changes were visually reviewed before snapshot updates.
- Paired baseline/candidate camera position, target and FOV match. Native RGBA gradient rows and on-screen orientation are consistent between WebGL and WebGPU.
- Two analytics-enabled embedded instances against a mock sink each emit one start/first-frame/summary; repeated destroy is idempotent and destroyed instances stop heartbeats.
- Candidate and production each pass **499 HTTP checks** across 99 canonical routes, 20 aliases, referenced primary/settings/environment/cover/voxel files and Editor entry. File Content-Length matches staged bytes where supplied; no missing routes or HTML fallback for assets.
- Candidate and production real-browser checks cover cat, Sakura+environment, Firefly and Dayun. No uncaught scripts or HTTP errors. Production analytics responses succeed and report **5.20.0 / 348f6fd**, with one session start/first-frame/summary per page.
- Production observation: **2026-09-27T18:02:03.877Z → 2026-09-27T18:17:06.904Z**, **903.0 seconds**, 27 periodic checks. Persistent SOG and large-LOD sessions remain loaded; no context loss, uncaught exception, HTTP failure or duplicate start/first-frame/summary. End-of-session analytics are accepted. This is bounded synthetic observation, not a claim about all visitors or backend analytics database contents.

Local detailed logs, screenshots and JSON evidence remain in `.codex-work/viewer-1352/` in the primary project checkout; deployment payload is under the MF-85 worktree's `.codex-work/deploy/5.20.0-final/`. These caches are not product assets or committed bulk artifacts.

## Accepted cost and remaining limits

- The user explicitly accepted the new upstream allocator's memory cost on 2026-09-28: at the same 4M point budget and matched Dayun trajectory, settled residency grows **16→41 chunks**, texture allocations approximately **272→514 MiB**. Interaction frame-interval medians remain close (**16.7→16.4 ms**); API-ready proxy median grows **963→1079 ms**. Budgets, source settings and quality were not reduced. Counters are browser/engine observations, not system RSS or GPU timers.
- Dayun `1_144/meta.json` already contains a 10,346-byte JPEG (SHA256 `a2b47a1dd3248537e98f3bdfc85dfbd34f621b9ff8550cf21711bab5a88dbf2c`); local, LFS and prior production bytes match. New validation routes it through recoverable failure/coarse LOD rather than an unhandled engine exception. Source bytes remain unchanged.
- Physical headset XR was not tested. Browser capability/state/fallback validation does not substitute for headset acceptance.
- The candidate CLI initially rejected `--context` with `--no-build`; removing the incompatible CLI option allowed deployment of the already production-configured build. Browser evidence collection was adjusted for Blob Beacon payloads and the analytics `name` field; the full observation restarted after those harness corrections. These were tooling failures, not omitted product test failures.

## Scope and local integration

Preserve existing resources, routes, camera/animation/loading/capture semantics, Metaflow branding/locales and independent Editor. Add stable upstream layout/annotations and typed instance APIs. Exclude experimental renderer #314, navigation experiments and npm publication. Full specification, plan and adoption decisions remain in this directory. After this production completion record merges, remote main will be merged normally into the primary local main, preserving its 18 research commits and untracked lab; the final local checkpoint is reported in MF-85 and the Codex handoff.
