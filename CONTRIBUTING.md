# Contributing to Metaflow

Metaflow Change Lifecycle 的唯一规范是 `docs/metaflow-change-lifecycle-v1.0.md`。在其 `candidate` 阶段，强制范围只包括 MF-1 与明确指定的试点。

## 选择最短可信流程

| 变化 | 最小流程 |
| --- | --- |
| 文档、治理、研究、无行为维护 | 实施 → 本地检查 → Direct Commit；Issue/PR 可选 |
| 小型兼容修复、已有契约内的常规资源 | Request 或轻量 Issue → 实施 → 定向验证 → Direct Commit 或 PR |
| 需要协作跟踪或验收确认 | 自描述 Issue → 实施 → PR 或 Direct Commit → 回填结果 |
| 新产品行为、公共数据契约、跨组件实现 | Issue、唯一 Spec、唯一 Plan、PR |
| 架构、安全、破坏性迁移、重大上游同步、正式生产变更 | 上一档工件，加必要 Proposal/ADR、迁移、回滚和观察 |

T0–T3 继续作为风险标签，但不自动要求固定的长流程。Spec、仓库 Plan、TDD、PR 和独立 Evidence 都按实际任务启用；不要为 Markdown、资源或机械维护伪造 RED/GREEN/REFACTOR。

## Issue 一旦创建就必须自描述

Issue 依次写清：

1. 当前状态
2. 背景
3. 目标
4. 包含范围
5. 排除范围
6. 验收标准
7. 风险、依赖与回退
8. Spec / Plan 与相关任务
9. 完成交付

只看 Issue 应能判断任务是否合理和是否完成。API、文件步骤和测试命令放在链接的唯一 Spec/Plan；简单任务不适用独立文档时说明原因。完成后回填 PR/Commit、验证、未运行项和遗留事项。

## 状态、Commit 与 PR

- 通用状态：`Open → In Progress → In Review → Done`；不需要审查时可以跳过 `In Review`。
- `Proposed` 只用于未决 Proposal；发布可以使用 `Released → Observing → Done`；阻塞或终止时才使用 `Blocked/Parked/Rejected/Rolled Back`。
- Agent 分支：`codex/mf-<issue>-<slug>`；公共契约、跨组件和高风险任务使用隔离 worktree。
- Commit 使用简洁 `type(scope): summary`；无 Issue/PR 时可附简短 `Validation:`、`Release:`、`Refs:` trailer，不复制全文。
- PR 存在时就是 Completion Contract，说明实际结果、验收映射、检查及未运行项、风险、回退、偏差和后续。
- 用 `Closes #<issue>` 关联已有 Issue；简单任务没有 Issue 时不创建占位 Issue。

## 资源发布与版本

- 常规资源：既有格式/schema/生成器/cache/route，可 Direct Commit。
- 大型或新增入口：新 route/alias、超过 20 文件、超过 100 MiB、LFS 或大量 tiled/LOD，使用轻量 Issue/PR checklist 和 PR。
- 结构性资源：涉及 schema、生成器语义、Loader、Viewer、cache/deploy、格式、授权或公共 URL，使用 Issue + Spec + Plan + PR。

公开 route、thumbnail、settings 或资源内容变化必须更新 Viewer PATCH、Ledger 和 Version History；未公开 staging 不提升版本。当前保持 `5.18a / 5.18.0`，下一次真实发布为 `5.18.1`，以后不再新增字母后缀。

## 验证与按需 CI

运行 Plan、路径与风险选择的最小可信本地检查。可先预览检查路线：

```bash
node scripts/ci-routing.mjs route --base origin/main
```

普通 GitHub CI 只按需手动运行，不是通用完成条件。实际命令、结果、未运行项和原因记录在 PR、Issue 或直接提交交付中。产品行为仍需运行对应组件检查；build 不能替代必要的浏览器、兼容、性能、安全或部署验收。

治理变更可按范围选择：

```bash
node --test scripts/tests/mcl-lightweight.test.mjs scripts/tests/mcl.test.mjs
node scripts/mcl.mjs check docs/changes/1-adopt-mcl-v1 --strict
python3 scripts/validate_platform.py
node scripts/check_markdown_links.mjs
git diff --check
```

## 审计档案、发布与关闭

以下内容不是默认工件：Task Record、Completion Dossier、Manifest、完整 request transcript、approved-plan 副本。只在合规、事故、破坏性迁移、正式发布或用户明确要求时启用审计模式；MF-1/MF-9 legacy 档案保持原样。

历史 Change 的状态、Gate、命令和验收只说明当时版本，不建立当前政策。开始复用旧工件前先看 [`docs/changes/README.md`](docs/changes/README.md) 的状态注册表；没有显式审计需求时，不进入 legacy `completion/` 寻找日常模板。

- Spec compliance 与 code/document quality 分开检查；实现作者复查属于 self-review。
- 产品发布更新对应 Version History/Ledger、回滚目标和必要观察；它们不替代 PR/Issue Completion Contract。
- Ledger 与 Version History 不是通用 Completion Contract：前者解释 Viewer 产品行为、风险和证据背景，后者记录结构化发布事实。
- 合并或 Direct Commit 后更新已有 Issue 状态、验收和交付链接，再结束 Change。
