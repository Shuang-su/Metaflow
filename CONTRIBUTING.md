# Contributing to Metaflow

Metaflow Change Lifecycle 的唯一规范是 `docs/metaflow-change-lifecycle-v1.0.md`。在其 `candidate` 阶段，强制范围只包括 MF-1 与明确指定的试点。

## 选择工作流

| 风险 | 示例 | 默认入口和工件 |
| --- | --- | --- |
| T0 | 文档、研究、机械维护 | Commit/PR；Issue 可选 |
| T1 | 局部 Bug、小型兼容改进 | 自描述 Issue、轻量 Plan、PR、回归证据 |
| T2 | 产品行为、UI、数据能力 | Issue、唯一 Spec、唯一 Plan、PR、Evidence |
| T3 | 架构、公共契约、安全、破坏性迁移、重大上游同步 | T2 工件、Proposal/RFC、必要 ADR、发布/回滚/观察方案 |

## Issue 是任务入口

T1–T3 Issue 依次写清：

1. 当前状态
2. 背景
3. 目标
4. 包含范围
5. 排除范围
6. 验收标准
7. 风险、依赖与回退
8. Spec / Plan 与相关任务
9. 完成交付

只看 Issue 应能判断任务是否合理和是否完成。API、文件步骤和测试命令放在链接的唯一 Spec/Plan；完成后回填 PR、squash commit、验证和遗留事项。

## 分支、Commit 与 PR

- Agent 分支：`codex/mf-<issue>-<slug>`。
- T2/T3 使用隔离 worktree。
- 一个 PR 只处理一个主要目标。
- Commit 使用简洁 `type(scope): summary`，不复制 Issue/Plan/对话全文。
- PR 说明实际变更、验收映射、检查及未运行项、风险、回退、偏差和后续工作。
- 用 `Closes #<issue>` 关联交付。

## Spec、Plan 与审计档案

Spec 规定行为和接口，Plan 规定实现步骤和命令；各保留一个规范副本。T0/T1 的轻量 Plan 可以直接位于 Issue 或 PR。

以下内容不是默认工件：Task Record、Completion Dossier、Manifest、完整 request transcript、approved-plan 副本。只在合规、事故、破坏性迁移、正式发布或用户明确要求时启用审计模式。MF-1 的 legacy 档案保持原样。

## 验证

运行由路径路由和风险选择的最小可信检查。治理变更的基线：

```bash
node scripts/mcl.mjs check-all --strict
node --test scripts/tests/*.test.mjs
python3 scripts/validate_platform.py
node scripts/check_markdown_links.mjs
node scripts/scan_repository.mjs
```

产品行为还必须运行对应组件检查；通过 build 不能替代浏览器、兼容、性能、安全或部署验收。被正确跳过的检查不是成功证据，PR 必须说明不适用原因。

## Review、发布与关闭

- Spec compliance 与 code quality 分开检查。
- 实现作者的复查是 self-review；不同非实现作者才是 independent review。
- 解决所有 review conversation，并通过稳定的 `required / gate`。
- 发布类 Change 需要不可变版本、smoke、Version History/Ledger、回滚目标和观察窗口。
- 合并后更新 Issue 状态、验收和交付链接，再关闭 Change。
