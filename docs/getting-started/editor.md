# Editor 快速开始

当前 Editor 源码在 `supersplat-v2.28.0/`，发布产物在 `metaflow-editor/`。修改功能时编辑前者；不要直接修改后者的 bundle 来代替源码变更。

## 前置条件

- Node.js `20.19.0` 或更高版本；
- npm；
- 支持 WebGL/WebGPU 的现代浏览器。

## 本地运行

```bash
cd supersplat-v2.28.0
npm ci
npm run develop
```

默认在 `http://localhost:3000` 启动。若端口已被 Viewer 使用，请先停止另一个服务。

构建与 lint：

```bash
npm run lint
npm run build
```

构建结果位于 `supersplat-v2.28.0/dist/`。这一步不会更新仓库中的 `metaflow-editor/`，Netlify 也不会自动读取 `dist/`；Editor 发布必须按 [部署说明](../maintenance/deployment.md#editor-release-staging) 显式预览并执行 `dist → metaflow-editor` staging。

## 基本工作流

1. 导入 `.ply`、`.splat`、`.sog`、`.spz` 或支持的项目文件。
2. 检查坐标、裁剪、外观、相机姿态和动画。
3. 根据用途选择导出：模型、SOG、Viewer HTML/ZIP，或只导出 `settings.json`。
4. 若资源要进入 Metaflow 路由，不直接上传一份自包含 HTML；按 [Editor 到 Viewer](../guides/editor-to-viewer.md) 分别管理模型、settings 和 index 元数据。

## 当前定制

Metaflow Editor `1.1` 基于 SuperSplat Editor `2.28.0`，保留：

- 100000 帧时间轴上限；
- Metaflow 品牌与版本面；
- 上游 Viewer HTML/ZIP 导出；
- `Metaflow legacy ZIP`；
- 直接导出 `settings.json`；
- 大项目流式 ZIP 读取。

完整、可核对的契约见 [Editor 导出契约](../reference/editor-export-contract.md)。

当前 Viewer export 会生成相机、动画和后处理，但固定写入空的 `annotations`；Editor 尚不能完成标注的创作与往返。需要标注时先读 [Viewer settings schema](../reference/viewer-settings-schema.md#标注及当前-editor-限制)。
