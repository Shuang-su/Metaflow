# Editor 快速开始

Editor **1.3.1 已于 2026-10-22 通过 Netlify CLI 发布**；线上 version.json 和部署记录为实际运行身份。GitHub 推送/合并仍待账户访问恢复。默认版源码为 `supersplat-v3.5.2/`，镜像为 `metaflow-editor/`，路径 `/editor/`；WebGL2 兼容版源码为 `supersplat-v2.32.5/`，镜像为 `metaflow-editor-legacy/`，路径 `/editor-legacy/`。两版都保留粒子视频。修改功能应编辑源码，再显式构建与暂存。

## 前置条件

- Node.js `22.20.0`（两个 Editor 目录各有 `.nvmrc`，支持 `>=22.13.0 <23`）；
- npm；
- 默认版需要 WebGPU；兼容版需要 WebGL2。视频另需浏览器支持目标编码器。

## 本地运行

```bash
cd supersplat-v3.5.2
npm ci
npm run develop
```

默认在 `http://localhost:3000` 启动。若端口已被 Viewer 使用，请先停止另一个服务。

构建与 lint：

```bash
npm run lint
npm run build
```

构建结果位于 `supersplat-v3.5.2/dist/`。这一步不会更新仓库中的 `metaflow-editor/`，Netlify 也不会自动读取 `dist/`；Editor 发布必须按 [部署说明](../maintenance/deployment.md#editor-release-staging) 显式预览并执行 `dist → metaflow-editor` staging。

## 基本工作流

1. 导入 `.ply`、`.splat`、`.sog`、`.spz` 或支持的项目文件。
2. 检查坐标、裁剪、外观、相机姿态和动画。
3. 根据用途选择导出：模型、SOG、Viewer HTML/ZIP，或只导出 `settings.json`。
4. 若资源要进入 Metaflow 路由，不直接上传一份自包含 HTML；按 [Editor 到 Viewer](../guides/editor-to-viewer.md) 分别管理模型、settings 和 index 元数据。

## 当前定制

Metaflow Editor `1.3.1` 默认采用 SuperSplat `3.5.2`，兼容版采用 `2.32.5`。两版保留：

- 100000 帧时间轴上限；
- Metaflow 品牌与版本面；
- 上游 Viewer HTML/ZIP 导出；
- `Metaflow legacy ZIP`；
- 直接导出 `settings.json`；
- 大项目流式 ZIP 读取；
- 默认关闭的粒子视频，可选人物 `characterSog` 或场景 `streamingScene`，确定性逐帧捕获、进度、取消和失败恢复。

粒子视频只支持静态 Gaussian 的普通透视输出；短于完整开场时会提示。普通视频和 360° 视频仍可关闭粒子后使用。操作说明见 [粒子视频](../guides/editor-particle-video.md)。

完整、可核对的契约见 [Editor 导出契约](../reference/editor-export-contract.md)。

当前 Viewer export 会生成相机、动画和后处理，但固定写入空的 `annotations`；Editor 尚不能完成标注的创作与往返。需要标注时先读 [Viewer settings schema](../reference/viewer-settings-schema.md#标注及当前-editor-限制)。

## 1.3.x 背景填充

新版在 Appearance 面板、兼容版在 Settings 面板，点击原来的背景色块打开填充弹层。选择纯色、线性或径向；点击渐变条添加色标，拖动调整位置，选择色标后可编辑 HEX、RGB、透明度和百分比。至少保留两个色标。线性可设置角度或反转；径向可调整中心和横纵范围。

每次拖动是一条撤销记录。切回纯色后再选渐变会恢复刚才的配色；保存工程会同时保存背景。透明图片/视频导出会跳过背景。

Editor 构建现在也需要同仓库 `metaflow-viewer/` 的锁定依赖：首次先在该目录执行 `npm ci`，再构建 Editor。构建会按需生成自包含 Viewer，并记录 `metadata/editor-export-viewer.json`；不要手工编辑该指纹文件。
