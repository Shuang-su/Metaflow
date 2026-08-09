---
change_id: MF-1
status: verifying
generated_at: 2026-08-09T16:20:00Z
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

## Agent Reply Summary

- Reported that MF-1 is implemented locally as a reviewable candidate, not yet an effective or closed MCL release.
- Preserved the user's complete corrections and implementation request in original order, and kept descriptive research/case narrative out of the normative specification.
- Reported actual build, browser, audit, GitHub, and configuration results, including failed attempts and corrected test fixtures.
- Committed to an honest `partial` result until the branch is reviewed, `required / gate` succeeds on `main`, the Ruleset is applied and re-read, GitHub Project authorization is available, and Phase 9 pilots are completed.
- Did not claim production, release, rollback, Design onboarding, Upstream Sync adoption, or multi-case pilot evidence that did not occur.

## Files and External Effects

- Local protection branch: `codex/preserve-design-20260809` at the user's original local HEAD.
- Isolated implementation branch/worktree: `codex/mcl-v1` at `/Volumes/Prism/Metaflow-mcl-v1`.
- GitHub Issue #1: <https://github.com/Shuang-su/Metaflow/issues/1>.
- GitHub Issue #2: <https://github.com/Shuang-su/Metaflow/issues/2>.
- GitHub labels: six `component/*`, seven `type/*`, and four `risk/*` labels created and verified.
- Repository merge settings: squash enabled; merge commits and rebase merges disabled; merged branches auto-delete; state re-read after mutation.
- No PR, merge, tag, GitHub Release, Netlify deploy, rollback, Supabase remote write, GitHub Project, or active Ruleset existed at the time of this snapshot.

## Validation, Failures, and Omissions

- Completion JavaScript tests: 14 passed.
- Python platform/data tests: 4 passed.
- Viewer baseline: 52 tests passed; typecheck and build passed.
- Editor baseline: lint and build passed; upstream peer warnings remain non-fatal.
- Viewer E2E: dev/watch 4 passed; production build 4 passed; desktop/mobile baselines visually inspected.
- In-app browser: ready state and Settings interaction verified at `1440×900` and `390×844`.
- Platform, data, 39 Markdown files, 10,812 repository paths, targeted changed JSON, secret scan, YAML parsing, JavaScript syntax, and `git diff --check` passed in local runs.
- Five Action commit pins resolved through the GitHub API; Netlify Build Hook/deploy/restore fields and endpoints were checked against official documentation.
- A Ruby 2.6 keyword incompatibility and an over-broad all-`.json` parse were rejected and rerun with compatible, correctly scoped checks; neither represented a changed-file syntax defect.
- Direct `concurrently` and `postcss` advisories were removed. Residual audit: Viewer full tree 5 transitive (1 moderate, 4 high), Viewer production view 1 moderate, Editor full tree 5 high, Editor production view 0; Issue #2 owns follow-up.
- GitHub-hosted CI, CodeQL, dependency review, Netlify Preview, Ruleset enforcement, Project fields, production release/rollback, scheduled extended browsers, and Phase 9 pilots remain unverified or unexecuted.
