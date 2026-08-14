---
change_id: MF-30
terminal_state: ready-for-release
generated_at: 2026-08-14T04:24:34Z
---

# MF-30 release closure source

## Closure Decision

The Change is ready for release, not closed. Product implementation, decision audit, clean release preflight, squash merge, real product-SHA reconciliation, and the formal release packet are complete. Tag, controlled deployment, production smoke, 15-minute observation, final packet regeneration, and Issue closure are still required.

## Task Disposition

- `MF-30-T01` is complete: Viewer v1.29.1 implementation, decision completion, browser validation, branch delivery, and squash integration are recorded.
- `MF-30-T02` is partial: release-channel preparation, clean preflight, merge, and release-record alignment are complete; immutable Tag, workflow/deploy, smoke, observation, final closure commit, Release update, and Issue closure remain.

## Plan Amendments and Deviations

Revision 1 covered the staged product upgrade and originally stopped at review. Revision 2 was explicitly authorized on 2026-08-14 and adds the formal production release. The clean package has 21 files rather than the earlier 25-file branch result because the clean fixture excludes stale local `public/editor` output; required runtime entries and maps remain present. No product-source deviation was required. A first long GitHub body update failed with HTTP 400 because an interactive terminal corrupted the payload; the non-interactive encoded retry succeeded and was read back. A reused release-record fixture initially retained an old `node_modules` symlink and made `npm ls` report `ELSPROBLEMS`; replacing it with a clean `npm ci` made dependency validation pass. The first release-record script run passed 67/68 and revealed that the new assertion described a shorter pending-release phrase than the Ledger; the test was corrected to require the full release-packet, Tag, controlled deploy, smoke, and 15-minute observation boundary. The generated completion documents then exposed 17 false missing-link reports because embedded source links were resolved from `completion/`; the checker received a completion-only Change-root fallback plus positive and negative fixtures. Its first full rerun was 69/70 because Finder created `references/.DS_Store`; immutable-reference validation rejected the pollution, the exact local file was removed, and the suite passed 70/70. Reference-validator attempts with unsupported `--local` and an empty `--upstream-cache` were corrected to the supported local mode and isolated online shallow-fetch mode. A WebGPU rerun first named a removed standalone spec and returned `No tests found`; the configured extended WebGPU project then passed 1/1. The final release-record pack added only the 31-byte pending-release README change relative to the prior product-checkpoint pack; runtime bundle bytes were unchanged.

## Implementation and External Effects

PR #41 squash merged as `26e311c010aea4a6202521453a034d5aef3cea54`; `origin/main` matched and the remote head branch was deleted. Release-record commit `18a164d64f5415f3dba9eed354192dd99f81bbec` aligns Version History, public mirrors/index, E2E fixture, README navigation, and Viewer Ledger to that real SHA and removes branch-only maintenance refs from main ancestry records. GitHub `production` Environment, main-only branch policy, required secret names, and the reusable Netlify controlled-release hook were configured and read back. No secret value or hook URL is stored here.

## Verification and Review

The exact PR HEAD passed Viewer `85/85`, format, lint, typecheck, publint, production and Debug Engine builds, DOMPurify `3.4.13`, zero production audit vulnerabilities, package/map/consumer checks, E2E build `4/4`, extended WebGPU `1/1`, data/platform/governance, script `68/68`, Python `8/8`, 12 local reference digests, and 11 upstream online identities. The release packet subsequently passed the expanded script suite `70/70`, Python `8/8`, 109-file Markdown validation, the 12,761-file repository scan, a fresh Viewer `85/85`, default/Debug builds, production audit 0, E2E `4/4` plus WebGPU `1/1`, packed-tarball Webpack consumers, complete data checks, and all local/online reference identities. No independent reviewer completed a review; the release proceeds under explicit user authorization with that limitation disclosed.

## Release, Rollback and Observation

The immutable Tag and production deploy do not yet exist. The Tag must point to the complete release-packet commit. Production must use the controlled workflow and a Netlify deploy whose `commit_ref` matches that Tag target. Rollback deploy is `6a7a18b49094c6c76eff2482`; observation length is 15 minutes after immediate smoke.

## Remaining Risks and Follow-up Changes

Physical iOS/Android and immersive XR remain unverified. SH `1/0.2` can increase small-motion updates; on-demand rendering requires future dynamic surfaces to request frames; top-level fetches have no new timeout or `Retry-After`. Future streaming/highest-quality source labels and switching are a separate data-label Change.

## Ledger, Version, PR, and Release Links

- Issue: https://github.com/Shuang-su/Metaflow/issues/30
- Integrated PR: https://github.com/Shuang-su/Metaflow/pull/41
- Product commit: `26e311c010aea4a6202521453a034d5aef3cea54`
- Merge-record commit: `18a164d64f5415f3dba9eed354192dd99f81bbec`
- Tag, workflow run, Netlify immutable deploy, production smoke, observation, GitHub Release, and final closure commit will be recorded after they exist.

## Redactions

No repository text redactions were required. Credentials, secret values, and the build-hook URL were excluded at source and are not represented by placeholders.

## Final Response Delivery

The user has received progress updates through merge and release-record preparation. The final response remains withheld until production smoke, observation, final external readback, and Issue closure are complete.
