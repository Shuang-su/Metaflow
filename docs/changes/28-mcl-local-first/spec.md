---
change_id: MF-28
title: 本地优先 MCL 与 Viewer SemVer 前向契约
status: specified
component:
  - platform
  - viewer
risk: T2
type: governance
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/28
canonical_path: docs/changes/28-mcl-local-first/spec.md
---

# 本地优先 MCL 与 Viewer SemVer 前向契约

## 决策

MCL v1.0 继续保持 `candidate`。Revision 6 把日常主路径缩短为按需工件、实施、本地验证、Direct Commit 或 PR、按需发布记录和完成交付；GitHub Actions 不再是通用完成条件。

本契约不删除 Revision 5 已建立的自描述 Issue、唯一 Spec/Plan、审计模式与 legacy 兼容。它只收窄默认流程，并把 Viewer 字母资源版本从下一次真实发布起迁移到标准 SemVer PATCH。

## 生命周期与开始/完成条件

通用状态是 `Open → In Progress → In Review → Done`。不需要审查的任务可以从 `In Progress` 直接进入 `Done`。只有未决 Proposal 使用 `Proposed`；生产发布可以追加 `Released → Observing → Done`。`Blocked`、`Parked`、`Rejected`、`Rolled Back` 只在真实发生时使用。

- **开始条件**：目标、包含/排除范围、验收和风险足以实施。
- **完成条件**：授权范围已实现，适用本地验证、未运行项、风险和回退已记录；产品发布还必须更新 Ledger、Version History，并完成必要观察。

T0–T3 继续作为风险标签，但不自动展开一条固定工件链。是否需要 Issue、Spec、Plan、PR、TDD、Evidence、发布或观察由变更性质决定。

## 工件与 Completion Contract

任何已经创建的 Issue 都必须包含当前状态、背景、目标、包含范围、排除范围、验收、风险/依赖/回退、Spec/Plan/任务链接和完成交付。简单任务可以不创建 Issue。

- Spec 只在产品/技术契约需要长期保存时创建。
- 仓库 Plan 只在跨会话、步骤多、依赖或回退复杂、需要正式交接时创建；Codex Plan 足够时不再复制。
- RED/GREEN/REFACTOR 只用于适合测试先行的行为代码，不强制用于 Markdown、资源、配置或机械维护。
- 有 PR 时，PR 是 Completion Contract；有 Issue 但无 PR 时，回填 Issue；二者都没有时，commit body 只允许简短 `Validation:`、`Release:`、`Refs:` trailer。
- Ledger 与 Version History 不是通用完成档案。完整交流由 Codex 任务链接承担；Dossier、Manifest 和 transcript 只在显式审计模式使用。

## 资源发布分级

| 路线 | 条件 | 最小流程 |
| --- | --- | --- |
| 常规资源 | 既有格式、schema、生成器、缓存与现有 route；不涉及 LFS、许可证、运行时代码或部署配置 | 可 Direct Commit；生成并审查 index，运行数据/route 定向验证；公开发布时更新 PATCH、Ledger、Version History |
| 大型或新增入口 | 新 route/alias、超过 20 个文件、新增超过 100 MiB、LFS 或大量 tiled/LOD 文件，但契约不变 | 轻量 Issue 或 PR checklist + PR；审查存储、路径、索引与缓存；不默认要求完整 Spec、产品 build 或 E2E |
| 结构性资源变更 | 修改 schema、生成器语义、Loader、Viewer 行为、缓存/部署、格式兼容、授权来源或公共 URL 契约 | Issue + 唯一 Spec + 唯一 Plan + PR；运行实际行为命中的检查 |

文件数量和体积是操作路线阈值，不直接等同风险等级。尚未进入公开 index/route 的 staging 上传不提升产品版本。同一路径覆盖 immutable 大文件必须显式评估缓存。

常规直接发布使用两个本地原子提交并一次 push：先提交产品/资源，再用 `chore(release)` 引用前一提交的真实 SHA 并更新发布记录。Squash PR 在合并后用极小的 release-record commit 回填最终 SHA；回填前不标记稳定完成。

## Ledger 与 Version History

Viewer Ledger 继续作为人类可读的产品行为审计层，记录动机、原行为、实现、用户结果、风险、兼容、证据与后续。Version History 继续作为机器可读发布事实源，记录版本、类型、组件、日期、实现 commit、route/resource changes、package、index schema 与上游基线。

历史上截至 `c613a87` 的 entries、`maintenanceCommits` 和 Ledger 内容保持不变。从该边界之后：

- 只要求 Viewer、data 和 Viewer 发布支撑路径的相关 main commit 被分类；
- 产品功能、修复、资源和实际部署变化进入正式版本 entry；
- staging、版本修正和发布支撑提交可以进入 `maintenanceCommits`；
- MCL、普通文档、Design、Reference、Editor 和无关平台提交不进入 Viewer 总账；
- `documentedThrough` 表示 Viewer 审计边界，而不是全仓所有组件的提交覆盖率。

## Viewer SemVer 前向规则

当前事实仍是展示版本 `5.18a`、package `5.18.0`。不创建空的 `5.18.1`，也不重写任何历史字母版本或资源 `addedIn/updatedIn`。

下一次真实 Viewer 资源发布或兼容修复使用 `5.18.1`，之后依次为 `5.18.2`、`5.18.3`。`5.18a` 之后禁止新字母版本。

| 变化 | 版本 |
| --- | --- |
| 资源、thumbnail、settings、兼容 route/alias、Bug、小型兼容行为或部署修复 | PATCH |
| 新的向后兼容产品、交互、Loader、数据或架构能力 | MINOR |
| 不兼容 URL/settings/index 契约或要求消费者迁移的变化 | MAJOR |
| 文档、治理、研究、无行为 refactor、测试维护、未公开 staging | 不提升产品版本 |

保留 `displayVersion` 和 `appSemver` 字段及 Viewer runtime 读取接口。历史 entry 继续接受 `major.minor` 和 `major.minor[a-z]`；cutoff 后的新 entry 必须是完整 `major.minor.patch`，且 `displayVersion === appSemver`。本 Change 不修改 `data/index.json` schema。Editor 保持独立版本体系。

## 本地验证与托管控制

`scripts/ci-routing.mjs` 和 `metadata/ci-routing.json` 继续用于选择本地最小检查并检测未知路径；它们不再代表每个 PR 都有一个 enforced hosted Gate。

普通 `.github/workflows/ci.yml` 只通过 `workflow_dispatch` 按需运行，最终 job 是手动验证汇总。release、rollback、upstream-watch 和计划内的扩展浏览器检查保留独立触发语义。

main Ruleset 保留 deletion、non-fast-forward 和协作者 PR 规则，移除 `required_status_checks`。仓库所有者 `Shuang-su` 以精确 User actor 获得 direct-push bypass；若托管 API 不支持该 actor，则移除 PR 硬规则，并在 MCL 中保留按风险使用 PR 的政策要求。任何托管规则变更必须写入后重新读取，只有读回一致才能称为 enforced。

## 兼容和非目标

- MCL 文档路径、candidate 状态和 MF-1/MF-9 legacy 档案保持不变。
- Revision 5 与 MF-16 的历史 Spec/Plan/证据保持原文，不按新政策改写。
- 不修改 Viewer/Editor 运行时，不上传资源，不触发部署。
- 不以本治理 Change 提升 Viewer 版本。

## 验收

- 默认流程、状态、条件工件和 Completion Contract 位置无歧义。
- 三档资源路线可以仅依据变更事实判定。
- Ledger 与 Version History 职责不变，但向前覆盖范围按 Viewer/data 收窄。
- legacy 字母版本通过；未来完整 SemVer 通过；未来字母版本失败。
- 当前仍为 `5.18a / 5.18.0`，下一个真实版本明确为 `5.18.1`。
- 普通 GitHub CI 和 `required / gate` 不再是必需完成条件。
- legacy、MCL、路由、版本、Markdown、平台和 diff 定向检查通过。
