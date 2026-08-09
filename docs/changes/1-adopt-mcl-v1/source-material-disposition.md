---
change_id: MF-1
title: Predecessor plan section disposition
status: verifying
component:
  - platform
risk: T3
type: governance
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/1
plan_revision: 3
completion_state: pending
supersedes: null
terminal_reason: null
---

# MCL 前身计划章节处置记录

## 处置标记

| 标记 | 含义 |
| --- | --- |
| `archived` | 仅在逐字节原文归档中保留，不作为当前规范 |
| `absorbed` | 可复用的操作性规则已转换为工具中立、可验证的权威规范 |
| `superseded` | 已被 Revision 2/3 的更精确契约取代，不得继续执行旧表述 |
| `evidence-only` | 属于用户问题、Agent 行动/回复、仓库快照、外部案例或调研，只能进入 Evidence/Completion |
| `change-plan` | 属于 MF-1 的实施顺序、验证、停止、回滚或成功条件，只进入 `plan.md` |

## 顶层章节去向

下表 21 个章节的基础处置均为 `archived`；“处置”列另外记录其在当前规范、Evidence 或 Change Plan 中的语义去向。

| 前身计划章节 | 处置 | 当前去向和限制 |
| --- | --- | --- |
| 1. 给 Codex 或其他执行工具的完整任务上下文 | `evidence-only` | 原文保存在非规范归档；当前 Task 的完整用户问题由 Task Record 和 Completion 管理 |
| 2. Agent 已执行的行动与回复摘要 | `evidence-only` | 仅作为历史 Evidence；不用于证明当前仓库状态或控制已生效 |
| 3. 最终方法定义与正式命名 | `absorbed`, `superseded` | MCL 名称和 Proposal/Spec/Plan 责任已吸收；工具、Skill 或 Agent 拓扑特定的优先级表述已由工具中立契约取代 |
| 4. Metaflow 组件与所有权模型 | `absorbed` | 规范组件契约和 `metadata/components.json`；路径分类不自动授予修改或依赖升级权限 |
| 5. Change 风险分级与流程强度 | `absorbed` | 权威规范的 T0–T3 风险契约 |
| 6. Change Lifecycle 状态机 | `absorbed`, `superseded` | 状态和 Gate 已吸收；Agent Completion 和 Change Closure 的独立 Gate 以当前规范为准 |
| 7. Change 文档与数据契约 | `absorbed`, `superseded` | Proposal/Spec/Plan/Evidence 责任已吸收；Manifest 1.1、每 Task 不可变快照和源材料契约取代旧接口 |
| 8. GitHub 协作模型 | `absorbed` | 通用规则进入规范；MF-1 实际 PR/Ruleset 顺序进入 Change Plan |
| 9. 人与 AI 的责任边界 | `absorbed`, `superseded` | 人类批准、Agent 执行和如实报告进入规范；Review 关注点分离不再被表述为必须多 Agent 或独立 Review |
| 10. CI 与自动化架构 | `absorbed` | 通用 CI、组件、浏览器、性能和安全控制进入规范；候选实装和验证在 MF-1 Plan/Evidence |
| 11. Ledger 与 Version History 升级 | `absorbed` | 权威关系、向后兼容和 trace 规则进入规范 |
| 12. Release Lifecycle | `absorbed` | 标签、制品、发布、观察和回滚控制进入规范 |
| 13. Upstream Sync Lifecycle | `absorbed` | Adopt/Defer/Skip、本地定制分类和禁止自动覆盖进入规范 |
| 14. 开源项目学习矩阵 | `evidence-only` | 仅保留为参考调研，不构成 Metaflow 采用某外部项目、Superpowers 或行业标准的证据 |
| 15. 分阶段实施路线 | `change-plan`, `superseded` | 通用生效 Gate 保留在规范；MF-1 具体 T02–T06、合并、停止和回滚顺序以 Revision 3 Plan 为准 |
| 16. 测试计划与验收场景 | `absorbed`, `change-plan` | 通用必测行为进入规范；MF-1 的精确命令和托管 Gate 进入 Revision 3 Plan |
| 17. Definition of Done | `absorbed` | Agent Task、Change、Stable Release 和 MCL 生效 DoD 进入规范验收 |
| 18. 流程度量与持续改进 | `absorbed`, `superseded` | 每两个稳定版本的指标复盘已进入规范；复盘不得在没有 Change 时直接改规范 |
| 19. 风险与缓解 | `absorbed`, `change-plan` | 通用风险控制进入规范；MF-1 的具体停止和回滚条件进入 Revision 3 Plan |
| 20. 执行 Agent 的操作约束 | `absorbed`, `superseded` | 权限、安全、Completion 和外部写入重读进入规范；特定工具优先级不得从历史 Plan 隐式继承 |
| 21. 本方案的最终成功标准 | `change-plan`, `superseded` | 合并候选与全量生效已分离；本 Change 以 Revision 3 的合并 Gate 和延后 activation Gate 为准 |

## 完整性

- 上表覆盖前身计划的 21 个顶层编号章节；原文的所有子章节随所属顶层章节归档。
- 原文的任何内容都没有因处置而删除；非规范归档持续保留完整字节。
- 本记录解释去向，不修改 Proposal、Spec、Plan 或 MCL 规范的决策权。
