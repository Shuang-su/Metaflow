---
change_id: MF-9
title: Reference dependency decision contract
status: specified
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

# Change Spec

## Context and Proposal

MF-9 implements the accepted decision in `proposal.md`: versioned source directories are immutable references and must not receive routine dependency maintenance.

## User-visible behavior

There is no product behavior change.

## Journey, states, or behavior matrix

| Item | Decision | Required external state |
| --- | --- | --- |
| PR #4 `js-yaml` | Skip | Closed, unmerged, no Active port |
| PR #5 `immutable` | Skip original; port under MF-2 | Closed, unmerged |
| PR #6 `postcss` | Skip original; port under MF-2 | Closed, unmerged |
| PR #7 `concurrently` / `shell-quote` | Skip original; port under MF-2 | Closed, unmerged |
| PR #8 `fast-uri` | Skip original; port under MF-2 | Closed, unmerged |

## URL, configuration, data, type, or API contracts

No runtime API changes. The trace contract links Issue #9, each closed PR, MF-2, the MF-9 archive PR, and its Completion Dossier.

## Technical design and data flow

The Agent first records the approved decision in MF-9, then updates MF-2, comments on and closes each Dependabot PR, re-reads GitHub state, and commits the resulting Evidence and Completion archive.

## Errors, timeout, cancellation, degradation, and recovery

If any PR has merged, changed target, or cannot be re-read, stop and mark MF-9 partial. A failed comment or close operation is retried only after re-reading the individual PR.

## Compatibility and migration

No snapshot or product file may change. Active remediation is a separate Change.

## Security and privacy

Security advisory facts may be linked publicly; no credential, private alert payload, system instruction, developer instruction, or hidden reasoning enters Completion.

## Performance budgets

Not applicable because no runtime code changes.

## Accessibility, mobile, and reduced motion

Not applicable.

## Non-goals

Editor migration, product dependency updates, Netlify Preview, product CI, merge of product PRs, release, and production deployment.

## Acceptance matrix

| Requirement | Evidence | Required environment |
| --- | --- | --- |
| All five PRs are closed and unmerged | GitHub state re-read with `mergedAt: null` | GitHub API |
| Snapshot bytes do not change | Governance PR diff excludes versioned snapshots | Git |
| Applicable remediation has an owner | MF-2 body and links | GitHub API |
| Complete archive is reproducible | MCL generate/check and checksums | Node.js |

## Open decisions

None.
