# 中文文档体系规范

## 1. 目标读者

文档首先服务于三类读者：

- 第一次运行 Viewer 或 Editor 的开发者、产品同学；
- 添加资源、调整展示配置、构建和发布的维护者；
- 需要判断当前实现、上游基线和本地定制边界的人与智能体。

## 2. 信息架构

文档借鉴 Diátaxis，但按仓库规模收敛为五组正文和一个历史入口：

- `getting-started/`：第一次完成一条可运行路径；
- `guides/`：围绕具体任务给出操作步骤；
- `concepts/`：解释系统为什么这样组织；
- `reference/`：稳定、可查的字段和契约；
- `maintenance/`：开发、同步、发布、排障和文档治理。
- `history/`：只分类并链接历史、审计和快照资料，不承载当前操作说明。

`docs/README.md` 是唯一总入口。根 `README.md` 是仓库门户，不复制全部手册。

## 3. 语言与介质

- 中文是唯一维护语言；不创建英文镜像。
- API 名、命令、路径、schema 字段、标准格式和行业通用术语保留英文。
- 使用仓库内 Markdown；不引入静态站点生成器。
- 只在关系或顺序难以用短段落说明时使用 Mermaid。
- 不使用截图作为必要步骤或事实来源。

上游源码目录中保留的英文 README 属于第三方源码材料，不是本体系的英文副本，也不承担 Metaflow 当前操作入口职责。

## 4. 当前事实来源

| 事实 | 唯一来源 |
|---|---|
| Viewer 展示版本、包版本、上游版本 | `metadata/version-history.json` 的 `current` |
| Editor 版本、源码目录、上游版本、依赖 | `metadata/editor-version-history.json` 的 `current` |
| 发布给浏览器的版本镜像 | `data/version-history.json`、`data/editor-version-history.json` |
| Editor 运行时版本 | `metaflow-editor/version.json` |
| 资源索引 schema 与当前资源 | `data/index.json` |
| index 生成规则 | `scripts/generate_index.py` |
| Viewer URL 参数与实际优先级 | `metaflow-viewer/src/index.html`、`src/localization.ts` |
| Viewer settings schema | `metaflow-viewer/src/schemas/v1.ts`、`v2.ts` |
| Editor 导出行为 | `supersplat-v2.28.0/src/ui/export-popup.ts`、`src/ui/publish-settings-dialog.ts`、`src/splat-serialize.ts` |
| 构建、Editor staging 与部署 | package scripts、`supersplat-v2.28.0/dist/`、tracked `metaflow-editor/`、`netlify.toml`、release workflow |

文档可以展示当前值，但必须同时链接事实源；不得让手工摘要取代机器可读来源。

## 5. 核心文件集

核心手册共 25 篇。它们不是为了凑数量：URL 参数与 settings schema、版本发布与部署分别承担不同事实和操作职责；历史入口隔离旧资料；调试指南提供可复现的排查矩阵。

1. `docs/README.md`
2. `docs/getting-started/overview.md`
3. `docs/getting-started/viewer.md`
4. `docs/getting-started/editor.md`
5. `docs/guides/editor-to-viewer.md`
6. `docs/guides/add-publish-resource.md`
7. `docs/guides/configure-viewer.md`
8. `docs/guides/embed-share.md`
9. `docs/guides/debug-and-profile.md`
10. `docs/concepts/architecture.md`
11. `docs/concepts/resource-loading.md`
12. `docs/concepts/version-upstream-local.md`
13. `docs/reference/repository-map.md`
14. `docs/reference/viewer-url-parameters.md`
15. `docs/reference/viewer-settings-schema.md`
16. `docs/reference/resource-index.md`
17. `docs/reference/editor-export-contract.md`
18. `docs/reference/compatibility-and-version-sources.md`
19. `docs/maintenance/development.md`
20. `docs/maintenance/upstream-sync.md`
21. `docs/maintenance/versioning-and-release.md`
22. `docs/maintenance/deployment.md`
23. `docs/maintenance/troubleshooting.md`
24. `docs/maintenance/documentation.md`
25. `docs/history/README.md`

## 6. 既有资料处置

- 根 README 保留原有 Viewer 快速参考，但在首屏增加项目门户和新文档入口，并修正版本事实。
- `PROJECT_INDEX.md` 保留全文，增加历史资料提示，由新的仓库地图承担当前导航。
- Viewer/Editor change ledger 继续作为审计总账，链接当前事实来源。
- sync comparison、current diff audit 等阶段性结论原位保留，并增加“不代表当前状态”的提示。
- analytics 专项资料继续保留，但不扩张为核心手册分支。
- MCL 与 Change 历史档案保持原位，通过 `docs/history/README.md` 和 `docs/changes/README.md` 分类，不纳入产品教程主线。
- 已拆分的 `reference/viewer-url-settings.md` 与 `maintenance/release-deploy.md` 保留为简短迁移入口，避免破坏既有深度链接；正文只在 25 篇核心文档维护。

## 7. 维护约束

- 教程不承担完整字段参考；参考文档不写成长篇实施计划。
- 同一命令只在最相关文档完整解释，其余位置链接过去。
- 相对链接必须通过 `scripts/check_markdown_links.mjs`。
- 25 篇核心手册必须从 `docs/README.md` 可达，并注明现行、指南、事实参考或历史职责。
- 新增或变更版本事实时，同一 PR 更新机器来源及受影响摘要。
- 历史文档使用显眼提示，不改写当时事实。
- 文档 PR 应命中 `docs` route；若触及治理、源码或依赖，必须接受相应检查，不能通过改路径规避。

## 8. 参考方法

本结构有选择地借鉴以下公开文档：

- [Diátaxis](https://diataxis.fr/)：分开教程、操作指南、解释和参考，避免一篇文档同时承担所有职责；
- [C4 model](https://c4model.com/)：按系统、容器和组件逐层解释架构，但本项目只保留确有必要的层级；
- [Godot 文档](https://docs.godotengine.org/en/stable/)：以读者当前经验和目标组织入口，并把入门路径与深入参考分开；
- [Electron 文档](https://www.electronjs.org/docs/latest/)：使用清晰的总入口连接教程、开发指南和 API 参考；
- [MapLibre GL JS 文档](https://maplibre.org/maplibre-gl-js/docs/)：让示例承担快速上手，让 API 页面承担精确查询；
- [SuperSplat 文档](https://developer.playcanvas.com/user-manual/supersplat/)：围绕 Editor、Viewer、发布和自托管形成完整任务链。

这些项目只提供信息架构与表达方法，不替代 Metaflow 当前代码、机器元数据和发布配置中的事实源。
