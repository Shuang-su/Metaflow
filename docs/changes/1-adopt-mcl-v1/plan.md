---
change_id: MF-1
title: Adopt Metaflow Change Lifecycle v1.0
status: verifying
component:
  - platform
risk: T3
type: governance
owner: Shuang-su
created: 2026-08-09
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/1
plan_revision: 3
completion_state: pending
supersedes: null
terminal_reason: null
---

# MF-1 Revision 3 候选采纳、合并与合并后验证计划

## 1. 目标和结束状态

本 Change 将 MCL v1 的候选规范、模板、Schema、校验器和试点自动化以可追溯方式合入 `main`，并取得真实的合并后证据。

本 Revision 的目标结果是：

```text
PR #3 已合并，MCL v1 候选规范、工具和试点控制已进入 main。
已应用且重读验证的控制可逐项标记为 enforced-control。
MF-1 继续处于 verifying，MCL 1.0 尚未 effective/closed。
```

PR 合并、候选 CI 成功或 Ruleset 的局部应用都不单独构成 MCL 1.0 全量生效。

## 2. 权威输入和职责分离

- `docs/metaflow-change-lifecycle-v1.0.md` 是 MCL 规则、接口、状态、Gate、例外、控制和验收的唯一规范真源。
- `proposal.md` 记录为什么采纳候选 MCL 以及人类决策；`spec.md` 记录 MF-1 必须实现的可验证行为。
- 本文件只记录 MF-1 的执行顺序、验证、合并、停止、回滚和接续条件，不复制 MCL 规范。
- `evidence.md` 只记录真实执行过的命令、外部写入和重读结果。
- `completion/approved-plan.md` 由 Completion 流程保存本 Revision 最终有效全文；它是生成交付物，不是第二份 MCL 规范。

本 Revision 的授权来源是当前用户批准的《MCL v1 修订、合并与合并后验证计划》。另一 Codex 任务 `codex://threads/019fe7a7-f99a-7431-aa29-ca775f3a1c61` 只作为“前身计划应并入 MF-1”的决策来源；该任务中的 Viewer/Editor 文档工作不属于 MF-1。

## 3. 范围

### 3.1 包含

1. 归档用户提供的 1,575 行 MCL 前身计划，保留字节和 SHA-256。
2. 建立兼容入口和章节处置记录，把规范、Change 实施、历史对话和参考调研分开。
3. 修复多 Task Completion 模型，保证历史 Task Record 不因后续问题或 Plan 修订而被改写。
4. 以向后兼容方式增加 Completion Manifest 1.1 的每 Task request/Plan 摘要和 `sourceMaterials`。
5. 明确单一真源、MCL 自身变更管理、两稳定版本复盘和候选合并语义。
6. 移除 PR #3 中与 MCL 无关或越界的带版本号快照依赖变更及 Dependabot 更新目标。
7. 完成 PR #3 的本地验证、托管 Gate、Preview、squash merge、合并后 `main` 验证和可证明的 Ruleset 应用。

### 3.2 不包含

- Editor 源码迁移或恢复完整上游 `supersplat-v2.28.0`。
- Viewer/Editor 文档体系建设。
- PR #4–#8 的 Adopt、Defer、Skip、关闭或合并。
- Design、Swiftgram 或任何产品功能变更。
- 生产部署、Stable Release、MCL 1.0 全量生效或 MF-1 关闭。
- 强制安装或调用 Superpowers、其 `subagent-driven-development` 指令或其他外部 Skill/Plugin。任何此类指令均只在明确授权的 Task 内属于 `task-local`。

## 4. 保护现场和不可变约束

1. 实施只在 `/Volumes/Prism/Metaflow-mcl-v1` 的 `codex/mcl-v1` 分支进行。
2. 执行前为该分支和 `/Volumes/Prism/Metaflow` 当前本地 `main` 建立可恢复 Git ref，记录 ref 名和对应 SHA。
3. 禁止 pull、rebase、reset、checkout 或 merge 主工作区的本地 `main`；其领先 `origin/main` 的 9 个提交必须保持可恢复。
4. 禁止移动、删除或提交主工作区的未跟踪 Swiftgram 目录。
5. 前身计划归档后，主工作区中的未跟踪原件仍作为本地恢复副本，不得移动或删除。
6. `completion/task-records/MF-1-T01.md` 必须保持字节级不变，其 SHA-256 必须始终为 `616c6d3390b6663882d54551be4e6c74f906e177601c9af72311fa873e33101d`。
7. 外部写入必须在执行后通过 GitHub、Netlify 或相应 API 重读；不得仅以命令成功返回作为证据。

## 5. MF-1-T02–T05：Revision 3 与合并准备

为满足“每个独立提示且具有终止回复的 Agent 都有自己的 Record”，合并准备按以下 Task 分工；结束边界仍是“PR #3 已具备合并条件”，不包含合并操作。

| Task | 实现者 | 授权范围 |
| --- | --- | --- |
| `MF-1-T02` | Codex subagent | Completion 多 Task 不可变模型、Manifest 1.1、Schema 和回归测试 |
| `MF-1-T03` | Codex subagent | 权威规范、Revision 3 Plan、前身计划归档、章节处置和候选语义 |
| `MF-1-T04` | Codex subagent | Dependabot/versioned snapshot 边界、平台校验及精确恢复两个 package 文件 |
| `MF-1-T05` | primary Codex agent | 集成、完整用户请求、全量验证、双重作者自审、Completion 生成、PR 更新和 Ready Gate |

T02–T04 只能修改各自获准的文件；T05 负责审查、整合和记录它们的来源 Task ID、实际结果及任何偏差。共享构建目录和外部状态操作保持串行。

### 5.1 归档前身计划

1. 从 `/Volumes/Prism/Metaflow/docs/metaflow-change-lifecycle-v1.0-complete-plan.md` 逐字节复制到 `completion/source-materials/metaflow-change-lifecycle-v1.0-complete-plan.md`。
2. 复制前后分别验证 1,575 行且 SHA-256 均等于 `37f45424cc233af72801e1d91053d4581d1bbcdfb73627612d6f28f018af85a3`。
3. 将原路径 `docs/metaflow-change-lifecycle-v1.0-complete-plan.md` 变为兼容入口，只链接非规范原文归档、权威规范、本 Plan 和 Completion Dossier。
4. 建立章节处置表，按 `archived / absorbed / superseded / evidence-only / change-plan` 标注前身计划的每个顶层章节去向。
5. 把完整用户问题、Agent 行动、历史回复、案例和调研保留在原文归档和 Evidence/Completion，禁止将这些叙述复制进权威规范。

### 5.2 修复多 Task Completion 契约

1. 先增加失败回归用例：在不改动 T01 的前提下添加 T02 和 Revision 3，旧 Task 的 request/Plan hash 不应被新内容替换。
2. 调整 Task Record 和生成器，使每个 Task 封存自己的完整问题、message count、request SHA-256、Plan 全文、Plan revision 和 Plan SHA-256。
3. 将 Change 层 transcript、summary、approved Plan、Dossier 和 Manifest 改为可从不可变 Task Record 及当前 Change 源确定性生成的聚合产物。
4. 在 `completion/plan-revisions.json` 增加 Plan revision/amendment 索引，记录每个 revision 的 hash、适用 Task、修改理由和批准来源。
5. 将 Manifest 生成版本升级为 `1.1`，保持读取 `1.0`；为每个 Task 输出 request/Plan 摘要，并为前身计划输出 `sourceMaterials` 条目。
6. 通过 `completion/source-materials.json` 显式登记源材料，校验路径边界、存在性、唯一性、SHA-256、secret/redaction 及 Dossier checksum；`nonNormative` 材料不得被当作规范或采用证据。
7. 运行新增的正负用例，确认 T01 不变、新 Task 不污染旧 Task，且 Change 聚合可幂等重建。

### 5.3 分离规范、Plan 和生效语义

1. 从权威规范删除 MF-1 特有的阶段日程、本地分支事实和历史调研，只保留通用规则、接口、Gate、例外、控制和验收。
2. 将 MF-1 的实际实施顺序、分支保护、验证、合并、回滚和未完成 Gate 只保留在本 Plan。
3. 将候选期强制范围限定为 MF-1 和明确指定的试点 Change；未完成 activation Gate 时禁止声明 MCL 1.0 已是全库 `repository-policy`。
4. 规定 MCL 自身修订必须走 Change，重复事实必须有唯一真源和一致性检查，每两个稳定版本必须执行指标化复盘。
5. 保持 Metaflow ASDD 工具中立；不将 Superpowers、单次 PR Plan、外部目录或子 Agent 拓扑表述为仓库原生能力。

### 5.4 移除 PR #3 非 MCL 内容

1. 将 `supersplat-v2.28.0/package.json` 和 `package-lock.json` 恢复为 PR 基线版本，确保 PR #3 不携带该快照的依赖升级。
2. 不恢复整个上游源码，不移动 Editor 源码。
3. 从 `.github/dependabot.yml` 删除所有带版本号目录的 npm 更新目标，只保留真正活动的可维护路径和 GitHub Actions。
4. 增加治理负向测试：Dependabot 目标匹配 `supersplat-v*` 或 `supersplat-viewer-v*` 时失败。
5. 明确组件路径所有权只负责 CI 路由，不自动授予修改或依赖升级权限。
6. 在 Evidence 中保留 PR #4–#8 和 Issue #9 已发生的事实，但不在 MF-1 中作出 Adopt/Defer/Skip 或关闭处置。
7. 保留 MCL 浏览器验证确实依赖的 Playwright 内容；其他活动 Viewer 安全补丁只有在 Evidence 明确用途并完成全量验证时才能保留。

### 5.5 T02–T05 Completion 和 PR 准备

1. 保存本 Task 从开始到终止的全部用户消息原文，不以摘要或仅 MCL 节选代替。
2. 生成 Revision 3 的 transcript、summary、approved Plan、Manifest 和 Dossier；所有 checksum 从实际文件计算。
3. 执行两个分开的作者自审 pass：Spec Compliance 审查范围、漏项和越界；Code Quality 审查正确性、可维护性、安全、测试和幂等性。禁止称为独立 Review。
4. 更新 PR #3 正文，记录 Revision 3、前身计划归档、当前验证、作者自审、候选语义、未完成 activation Gate 和不在范围的后续工作。
5. 从 PR 标题移除 `[skip netlify]`，推送当前 Head，使新的 GitHub 检查和 Netlify Preview 针对精确的新 Head 执行。
6. T02–T04 各自终止时生成独立 Record；T05 只有在整合它们并完成全量验证后才能终止。
7. 所有合并前 Gate 成功后将 PR 从 Draft 改为 Ready，重读 PR 状态，然后将 T05 记录为 `complete`。
8. 任一 Gate 失败或仍无证据时，保持 PR 未合并，将受影响 Task 记录为 `partial` 或 `blocked`，明确失败命令、剩余范围和接续条件。

## 6. 合并前验证

### 6.1 本地命令

在干净的 MCL worktree 中至少执行：

```bash
node --test scripts/tests/*.test.mjs
python3 -m unittest discover -s scripts/tests -p 'test_*.py'
node scripts/mcl.mjs generate docs/changes/1-adopt-mcl-v1
node scripts/mcl.mjs check-all --strict
python3 scripts/validate_platform.py
node scripts/check_markdown_links.mjs
git diff --check
```

还必须执行并记录：

- Viewer：`npm ci`、`npm test`、`npm run type:check`、`npm run build`、开发/生产构建双模式 Playwright；
- Editor：`npm ci`、`npm run lint`、`npm run build`；
- Completion：Manifest 1.0 兼容、1.1 正负用例、多 Task、旧 revision 不可变、source-material checksum、secret/redaction 和幂等生成；
- 治理：带版本号 snapshot 不得是 Dependabot npm 目标；规范、Plan、模板和生成文件不得形成冲突真源；
- 不可变：T01 SHA-256、前身原文行数和 SHA-256、本地 `main` ref 及 Swiftgram 目录状态均与实施前一致。

### 6.2 托管 Gate 和 Preview

- PR #3 的当前 Head 必须通过所有组件作业、两类 CodeQL、dependency review 和稳定名称 `required / gate`。历史 Head 的绿色结果不得代替。
- `netlify.toml` 变更要求当前 Head 的 Deploy Preview 成功，并通过 `/`、`/editor/` 和版本数据端点的 HTTP smoke。
- GitHub 和 Netlify 结果必须通过 API 重读，记录 run/deploy ID、Head SHA、状态、URL 和查询时间。
- 任一 required check、Preview、checksum、secret 扫描或确定性生成失败时，合并 Gate 失败。

## 7. MF-1-T06：合并与合并后证据

T06 必须在 T02–T05 全部终止后串行启动，使用独立 Task ID、完整用户问题、Plan Snapshot 和终止回复。

1. 重读 PR #3 的 Head SHA、Draft/Ready 状态、mergeability、审批、未解决对话和当前 Head 的所有检查。
2. 仅在第 6 节及第 9 节的所有合并 Gate 成功时执行 squash merge。
3. 合并后立即重读 PR，记录 `merged_at`、实际 merge commit、原 Head 和 `origin/main`。
4. 从精确的远端 `main` SHA 创建新的 detached 或临时 worktree，运行必需的 MCL、平台、链接和基线检查；禁止更新主工作区领先 9 个提交的本地 `main`。
5. 等待该 merge commit 的首个 `main` 工作流，重读并验证稳定名称 `required / gate` 成功。
6. 只有当主分支上该检查名真实存在且成功后，才按 `.github/rulesets/main.json` 应用 Ruleset；应用后必须通过 GitHub API 重读详细规则和 active 状态。
7. Ruleset 应用或重读失败时，记录为未强制的剩余 Gate；禁止使用 `enforced-control` 声明。PR 已合并的事实不因此被改写。
8. 把 merge commit、`main` run、Ruleset 状态、合并后验证和剩余 activation Gate 写入 Issue #1。Issue 写入后立即重读评论或本体。
9. 在 `codex/mf-1-post-merge-evidence` 分支上保存 T06 Record、Evidence 及后续 Completion，通过独立后续 PR 合入；禁止通过改写 T01–T05 补写事后事实。
10. T06 以实际结果记录 `complete / partial / blocked / failed`；仅 PR 已合并不允许将 MF-1 改为 `closed`。

## 8. 回滚和故障处置

- 合并前发现规范越界、多 Task 数据污染、快照变更、未登记的源材料或无法重建 Dossier 时，停止合并，在当前分支修正或返回 Spec。
- 合并前 CI/Preview 失败时保持 PR 开放且未合并，不通过 Review 文字豁免自动 Gate。
- 合并后若候选 MCL 导致 `main` 阻断，优先创建 revert PR 恢复 merge commit，保留原 PR、T01/T02/T03 和 Evidence；不 reset 或 force-push `main`。
- Ruleset 配置错误导致无法正常修复时，使用仓库管理员可审计的 Ruleset 更新或暂时禁用，随后重读并记录详细差异；不得静默放宽控制。
- 任何回滚都必须新增 Task Record 和 Version/Ledger 或 Issue 事实，不得删除原合并证据。

## 9. PR #3 合并 Gate

PR #3 只有在以下条件全部成立时才能合并：

- 前身计划已原文归档，行数和 SHA-256 精确；
- T01 字节未变，历史 request/Plan 没有被 Revision 3 回灌；
- 多 Task Completion、Manifest 1.0 兼容和 1.1 `sourceMaterials` 的正负用例通过；
- 权威规范和 MF-1 Plan 职责分离，候选、生效和强制声明无歧义；
- `supersplat-v2.28.0/package.json` 和 `package-lock.json` 不再出现在 PR diff；
- Dependabot 不再指向任何带版本号的源码或快照目录；
- PR 正文、Task Record、Evidence 和 Dossier 不包含虚假生效、独立 Review、Preview 成功或 enforced 声明；
- 当前 Head 的本地命令、GitHub Gate、两类 CodeQL、dependency review 和 Netlify Preview/smoke 全部通过；
- PR 为 Ready、mergeable，无未解决审查对话，且所有证据指向精确当前 Head；
- 本地 `main` 的 9 个提交、未跟踪前身计划原件和 Swiftgram 目录保持不变。

## 10. 延后的生效 Gate

PR #3 合并后，MF-1 保持 `status: verifying` 和 `completion_state: pending`。以下工作不在 T02/T03 中执行，但必须在将 MCL 改为 `effective` 或将 MF-1 改为 `closed` 前有完整证据：

- MCL 规范第 5.2 节列出的快路径、Design/Promotion、Upstream Sync、多 Task T2、长文交付、接续和回滚试点；
- Preview/Beta/Stable、不可变制品、production smoke、观察和关闭演练；
- Ruleset 的实际阻断验证，以及人类负责人的最终 activation/closure 决定；
- 填写非空 `effective_date`、最终 Dossier、Ledger/Version 链接和可审计关闭回复。

## 11. Plan 修订记录

### Revision 1 — 2026-08-09

- 作为 MF-1 初始采纳和实施计划。
- 后续修订不得改写使用 Revision 1 的历史 Task Record。

### Revision 2 — 2026-08-10

- 触发：用户纠正了参考案例的方法归因和采用范围。
- 变更：增加 `reference / task-local / repository-policy / enforced-control`，明确 Metaflow ASDD 是工具中立的内部名称，并区分作者自审和独立 Review。

### Revision 3 — 2026-08-10

- 触发：用户明确要求合并 MCL v1，但不把 Editor 迁移、快照恢复或 PR #4–#8 处置混入同一 Change。
- 批准：当前用户直接批准本 Revision 的完整计划与实际合并授权。
- 变更：归档前身计划，修复多 Task Completion 不可变性，升级 Manifest 1.1，分离规范与 Change Plan，移除 PR 非 MCL 内容，明确候选合并、合并准备/合并 Task 边界、Ruleset 顺序、停止和回滚条件。
- 执行拓扑澄清：实际实现使用三个文件范围互斥的 Codex subagent；为遵守独立 Agent 必须独立归档的规则，合并准备记录为 T02–T05，合并任务顺延为 T06。该澄清不改变用户批准的范围、Gate 或外部写入授权。
- 工具边界：Superpowers 和其他外部工作流继续保持 `task-local` 和非必需；使用 Codex subagent 是本 Revision 的实际执行拓扑，不构成仓库采用某个外部框架。
- 终态限制：本 Revision 替代之前的“只本地提交、不 push/merge”默认；它授权满足 Gate 后合并 PR #3，但不授权把 MCL 1.0 标记为 effective 或关闭 MF-1。
