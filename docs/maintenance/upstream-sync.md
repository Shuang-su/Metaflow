# 上游同步

Viewer 和 Editor 都是带本地定制的上游 fork。同步目标不是“让目录看起来和上游一样”，而是在新基线上重建可解释的本地产品行为。

## 何时建立同步任务

仓库 `AGENTS.md` 要求把上游同步作为 Change，而不是直接覆盖活跃源码。发现新 release 后先创建自描述 Issue，记录当前版本、候选版本、变化信号、包含/排除范围、风险和验收。

MCL 仍是 candidate，只对 MF-1 和明确 opt-in 的 Proposal/Spec/Plan 试点生效；不能仅凭本指南把每次上游观察都强制展开成 T3 全套工件。按实际性质选择：

- 只做版本发现与 Adopt/Defer/Skip 判断：自描述 Issue 通常足够；
- 已批准的小型兼容同步：Issue + 定向 Plan/PR，按影响验证；
- 重大上游同步、跨组件移植、公共契约或迁移：按风险增加唯一 Spec/Plan、Proposal/ADR、回滚与观察。

T0–T3 是风险标签，不自动要求固定文件链。若某个 Change 明确 opt-in MCL，则按它已接受的 Spec/Plan 执行。

定时 `upstream-watch` 只负责发现和维护 proposal，不授权修改或合并。

## 比较顺序

1. 阅读上游 release/tag 和 migration notes。
2. 比较当前上游基线 → 新上游。
3. 比较当前 Metaflow → 当前上游基线，列出所有本地定制。
4. 做三方映射，而不是用新上游覆盖当前目录。

每项本地能力标记：

- Keep：新基线无需改动即可保留；
- Port：将本地实现移植到新结构；
- Replace：采用上游等价能力；
- Drop：明确不再需要，并记录影响；
- Conflict：设计或行为冲突，需要决策。

## Viewer 重点清单

- route/index 与 alias；
- legacy/streaming 双加载路径；
- environment、首帧、reveal 和 LOD 策略；
- walk、mesh/voxel/tiled collision；
- 相机、动画首次退出、移动端和输入；
- settings v1/v2 兼容；
- Analytics、品牌、本地化与调试工具。

## Editor 重点清单

- timeline 100000 帧边界；
- Metaflow version/branding surfaces；
- HTML、Package、legacy ZIP、settings-only 导出；
- large-project streaming load；
- `metaflow-editor/` 构建与 service worker cache。

## 版本和目录

新 Editor 上游基线使用 `supersplat-v<version>/` 形式保留可审计源码。旧目录降为 reference，不在原目录上“滚动升级”。Viewer 当前活跃源码始终在 `metaflow-viewer/`，上游 snapshot 只用于差异。

同步完成后更新 metadata current、依赖、运行时 version、change ledger 和受影响手册。不要只改 README 中的版本数字。版本职责见 [版本与发布](versioning-and-release.md)，Editor 部署镜像还必须完成 [显式 staging](deployment.md#editor-release-staging)。

## 验证与回退

同步必须命中对应产品全套 build/test/E2E、CodeQL 和必要视觉/性能矩阵。回退以独立 PR 或 revert 恢复上一个可发布状态；保留新上游分析和失败证据，避免下一次重新猜测。
