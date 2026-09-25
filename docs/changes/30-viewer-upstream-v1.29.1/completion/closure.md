---
change_id: MF-30
terminal_state: closed
generated_at: 2026-08-14T12:17:14Z
---

# MF-30 Viewer 5.19.1 release closure source

## Closure Decision

Close MF-30 as completed. Metaflow Viewer `5.19.1` is production-stable on Netlify deploy `6a7efc396f36c800cfa0702e`. The release preserves runtime product SHA S, release-control SHA F, release-record R2, immutable packet/Tag target D2, and the failed pre-deployment `5.19.0` attempt as distinct identities. Controlled Prepare, exact-D2 CLI/API deployment, immediate smoke, a 15-minute observation, and GitHub Release all passed. No rollback was required.

## Task Disposition

- `MF-30-T01` is complete: Viewer v1.29.1 implementation, decision completion, browser validation, branch delivery, and PR #41 squash integration are recorded.
- `MF-30-T02` is complete: formal merge/release work, the retained `5.19.0` failure, recovery PR #45, `5.19.1` version alignment, queue release, successful controlled Prepare, exact-D2 production deploy, immediate smoke, observation, Release, and this final packet are recorded.

## Plan Amendments and Deviations

Revision 1 covered the staged Viewer product upgrade and review delivery. Revision 2 authorized the first formal release; immutable `viewer-v5.19.0` failed before deployment because its sparse fixture omitted `.nvmrc`, BitCity, and SZCAF15 and ran package consumers before build. Revision 3 selected PATCH `5.19.1`, repaired those deterministic controls in recovery PR #45, and added ordinary-main Netlify gating without changing runtime behavior. Revision 4 was explicitly authorized after Netlify Git builds again failed to progress: cancel all 26 pre-existing non-published Preview jobs, preserve their history and PRs, require controlled Prepare success, and use a clean exact-D2 CLI/API fallback if Git infrastructure remained blocked.

The final production transport is therefore an authorized deviation from the controlled hook path, not a validation bypass. Run `31795886847` passed the non-bypassable Prepare job first. Netlify reports the resulting deployment honestly as `deploy_source=api` with `commit_ref=null`; D2 identity is established through remote main and immutable Tag equality, the detached D2 HEAD/tree, deploy title, local/online artifact hashes, and the online `5.19.1 / gitRef 534b013` records. No Viewer runtime, route, index schema, resource payload, preference migration marker, Editor, Transform, SPZ/KHR contract, or LICENSE behavior changed.

## Implementation and External Effects

PR #41 squash merged the Viewer runtime as `S = 26e311c010aea4a6202521453a034d5aef3cea54`; `R = 18a164d64f5415f3dba9eed354192dd99f81bbec` aligned the original merge record. Failed packet `D = f1986097f81cf15db95d33fa76c090b2066d4bd1`, immutable `viewer-v5.19.0` Tag object `c9a19ea438e604333af2d3158bebea7d16f1a33e`, and failed workflow `31779246997` remain historical evidence; they never changed production and have no GitHub Release.

Recovery PR #45 squash merged as `F = 534b01308f13732c58600cef571b5dfea14df51b`. `R2 = f0fb740dd77d67e4f1be781934ce7a4fa095c30a` aligned all `5.19.1` version surfaces. `D2 = d5c1faf1a512d5796664524c4da58f3242ea9a80` is the complete pre-release packet and target of annotated Tag `viewer-v5.19.1`, object `fba2a8e94ca5da5dc76cce34e03f7da859c526fe`. R2 and D2 were fast-forwarded to `origin/main` without force.

All 26 snapshotted non-published Preview deploys reached terminal `error`: 19 were explicitly canceled after identity readback and seven became terminal while the queue drained. Their PRs and logs were retained. Source-less unpublished record `69e9d75057dc3e70dd511cd1`, F ordinary-main record `6a7ee320ef4dbd0008dd089f`, and D2 ordinary-main record `6a7ef76cbdfb3400086615bc` were also canceled without deleting history. Neither main record reached a true Netlify skip, so neither is represented as skip evidence.

Exact-D2 Netlify production deploy is `6a7efc396f36c800cfa0702e`; immutable URL is `https://6a7efc396f36c800cfa0702e--charming-salamander-fc1af0.netlify.app`; production URL is `https://metaflow.shuang-su.com`. GitHub Release is `https://github.com/Shuang-su/Metaflow/releases/tag/viewer-v5.19.1`. The protected divergent local main and `swiftgram-ios-liquid-glass-lab/` were not modified.

## Verification and Review

Product, recovery, and D2 validation passed Viewer `85/85`, format, lint, typecheck, publint, default and Debug Engine builds, CSS-map integrity, exact DOMPurify `3.4.13`, zero production vulnerabilities, npm pack and Rollup/Webpack consumers, WebGL E2E `4/4`, WebGPU E2E `1/1`, full 87-resource and zero route/model drift validation, reference identities, Platform, CI routing, Markdown, repository scan, strict MCL, and `git diff --check`. Controlled Prepare run `31795886847` repeated the D2 sparse build and Viewer `85/85` in GitHub Actions; evidence artifact ID is `9217366769` and its Git tree digest is `9a7dc95c2e490b17c61f1be4cec399d005ee21e26286fb8d5189e98f4b14c09d`.

The clean detached staging tree had HEAD D2 and tree `0abfd7b0115dfd13b7bfae7556d77851f88794fb`. Its physical publish directory contained 10,180 files, all 87 resources, no symlink, no Finder metadata, no local absolute path, and no secret. Seven key online artifact hashes matched local output. Immediate browser smoke passed representative legacy SOG, streaming LOD, tiled voxel, animation-exit, BitCity, SZCAF canonical/alias, and still-SOG dual-source routes on WebGPU and WebGL, desktop and `360 x 732`, with SH `1/0.2`, capture, Annotation, controlled WebGL heatmap degradation, on-demand frame requests, and one-time preference migration. Bijiashan's known missing tile emitted one 404 and one controlled warning while the main scene remained loaded.

No independent reviewer completed review of PR #41 or PR #45. The user explicitly authorized merge and release with that limitation disclosed. Physical iOS/Android and immersive XR remain unverified; mobile viewport and XR API detection are not represented as hardware evidence.

## Release, Rollback and Observation

Netlify published deploy `6a7efc396f36c800cfa0702e` at `2026-08-14T11:30:19.339Z`. Both immutable and production indices reported Viewer `5.19.1 / gitRef 534b013`; public Version History reported upstream `1.29.1`. The immediate readback at `2026-08-14T19:53:31+08:00` confirmed the pointer and healthy routes.

The delayed check began after 15 minutes. At `2026-08-14T20:09:00+08:00`, a new clean WebGPU session loaded Cyrene legacy SOG in 9.326 seconds and Xunyangpai streaming in 24.408 seconds. Both reached `loadingStage=complete`, `autoRender=false`, migration marker `5.19.0`, and zero console/network problems; Xunyangpai reached quality SH angle `0.2`. Screenshots showed complete non-black scenes. At `2026-08-14T20:11:19+08:00`, the production pointer, production and immutable version records, successful Prepare run, artifact, immutable URL, and GitHub Release were still available and unchanged.

Rollback target remains deploy `6a7a18b49094c6c76eff2482` (`viewer-v5.18.1`). It was not invoked. Both published Viewer Tags are immutable; any tracked post-Tag correction requires `5.19.2`.

## Remaining Risks and Follow-up Changes

Residual risks are the unverified physical mobile and immersive XR paths, additional SH work during small camera motions, the requirement that future dynamic surfaces explicitly request frames, lack of a new per-request timeout or `Retry-After`, and future Engine parser/work-buffer changes. Future `streaming / highest-quality` source labels, data schema, and user switching are a separate Change. Netlify ordinary Git-build behavior remains an infrastructure concern: intended main skipping is covered by repository tests, but the real F and D2 jobs stalled and had to be canceled rather than producing remote skip proof.

## Ledger, Version, PR, and Release Links

- Issue: https://github.com/Shuang-su/Metaflow/issues/30
- Viewer implementation PR: https://github.com/Shuang-su/Metaflow/pull/41
- Release recovery PR: https://github.com/Shuang-su/Metaflow/pull/45
- Product S: `26e311c010aea4a6202521453a034d5aef3cea54`
- Original merge record R: `18a164d64f5415f3dba9eed354192dd99f81bbec`
- Failed packet D: `f1986097f81cf15db95d33fa76c090b2066d4bd1`
- Recovery F: `534b01308f13732c58600cef571b5dfea14df51b`
- Recovery record R2: `f0fb740dd77d67e4f1be781934ce7a4fa095c30a`
- Release packet D2: `d5c1faf1a512d5796664524c4da58f3242ea9a80`
- Failed Tag: `viewer-v5.19.0`, object `c9a19ea438e604333af2d3158bebea7d16f1a33e`
- Released Tag: `viewer-v5.19.1`, object `fba2a8e94ca5da5dc76cce34e03f7da859c526fe`, target D2
- Successful Prepare: https://github.com/Shuang-su/Metaflow/actions/runs/31795886847
- Production deploy: https://6a7efc396f36c800cfa0702e--charming-salamander-fc1af0.netlify.app
- Production: https://metaflow.shuang-su.com
- GitHub Release: https://github.com/Shuang-su/Metaflow/releases/tag/viewer-v5.19.1
- Rollback deploy: `6a7a18b49094c6c76eff2482`

## Redactions

No repository text redactions were required. Credentials, secret values, local Netlify login material, and the build-hook URL were excluded at source and are not represented by placeholders.

## Final Response Delivery

This source records every production fact available before the E2 commit without inventing E2's own SHA. After E2 is fast-forwarded, the GitHub Release and both merged PRs are updated, Issue #30 is replaced with the complete delivery record and closed as Completed, every external surface is read back, and the separately approved clean-worktree cleanup runs. The final user response is sent only after those post-commit effects succeed.
