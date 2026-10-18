# Metaflow 文档中心

这里汇总 Metaflow Viewer、Editor、资源索引、发布维护和历史审计资料。根目录 [README](../README.md) 用于快速了解项目；具体操作与当前契约以本目录的现行文档和机器事实源为准。

## 产品全景入口

这里汇总 Metaflow 的产品概览、Viewer／Editor 操作手册、资源索引、发布维护与历史资料。先从 [八产品全景](../README.md#产品全景) 或 [项目概览](getting-started/overview.md) 选择工具；具体操作与当前契约以本目录的现行文档和机器事实源为准。

Studio、Convert、Manage、App、Daily 的入口与成熟度随各产品分别说明；Director 的线上 ACG 实验见 [使用边界与构建](../metaflow-director/README.md)。Nav 等方向见 [扩展与插件](../README.md#扩展与插件方向)，原型和规划通过对应任务跟进。

## 按读者进入

### 产品使用者

完成“理解项目 → 启动产品 → 从 Editor 进入稳定 Viewer route”的主线：

1. [项目概览](getting-started/overview.md)
2. [Viewer 快速开始](getting-started/viewer.md) 或 [Editor 快速开始](getting-started/editor.md)
3. [从 Editor 到 Viewer](guides/editor-to-viewer.md)

### 新开发者

先建立源码、生成物和运行链路的共同认知，再选择定向检查：

1. [仓库地图](reference/repository-map.md)
2. [开发与验证](maintenance/development.md)
3. [整体架构](concepts/architecture.md)
4. [资源加载链路](concepts/resource-loading.md)

### 维护者与 AI

先判断事实源和历史边界，再实施同步、发布或部署：

1. [兼容边界与版本事实源](reference/compatibility-and-version-sources.md)
2. [上游同步](maintenance/upstream-sync.md)
3. [版本与发布](maintenance/versioning-and-release.md)
4. [部署](maintenance/deployment.md)
5. [历史资料入口](history/README.md)

## 当前代码与发布基线

**2026-10-19 现行发布：** Viewer `5.22.0`（SuperSplat Viewer `1.37.0` / PlayCanvas `2.23.0`）；Editor `1.1 / 1.1.0`；资源索引 schema `1.2`、100 项。已回读线上与 [版本元数据](../metadata/version-history.json)，发布与验收见 [MF-151 记录](changes/151-viewer-upstream-v1.37.0/verification.md)。

### 2026-10-18 文档快照（历史保留）

> 以下表格及恢复过程按原文保留；其中的“当前”“最新”指相应历史阶段，现行发布以上方 2026-10-19 更新为准。

| 产品 | 当前值 | 上游基线 | 唯一事实来源 |
|---|---|---|---|
| Viewer | `5.21.11`；package `5.21.11` | SuperSplat Viewer `1.35.2` / PlayCanvas `2.22.4` | [`metadata/version-history.json`](../metadata/version-history.json) |
| Editor | `1.1`；app `1.1.0` | SuperSplat Editor `2.28.0` | [`metadata/editor-version-history.json`](../metadata/editor-version-history.json) |
| 资源索引 | schema `1.2`，100 项资源 | 不适用 | [`data/index.json`](../data/index.json) |

以上为 2026-10-18 核对的发布摘要；Viewer 当前发布证据见 [MF-142 核验](changes/142-loading-progress/verification.md)，产品版本与历史以表中机器来源为准。各产品独立记录版本，Director 实验依赖不能作为 Editor 正式版本。旧发布恢复与阶段审计保留在 [历史资料入口](history/README.md)，不从旧 README 或目录名推断当前状态。

### 既有基线与恢复记录（历史保留）

> 下列原文完整保留此前的版本与恢复过程；当时的“当前”值不代表最新发布，请以上方 2026-10-18 摘要和机器事实源为准。

| 产品 | 当前值 | 上游基线 | 唯一事实来源 |
|---|---|---|---|
| Viewer | `5.21.10`；package `5.21.10` | SuperSplat Viewer `1.35.2` / PlayCanvas `2.22.4` | [`metadata/version-history.json`](../metadata/version-history.json) |
| Editor | `1.1`；app `1.1.0` | SuperSplat Editor `2.28.0` | [`metadata/editor-version-history.json`](../metadata/editor-version-history.json) |
| 资源索引 | schema `1.2` | 不适用 | [`data/index.json`](../data/index.json) |

这些值只是便于定位的当前摘要；5.21.10 发布状态见 [MF-139 核验](changes/139-viewer-safari-loading/verification.md)。Viewer v1.29.1 运行时以产品 SHA `26e311c` 合并；`viewer-v5.19.0` prepare 在部署前失败，production 从未变化。`5.19.1` 以 recovery SHA `534b013` 为产品记录，通过 D2 controlled Prepare 后使用经授权的精确 D2 CLI/API fallback 发布；`5.19.2` 以 analytics/release 修复 SHA `92d11b0` 恢复 production endpoint，并把 endpoint 纳入构建硬失败和 release smoke。`5.18a / 5.18.0` 是保留的最后一个 Viewer 双轨历史状态，`5.18.1` 是首个后续完整 SemVer 发布。发生冲突时，不用 README 或目录名覆盖机器事实源。

## 文档状态

| 状态 | 含义 |
|---|---|
| 现行 | 与当前代码、数据或维护契约保持一致；相关行为变化时必须同步 |
| 指南 | 围绕一个任务给出推荐路径；需要结合实际风险和范围 |
| 事实参考 | 从源码、schema 或机器元数据整理的可查摘要；权威来源会在页面顶部列出 |
| 历史资料 | 保存当时方案、状态和证据；不定义当前行为 |
| 审计专用 | 仅在显式审计模式读取或生成，不属于日常交付 |

## 快速开始

| 文档 | 状态 | 解决的问题 |
|---|---|---|
| [项目概览](getting-started/overview.md) | 现行 | Viewer、Editor、data 和发布链路如何组成一个产品 |
| [八产品职责与入口](getting-started/overview.md#八条产品线) | 现行 | Viewer、Editor、Convert、Manage、Studio、Director、App、Daily 的分工与成熟度 |
| [Viewer 快速开始](getting-started/viewer.md) | 现行 | 如何在本地用 SPA fallback 打开稳定 route |
| [Editor 快速开始](getting-started/editor.md) | 现行 | 当前 Editor 源码在哪里，怎样运行和构建 |

## 操作指南

| 文档 | 状态 | 解决的问题 |
|---|---|---|
| [从 Editor 到 Viewer](guides/editor-to-viewer.md) | 指南 | 如何导出 SOG/settings、生成 index 并验证稳定 route |
| [添加并发布资源](guides/add-publish-resource.md) | 指南 | 常规、大型和结构性资源分别走什么最小流程 |
| [配置 Viewer](guides/configure-viewer.md) | 指南 | 如何组合 route、URL 开关与 settings v2 |
| [嵌入与分享](guides/embed-share.md) | 指南 | 如何选择稳定链接、直链与 iframe，并处理 cache |
| [调试与性能分析](guides/debug-and-profile.md) | 指南 | 如何分离 route、下载、渲染、LOD、碰撞和遥测问题 |

## 概念

| 文档 | 状态 | 解释的关系 |
|---|---|---|
| [整体架构](concepts/architecture.md) | 现行 | 源码、构建、资源和静态运行时如何连接 |
| [资源加载链路](concepts/resource-loading.md) | 现行 | route/query、index、settings、模型和首帧的顺序 |
| [版本、上游与本地改动](concepts/version-upstream-local.md) | 现行 | 产品版本、上游基线、本地定制和审计历史为何分开 |

## 事实参考

| 文档 | 状态 | 查什么 |
|---|---|---|
| [仓库地图](reference/repository-map.md) | 事实参考 | 活跃源码、生成物、历史快照和所有权 |
| [Viewer URL 参数](reference/viewer-url-parameters.md) | 事实参考 | 当前参数、route/query 的实际优先级和编码规则 |
| [Viewer settings schema](reference/viewer-settings-schema.md) | 事实参考 | v1/v2、必需字段、Editor 导出限制和 JSONC 边界 |
| [资源索引 schema](reference/resource-index.md) | 事实参考 | `data/index.json` 字段、生成优先级和可索引模型 |
| [Editor 导出契约](reference/editor-export-contract.md) | 事实参考 | HTML、Package、legacy ZIP、settings-only 和模型导出 |
| [兼容边界与版本事实源](reference/compatibility-and-version-sources.md) | 事实参考 | 哪个文件回答当前版本、兼容范围和发布状态 |

## 维护

| 文档 | 状态 | 解决的问题 |
|---|---|---|
| [开发与验证](maintenance/development.md) | 现行 | 按路径选择最小可信本地检查 |
| [上游同步](maintenance/upstream-sync.md) | 指南 | 如何三方比较并处理本地定制 |
| [版本与发布](maintenance/versioning-and-release.md) | 现行 | 何时提升版本，如何更新 Version History 与 Ledger |
| [部署](maintenance/deployment.md) | 现行 | Viewer、data、Editor 镜像如何进入 Netlify publish 目录 |
| [故障排查](maintenance/troubleshooting.md) | 指南 | 根据症状选择最先核对的层级 |
| [文档维护规范](maintenance/documentation.md) | 现行 | 如何保持信息架构、事实来源、链接和历史边界 |

## 历史与深入资料

从 [历史资料入口](history/README.md) 判断资料是否仍然适用。常用深入入口：

- [Change 状态与历史注册表](changes/README.md)
- [MCL 模板使用说明](templates/mcl/README.md)
- [Viewer 逐提交变更总账](metaflow-viewer-change-ledger.md)
- [Editor 变更总账](metaflow-editor-change-ledger.md)
- [2026-08-10 SuperSplat 三基线独立审查](history/upstream-reviews/2026-08-10/README.md)
- [MCL v1.0 candidate](metaflow-change-lifecycle-v1.0.md)
- [Analytics 专项资料](analytics-implementation.md)

发现文档和实现不一致时，以当前源码、schema、机器元数据和可重复验证为证据，同时修正文档；不要静默改写历史正文中的当时事实。
