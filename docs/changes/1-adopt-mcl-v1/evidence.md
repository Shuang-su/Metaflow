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
| Platform/data unit tests | `python3 -m unittest discover -s scripts/tests -p 'test_*.py' -v` | 4 passed, 0 failed |
| Registry and version | `node scripts/mcl.mjs validate-registry`; `validate-version-history` | Passed |
| Platform config | `python3 scripts/validate_platform.py` | Netlify, Supabase, secrets, and pinned Workflow checks passed |
| Data fixture | `python3 scripts/validate_data.py` | Index, route, mirror, and path checks passed |
| Markdown links | `node scripts/check_markdown_links.mjs` | 39 available Markdown files passed; sparse-checkout omissions are skipped without masking checked-out Change documents |
| Repository hygiene | `node scripts/scan_repository.mjs` | 10,812 tracked/proposed paths passed secret and accidental-file checks |
| Viewer | `npm ci`; `npm test`; `npm run type:check`; `npm run build` | 52 tests passed; typecheck/build passed |
| Editor | `npm ci`; `npm run lint`; `npm run build` | Passed with non-fatal upstream peer/circular-dependency warnings |
| Viewer E2E dev | `npm run e2e:dev` | 4 passed across Chromium/WebGL desktop and mobile |
| Viewer E2E build | `npm run e2e:build` | 4 passed across Chromium/WebGL desktop and mobile |
| Visual | Playwright baselines plus direct image review | Desktop and mobile Settings shell inspected; ineffective full-page mask baseline was rejected and regenerated |
| Local browser | In-app browser at `1440×900` and `390×844` | Binary PLY reached ready state; Settings panel visible and interactive |
| Workflow syntax | Ruby Psych AST parse | All five Workflow files parsed |
| Contract JSON | Targeted strict JSON parse | 19 changed schema, manifest, registry, history, package, policy, and fixture files parsed |
| Action pins | GitHub Commit API re-read | All five third-party Action SHAs resolved to their expected repositories |
| Netlify API | Official Build Hook, REST API, and OpenAPI references | Verified `trigger_branch`, `trigger_title`, deploy `commit_ref`, immutable `deploy_ssl_url`, site `published_deploy`, and deploy restore endpoint before workflow review |
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

Validation retries and rejected checks:

- Ruby 2.6 rejected the newer `YAML.load_file(..., aliases:)` API; the same Psych parser's AST entrypoint then parsed all Workflow files successfully.
- A broad strict-JSON sweep was rejected because pre-existing JSONC `tsconfig` files and a legacy JPEG named `meta.json` are intentionally not strict JSON. The rerun parsed only the 19 contracts changed by MF-1.

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
- Read-only GitHub Project discovery failed because the active token lacks `read:project`; no Project write was attempted.
- Ruleset activation is intentionally deferred until `required / gate` has merged and succeeded on `main`.
- No Netlify, Supabase, production, release, rollback, tag, or deploy write occurred.

## Known limitations

- GitHub-hosted Actions, CodeQL, dependency review, and Linux visual comparison have not run.
- The implementation branch is not yet merged; MCL remains a candidate and is not effective.
- GitHub Project fields, production Environment secrets/protection, and the `main` Ruleset are not configured.
- Preview/Beta/Stable, immutable production deployment, smoke, observation, and rollback workflows are implemented but unexercised.
- Phase 9 fast-path, Design, real Upstream Sync, multi-Agent, continuation, attachment, and rollback pilots remain incomplete.
