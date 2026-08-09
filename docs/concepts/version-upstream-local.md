# 版本、上游与本地改动

Metaflow 同时存在产品版本、上游版本、资源版本和历史源码目录。它们回答不同问题，不能用一个数字代替。

## Viewer 双轨版本

[`metadata/version-history.json`](../../metadata/version-history.json) 的 `current` 是 Viewer 当前事实：

- `displayVersion`：用户可见版本；当前 `5.18a`。
- `appSemver`：包与代码线 SemVer；当前 `5.18.0`。
- `upstream.version`：当前同步的 SuperSplat Viewer；当前 `1.26.2`。
- `indexSchemaVersion`：发布索引契约；当前 `1.2`。

数字 minor 记录代码、UI、行为、迁移和工具；字母后缀记录同一数字版本上的纯资源更新。`5.18a` 不表示 npm package 已变成 `5.18.1`。

## Editor fork 版本

[`metadata/editor-version-history.json`](../../metadata/editor-version-history.json) 分开记录：

- Metaflow Editor `displayVersion/appSemver`：当前 `1.1 / 1.1.0`；
- 上游 SuperSplat Editor tag：当前 `v2.28.0`；
- 活跃源码目录：`supersplat-v2.28.0/`；
- 依赖版本，包括 `@playcanvas/supersplat-viewer 1.26.3` 和 PlayCanvas `2.19.2`。

Viewer 产品上游 `1.26.2` 与 Editor 内部使用的 Viewer package `1.26.3` 可以不同；这是两个依赖面，不应“统一数字”后再写文档。

## 本地定制

上游同步不是覆盖目录。每次同步都要逐项决定本地能力是 Keep、Port、Replace、Drop 还是 Conflict。当前关键定制包括资源路由、加载与首帧策略、碰撞/行走、动画退出、品牌、Analytics，以及 Editor 的 timeline/export/version surfaces。

## 历史目录

`supersplat-viewer-v1.11.1/`、`supersplat-viewer-v1.18.2/`、`supersplat-v2.18.1/` 是审计快照，不是当前运行源码。文件夹名只说明快照来源，不说明当前产品版本。

## 发布镜像

`data/version-history.json` 和 `data/editor-version-history.json` 面向浏览器发布，必须与 metadata 源完全一致。`metaflow-editor/version.json` 是 Editor bundle 的运行时版本面。生成物不应反向覆盖 metadata。

## 判断当前状态的顺序

1. 读取 metadata 的 `current`。
2. 核对 package 或运行时 version JSON。
3. 查看对应 change ledger 的详细演化。
4. 只有研究历史差异时才读旧 sync audit 或版本目录。
