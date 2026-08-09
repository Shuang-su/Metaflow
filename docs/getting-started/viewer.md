# Viewer 快速开始

本页让你在本地启动当前 Metaflow Viewer，并通过资源路由打开一个场景。

## 前置条件

- Node.js `20.19.0`；仓库根 `.nvmrc` 是统一基线。
- npm 可用。
- 若要加载完整资源，Git LFS 对象应已拉取；只做界面或小 fixture 开发时不必下载全部大文件。

## 安装与启动

```bash
cd metaflow-viewer
npm ci
mkdir -p public
# 仅在 public/data 尚不存在时执行
ln -s ../../data public/data
npm run develop
```

`public/` 是忽略的构建目录；本地链接让静态服务器读取仓库根的 `data/`。如果 `public/data` 已由其他流程生成或链接，不要覆盖它。Netlify 发布不依赖此链接，而是把数据同步为 publish 副本。

`develop` 同时启动 Rollup watch 和静态服务器。默认访问：

```text
http://localhost:3000
```

只验证生产构建时：

```bash
npm run build
npm run serve
```

## 打开资源

优先使用 `data/index.json` 中的稳定 route，例如：

```text
http://localhost:3000/acg/yzx/yzx
```

也可以绕过 index，显式传入模型与 settings：

```text
http://localhost:3000/?content=/data/path/model.sog&settings=/data/path/settings.json
```

包含空格或中文的参数值必须进行 URL 编码。完整参数见 [Viewer URL 与 settings](../reference/viewer-url-settings.md)。

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
- [资源加载链路](../concepts/resource-loading.md)
