---
change_id: MF-21
title: Editor Active source ownership and upstream snapshot contract
status: specified
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

# Change Spec

## Context and Proposal

MF-21 implements the accepted source-ownership decision in `proposal.md`. `metaflow-editor/` becomes the Active fork; `supersplat-v2.28.0/` becomes a registered immutable reference snapshot.

## User-visible behavior

The `/editor/` application remains Metaflow Editor 1.1.0 with the same branding, service worker, locales, Legacy ZIP, settings JSON, HTML/SOG package export and reopen behavior, and 100000-frame timeline limit.

## Journey, states, or behavior matrix

| Scenario | Required behavior |
| --- | --- |
| Open `/editor/` | Load the generated Active Editor distribution |
| Read `/editor/version.json` | Return current Editor 1.1.0 metadata generated from the structured source |
| Export Legacy ZIP | Preserve the existing legacy package file set and reopen contract |
| Export settings JSON | Preserve existing settings serialization |
| Export HTML/SOG package | Preserve existing viewer dependency and package behavior |
| Edit long animation | Preserve the 100000-frame limit |

## URL, configuration, data, type, or API contracts

- Active source path: `metaflow-editor`.
- Build output path: `metaflow-editor/dist`, ignored by Git.
- Upstream snapshot path: `supersplat-v2.28.0`.
- Current metadata gains `upstreamSnapshotPath`; historical version entries remain unchanged.
- Netlify publishes `metaflow-editor/dist/` at `/editor/` after building it.
- Reference registry records repository, tag object, commit, tree, tracked file count, and canonical path/mode/blob digest.

## Technical design and data flow

CI and Netlify install and build the Active package. The version generator reads `metadata/editor-version-history.json`, updates the data mirror, and writes runtime metadata after the Editor build. Reference validation computes a canonical digest from sorted `<mode> <blob>\t<path>` records for tracked snapshot files and compares it with the registry.

## Errors, timeout, cancellation, degradation, and recovery

- A snapshot identity mismatch, unexplained runtime artifact difference, failed applicable Gate, or failed Preview stops the Change as `partial`.
- If Preview requires Issue #15 work, that infrastructure remains separate and this PR stays Draft/partial.
- Recovery is branch deletion or revert before merge; no production rollback applies because the PR must not merge.

## Compatibility and migration

- Editor version remains `1.1.0`; no Version History release entry is added.
- Historical `1.1` paths and Git refs are preserved as historical facts.
- Export formats, saved-user-file compatibility, locales, URL path, and Viewer dependency behavior remain unchanged.
- Committed generated Editor artifacts are removed and remain recoverable from the pre-change Git commit.

## Security and privacy

The snapshot is read-only provenance material and is excluded from dependency automation. Existing dependency findings are neither hidden nor claimed fixed; MF-2 handles them. No secrets or personal data are introduced.

## Performance budgets

The runtime file set and non-map content must match the baseline. Full performance sampling is out of scope because behavior is unchanged.

## Accessibility, mobile, and reduced motion

No interaction or rendering change is authorized. Existing behavior must remain unchanged; new visual or accessibility claims are not made.

## Non-goals

- Dependency upgrades, product features, visual changes, releases, production deploys, PR merge, and Issue #15 infrastructure.
- Rewriting historical Editor Version History paths.
- Granting modification rights from component path ownership.

## Acceptance matrix

| Requirement | Evidence | Required environment |
| --- | --- | --- |
| Exact upstream snapshot | Registry validator: tag/commit/tree/file count/digest | Git checkout with official identity evidence |
| Active package identity | package metadata and clean `npm ci` | Node 20.19.0 |
| Behavior contracts | package tests for branding, formats, service worker, locales, frame limit, version | Node 20.19.0 |
| Reproducible runtime | pre/post file list and content comparison excluding allowed differences | Release build |
| CI/release/metadata ownership | workflow and generator checks | Repository tests |
| Preview routes | `/`, `/editor/`, `/editor/version.json`, Editor static asset smoke | Netlify Deploy Preview |
| Repository governance | MCL, platform, Markdown, Completion, diff checks | Local and GitHub CI |

## Open decisions

None.
