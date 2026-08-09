# MF-16 路径级 CI 规范

## 1. 决策

Metaflow 将组件所有权与 CI 检查路由拆成两个版本化清单：

- `metadata/components.json` 只回答“谁拥有这个路径”；
- `metadata/ci-routing.json` 只回答“这个路径变化需要哪些检查”。

`.github/workflows/ci.yml` 在每个 `pull_request` 和 `main` push 上始终启动，不设置顶层 `paths` / `paths-ignore`。稳定的 Ruleset context 继续是 `required / gate`。

## 2. 数据契约

### 2.1 Ownership registry

`metadata/components.json` 使用 schema `1.1`。每个组件保留：

- `id`、`kind`；
- `ownedPaths`；
- 可选版本事实来源、部署目标和上游信息。

版本 `1.1` 不允许 `checks` 字段。一般 `docs/**`、根文档与仓库级配置归 `platform` 所有；产品和历史快照仍保留各自所有者。读取器继续接受历史版本 `1.0`，以便比较 PR base。

### 2.2 Routing manifest

`metadata/ci-routing.json` 使用 schema `1.0`，顶层包含稳定 check catalog 与 route 列表。每个 route 必须声明：

- 唯一 `id`；
- `category`；
- 至少一个 `includePaths`；
- 显式 `excludePaths`，没有排除项时使用空数组；
- 至少一个 `checks`。

规范 check ID 是 `docs`、`governance`、`viewer`、`editor`、`design`、`data`、`reference`、`release`、`codeql`、`dependency-review`。新增 check 时必须同时修改 manifest、分类器、工作流 job、Gate 与测试。

## 3. 分类算法

`node scripts/ci-routing.mjs route --base <git-ref>` 执行以下步骤：

1. 使用 `git diff --name-status -z --find-renames --diff-filter=ACMRD <base>...HEAD` 读取变更；
2. 对 rename 同时保留旧路径和新路径，对 delete 保留被删除路径；
3. 分别读取 base 与 head 的 ownership 和 routing manifest；
4. 对两个版本匹配结果取并集；
5. 对多路径、多 route、多组件的 checks 取并集；
6. 任一路径没有 owner 或 route 时以非零状态退出。

这意味着同一个 PR 删除或缩小 registry/router 规则时，原规则仍会对本次变更生效。新增路径必须先在 head 配置中获得 owner 和 route，否则 fail closed。

## 4. 路由矩阵

| 类别 | 默认检查 | 说明 |
|---|---|---|
| 文档与文档资源 | `docs` | 链接、敏感信息、意外文件、差异格式 |
| MCL、模板、治理配置 | `governance`，可执行脚本再加 `codeql` | MCL/路由单测、历史兼容、平台配置 |
| 依赖清单与锁文件 | `dependency-review` + 对应组件 | 不把依赖变化伪装成纯文档 |
| Viewer source / 公共行为 | `viewer` + `codeql` | test、typecheck、build、必要 E2E |
| Editor source / 导出契约 | `editor` + `codeql` | lint、build、契约覆盖 |
| 数据、schema、fixture | `data` + 受影响产品 | 当前数据资产由 Viewer 消费；Editor 版本镜像单独路由 |
| Design source | `design` + `codeql` | 纯 Design 文档只走 `docs` |
| Reference snapshot | `reference` | provenance、license、version integrity |
| release / deploy 配置 | `governance` + `release` + 受影响产品 | 静态、无外部写入的 smoke；不部署 |
| 混合变更 | 所有命中检查的并集 | 不运行未命中的组件 job |

## 5. 聚合 Gate

分类 job 输出规范 checks 列表。每个具体 job 只使用 job-level `if`。`required / gate` 通过同一分类器的 `gate` 子命令核对：

- `classify` 必须成功；
- 被选中的 job 必须是 `success`；
- 未被选中的 job 必须是 `skipped`；
- `dependency-review` 只在 PR 事件中要求成功，在 push 中必须跳过。

因此 Gate 同时阻止漏跑和无关 job 误跑，并在所有路径组合下给出确定结论。

## 6. 安全边界与回退

- 分类器只读 Git tree 和仓库清单，不调用外部服务；
- release job 只验证配置，不触发 Netlify、GitHub Release 或 production environment；
- CodeQL 和 Dependency Review 的权限继续按 job 最小化；
- 回退时 revert 本 Change 的 squash commit，Ruleset 的 `required / gate` 名称无需改动。

GitHub 对路径过滤与 skipped required workflow 的约束见[官方说明](https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-workflow-runs/skipping-workflow-runs)。
