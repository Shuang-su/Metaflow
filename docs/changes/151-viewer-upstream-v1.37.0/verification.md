# MF-151 verification and release record

Status: implementation preparation, not released. [Issue #151](https://github.com/Shuang-su/Metaflow/issues/151), [Spec](spec.md), [approved Plan](plan.md).

2026-10-18 baseline: remote main `440ec98af66aaed83207e2ce8731a85814703a7b`; primary local main `2c548d14213e096a1f967475a534d3b5d881deda` with 22 local-only commits and the unrelated untracked Swiftgram directory. Reused clean isolated worktree on `codex/mf-151-viewer-1370`; protection branch `codex/protect-main-20261018-v5220` retains local main. No source resource edits.

Production HTTP readback confirms 5.21.11 / 100 resources / schema 1.2, product `a9b4f41782c9d96cae0aa1c2c81ea8eee7d3ebe9`, build `988c8e7cbe5844af3133a38ac4a988af2601092b`. Netlify actual published deployment is `6aca09261511aa373989bac4` (ready), the initial rollback target.

The project volume has 3.3 GiB available at execution start (1.4 GiB during planning). Existing Viewer dependencies are 359 MiB and browser cache 650 MiB. Reuse those caches and frozen resource/artifact payloads; do not copy the full data set or delete unrelated work.

Evidence is kept in project-local `.codex-work/viewer-upstream-1370-20261018/`. Baseline source/artifact hashes, browser/performance results, implementation corrections, package/CI checks, final identities and production observation will be appended as completed. No hardware XR acceptance is claimed.
