---
title: Metaflow Change Lifecycle v1.0
status: candidate
revision: 5
owner: Shuang-su
effective_date: null
change_id: MF-1
last_change_id: MF-18
---

# Metaflow Change Lifecycle v1.0

> 本文是 MCL v1.0 candidate 的唯一规范性来源。Revision 5 由 [MF-18](https://github.com/Shuang-su/Metaflow/issues/18) 修订；Revision 4 的完整正文保留在 Git 历史及 `docs/changes/1-adopt-mcl-v1/completion/source-materials/`。候选状态不代表全仓已生效。

## 1. 适用范围与权威顺序

MCL 在 `status: candidate` 期间只约束 MF-1 及 Proposal、Spec 或 Plan 明确声明的试点。激活 Change 必须设置非空 `effective_date` 并声明生效范围。

执行时遵循：

1. system、developer 与当前用户指令；
2. `AGENTS.md` 和本规范；
3. 已接受的 Issue、Proposal、Spec 与 Plan；
4. 可选工具、Skill、Plugin 和外部案例。

外部案例、共享对话、一次性 Plan、目录名或单个 PR 只能是参考或 Task 局部约束。只有合入且生效的规范可以称为 repository policy；只有已应用并重新核验的 CI、Ruleset、Schema 或权限可以称为 enforced control。

## 2. 核心原则

1. 每个 Change 只有一个主要目标；无关改动拆分。
2. Issue 说明为什么做、做什么和怎样判断完成。
3. Proposal 决定是否做；Spec 决定交付什么；Plan 决定怎样执行。
4. Spec 与 Plan 各只有一个规范副本；其他位置只链接，不复制全文。
5. Commit 记录原子增量；PR 汇总实际实现、审查、验证和交付。
6. 新的高影响决策必须返回 Issue、Proposal 或 Spec，不得在实现中隐式扩大范围。
7. 自动证据优先于 Agent 自述；AI review 不能替代测试。
8. 不覆盖无关用户工作，不重写已发布 Version History，不直接覆盖上游快照。
9. 凭据、系统/开发者提示和隐藏推理不得进入任何工件。
10. 完整对话保留在 Codex 任务链接，默认不复制到仓库。

## 3. 工件职责

| 工件 | 回答的问题 | 必需内容 |
| --- | --- | --- |
| Issue | 为什么、做什么、做到哪里、是否完成 | 背景、目标、范围、验收、风险、状态、工件和交付链接 |
| Commit | 这个可审查增量改变了什么、为什么 | 简洁 message；必要时引用 Issue |
| PR | 实际交付了什么、怎样验证、还有什么风险 | Issue 关联、变更、验证、未运行项、偏差、回退、后续 |
| Proposal / RFC | 这个方向是否值得采用 | 选项、取舍、推荐与决定 |
| Spec | 可观察行为和技术契约是什么 | 接口、数据、兼容、失败模式、验收 |
| Plan | 按什么顺序安全实现 | 路径/子系统、步骤、命令、依赖、回退和停止条件 |
| ADR | 哪个长期架构决定需要保留 | 背景、选项、决定与后果 |
| Evidence | 验收是否真的满足 | 环境、Commit、命令、结果和限制 |
| Codex 任务链接 | 完整交流过程在哪里 | 可访问的 `codex://threads/...` 引用 |

禁止把同一 Plan、完整用户请求或行动摘要人工维护在多个位置。Issue/PR 可以摘要并链接 Spec/Plan，不能成为第二份技术规范。

### 3.1 Issue Body Contract

T1–T3 Issue 必须按顺序包含：

1. `当前状态`
2. `背景`
3. `目标`
4. `包含范围`
5. `排除范围`
6. `验收标准`
7. `风险、依赖与回退`
8. `Spec / Plan 与相关任务`
9. `完成交付`

读者只看 Issue 就必须能判断任务是否合理、边界是否清楚、当前处于什么状态和是否达到验收。API、文件级步骤与测试命令放在链接的 Spec/Plan。完成后回填 PR、squash commit、实际验证、未运行项和遗留事项。

Issue 更新不得删除仍有效的原始事实。需求改变时在当前状态和范围中说明差异，并保留可追溯的历史评论或链接。

### 3.2 PR Contract

PR 必须包含：

- Change ID、Issue 关闭关系、风险和组件；
- 实际变更及用户/开发者影响；
- 包含范围、排除范围和 Issue 验收映射；
- Proposal/Spec/Plan/ADR 链接；
- 实际执行的检查、结果和证据链接；
- 未运行检查及原因；
- 风险、回退、偏差、已知限制和后续工作；
- AI/工具参与范围与审查关系。

PR 合并后，Issue 是最终状态入口；PR 是不可变的集成交付记录。

### 3.3 Commit Contract

一个 Commit 应对应一个可解释、可审查的增量。Message 使用项目惯例的简洁 `type(scope): summary`，不得塞入 Issue、Plan 或完整对话。需要更多背景时引用 Issue/PR。

## 4. 风险分级与默认工件

| 等级 | 适用范围 | 默认必需工件 |
| --- | --- | --- |
| T0 | 文档、研究、无行为变化的机械维护 | Commit/PR；Issue 可选 |
| T1 | 局部 Bug、小型兼容改进 | 自描述 Issue、轻量 Plan（可在 Issue/PR）、PR、回归证据 |
| T2 | 产品行为、UI、数据能力、跨组件实现 | Issue、唯一 Spec、唯一 Plan、PR、验收 Evidence |
| T3 | 架构、公共契约、安全、破坏性迁移、重大上游同步 | T2 工件、Proposal/RFC、必要 ADR、发布/迁移/回滚/观察方案 |

风险从用户影响、不可逆性、公共接口、数据、权限、安全、跨组件与发布影响共同判断。单纯文件数量不能降低或提高等级。

## 5. 生命周期与 Gate

核心状态：

```text
Proposed → Ready → In Progress → In Review → Done
```

部署类 Change：

```text
Proposed → Ready → In Progress → In Review → Released → Observing → Done
```

旁路终态：`Parked`、`Rejected`、`Rolled Back`。

| Gate | 进入条件 |
| --- | --- |
| Decision Gate | 背景、目标、范围、非目标、价值和风险足以决定继续、停放或拒绝 |
| Ready Gate | 风险等级正确；所需 Spec/Plan/ADR 已决策完备；依赖、验收和回退清楚 |
| Merge/Release Gate | 实现符合 Spec；适用检查通过；审查线程解决；未运行项、风险与回退已公开 |
| Close/Observe Gate | Issue 验收已逐项确认；PR/Commit/Evidence 已链接；发布任务完成观察或明确后续 |

`Done` 表示授权范围已实现、验证并在 Issue 中完成交付，不要求额外复制全文档案。

## 6. Change ID、分支与文件位置

- T1–T3：`MF-<issue-number>`。
- 无 Issue T0：`MF-T0-<YYYYMMDD>-<slug>`。
- Agent 分支：`codex/mf-<issue>-<slug>`。
- T2/T3 默认使用隔离 branch/worktree。

Spec/Plan 可以位于 `docs/specs/`、`docs/plans/` 或一个 Change 专属目录，但只能有一个规范副本。若 Issue/PR 足以承载 T0/T1 轻量 Plan，则不强制创建目录。

## 7. 多智能体与交接

多智能体不是要求。使用时在 Issue 或 PR 记录：

| 任务链接 | 负责人 | 授权范围 | 状态 | Commit / PR |
| --- | --- | --- | --- | --- |

默认不创建每个 Agent 的全文 Task Record。只有以下情况可以建立独立记录：

- 独立外部权限或不可逆副作用；
- 合规、事故或安全审计；
- 正式跨会话/跨团队交接且 Issue/PR 无法表达必要状态；
- 当前用户明确要求。

无论是否单独记录，都必须保护用户现场、记录物质性外部写入、重读外部结果，并如实报告失败和未验证项。

## 8. Evidence、Review 与 CI

- Evidence 记录实际发生的结果，不修改验收标准。
- Spec compliance 与 code quality 分开审视；实现者的两次检查仍是 self-review。
- 只有不同的非实现作者可以声明 independent review。
- CI 按变更路径和行为范围运行最小可信检查，并始终产生稳定聚合 Gate。
- 未知、无所有者或无检查路线径必须失败。
- 被路由跳过的检查不是成功证据；PR 必须说明为什么不适用。
- Preview、Beta、生产 smoke 和观察只在对应风险或发布范围内成为硬 Gate。

## 9. 发布、回滚与观察

生产发布至少需要：

- namespaced tag 或不可变版本标识；
- 构建/发布工件与来源 Commit；
- smoke 环境和结果；
- Version History / Ledger 追踪；
- 回滚目标、执行条件和责任人；
- 观察窗口、成功/失败信号与结束决定。

回滚追加新记录，不重写已发布事实。研究内容不自动成为产品能力；上游更新作为独立 Change 评估 Adopt/Defer/Skip。

## 10. 显式审计模式与 legacy 兼容

以下工件不再默认生成：Agent Completion Record、Change Completion Dossier、Manifest、request transcript、approved-plan 副本、行动/回复聚合全文。

仅在合规审计、事故、破坏性迁移、正式发布或当前用户明确要求时启用。Issue/Plan 必须说明：

- 启用原因和适用范围；
- 需要保存的字段与敏感信息处理；
- 责任人、校验方式和关闭条件。

`scripts/mcl.mjs` 保留 legacy reader/generator，用于已经存在 manifest 的历史 Change。MF-1 completion 目录、校验和和 source materials 不重写；新 Change 不因没有 manifest 而失败。旧完成模板保留并标记“审计模式”，不代表默认流程。

## 11. MCL 修订、激活与复盘

- 修改 MCL 需要独立 Change ID、自描述 Issue、适用 Spec/Plan、PR 和验证。
- Candidate 合并不等于全仓生效；激活必须单独决定 `effective_date` 与范围。
- 每两个稳定 revision 或出现明显流程成本时进行复盘，关注 lead time、首次 CI 通过率、返工、回滚、追溯缺失和无决策价值字段。
- 最终回复应简洁链接 Issue、PR、关键 Commit、Spec/Plan 和 Evidence，不复制完整档案。

## 12. Revision 5 验收

- Issue 正文足以判断任务合理性、范围、状态与完成度。
- Issue/Commit/PR/Spec/Plan/Codex 任务链接职责无重叠。
- T0–T3 工件按风险递增，审计档案按需启用。
- MF-1 legacy 校验继续通过且历史内容可读取。
- 本 revision 不修改 Viewer、Editor、Design 或数据运行时 API。
