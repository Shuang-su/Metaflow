# 仓库地图

本页描述当前目录职责。更早的模块逐文件索引保留在 [`PROJECT_INDEX.md`](../../PROJECT_INDEX.md)，但它是历史资料，不再承担当前版本入口。

| 路径 | 类型 | 当前职责 |
|---|---|---|
| `metaflow-viewer/` | 活跃源码 | Viewer 源码、测试、构建配置与 package |
| `supersplat-v2.28.0/` | 活跃源码 | 当前 Editor 可重建源码 |
| `metaflow-editor/` | 生成/发布物 | 部署到 `/editor` 的 Editor bundle 与 `version.json` |
| `data/` | 产品数据 | 模型、settings、缩略图、碰撞、index 与版本镜像 |
| `metadata/` | 事实与治理 | 版本源、组件 ownership、CI routing 和 schemas |
| `scripts/` | 工具 | index 生成、数据/平台/文档/MCL/CI 验证 |
| `docs/` | 文档 | 25 篇中文核心手册、审计总账、MCL 与历史 Change 资料 |
| `docs/history/` | 历史入口 | 区分 Change、Version History、Ledger、旧快照和专项资料 |
| `docs/changes/` | Change 资料 | 当前契约与历史 Change；先读目录注册表，再进入具体档案 |
| `.github/` | 托管治理 | Issue/PR 模板、Actions、Ruleset、CODEOWNERS |
| `supabase/`、`analytics/` | 支撑 | 可选观测与数据基础设施 |
| `netlify.toml` | 发布配置 | Viewer build、data/Editor 同步、redirect 与 cache headers |

## 历史与参考源码

| 路径 | 用途 |
|---|---|
| `supersplat-viewer-v1.11.1/` | 早期 Viewer 基线 |
| `supersplat-viewer-v1.18.2/` | 中间 Viewer 上游快照 |
| `supersplat-v2.18.1/` | 旧 Editor 基线 |

这些目录用于 diff、license、provenance 和回归判断。不要直接在其中实现当前产品修复，也不要让 Dependabot 把它们当活跃 package。

## 根文件

- `README.md`：项目门户与保留的 Viewer 快速参考。
- `AGENTS.md`：仓库级智能体约定。
- `CONTRIBUTING.md`：贡献、Issue/PR 和验证入口。
- `ROADMAP.md`：方向性计划，不是当前版本事实源。
- `PROJECT_INDEX.md`：历史模块索引。
- `MIGRATION_VALIDATION.md`：阶段性迁移验证资料；按文件提示判断时效。

活动 MCL 模板从 [`docs/templates/mcl/README.md`](../templates/mcl/README.md) 进入。MF-1、MF-9 等 legacy `completion/` 保留审计证据，但不作为新协作范本；分类见 [Change 状态与历史注册表](../changes/README.md)。

## 谁拥有、跑什么检查

ownership 见 [`metadata/components.json`](../../metadata/components.json)，检查路由见 [`metadata/ci-routing.json`](../../metadata/ci-routing.json)。两者分离：拥有某路径不等于每次变化都跑该组件全套检查。
