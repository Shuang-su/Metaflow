# MF-16 路径级 CI 实施计划

> **历史完成计划。** 下方“实施中”和 Hosted Gate 步骤保留为当时执行记录；Issue #16 已完成，托管 `required / gate` 后由 MCL Revision 6 取消。不要把本文当成当前 CI 操作手册；先读 [`../README.md`](../README.md)。

## 1. 当前状态

实施中。Issue #16 是状态真相源；本文件只记录文件步骤与验证命令。

## 2. 文件步骤

1. 将 `metadata/components.json` 升级到 ownership-only schema `1.1`，补齐 `docs/**` 与根文件所有权。
2. 新增 `metadata/ci-routing.json` 和 `metadata/schemas/ci-routing.schema.json`。
3. 新增 `scripts/ci-routing.mjs`，实现 manifest 校验、ACMRD/rename 分类、base/head union、fail-closed 和 aggregate Gate 判定。
4. 更新 `scripts/mcl.mjs`，兼容 ownership schema `1.0` 与 `1.1`，但不再从 `1.1` 读取 checks。
5. 新增 `scripts/tests/ci-routing.test.mjs`，覆盖正向、负向、混合、删除/重命名和 Gate 结论。
6. 更新 `.github/workflows/ci.yml`：工作流始终启动；所有具体检查使用内部条件；保留 `required / gate`。
7. 在 PR Hosted CI 上确认本 Change 只命中治理相关路线，不误跑产品 job；后续中文文档 PR 再验证纯 docs 路线。

## 3. 定向验证

本地执行：

```bash
node --check scripts/ci-routing.mjs
node scripts/ci-routing.mjs validate
node --test scripts/tests/*.test.mjs
python3 -m unittest discover -s scripts/tests -p 'test_validate_platform.py' -v
node scripts/mcl.mjs check-all --strict
node scripts/mcl.mjs validate-registry
python3 scripts/validate_platform.py
node scripts/check_markdown_links.mjs
node scripts/scan_repository.mjs
git diff --check origin/main...HEAD
```

附加路由样例：

```bash
node scripts/ci-routing.mjs route README.md
node scripts/ci-routing.mjs route metaflow-viewer/src/main.ts
node scripts/ci-routing.mjs route supersplat-v2.28.0/package-lock.json
node scripts/ci-routing.mjs route future-product/src/main.ts
```

最后一个命令必须返回非零。工作流 YAML 只做语法与 pinned-action 校验；不运行 Viewer/Editor 本地 build、完整 E2E 或部署。

## 4. Hosted 验收

- Draft PR 关联并关闭 #16；
- 记录 exact Head、Actions run 与每个 job 的 run/skip 结果；
- `required / gate` 成功；
- 无未解决 review thread；
- Ready 后按 Ruleset squash merge；
- 回填 Issue 的验收勾选、PR、squash commit、验证与遗留项。

“docs-only 只运行 docs + gate”在随后的中文文档 PR 上完成最终实证；在此之前 #16 可合并实现，但 Issue 维持 In Review，直到该实证回填。
