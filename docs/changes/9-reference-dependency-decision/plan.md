---
change_id: MF-9
title: Close snapshot dependency PRs and archive the decision
status: closed
component:
  - reference
risk: T3
type: upstream-sync
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/9
plan_revision: 2
completion_state: complete
supersedes: null
terminal_reason: snapshot-dependency-prs-skipped
---

# Implementation Plan

## Goal

Close PR #4–#8 without merging or modifying any versioned snapshot, route applicable Active dependency work to MF-2, and merge a governance-only MF-9 closure archive.

## Architecture summary

Issue #9 and the immutable Task Record are the decision sources. GitHub comments and states are external effects. Evidence and Completion are repository records. MF-2 is the only continuation for product dependency changes.

## Preconditions and dependencies

- Work only in `/Volumes/Prism/Metaflow-mf9-decision` from `origin/main`.
- Preserve `/Volumes/Prism/Metaflow` local `main`, its nine local commits, and untracked research.
- Confirm PR #4–#8 are open, unmerged, and target only the versioned snapshot.
- Reuse existing Issue #2 as MF-2 because it already owns residual Active Viewer/Editor npm advisories; update it instead of creating a duplicate.

## Branch and worktree strategy

Use `codex/mf-9-reference-dependency-decision`, commit only `docs/changes/9-reference-dependency-decision/**`, push it, and open a governance-only PR against `main`.

## Tasks

### MF-9-T01 — Decision, external state, archive, and merge

- Authorized scope: update Issue #9 and MF-2; comment on and close PR #4–#8; create, validate, publish, and merge the governance-only MF-9 archive.
- RED boundary: confirm the five PRs are open and MF-9 has no closure archive.
- GREEN implementation: record the decision matrix, update MF-2, close each PR without merge, re-read state, and generate Completion.
- REFACTOR boundary: documentation and deterministic archive cleanup only; no product, dependency, snapshot, Netlify, or release changes.
- Validation: MCL check, platform/link checks, `git diff --check`, PR diff inspection, GitHub check suite, merge-state and main-state re-read.
- Commit and PR boundary: one governance commit and one squash-merged governance PR.
- Serial dependency: complete this Task before beginning Editor migration or MF-2 product changes.
- Rollback and stop: if any PR is merged, target scope differs, a required check fails, or the diff touches a snapshot/product path, stop with `partial` and do not merge the archive PR.

## Final validation

- PR #4–#8 each report `CLOSED`, `merged: false`, and `mergedAt: null`.
- Issue #9 contains the approved matrix and MF-2 link.
- MF-2 contains exact Active package targets and explicitly excludes `js-yaml` and snapshots.
- The archive PR changes only MF-9 documentation and passes required governance checks.
- The local `main` SHA, untracked predecessor plan checksum, and Swiftgram presence remain unchanged.

## Release, observation, and closure

No product release or deployment applies. After the archive PR merges and its main state is re-read, close Issue #9 as completed and record MF-9 as `closed`.
