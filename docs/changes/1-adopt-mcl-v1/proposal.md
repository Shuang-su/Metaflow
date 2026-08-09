---
change_id: MF-1
title: Adopt Metaflow Change Lifecycle v1.0
status: accepted
component:
  - platform
risk: T3
type: governance
owner: Shuang-su
created: 2026-08-09
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/1
plan_revision: 3
completion_state: pending
supersedes: null
terminal_reason: null
---

# Proposal

## Decision

Accept MCL v1.0 as an installed candidate for MF-1 and explicitly designated pilots, and authorize PR #3 to merge after its Revision 3 gates pass. Full repository-policy activation remains a separate human decision after the required pilots, `main` checks, Ruleset evidence, release/rollback exercise, and closure evidence exist.

Use Metaflow ASDD only as the internal, tool-neutral name for MCL's Spec-driven implementation phase; it does not denote adoption of an external Skill, Plugin, project, vendor workflow, or agent topology. Superpowers or any other external tool directive remains Task-local unless a later accepted Change explicitly adopts it.

## Problem

The repository has useful post-release ledgers and version metadata but lacks enforceable pre-implementation decisions, component ownership, automated gates, per-agent completion records, and a deterministic closure contract.

## Goals

- Make every governed Change traceable from request through decision, implementation, validation, release, observation, and closure.
- Preserve a lightweight T0/T1 path while making T2/T3 decision-complete.
- Require every independently prompted agent task to archive the complete user request, effective plan, and action/reply summary.
- Keep Viewer, Editor, Design, Data, Platform, and Reference boundaries explicit.
- Add enforceable local and CI validation without changing runtime product behavior.
- Prevent task-local tool instructions or external examples from being misrepresented as repository policy or enforced controls.
- Establish a single normative source, require MCL itself to change through MCL, and review process value every two stable releases.
- Preserve the complete predecessor plan as non-normative source material while separating its user transcript, research, implementation schedule, and reusable rules.

## Non-goals

- Importing or productizing the untracked Swiftgram source archive.
- Rewriting historical Version History entries.
- Changing Viewer or Editor product behavior.
- Requiring a second human maintainer who does not yet exist.
- Automatically deploying, migrating, or merging upstream code.
- Activating MCL 1.0 repository-wide or closing MF-1 merely because the candidate PR merges.
- Moving Editor source, restoring the full `supersplat-v2.28.0` upstream snapshot, or deciding the disposition of Dependabot PRs #4-#8.

## Options

1. Keep informal prompts and ledgers only: rejected because it cannot prevent missing decisions or unverifiable completion.
2. Require the same heavy document set for all changes: rejected because it makes T0/T1 maintenance impractical.
3. Adopt risk-tiered MCL as a gated candidate with mandatory agent completion records in Bootstrap and named pilots: accepted.

## Risks and controls

- Documentation overhead: use T0-T3 tiering and generated Dossiers.
- Duplicate truth: keep source files canonical and generate `dossier.md`.
- Candidate overclaim: limit mandatory use to MF-1 and named pilots; distinguish accepted, merged, verified, enforced, and effective.
- Historical-record mutation: freeze each Task's request and Plan snapshot and aggregate Change-level outputs without rewriting prior Task Records.
- Sensitive prompts: require explicit redaction records and secret scanning.
- AI self-confirmation: require automated evidence and separate review concerns.
- Large-repository CI cost: route checks by component and use small fixtures.

## Acceptance record

- Decision: Accept candidate implementation and gated merge; defer repository-wide activation
- Approver: Shuang-su
- Date: 2026-08-09
- Revision 3 merge authorization: Shuang-su, 2026-08-10
