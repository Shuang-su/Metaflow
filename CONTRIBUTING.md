# Contributing to Metaflow

All changes follow the Metaflow Change Lifecycle defined in `docs/metaflow-change-lifecycle-v1.0.md`.

## Choose the workflow

| Risk | Examples | Required before implementation |
| --- | --- | --- |
| T0 | documentation, research notes, mechanical maintenance | scope and a lightweight Plan when an agent participates |
| T1 | contained bug or small improvement | issue/PR problem statement, reproduction or RED test, lightweight Plan |
| T2 | product behavior, UI, data capability | Issue, accepted Proposal when tradeoffs remain, Spec, full Plan |
| T3 | architecture, public contracts, security, destructive migration, major upstream sync | accepted Proposal/RFC, ADR when long-lived, Spec, staged Plan |

## Change documents

T1-T3 use `MF-<issue-number>` and store applicable artifacts under `docs/changes/<issue-number>-<slug>/`.

- `proposal.md`: whether and why the Change should proceed.
- `spec.md`: observable behavior and technical contract.
- `plan.md`: decision-complete execution sequence.
- `evidence.md`: results that actually occurred.
- `completion/`: task records and the generated Change Completion Dossier.

Use the templates in `docs/templates/mcl/`.

## Branches and pull requests

- Agent branches: `codex/mf-<issue>-<slug>`.
- Human feature branches: `feature/mf-<issue>-<slug>`.
- Fix branches: `fix/mf-<issue>-<slug>`.
- T2/T3 changes use an isolated worktree.
- Keep one main objective per PR.
- Use the PR template and disclose agent participation.
- Do not mark a PR ready until the applicable Completion Record and validation are present.

## Validation

Run governance checks for every PR:

```bash
node scripts/mcl.mjs check-all
node --test scripts/tests/*.test.mjs
python3 scripts/validate_platform.py
python3 scripts/validate_data.py
node scripts/check_markdown_links.mjs
node scripts/scan_repository.mjs
```

Run component commands selected by `metadata/components.json`. A passing build does not replace behavior, browser, visual, compatibility, security, or deployment evidence required by the Spec.

## Review and release

Review Spec compliance separately from code quality. Resolve all review conversations and pass `required / gate`.

Production release requires a namespaced tag, immutable artifact, smoke verification, Version History and Ledger trace, rollback target, Release Task Record, observation owner, and final Change Completion Dossier.
