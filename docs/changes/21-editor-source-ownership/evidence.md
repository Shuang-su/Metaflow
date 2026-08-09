---
change_id: MF-21
title: Editor source ownership migration evidence
status: verifying
component:
  - editor
  - reference
  - platform
risk: T3
type: architecture
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/21
plan_revision: 1
completion_state: pending
supersedes: null
terminal_reason: null
---

# Evidence

## Environment and commit

- Isolated worktree: `/Volumes/Prism/Metaflow-editor-migration`
- Branch: `codex/mf-21-editor-source-ownership`
- Base: `origin/main@ecc3b16e52c118ab53a2efd649efe53d3dc91c84`
- Package runtime: Node 20.19.0

## Commands and results

| Command | Exit | Passed / failed | Evidence |
| --- | ---: | --- | --- |
| Baseline Editor `npm ci` | 0 | passed | 453 packages installed; existing audit findings deferred to MF-2 |
| Baseline Editor `npm run lint` | 0 | passed | ESLint completed without findings |
| Baseline Editor `npm run build` | 0 | passed | Release bundle generated |
| Baseline runtime comparison | 0 | passed | No difference excluding `*.map` and generated `version.json`; published baseline digest `7283e9ac8571380819600b9ee16c712544b050e8e2df4f1f64d7a57ab1005732` |
| `node scripts/validate_reference_snapshots.mjs` | 0 | passed | Tag object `ca76baf0...`, commit `9f4dfe1f...`, tree `0ce0d791...`, 232 files, canonical SHA-256 `9d37961e...` |
| Migrated Editor `npm ci && npm test && npm run lint && npm run build` | 0 | passed | 453 packages; 4 contract tests; source lint; release and service-worker bundles |
| `python3 scripts/generate_editor_version.py` and `--check` | 0 | passed | Data mirror and ignored `metaflow-editor/dist/version.json` generated and verified |
| `npm run test:runtime` | 0 | passed | All 26 non-map runtime files match the 1.1.0 SHA-256 baseline; generated `version.json` is the only metadata-path exclusion |
| Viewer `npm ci`, `MCL_SMALL_FIXTURES=1 npm test`, typecheck, build | 0 | passed | 52 tests; TypeScript check; Viewer public/module/settings builds; no E2E invoked |
| `node --test scripts/tests/*.test.mjs` | 0 | passed | 60 tests including routing, Completion, runtime, and positive/negative snapshot identity cases |
| `python3 -m unittest discover -s scripts/tests -p 'test_*.py' -v` | 0 | passed | 10 tests including generator, data, Dependabot boundary, Netlify build-source, security, and action pinning |
| Governance and metadata validators | 0 | passed | MCL strict check, component registry, CI routing, Version History, platform, and data checks |
| Markdown, repository scan, and staged diff | 0 | passed | 96 Markdown files; 11,093 scanned files; no secret/accidental-file finding; `git diff --check` clean |
| Workflow YAML parse and staged path route | 0 | passed | 275 changed paths owned/routed; selected checks exclude `viewer-source` and `viewer-data`, so Viewer E2E is not selected |

## Browser, device, and rendering backend

Pending Deploy Preview smoke. Full Viewer E2E, visual, WebGPU, and product release environments are out of scope.

## Screenshots, recordings, and CI artifacts

Pending hosted PR runs and Deploy Preview for the exact pushed Head.

## Performance samples and baseline

No performance campaign is required because no runtime behavior change is authorized. Exact runtime artifact parity is the hard local comparison.

## Preview, Beta, and production

Preview pending. Beta and production are prohibited in this Change.

## Spec acceptance mapping

| Requirement | Result | Evidence |
| --- | --- | --- |
| Exact upstream snapshot | passed locally | Registry validation reproduced the fixed tag object, commit, tree, 232 files, and canonical digest. |
| Active package identity | passed locally | Package is `metaflow-editor@1.1.0`, private, with `dist/` ignored. |
| Behavior contracts | passed locally | Branding/version, service worker, export formats, locales, and 100000-frame tests passed. |
| Reproducible runtime | passed locally | 26 runtime files match the pre-migration hashes; source maps and generated version metadata are the approved exclusions. |
| Source preservation | passed locally | Pre-migration customized source and Active source differ only in approved package identity, README, tests, and `.gitattributes`; the lock dependency graph is unchanged. |
| Pipeline ownership | passed locally | CI, release, generator, component registry, routing, and Netlify consume `metaflow-editor`; reference checks consume the snapshot. |
| Preview routes | pending | Requires the exact PR Head Deploy Preview. |
| Hosted repository Gate | pending | Requires the exact PR Head GitHub checks. |

## Adoption and enforcement claims

| Claim | Level | Normative source | Applied-control evidence | Re-read result |
| --- | --- | --- | --- | --- |
| MF-21 follows MCL | task-local pilot | Accepted MF-21 Proposal and Plan | Change files, Task Record, deterministic Dossier, and local strict check | Passed locally; hosted result pending |

## Review conclusions

- Spec-compliance pass: the diff is limited to source ownership, exact snapshot restoration, reproducible build/metadata routing, tests, and governance records. No dependency target, Editor version, export contract, Viewer source, release, or production state changed.
- Code-quality pass: validators fail closed on extra/missing/modified snapshot or runtime files; routing owns every proposed path; workflows use the Active source and keep Viewer E2E conditional on Viewer source/data changes; generated outputs are deterministic. No independent non-author review is claimed.

## Unrun checks and reasons

- Full Viewer E2E, visual baselines, performance sampling, production release, and deploy are outside the approved boundary.
- GitHub checks and Deploy Preview are pending the first pushed PR Head.

## Known limitations

- Editor install reports 7 high and 2 critical audit findings; Viewer install reports 1 moderate and 4 high findings. They are not claimed fixed and remain assigned to MF-2.
- The attempted expansion of Editor lint to include tests exposed the existing ESLint 10 / `eslint-plugin-import` peer incompatibility, so the inherited `eslint src` boundary was retained and Node's test runner covers the new contract test.
- The first snapshot identity check found a local `.DS_Store`; it was moved to the recoverable temporary backup and the exact 232-file identity then passed. No snapshot byte was edited.

## Release, rollback, and observation

No release or production write is authorized. Before merge, rollback is branch abandonment or revert of the PR branch.
