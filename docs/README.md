# Metaflow 文档

这里是 Metaflow 的中文文档总入口。项目把 SuperSplat Editor 的编辑能力、资源索引与定制 Viewer 串成一条可维护的 3D Gaussian Splatting 发布链路。

## 先从哪里开始

| 你的目标 | 建议入口 |
|---|---|
| 第一次理解项目 | [项目概览](getting-started/overview.md) |
| 本地运行 Viewer | [Viewer 快速开始](getting-started/viewer.md) |
| 本地运行 Editor | [Editor 快速开始](getting-started/editor.md) |
| 从 Editor 导出并在 Viewer 打开 | [Editor 到 Viewer](guides/editor-to-viewer.md) |
| 添加新资源并发布 | [添加与发布资源](guides/add-publish-resource.md) |
| 排查黑屏、404、配置或 CI 问题 | [故障排查](maintenance/troubleshooting.md) |

## 当前基线

| 产品 | Metaflow 版本 | 上游基线 | 事实来源 |
|---|---|---|---|
| Viewer | `5.18a`（包 `5.18.0`） | SuperSplat Viewer `1.26.2` | [`metadata/version-history.json`](../metadata/version-history.json) |
| Editor | `1.1`（包 `1.1.0`） | SuperSplat Editor `2.28.0` | [`metadata/editor-version-history.json`](../metadata/editor-version-history.json) |
| 资源索引 | schema `1.2` | 不适用 | [`data/index.json`](../data/index.json) |

这些值是当前摘要，不是新的真相源。更新版本时以表中机器可读文件为准。

## 快速开始

- [项目概览](getting-started/overview.md)
- [Viewer 快速开始](getting-started/viewer.md)
- [Editor 快速开始](getting-started/editor.md)

## 操作指南

- [Editor 到 Viewer](guides/editor-to-viewer.md)
- [添加与发布资源](guides/add-publish-resource.md)
- [配置 Viewer](guides/configure-viewer.md)
- [嵌入与分享](guides/embed-share.md)

## 概念

- [整体架构](concepts/architecture.md)
- [资源加载链路](concepts/resource-loading.md)
- [版本、上游与本地改动](concepts/version-upstream-local.md)

## 参考

- [仓库地图](reference/repository-map.md)
- [Viewer URL 与 settings](reference/viewer-url-settings.md)
- [资源索引](reference/resource-index.md)
- [Editor 导出契约](reference/editor-export-contract.md)

## 维护

- [开发与验证](maintenance/development.md)
- [上游同步](maintenance/upstream-sync.md)
- [版本、发布与部署](maintenance/release-deploy.md)
- [故障排查](maintenance/troubleshooting.md)
- [文档维护规范](maintenance/documentation.md)

## 深入资料

- [Viewer 逐提交变更总账](metaflow-viewer-change-ledger.md)
- [Editor 变更总账](metaflow-editor-change-ledger.md)
- [MCL v1.0 candidate](metaflow-change-lifecycle-v1.0.md)
- [历史项目索引](../PROJECT_INDEX.md)
- [Analytics 专项资料](analytics-implementation.md)

阶段性审计与旧方案会保留原文并标记历史状态；不要用历史文档中的版本摘要覆盖当前事实源。
