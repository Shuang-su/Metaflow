---
change_id: MF-21
title: Migrate Editor source ownership and restore upstream v2.28.0
status: planned
component:
  - editor
  - reference
  - platform
risk: T3
type: architecture
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/21
plan_revision: 1
completion_state: pending
supersedes: null
terminal_reason: null
---

# Implementation Plan

## Goal

Deliver a Ready, unmerged PR that makes `metaflow-editor/` the Active Editor 1.1.0 source, restores `supersplat-v2.28.0/` to the exact official upstream snapshot, and proves that user-visible behavior and runtime output are unchanged.

## Architecture summary

The Active fork, its ignored `dist/`, metadata generator, CI, release workflow, and Netlify build form the product path. A separate reference registry and validator own the immutable upstream snapshot. Version History remains the release fact source; MF-21 only records source relocation in current metadata and the ledger.

## Preconditions and dependencies

- Work only in `/Volumes/Prism/Metaflow-editor-migration` on `codex/mf-21-editor-source-ownership`, based on `origin/main` at `b9c54c0cf985cdb6908bc0b877312eee453ec4fe`.
- Preserve `/Volumes/Prism/Metaflow` local `main` at `47ffd86e9635d7d797628a214df817f7ca60b55c`, its nine local commits, the untracked Swiftgram directory, and the predecessor-plan checksum.
- Use Node 20.19.0 for package commands.
- Fix upstream identity to tag object `ca76baf0c6b7f12a337c1c71a37554eb991a25f9`, commit `9f4dfe1ff4e94876fb2054353497c8e2eb93b423`, tree `0ce0d79143abc945e394d1f13f362533a15bf363`, 232 files, and canonical digest `9d37961e3ba6259b26f8564e177d5aa4de7d547caa2fd6a8a7ae748c1a6df4a7`.
- The verified baseline build must remain byte-identical to the committed runtime except source maps and generated `version.json`.

## Branch and worktree strategy

Make all tracked changes in the isolated worktree. Commit and push only the MF-21 branch. Open PR A against `main`, keep it Draft until the exact Head passes applicable GitHub Gates and Netlify Preview, then mark it Ready without merge.

## Tasks

### MF-21-T01 — Source migration, snapshot restoration, validation, and Ready PR

- Authorized scope: MF-21 Proposal, Spec, Plan, Active source relocation, exact snapshot restoration, ownership metadata, tests, CI/release/Netlify routing, Evidence, Completion, push, PR, Preview, and Ready transition.
- Target paths: `metaflow-editor/**`, `supersplat-v2.28.0/**`, Editor/reference metadata, relevant scripts/tests/workflows, `netlify.toml`, repository documentation, and `docs/changes/21-editor-source-ownership/**`.
- RED boundary: current ownership routes Active Editor work through a versioned path; current reference validation lacks v2.28.0 identity; current version generator and Netlify consume committed build output.
- GREEN implementation: move the customized source to the Active path, restore the official archive, register and validate its canonical identity, update product pipelines, and add behavior and artifact contracts.
- REFACTOR boundary: only path/ownership and supporting validation cleanup; no feature, dependency, visual, export, data-format, or version change.
- Validation: exact snapshot identity, Node 20.19.0 `npm ci/test/lint/build`, behavior contracts, pre/post runtime comparison, metadata and generator checks, MCL/platform/Markdown/Completion/diff checks, GitHub required Gate, and Deploy Preview route/static-asset smoke.
- Commit and PR boundary: one or more reviewable MF-21 commits and one Ready, unmerged PR A against `main`.
- Serial dependency: finish MF-21 and make PR A Ready before creating MF-2 from its exact Head.
- Rollback and stop: stop `partial`, keep PR Draft, and do not merge when snapshot identity, behavior, artifact parity, applicable hosted Gate, or Preview fails, or when success requires Issue #15 scope.

## Final validation

- `metaflow-editor` has package name `metaflow-editor`, version `1.1.0`, `private: true`, and ignored `dist/`.
- The snapshot registry validator proves all fixed upstream identifiers and the canonical tracked-tree digest.
- No historical Editor Version History entry is rewritten and no release entry is added.
- No dependency target version changes occur and Dependabot still excludes `/metaflow-editor` until MF-2.
- The baseline and migrated runtime file sets/content match under the approved exclusions.
- PR A changes no Viewer product source and passes applicable hosted checks and Preview smoke.
- Original local `main` and untracked materials remain unchanged.

## Release, observation, and closure

There is no merge, release, production deploy, or production observation in MF-21-T01. When the Ready endpoint is proven, set the Change to `ready-for-release`, archive the Task as complete, and leave the Change open pending future human merge authorization. If any mandatory Ready Gate is not proven, record `partial` and the exact continuation condition.
