# 版本、发布与部署兼容入口

> **路径保留。** 这条旧路径曾同时说明版本决策、发布记录和 Netlify 操作。原有内容已经按职责迁移到下列两篇现行文档；本页用于保留既有深度链接，避免读者继续在一篇文档里混淆“产生什么版本”和“怎样送入生产目录”。

## 版本与发布记录

阅读 [版本与发布](versioning-and-release.md)，用于判断：

- Viewer 何时提升 PATCH、MINOR 或 MAJOR；
- 哪些变化不提升产品版本；
- Version History、Ledger、package/lock、index release 与公开镜像怎样保持一致；
- Direct Commit 与 squash PR 怎样记录真实实现 SHA；
- Editor 独立版本如何维护。

## 静态构建与生产交付

阅读 [部署](deployment.md)，用于执行或核对：

- Viewer、data 和 Editor 怎样组成 Netlify publish 目录；
- `supersplat-v2.28.0/dist/` 怎样显式暂存到 tracked `metaflow-editor/`；
- redirect、cache、preview、production smoke 和 rollback；
- 为什么普通文档合并或一次 build 不等于生产发布完成。

本页不再复制两份现行契约。当前文档总入口见 [Metaflow 文档中心](../README.md)。
