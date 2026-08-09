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
plan_revision: 4
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
- Revision 3 recovery refs: `codex/safety-main-pre-mcl-v1-20260810@47ffd86e` and `codex/safety-mcl-v1-pre-revision3-20260810@590377bd`
- The original local `main`, its nine Design commits, the untracked Swiftgram directory, and the untracked prior MCL draft remain untouched.

## Revision 3 source-material preservation

| Check | Actual result |
| --- | --- |
| Source | `/Volumes/Prism/Metaflow/docs/metaflow-change-lifecycle-v1.0-complete-plan.md` remained in place as the untracked local recovery copy |
| Archive | Copied byte-for-byte to `completion/source-materials/metaflow-change-lifecycle-v1.0-complete-plan.md` |
| Line count | Source and archive both reported 1,575 lines |
| SHA-256 | Source and archive both reported `37f45424cc233af72801e1d91053d4581d1bbcdfb73627612d6f28f018af85a3` |
| Byte comparison | `cmp -s` exited `0` |
| Classification | `source-materials.json` and Manifest 1.1 classify it as a non-normative `predecessor-plan` from a `user-supplied-workspace-file` |
| Disposition | `source-material-disposition.md` covers all 21 top-level numbered sections using `archived / absorbed / superseded / evidence-only / change-plan` |

The compatibility entry at `docs/metaflow-change-lifecycle-v1.0-complete-plan.md` contains no duplicated normative rules. It links the original archive, normative specification, effective MF-1 Plan, Completion Dossier, and disposition record.

## Revision 3 dependency and PR boundary

- PRs #4-#8 were created by Dependabot against the versioned `supersplat-viewer-v1.18.2` reference snapshot after repository security features were enabled.
- Issue #9 records the resulting Upstream Sync Proposal signal. MF-1 does not make an Adopt, Defer, Skip, close, or merge decision for those PRs.
- `supersplat-v2.28.0/package.json` and `package-lock.json` were restored to their exact `origin/main` blobs (`6d07aba07665fc79337ef43834325e1bff326c93` and `8c54c7e1433d494ad69ef7489b121d7ce52acde0`); `git diff origin/main --` reports no change for either file.
- `.github/dependabot.yml` now targets only `/metaflow-viewer` and GitHub Actions. The platform validator rejects npm targets containing `supersplat-v*` or `supersplat-viewer-v*` path components.
- Component ownership is used for CI routing and version attribution; it is not evidence that a versioned snapshot is an Active dependency-maintenance target.

## Validation results

Revision 3 pre-push local Gate:

| Area | Command or method | Actual result |
| --- | --- | --- |
| Completion | `node --test scripts/tests/*.test.mjs` | 37 passed, including immutable historical Task revisions, Task-specific requests/Plans, Manifest 1.0 compatibility, Manifest 1.1 aggregation, source-material path/checksum/secret/redaction checks, active strict validation, and closure-time ordering |
| Platform/data unit tests | `python3 -m unittest discover -s scripts/tests -p 'test_*.py'` | 7 passed, including positive and negative Dependabot versioned-snapshot routing |
| Deterministic Completion | `node scripts/mcl.mjs generate docs/changes/1-adopt-mcl-v1`; `node scripts/mcl.mjs check-all --strict` | Generated Manifest 1.1 and deterministic aggregates; strict active-Change validation passed without treating MF-1 as terminal |
| Registry/version/data | `validate-registry`; `validate-version-history`; `python3 scripts/validate_data.py` | Passed |
| Platform and links | `python3 scripts/validate_platform.py`; `node scripts/check_markdown_links.mjs` | Passed; 46 Markdown files checked, with only the exact registered non-normative archive excluded from live-link traversal |
| Repository hygiene | `node scripts/scan_repository.mjs`; `git diff --check` | 10,823 files passed the secret/accidental-file scan; whitespace check passed |
| Viewer | `npm ci`; `npm test`; `npm run type:check`; `npm run build` | 52 tests passed; typecheck and build passed; install reported 5 existing transitive advisories |
| Viewer E2E | `npm run e2e:dev`; `npm run e2e:build` | 4 development-mode and 4 production-build Chromium/WebGL desktop/mobile tests passed |
| Editor | `npm ci`; `npm run lint`; `npm run build` | Passed; install reported existing peer-resolution warnings and 9 audit findings; Rollup reported non-fatal upstream circular-dependency warnings |
| Bundle budgets | Viewer public+dist and Editor dist size checks | Viewer 16,680 KiB ≤ 20,480 KiB; Editor 31,472 KiB ≤ 51,200 KiB |
| Reference/Design | Reference license/version loop; Design source presence check | All three tracked reference manifests passed; no tracked Design implementation exists on this ref |
| Immutability | SHA-256, line count, Git and worktree re-read | T01 remained `616c6d...101d`; predecessor archive remained 1,575 lines and `37f454...85a3`; local main remained `47ffd86e`, nine commits ahead, with only the two pre-existing untracked paths |

| Area | Command or method | Actual result |
| --- | --- | --- |
| Completion | `node --test scripts/tests/*.test.mjs` | 18 passed, 0 failed, including missing/misordered request messages, link-only Plan, revision drift, missing execution authority, false independent-review identity, unsupported repository-policy/enforced-control claims, empty summaries, placeholders, secrets, non-canonical bytes, stale output, and unresolved Task disposition |
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
| Hosted CI archive refresh | [run 31326306006](https://github.com/Shuang-su/Metaflow/actions/runs/31326306006) | Every MCL workflow job, stable `required / gate`, and the separate GitHub Advanced Security CodeQL check passed at `e47dc4fa` |
| Hosted CI Revision 2 | [run 31327941632](https://github.com/Shuang-su/Metaflow/actions/runs/31327941632) | All MCL component jobs, 18 Completion tests, dependency review, both CodeQL checks, and stable `required / gate` passed at `66d2553d` |
| Source hygiene | `git diff --check`; Node syntax checks | Passed |

Browser fixture:

- generated, redistributable one-Gaussian binary PLY;
- fixed route, settings, language, timezone, DPR, reduced motion, WebGL, ready signal, desktop viewport, and mobile viewport;
- the same fixture is exercised in development watch and production build modes.

## Revision 4 candidate merge and post-merge evidence

The user narrowed the merge Gate before merge: Viewer/Editor source was unchanged, so full product build/E2E, product-release verification, and Netlify Preview/smoke were split from MF-1 instead of remaining hard blockers. Historical product-job results above remain factual but are not treated as release evidence.

| Area | Actual result |
| --- | --- |
| Approved PR Head | `02cb823b22cf1eb2f5fed3bd7bbb4309414bd629`; PR #3 Ready, mergeable, two historical review threads resolved/outdated |
| Exact-Head MCL Gate | [run 31331822368](https://github.com/Shuang-su/Metaflow/actions/runs/31331822368) passed governance/Completion, dependency review, both CodeQL surfaces and `required / gate` |
| Candidate merge | PR #3 squash-merged at `2026-08-09T19:43:45Z`; merge commit `6e1725ee6d24ea37fcf3bb7492606e95e0e0780b`; remote feature branch deleted |
| Tree identity | Approved Head and merge commit both resolve to tree `3b1828abbd623a9f81e334171950c7a43321c3f4`; `git diff --exit-code 02cb823b... origin/main` passed |
| MCL-only post-merge validation | 37 Node tests, 7 Python tests, strict Completion, platform validation, 46 Markdown files, and 10,823-path secret/hygiene scan passed on the identical tree |
| Main workflow | [run 31332409298](https://github.com/Shuang-su/Metaflow/actions/runs/31332409298) passed; `governance and completion`, CodeQL and `required / gate` were re-read successful |
| Enforced control | Active [Ruleset 20612630](https://github.com/Shuang-su/Metaflow/rules/20612630) was created only after the main Gate passed; detail and effective-branch-rules APIs confirmed PR-only, squash-only, resolved conversations, deletion/non-fast-forward protection and required `required / gate` |
| Issue evidence | [Issue #1 comment](https://github.com/Shuang-su/Metaflow/issues/1#issuecomment-5233527273) was added and re-read |
| Deferred Netlify Change | [Issue #15](https://github.com/Shuang-su/Metaflow/issues/15) records lightweight Preview/LFS/data-corpus work; current deploy `6a78d554571d99000892e5a4` remained `building` and is not success evidence |
| Deferred product Gate Change | [Issue #16](https://github.com/Shuang-su/Metaflow/issues/16) records path-scoped Viewer/Editor validation and release Gate design |
| Local-main safety | `/Volumes/Prism/Metaflow` remains `47ffd86e9635d7d797628a214df817f7ca60b55c`, now nine ahead/one behind remote, with the predecessor plan and Swiftgram paths still untracked |

Two temporary checkout attempts were stopped because they began hydrating or writing large product data. The first Task-created incomplete checkout consumed about 3.5 GB and was permanently deleted after its exact temporary path was verified; the second failed with `No space left on device` and left no worktree registration. No user-authored path was deleted. Cryptographic tree identity replaced further full checkout attempts.

## Adoption and enforcement claim audit

| Claim examined | Classification and result | Direct evidence |
| --- | --- | --- |
| SztuCode natively includes or requires the Superpowers `subagent-driven-development` Skill | Rejected. The instruction is `task-local`: collaborator `GuanG-1008` added it inside one Implementation Plan. | [Plan-adding commit `e452a423`](https://github.com/rojim666/SztuCode/commit/e452a42386a0a546b548e4cc6118ea0a1e4ae667), [PR #67](https://github.com/rojim666/SztuCode/pull/67) |
| A merged PR proves repository-wide method adoption | Rejected. Merge proves acceptance of that PR's content, not adoption beyond its declared scope. The separate Spec was likewise introduced for the same work. | [Spec-adding commit `35374f7a`](https://github.com/rojim666/SztuCode/commit/35374f7a2fe7fd3bdd8f78a9478f74a94127ab10), [PR #67](https://github.com/rojim666/SztuCode/pull/67) |
| The shared GPT conversation is a normative source | Rejected. It is `reference` material and contained an over-broad adoption inference; reusable ideas were translated into tool-neutral contracts. | [Shared conversation](https://chatgpt.com/share/6a788411-d11c-83e8-afac-0871d9def42d) |
| Metaflow MCL is already full repository policy or fully effective | Rejected. The candidate is installed on `main`, and the verified Ruleset is an enforced-control; pilots, activation, release/rollback rehearsal and human closure remain outstanding. | [PR #3](https://github.com/Shuang-su/Metaflow/pull/3), [Issue #1](https://github.com/Shuang-su/Metaflow/issues/1), [Ruleset 20612630](https://github.com/Shuang-su/Metaflow/rules/20612630) |
| `required / gate` is now an enforced merge control for `main` | Accepted for this specific control. It succeeded on the first merged-main run before the active Ruleset was created and was then present in the effective branch rules. | [Run 31332409298](https://github.com/Shuang-su/Metaflow/actions/runs/31332409298), [Ruleset 20612630](https://github.com/Shuang-su/Metaflow/rules/20612630) |

Review corrections:

- Revision 3 Spec-compliance pass confirmed that the candidate contains only MCL governance, Completion, CI/fixture, and exact snapshot-boundary work; Editor migration, full upstream restoration, PR #4–#8 disposition, Design/Swiftgram changes, activation, release, and closure remain excluded.
- Revision 3 code-quality pass found two integration defects before publication: strict validation could only represent terminal Changes, and closure generation time could precede newly aggregated Tasks. Active/terminal strict invariants and a latest-Task timestamp check were added with regression coverage; all 37 tests then passed.
- Re-reading both source plans, the referenced Codex task, the shared GPT conversation, SztuCode PR #67, its two creating commits, and the repository's own Agent/contributor configuration corrected an attribution error: the Superpowers execution instruction was added by collaborator `GuanG-1008` in one PR Plan. It is evidence of that Task's chosen workflow, not a SztuCode-native Skill or repository-wide Superpowers policy.
- MCL now separates `reference`, `task-local`, `repository-policy`, and `enforced-control` claims. Metaflow ASDD is explicitly an internal, tool-neutral label; Review concern separation is distinct from reviewer independence.
- Manifest hashing now rejects non-canonical source bytes, so third-party `shasum` output must equal the recorded SHA-256.
- Completion validation now enforces T2 Spec/T3 Proposal presence, exact embedded request and Plan text, ordered message markers, matching Plan revision, non-empty sections, Task filename/ID consistency, lifecycle consistency, redaction counts, timestamps, and unresolved placeholders.
- The Dossier section parser was replaced after a negative test exposed premature termination at blank lines; exact embedded documents are fenced so the 13 top-level chapters remain unambiguous.
- Viewer CI excludes E2E fixture data from build artifacts, and release/rollback workflows verify both the immutable deploy and the production site's published deploy before reporting success.
- Sparse Viewer tests pin the Dayun LFS object by SHA-256 and byte size without downloading the 157,118-byte manifest or 293 tile payloads; full-data runs still parse every tile URL and stat every JSON/binary pair.
- Playwright snapshot paths now include the operating-system platform. Darwin and Linux baselines are reviewed independently instead of weakening the 1% pixel-difference budget.
- Platform validation never writes possible secret findings to CLI or JSON logs; a regression test proves only a fixed-shape boolean result leaves the process.

Validation retries and rejected checks:

- Revision 3 run [31331509106](https://github.com/Shuang-su/Metaflow/actions/runs/31331509106) failed at `classify paths` because the new compatibility entry `docs/metaflow-change-lifecycle-v1.0-complete-plan.md` had no component owner; every downstream job was skipped and `required / gate` failed. The focused fix adds that exact path to platform ownership and a classifier regression assertion.
- The first Revision 3 `check-all --strict` run exposed that the old flag meant “terminal-only” and therefore could not validate an active `verifying` Change. Strict mode now fully validates active Changes with `completion_state: pending` and retains the all-Tasks-complete requirement for terminal Changes; positive regression coverage was added.
- The first generated Revision 3 Dossier reproduced three Markdown hard-break spaces from the user-supplied Plan and failed `git diff --check`. The transcript snapshot normalized those line endings without changing message wording or order, then deterministic generation and whitespace validation passed.
- Four new Task Record patches were initially resolved against the main workspace. They were copied into the authorized MCL worktree and deleted from the main workspace immediately; a re-read confirmed main remained at `47ffd86e`, nine commits ahead of `origin/main`, with only the predecessor plan and Swiftgram directory untracked.
- Ruby 2.6 rejected the newer `YAML.load_file(..., aliases:)` API; the same Psych parser's AST entrypoint then parsed all Workflow files successfully.
- A broad strict-JSON sweep was rejected because pre-existing JSONC `tsconfig` files and a legacy JPEG named `meta.json` are intentionally not strict JSON. The rerun parsed only the 19 contracts changed by MF-1.
- Hosted run `31324658384` exposed a dependency-graph prerequisite plus sparse governance and Viewer omissions. The dependency graph was enabled and re-read; sparse path and tracked-link handling were corrected.
- Hosted run `31325117956` passed governance, dependency review, CodeQL, Editor, Design, Data, and Reference, then exposed the Dayun LFS pointer in the Viewer test. The small-fixture contract was changed to validate the pointer while retaining full-data checks elsewhere.
- Hosted run `31325330480` passed Viewer unit/type/build and exposed cross-platform visual drift. Run `31325585391` uploaded Linux actuals as diagnostics; both images were inspected before acceptance. Run `31325739835` passed `required / gate` and exposed two separate GitHub Advanced Security findings for secret-derived logging.
- Docker CLI was available but its daemon was not running. No Docker result was claimed; the real GitHub Ubuntu artifact was used for Linux baseline review.
- Hosted run `31325948588` passed every workflow job, `required / gate`, and the separate GitHub Advanced Security CodeQL check after log output was sanitized.
- Completion refresh commit `e47dc4fa` passed the same hosted matrix in run `31326306006`; PR #3 remained open, draft, and mergeable.
- Revision 2 commit `66d2553d` passed the full hosted matrix in run `31327941632`, including 18 Completion tests and both CodeQL checks.

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
- Published commits `fb0a881b` through `66d2553d` on `codex/mcl-v1` and created draft PR [#3](https://github.com/Shuang-su/Metaflow/pull/3); the PR was re-read as open, draft, and mergeable.
- Published Revision 3 commit `023dac807976f02ec6e95a9dbf33de827896bd51`, removed `[skip netlify]` from the title, replaced the PR body with Revision 3 scope/evidence, and re-read the exact Head. Its first run failed the unowned-path Gate described above, so it is not merge evidence.
- Enabled the repository dependency graph/vulnerability alerts and re-read the endpoint successfully so dependency review could execute.
- Enabled and re-read Dependabot security updates, secret scanning, and secret-scanning push protection.
- Enabling Dependabot security updates caused automated PRs [#4](https://github.com/Shuang-su/Metaflow/pull/4) through [#8](https://github.com/Shuang-su/Metaflow/pull/8) against the non-Active `supersplat-viewer-v1.18.2` reference snapshot. They were not merged, dismissed, or treated as Active product updates.
- Created and re-read [Issue #9](https://github.com/Shuang-su/Metaflow/issues/9) as a T3 Upstream Sync Proposal signal for PRs #4-#8; no `Adopt / Defer / Skip` decision was made.
- Read-only GitHub Project discovery failed because the active token lacks `read:project`; no Project write was attempted.
- After `required / gate` succeeded on merged `main`, created active Ruleset `20612630` and re-read both its full configuration and effective rules for `main`.
- Netlify automatically created Deploy Preview `6a78b7bf7f384100088b3e12` for PR #3 at commit `e47dc4fa`. The public API still reported `building`, and the Preview URL had no successful smoke evidence; no manual Netlify write or production deploy occurred.
- Commit message `[skip netlify]` did not prevent a second automatic Preview: deploy `6a78c06f56d7aa0008c2053f` was created for `66d2553d` and remained `building`. PR #3 was then renamed to include `[skip netlify]` for the next archive-only push, and the updated title was re-read.
- Updated and re-read PR #3's body to identify Revision 2, 18 Completion tests, run `31327941632`, author self-review, Task-local instruction authority, pending Netlify state, and Issue #9 without claiming repository enforcement.
- Updated PR #3 to Revision 4's MCL-only Gate, marked it Ready, squash-merged it, and re-read merge commit `6e1725ee6d24ea37fcf3bb7492606e95e0e0780b` and `origin/main`.
- Added and re-read the post-merge Issue #1 comment, then created and re-read proposed follow-up Issues #15 and #16.
- No Supabase, production, release, rollback, tag, or manual deploy write occurred.

## Known limitations

- PR #3 is merged and the Ruleset is active, but MCL remains an installed candidate and is not effective or closed.
- GitHub Project fields and production Environment secrets/protection are not configured.
- Netlify Deploy Previews remained non-terminal and no successful HTTP smoke was available. Revision 4 explicitly moved this work to Issue #15; no success is claimed.
- Path-scoped Viewer/Editor product and release Gate design is proposed in Issue #16 and is not implemented by MF-1.
- Dependabot PRs #4-#8 target a reference snapshot and require the T3 Upstream Sync decision tracked by Issue #9; they must not be merged as routine Active-product dependency maintenance.
- Preview/Beta/Stable, immutable production deployment, smoke, observation, and rollback workflows are implemented but unexercised.
- Phase 9 fast-path, Design, real Upstream Sync, multi-Agent, continuation, attachment, and rollback pilots remain incomplete.
- GitHub reported existing dependency alerts on the default branch after security features were enabled; MF-1 does not silently dismiss or rewrite those findings, and Issue #2 tracks the directly observed npm follow-up scope.
