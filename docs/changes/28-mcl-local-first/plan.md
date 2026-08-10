---
change_id: MF-28
title: MCL Revision 6 实施计划
status: approved
component:
  - platform
  - viewer
risk: T2
type: governance
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/28
plan_revision: 1
canonical_path: docs/changes/28-mcl-local-first/plan.md
---

# MCL Revision 6 实施计划

## 实施顺序

1. 从最新 `origin/main` 创建隔离 `codex/mf-28-local-first-mcl` worktree，保护本地 `main` 的设计提交和 Swiftgram 未跟踪目录。
2. 修订 MCL、Agent/贡献规则、Issue Forms、PR 模板和当前中文维护文档。
3. 增加资源分级、Completion Contract、Ledger 路径级边界和 Viewer SemVer 前向契约。
4. 更新结构化 Version History 的规则文本及公开镜像，不改变 current、历史 entry、package 或 index schema。
5. 更新 MCL、CI 路由和 Version History 定向测试；保留 legacy reader/checker。
6. 将普通 CI 改为按需手动验证，更新 tracked Ruleset，并在 PR 就绪后应用/读回 hosted Ruleset。
7. 运行定向验证，执行 Spec compliance 与 code/document quality 两次作者自审。
8. 创建单一提交、推送分支、创建 Ready PR；记录实际检查、未运行项、失败、风险和回退。
9. Squash merge，回填 Issue #28，重新读取远端 main、Issue 与 Ruleset。
10. 将远端 main 合入本地 main，不推送本地无关设计提交。

## 文件与接口边界

- 规范与协作：MCL、`AGENTS.md`、`CONTRIBUTING.md`、GitHub Issue/PR 模板。
- 当前用户文档：资源发布、开发验证、版本发布、版本关系、架构、文档维护和 Viewer Ledger。
- 机器规则：Viewer metadata/public Version History、Version History 测试、MCL/路由测试。
- 托管入口：普通 CI workflow 和 tracked/hosted main Ruleset。
- 唯一契约与计划：本目录的 `spec.md` 与本文。

不修改 Viewer/Editor runtime、资源、package 版本、`data/index.json` schema、正式 release/rollback/upstream workflow 的业务语义。

## 定向验证

```bash
node --test scripts/tests/mcl-lightweight.test.mjs scripts/tests/mcl.test.mjs
node scripts/mcl.mjs check docs/changes/1-adopt-mcl-v1 --strict
node scripts/mcl.mjs check docs/changes/9-reference-dependency-decision --strict
node --test metaflow-viewer/tests/version-history.test.mjs
node --test scripts/tests/ci-routing.test.mjs
node scripts/check_markdown_links.mjs
python3 scripts/validate_platform.py
git diff --check
```

若平台校验或目标测试依赖 sparse checkout 未包含的只读文件，只补充精确 checkout 路径，不拉取全部 data/LFS。不得因此扩大为 Viewer/Editor build 或 E2E。

## PR 与远端操作

- Commit：`docs(mcl): adopt local-first flow and forward SemVer`
- PR：一个主要目标，`Closes #28`，默认 Ready；GitHub Actions 结果不作为完成证据。
- hosted Ruleset：在 PR 本地证据完成后移除 required status checks，为仓库所有者增加精确 User bypass，读回后再合并。
- 合并：按现有 PR 规则 squash merge；合并后回填 Issue 的最终 squash SHA 和 Ruleset 读回。
- 回退：revert squash commit，并恢复先前 hosted Ruleset；不重写 legacy Version History/Ledger。

## 停止条件

- 改动触及 Viewer/Editor runtime、资源或部署；
- legacy MF-1/MF-9 发生不可解释漂移；
- historical Version History/Ledger 内容被重写；
- hosted Ruleset 目标、ID 或当前状态无法重新确认；
- 无法把任务变更与本地无关提交分离。
