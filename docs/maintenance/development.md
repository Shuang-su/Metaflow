# 开发与验证

## 环境

仓库统一 Node.js 基线由 `.nvmrc` 定义，当前为 `20.19.0`。不同 package 的 `engines` 可能更宽，但跨 Viewer/Editor 工作时使用根基线。

```bash
nvm use
```

依赖安装使用 `npm ci`，不要用 `npm install` 无意重写 lockfile。

## 依赖安全与更新

仓库保留 Dependabot alerts 作为只读漏洞信号，但关闭由 Dependabot 自动创建
security/version update PR 的能力。原因是 GitHub 的 security updates 会扫描默认分支
dependency graph，曾绕过 version-update 目录边界并修改不可变 reference snapshot。

- `references/**`、带版本号的历史 SuperSplat 目录和纯上游副本永不做原位依赖升级；
- Viewer 与 Editor 只按当前事实源确定的 active package、manifest 和 lockfile 判断 advisory；
- 每条修复由人工或 Agent 先证明当前 dependency path 和可达性，再用普通 PR 提交最小变更；
- Dependabot alert 不等于自动批准升级，也不能覆盖 reference registry 的内容摘要；
- 若未来重新启用 `.github/dependabot.yml`，平台校验仍会拒绝任何带版本号的
  `supersplat-v*` 或 `supersplat-viewer-v*` npm 目标。

当前人工处置入口为 [MF-2](https://github.com/Shuang-su/Metaflow/issues/2)。

## Viewer

```bash
cd metaflow-viewer
npm ci
npm run watch
```

另一个终端运行 `npx --no-install serve -s public -l 3000`，才能验证深层 route 的 SPA fallback。当前 `npm run develop` 内部服务器没有 `-s`，只用于根路径或直接 query；完整准备见 [Viewer 快速开始](../getting-started/viewer.md)。

定向验证：

```bash
npm test
npm run type:check
npm run build
```

只有 Viewer 源码、公共行为或被路由明确命中的 data 变化才运行浏览器 E2E。

## Editor

```bash
cd supersplat-v2.28.0
npm ci
npm run develop
```

定向验证：

```bash
npm run lint
npm run build
```

构建输出位于 `dist/`，不会自动更新 tracked `metaflow-editor/`。发布镜像必须按 [部署说明](deployment.md#editor-release-staging) 显式同步，并核对 `metaflow-editor/version.json` 与 Editor Version History。

## 数据

```bash
python3 scripts/generate_index.py
python3 scripts/validate_data.py
```

完整 data checkout 可追加 `--check-files`。生成器会重写 index 与版本镜像，先检查 diff 再提交。

## 文档与治理

```bash
node scripts/check_markdown_links.mjs
node scripts/scan_repository.mjs
node scripts/mcl.mjs check-all --strict
node scripts/ci-routing.mjs validate
python3 scripts/validate_platform.py
git diff --check
```

纯文档通常只需前两个和 diff；MCL、模板、workflow、router 等治理变化再运行治理检查。

## 路径级本地检查

实施前或提交前可预览建议检查：

```bash
node scripts/ci-routing.mjs route --base origin/main
```

输出中的 `checks` 是建议运行检查的并集；`unowned` 或 `unrouted` 非空必须先修复。不要通过修改 router 缩小本次验证：分类器会对 base/head 配置取并集。

普通 GitHub CI 只通过 `workflow_dispatch` 按需运行，不是所有 PR 或 direct commit 的完成条件。把实际本地命令、结果和未运行项记录在 PR、Issue 或直接提交交付中。

## 大资源与工作区

- 不为文档或治理任务拉取全部 data/LFS。
- 大型临时内容放在仓库忽略的 `.codex-work/`，不提交。
- 不删除或覆盖不属于当前任务的未跟踪目录。
- 版本化 snapshot 是只读参考；活跃开发路径见 [仓库地图](../reference/repository-map.md)。
