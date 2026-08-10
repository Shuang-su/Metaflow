# 中文文档体系实施计划

> **历史完成计划。** 本文记录 Issue #23 / PR #24 当时的 20 篇交付与 Hosted `required / gate` 实证；它不是当前操作计划。MCL Revision 6 已取消普通 PR/push 的必需 Gate，后续文档维护以 [`../maintenance/documentation.md`](../maintenance/documentation.md) 和实时 Issue 为准。

## 1. 状态与边界

Issue #23 是任务状态真相源。本计划只记录文件步骤和验证命令。变更限于 Markdown，不修改运行时、数据、依赖和部署配置。

## 2. 实施步骤

1. 从 `metadata/*-version-history.json`、`data/index.json`、package scripts 和当前源码核对版本与契约。
2. 创建 `docs/README.md` 和五组核心手册，共 20 篇。
3. 把根 README 的首屏改为项目门户；保留原有 Viewer 参考并更新过期事实。
4. 更新 `metaflow-viewer/README.md` 的版本和手册入口。
5. 为 `PROJECT_INDEX.md`、旧 sync comparison、旧 diff audit 增加历史资料提示；不删除原文。
6. 为 active Viewer/Editor ledger 增加当前事实源与核心手册链接。
7. 运行链接、敏感信息、版本事实、文档入口和差异检查。
8. 创建 docs-only PR，验证只运行 classify、documentation checks 与 `required / gate`。
9. squash merge 后回填 #23，并用同一 Actions run 完成 #16 的最终 docs-only 验收。

## 3. 版本事实检查

```bash
node --input-type=module -e "import{readFileSync}from'node:fs';const v=JSON.parse(readFileSync('metadata/version-history.json'));const e=JSON.parse(readFileSync('metadata/editor-version-history.json'));const i=JSON.parse(readFileSync('data/index.json'));console.log(v.current.displayVersion,v.current.appSemver,v.current.upstream.version,e.current.displayVersion,e.current.upstream.version,i.schemaVersion)"
```

预期输出对应：Viewer `5.18a / 5.18.0 / 1.26.2`，Editor `1.1 / 2.28.0`，index schema `1.2`。

## 4. 定向验证

```bash
node scripts/check_markdown_links.mjs
node scripts/scan_repository.mjs
git diff --check origin/main...HEAD
node scripts/ci-routing.mjs route --base origin/main
```

提交后的路由结果必须只有 `docs`，且 `unowned`、`unrouted` 均为空。Hosted CI 必须满足：

- `classify paths`、`documentation checks`、`required / gate` 成功；
- governance、Viewer、Editor、Design、data、reference、release、CodeQL、dependency review 全部 skipped。

不运行 Viewer/Editor build、E2E 或部署。
