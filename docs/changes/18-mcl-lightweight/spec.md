---
change_id: MF-18
title: MCL 轻量协作契约
status: specified
component:
  - platform
risk: T3
type: governance
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/18
canonical_path: docs/changes/18-mcl-lightweight/spec.md
---

# MCL 轻量协作契约

> **Revision 5 历史契约，已由 MF-28 / Revision 6 取代。** 本文的四个 Gate 和较长状态链只用于理解演进，不定义当前任务。现行 candidate 规范见 [`../../metaflow-change-lifecycle-v1.0.md`](../../metaflow-change-lifecycle-v1.0.md)。

## 背景与决策

MF-1 建立了可验证的治理基础，但把一次任务的原始请求、完整计划、行动摘要和完成材料重复写入 Task Record、聚合 transcript、Dossier 与 Manifest。Revision 5 保留历史校验能力，同时把日常协作重新落到 GitHub 原生对象和唯一技术文档上。

## 工件职责

| 工件 | 唯一职责 | 不应包含 |
| --- | --- | --- |
| Issue | 背景、目标、范围、验收、风险、状态和交付链接 | 文件级步骤和完整命令清单 |
| Commit | 一个可审查增量的简洁 `what/why` | Issue、Plan 或对话全文 |
| PR | 实际变更、验证、偏差、风险、后续工作和关闭关系 | 重复的完整 Spec/Plan |
| Spec | 行为、接口、数据、兼容和验收契约 | 执行流水账 |
| Plan | 决策完备的实施顺序、文件边界和验证命令 | 新产品决策 |
| ADR | 需要长期保留的架构决策 | 临时实现细节 |
| Codex 任务链接 | 完整交流与过程上下文 | 仓库规范性真源 |

## Issue Body Contract

T1–T3 Issue 必须让未打开任何链接的读者判断任务是否合理、当前做到哪里、是否已经完成。正文按顺序包含：

1. `当前状态`
2. `背景`
3. `目标`
4. `包含范围`
5. `排除范围`
6. `验收标准`
7. `风险、依赖与回退`
8. `Spec / Plan 与相关任务`
9. `完成交付`

其中 Spec/Plan 链接提供 API、文件步骤和测试命令；完成交付回填 PR、squash commit、实际验证与遗留事项。更新 Issue 时保留仍然有效的原始事实，不能用新模板覆盖历史背景。

## 生命周期与 Gate

核心状态为：

```text
Proposed → Ready → In Progress → In Review → Done
```

部署类 Change 可以继续进入 `Released → Observing → Done`。旁路终态为 `Parked`、`Rejected` 和 `Rolled Back`。

四类 Gate：

1. **Decision Gate**：背景、目标、范围和价值足以决定是否继续。
2. **Ready Gate**：风险分级、所需 Spec/Plan、依赖和验收已决策完备。
3. **Merge/Release Gate**：实现、审查、必需检查、风险与回退证据满足要求。
4. **Close/Observe Gate**：Issue 验收与交付链接已回填；发布任务结束观察后才能关闭。

## 风险分级

| 等级 | 典型范围 | 默认工件 |
| --- | --- | --- |
| T0 | 文档、研究、机械维护，无运行行为变化 | Commit/PR；Issue 可选 |
| T1 | 局部 Bug、小型兼容改进 | 自描述 Issue、轻量 Plan（可在 Issue/PR）、PR、回归证据 |
| T2 | 产品行为、UI、数据能力、跨组件实现 | Issue、唯一 Spec、唯一 Plan、PR、验证证据 |
| T3 | 架构、公共契约、安全、破坏性迁移、重大上游同步 | T2 工件、Proposal/RFC、必要 ADR、发布/迁移/回滚/观察方案 |

## 多智能体与完整对话

- Issue 或 PR 用表格记录任务链接、负责人、授权范围、状态和关联 Commit/PR。
- 只有独立外部权限、副作用或正式跨会话交接需要单独 Task Record。
- 完整用户消息和 Agent 回复保留在 Codex 任务，不默认复制进仓库。
- 隐藏推理、系统/开发者提示、凭据与令牌始终不得归档。

## 显式审计模式

Task Record、Completion Dossier、Manifest、全文 transcript 仅用于合规审计、事故、破坏性迁移、正式发布或当前用户明确要求。启用时必须在 Issue/Plan 写明原因、保留范围、责任人和关闭条件。旧 `scripts/mcl.mjs` 继续校验已经存在 legacy manifest 的 MF-1 档案，但新 Change 不因缺少 manifest 而失败。

## 兼容与迁移

- `docs/metaflow-change-lifecycle-v1.0.md` 路径和 `candidate` 状态不变。
- MF-1 的 completion 目录、校验和及历史源材料不重写。
- Revision 4 的完整正文可从 Git 历史和 MF-1 source materials 读取。
- 新模板优先使用 Issue/PR/Spec/Plan；旧完成模板保留并标注为审计模式。

## 验收

- Issue 仅凭正文即可判断合理性、范围、状态与完成度。
- 一个 Change 不再出现多份人工维护的相同 Plan 或对话全文。
- PR 必须映射 Issue 验收并列出实际检查与未运行项。
- legacy MF-1 校验继续通过。
- 新合同不修改 Viewer、Editor 或数据运行时接口。
