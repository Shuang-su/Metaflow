# MF-85 implementation plan

Approved 2026-09-28. Unique specification: [spec.md](spec.md).

1. Reverify origin/main, production and rollback deployment. Work from remote main in an isolated branch; preserve local main's 18 unique research commits and untracked files. Use project-local staging and reuse immutable resource files. Capture 5.19.3 camera/render/loading/performance baselines for ordinary SOG, subject+environment, streaming event and large tiled-voxel scene.
2. Three-way compare immutable v1.29.1, Metaflow and pinned v1.35.2. Update PlayCanvas to 2.22.4 and required build/declaration tooling, retaining analytics, recording and tests. Node remains 20.19.0. Keep old snapshots immutable; document Adopt/Adapt/Defer decisions.
3. Port loading, animation, LOD and reveal fixes with Metaflow source classification/retries/environment/collision/readiness contracts. Integrate instance lifecycle and typed custom options. Scope DOM/input/analytics cleanup per instance. Keep captures/globals and partial historical settings compatible.
4. Adopt new upstream UI and annotation subsystem with Metaflow branding, locales and additional navigation controls. Retain existing resource and debug interfaces. Include no experiments or public data migration.
5. Validate package/build/type/lint/unit; full 99 resource/settings and hashes; browser/backend and representative scene matrix. Verify lifecycle, captures, input isolation, error recovery, mobile/desktop, backgrounds and known viewport transitions. Repeat baseline scenarios under matched conditions and investigate reproducible regressions.
6. After acceptance, set 5.20.0 and append Ledger/History/source records. Product squash PR -> final SHA release record -> tag/GitHub release -> verified Netlify candidate -> production -> readback and 15-minute observation. No additional preview approval gate. Disclose unavailable physical XR tests; rollback on blocking regressions. Deliver PR/SHA/tag/deployment/validation evidence and preserve local divergent history when syncing.

## Initial execution evidence
- origin/main: 7989c68079eb915b203e94fa31e088ecedb8f065; local main aa7b5e1292c5d7fa379ff4810062ec5ffa6d206c (ahead 18, behind 0).
- Production readback: 5.19.3, product f999471, schema 1.2.
- Managed worktree creation failed with ENOSPC on system volume. A sparse isolated worktree on Prism is used; resource directories link to unchanged source assets for testing. No user files were cleaned.
