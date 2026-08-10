# Viewer 快速开始

本页让你在本地启动当前 Metaflow Viewer，并通过资源路由打开一个场景。

## 前置条件

- Node.js `20.19.0`；仓库根 `.nvmrc` 是统一基线。
- npm 可用。
- 若要加载完整资源，Git LFS 对象应已拉取；只做界面或小 fixture 开发时不必下载全部大文件。

## 安装与准备

```bash
cd metaflow-viewer
npm ci
mkdir -p public
# 仅在 public/data 尚不存在时执行
ln -s ../../data public/data
```

`public/` 是忽略的构建目录；本地链接让静态服务器读取仓库根的 `data/`。如果 `public/data` 已由其他流程生成或链接，不要覆盖它。Netlify 发布不依赖此链接，而是把数据同步为 publish 副本。

## 用 SPA fallback 启动

稳定 route（例如 `/acg/yzx/yzx`）必须让静态服务器把未知路径回退到 `index.html`。当前 package 的 `npm run develop` 使用 `serve public`，没有 `-s`，只适合根路径或直接 query，不能单独验证深层 route。

开发时使用两个终端：

```bash
# 终端 1：持续构建
cd metaflow-viewer
npm run watch

# 终端 2：提供 SPA fallback；--no-install 避免临时下载新工具
cd metaflow-viewer
npx --no-install serve -s public -l 3000
```

默认访问：

```text
http://localhost:3000
```

只验证 production build 时：

```bash
npm run build
npx --no-install serve -s public -l 3000
```

`npm run serve` / `npm start` 仍可用于根路径和显式 `?content=...` 调试，但没有 SPA fallback。

## 打开资源

优先使用 `data/index.json` 中的稳定 route，例如：

```text
http://localhost:3000/acg/yzx/yzx
```

也可以绕过 index，显式传入模型与 settings：

```text
http://localhost:3000/?content=/data/path/model.sog&settings=/data/path/settings.json
```

包含空格或中文的参数值必须进行 URL 编码。`content` 会跳过 route/index，而 route 命中时会覆盖 query 中的 `settings`；完整参数和实际优先级见 [Viewer URL 参数](../reference/viewer-url-parameters.md)。

## 最小验证

1. 页面出现加载进度，而不是立即 404。
2. Network 中 `/data/index.json` 返回 schema `1.2`。
3. route 能在 index 的 `resources[].route` 或 `aliases` 中找到。
4. 场景出现后能切换相机或打开设置。

源码验证命令：

```bash
npm test
npm run type:check
npm run build
```

浏览器 E2E 只在 Viewer 源码或公共行为变化时运行；纯文档变更不需要它。

## 下一步

- [配置 Viewer](../guides/configure-viewer.md)
- [嵌入与分享](../guides/embed-share.md)
- [调试与性能分析](../guides/debug-and-profile.md)
- [资源加载链路](../concepts/resource-loading.md)
