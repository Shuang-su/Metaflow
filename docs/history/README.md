# 历史资料入口

Metaflow 保留阶段性方案、旧源码快照、审计证据和发布总账，但它们承担的职责不同。历史资料用于回答“当时为什么这样做”，不能覆盖当前代码、机器元数据、实时 Issue 或 MCL Revision 6。

## 先判断资料类型

| 类型 | 入口 | 能回答什么 | 不能回答什么 |
|---|---|---|---|
| Change 历史 | [Change 状态与历史注册表](../changes/README.md) | 某项治理/技术 Change 的决策、实施与取代关系 | 当前任务是否必须复制旧工件 |
| 产品 Version History | [`metadata/version-history.json`](../../metadata/version-history.json)、[`metadata/editor-version-history.json`](../../metadata/editor-version-history.json) | 结构化版本、日期、commit、上游与发布事实 | 详细动机和风险背景 |
| 产品 Ledger | [Viewer Ledger](../metaflow-viewer-change-ledger.md)、[Editor Ledger](../metaflow-editor-change-ledger.md) | 行为变化、用户结果、风险、验证与回退 | 通用 PR Completion Contract |
| 上游/同步审计 | [Viewer 同步对比](../metaflow-viewer-sync-comparison.md)、[当前差异审计](../metaflow-current-sync-diff-audit.md) | 某一 capture point 的上游差异和移植线索 | 当前版本和最新上游状态 |
| 旧源码快照 | `references/supersplat-viewer-v1.11.1/`、`references/supersplat-viewer-v1.18.2/`、`references/supersplat-v2.18.1/`；身份见 [`metadata/reference-snapshots.json`](../../metadata/reference-snapshots.json) | provenance、license、diff 和回归参考 | 当前产品实现路径 |
| 本轮上游对比快照 | `references/` 中 Viewer `1.26.2/1.28.0`、Editor `2.28.0/2.32.3`、Transform CLI `2.5.1/3.2.0` | 固定三方审查的基准与候选输入 | Adopt/Defer/Skip 结论或产品发布状态 |
| 旧项目资料 | [`PROJECT_INDEX.md`](../../PROJECT_INDEX.md)、[`MIGRATION_VALIDATION.md`](../../MIGRATION_VALIDATION.md) | 早期模块索引和迁移验收线索 | 当前仓库地图、当前 Gate |
| 专项资料 | [Analytics 实施资料](../analytics-implementation.md) | 某条支撑链路的详细背景 | Viewer 主加载链路的必要条件 |
| 路径兼容入口 | [旧 URL/settings 路径](../reference/viewer-url-settings.md)、[旧发布/部署路径](../maintenance/release-deploy.md) | 旧深度链接迁移到了哪两项现行职责 | 独立维护的当前契约 |

## 当前入口

需要当前事实时按以下顺序：

1. [文档中心](../README.md) 选择读者路径；
2. [兼容边界与版本事实源](../reference/compatibility-and-version-sources.md) 找到机器来源；
3. [仓库地图](../reference/repository-map.md) 确认活跃源码与生成物；
4. 实时 GitHub Issue 判断任务状态；
5. 只有需要演进背景时再进入本页列出的历史资料。

## MCL legacy 档案

MF-1、MF-9 的 `completion/` 包含旧试点要求的 Task Record、Dossier、Manifest、完整 request transcript 和 approved-plan 副本。这些文件原样保留用于确定性审计，不是新任务模板。

日常协作使用：

- 自描述 Issue（若需要）；
- 唯一 Spec/Plan（若任务性质需要）；
- Commit 或 PR；
- PR、Issue 或直接提交中的实际验证和未运行项。

没有显式审计需求时，不进入 legacy `completion/` 寻找“完成时还缺什么文件”。

## 历史提示约定

仍留在原路径的阶段性文档应在顶部说明：

- capture point 或对应 Issue/PR；
- 已完成、已取代或仅供参考；
- 不代表当前状态；
- 当前入口和机器事实源。

不要批量“修正”历史正文中的旧版本、旧 Gate 和旧结论。需要降低误读时，优先更新本入口、Change 注册表、活动模板或文件顶部的历史提示。
