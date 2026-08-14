---
title: Metaflow Change Lifecycle v1.0
status: candidate
revision: 6
owner: Shuang-su
effective_date: null
change_id: MF-1
last_change_id: MF-28
---

# Metaflow Change Lifecycle v1.0

> 本文是 MCL v1.0 candidate 的唯一规范性来源。Revision 6 由 [MF-28](https://github.com/Shuang-su/Metaflow/issues/28) 修订；Revision 5 的正文保留在 Git 历史和 [MF-18](changes/18-mcl-lightweight/spec.md)。候选状态不代表全仓已生效。

## 1. 适用范围与权威顺序

MCL 在 `status: candidate` 期间只约束 MF-1 及 Proposal、Spec 或 Plan 明确声明的试点。激活 Change 必须设置非空 `effective_date` 并声明生效范围。

执行时遵循：

1. system、developer 与当前用户指令；
2. `AGENTS.md` 和本规范；
3. 已接受的 Issue、Proposal、Spec 与 Plan；
4. 可选工具、Skill、Plugin 和外部案例。

外部案例、共享对话、一次性 Plan、目录名或单个 PR 只能是参考或任务局部约束。只有合入且生效的规范可以称为 repository policy；只有已实际应用并重新读取的 CI、Ruleset、Schema 或权限可以称为 enforced control。

## 2. 默认流程与核心原则

默认流程是：

```text
Request / Observation
→ 判断是否需要 Issue、Spec、Plan 或 PR
→ 实施
→ 风险相称的本地验证
→ Direct Commit 或 PR
→ 产品发布时更新 Version History 与 Ledger
→ 记录实际结果
→ Done / Observing
```

1. 每个 Change 只有一个主要目标；无关改动拆分。
2. 先根据变更性质选择工件，不为流程完整而制造 Issue、Spec、Plan、测试阶段或 PR。
3. Issue 说明为什么做、做什么和怎样判断完成；一旦创建就必须自描述。
4. Proposal 决定是否做；Spec 决定交付什么；Plan 决定怎样执行。每类规范工件最多一个权威副本。
5. Commit 记录原子增量；PR 存在时汇总实际实现、验证、风险和交付。
6. 新的高影响决策必须返回 Issue、Proposal 或 Spec，不得在实现中隐式扩大范围。
7. 验证以实际运行的本地或远端结果为准；AI 自述不能替代测试，GitHub Actions 也不是所有 Change 的默认前置条件。
8. 不覆盖无关用户工作，不重写已发布 Version History/Ledger，不直接覆盖上游快照。
9. 凭据、系统/开发者提示和隐藏推理不得进入任何工件。
10. 完整交流由 Codex 任务链接承担，仓库不默认复制全文。

## 3. 工件职责与 Completion Contract

| 工件 | 唯一职责 | 默认边界 |
| --- | --- | --- |
| Issue | 背景、目标、范围、验收、风险、状态和交付链接 | 简单任务可不创建；创建后必须自描述 |
| Commit | 一个原子增量的 what/why | 标题简洁；不复制 Issue、Plan 或对话全文 |
| PR | 实际变更、验收映射、验证、未运行项、风险、回退和后续 | 只在需要审查、协作或受保护集成时创建 |
| Proposal / RFC | 是否采用一个方向 | 只用于仍需决策的方案与取舍 |
| Spec | 可观察行为、接口、数据、兼容和验收契约 | 只在契约需要长期保存时创建 |
| Plan | 实施顺序、文件/子系统、命令、依赖、回退和停止条件 | Codex Plan 足够时不再复制仓库副本 |
| ADR | 需要长期保留的架构决定 | 不保存临时实现流水账 |
| Evidence | 实际环境、Commit、命令、结果和限制 | 可直接位于 PR/Issue；独立文件不是默认要求 |
| Ledger | 产品提交的行为、风险和证据历史 | 不是通用 Completion Contract |
| Version History | 机器可读的产品发布事实 | 不是任务过程档案 |
| Codex 任务链接 | 完整交流与过程上下文 | 不成为仓库规范性真源 |

### 3.1 Issue Body Contract

任何已经创建的 Change Issue 都必须按顺序包含：

1. `当前状态`
2. `背景`
3. `目标`
4. `包含范围`
5. `排除范围`
6. `验收标准`
7. `风险、依赖与回退`
8. `Spec / Plan 与相关任务`
9. `完成交付`

读者只看 Issue 就必须能判断任务是否合理、边界是否清楚、当前处于什么状态和是否完成。API、文件步骤与测试命令放在链接的唯一 Spec/Plan；简单任务不适用独立 Spec/Plan 时说明原因即可。完成后回填 PR/Commit、实际验证、未运行项和遗留事项。

Issue 更新不得删除仍有效的事实。需求改变时说明差异，并保留可追溯的历史评论或链接。

### 3.2 PR Contract

PR 存在时就是该 Change 的 Completion Contract，至少包含：

- Change ID 和 Issue 关闭关系（若有）、风险和组件；
- 实际结果、包含/排除范围及验收映射；
- 唯一 Proposal/Spec/Plan/ADR/Codex 任务链接；
- 实际执行的本地或远端检查、结果和证据；
- 未运行检查及原因；
- 风险、回退、偏差、已知限制和后续工作；
- AI/工具参与范围与审查关系。

PR 合并后，有 Issue 时 Issue 是最终状态入口；PR 是不可变的集成交付记录。

### 3.3 Commit Contract

Commit 使用项目惯例的简洁 `type(scope): summary`。无 Issue/PR 的直接提交可以在 body 中附简短 `Validation:`、`Release:`、`Refs:` trailer，但不得塞入完整用户请求、Plan、行动摘要或对话。

无 PR 但有 Issue 时，Completion Contract 回填到 Issue；Issue、PR 都没有时，由 commit trailer 和最终 Codex 回复共同说明实际结果。

## 4. 按变更性质选择工件

| 变化 | 最小流程 |
| --- | --- |
| 纯文档、治理、研究、无行为机械维护 | Request → 实施 → 本地检查 → Direct Commit；Issue/PR 可选 |
| 小型兼容修复、已有契约下的常规资源发布 | Request 或轻量 Issue → 实施 → 定向本地验证 → Direct Commit 或 PR |
| 需要协作跟踪、范围讨论或验收确认 | 自描述 Issue → 实施 → PR 或 Direct Commit → 回填结果 |
| 新产品行为、公共数据契约、跨组件实现 | Issue + 唯一 Spec + 唯一 Plan + PR |
| 架构、安全、破坏性迁移、重大上游同步或正式生产变更 | 上一档工件，并按需要增加 Proposal/ADR、迁移、回滚和观察方案 |

T0–T3 可以继续作为风险标签，但不驱动一条固定长流程。风险从用户影响、不可逆性、公共接口、数据、权限、安全、跨组件与发布影响共同判断。文件数量和体积影响存储、审查与验证方式，不单独决定风险等级。

Spec、仓库 Plan 和 TDD 是条件工件：跨会话、步骤多、依赖/回退复杂或正式交接时才需要仓库 Plan；RED/GREEN/REFACTOR 只用于适合测试先行的行为代码，不强制用于 Markdown、资源、配置或机械维护。

## 5. 状态、开始条件与完成条件

通用状态：

```text
Open → In Progress → In Review → Done
```

不需要审查的任务可从 `In Progress` 直接进入 `Done`。`Proposed` 只用于未决定是否采用的 Proposal。生产发布可以追加：

```text
In Review → Released → Observing → Done
```

旁路状态只在真实发生时使用：`Blocked`、`Parked`、`Rejected`、`Rolled Back`。

- **开始条件**：目标、包含/排除范围、验收和风险足以实施。
- **完成条件**：授权范围已实现，适用验证、未运行项、风险与回退已记录；产品发布还必须更新 Ledger、Version History 并完成必要观察。

`Ready` 是开始条件是否满足的判断，不是通用状态。Revision 5 的四个命名 Gate 继续作为历史设计可读，但不再是 Revision 6 的强制流程对象。

## 6. Change ID、分支与文件位置

- 有 Issue：使用 `MF-<issue-number>`。
- 无 Issue 的直接任务：需要标识时使用 `MF-T0-<YYYYMMDD>-<slug>`，否则可只使用 Commit。
- Agent 分支：`codex/mf-<issue>-<slug>`。
- 公共契约、跨组件和高风险任务默认使用隔离 branch/worktree；简单任务不强制。

Spec/Plan 可以位于 `docs/specs/`、`docs/plans/` 或 Change 专属目录，但只能有一个规范副本。Issue/PR/Codex Plan 足够时不强制创建目录。

## 7. 资源上传与发布分级

资源规模与契约风险分开判断：

| 路线 | 判断条件 | 流程与验证 |
| --- | --- | --- |
| 常规资源 | 使用既有格式、schema、生成器、缓存和现有 route；不涉及 LFS、许可证、运行时代码或部署配置 | 可 Direct Commit；生成/审查 index，验证资源引用与必要 route；公开发布时更新 PATCH、Ledger、Version History |
| 大型或新增入口 | 新 route/alias、超过 20 个文件、新增超过 100 MiB、使用 LFS 或大量 tiled/LOD 文件，但数据契约不变 | 轻量 Issue 或 PR checklist + PR；审查存储、路径、index 和缓存；不默认要求完整 Spec、产品 build 或 E2E |
| 结构性资源变更 | 修改 schema、生成器语义、Loader、Viewer 行为、缓存/部署、格式兼容、授权来源或公共 URL 契约 | Issue + Spec + Plan + PR；只运行实际行为命中的检查 |

仅 staging 且未进入公开 index/route 的数据不提升产品版本。同一路径覆盖 immutable 大文件必须显式评估缓存，优先采用新文件名或内容地址。

公开 route、thumbnail、settings 或资源内容变化属于产品内容发布，即使 Direct Commit 也必须更新 PATCH、Ledger 和 Version History。既有 schema 下新增普通 route/alias 默认属于兼容 PATCH；引入新 Viewer 能力或数据契约才提升 MINOR。

常规直接发布使用两个本地原子提交并一次 push：产品/资源提交在前，`chore(release)` 记录提交引用其真实 SHA。Squash PR 在合并后以极小 release-record commit 回填最终 SHA；回填完成前不标记稳定完成。

## 8. 本地验证、Review 与按需 CI

- 验证命令由当前 Plan、变更路径和风险共同决定；只记录实际运行的结果。
- `scripts/ci-routing.mjs` 与 `metadata/ci-routing.json` 是本地检查选择器和未知路径检测器，不等于托管必需 Gate。
- 普通 GitHub CI 只按需手动运行；它可以提供附加证据，但不是通用完成条件。
- 未运行项必须在 PR、Issue 或直接提交交付中说明原因；跳过不是成功证据。
- Spec compliance 与 code/document quality 分开自查；实现者的两次检查仍是 self-review，只有不同非实现作者可以声明 independent review。
- Preview、Beta、生产 smoke 和观察只在对应风险或正式发布范围内成为完成条件。

main 的托管保护至少禁止 branch deletion 和 non-fast-forward。协作者继续按风险使用 PR；仓库所有者可以对常规文档、维护和小型资源使用 direct push。任何 Ruleset 或权限只有写入后重新读取一致才能称为已实施。

## 9. Ledger、Version History、发布与回滚

Viewer Ledger 记录产品提交的动机、原行为、实现、用户结果、风险、兼容、证据和后续；Version History 是版本、类型、组件、日期、实现 Commit、route/resource changes、package、index schema 与上游基线的机器事实源。两者互相追溯但不复制全文。

截至 `c613a87` 的历史 entries、`maintenanceCommits` 和 Ledger 不重写。从该边界之后，只要求 Viewer、data 和 Viewer 发布支撑提交进入 Viewer 审计；MCL、普通文档、Design、Reference、Editor 和无关平台提交不进入 Viewer 总账。`documentedThrough` 表示 Viewer 审计边界，而不是全仓提交覆盖率。

Viewer 版本从下一次真实发布起使用标准 SemVer：

- 当前生产 Viewer 版本为 `5.19.1`，display 与 package SemVer 一致；运行时产品 SHA 为 `26e311c`，发布控制 SHA 为 `534b013`；
- `5.18a` 及更早字母版本和资源 `addedIn/updatedIn` 原样保留；
- `5.19.0` 的不可变 Tag prepare 在 deployment 前失败；`5.19.1` 已完成生产发布，下一次 PATCH 资源或兼容修复为 `5.19.2`；
- PATCH：资源、thumbnail、settings、兼容 route/alias、Bug、小型兼容行为和部署修复；
- MINOR：新的向后兼容产品、交互、Loader、数据或架构能力；
- MAJOR：不兼容 URL/settings/index 契约或要求消费者迁移的变化；
- 文档、治理、研究、无行为 refactor、测试维护和未公开 staging 不提升产品版本。

保留 `displayVersion` 和 `appSemver` 字段。历史 entry 继续接受 `major.minor` 和 `major.minor[a-z]`；`5.18a` 之后的新 entry 必须是完整 `major.minor.patch`，且两字段相等。Editor 保持独立 Ledger 与 Version History。

正式生产发布按实际风险增加不可变版本标识、构建/发布来源、smoke、回滚目标和观察窗口。回滚追加新记录，不重写已发布事实。研究内容不自动成为产品能力；上游更新作为独立 Change 评估 Adopt/Defer/Skip。

## 10. 显式审计模式与 legacy 兼容

以下工件不再默认生成：Agent Completion Record、Change Completion Dossier、Manifest、request transcript、approved-plan 副本、行动/回复聚合全文。

仅在合规审计、事故、破坏性迁移、正式发布或当前用户明确要求时启用。Issue/Plan 必须说明原因、适用范围、保留字段、敏感信息处理、责任人、校验方式和关闭条件。

`scripts/mcl.mjs` 保留 legacy reader/generator，用于已有 manifest 的历史 Change。MF-1/MF-9 completion、校验和与 source materials 不重写；新 Change 不因没有 manifest 而失败。旧完成模板保留并标记“审计模式”，不代表默认流程。

## 11. MCL 修订、激活与复盘

- 修改 MCL 需要独立 Change ID、自描述 Issue、适用的唯一 Spec/Plan、PR 和风险相称验证。
- Candidate 合并不等于全仓生效；激活必须单独决定 `effective_date` 与范围。
- 当流程成本明显、追溯缺失或连续两个 revision 后进行复盘，关注 lead time、返工、回滚、验证缺口和无决策价值字段；不再把 GitHub CI 通过率当作唯一流程健康指标。
- 最终回复只链接 Issue、PR、关键 Commit、Spec/Plan 和实际验证，不复制完整档案。

## 12. Revision 6 验收

- 默认流程不再强制 GitHub CI、四个命名 Gate、TDD、独立 Evidence 或 Completion Dossier。
- 已创建 Issue 仍可仅凭正文判断合理性、范围、风险、状态与完成度。
- 三档资源路线区分规模与契约风险，常规发布也不会漏掉 Ledger/Version History。
- Ledger 保持行为审计职责，向前只覆盖 Viewer/data/发布支撑提交。
- 历史字母版本保持不变；`5.18.1` 已是首个完整 SemVer 发布，Viewer MINOR `5.19.0` 已合并但其 Tag 在 deployment 前失败，PATCH `5.19.1` 已完成生产发布恢复。
- MF-1/MF-9 legacy 校验继续通过，本 revision 不修改产品运行时 API、资源或部署。
