# Viewer URL 与 settings 兼容入口

> **路径保留。** 这条旧路径曾把 URL 参数和 settings schema 放在同一页。原有内容没有丢弃：现已按事实职责拆分并校正，避免 route/query 优先级、运行时参数和持久化 schema 再次混在一起。新文档入口如下。

## URL、route 与运行时开关

阅读 [Viewer URL 参数参考](viewer-url-parameters.md)，其中包括：

- `content`、`settings`、poster、environment、collision 与 voxel 参数；
- route 与 query 的真实覆盖顺序；
- UI、渲染、调试、Analytics 和隐私开关；
- direct URL 与稳定 index route 的边界。

重要修正：当前实现不是“所有显式参数都覆盖 route”。`content` 会跳过 route/index；route 命中后会覆盖 query 中的 `settings`；部分其他资源参数才保留显式值。

## 持久化 Viewer settings

阅读 [Viewer settings schema 参考](viewer-settings-schema.md)，其中包括：

- v1 兼容与 v2 当前格式；
- 必需字段、动画、相机和标注；
- JSONC 运行时兼容边界；
- 当前 Editor 固定导出空 annotations 的限制。

本页只保留既有深度链接，不再独立维护参数或 schema 副本。当前文档总入口见 [Metaflow 文档中心](../README.md)。
