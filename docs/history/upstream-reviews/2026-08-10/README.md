# SuperSplat 三基线独立审查（2026-08-10 至 2026-08-11）

> **状态：审查完成；Viewer 已进入 5.19.0 PR 候选，尚未部署。** 本目录记录一次固定时间窗内的上游比较、运行证据和独立决策。后续 MF-30 已单独实现 Viewer Adopt 并准备版本/Ledger；Editor 与 Transform 结论不变。当前代码候选事实以 `metadata/version-history.json` 为准，生产是否发布仍以最终 SHA、tag、部署与观察记录为准。

## 最新稳定版保护的处理

审查开始时，计划候选为 Viewer `v1.28.0` 和 Transform CLI `v3.2.0`。执行期间，官方分别于 2026-08-10 15:46:10 UTC（北京时间 23:46:10）和 15:51:30 UTC（北京时间 23:51:30）发布了 Viewer `v1.29.0` 与 Transform CLI `v3.3.0`。Viewer 实施预检又在 2026-08-13 确认 2026-08-12 发布的 `v1.29.1` 为最新稳定版。每次候选变化都先停止、固定精确 tag/commit/tree 并扩展比较区间，没有静默替换：

1. 停止按旧候选形成最终结论；
2. 将新 stable tag、commit、tree 和内容摘要登记为新的最新候选；
3. 保留 `v1.28.0` 与 `v3.2.0` 为不可变的区间中间快照；
4. 将 Viewer 比较区间先扩展到 `v1.29.0`、再扩展到 `v1.29.1`，将 Transform CLI 比较区间扩展到 `v3.3.0`；
5. 对新增版本重新执行静态差异、构建和针对性运行审查。

为保留已批准计划中的稳定文档入口，Viewer 和 Transform 报告仍使用原计划文件名；每份报告标题和正文均明确写出扩展后的真实比较区间，不应从文件名推断最新候选。

## 冻结对象与独立决策

| 组件 | 当前上游基准 B | 当前 Metaflow M | 最新候选 N | 区间中间快照 | 独立结论 |
|---|---|---|---|---|---|
| Viewer | SuperSplat Viewer `v1.26.2` | 审查时 `metaflow-viewer/` / 产品 `5.18.1`；当前 MF-30 候选 `5.19.0` | `v1.29.1`，commit `3a61fa606e12640b1e87f9a733ed43d7fbc5d925` | `v1.28.0`、`v1.29.0` | **Adopt**：已分阶段移植并进入 Draft PR 候选；不替换活跃目录，生产仍未发布 |
| Editor | SuperSplat `v2.28.0` | 根目录 `supersplat-v2.28.0/`，Metaflow Editor `1.1`；`metaflow-editor/` 是部署产物 | `v2.32.3`，commit `b9e3cb6f072179f0d49ae52d6c256d70b2079174` | 无 | **Defer**：Node 契约、Viewer 视觉兼容和关键运行矩阵尚未闭环 |
| Transform CLI | `splat-transform v2.5.1` | 当前 SOG/LOD/voxel/collision 资产契约与未来 Agent 需求；没有独立产品 | `v3.3.0`，commit `57883c2c7bda5bcfb60a8b402ababacc286e49ae` | `v3.2.0` | **Adopt**：仅规划版本固定的离线包装器；不进入产品版本史或 Editor 依赖 |

三个结论互不阻塞。Viewer 的 Adopt 不要求 Editor 同步 Adopt；Editor 的 Defer 不阻塞 Transform 离线工具规划；Transform 的 Adopt 不允许自动改变 Viewer、Editor 或生产部署。

## 报告入口

- [Viewer：v1.26.2 / Metaflow 5.18.1 / v1.29.1](viewer-v1.26.2-to-v1.28.0.md)
- [Editor：v2.28.0 / Metaflow Editor 1.1 / v2.32.3](editor-v2.28.0-to-v2.32.3.md)
- [Transform CLI：v2.5.1 / 当前资产契约 / v3.3.0](splat-transform-cli-v2.5.1-to-v3.2.0.md)
- [机器可读快照登记](../../../../metadata/reference-snapshots.json)

## 证据分层

报告严格区分四类证据：

| 类型 | 能证明什么 | 不能证明什么 |
|---|---|---|
| 静态差异 | 文件、依赖、API、schema 和 release 区间真实发生了什么 | 运行时一定可用 |
| 构建/测试 | 指定 Node 与一次性副本能否安装、lint、typecheck、构建或通过自动测试 | 真实资源、浏览器和硬件路径一定正确 |
| 浏览器/CLI 运行 | 给定资源、viewport、renderer、输入参数和时间点的实际行为 | 未运行场景或未来生产状态 |
| 未验证项 | 明确剩余硬件、素材、错误路径和容量边界 | 不得被静态阅读替代为“已验证” |

构建、依赖和格式输出全部位于 `.codex-work/tmp/` 的一次性副本；`references/**` 内没有生成 `node_modules`、`dist`、缓存或测试输出。为了让浏览器审查长期可追溯，本目录只保留代表性截图、Playwright DOM 快照和 console 记录：

- [`evidence/viewer/`](evidence/viewer/)
- [`evidence/editor/`](evidence/editor/)
- [`evidence/transform/`](evidence/transform/)

`evidence/*/raw/` 是原始 Playwright 快照与 console 记录。网络结果以报告中的 route/请求表为准：本次没有生成可复用的 HAR；因此报告不会声称拥有完整逐请求时序。截图只证明标注时间点的可见状态。

## 审查边界与实际未变更项

原始审查阶段只整理参考快照、建立登记/校验接口、运行审查并形成决策。后续 MF-30 Viewer 实施和版本候选是独立 Change；以下陈述只描述原始审查阶段：

- `metaflow-viewer/`、根目录 `supersplat-v2.28.0/` 和 `metaflow-editor/` 的产品内容；
- Viewer/Editor 版本号、Version History、Ledger 和发布状态；
- `pcui/`、`data/` 资源、Netlify staging、生产部署；
- 仓库 `.nvmrc`（继续为 Node `20.19.0`）；
- Editor 的 `@playcanvas/splat-transform` 依赖；
- GitHub Issue、PR、branch、tag 或远端设置。

Viewer 与 Transform 的后续 Spec/Plan 直接写在各自 Adopt 报告内，作为该组件唯一的 decision-complete 升级规划。Editor 报告以 Defer 触发条件和重新评估协议结束，不生成伪装成已批准升级的实现计划。

## 复核时间点

上游 stable release、官方 release note 和 compare 区间最后复核时间为 2026-08-11（Asia/Shanghai）。未来真正开始任一实现分支前，必须再次查询 stable release；本目录不会随着上游发布自动变成“最新”。
