---
change_id: MF-1
title: MCL v1.0 implementation evidence
status: verifying
component:
  - platform
risk: T3
type: governance
owner: Shuang-su
created: 2026-08-09
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/1
plan_revision: 1
completion_state: pending
supersedes: null
terminal_reason: null
---

# Evidence

This file records only commands and outcomes that actually occurred. It is updated during implementation and finalized before closure.

## Repository safety

- Protection branch: `codex/preserve-design-20260809`
- Governance branch: `codex/mcl-v1`
- Governance base: `origin/main@95d0115c`
- The original local `main`, its nine Design commits, the untracked Swiftgram directory, and the untracked prior MCL draft remain untouched.

## Validation results

| Area | Command or method | Actual result |
| --- | --- | --- |
| Completion | `node --test scripts/tests/*.test.mjs` | 14 passed, 0 failed, including missing/misordered request messages, link-only Plan, revision drift, empty summaries, placeholders, secrets, non-canonical bytes, stale output, and unresolved Task disposition |
| Platform/data unit tests | `python3 -m unittest discover -s scripts/tests -p 'test_*.py' -v` | 5 passed, 0 failed, including the public-output secret non-disclosure regression |
| Registry and version | `node scripts/mcl.mjs validate-registry`; `validate-version-history` | Passed |
| Platform config | `python3 scripts/validate_platform.py` | Netlify, Supabase, secrets, and pinned Workflow checks passed |
| Data fixture | `python3 scripts/validate_data.py` | Index, route, mirror, and path checks passed |
| Markdown links | `node scripts/check_markdown_links.mjs` | 39 available Markdown files passed; sparse-checkout omissions are skipped without masking checked-out Change documents |
| Repository hygiene | `node scripts/scan_repository.mjs` | 10,814 tracked/proposed paths passed secret and accidental-file checks |
| Viewer | `npm ci`; `npm test`; `MCL_SMALL_FIXTURES=1 npm test`; `npm run type:check`; `npm run build` | Both full-data and small-fixture modes passed 52 tests; typecheck/build passed |
| Editor | `npm ci`; `npm run lint`; `npm run build` | Passed with non-fatal upstream peer/circular-dependency warnings |
| Viewer E2E dev | `npm run e2e:dev` | 4 passed across Chromium/WebGL desktop and mobile |
| Viewer E2E build | `npm run e2e:build` | 4 passed across Chromium/WebGL desktop and mobile |
| Visual | Platform-specific Playwright baselines plus direct image review | Darwin and Linux desktop/mobile Settings shells inspected; ineffective full-page mask baseline was rejected, platform rendering was separated, and all four accepted images contain the required controls |
| Local browser | In-app browser at `1440×900` and `390×844` | Binary PLY reached ready state; Settings panel visible and interactive |
| Workflow syntax | Ruby Psych AST parse | All five Workflow files parsed |
| Contract JSON | Targeted strict JSON parse | 19 changed schema, manifest, registry, history, package, policy, and fixture files parsed |
| Action pins | GitHub Commit API re-read | All five third-party Action SHAs resolved to their expected repositories |
| Netlify API | Official Build Hook, REST API, and OpenAPI references | Verified `trigger_branch`, `trigger_title`, deploy `commit_ref`, immutable `deploy_ssl_url`, site `published_deploy`, and deploy restore endpoint before workflow review |
| Sparse checkout | Fresh governance clone; fresh Viewer clone; `GIT_LFS_SKIP_SMUDGE=1` pointer clone | Governance checks passed without product trees; Viewer test/typecheck/build and both E2E modes passed from the declared small checkout; the unresolved Dayun LFS pointer passed 52 tests by its pinned OID/size |
| Hosted CI | [run 31325948588](https://github.com/Shuang-su/Metaflow/actions/runs/31325948588) | Viewer, Editor, Design, Data, Reference, governance, dependency review, workflow CodeQL, GitHub Advanced Security CodeQL, and stable `required / gate` passed |
| Source hygiene | `git diff --check`; Node syntax checks | Passed |

Browser fixture:

- generated, redistributable one-Gaussian binary PLY;
- fixed route, settings, language, timezone, DPR, reduced motion, WebGL, ready signal, desktop viewport, and mobile viewport;
- the same fixture is exercised in development watch and production build modes.

Review corrections:

- Manifest hashing now rejects non-canonical source bytes, so third-party `shasum` output must equal the recorded SHA-256.
- Completion validation now enforces T2 Spec/T3 Proposal presence, exact embedded request and Plan text, ordered message markers, matching Plan revision, non-empty sections, Task filename/ID consistency, lifecycle consistency, redaction counts, timestamps, and unresolved placeholders.
- The Dossier section parser was replaced after a negative test exposed premature termination at blank lines; exact embedded documents are fenced so the 13 top-level chapters remain unambiguous.
- Viewer CI excludes E2E fixture data from build artifacts, and release/rollback workflows verify both the immutable deploy and the production site's published deploy before reporting success.
- Sparse Viewer tests pin the Dayun LFS object by SHA-256 and byte size without downloading the 157,118-byte manifest or 293 tile payloads; full-data runs still parse every tile URL and stat every JSON/binary pair.
- Playwright snapshot paths now include the operating-system platform. Darwin and Linux baselines are reviewed independently instead of weakening the 1% pixel-difference budget.
- Platform validation never writes possible secret findings to CLI or JSON logs; a regression test proves only a fixed-shape boolean result leaves the process.

Validation retries and rejected checks:

- Ruby 2.6 rejected the newer `YAML.load_file(..., aliases:)` API; the same Psych parser's AST entrypoint then parsed all Workflow files successfully.
- A broad strict-JSON sweep was rejected because pre-existing JSONC `tsconfig` files and a legacy JPEG named `meta.json` are intentionally not strict JSON. The rerun parsed only the 19 contracts changed by MF-1.
- Hosted run `31324658384` exposed a dependency-graph prerequisite plus sparse governance and Viewer omissions. The dependency graph was enabled and re-read; sparse path and tracked-link handling were corrected.
- Hosted run `31325117956` passed governance, dependency review, CodeQL, Editor, Design, Data, and Reference, then exposed the Dayun LFS pointer in the Viewer test. The small-fixture contract was changed to validate the pointer while retaining full-data checks elsewhere.
- Hosted run `31325330480` passed Viewer unit/type/build and exposed cross-platform visual drift. Run `31325585391` uploaded Linux actuals as diagnostics; both images were inspected before acceptance. Run `31325739835` passed `required / gate` and exposed two separate GitHub Advanced Security findings for secret-derived logging.
- Docker CLI was available but its daemon was not running. No Docker result was claimed; the real GitHub Ubuntu artifact was used for Linux baseline review.
- Hosted run `31325948588` passed every workflow job, `required / gate`, and the independent GitHub Advanced Security CodeQL check after log output was sanitized.

Dependency audit after compatible direct updates:

- Viewer full tree: 5 transitive findings (1 moderate, 4 high), no direct findings;
- Viewer `--omit=dev`: 1 moderate transitive finding;
- Editor full tree: 5 high transitive findings, no direct findings;
- Editor `--omit=dev`: 0 findings;
- follow-up: <https://github.com/Shuang-su/Metaflow/issues/2>.

## External configuration

- Created and re-read GitHub Issue #1 with `component/platform`, `type/proposal`, and `risk/T3`.
- Created and re-read the component/type/risk label taxonomy from `.github/labels.json`.
- Set and re-read repository merge controls: squash enabled, merge commits disabled, rebase merge disabled, delete branch after merge enabled.
- Created and re-read Issue #2 for residual transitive dependency advisories.
- Published commits `fb0a881b` through `39283ce4` on `codex/mcl-v1` and created draft PR [#3](https://github.com/Shuang-su/Metaflow/pull/3); the PR was re-read as open, draft, mergeable, and clean.
- Enabled the repository dependency graph/vulnerability alerts and re-read the endpoint successfully so dependency review could execute.
- Enabled and re-read Dependabot security updates, secret scanning, and secret-scanning push protection.
- Read-only GitHub Project discovery failed because the active token lacks `read:project`; no Project write was attempted.
- Ruleset activation is intentionally deferred until `required / gate` has merged and succeeded on `main`.
- No Netlify, Supabase, production, release, rollback, tag, or deploy write occurred.

## Known limitations

- The implementation branch is not yet merged; MCL remains a candidate and is not effective.
- GitHub Project fields, production Environment secrets/protection, and the `main` Ruleset are not configured.
- No GitHub Deployment or Netlify Preview check was present for the PR head; Preview remains unverified.
- Preview/Beta/Stable, immutable production deployment, smoke, observation, and rollback workflows are implemented but unexercised.
- Phase 9 fast-path, Design, real Upstream Sync, multi-Agent, continuation, attachment, and rollback pilots remain incomplete.
- GitHub reported existing dependency alerts on the default branch after security features were enabled; MF-1 does not silently dismiss or rewrite those findings, and Issue #2 tracks the directly observed npm follow-up scope.
