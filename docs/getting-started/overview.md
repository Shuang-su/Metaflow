# 项目概览

Metaflow 围绕 3D Gaussian Splatting（3DGS）提供处理、编辑、编排、浏览与成片工具，并包含原生 App 和研究内容产品。先按任务选择工具，再根据它的发布状态和支持范围进入；在线体验与当前状态汇总见 [项目首页](../../README.md#产品全景)。

## 八条产品线

产品划分来自 [MF-100](https://github.com/Shuang-su/Metaflow/issues/100)。产品职责与代码组件是不同维度：例如 Director 有独立摄影定位，当前公开 ACG 入口仍随 Viewer 发布；App 则在独立原生仓库实现。

| 产品 | 负责什么 | 当前入口与边界 |
|---|---|---|
| Viewer | 模型加载、浏览、漫游、嵌入与分享 | 已发布 Web 产品；[本地运行](viewer.md)，消费已支持的模型与场景配置 |
| Editor | 模型清理、裁剪、变换、颜色调整与既有导出 | 已发布；[操作与开发](editor.md)，导出能力以当前版本为准 |
| Convert | 格式转换、压缩、LOD、体素／碰撞处理及失败报告 | 已有 [CLI／工具工作](https://github.com/Shuang-su/splat-transform)，统一产品入口尚未形成 |
| Manage | 素材引用、产物、草稿、版本、标签与发布入口 | [MF-98 首期规划](https://github.com/Shuang-su/Metaflow/issues/98)；现有 data 目录仍承担公开资源存放，内部管理产品尚待实现 |
| Studio | 标点、相机、动画、环境与展示编排 | [MF-58 本地原型与内部交付](https://github.com/Shuang-su/Metaflow/issues/58)；尚无正式公开入口，作者工程与运行配置分别处理 |
| Director | 取景、镜头、景深、照片与视频 | [MF-106 线上 ACG 实验](https://github.com/Shuang-su/Metaflow/issues/106)；完整摄影与光学研究继续由 [MF-62](https://github.com/Shuang-su/Metaflow/issues/62) 跟踪 |
| App | 原生平台文件入口、生命周期、渲染与设备输入 | [NextNews HarmonyOS](https://github.com/Shuang-su/NextNews/blob/main/docs/harmonyos/README.md) 已有阶段实现，完整发布验收未完成；[MF-102](https://github.com/Shuang-su/Metaflow/issues/102) 承接后续 |
| Daily | 有来源的论文、工具与专题内容 | [内容仓库](https://github.com/Shuang-su/gaussian-splatting-daily)可用；[门户与发布任务](https://github.com/Shuang-su/gaussian-splatting-daily/issues/33)独立推进 |

Convert、Editor 产出适用资产；Studio 面向展示编排，Director 面向摄影成片；Viewer 和 App 按各自支持范围消费资产与体验配置。Manage 规划负责引用与发布管理，各工具仍可直接接收适用本地输入。产品职责图见 [首页协作关系](../../README.md#产品如何协作)，交接责任继续由 [MF-99](https://github.com/Shuang-su/Metaflow/issues/99) 定义，不预设统一工程格式。

### 扩展与插件

Nav、粒子开场、动态大气和 XR 是产品上的扩展方向，进展入口见 [首页扩展表](../../README.md#扩展与插件方向)。Nav 由 Studio 作者侧和 Viewer 运行侧协作，当前接入与实景验收由 [MF-97](https://github.com/Shuang-su/Metaflow/issues/97) 跟踪。通用插件运行时、SDK 与分发机制仍待决策；各实验分别验收。

App 是独立原生产品。当前 HarmonyOS 路线采用 ArkTS／ArkUI、C++17／OpenGL ES 3.0；Web Viewer 与原生端分别验证格式、画质、输入和生命周期。Web 扩展在 App 中的适用范围需要另行声明，具体限制以 [原生开发与验收记录](https://github.com/Shuang-su/NextNews/blob/main/docs/harmonyos/README.md) 为准。

## 一条完整链路

以下 Editor → data → Viewer 流程已经落地，可作为首次使用的起点。它覆盖当前公开资源工作流；其他产品的规划交接按各自任务继续推进。

```mermaid
flowchart LR
    A["采集或训练产物"] --> B["Metaflow Editor"]
    B --> C["模型与 settings.json"]
    C --> D["data/ 资源目录"]
    D --> E["generate_index.py"]
    E --> F["data/index.json"]
    F --> G["Metaflow Viewer 路由"]
    G --> H["静态发布与分享"]
```

操作步骤见 [从 Editor 到 Viewer](../guides/editor-to-viewer.md)。

## 三个核心部分

以下保留已落地链路中的源码与生成物边界。

### Viewer

`metaflow-viewer/` 是当前 Viewer 源码，按 URL 路由或显式查询参数加载模型、settings、环境与碰撞资源。`metaflow-director/` 承载已发布 ACG 单文件 SOG／PLY 的实验摄影入口，要求 WebGPU 和浮点渲染能力；构建与限制见 [Director 说明](../../metaflow-director/README.md)。

### Editor

`supersplat-v2.28.0/` 是当前可重建 Editor 的源码；`metaflow-editor/` 是发布到 `/editor` 的构建产物。版本和依赖由 [`metadata/editor-version-history.json`](../../metadata/editor-version-history.json) 记录。

Editor 的 `npm run build` 只生成 `supersplat-v2.28.0/dist/`；正式发布前还要显式检查并同步到 tracked `metaflow-editor/` 镜像。Netlify 不会自动读取源码目录里的 dist，步骤见 [部署](../maintenance/deployment.md)。

### 数据与索引

`data/` 保存发布资源和生成的 `index.json`。Viewer 根据 index 中的 `route`、`aliases` 和 `files` 解析资源。模型、settings 与派生产物的准备和验证见 [添加并发布资源](../guides/add-publish-resource.md)。

## 选择下一步

- 浏览与分享现有资源：[Viewer 快速开始](viewer.md) → [嵌入与分享](../guides/embed-share.md)。
- 编辑或导出场景：[Editor 快速开始](editor.md) → [Editor 到 Viewer](../guides/editor-to-viewer.md)。
- 拍摄现有 ACG 资源：[Director 示例](https://metaflow.shuang-su.com/acg/szcaf15/honkai_star_rail-tribbie/director) → [使用边界与构建](../../metaflow-director/README.md)。
- 参与研发：[仓库地图](../reference/repository-map.md) → [开发与验证](../maintenance/development.md)。
- 跟进原型、原生端或其他产品：从上方产品表进入对应仓库与任务。

## 当前版本

2026-10-18 核对的发布摘要：

- Viewer：展示与 package 均为 `5.21.11`，上游 SuperSplat Viewer `1.35.2`、PlayCanvas `2.22.4`；见 [版本真源](../../metadata/version-history.json)与[发布核验](../changes/142-loading-progress/verification.md)。
- Editor：展示 `1.1`、app `1.1.0`，上游 SuperSplat Editor `2.28.0`；见 [版本真源](../../metadata/editor-version-history.json)。
- 资源索引：schema `1.2`、100 项资源；见 [`data/index.json`](../../data/index.json)。

版本摘要只用于定位；机器来源、实际发布和各产品验收分别核对，规则见 [兼容边界与版本事实源](../reference/compatibility-and-version-sources.md)。
