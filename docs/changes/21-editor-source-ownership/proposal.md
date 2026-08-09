---
change_id: MF-21
title: Make metaflow-editor the Active source and restore upstream v2.28.0
status: accepted
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

# Proposal

## Problem or opportunity

The customized Editor source currently lives under `supersplat-v2.28.0/`, while `metaflow-editor/` contains committed build output. That layout makes an Active fork look like an immutable upstream snapshot and caused dependency automation to target versioned reference directories.

## Users and scenarios

- Maintainers need one unambiguous Active Editor package for source changes, CI, dependency updates, and releases.
- Maintainers need an exact upstream `playcanvas/supersplat` `v2.28.0` snapshot for comparison and provenance.
- Existing `/editor/` users must receive unchanged Editor 1.1.0 behavior and compatible exports and saved files.

## Evidence

- The current customized source rebuilds successfully with Node 20.19.0.
- Excluding source maps and generated `version.json`, the baseline build is byte-for-byte identical to the committed `metaflow-editor/` runtime files.
- The official tag, commit, tree, file count, and canonical tree digest are independently reproducible.
- PR #4-#8 targeted versioned snapshot paths and were closed without merge under MF-9.

## Why now

MF-2 must remediate Active dependencies without touching immutable references. Correct source ownership is the prerequisite for a safe, reviewable dependency Change.

## Goals and measurable success signals

- `metaflow-editor/` is the only Active Editor source package and builds into ignored `metaflow-editor/dist/`.
- `supersplat-v2.28.0/` exactly matches the registered official upstream snapshot.
- Editor 1.1.0 runtime behavior and published file content remain unchanged except for source maps and generated version metadata location/content.
- CI, release, metadata generation, and Netlify consume the Active source rather than committed build output.
- A Ready, unmerged PR has passing applicable Gates and a successful Deploy Preview.

## Non-goals

- No Editor feature, UI, export-format, user-file, URL, or version change.
- No dependency remediation; MF-2 owns it.
- No Viewer full E2E, visual baseline, performance campaign, production deploy, release, or PR merge.
- No Issue #15 LFS/Netlify infrastructure expansion.

## Options

1. Keep the current layout: rejected because ownership remains ambiguous and automation continues to target snapshots.
2. Move Active source to `metaflow-editor/` and restore the exact upstream snapshot: accepted.
3. Delete the snapshot: rejected because provenance and comparison value would be lost.

## Cost and dependencies

The Change touches source layout, metadata, CI, release automation, Netlify build wiring, tests, reference integrity, and documentation. It depends on the official upstream tag and the current reproducible build baseline.

## Compatibility, security, privacy, and performance risks

The main risk is an unnoticed runtime difference during the move. Exact artifact comparison and behavior-contract tests gate the PR. Dependency advisories remain explicitly deferred to MF-2. No user data, credentials, production write, or public API change is introduced.

## Recommendation

Adopt the source-ownership migration as an MCL T3 pilot, stop on any unexplained artifact difference, and deliver a Ready but unmerged product PR.

## Decision

- Decision: Accept
- Approver: Shuang-su
- Date: 2026-08-10
- Conditions: preserve Editor 1.1.0 behavior, restore the exact registered upstream snapshot, pass applicable Gates and Preview, and do not merge or deploy.
