# 项目概览

Metaflow 是一套围绕 3D Gaussian Splatting 的仓库内工作流：在 Editor 中检查、裁剪和配置场景，把模型与 `settings.json` 放入 `data/`，生成路由索引，再由 Viewer 通过稳定 URL 加载和分享。

## 一条完整链路

```mermaid
flowchart LR
    A["采集或训练产物"] --> B["Metaflow Editor"]
    B --> C["模型与 settings.json"]
    C --> D["data/ 资源目录"]
    D --> E["generate_index.py"]
    E --> F["data/index.json"]
    F --> G["Metaflow Viewer 路由"]
    G --> H["Netlify 静态发布与分享"]
```

## 三个核心部分

### Viewer

`metaflow-viewer/` 是当前 Viewer 源码。它读取 URL 路由或显式查询参数，加载模型、settings、环境与碰撞资源。当前版本与上游基线见 [`metadata/version-history.json`](../../metadata/version-history.json)。

### Editor

`supersplat-v2.28.0/` 是当前可重建 Editor 的源码；`metaflow-editor/` 是发布到 `/editor` 的构建产物。两者不能混为一个可编辑目录。版本和依赖见 [`metadata/editor-version-history.json`](../../metadata/editor-version-history.json)。

Editor 的 `npm run build` 只生成 `supersplat-v2.28.0/dist/`；正式发布前还要显式检查并同步到 tracked `metaflow-editor/` 镜像。Netlify 不会自动读取源码目录里的 dist，步骤见 [部署](../maintenance/deployment.md)。

### 数据与索引

`data/` 保存发布资源和生成的 `index.json`。Viewer 路由不是硬编码页面清单，而是根据 index 中的 `route`、`aliases` 和 `files` 解析资源。

## 选择下一步

- 只想查看现有资源：阅读 [Viewer 快速开始](viewer.md)。
- 要编辑或导出场景：阅读 [Editor 快速开始](editor.md)。
- 要完成发布闭环：阅读 [Editor 到 Viewer](../guides/editor-to-viewer.md)。
- 要理解源码与生成物边界：阅读 [仓库地图](../reference/repository-map.md)。
- 要核对版本、上游与运行时兼容：阅读 [兼容边界与版本事实源](../reference/compatibility-and-version-sources.md)。

## 当前版本

- Viewer：展示版本与 npm package 均为 `5.18.1`，上游 SuperSplat Viewer `1.26.2`。
- Editor：Metaflow `1.1`，上游 SuperSplat Editor `2.28.0`。
- Index：schema `1.2`。

不要从文件夹名、旧 README 或历史审计推断当前版本；使用上述 metadata 与 index 文件。发布语义见 [版本与发布](../maintenance/versioning-and-release.md)。
