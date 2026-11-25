# Viewer 快速开始

本页让你在本地启动当前 Metaflow Viewer，并通过资源路由打开一个场景。

## 默认开发入口

按主 README 的 partial clone 和 sparse checkout 获取开发文件。在 `metaflow-viewer` 运行 `npm ci`、`npm run build`、`npm start`。依赖安装完成后可离线访问 `http://localhost:3000/e2e-fixture?noanalytics`，转动模型、打开设置或切换相机。需要持续构建时运行 `npm run develop`。

## 按路由取数据

从仓库根运行以下命令，再通过本地 Viewer 访问 `/sztu/fes/top10-26`。按锁文件恢复整个资源目录（含分块、环境、碰撞和设置），也支持 canonical route 的别名。同版可以继续添加其他场景。

```bash
python3 scripts/materialize-data.py --route /top10-26 --output metaflow-viewer/public/data
```

`metadata/data-releases/active.lock.json` 对应本代码分支。要检查其他已发布数据版本，指定 `--lock metadata/data-releases/5.25.1.lock.json` 和独立的输出目录。已有本地数据根目录时使用 `--source /path/to/data`，加 `--offline` 可要求每个文件都由本地验证。完整构建使用 `--all`，要求干净目标并按清单逐文件核对摘要。正式发布使用对应版本的 Viewer 及其宿主页面。

默认开发测试使用 `npm run test:dev`。完整的 `npm test` 额外检查 Git 发布历史。检验已完整恢复到仓库根 data 的实物时，可使用 `METAFLOW_FULL_DATA=1 npm test`。

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
