---
change_id: MF-1
title: MCL v1.0 candidate governance contract
status: specified
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
14. The normative MCL document contains only reusable rules, interfaces, states, Gates, exceptions, controls, and acceptance; MF-1 execution order, branch facts, merge steps, and rollback procedure live only in the Change Plan.
15. While the normative document is `candidate`, mandatory scope is limited to MF-1 and explicitly designated pilots; merge alone does not make MCL 1.0 effective or closed.
16. Each Task Record freezes its own request text, message count, request hash, effective Plan text, Plan revision, and Plan hash. A later Task or Plan revision cannot require rewriting an earlier Task Record.
17. Change-level transcript, summary, approved Plan, Dossier, and Manifest are deterministic aggregates of immutable Task Records and current Change sources.
18. Manifest schema 1.1 remains able to read existing 1.0 archives, records each Task's request/Plan summary, and validates registered non-normative source materials.
19. The 1,575-line predecessor plan is preserved byte-for-byte with SHA-256 `37f45424cc233af72801e1d91053d4581d1bbcdfb73627612d6f28f018af85a3`; a disposition record covers every top-level section.
20. MCL has one normative source, MCL changes require a governed Change, and a process-value review occurs after every two stable releases.
21. Versioned upstream/reference snapshot directories are not routine Dependabot npm update targets; component routing does not grant mutation or dependency-upgrade authority.

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
- Existing Completion Manifest 1.0 archives remain readable; new and Revision 3 records use Manifest 1.1.
- Existing branches and tags remain valid.
- Ruleset activation occurs only after the required workflow exists and succeeds on `main`.
- The predecessor-plan compatibility path remains valid but is non-normative and links to the archive, normative specification, effective Change Plan, and Dossier.

## Failure behavior

- Missing or stale completion material exits non-zero.
- Invalid component ownership exits non-zero.
- A non-complete Task without a documented disposition blocks Change closure.
- An inaccessible final artifact must be reported as partial.
- Secret-like content blocks the public archive until redacted.
- A repository-policy claim without an accepted normative source, an enforced-control claim without applied and re-read evidence, or an independent-review claim naming the implementation author exits non-zero when represented in machine-readable Completion data.
- Replacing a historical Task's request or Plan with a later Change-level revision exits non-zero.
- A missing, duplicate, path-escaping, secret-bearing, or checksum-mismatched source material exits non-zero.
- A Dependabot npm target matching a versioned `supersplat-v*` or `supersplat-viewer-v*` directory exits non-zero.

## Security and privacy

- User-authored request text is preserved verbatim except explicit, auditable redactions.
- System/developer instructions and hidden reasoning are excluded.
- PR workflows have no production write authority.
- Security reports use private channels and redacted public references.

## Acceptance

- Unit and fixture tests cover valid and invalid Completion records.
- The MF-1 Bootstrap Dossier passes the same validator shipped by the Change.
- The Bootstrap record demonstrates that external references and Task-local tool instructions are not promoted into repository policy.
- A Revision 3 regression fixture adds a later Task and Plan without changing the original Task Record bytes or hashes.
- Source-material tests cover registration, path containment, exact checksum, Dossier inclusion, redaction, secrets, and non-normative classification.
- The normative document, MF-1 Plan, compatibility entry, and section-disposition record pass link and single-source checks.
- Existing component builds and tests are run and recorded.
- GitHub workflows parse and complete successfully before a Ruleset requires them.
