# MCL 模板使用说明

模板是按任务性质选择的工具箱，不是一份必须全部填写的清单。任务是否需要 Issue、Spec、Plan、PR 或审计档案，由当前 [MCL v1.0 candidate](../../metaflow-change-lifecycle-v1.0.md)、实时范围和风险决定。

## 日常或条件模板

| 模板 | 何时使用 | 不适用时 |
|---|---|---|
| [`issue-body.md`](issue-body.md) | 已决定创建 Issue，需要完整背景、目标、范围、验收、风险和状态 | 纯文档、研究或机械维护可以没有 Issue |
| [`proposal.md`](proposal.md) | 方向尚未决定，需要比较方案与取舍 | 已接受的小型实现不补建 Proposal |
| [`spec.md`](spec.md) | 公共行为、API、数据或技术契约需要长期保存 | 简单任务由 Issue/请求直接定义验收 |
| [`plan.md`](plan.md) | 跨会话、步骤多、回退复杂或多人交接 | 当前 Codex Plan 足够时不复制仓库 Plan |
| [`adr.md`](adr.md) | 架构决策需要长期解释替代方案和后果 | 临时实现细节留在 Spec/PR |
| [`evidence.md`](evidence.md) | 证据复杂、需独立长期保存或由多环境汇总 | 通常直接写入 PR 或 Issue 完成交付 |
| [`observation.md`](observation.md) | 实际生产发布需要观察窗口 | 普通文档、代码合并或未发布 staging 不使用 |

## 仅显式审计模式

以下模板不属于日常 Completion Contract：

- [`agent-completion.md`](agent-completion.md)
- [`closure.md`](closure.md)
- [`release-task-record.md`](release-task-record.md)

只有合规、事故、破坏性迁移、正式发布或当前用户明确要求保存完整审计档案时才启用。完整请求、Agent 行动、完整计划和交流过程默认由 Codex 任务链接保存；不要仅因为看到了模板就复制全文。

## 状态边界

- Issue 通用状态：`Open → In Progress → In Review → Done`。
- `Proposed` 只用于未决 Proposal；`Ready` 是开始条件判断，不是通用状态。
- Spec 的 `specified`、Plan 的 `approved` 是工件成熟度，不是 Issue 状态。
- 生产发布可使用 `Released → Observing → Done`；阻塞或终止状态只在真实发生时使用。

历史模板和 Change 的关系见 [`../../changes/README.md`](../../changes/README.md)。
