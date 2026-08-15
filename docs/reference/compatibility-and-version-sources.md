# 兼容边界与版本事实源

本页回答“现在是什么版本、支持什么、冲突时相信哪个文件”。它不取代 Version History、Ledger 或具体 schema。

## 当前摘要

| 产品面 | 当前状态 |
|---|---|
| Viewer | 生产稳定 display/app/package `5.19.2`；运行时产品 SHA `26e311c`、analytics/release 修复 SHA `92d11b0`；上游 SuperSplat Viewer `1.29.1` / PlayCanvas `2.21.3`；生产 deploy 以线上 Netlify published pointer 为准 |
| Editor | Metaflow `1.1 / 1.1.0`；上游 SuperSplat Editor `2.28.0` |
| Editor 内部 Viewer 依赖 | `@playcanvas/supersplat-viewer 1.26.3`；不要求与 Viewer 产品上游相同 |
| 资源索引 | schema `1.2` |
| 下一次 Viewer 产品发布 | `5.19.0` Tag 在 deployment 前失败且未进入生产；`5.19.1` 完成 release transport 恢复，`5.19.2` 修复 production analytics endpoint，下一次兼容修复从 `5.19.3` 起，新向后兼容能力使用 `5.20.0` |

这些值来自下表机器来源，不是由本文独立维护。

## 事实源、镜像和解释层

| 要回答的问题 | 权威来源 | 发布镜像或交叉核对 | 不应单独作为依据 |
|---|---|---|---|
| Viewer 当前 display/app/upstream/schema | [`metadata/version-history.json`](../../metadata/version-history.json) 的 `current` | `data/version-history.json`、`data/index.json.release`、Viewer package/lock | README、目录名、旧 Ledger 行 |
| Viewer 某次发布包含什么 | `metadata/version-history.json.entries` | [Viewer Ledger](../metaflow-viewer-change-ledger.md)、实现 commit | Commit 标题本身 |
| Viewer 行为为什么改变、风险是什么 | [Viewer Ledger](../metaflow-viewer-change-ledger.md) | PR/Issue 和相关源码 | Version History 的短摘要 |
| Editor 当前产品/上游/依赖/源码路径 | [`metadata/editor-version-history.json`](../../metadata/editor-version-history.json) 的 `current` | `data/editor-version-history.json`、`metaflow-editor/version.json` | `supersplat-v2.28.0/package.json` 的上游 package 版本 |
| Editor 当前部署 bundle 是什么 | `metaflow-editor/version.json` 与 tracked bundle | Editor Version History、Netlify publish 副本 | `supersplat-v2.28.0/dist/` 单独存在 |
| 上游参考快照的 tag/commit/tree/摘要与迁移位置 | [`metadata/reference-snapshots.json`](../../metadata/reference-snapshots.json) | `node scripts/validate_reference_snapshots.mjs`；需要时增加 `--verify-upstream` | 目录名、历史 Version History 的旧 `sourcePath`、release note 标题 |
| 当前公开 route 和资源文件 | [`data/index.json`](../../data/index.json) | `scripts/generate_index.py`、真实 data 文件 | 手工 README 清单 |
| 当前协作流程 | [MCL Revision 6](../metaflow-change-lifecycle-v1.0.md) 与 `AGENTS.md` | 实时 Issue、[Change 注册表](../changes/README.md) | 历史 Change 中的旧 Gate |

Version History 是结构化发布事实，Ledger 是人类可读的动机、行为、风险和证据背景；它们相互追溯，但都不承担通用 PR Completion Contract。

## Viewer 兼容矩阵

| 契约面 | 当前支持 | 边界 |
|---|---|---|
| Settings | 无 `version` 的 v1；`version: 2` 的 v2 | 新资源只写 v2；其他版本拒绝 |
| 稳定 index 主模型 | SOG；`lod-meta.json` streaming 入口 | `files.model` 是当前唯一运行时权威；生成器不会把 `meta.json` 或独立 compressed PLY 作为 streaming/route 主模型 |
| Viewer 直接 `content` | SOG、PLY（含 compressed PLY）、loose SOG `meta.json`、streamed `lod-meta.json` | 直接参数跳过 route/index 和 route 元数据；入口 basename/extension 决定 parser，结构只负责验证 |
| Environment | 文件名包含 `environment` 或 `point_cloud` 的 compressed PLY | 只作为环境候选，不会因此成为主体模型 |
| Route | `resources[].route` 与 `aliases[]` | 必须唯一；公开后按 URL 契约维护 |
| Collision | GLB、单体 voxel、tiled voxel manifest | 具体坐标系由 index `viewer.voxelCoordinateSpace` 表达 |
| URL/settings 覆盖 | poster/environment/collision/voxel 等 query 可优先 | `content` 会跳过 route；route 会覆盖 query `settings`，不是统一覆盖模型 |

精确字段见 [Viewer URL 参数](viewer-url-parameters.md)、[Viewer settings schema](viewer-settings-schema.md) 和 [资源索引 schema](resource-index.md)。

当前来源分类不等于未来的精度切换合同：同一目录即使同时存在 SOG 与 streamed LOD，也不会自动改变 `files.model`。后续数据标签系统计划把 `streaming` 作为双源资产默认，把 `highest-quality` SOG 作为用户可选来源；schema、UI 和运行时换源生命周期尚未在本候选中实现。

## Editor 兼容矩阵

| 契约面 | 当前支持 | 边界 |
|---|---|---|
| 模型导入/导出 | PLY、compressed PLY、SPLAT、SOG 及项目格式 | 平台稳定 route 仍需符合 index 生成规则 |
| Viewer 导出 | HTML、Package、Metaflow legacy ZIP、settings-only | HTML/ZIP 不是 `data/index.json` schema |
| Settings | 导出 v2 相机、动画和后处理 | 当前导出固定 `annotations: []`，不能完成 annotation 往返 |
| 源码 | `supersplat-v2.28.0/` | `metaflow-editor/` 是部署镜像，不是当前编辑源码 |
| 构建 | `supersplat-v2.28.0/dist/` | Netlify 不会自动把 dist 变成 `metaflow-editor/`；发布前必须显式暂存 |

## 版本冲突时的判断顺序

1. 读取对应 metadata `current`；
2. 核对 package/lock、runtime JSON、index release 或公开镜像；
3. 查看 Version History entry 与 Ledger；
4. 核对实际实现 commit、schema 和测试；
5. 只有研究演进时才读取历史计划、旧 README 或版本目录。

若机器来源彼此不一致，不要只修改文档摘要“让它看起来一致”；应停止发布，修正生成或 release record，再重新验证。

## 历史边界

`5.18a` 及更早的字母版本、资源 `addedIn/updatedIn`、旧 Editor/Viewer 源码快照都按当时事实保留。普通文档、MCL、研究、无行为 refactor 和未公开 staging 不提升产品版本。完整规则见 [版本与发布](../maintenance/versioning-and-release.md)，历史资料分类见 [历史入口](../history/README.md)。
