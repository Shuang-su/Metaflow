# 开发与验证

## 环境

仓库统一 Node.js 基线由 `.nvmrc` 定义，当前为 `20.19.0`。不同 package 的 `engines` 可能更宽，但跨 Viewer/Editor 工作时使用根基线。

```bash
nvm use
```

依赖安装使用 `npm ci`，不要用 `npm install` 无意重写 lockfile。

## Viewer

```bash
cd metaflow-viewer
npm ci
npm run develop
```

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

构建输出位于 `dist/`。发布镜像更新必须核对 `metaflow-editor/version.json` 与 Editor version history。

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

## 路径级 CI

提交后可预览 route：

```bash
node scripts/ci-routing.mjs route --base origin/main
```

输出中的 `checks` 是应运行 job 的并集；`unowned` 或 `unrouted` 非空必须先修复。不要通过修改 router 缩小本 PR 的检查：分类器会对 base/head 配置取并集。

## 大资源与工作区

- 不为文档或治理任务拉取全部 data/LFS。
- 大型临时内容放在仓库忽略的 `.codex-work/`，不提交。
- 不删除或覆盖不属于当前任务的未跟踪目录。
- 版本化 snapshot 是只读参考；活跃开发路径见 [仓库地图](../reference/repository-map.md)。
