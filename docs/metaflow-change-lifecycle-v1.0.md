---
title: Metaflow Change Lifecycle v1.0
status: candidate
owner: Shuang-su
effective_date: null
change_id: MF-1
---

# Metaflow Change Lifecycle v1.0 正式规范与实施计划

## 1. 规范总则

### 1.1 规范用语

- “必须”：缺失时不得进入下一状态。
- “禁止”：任何流程等级均不得违反。
- “应当”：默认执行；不执行时必须在 Completion Dossier 中记录理由、风险和批准人。
- “可以”：按 Change 实际需要选择。
- “完成”：授权范围已实现、验证、归档并交付；只完成代码、计划、局部测试或口头说明均不构成完成。

### 1.2 方法与边界

项目级正式方法为 `Metaflow Change Lifecycle（MCL）`。开发阶段使用 `Metaflow Agentic Spec-Driven Development（Metaflow ASDD）`。

```text
MCL
├── Signal / Observation
├── Proposal Governance
├── Change Spec / Technical Design
├── Implementation Plan
├── Agentic Execution
├── Evidence / Review
├── Agent Completion Submission
├── Release / Ledger / Version History
├── Observation
└── Change Closure Submission
```

必须遵守以下原则：

1. Proposal 决定是否做，Spec 决定交付什么，Plan 决定怎样执行；三者不得互相替代。
2. Implementation Plan 必须决策完备，不得把产品、架构或兼容性决定留给实施 Agent。
3. Agent 在实施中遇到新决策时，必须返回 Proposal 或 Spec，不得在 Plan 内隐式扩大范围。
4. 自动证据优先于 Agent 的完成声明。
5. 每个 Change 只能有一个主要目标；无关重构必须拆分。
6. 研究材料可以进入 `design` 域，但不得自动成为产品能力。
7. 上游升级必须作为独立 Change 评估，禁止直接覆盖本地定制。
8. Version History 只追加，不得重写已发布事实。
9. 每次独立 Agent 任务结束时必须执行 Agent Completion Submission。
10. Change 进入终态前必须执行 Change Closure Submission。
11. 没有完整用户问题、Agent 行动与回复摘要、完整有效计划全文的任务不得声明完成。
12. 规范正文只包含规则、接口、状态、Gate、例外、实施和验收；调研过程、案例介绍、方案合并说明和历史回复不得进入正文。

### 1.3 产物职责

| 产物 | 必须回答的问题 | 禁止承担的职责 |
| --- | --- | --- |
| Proposal / RFC | 是否值得做，为什么现在做 | 直接规定文件级实现步骤 |
| Change Spec | 用户、接口、数据和兼容行为是什么 | 未经批准改变产品方向 |
| Technical Design | 系统结构、数据流、失败和迁移如何设计 | 替代用户行为验收 |
| Implementation Plan | 按什么顺序实现、验证和提交 | 新增需求或架构决定 |
| Evidence | 实际是否满足 Spec | 修改验收标准 |
| Agent Completion Record | 单次 Agent 被问了什么、做了什么、如何回复、执行了哪份完整计划 | 暴露隐藏推理或用摘要代替证据 |
| Change Completion Dossier | 整个 Change 的完整任务、计划、执行、发布和关闭记录 | 重写已合并的任务记录 |
| Change Ledger | 实际行为演化、风险和维护约束 | 作为结构化版本真源 |
| Version History | 哪些 Change 在哪个版本交付 | 表示未发布工作 |

### 1.4 风险分级

| 等级 | 适用范围 | 必需产物 |
| --- | --- | --- |
| T0 | 文档、研究资料、无行为变化的维护 | 范围说明；Agent 参与时必须有轻量 Plan、Agent Completion Record 和完成交付 |
| T1 | Bug、小型改进、接口不变的局部行为修复 | Issue 或 PR 记录、复现或 RED 测试、轻量 Plan、Evidence、Completion Dossier |
| T2 | 功能、交互、UI、数据能力、`/design` 产品能力 | Issue、必要时 Proposal、Spec、完整 Plan、Preview、Evidence、全部任务记录、Completion Dossier、Ledger/Version |
| T3 | 架构、公共格式、跨组件策略、安全边界、破坏性迁移、大规模上游同步 | Proposal/RFC、必要的 ADR、Spec、分阶段 Plan、Beta、迁移、回滚、监控、全部任务记录和完整关闭档案 |

T0/T1 可以走快路径，但不得豁免 Agent Completion Submission。

### 1.5 状态模型

```text
Observed
→ Proposed
→ Accepted
→ Specified
→ Planned
→ Implementing
    ↳ Task Assigned
    ↳ Task Running
    ↳ Agent Completion Submitted
    ↳ 下一任务或返回修正
→ Verifying
→ Ready for Release
→ Released
→ Observing
→ Closing
→ Change Completion Submitted
→ Closed
```

旁路终态：

```text
Rejected
Parked
Superseded
Rolled Back
```

规则：

- T0/T1 无独立发布时，可以从 `Verifying` 直接进入 `Closing`。
- `Rejected`、`Parked`、`Superseded` 和 `Rolled Back` 同样必须形成与实际阶段相符的关闭档案。
- 单次 Agent 任务状态固定为 `complete / partial / blocked / failed / cancelled`。
- `partial`、`blocked` 或 `failed` 记录必须说明剩余范围和接续条件；Change 不得因此被误标为完成。
- Change 状态增加 `closing`，用于区分“工作停止”与“完整归档并正式关闭”。

## 2. 公共契约与仓库接口

本方案不修改 Viewer、Editor 或 Design 的运行时 API；新增的是仓库治理、文档、元数据和 CI 接口。

### 2.1 Change ID、Task ID 与目录

T1–T3 使用 GitHub Issue 号：

```text
Change ID: MF-<issue-number>
Task ID:   MF-<issue-number>-T<两位序号>
```

无 Issue 的 T0 使用：

```text
Change ID: MF-T0-<YYYYMMDD>-<slug>
Task ID:   MF-T0-<YYYYMMDD>-<slug>-T<两位序号>
```

目录固定为：

```text
docs/changes/<issue-number>-<slug>/
├── proposal.md
├── spec.md
├── plan.md
├── evidence.md
└── completion/
    ├── manifest.json
    ├── request-transcript.md
    ├── approved-plan.md
    ├── agent-action-reply-summary.md
    ├── closure.md
    ├── task-records/
    │   ├── MF-123-T01.md
    │   └── MF-123-T02.md
    └── dossier.md
```

T0 使用 `docs/changes/t0/<YYYYMMDD>-<slug>/`，沿用相同的 `completion/` 契约。

### 2.2 Change Front Matter

```yaml
---
change_id: MF-123
title: Short descriptive title
status: planned
component:
  - viewer
risk: T2
type: product
owner: Shuang-su
created: 2026-08-09
updated: 2026-08-09
issue: https://github.com/Shuang-su/Metaflow/issues/123
plan_revision: 1
completion_state: pending
supersedes: null
terminal_reason: null
---
```

合法 Change 状态：

```text
observed
proposed
accepted
specified
planned
implementing
verifying
ready-for-release
released
observing
closing
closed
rejected
parked
superseded
rolled-back
```

### 2.3 组件注册表

新增 `metadata/components.json`，作为路径分类、CI 路由、版本归属和 CODEOWNERS 的共同真源。

固定组件：

| ID | 类型 | 归属 | 默认检查 |
| --- | --- | --- | --- |
| `viewer` | product | Viewer 运行代码、数据和版本元数据 | test、typecheck、build、E2E、visual |
| `editor` | product | Active Editor、导出和 Editor 元数据 | lint、build、export/reopen contract |
| `design` | lab / future product | Liquid Glass 研究、Storybook、未来 `/design` | typecheck、storybook、visual、license |
| `data` | product data | 场景、索引、SOG/PLY/LOD/voxel | schema、hash、fixture compatibility |
| `platform` | infrastructure | scripts、Netlify、analytics、Supabase | config、script、smoke、security |
| `reference` | upstream snapshot | 非 Active 的上游快照 | source、version、license、integrity |

Schema：

```json
{
  "schemaVersion": "1.0",
  "components": [
    {
      "id": "viewer",
      "kind": "product",
      "ownedPaths": ["metaflow-viewer/**"],
      "versionSource": "metadata/version-history.json",
      "checks": [
        "viewer-test",
        "viewer-typecheck",
        "viewer-build",
        "viewer-e2e"
      ],
      "deployTarget": "/",
      "upstream": {
        "repository": "playcanvas/supersplat-viewer",
        "versionField": "current.upstream.version"
      }
    }
  ]
}
```

具体路径必须由真实构建和部署依赖确定，禁止在多个 Workflow 中重复维护另一套路径列表。

### 2.4 Agent Completion Record

每次独立提示并具有自己终止回复的 Codex、IDE Agent、外部 AI 或其他生成式执行工具，必须产生一份 Agent Completion Record。

Shell、浏览器、CI、构建器等普通工具调用属于父 Agent 的行动，不单独建立 Agent Completion Record。

每份记录必须包含：

1. `task_id`、`change_id`、工具名称、来源任务或任务 ID；
2. 开始和结束时间；
3. 授权范围；
4. 任务前后的分支和 Git ref；
5. 完整用户问题；
6. 完整任务计划；
7. Agent 行动摘要；
8. Agent 回复摘要；
9. 文件、Git、云端、PR、部署或消息等实际副作用；
10. 验证命令、退出码、数量和证据；
11. 失败、重试、跳过和未验证内容；
12. Plan 偏差及批准记录；
13. 最终状态和接续条件；
14. 最终回复或交付文件的路径和校验值。

#### 完整用户问题

“完整用户问题”必须满足：

- 收录任务开始到终止之间所有用户编写的需求、补充、纠正、约束和验收要求；
- 保留原始顺序和原文，不以 Agent 复述代替；
- 文本附件属于问题组成部分时，必须保存全文或版本化副本；
- 二进制或超大附件必须记录名称、来源、SHA-256 和可访问位置；
- 不得收录与当前 Task 无关的其他对话；
- 不得收录 system/developer 指令、隐藏推理或内部 chain-of-thought；
- 凭据、Token、私钥和依法不得公开的信息必须显式替换为 `[REDACTED: 原因]`，并在 `manifest.json` 记录位置和原因；禁止静默删除。

#### 完整计划全文

- 每次 Agent 发生变更前必须已有 Task Plan Snapshot。
- T0/T1 可以使用轻量 Plan，但仍必须包含目标、范围、步骤、验证、风险和停止条件。
- T2/T3 必须引用已批准的完整 Implementation Plan。
- Record 必须保存 Agent 实际获准执行的计划全文，不能只保存链接或摘要。
- 执行中修改 Plan 时，必须保存原版本、修改原因、批准记录和最终有效版本。
- 紧急生产修复至少必须在执行前记录目标、允许修改范围、验证和回滚；不得以“紧急”为由完全省略 Plan。

#### Agent 行动与回复摘要

行动摘要必须按顺序覆盖：

- 影响判断的环境检查和调研；
- 所有文件或外部状态变更；
- 关键命令和工具调用；
- 失败、重试及替代路径；
- 测试、构建、截图、性能、部署和事后核验；
- 未执行事项和原因。

回复摘要必须覆盖：

- 向用户报告的阶段结果；
- 用户在执行中作出的决定；
- Agent 承诺的范围；
- 最终交付、限制、风险和后续事项。

摘要不得伪装成原始日志，也不得包含隐藏推理。必要的完整命令输出应保存为 Evidence 或 CI artifact。

### 2.5 Change Completion Dossier

Change 进入 `Closing` 后，必须汇总全部 Task Record，生成一个确定性的 `dossier.md`。

固定章节顺序：

```text
1. Change Metadata
2. Complete User Request Transcript
3. Agent Task Inventory
4. Agent Actions and Replies Summary
5. Complete Effective Plan
6. Plan Amendments and Deviations
7. Implementation and External Effects
8. Verification and Review Evidence
9. Release, Rollback and Observation
10. Remaining Risks and Follow-up Changes
11. Ledger / Version / PR / Release Links
12. Checksums and Redaction Manifest
13. Closure Decision
```

规则：

- `dossier.md` 必须由源文件生成，禁止手工维护第二份内容。
- 已合并的 Task Record 视为不可变；更正必须新增 amendment，不得覆盖原记录。
- `approved-plan.md` 必须是最终有效计划全文，并保留原始计划与所有批准修订的关系。
- 所有 `partial`、`blocked`、`failed` 和 `cancelled` Task 必须在 `closure.md` 中逐项解释其处置。
- 未解决的阻断项必须生成新的 Change 或阻止当前 Change 关闭。
- T2/T3 的 Dossier 必须由人类负责人确认；CI 和 AI Review 只能验证结构和一致性。
- 仅提供摘要、无法访问的链接或被截断的计划，不构成 Completion Submission。

### 2.6 Completion Manifest

`completion/manifest.json` 使用以下接口：

```json
{
  "schemaVersion": "1.0",
  "changeId": "MF-123",
  "terminalState": "closed",
  "risk": "T2",
  "components": ["viewer"],
  "request": {
    "path": "request-transcript.md",
    "sha256": "<sha256>",
    "messageCount": 4
  },
  "plan": {
    "path": "approved-plan.md",
    "sha256": "<sha256>",
    "revision": 2,
    "source": "../plan.md"
  },
  "agentSummary": {
    "path": "agent-action-reply-summary.md",
    "sha256": "<sha256>"
  },
  "taskRecords": [
    {
      "taskId": "MF-123-T01",
      "tool": "codex",
      "sourceTaskId": "<optional-platform-id>",
      "status": "complete",
      "record": "task-records/MF-123-T01.md",
      "sha256": "<sha256>"
    }
  ],
  "closure": {
    "path": "closure.md",
    "sha256": "<sha256>"
  },
  "dossier": {
    "path": "dossier.md",
    "sha256": "<sha256>"
  },
  "redactions": [],
  "generatedAt": "2026-08-09T00:00:00Z"
}
```

校验必须覆盖：

- 必需文件和章节存在；
- ID、风险、组件和状态一致；
- SHA-256 正确；
- Plan revision 与批准记录一致；
- Task 序号无重复或缺口；
- 所有 Task 均处于终态；
- 所有非完成 Task 均有处置；
- Dossier 可确定性重建；
- 不存在占位符、秘密、缓存或构建产物；
- `closed`、`released` 和 `rolled-back` 状态具有相应证据。

### 2.7 最终回复交付契约

每次 Agent 任务的最终回复必须按以下顺序交付：

1. 状态和实际结果；
2. 用户完整问题；
3. Agent 行动与回复摘要；
4. 完整有效计划全文；
5. 验证、未验证内容和风险；
6. Agent Completion Record / Dossier 的仓库路径、链接和 SHA-256；
7. Change、PR、Commit、Release 和部署链接。

交付方式：

- 内容在工具限制内时，应当直接完整内联。
- 内容超过单条消息限制时，必须在同一最终回复附带或链接完整可访问的版本化 Markdown 文件，并给出 SHA-256；不得只给节选。
- 工具无法写入仓库时，必须把完整 Record 返回给具备写入权限的父任务，由父任务原样导入并记录 `imported_from`。
- 归档尚未完成时，Change 不得关闭；最终状态必须报告为 `partial`。
- Agent 不得在未运行完整验证或未完成交付契约时使用“全部完成”等表述。

### 2.8 Ledger 与 Version History

Version History 从 schema `1.0` 兼容升级到 `1.1`。新条目允许并在 MCL 生效后的用户可见 Change 中强制以下 trace：

```json
{
  "trace": {
    "changeId": "MF-123",
    "issue": "<issue-url>",
    "proposal": "docs/changes/123-example/proposal.md",
    "spec": "docs/changes/123-example/spec.md",
    "plan": "docs/changes/123-example/plan.md",
    "pullRequest": "<pr-url>",
    "evidence": "docs/changes/123-example/evidence.md",
    "completionManifest": "docs/changes/123-example/completion/manifest.json",
    "completionDossier": "docs/changes/123-example/completion/dossier.md",
    "releaseTag": "viewer-v5.19.0",
    "deployUrl": "<production-url>"
  }
}
```

规则：

- 旧记录不强制回填 Completion 字段。
- MCL 生效后的 T1–T3 必须具有 `trace.changeId`、PR 和 Completion Dossier。
- Stable Release 必须具有 tag、Evidence、Completion 和 deploy 证据。
- 回滚必须新增版本条目和新的关闭记录，不得修改原 Release。
- Ledger 必须链接 Change ID 和 Completion Dossier，但不得复制结构化版本字段。

### 2.9 分支、标签和 PR 接口

分支：

```text
codex/mf-<issue>-<slug>
feature/mf-<issue>-<slug>
fix/mf-<issue>-<slug>
```

标签：

```text
viewer-vX.Y.Z
editor-vX.Y.Z
design-vX.Y.Z
viewer-vX.Y.Z-beta.N
```

PR 模板必须包含：

1. Change ID；
2. Summary、Motivation、Behavior；
3. Scope / Non-goals；
4. Proposal / Spec / Plan / ADR；
5. Validation 和未运行项目；
6. UI / Compatibility / Performance Evidence；
7. Risk / Rollback；
8. Ledger / Version History；
9. AI Assistance；
10. Agent Task Record 清单；
11. Completion Dossier 状态；
12. 未完成或后续 Change。

## 3. 生命周期 Gate

### Gate 0：Signal 可行动性

必须确认：

- 问题或机会可验证；
- 是否重复；
- 受影响组件；
- 紧急程度；
- 初始证据；
- 是否进入现有 Change。

输出只能是关闭、合并到已有 Change 或 `Proposed`。

### Gate 1：Proposal 决策

必须覆盖问题、用户、证据、时机、目标、非目标、选项、成本、风险和成功信号。

T2/T3 只能由人类负责人决定 `Accept / Park / Reject`。AI 可以起草和审查，但不得自行批准。

### Gate 2：Spec 就绪

必须确认：

- 用户可观察行为无歧义；
- URL、配置、类型、数据和兼容契约明确；
- 错误、超时、取消、降级和恢复明确；
- 安全、隐私、性能、无障碍和移动端要求明确；
- 验收可以测试或观察；
- 未决项为零或已明确延期。

### Gate 3：Plan 与 Task 授权

必须完成：

- Implementation Plan；
- 任务依赖和顺序；
- RED / GREEN / REFACTOR 边界；
- 目标子系统；
- 验证命令和预期结果；
- 提交、PR 和发布边界；
- 回滚和停止条件；
- Task ID；
- 完整用户问题初始快照；
- Task Plan Snapshot 和 SHA-256。

完成 Gate 3 前禁止发生实现性修改。

### Gate 4：实现

必须遵守：

- 只实现批准范围；
- 保护现有用户文件和脏工作树；
- 测试先证明失败，再证明修复；
- 禁止混入无关重构；
- 文档、生成物、迁移和元数据同步；
- 外部副作用必须在执行后重新读取验证。

出现 Spec 外决策时必须返回 Gate 1 或 Gate 2。

### Gate 5：Agent Completion Submission

每个独立 Agent Task 终止前必须：

1. 更新完整用户问题；
2. 固化实际执行的完整 Plan；
3. 汇总全部重要行动、失败、验证和副作用；
4. 汇总对用户的回复和决定；
5. 写入 Task Record；
6. 更新 `manifest.json`；
7. 运行 Completion 校验和秘密扫描；
8. 按最终回复契约交付；
9. 根据真实结果设置 `complete / partial / blocked / failed / cancelled`。

缺失 Gate 5 时：

- 不得把 Task 标为完成；
- 不得把 PR 标为 Ready；
- 不得把该 Task 从 Change 清单中移除；
- 后续 Agent 必须先补全或显式接管。

### Gate 6：验证与 Review

必须分离两种关注点：

1. Spec Compliance Review：范围、行为、遗漏、超出项；
2. Code Quality Review：正确性、维护性、性能、安全和测试质量。

分离关注点不等于必须启动多个子 Agent。默认可以由主 Agent 执行独立 Review pass；只有当前规则明确允许且任务真正独立时才使用多 Agent。

自动检查失败不得由 Review 文字豁免。

### Gate 7：Release Readiness

必须确认：

- `required / gate` 全绿；
- Preview / Beta 证据；
- 版本、标签和不可变制品；
- 数据迁移和回滚；
- Ledger、Version History 和 Completion 链接；
- 线上 smoke 方案；
- 已知限制和观察负责人。

### Gate 8：Release 与观察

发布顺序：

```text
PR Preview
→ Merge
→ Beta / Staging
→ Stable Tag
→ Immutable Build
→ Production Deploy
→ Post-deploy Smoke
→ GitHub Release
→ Observation
```

必须新增 Release Task Record，记录部署、线上验证、回滚目标和最终回复。

观察期必须检查关键路径、错误、性能、兼容性、支持问题和成功信号。

### Gate 9：Change Closure Submission

进入 `Closed` 前必须：

1. 汇总全部 Agent Task Record；
2. 汇总完整用户问题；
3. 生成完整有效计划全文；
4. 记录所有 Plan 修订和偏差；
5. 生成行动与回复总摘要；
6. 核对 Evidence、PR、Commit、Release、部署、Ledger 和 Version；
7. 处理所有非完成 Task；
8. 生成 `dossier.md` 和 `manifest.json`；
9. 运行确定性生成、schema、链接、checksum 和 secret checks；
10. 由负责人确认关闭决定；
11. 通过最终回复同步交付完整 Dossier；
12. 将 Change 状态改为相应终态。

## 4. 工程、协作与发布控制

### 4.1 GitHub 协作

Issue 类型固定为：

- Bug；
- Product / Feature Proposal；
- Performance / Compatibility；
- Upstream Sync Proposal；
- Experiment Promotion Proposal；
- Security 使用私密渠道。

标签分为：

```text
component/*
type/*
risk/T0-T3
```

GitHub Project 字段固定为：

- Lifecycle Phase；
- Risk；
- Component；
- Change Type；
- Target Release；
- Owner；
- Upstream Version；
- Blocked By；
- Completion State。

`main` Ruleset 必须：

- PR-only；
- 禁止 force push 和删除；
- 解决所有 Review conversation；
- 通过稳定名称 `required / gate`；
- 默认 squash merge；
- 合并后删除分支；
- 当前个人加 AI 模式 required approvals 为 `0`；
- 固定第二维护者加入后切换为 `1` 并启用 CODEOWNERS approval。

### 4.2 AI 责任边界

- 人类负责人必须批准 T2/T3 Proposal、公共契约、破坏性迁移和生产发布。
- Agent 可以调研、起草、实现、测试、Review、生成 Evidence 和 Completion。
- AI Review 不得代替自动测试或人类产品决策。
- Agent 不得公开 system/developer 指令或隐藏推理。
- Agent 必须准确报告未验证、失败和部分完成。
- 不强制安装或调用特定外部 Agent 工作流。
- 不默认并行 Agent；共享文件、共享构建目录或共享发布状态的任务必须串行。

### 4.3 CI 总体结构

所有 PR 必须先运行路径分类，并始终产生同一最终检查：

```text
required / gate
```

所有 Workflow 必须：

- 固定第三方 Action 到完整 commit SHA；
- 使用最小权限；
- 禁止 PR 获取生产凭据；
- 设置 timeout 和并发取消；
- 按 lockfile 缓存依赖；
- 不在普通 PR 下载全部大数据或全部 reference；
- 对外部写入执行事后核验。

Always-on 作业必须包含：

- Change front matter 和状态；
- 风险等级与必需产物；
- Proposal / Spec / Plan / Evidence 链接；
- Agent Task Record 和 Completion Manifest；
- Dossier 确定性生成；
- 用户问题、计划和摘要章节完整性；
- Plan revision 和 checksum；
- Version History schema；
- 组件路径归属；
- 版本一致性；
- Markdown 链接；
- `git diff --check`；
- secret 和意外文件扫描。

### 4.4 组件检查

Viewer：

```text
npm ci
npm test
npm run type:check
npm run build
```

并检查运行时版本、Version History、数据索引、redirect、analytics、voxel、动画策略和构建体积。

Editor：

```text
npm ci
npm run lint
npm run build
```

逐步补充打开、编辑、undo/redo、HTML/SOG package、legacy ZIP、settings、`.ssproj`、时间轴、locale、Service Worker、导出和重新打开契约。

Design：

```text
npm ci
npm run typecheck
npm run generate-study-pages
npm run build-storybook
```

必须补充来源与许可证、资产完整性、Storybook smoke、视觉、reduced-motion、overflow 和控件交互。

Data / Platform：

- 小型 schema fixture 每个相关 PR 运行；
- 大型语料在定时或手动 Workflow 运行；
- Netlify redirect、SPA fallback 和部署包完整性；
- 生成脚本幂等；
- Supabase migration/function 静态检查；
- analytics 隐私和事件 schema；
- 外部服务写入后的重新读取验证。

### 4.5 浏览器、视觉和性能

Playwright 必须以同一 fixture 同时验证开发服务器和生产构建。

PR 必需环境：

- Chromium；
- WebGL；
- `1440×900`；
- `390×844`。

定时或发布前环境：

- WebGPU；
- WebKit；
- Firefox；
- 真实移动设备；
- 有条件的 XR 设备。

Fixture 至少覆盖：

- Legacy SOG；
- streaming / LOD；
- subject + environment；
- 单体和 tiled voxel；
- annotation、picker、target navigation；
- Orbit / Anim / Fly / Walk；
- URL、settings、timeout 和 fallback；
- 损坏输入和不支持能力降级；
- 移动触控和窄屏。

视觉测试必须固定相机、DPR、字体、语言、时区、动画时间和 ready signal。Baseline 更新必须显式审查。

性能硬门禁先覆盖 bundle、关键资源数量、同步阻塞和首帧超时。GPU 运行指标在专用 Runner 获得至少 20 次稳定样本且变异系数低于 10% 后，才按基线 p95 加 10% 建立阻断预算。

### 4.6 安全

必须建立：

- CodeQL；
- dependency review；
- secret scanning；
- Workflow 权限和 Action SHA 检查；
- 活动依赖的自动更新 PR；
- 研究代码、资产和许可证审计；
- Completion 文本的敏感信息扫描。

安全报告和未公开漏洞不得进入公开 Completion Transcript；公开档案使用受控占位符和私密记录引用。

### 4.7 Release 与回滚

回滚必须：

- 优先恢复上一成功部署；
- 创建 revert 或修复 PR；
- 新增 rollback Version History 条目；
- 新增 Rollback Task Record；
- 将 Change 标记为 `rolled-back`；
- 保留原 Release、Evidence 和 Completion；
- 创建事故后续 Change。

### 4.8 Upstream Sync

定时任务只允许发现版本并创建或更新 Issue，禁止自动覆盖代码或自动合并。

Upstream Sync Proposal 必须记录：

- 当前本地基线和目标 tag/commit；
- Added / Changed / Fixed / Breaking；
- 用户价值；
- 本地定制影响；
- 数据、URL、导出、渲染和部署兼容；
- `Adopt / Defer / Skip` 决定；
- Beta 范围和发布建议。

本地定制逐项分类：

```text
Keep
Port
Replace
Drop
Conflict
```

`Conflict` 必须返回 Proposal/RFC。Skip 和 Defer 同样必须形成关闭档案，避免重复分析。

### 4.9 Design 晋升

研究进入产品前必须经过 Experiment Promotion Proposal，并确认：

- 来源、许可证、抓取日期和可再分发性；
- 目标用户和信息架构；
- 保留、重写和禁止使用的内容；
- 移动端、性能、无障碍和降级要求；
- 研究实现与产品实现的边界。

`design` 变更不得触发 Viewer 版本记录，除非同时改变 Viewer 公共组件或根产品行为。

## 5. 分阶段实施路线

### Phase 0：保护现场

1. 在任何实施性修改前保存当前 HEAD 的可恢复引用。
2. 禁止重置当前 `main` 或改写现有 9 个本地提交。
3. 未跟踪 Swiftgram 目录在完成来源、许可、敏感文件和体积审计前不得提交、移动或删除。
4. 当前未跟踪的 MCL 草稿不得直接提交；必须按本规范重写，移除调研过程、案例说明、合并说明和历史回复。
5. 治理工作应当使用独立分支或 worktree。
6. 保存 Git、测试、版本、GitHub 和部署配置基线。

验收：当前用户工作可恢复，治理修改不混入 Design 研究或产品变化。

### Phase 1：规范和模板

交付：

- MCL 权威规范；
- `CONTRIBUTING.md`；
- `AGENTS.md`；
- Roadmap；
- Change 状态和风险等级；
- Proposal、Spec、Plan、Evidence、ADR 模板；
- Agent Completion Record、Closure 和 Dossier 模板；
- Issue 和 PR 模板。

规范正文必须保持操作性，不得包含来源调研或历史对话叙述。

### Phase 2：Completion Contract

交付：

- Completion Manifest schema；
- Task Record 模板；
- Dossier 确定性生成器；
- `generate` 和 `--check` 模式；
- checksum、redaction 和 secret checks；
- Agent 开始任务和完成任务的操作清单；
- 无仓库写权限工具的导入协议；
- PR Completion 状态检查；
- Version History Completion 链接。

MCL 自身实施 Change 必须作为第一个 Bootstrap Completion 案例，使用实际任务请求、实际执行摘要和获准计划验证完整流程。

验收：

- 缺少完整问题、摘要或计划时检查失败；
- 修改源文件后未重新生成 Dossier 时检查失败；
- 外部工具 Record 可以无损导入；
- 最终回复和仓库 Dossier 的 SHA-256 一致。

### Phase 3：组件注册与绿色基线

交付：

- `metadata/components.json`；
- 路径分类器；
- Version History 测试按组件归属执行；
- README、Project Index、package 和 metadata 版本真源统一；
- Viewer 当前测试、类型和构建全绿；
- Editor lint/build 基线；
- Design typecheck/Storybook 基线。

禁止通过提交哈希白名单或 Design 路径特例掩盖 Viewer 的路径归属问题。

### Phase 4：GitHub 和核心 CI

交付：

- Always-on governance；
- Completion validation；
- Viewer、Editor、Design、Data/Platform 路径作业；
- 稳定的 `required / gate`；
- Ruleset；
- CODEOWNERS；
- 标签、Issue 表单和 Project 字段。

顺序必须是：Workflow 先进入 `main` 并成功运行，再配置 required check。

### Phase 5：Ledger 与 Version History 1.1

交付：

- 向后兼容 schema；
- Change、Evidence、Completion、Release trace；
- 生成脚本和 `--check`；
- Ledger/Version/Completion 一致性验证；
- namespaced tag；
- legacy 历史兼容测试。

旧历史不强制回填；MCL 生效后的新 Change 强制完整 trace。

### Phase 6：浏览器、视觉和性能

交付：

- 小型可再分发 fixture；
- serve/build 双模式 Playwright；
- Chromium/WebGL 必需门禁；
- 视觉基线；
- bundle budget；
- 定时 WebGPU、多浏览器和性能趋势；
- Editor export/reopen；
- Design Storybook 视觉和 reduced-motion。

### Phase 7：安全、发布、观察和关闭

交付：

- CodeQL、依赖和 secret checks；
- Preview/Beta/Stable；
- immutable artifact；
- production smoke；
- rollback；
- Release Task Record；
- Observation 模板；
- Closeout PR 和 Change Completion Dossier。

先执行无生产写入的 dry run，再执行受控 Beta。Smoke 失败时不得生成成功 Release。

### Phase 8：Upstream Sync

交付：

- Release watcher；
- no-op 去重；
- Sync Proposal；
- 上游变化和本地定制分类；
- patch map；
- Beta 兼容矩阵；
- Skip/Defer Completion；
- Sync Ledger 和 Version trace。

监控只能创建或更新 Issue，不得自动修改或合并产品代码。

### Phase 9：试点与生效

必须完成：

1. 一个 T0/T1 快路径案例，验证轻量 Plan 和 Completion 不造成不必要阻塞；
2. 一个 Design onboarding 或 Experiment Promotion 案例；
3. 一个真实 Upstream Sync 案例；
4. 一个包含至少两个 Agent Task 的 T2 案例；
5. 一次最终回复附件或长文交付测试；
6. 一次 `partial/blocked → 接续任务 → closed` 测试；
7. 一次回滚或回滚演练；
8. 流程复盘并删除无决策价值的重复字段。

全部通过后才发布 `MCL 1.0` 并强制新 T2/T3 执行。

## 6. 测试与验收

### 6.1 Completion Contract 测试

必须覆盖：

- 缺少任一用户消息时失败；
- 消息顺序错误或 message count 不一致时失败；
- 缺少完整计划或仅保存链接时失败；
- Plan hash 或 revision 不一致时失败；
- 未记录 Plan amendment 时失败；
- 缺少行动摘要或回复摘要时失败；
- Task ID 重复、缺口或 Change ID 不一致时失败；
- `partial/blocked/failed` 无处置时阻止关闭；
- Dossier 手工改动或生成不幂等时失败；
- checksum 不一致时失败；
- 检测到凭据时失败；
- 合法 redaction 有原因和位置时通过；
- 外部 Agent Record 导入后保留来源 ID 和原文；
- 最终回复附件与仓库 Dossier hash 不一致时失败；
- 无法访问完整交付物时不得标记完成。

### 6.2 治理测试

- T0 不被错误要求 Proposal/Spec；
- Agent 参与的 T0 缺少 Task Plan 或 Completion 时失败；
- T1 缺少复现/回归证据时失败；
- T2 缺少 Spec、Plan 或 Dossier 时失败；
- T3 缺少 Proposal/RFC 时失败；
- 非长期架构变化不被错误要求 ADR；
- Plan 引入新产品决定时必须退回 Spec；
- Release 缺少 Completion trace 时失败；
- 回滚修改旧 Version History 时失败。

### 6.3 路径测试

- 仅修改 Design 不触发 Viewer 版本要求；
- Viewer 公共行为变化触发 Viewer CI、Ledger、Version 和 Completion；
- Editor 变化触发 lint、build 和契约测试；
- 组件注册表变化触发全部治理检查；
- Netlify、脚本或生成逻辑触发 Platform 和 smoke；
- Reference 变化只运行来源、版本、许可和完整性检查。

### 6.4 生命周期端到端测试

T1：

```text
Bug → RED → Fix → Agent Completion → PR → Gate → Closure Dossier
```

T2：

```text
Proposal → Spec → Plan
→ Task 1 → Completion
→ Task 2 → Completion
→ Preview → Review → Release → Observation
→ Change Completion → Closed
```

T3：

```text
RFC → ADR → Spec → Staged Plan
→ Task Completions
→ Beta → Migration/Rollback Evidence
→ Stable → Observation → Closure
```

Upstream：

```text
Release Detected → Sync Proposal
→ Adopt/Defer/Skip
→ Plan/Sync or Decision Record
→ Completion Dossier
```

另一名维护者或 Agent 必须能够只读取仓库资料，准确还原：

- 用户完整提出了什么；
- 哪些约束在执行中发生变化；
- 每个 Agent 做了什么、如何回复；
- 执行的是哪份完整计划；
- 哪些步骤成功、失败、跳过或未验证；
- 产品、仓库和外部系统最终处于什么状态；
- 为什么可以关闭或为什么仍不能关闭。

### 6.5 Definition of Done

所有 Agent Task：

- 完整用户问题已保存；
- 完整 Task Plan 已保存；
- 行动与回复摘要完整；
- 实际验证和副作用可追溯；
- 最终状态准确；
- Task Record 校验通过；
- 仓库和最终回复均已交付完整材料。

所有 Change：

- 风险和组件正确；
- 必需产物存在并互相链接；
- 所有 Task Record 已汇总；
- Spec 与实现一致；
- 所有声明有实际证据；
- 无未说明失败；
- 回滚路径明确；
- Ledger/Version 规则满足；
- Completion Dossier 生成和校验通过；
- 最终回复已同步提交；
- 负责人已确认终态。

Stable Release：

- namespaced tag 指向通过 Gate 的 commit；
- immutable artifact 可定位；
- Preview/Beta 证据存在；
- production smoke 成功；
- Version endpoint 正确；
- Release 链接 Change 和 Completion；
- 观察期、负责人和回滚目标明确。

MCL 1.0：

- 规范、模板和 Schema 已进入 `main`；
- Completion Contract 在 CI 中成为硬门禁；
- 当前组件基线绿色；
- Ruleset 已真实验证；
- Version History 1.1 向后兼容；
- 浏览器、视觉、安全、发布和回滚完成演练；
- Bootstrap、快路径、Design 和 Upstream 试点完成；
- 新 T2/T3 能在不依赖历史聊天的条件下完整继续执行。

### 6.6 固定默认项

- 当前运行模式为个人维护者加 AI；人类 required approvals 暂为 `0`。
- GitHub Actions、GitHub Projects 和 Netlify 继续作为基础设施，不引入另一套项目管理系统。
- Viewer、Editor、Design 保持独立版本和发布节奏。
- 现有历史版本不全面回填 Completion；仅对 MCL 生效后的新 Change 强制。
- Completion Contract 适用于所有被分派到 Metaflow Change 的独立 Agent/生成式工具任务；与项目无关的普通问答不纳入。
- 系统指令、开发者指令和隐藏推理永不进入档案。
- 用户问题原则上逐字保存；安全 redaction 是唯一允许的内容省略，并且必须可审计。
- 外部项目、调研过程和历史回复只可保存在独立 Research/Evidence 材料中，不得进入 MCL 规范正文。
- Research、Design 实验和产品实施保持独立，除非通过正式 Promotion Proposal。
