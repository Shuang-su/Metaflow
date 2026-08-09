# Contributing to Metaflow

The Metaflow Change Lifecycle is defined only in `docs/metaflow-change-lifecycle-v1.0.md`.

While that document has `status: candidate`, mandatory MCL use is limited to MF-1 and Changes explicitly designated as MCL pilots in an accepted Proposal, Spec, or Plan. Other contributors may opt in, but merge of the candidate files does not by itself make MCL 1.0 an effective repository-wide policy. After a governed activation Change sets a non-empty `effective_date`, MCL applies to the scope declared by that Change.

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

The Change Plan must not copy the normative MCL specification. Repeated structured facts must point to their single source or be deterministically generated and checked for drift. Changes to MCL itself require their own Change ID, Proposal/Spec/Plan/Evidence, validation, and Completion.

## Branches and pull requests

- Agent branches: `codex/mf-<issue>-<slug>`.
- Human feature branches: `feature/mf-<issue>-<slug>`.
- Fix branches: `fix/mf-<issue>-<slug>`.
- T2/T3 changes use an isolated worktree.
- Keep one main objective per PR.
- Use the PR template and disclose agent participation.
- Record whether any skill, plugin, subagent, or external workflow is a Task-local instruction or an accepted repository requirement. Do not infer repository adoption from a single Plan, PR, example, or generated directory.
- Treat Superpowers and any `subagent-driven-development` instruction as Task-local unless an accepted and effective repository policy explicitly states otherwise.
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

Review Spec compliance separately from code quality. Two passes by the implementation author are self-review, not independent review; an independent-review claim requires a distinct non-author reviewer. Resolve all review conversations and pass `required / gate`.

Production release requires a namespaced tag, immutable artifact, smoke verification, Version History and Ledger trace, rollback target, Release Task Record, observation owner, and final Change Completion Dossier.
