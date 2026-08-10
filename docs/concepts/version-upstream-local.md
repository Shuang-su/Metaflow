# 版本、上游与本地改动

Metaflow 同时存在产品版本、上游版本、资源历史和源码快照版本。它们回答不同问题，不能用一个数字代替。

## Viewer 当前版本与 SemVer 前向规则

[`metadata/version-history.json`](../../metadata/version-history.json) 的 `current` 是 Viewer 当前事实：

- `displayVersion`：用户可见版本；当前 `5.18a`。
- `appSemver`：包与代码线 SemVer；当前 `5.18.0`。
- `upstream.version`：当前同步的 SuperSplat Viewer；当前 `1.26.2`。
- `indexSchemaVersion`：发布索引契约；当前 `1.2`。

`5.18a / 5.18.0` 是最后一个双轨历史状态，不应被回填成一个并未发生的 `5.18.1` 发布。下一次真实 Viewer 资源发布或兼容修复使用 `5.18.1`，之后统一使用完整 SemVer：PATCH 处理资源和兼容修复，MINOR 处理向后兼容新能力，MAJOR 处理破坏性公共契约。

历史 `1.0a`、`1.12b`、`5.3a`、`5.18a` 及资源 `addedIn/updatedIn` 保持不变。新 entry 继续保留 `displayVersion` 和 `appSemver` 两个兼容字段，但两者必须相等。

普通文档、MCL/治理、研究、无行为 refactor、测试维护和未公开 staging 不提升 Viewer 版本。

## Editor fork 版本

[`metadata/editor-version-history.json`](../../metadata/editor-version-history.json) 分开记录：

- Metaflow Editor `displayVersion/appSemver`：当前 `1.1 / 1.1.0`；
- 上游 SuperSplat Editor tag：当前 `v2.28.0`；
- 活跃源码目录：`supersplat-v2.28.0/`；
- 依赖版本，包括 `@playcanvas/supersplat-viewer 1.26.3` 和 PlayCanvas `2.19.2`。

Viewer 产品上游 `1.26.2` 与 Editor 内部使用的 Viewer package `1.26.3` 可以不同；这是两个依赖面，不应“统一数字”后再写文档。Viewer 的 SemVer 迁移也不会自动改变 Editor 版本。

## Ledger 与 Version History

Version History 是机器可读发布事实源；Ledger 是维护者理解动机、原行为、实现、用户结果、风险和证据的行为审计层。二者相互追溯，但不保存 PR Completion Contract 或完整对话。

Viewer Ledger 在历史边界 `c613a87` 之前保留原有全量记录；之后只审计 Viewer、data 和 Viewer 发布支撑提交，不把 MCL、普通文档、Design、Reference、Editor 或无关平台维护纳入 Viewer 总账。

## 本地定制

上游同步不是覆盖目录。每次同步都要逐项决定本地能力是 Keep、Port、Replace、Drop 还是 Conflict。当前关键定制包括资源路由、加载与首帧策略、碰撞/行走、动画退出、品牌、Analytics，以及 Editor 的 timeline/export/version surfaces。

## 历史目录

`supersplat-viewer-v1.11.1/`、`supersplat-viewer-v1.18.2/`、`supersplat-v2.18.1/` 是审计快照，不是当前运行源码。文件夹名只说明快照来源，不说明当前产品版本。

## 发布镜像

`data/version-history.json` 和 `data/editor-version-history.json` 面向浏览器发布，必须与 metadata 源完全一致。`metaflow-editor/version.json` 是 Editor bundle 的运行时版本面。生成物不应反向覆盖 metadata。

## 判断当前状态的顺序

1. 读取 metadata 的 `current`。
2. 核对 package 或运行时 version JSON。
3. 查看对应 Ledger 的详细演化。
4. 只有研究历史差异时才读旧 sync audit 或版本目录。
