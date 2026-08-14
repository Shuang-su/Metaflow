# 版本、上游与本地改动

Metaflow 同时存在产品版本、上游版本、资源历史和源码快照版本。它们回答不同问题，不能用一个数字代替。

## Viewer 当前版本与 SemVer 前向规则

[`metadata/version-history.json`](../../metadata/version-history.json) 的 `current` 是 Viewer 当前事实：

- `displayVersion`：用户可见版本；当前发布恢复版本 `5.19.1`。
- `appSemver`：包与代码线 SemVer；当前发布恢复版本 `5.19.1`。
- `upstream.version`：当前同步的 SuperSplat Viewer；当前 `1.29.1`。
- `indexSchemaVersion`：发布索引契约；当前 `1.2`。

`5.18a / 5.18.0` 是最后一个双轨历史状态，保持原样；`5.18.1` 是此后的首个完整 SemVer 发布。`5.19.0` 因新增向后兼容的渲染、capture、Annotation、XR 与 Loader 能力而作为 MINOR 合并到产品 SHA `26e311c`，但它的不可变 Tag prepare 在 deployment 前失败，生产从未切换。`5.19.1` 只修复 release validation、sparse checkout、精确版本 smoke 和 Netlify 生产触发边界，使用 recovery SHA `534b013`，因此是 PATCH；生产仍为 `5.18.1`，版本记录不等于已部署发布。后续 PATCH 处理资源和兼容修复，MINOR 处理向后兼容新能力，MAJOR 处理破坏性公共契约。

历史 `1.0a`、`1.12b`、`5.3a`、`5.18a` 及资源 `addedIn/updatedIn` 保持不变。新 entry 继续保留 `displayVersion` 和 `appSemver` 两个兼容字段，但两者必须相等。

普通文档、MCL/治理、研究、无行为 refactor、测试维护和未公开 staging 不提升 Viewer 版本。

## Editor fork 版本

[`metadata/editor-version-history.json`](../../metadata/editor-version-history.json) 分开记录：

- Metaflow Editor `displayVersion/appSemver`：当前 `1.1 / 1.1.0`；
- 上游 SuperSplat Editor tag：当前 `v2.28.0`；
- 活跃源码目录：`supersplat-v2.28.0/`；
- 依赖版本，包括 `@playcanvas/supersplat-viewer 1.26.3` 和 PlayCanvas `2.19.2`。

Viewer 产品上游 `1.29.1` 与 Editor 内部使用的 Viewer package `1.26.3` 可以不同；这是两个依赖面，不应“统一数字”后再写文档。Viewer 的 SemVer 迁移也不会自动改变 Editor 版本。

## Ledger 与 Version History

Version History 是机器可读发布事实源；Ledger 是维护者理解动机、原行为、实现、用户结果、风险和证据的行为审计层。二者相互追溯，但不保存 PR Completion Contract 或完整对话。

Viewer Ledger 在历史边界 `c613a87` 之前保留原有全量记录；之后只审计 Viewer、data 和 Viewer 发布支撑提交，不把 MCL、普通文档、Design、Reference、Editor 或无关平台维护纳入 Viewer 总账。

## 本地定制

上游同步不是覆盖目录。每次同步都要逐项决定本地能力是 Keep、Port、Replace、Drop 还是 Conflict。当前关键定制包括资源路由、加载与首帧策略、碰撞/行走、动画退出、品牌、Analytics，以及 Editor 的 timeline/export/version surfaces。

## 历史目录

`references/` 下的目录是审计快照，不是当前运行源码。Viewer `v1.11.1`、`v1.18.2`、`v1.26.2`、`v1.28.0`、`v1.29.0`、`v1.29.1`，Editor `v2.28.0`、`v2.32.3`，以及 Transform CLI `v2.5.1`、`v3.2.0`、`v3.3.0` 都是纯上游内容；其中 `v1.28.0/v1.29.0/v3.2.0` 是审查或实施预检中出现更新 stable release 后保留的不可变中间快照。`supersplat-v2.18.1/` 是历史 Metaflow 定制基线，目录名只说明 upstream lineage，不表示与官方 tag 内容一致。机器身份、迁移前路径和摘要以 [`metadata/reference-snapshots.json`](../../metadata/reference-snapshots.json) 为准；历史 Version History 的原始 `sourcePath` 不回写。

## 发布镜像

`data/version-history.json` 和 `data/editor-version-history.json` 面向浏览器发布，必须与 metadata 源完全一致。`metaflow-editor/version.json` 是 Editor bundle 的运行时版本面。生成物不应反向覆盖 metadata。

## 判断当前状态的顺序

1. 读取 metadata 的 `current`。
2. 核对 package 或运行时 version JSON。
3. 查看对应 Ledger 的详细演化。
4. 只有研究历史差异时才读旧 sync audit 或版本目录。

需要查表而不是理解概念时，使用 [兼容边界与版本事实源](../reference/compatibility-and-version-sources.md)；准备真实产品发布时，使用 [版本与发布](../maintenance/versioning-and-release.md)。
