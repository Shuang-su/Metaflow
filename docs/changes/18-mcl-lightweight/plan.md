---
change_id: MF-18
title: MCL 轻量化实施计划
status: in-progress
component:
  - platform
risk: T3
type: governance
owner: Shuang-su
created: 2026-08-10
updated: 2026-08-10
issue: https://github.com/Shuang-su/Metaflow/issues/18
plan_revision: 1
canonical_path: docs/changes/18-mcl-lightweight/plan.md
---

# MCL 轻量化实施计划

## 目标

把 MCL 从默认的全文档案模型调整为 Issue/Commit/PR/唯一 Spec/Plan 分层，同时保留 MF-1 legacy 档案的可读性和确定性校验。

## 实施顺序

1. 修订当前 MCL 规范、Agent 规则和贡献指南。
2. 更新 Issue Forms、PR 模板和 MCL 文档模板。
3. 增加契约静态测试，并运行 legacy MF-1 校验。
4. 创建 Draft PR，记录实际验证和未运行项。
5. 按新 Issue Contract 回填所有开放 Issue。
6. PR 通过必需 Gate 后转为 Ready 并 squash merge。
7. 在 Issue #18 回填 PR、squash commit、验证与剩余事项。

## 文件边界

- 规范：`docs/metaflow-change-lifecycle-v1.0.md`
- 仓库协作：`AGENTS.md`、`CONTRIBUTING.md`
- GitHub 入口：`.github/ISSUE_TEMPLATE/**`、`.github/pull_request_template.md`
- 唯一技术契约与实施计划：`docs/changes/18-mcl-lightweight/spec.md`、本文
- 兼容验证：`scripts/mcl.mjs` 及其现有测试保持 legacy 行为；新增测试只验证轻量契约

## 验证命令

```bash
node scripts/mcl.mjs check-all --strict
node --test scripts/tests/*.test.mjs
python3 scripts/validate_platform.py
node scripts/check_markdown_links.mjs
node scripts/scan_repository.mjs
```

不运行 Viewer、Editor 构建或浏览器 E2E，因为本 Change 不修改产品源码或公共行为。

## 提交与交付

- 分支：`codex/mf-18-mcl-lightweight`
- Commit：`docs(mcl): simplify lifecycle and issue contract`
- PR：一个主要目标，`Closes #18`
- 回退：revert squash commit；MF-1 历史档案不变

## 停止条件

- legacy MF-1 校验出现不可解释漂移；
- Issue Contract 无法由模板表达；
- 改动意外触及产品运行时代码；
- 分支保护或必需 Gate 需要扩大用户授权。
