---
change_id: MF-1
status: verifying
generated_at: 2026-08-09T18:00:40Z
---

# Agent Actions and Replies Summary

## Task Inventory

| Task ID | Tool | Status | Authorized result |
| --- | --- | --- | --- |
| MF-1-T01 | Codex | partial | Implement the MCL repository contract, validate the local baseline, publish a reviewable branch and record every unmet activation or pilot condition. |

## Chronological Action Summary

1. Inspected both Git worktrees and protected the user's local `main`, nine unpublished Design commits, untracked Swiftgram research, and earlier MCL draft with `codex/preserve-design-20260809`.
2. Created isolated worktree `/Volumes/Prism/Metaflow-mcl-v1` on `codex/mcl-v1` from `origin/main@95d0115c`; no Design research or runtime product change was imported.
3. Opened GitHub Issue #1 as Change `MF-1`, added risk/component/type labels, and wrote Proposal, Spec, complete Plan, operational MCL specification, contributor rules, agent rules, roadmap, templates, schemas, and GitHub forms.
4. Added `metadata/components.json` and changed Viewer post-cutoff version enforcement to use registry-based component classification instead of treating unrelated Design or Platform paths as Viewer releases.
5. Implemented `scripts/mcl.mjs` with deterministic Completion generation/check modes, raw-file SHA-256 manifests, risk-tier artifacts, exact embedded request/Plan checks, task sequencing, lifecycle and Plan revision checks, stale-output detection, placeholder/redaction/secret checks, and backward-compatible Version History 1.1 validation.
6. Added platform, data, Markdown-link, repository-hygiene, Completion, and upstream-target test fixtures; fixed failures found while exercising malformed request counts, stale dossiers, unsafe settings, unsupported ASCII PLY, and ineffective visual masks.
7. Added path-routed CI with stable `required / gate`, pinned and API-verified Action SHAs, least permissions, timeouts, sparse checkouts, component jobs, dependency review, CodeQL, bundle budgets, and fixture-free build artifacts.
8. Added protected release, rollback, extended-browser, and upstream discovery workflows. Production actions require the `production` GitHub Environment and explicit manual inputs; no production deployment, rollback, Supabase migration, or release was triggered.
9. Added deterministic Viewer browser fixtures and Playwright checks for development watch and production builds at `1440×900` and `390×844`; manually inspected the baselines and rejected/rebuilt an all-mask false-positive baseline.
10. Used the in-app browser against the local production build to confirm the binary PLY reaches ready state and the Settings panel works at desktop and mobile widths.
11. Ran the existing Viewer and Editor baselines. Updated two direct build dependencies to compatible security-fix versions, reran audits, and opened Issue #2 for residual transitive advisories rather than forcing a risky major upgrade into MF-1.
12. Created and re-read the repository's MCL labels; configured squash-only merge and automatic branch deletion; re-read GitHub to verify both effects.
13. Attempted read-only GitHub Project discovery. The active GitHub token lacks `read:project`, so Project creation and field configuration were not attempted.
14. Performed separate Spec Compliance and Code Quality passes. Negative tests exposed and fixed non-canonical checksum handling, premature Dossier section parsing, missing risk-tier/embedded-content checks, sparse Markdown reads, fixture-contaminated artifacts, and incomplete Netlify published-deploy verification.
15. Committed and pushed the candidate, opened draft PR #3, and followed each hosted check to a terminal result instead of treating local success as hosted evidence.
16. Corrected the first hosted failures by making tracked Markdown links sparse-aware, adding only the required Viewer support files, upgrading and API-verifying current Action pins, enabling the dependency graph, and re-reading that external configuration.
17. Reproduced the Git LFS pointer path with `GIT_LFS_SKIP_SMUDGE=1`; pinned the Dayun manifest OID and size for small PR checks while retaining full 293-tile validation when LFS data is present.
18. Split Playwright baselines by operating system. Added failure-artifact upload, downloaded the real GitHub Ubuntu screenshots, visually inspected desktop/mobile output, and committed Linux baselines without increasing the pixel-difference tolerance.
19. Investigated two high-severity GitHub Advanced Security annotations, removed secret-derived finding details from CLI/JSON logs, added a non-disclosure regression test, and reran repository secret scanning.
20. Re-ran hosted CI through [run 31325948588](https://github.com/Shuang-su/Metaflow/actions/runs/31325948588). Every component job, both CodeQL checks, dependency review, and `required / gate` passed. Enabled and re-read Dependabot security updates, secret scanning, and push protection.
21. Replaced the stale draft PR description with the actual hosted results, reviewed platform baseline links, applied security state, and remaining activation conditions; re-read PR #3 to confirm the update while preserving draft/partial status.
22. Refreshed the Bootstrap archive in commit `e47dc4fa` and followed hosted run [31326306006](https://github.com/Shuang-su/Metaflow/actions/runs/31326306006); every MCL job, stable `required / gate`, and the separate GitHub Advanced Security CodeQL check passed.
23. Observed that enabling Dependabot security updates created PRs #4-#8 against the non-Active `supersplat-viewer-v1.18.2` reference snapshot. Created and re-read T3 Upstream Sync Issue #9 so those changes cannot be mistaken for routine Active-product dependency updates; no adopt, merge, defer, skip, or close decision was made.
24. Re-read the two original Metaflow plans, Codex task `019fe6c4-2752-76e1-98a1-0337e7f68f2d`, the shared GPT conversation, SztuCode PR #67, its Spec/Plan commits, and the repository's own policy files after the user corrected the attribution.
25. Corrected the normative model: the Superpowers instruction is a collaborator's Task-local Plan choice, not a SztuCode-native Skill or repository-wide policy. Added explicit `reference / task-local / repository-policy / enforced-control` levels, tool-neutral Metaflow ASDD wording, and a distinction between author self-review and independent non-author Review.
26. Re-read Netlify Deploy Preview `6a78b7bf7f384100088b3e12`. It remained `building` with pending PR checks and no successful smoke evidence; no manual Netlify or production write was performed.

## Agent Reply Summary

- Reported that MF-1 is implemented locally as a reviewable candidate, not yet an effective or closed MCL release.
- Preserved the user's complete corrections and implementation request in original order, and kept descriptive research/case narrative out of the normative specification.
- Accepted the user's attribution correction: SztuCode evidence demonstrates one collaborator-authored Plan instruction for PR #67, not a native Superpowers Skill or project-wide adoption. Reported the four-level authority model used to prevent the same category error.
- Reported actual build, browser, audit, GitHub, hosted-CI, CodeQL, and configuration results, including failed attempts, security findings, and corrected fixtures.
- Reported that PR-head `required / gate` and both CodeQL checks are green while retaining an honest `partial` result because Netlify Preview is still pending and human T3 review, merge, a successful `main` run, Ruleset activation, GitHub Project authorization or exception, and Phase 9 pilots are incomplete.
- Did not claim production, release, rollback, Design onboarding, Upstream Sync adoption, or multi-case pilot evidence that did not occur.

## Files and External Effects

- Local protection branch: `codex/preserve-design-20260809` at the user's original local HEAD.
- Isolated implementation branch/worktree: `codex/mcl-v1` at `/Volumes/Prism/Metaflow-mcl-v1`.
- GitHub Issue #1: <https://github.com/Shuang-su/Metaflow/issues/1>.
- GitHub Issue #2: <https://github.com/Shuang-su/Metaflow/issues/2>.
- GitHub Issue #9: <https://github.com/Shuang-su/Metaflow/issues/9>.
- Draft PR #3: <https://github.com/Shuang-su/Metaflow/pull/3>.
- Published implementation commits: `fb0a881b`, `afd5628a`, `600f1420`, `51ec19e9`, `a46f294e`, `39283ce4`, and `e47dc4fa`.
- Dependabot automatically opened PRs #4-#8 for the reference snapshot after the security-update setting was enabled; none was merged or approved.
- Netlify automatically started Deploy Preview `6a78b7bf7f384100088b3e12` for `e47dc4fa`; it remained `building` and unverified.
- GitHub labels: six `component/*`, seven `type/*`, and four `risk/*` labels created and verified.
- Repository merge settings: squash enabled; merge commits and rebase merges disabled; merged branches auto-delete; state re-read after mutation.
- Repository security: dependency graph/vulnerability alerts, Dependabot security updates, secret scanning, and push protection enabled and re-read.
- No merge, tag, GitHub Release, successful Netlify Preview, production deploy, rollback, Supabase remote write, GitHub Project, or active Ruleset existed at the time of this snapshot.

## Validation, Failures, and Omissions

- Completion JavaScript tests: 18 passed, including missing execution authority, false distinct-review identity, and unsupported repository-policy/enforced-control claim regressions.
- Python platform/data tests: 5 passed.
- Viewer baseline: 52 tests passed; typecheck and build passed.
- Editor baseline: lint and build passed; upstream peer warnings remain non-fatal.
- Viewer E2E: Darwin dev/watch 4 passed and production build 4 passed; hosted Linux dev/watch 4 passed and production build 4 passed; all four platform-specific desktop/mobile baselines visually inspected.
- In-app browser: ready state and Settings interaction verified at `1440×900` and `390×844`.
- Platform, data, 39 Markdown files, 10,814 repository paths, targeted changed JSON, secret scan, YAML parsing, JavaScript syntax, and `git diff --check` passed in local runs.
- Five Action commit pins resolved through the GitHub API; Netlify Build Hook/deploy/restore fields and endpoints were checked against official documentation.
- A Ruby 2.6 keyword incompatibility and an over-broad all-`.json` parse were rejected and rerun with compatible, correctly scoped checks; neither represented a changed-file syntax defect.
- Direct `concurrently` and `postcss` advisories were removed. Residual audit: Viewer full tree 5 transitive (1 moderate, 4 high), Viewer production view 1 moderate, Editor full tree 5 high, Editor production view 0; Issue #2 owns follow-up.
- Hosted runs `31325948588` and `31326306006` passed Viewer, Editor, Design, Data, Reference, governance, dependency review, workflow CodeQL and `required / gate`; the separate GitHub Advanced Security CodeQL check also passed after two prior high-severity log-disclosure findings were fixed.
- Netlify Preview remained `building`; Ruleset enforcement on `main`, Project fields, production release/rollback, scheduled extended browsers, and Phase 9 pilots remain unverified or unexecuted.
