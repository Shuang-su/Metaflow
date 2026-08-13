# MF-30 Viewer v1.29.1 review delivery

## 1. Delivery state

- Change: `MF-30` / GitHub Issue #30.
- Draft PR: [#41](https://github.com/Shuang-su/Metaflow/pull/41).
- Review candidate: Metaflow Viewer `5.19.0`.
- Active upstream foundation: SuperSplat Viewer `v1.29.1`, PlayCanvas `2.21.3`.
- Branch: `codex/viewer-upstream-v1.29.1`.
- Base and full rollback: `dbbd0015a8d13d4380d100fad4e5121dc2b29746` (Viewer `5.18.1`).
- Candidate implementation ref in Version History: `cb4a3f1`.
- Production state: Viewer `5.18.1`; no merge, tag, deployment, production smoke, or observation has occurred.

The candidate ref identifies the last product-behavior checkpoint before release-record preparation. A squash merge creates a different commit. The merge is therefore not release-complete until a small follow-up release-record commit replaces the provisional ref in Version History, its public mirror, `data/index.json.release`, the Ledger, and the E2E fixture.

## 2. Atomic commit manifest

### Reference and independent-review history included in this branch

| Commit | Purpose | Product version effect |
|---|---|---|
| `1c947e5f` | Move historical SuperSplat baselines under `references/` and add snapshot governance. | None; reference/governance only. |
| `c343d4a4` | Add immutable Viewer/Editor/Transform comparison snapshots. | None. |
| `c1cbe3f0` | Record stable releases discovered during the stop-and-recheck gate. | None. |
| `606fdb29` | Store the independent Viewer/Editor/Transform review reports and selected evidence. | None. |
| `ac23d495` | Merge the reviewed baseline branch into the isolated Viewer implementation branch. | None. |

### MF-30 implementation history

| Commit | Purpose | Review / rollback meaning |
|---|---|---|
| `a1034123` | Add immutable Viewer `v1.29.1` snapshot plus the initial MF-30 Spec, Plan, conflict register, and refreshed review. | Upstream identity checkpoint; no active Viewer behavior change. |
| `3f7baa0` | Lock Metaflow route, loading, settings, camera/input, collision, Analytics, locale, debug, and pre-decision SH behavior. | Test-first compatibility baseline. |
| `04051b5` | Upgrade PlayCanvas/build tooling to the exact v1.29.1 dependency line. | Last dependency/API checkpoint before broad formatting. |
| `1a86d23` | Isolate the upstream formatting baseline. | Last clean rollback point before rendering behavior changes. |
| `0d67ac5` | Port on-demand rendering, near clip, component LOD range, work-buffer timing, and settings compatibility. | Last checkpoint before new public capabilities. |
| `773468a` | Port capture, Annotation preference, heatmap behavior, and backend-aware XR detection. | Last checkpoint before transient-load recovery. |
| `332ad44` | Add bounded retry and explicit terminal resource-load failure state. | Reliability checkpoint. |
| `874149f` | Add route/browser/negative evidence and upstream/Engine runtime diagnostics. | Evidence checkpoint; no version bump. |
| `cb4a3f1` | Replace the early local SH `4°/2°` policy with Viewer v1.29.1 `1°/0.2°`. | Final product-behavior ref for Viewer `5.19.0` candidate. |
| `b30a15e` | Prepare `5.19.0` package/public version surfaces, Ledger, deep-research supplement, final validation record, and Issue/PR navigation. | Release-review support record; does not replace `cb4a3f1` as the provisional product behavior ref. |

The release-record commit after the product checkpoint is a support record. It does not replace `cb4a3f1` as the provisional product implementation ref. The following delivery-checkpoint commit only registers `b30a15e` in the permitted version and review records; it likewise creates no product behavior.

## 3. Version decision

Viewer `5.19.0` is a MINOR candidate because the change adds backwards-compatible public and product capabilities rather than only a bug correction:

- `window.captureFrame(options?)`;
- persistent Annotation visibility preference;
- on-demand rendering and new streaming work-buffer behavior;
- backend-aware XR capability handling;
- bounded initial-resource recovery and explicit terminal failure UI.

The URL, route/index, settings v1/v2, resource, collision, camera, locale, Analytics, Editor, and Transform contracts remain compatible. No current resource payload or schema was migrated.

Version surfaces prepared together are:

1. `metaflow-viewer/package.json` and `package-lock.json`;
2. `metadata/version-history.json` and `data/version-history.json`;
3. `data/index.json.release` and the deterministic E2E fixture;
4. Viewer Ledger and current-version documentation;
5. version/upstream compatibility tests.

## 4. Review evidence and limitations

The long-form evidence is split deliberately:

- [`research-supplement.md`](research-supplement.md): cumulative upstream research, Engine ancestry caveat, and voxel/non-voxel boundaries;
- [`conflicts.md`](conflicts.md): every Keep/Port/Replace decision and residual risk;
- [`evidence.md`](evidence.md): static, build, browser, negative-path, size, and dependency outcomes;
- [`spec.md`](spec.md) and [`plan.md`](plan.md): current contracts and execution boundaries.

The final SH contract was rerun on Xunyangpai with real Chromium WebGPU and WebGL2. Both reached `loadingStage=complete`; quality mode read `0.2`, performance mode read `1`, and completed scenes remained on-demand with `autoRender=false`.

Physical iOS/Android devices and immersive XR hardware remain unverified. Those gaps must not be described as passed in the Issue, PR, release note, or later deployment record.

## 5. Release-record validation

The final review-candidate pass used repository Node `20.19.0` and produced these results:

| Check | Result | Qualification |
|---|---|---|
| Clean install and production tree | `npm ci` and `npm ls --omit=dev --all` passed | No production dependency was added by the release-record changes. |
| Viewer unit/contract tests | `73/73` passed | Published BitCity/SZCAF15 assets were mounted read-only from their release worktree; Cyrene and Dayun used the existing repository assets. Nothing was copied or committed. |
| Deterministic browser fixture | Playwright `4/4` passed | Chromium WebGL desktop and mobile projects checked the `5.19.0` UI, settings interaction, and stable screenshot baselines. |
| Viewer quality checks | format, lint, typecheck, publint, and production build passed | Publint retained one non-blocking `sideEffects` suggestion; this Change does not alter package-consumption semantics. |
| Reference governance | local registry and `9/9` validator tests passed for 12 snapshots | A fresh online rerun was stopped by GitHub TLS/empty-response failures at the first historical tag; the implementation checkpoint's successful 12-snapshot online run remains the latest complete online evidence. |
| Repository governance | CI routing `13/13`, platform `7/7`, data, Version History, MCL `check-all`, Markdown links, repository scan, and `git diff --check` passed | Final pre-commit counts were 101 Markdown files and 12,745 scanned files. |
| Production dependency audit | latest successful run: 0 high, 0 critical, 1 moderate DOMPurify | The release-record refresh failed twice at npm's retiring quick-audit endpoint (HTTP 400, then socket hang-up). This is recorded as an unavailable refresh, not a pass or a new finding; dependency tree was unchanged and valid. |

The earlier route matrix remains the behavior acceptance source. The fixed-fixture E2E supplements it; it does not replace the WebGPU/WebGL route evidence, negative tests, mobile-emulation limitation, or XR-hardware limitation.

## 6. Remote review and post-merge protocol

Issue #30 and Draft PR #41 must remain `In Review`. Their detailed bodies must include the current state, background, goal, included/excluded scope, upstream interval, local features preserved, SH decision, voxel terminology, commit manifest, validation, limitations, risk, rollback, and completion boundary.

After an authorized squash merge:

1. read the final squash SHA from `main`;
2. replace provisional `cb4a3f1` references on every version surface;
3. add the final release-record commit and rerun version/data/platform checks;
4. keep Issue #30 open unless tag, deployment, smoke, observation, and rollback readiness are separately authorized and completed;
5. only then consider `viewer-v5.19.0`, production deployment, and a stable-release claim.

This protocol prevents a review candidate or branch-only SHA from being mistaken for an immutable production release.
