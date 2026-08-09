---
change_id: MF-1
title: MCL v1.0 repository governance contract
status: specified
component:
  - platform
risk: T3
type: governance
owner: Shuang-su
created: 2026-08-09
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/1
plan_revision: 2
completion_state: pending
supersedes: null
terminal_reason: null
---

# Change Spec

## Required behavior

1. The repository exposes one normative MCL specification and one component registry.
2. T0-T3 artifact requirements are machine-checkable.
3. Every independently prompted agent task can be represented by a stable Task ID and completion record.
4. The Change Dossier is deterministically generated from request, plan, summary, task, evidence, and closure sources.
5. `check` fails on missing sources, invalid IDs or states, stale generated output, checksum drift, unresolved non-complete tasks, placeholders, and likely credentials.
6. `check-all` discovers every governed Change without requiring a root package dependency.
7. Existing Version History schema 1.0 remains readable; schema 1.1 permits Completion trace fields without requiring legacy backfill.
8. Path classification comes from `metadata/components.json`.
9. GitHub CI always emits `required / gate` and does not require production credentials for PRs.
10. Viewer, Editor, and Design runtime behavior remains unchanged.
11. Method and tooling claims are classified as `reference`, `task-local`, `repository-policy`, or `enforced-control`; a single external case, directory, PR, Plan directive, optional Skill, or Plugin cannot establish repository-wide adoption.
12. Every Agent Completion Record captures execution topology, tool-directive source and scope, adoption level, and whether Review was author self-review or performed by a distinct non-author.
13. The normative contract is tool-, vendor-, Skill-, Plugin-, and agent-topology-neutral unless an accepted Change explicitly narrows it.

## Completion content

The canonical Dossier contains, in order:

1. Change Metadata;
2. Complete User Request Transcript;
3. Agent Task Inventory;
4. Agent Actions and Replies Summary;
5. Complete Effective Plan;
6. Plan Amendments and Deviations;
7. Implementation and External Effects;
8. Verification and Review Evidence;
9. Release, Rollback and Observation;
10. Remaining Risks and Follow-up Changes;
11. Ledger, Version, PR, and Release Links;
12. Checksums and Redaction Manifest;
13. Closure Decision.

## Compatibility

- No runtime API changes.
- Existing version entries without `trace` remain valid.
- Existing branches and tags remain valid.
- Ruleset activation occurs only after the required workflow exists and succeeds on `main`.

## Failure behavior

- Missing or stale completion material exits non-zero.
- Invalid component ownership exits non-zero.
- A non-complete Task without a documented disposition blocks Change closure.
- An inaccessible final artifact must be reported as partial.
- Secret-like content blocks the public archive until redacted.
- A repository-policy claim without an accepted normative source, an enforced-control claim without applied and re-read evidence, or an independent-review claim naming the implementation author exits non-zero when represented in machine-readable Completion data.

## Security and privacy

- User-authored request text is preserved verbatim except explicit, auditable redactions.
- System/developer instructions and hidden reasoning are excluded.
- PR workflows have no production write authority.
- Security reports use private channels and redacted public references.

## Acceptance

- Unit and fixture tests cover valid and invalid Completion records.
- The MF-1 Bootstrap Dossier passes the same validator shipped by the Change.
- The Bootstrap record demonstrates that external references and Task-local tool instructions are not promoted into repository policy.
- Existing component builds and tests are run and recorded.
- GitHub workflows parse and complete successfully before a Ruleset requires them.
