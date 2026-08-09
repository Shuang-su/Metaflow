---
change_id: MF-9
title: Decide versioned reference dependency updates
status: accepted
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

# Proposal

## Problem or opportunity

Dependabot opened PR #4–#8 against `supersplat-viewer-v1.18.2`, which is an immutable upstream reference snapshot rather than an Active product package. Merging those PRs would silently rewrite the snapshot and destroy its provenance.

## Users and scenarios

Maintainers need the snapshot to remain an exact historical reference while still porting relevant security fixes to the Active Viewer and Editor dependency graphs.

## Evidence

- Every PR targets only `supersplat-viewer-v1.18.2`.
- Active Viewer and Editor use separate package manifests and lockfiles.
- `js-yaml` is absent from both Active packages; the other four remediations are applicable to their current dependency graphs.

## Why now

The open automated PRs can be merged accidentally and currently imply that versioned snapshots are maintenance targets.

## Goals and measurable success signals

- Close PR #4–#8 without merge commits.
- Preserve all versioned snapshot bytes on `main`.
- Route applicable fixes to MF-2 and record that `js-yaml` needs no Active port.
- Produce a complete, deterministic MF-9 closure archive.

## Non-goals

- No product package or lockfile change.
- No Editor source migration.
- No production deploy or release.

## Options

1. Merge the automated PRs and mutate the reference snapshot.
2. Leave the PRs open indefinitely.
3. Skip and close the snapshot PRs, then port applicable fixes to Active packages in a separate Change.

## Cost and dependencies

Option 3 requires tailored PR comments, a follow-up security Change, and a governance-only closure PR.

## Compatibility, security, privacy, and performance risks

Closing the snapshot PRs does not remediate Active dependency findings by itself. MF-2 must remain open until the Active packages are separately validated.

## Recommendation

Use option 3.

## Decision

- Decision: Accept option 3
- Approver: Shuang-su
- Date: 2026-08-10
- Conditions: No snapshot PR may merge; MF-2 owns applicable Active dependency remediation.
