# Editor 三方审查：v2.28.0 / Metaflow Editor 1.1 / v2.32.3

> **独立决策：Defer。** `v2.32.3` 的收益明确，所有当前本地能力也已分类；但 Editor build runtime、导出到当前 Viewer 的视觉兼容和若干关键运行场景尚未达到 Adopt 的证据门。本轮不移动活跃源码、不恢复已关闭 PR #25、不修改产品或部署产物。

## 1. 对象、身份与边界

| 角色 | 对象 | 精确身份 |
|---|---|---|
| B：当前纯上游基准 | `references/supersplat-v2.28.0/` | tag `v2.28.0`；commit `9f4dfe1ff4e94876fb2054353497c8e2eb93b423`；tree `0ce0d79143abc945e394d1f13f362533a15bf363`；232 tracked files |
| M：当前 Metaflow | 根目录 `supersplat-v2.28.0/` | Metaflow Editor `1.1 / 1.1.0` 的活跃定制源码；`metaflow-editor/` 仍是 `/editor/` 部署产物 |
| N：最新候选 | `references/supersplat-v2.32.3/` | tag `v2.32.3`；commit `b9e3cb6f072179f0d49ae52d6c256d70b2079174`；tree `50ea0b63f3d1733ef75f50162261f652ed530e4d`；256 tracked files |

B→N 为 125 files、9,322 insertions、4,327 deletions、65 个上游 commit。B→M 的实际源码差异只有 13 files、153 insertions、67 deletions；本报告逐文件归类，不用旧文档清单代替真实 diff。

Editor 使用的 `@playcanvas/splat-transform 3.1.7` 只作为 N 的依赖变化审查。它不绑定 [Transform CLI 独立决策](splat-transform-cli-v2.5.1-to-v3.2.0.md)，本轮也没有修改 M 的库依赖。

## 2. B → N：完整上游版本区间

| 版本 | Added | Changed | Fixed | Breaking / 迁移影响 |
|---|---|---|---|---|
| [`v2.28.1`](https://github.com/playcanvas/supersplat/releases/tag/v2.28.1) | 应用内语言选择器、无需 reload 的即时切换 | 依赖更新；SOG/HTML export worker pool 强制 inline | 相机滚轮分类；空 HTML/SOG 导出 | export 执行模型变化，需与 M legacy/package 导出合并 |
| [`v2.29.0`](https://github.com/playcanvas/supersplat/releases/tag/v2.29.0) | SPZ export；360° equirect image/video；camera info 与可编辑位置/target；timeline loop/ticks/覆盖 key；WebGPU capability error | image export 改 WebP；FOV auto-dolly 默认关闭；依赖更新 | selection frustum、single-key camera、fly orthographic wheel、快捷键滚动 | export UI、camera/timeline 与 M 100000 帧修改重叠；需行为 port |
| [`v2.30.0`](https://github.com/playcanvas/supersplat/releases/tag/v2.30.0) | selection intersect、Edit menu、数值 selection volume、preferences、PNG/JPEG、LCC2 与通用 LOD dialog | View Options→Settings；major dependency update；timeline 显示越界 key | locale/tooltips 与 selection feedback | LCC2/streamed input、preferences 与 TypeScript/lint/build面扩大 |
| `v2.31.0` tag | box/sphere selection 可切换 translate/rotate/scale gizmo；streamed SOG import | 依赖更新 | — | 官方没有单独 GitHub Release 页面；本轮按 tag compare 的 4 commits 纳入，不把缺 release page 当成缺版本 |
| [`v2.31.1`](https://github.com/playcanvas/supersplat/releases/tag/v2.31.1) | — | — | streamed SOG folder drag/drop | 与 M project load / folder handling 直接相关 |
| [`v2.32.0`](https://github.com/playcanvas/supersplat/releases/tag/v2.32.0) | grid plane、Orient 3-point alignment、persistent local frames/dimensions | locale 组织调整 | Box Select 全轴缩放、Unlock All | 新几何工具需要 undo/redo、selection 与保存重开验证 |
| [`v2.32.1`](https://github.com/playcanvas/supersplat/releases/tag/v2.32.1) | capability-aware video export preflight | Orient 使用 global pivot | — | 新失败/提示合同必须实测，不可只读 UI |
| [`v2.32.2`](https://github.com/playcanvas/supersplat/releases/tag/v2.32.2) | 8K render resolutions | PlayCanvas 2.21 public layer-clear API | video muxer finalize 等待所有写入 | 大输出容量、取消和完成时序风险上升 |
| [`v2.32.3`](https://github.com/playcanvas/supersplat/releases/tag/v2.32.3) | — | 全量 npm 依赖更新 | — | 最新候选固定点；依赖风险必须按 lockfile 而非 release 摘要判断 |

### 2.1 依赖与构建链的精确事实

| 项目 | B `v2.28.0` | N `v2.32.3` | 审查结论 |
|---|---|---|---|
| PlayCanvas | `2.19.2` | `2.21.1` | 公共渲染 API 与 layer clear 已变化，需视觉/selection/export 回归 |
| TypeScript | `6.0.3` | `6.0.3` | B 已经是 TypeScript 6；区间内不是 major crossing |
| ESLint | `10.4.1` | `10.8.0` | B 已经是 ESLint 10；区间内为同 major 升级 |
| `@playcanvas/splat-transform` | `2.5.1` | `3.1.7` | CLI/库重写、worker/streaming/output 合同变化；N 的 install 在 Node 20 给出 engine warning |
| package `engines.node` | `>=20.19.0` | `>=20.19.0` | 顶层声明未变，但 `splat-transform 3.1.7` 与 `concurrently 10` 要求 Node 22；属于实际工具链冲突 |
| Viewer export | transform `2.5.1` 的 HTML/package 路径 | transform `3.1.7` inline worker 与新 export 路径 | M 另外引入 `@playcanvas/supersplat-viewer 1.26.3` 生成 legacy ZIP，必须保留为独立兼容路径 |

因此，“TypeScript 6 / ESLint 10”已覆盖，但准确结论不是“从 5/9 升到 6/10”，而是现有 major 上的版本与配套依赖变化。

## 3. B → M：13 个实际差异文件的完整归类

| 差异文件/区域 | M 相对 B 的实际变化 | 能力归属 | M↔N 处置 |
|---|---|---|---|
| `package.json`、`package-lock.json` | 增加 `@playcanvas/supersplat-viewer 1.26.3`，用于 Metaflow legacy ZIP；lockfile 同时有 npm 平台元数据噪音 | 本地兼容依赖 | **Port** dependency；lockfile 噪音不移植 |
| `src/file-handler.ts` | 新增 `legacyPackageViewer`、`viewerSettings` 文件类型、扩展名和 dispatch | legacy ZIP / settings-only | **Port** |
| `src/index.html` | 标题和 description 改为 Metaflow Editor | 品牌 | **Keep** |
| `src/index.ts` | 不再从 upstream package version 直接展示；输出 Metaflow product + upstream + dependencies | 产品版本边界 | **Port** |
| `src/manifest.json` | PWA 名称、短名与 description 改为 Metaflow | 品牌/PWA | **Keep** |
| `src/metaflow-editor-version.ts` | 新增产品 `1.1.0`、upstream `2.28.0`、history/runtime URL、service worker cache name 的单一模块 | 产品版本边界 | **Port** |
| `src/splat-serialize.ts` | legacy Viewer HTML/CSS/JS 嵌入；写 `settings.json`；生成 legacy ZIP 或 settings-only；generated-by 改为双版本 | 导出兼容 | **Conflict + Port**：保留行为，但必须适配 transform `3.1.7` 和 Viewer 可打开性 |
| `src/sw.ts` | cache name 使用产品/upstream 双版本；加入 `version.json` 和缺失 locale；日志改产品名 | `/editor/` offline/runtime | **Port** |
| `src/ui/about-popup.ts` | Metaflow 名称、版本和产品链接 | 品牌/版本 | **Port** |
| `src/ui/editor.ts` | 顶部 app label 改为 Metaflow product version | 品牌/版本 | **Port** |
| `src/ui/export-popup.ts` | UI 增加 legacy ZIP 与 settings.json 选项、扩展名选择 | 导出兼容 | **Port** |
| `src/ui/timeline-panel.ts` | total frames 上限 `10000 → 100000` | 长时间线 | **Port**，与 N timeline 改动合并 |

上表已经覆盖真实 diff 的全部 13 个文件。以下能力存在于 M，但不是 B→M 的本地新增：

- HTML/Package、PLY/compressed PLY/SPLAT/SOG 基础导出继承自 B；
- SOG 与 project load 基础能力继承 B，N 在 `v2.31.x` 新增 streamed SOG/LCC2 和 folder 修复；
- 9 locale 基础体系继承 B，M 的本地变化主要是产品文案和 Service Worker cache 清单；
- `/editor/` 路径的部署 bundle 位于 `metaflow-editor/`，它不是根目录源码 diff 中的第 14 个“源码文件”。

这种区分避免把继承能力误写成本地 patch，也避免升级时漏掉其产品验收。

## 4. M ↔ N：能力处置矩阵

处置定义与 Viewer 报告相同。对 N 新增能力，`Keep` 表示任何未来 Adopt 都应保留 N 的实现；它不表示当前 M 已拥有该能力。所有功能均已给出处置；Defer 的原因是证据/工具链 Gate，而不是留下功能设计到实现时再决定。

| 功能区域 | B / M 行为 | N 行为 | 处置 | 风险 / 工作量 | 验证与未验证 |
|---|---|---|---|---|---|
| Metaflow branding/version | M 有独立 product/upstream 双版本模块、UI/PWA/SW | N 仍是 SuperSplat package version | **Port** | 中 / M | M 浏览器可见；N base merge 尚未做 |
| timeline 100000 帧 | M 上限 100000 | N 增加 loop、nice ticks、minor ticks、越界 key、single-key 修复，但默认上限仍需核对 | **Port** | 高 / M | M 100000 已输入；N 组合行为未跑满 |
| PLY / compressed PLY / SPLAT | M 继承 B 导出 | N 使用 transform `3.1.7` | **Replace** 底层 writer，保留文件名/提示合同 | 高 / M | M 导出成功；N 大文件、无效点与取消未完整验证 |
| SOG | M 继承 B，iterations UI/输出为产品合同 | N inline worker、streamed input、transform `3.1.7` | **Replace + Port** | 高 / L | M SOG 为 8 files、iterations 10；N 往返/Viewer视觉仍不足 |
| HTML Viewer | M 继承 B HTML export | N 修复空导出并使用新 transform/Viewer export | **Replace**，但输出命名/settings 必须保持兼容 | 高 / M | M HTML 浏览器打开；N 输出未跑完整兼容矩阵 |
| Package Viewer | M 继承 B zip package | N 新 export 链 | **Replace + Port** | 高 / M | M package 打开；包内 Viewer 为 1.26.2；N 包内版本/结构待验 |
| Metaflow legacy ZIP | M 嵌入 `supersplat-viewer 1.26.3`，含 index/css/js/settings/scene.compressed.ply | N 无等价 Metaflow 路径 | **Port** | 高 / M | M 包打开；必须继续用 current Viewer/legacy fixtures 验收 |
| settings-only | M 直接输出 settings.json | N 无同名产品选项 | **Port** | 中 / S | M schema 内容已检查；无效/取消路径待验 |
| SPZ export | M/B 无 | N 原生 SPZ | **Keep (N)** | 中 / S | N SPZ magic `NGSP` 已验证；M 不具备 |
| 360° image/video | M/B 无完整 equirect contract | N 支持 equirect WebP 与 video | **Keep (N)** | 高 / L | UI/静态存在；真实 360 media、mux/cancel **未验证** |
| camera info/edit/FOV | M 为 B 相机行为 | N live/edit position/target；FOV auto-dolly default off；多项 camera fix | **Keep (N) + Port M shortcuts** | 高 / M | Surtr 运行；完整 camera key/orthographic/FOV 矩阵未验 |
| timeline loop/ticks/key overwrite | M 只有本地 frame cap | N 完整 timeline UX | **Keep (N) + Port cap** | 高 / M | N UI 可见；loop/save/reopen 尚未完整跑 |
| LCC2 / streamed SOG | M/B 只覆盖旧 project/SOG 路径 | N LCC2、通用 LOD dialog、streamed SOG/folder fix | **Keep (N)** | 高 / L | 静态与上游代码；真实 LCC2 fixture **未验证** |
| preferences | M 无持久化产品偏好合同 | N localStorage preferences | **Keep (N)** | 中 / M | N UI可见；跨 locale/clear-storage 未验 |
| live locale | M 有 9 locale，但切换依赖既有行为 | N 无 reload 切换与 key consistency check | **Replace** locale controller，Port M 文案 | 中 / M | 中/英切换成功；切回时 `Unselected Color` 仍为英文，需修复 |
| Orient / grid plane | M 无 | N 3-point plane、local frames/dimensions、XY/XZ/YZ | **Keep (N)** | 高 / L | UI可见；真实三点、undo/redo、save/reopen 未验 |
| selection gizmo/intersect | M 为 B selection | N intersect、数值 volume、selection gizmo、Box Select/Unlock fixes | **Keep (N)** | 高 / M | 基础 select/transform/undo/redo 通过；新工具组合未完整验 |
| PNG/JPEG/WebP 与 8K | M/B 旧 image export | N PNG/JPEG、WebP、8K | **Replace** | 高 / M | capability 与内存/取消/浏览器下载未完整验 |
| capability preflight / error UI | M/B 错误路径较少 | N WebGPU SOG/viewer error、video preflight | **Keep (N)** | 高 / M | 静态与 UI；WebGPU unavailable、codec unavailable、用户取消未验 |
| Service Worker | M cache name、version.json、9 locale | N 上游 SW 随静态文件变化 | **Port** | 高 / M | M `/editor/` 当前运行；升级后的 cache migration 未验 |
| `/editor/` base/runtime contract | M 源码和 `metaflow-editor/` artifact 协作 | N 是通用 root app | **Port** | 高 / L | M 页面打开；future source→artifact staging 未实施 |
| Viewer export compatibility | M 导出可被当前 Viewer 请求并到 100% | N 改 transform/export | **Conflict**：必须先定义并通过“可见且构图正确”断言 | 极高 / L | 当前 M 导出在 Viewer 无 console error但视觉接近黑/小且畸变；仅“能打开”不通过 |
| Node/build runtime | M/B 顶层 Node `>=20.19.0` | N 顶层仍写 20，但 transform3.1.7/concurrently10要求22 | **Conflict**：推荐 future Editor build 使用隔离 Node 22，仓库根 `.nvmrc` 保持20；需正式化后再 Adopt | 高 / M | Node20 install/build通过但有 unsupported-engine warning，不视为受支持合同 |

## 5. 构建、lint 与依赖证据

三方均在 `.codex-work/tmp/upstream-review-2026-08-10/editor/` 的一次性副本运行，未污染 references。

| 对象 | Node | install/lint/build | build 时间 / max RSS | npm audit |
|---|---|---|---|---|
| B `v2.28.0` | `20.19.0` | 通过 | 44.41 s / 约 1.626 GB | 9：7 high、2 critical |
| M `1.1` | `20.19.0` | 通过 | 40.80 s / 约 1.716 GB | 9：7 high、2 critical |
| N `v2.32.3` | `20.19.0` | 通过，但 install 有 Node engine warning | 42.90 s / 约 1.631 GB | 6 high |

N 的 locale consistency 检查通过：8 个翻译 locale 与 325 个 English keys 对齐。该结果不否定浏览器里 `Unselected Color` 在切换后的显示问题；key 数一致和运行时绑定正确是两件事。

## 6. 浏览器、交互、产物与 Viewer 兼容证据

### 6.1 项目载入与编辑

| 对象/素材 | 结果 | Console / network | 证据 |
|---|---|---|---|
| B + Surtr（1,476 splats） | 项目加载、基础视图正常 | 无阻断错误 | [B Surtr](evidence/editor/upstream-editor-v2.28.0-surtr.png) |
| M + `ggc_camera_only.ssproj` | 小型 camera-only 项目打开 | 无阻断错误 | [M ggc](evidence/editor/metaflow-editor-1.1-ggc-camera-only.png) |
| M + `Surtr.ssproj` | 选择、移动、undo/redo、timeline 输入、保存并重开通过 | 无阻断错误 | [M Surtr](evidence/editor/metaflow-editor-1.1-surtr.png) |
| M + `Yor2.ssproj`（约 487 MB、103,556 splats） | 大型项目完成加载并可操作 | 加载时间点内无阻断 console error；没有做峰值内存长期采样 | [M Yor2](evidence/editor/metaflow-editor-1.1-yor2-487mb.png) |
| N + Surtr | 项目加载；Orient/preferences/新版 UI 可见；中英即时切换无需 reload | 切回后 `Unselected Color` 仍为英文 | [N Surtr](evidence/editor/upstream-editor-v2.32.3-surtr.png) |

N 的 import picker/loader 接受 PLY、compressed PLY、SPLAT、SOG 与 SPZ；这证明格式入口可运行，不证明每个大文件、无效点或 roundtrip 保真已完成。

### 6.2 M 导出矩阵

| 导出 | 实际结果 | 结构/命名检查 | 未验证 |
|---|---|---|---|
| PLY | 成功 | 文件名与 PLY header 可读 | 大文件、NaN/Inf 与取消 |
| compressed PLY | 成功 | compressed header/文件名正确 | 与 N writer 的数值偏差 |
| SPLAT | 成功 | 文件存在并可再次导入 | SH 丢失语义需明确 |
| SOG | 成功 | 8 files，iterations 10，settings/scene 输出存在 | 多 iterations 质量曲线、错误恢复 |
| HTML | 成功 | 单 HTML 可打开 | N export 与 current Viewer 视觉兼容 |
| Package | 成功 | zip 可打开，嵌入 Viewer `1.26.2` | 新 N 包结构、cache |
| Metaflow legacy ZIP | 成功 | `index.html/index.css/index.js/settings.json/scene.compressed.ply`；嵌入 Viewer `1.26.3` | 大文件、取消、错误提示 |
| settings-only | 成功 | JSON 文件名与 schema 结构检查 | 无效字段与用户取消 |
| SPZ | M 无该导出 | N 单独验证可导出 | N→M Viewer/第三方消费端完整兼容 |

浏览器打开证据：[HTML](evidence/editor/metaflow-export-html-open.png)、[Package](evidence/editor/metaflow-export-package-open.png)、[legacy ZIP](evidence/editor/metaflow-export-legacy-open.png)。原始 DOM/console 见 [`evidence/editor/raw/`](evidence/editor/raw/)。

### 6.3 当前 Viewer 可打开性不是视觉兼容

M 导出的 SOG/settings 被当前 Metaflow Viewer 加载到 100%，且 console 没有阻断错误；但首帧画面接近全黑/目标极小，手工调整后仍呈现构图或尺度异常。这是本轮最重要的 Editor 验收失败：

- [初始可打开但不可接受的视觉状态](evidence/editor/metaflow-viewer-opens-editor-sog.png)
- [调整视角后的异常构图](evidence/editor/metaflow-viewer-opens-editor-sog-framed.png)

因此“HTTP 200 + loading 100% + 无 console error”只能证明协议入口存在，不能证明 Editor→Viewer 交付可用。这个兼容检查属于 Editor 验收，不构成 Viewer Adopt 的决策门。

## 7. 失败与未运行项

- 真实 360° image/video、8K video、mux finalize、codec/WebGPU preflight、用户取消：**未验证**。
- camera info edit、FOV auto-dolly off、single-key camera、timeline loop/ticks/overwrite key 的完整组合：**未验证**。
- LCC/LCC2 与 streamed SOG 的真实本地 fixture、folder drag/drop、大容量 streaming：**未验证**。
- Orient 三点、grid plane、selection gizmo 与 undo/redo/save/reopen 的完整组合：**未验证**。
- 无效点、NaN/Inf、zero quaternion、SOG iterations 质量、导出错误提示与磁盘失败：**未验证**。
- N 在受支持 Node 22 的 clean build 与浏览器矩阵：本轮只在 Node20构建；**未验证**。
- M 导出→当前 Viewer 的视觉兼容：**已验证失败**，不是未运行。
- XR 不属于 Editor 本轮矩阵；没有把 Viewer XR 证据复用到 Editor。

## 8. 决策：Defer

### 8.1 为什么不是 Adopt

N 的新增能力值得升级，但以下四项任一存在都足以阻止 Editor Adopt：

1. 顶层 `engines.node >=20.19.0` 与关键 transitive tools 的 Node 22 要求冲突，当前 Node20 build 只是“碰巧成功”，不是可承诺的受支持链；
2. Editor 导出被当前 Viewer 请求成功却视觉不可接受，尚未定位是 camera/settings/scale/model transform 还是 Viewer framing；
3. 360、LCC2、camera/timeline、新 selection、preflight、取消/错误和大输出矩阵没有完成；
4. future active source 的目录和 cutover 顺序尚未通过一个新 Change 固定，不能借升级顺手恢复旧 PR。

### 8.2 重新评估触发条件

最迟复核日期为 **2026-09-15**；若以下条件提前全部满足，应立即重新评估，无需等日期：

| Trigger | 可接受证据 |
|---|---|
| E-01 Editor runtime 固定 | 新的 Editor Change 明确使用隔离 Node `22.x` 构建，根 `.nvmrc` 仍为 `20.19.0`；clean install/lint/build 在该 runtime 无 engine warning，或上游依赖重新支持20并经验证 |
| E-02 Viewer 视觉兼容闭环 | 使用固定 Surtr 与至少一个大型 project，Editor export→当前 Viewer 达到可见、bounds/camera/settings 正确的截图与数值断言；仅 loading 100% 不合格 |
| E-03 缺失运行矩阵完成 | 真实 360 image/video、LCC2/streamed SOG、camera/timeline、Orient/grid/selection、无效点、取消/错误和大输出均有通过或明确拒绝结论 |
| E-04 source/cutover Spec 接受 | 新 Change 采用下节目录建议，明确 build→artifact→rollback；不恢复/重开/rebase PR #25 |

证据闭环预计需要 3–6 个工程人日；真正升级的工作量只有在重新作出 Adopt 后估算，当前粗略范围为 10–16 个工程人日，不作为承诺。

## 9. Future active source 目录建议

结论是：**保留 MF-21 的 source/snapshot separation 原则，放弃旧 PR #25 的具体实现历史；未来从最新 `origin/main` 重新实施。**

建议 future topology：

```text
metaflow-editor-src/     # 新的唯一活跃 Editor 源码，未来 Adopt 后创建
metaflow-editor/         # 继续只保存 /editor/ 部署产物与 version.json
references/
├── supersplat-v2.28.0/  # 不可变纯上游当前基准
└── supersplat-v2.32.3/  # 不可变纯上游候选
```

重新实施时必须遵守：

1. 从当时最新 `origin/main` 新建独立分支，不 checkout、rebase、恢复或 reopen 已关闭 PR #25；
2. 先创建 `metaflow-editor-src/` 并复制/生成可审查的 active source，再逐能力 port M，而不是把 reference 变成可写源码；
3. 根目录 `supersplat-v2.28.0/` 在新源码完成所有 Gate 前继续是当前 active source；切换必须是单独、可回退的提交；
4. `metaflow-editor/` 始终是显式 staging 产物，不能与 source 混为一目录；
5. cutover 后再由正式发布 Change 决定旧 active source 的归档位置，不能在未验证时预先删除。

## 10. Defer 后的边界

- 本报告不生成 Editor 实现分支或 decision-complete Adopt Plan；满足 E-01～E-04 后必须重新查询 stable release、重新作出 Adopt/Defer/Skip，再生成当时唯一的 Spec/Plan。
- 当前继续支持 B `v2.28.0` + M `1.1`；回退目标就是现有根目录 active source 与 `metaflow-editor/` artifact。
- 不更新 Editor Version History、Ledger、`version.json` 或 `/editor/` 部署。
- 不把 Transform CLI 的 Adopt 当作修改 Editor `@playcanvas/splat-transform` 的授权。
