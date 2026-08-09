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
plan_revision: 1
completion_state: pending
supersedes: null
terminal_reason: null
---

# Proposal

## Decision

Accept MCL v1.0 as the repository lifecycle and Metaflow ASDD as its implementation kernel.

## Problem

The repository has useful post-release ledgers and version metadata but lacks enforceable pre-implementation decisions, component ownership, automated gates, per-agent completion records, and a deterministic closure contract.

## Goals

- Make every governed Change traceable from request through decision, implementation, validation, release, observation, and closure.
- Preserve a lightweight T0/T1 path while making T2/T3 decision-complete.
- Require every independently prompted agent task to archive the complete user request, effective plan, and action/reply summary.
- Keep Viewer, Editor, Design, Data, Platform, and Reference boundaries explicit.
- Add enforceable local and CI validation without changing runtime product behavior.

## Non-goals

- Importing or productizing the untracked Swiftgram source archive.
- Rewriting historical Version History entries.
- Changing Viewer or Editor product behavior.
- Requiring a second human maintainer who does not yet exist.
- Automatically deploying, migrating, or merging upstream code.

## Options

1. Keep informal prompts and ledgers only: rejected because it cannot prevent missing decisions or unverifiable completion.
2. Require the same heavy document set for all changes: rejected because it makes T0/T1 maintenance impractical.
3. Adopt risk-tiered MCL with mandatory agent completion records: accepted.

## Risks and controls

- Documentation overhead: use T0-T3 tiering and generated Dossiers.
- Duplicate truth: keep source files canonical and generate `dossier.md`.
- Sensitive prompts: require explicit redaction records and secret scanning.
- AI self-confirmation: require automated evidence and separate review concerns.
- Large-repository CI cost: route checks by component and use small fixtures.

## Acceptance record

- Decision: Accept
- Approver: Shuang-su
- Date: 2026-08-09
