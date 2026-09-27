# MF-81 production completion — Viewer 5.19.3

Published on 2026-09-27 after explicit user authorization to upload and publish the reviewed resources.

## Release identity

- Product: `f999471a1bc5f3225430e05a9cb4ea85e6ef8770`, [PR #82](https://github.com/Shuang-su/Metaflow/pull/82).
- Release record: `1b9695badc2c1dbb3241cc2b5bd0b9b64326827c`, [PR #83](https://github.com/Shuang-su/Metaflow/pull/83).
- Immutable tag: `viewer-v5.19.3`, pointing to the release record; public product gitRef is `f999471`.
- Netlify deployment: `6ab904dffb745ba5eb1e07f6`, state ready; Netlify API confirmed it is the site's published deployment.
- [Production](https://metaflow.shuang-su.com/) and [immutable deployment](https://6ab904dffb745ba5eb1e07f6--charming-salamander-fc1af0.netlify.app/).
- Prior rollback target retained: Viewer 5.19.2 deployment `6a8087d8ee37ee534090c5a2`.

## Result and acceptance

99 published resources (87 existing + 12 approved), index schema 1.2 unchanged. Imported 69 files, 214,825,674 bytes: three Mangzhong packages and nine SZTUCCF260919 packages. The 12 covers are source-camera 4096² static lossless WebP, totaling 60,339,538 bytes. No public tags, guessed devices or inferred ACG capture dates were added. Original source exports and review previews were preserved. Only the copied ACG environment URLs were adapted; cameras, animations, background and post-processing remained identical.

| Acceptance | Evidence/result |
|---|---|
| Identity, names, routes | Approved mapping in [Spec](spec.md); 12 canonical routes and 9 aliases loaded the correct model/settings/environment in Chromium |
| Source integrity | 69 source hashes checked on import; published models, voxel pairs and covers unchanged; 9 settings differ only in declared environment URL |
| Old resource compatibility | All 87 previous resource objects compare equal to production readback; their routes remain unchanged |
| Public file integrity | Full readback of all 69 new files from production; byte counts and SHA-256 match local release files; WebP content type image/webp |
| Version/metadata | Production index and version-history mirror match final local files exactly: 5.19.3 / f999471 / 99 resources |
| Viewer | All 12 canonical scenes rendered; all 9 aliases independently asserted the expected scene files, no page errors |
| Responsive/default opening | 390×844 touch/mobile emulation of Mangzhong 00:02 and Lolita, with normal opening enabled, rendered without page errors |
| Existing endpoints | Production analytics collector meta present; Editor entry HTTP 200; Netlify published-deploy identity confirmed |

Local checks: 3 generator regression tests, 1 data-validator test, 9 existing route/source tests, 8 version-history tests; data --check-files, release contract, platform validation, production-context build and Git diff checks passed. Candidate deployment `6ab902d091d112333d001c91` also passed hosted scene/metadata checks before production.

## Resolved failures and verification limits

- Managed worktree creation failed on the nearly-full system volume; used an isolated worktree on Prism with existing large assets shared locally. Original main/research content was preserved.
- Sparse checkout initially omitted analytics/Supabase inputs for the build/platform validator; restored the required tracked inputs and reran both successfully.
- Legacy tests hardcoded 87 resources and the previous current/future version. Updated counts and fixtures to the approved batch. Release-history checks now accept original published tag provenance for prior recovery commits and verify release-record index commits contain no resource content changes. An initial post-record test failure was resolved and the final 8 tests passed.
- Same-resource alias spelling variants (existing Bijiashan routes) are not cross-resource collisions; the normalized-route test now verifies a unique owning canonical route.
- This is implementer self-review, not independent review. Full unrelated Viewer/Editor suites and a physical-device smoke were not rerun. Mobile checks are Chromium emulation. No claim of a 15-minute production observation window is made; repeated readback and scene checks were completed during publication.
- Original-camera wide cover crops can clip head/feet. Dynamic-cover tooling and walk-navigation acceptance are outside this publication.

Large upload/build/readback evidence remains in the task's ignored .codex-work area. Public completion is this record, [Issue #81](https://github.com/Shuang-su/Metaflow/issues/81), the PRs and [GitHub Release](https://github.com/Shuang-su/Metaflow/releases/tag/viewer-v5.19.3). Any rollback must preserve this release history and append its own record.
