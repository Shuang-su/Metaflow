---
change_id: MF-9
title: Reference dependency decision evidence
status: verifying
component:
  - reference
risk: T3
type: upstream-sync
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/9
plan_revision: 1
completion_state: pending
supersedes: null
terminal_reason: null
---

# Evidence

## Environment and commit

- Baseline: `origin/main` at `91167cc3e2c2f8ceb80cbb07644aeb927b5320c9`.
- Isolated worktree: `/Volumes/Prism/Metaflow-mf9-decision`.
- Local `main` safety ref: `refs/codex/safety/20260810-editor-migration-local-main` at `47ffd86e9635d7d797628a214df817f7ca60b55c`.

## Commands and results

| Command | Exit | Passed / failed | Evidence |
| --- | ---: | --- | --- |
| GitHub read of Issue #9 and PR #4–#8 | 0 | Passed | All five PRs were open, unmerged, and targeted the versioned snapshot before mutation. |
| Update Issue #2 | 0 | Passed | MF-2 now names both Active package paths, exact target versions, `js-yaml` exclusion, snapshot exclusion, stacked-PR boundary, and Ready-only delivery. Re-read at `2026-08-09T20:40:25Z`. |
| Update Issue #9 | 0 | Passed | Approved Skip/Adopt matrix and MF-2 continuation were written and re-read at `2026-08-09T20:40:26Z`. |
| Comment on and close PR #4–#8 | 0 | Passed | Tailored comment IDs: `5233740405`, `5233740551`, `5233740697`, `5233740869`, `5233741037`. |
| Re-read PR #4–#8 | 0 | Passed | All report `state: closed`, `merged: false`, `merged_at: null`; close times span `2026-08-09T20:40:41Z` through `20:40:51Z`. |

## Browser, device, and rendering backend

Not applicable.

## Screenshots, recordings, and CI artifacts

No UI evidence is required for a governance-only decision.

## Performance samples and baseline

Not applicable.

## Preview, Beta, and production

No Preview, Beta, release, or production deployment is authorized.

## Spec acceptance mapping

| Requirement | Result |
| --- | --- |
| All five PRs are closed and unmerged | Passed; GitHub re-read returned the required state tuple for #4–#8. |
| Snapshot bytes do not change | Passed for the authored diff; no snapshot path is modified. Hosted PR diff is checked before merge. |
| Applicable remediation has an owner | Passed; MF-2 remains open with exact Active targets and boundaries. |
| Complete archive is reproducible | Local generation and hosted checks are recorded before merge. |

## Adoption and enforcement claims

| Claim | Level | Normative source | Applied-control evidence | Re-read result |
| --- | --- | --- | --- | --- |
| Versioned snapshots are immutable references | repository-policy | `AGENTS.md` candidate pilot scope and accepted MF-9 Proposal | MF-9 decision and PR closures | #4–#8 closed unmerged; MF-2 owns Active ports |

## Review conclusions

The author will perform separate Spec-compliance and code-quality self-review passes after deterministic generation and before publication. No independent non-author review is claimed.

## Unrun checks and reasons

Product builds, E2E, Netlify Preview, performance, and release checks are intentionally out of scope because no product or deployment file changes.

## Known limitations

Closing the snapshot PRs does not itself repair Active dependencies; MF-2 owns that continuation.

## Release, rollback, and observation

No release applies. Recovery consists of reopening an incorrectly closed PR or correcting the decision record; snapshots remain untouched.
