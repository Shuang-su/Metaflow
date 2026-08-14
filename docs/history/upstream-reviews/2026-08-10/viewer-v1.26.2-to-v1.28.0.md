# Viewer 三方审查：v1.26.2 / Metaflow 5.18.1 / v1.29.1

> **独立决策：Adopt（实现与验证完成，Viewer 5.19.0 PR 候选准备中，生产未发布）。** 文件名保留原计划的 `...to-v1.28.0` 稳定入口；执行期间出现的 `v1.29.0` 和实施预检出现的 `v1.29.1` 均按停止条件固定并扩入真实比较区间，`v1.28.0/v1.29.0` 作为不可变中间快照。实现结果、冲突定案、深度研究和浏览器证据见 [MF-30 evidence](../../../changes/30-viewer-upstream-v1.29.1/evidence.md)、[conflict register](../../../changes/30-viewer-upstream-v1.29.1/conflicts.md) 与 [research supplement](../../../changes/30-viewer-upstream-v1.29.1/research-supplement.md)。

## 1. 对象、身份与结论边界

| 角色 | 对象 | 精确身份 |
|---|---|---|
| B：当前上游基准 | `references/supersplat-viewer-v1.26.2/` | tag `v1.26.2`；commit `f1327060f0a17c342de518712aabf7f30f2747c5`；tree `21469f8e5944e60c4f02fd8b47e97e4a38946ef0`；83 tracked files |
| M：审查时 Metaflow | `metaflow-viewer/` | 审查基点 Viewer `5.18.1` / 上游 `v1.26.2`；唯一活跃 Viewer 源码。MF-30 分支现已形成 `5.19.0` PR 候选并移植至 `v1.29.1 / PlayCanvas 2.21.3`；生产仍未发布 |
| N：最新候选 | `references/supersplat-viewer-v1.29.1/` | tag `v1.29.1`；tag object `7bfbc192cba2cceedaffc7b9a9738c59af6de022`；commit `3a61fa606e12640b1e87f9a733ed43d7fbc5d925`；tree `671059c4b4a3693115ad010207b66312f5cbbc8c`；85 tracked files |
| 区间中间快照 | `references/supersplat-viewer-v1.28.0/`、`references/supersplat-viewer-v1.29.0/` | 保留用于定位 annotation/heatmap、streaming 参数时序与 `colorUpdateAngle` 最终 patch 的边界 |

静态目录差异：B→N 为 70 files、4,768 insertions、2,439 deletions，共 26 个上游 commit；B→M 为 72 files、9,729 insertions、4,966 deletions。行数包含格式、测试和依赖文件，不能单独代表功能工作量。

Adopt 的含义是：以 N 的上游行为为输入，分阶段移植到 `metaflow-viewer/`，保留所有明确分类的 Metaflow 契约。它不允许把 N 目录覆盖到活跃源码，不修改 `references/**`。后续授权已经允许准备 `5.19.0`、Ledger、Issue 和 Draft PR；merge、tag 与 deploy 仍不在范围内。

## 2. 证据方法与时间

- 官方 release 与 compare 区间最后查询：2026-08-13（Asia/Shanghai）；`v1.29.1` 仍为 latest stable。
- 静态证据：精确 tag/commit 快照、B→N、B→M、M↔N 文件与行为比较。
- 构建证据：三个上游节点与 M 均复制到 `.codex-work/tmp/upstream-review-2026-08-10/viewer/` 后运行；没有在 `references/**` 内安装或构建。
- 浏览器证据：真实 Metaflow data、桌面与移动 viewport、WebGL 与本机可用 WebGPU；原始 DOM/console 记录位于 [`evidence/viewer/raw/`](evidence/viewer/raw/)。
- XR 硬件不可用，因此只验证入口、能力检测和非 XR 回归；没有把静态阅读写成 XR 运行结论。

## 3. B → N：完整上游版本区间

| 版本 | Added | Changed | Fixed | Breaking / 迁移影响 |
|---|---|---|---|---|
| [`v1.26.3`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.26.3) | 无产品功能 | 常规依赖更新 | 依赖维护 | 无声明式 breaking；锁文件变化需重新审计 |
| [`v1.26.4`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.26.4) | opt-in debug engine build | LOD range 迁到 `GSplatComponent`；GSplat 改为 on-demand rendering；camera near clip 被 clamp；依赖更新 | 降低无变化帧的持续渲染成本 | 直接触及 M 的 reveal、LOD、首帧和 debug 路径；不能整文件覆盖 |
| [`v1.27.0`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.27.0) | `window.captureFrame`，支持 GPU supersampled headless capture | PlayCanvas 升到 `2.20.4` | — | 新全局 API 与 M 的渲染调度必须共同验证 |
| [`v1.27.1`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.27.1) | WebGPU 下的 WebXR backend-aware detection | 依赖更新 | WebGPU renderer 不再被旧能力判断错误排除 XR | 与 M 自定义 XR navigation 重叠；需组合而非二选一 |
| [`v1.28.0`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.28.0) | sticky “Show Annotations” 设置开关 | 明确 heatmap URL 参数语义 | annotation 显隐状态可持久化 | 增加 localStorage/UI 合同；与 M locale/settings 合并 |
| [`v1.29.0`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.29.0) | — | PlayCanvas `2.20.6 → 2.21.3`；ESLint config v3 beta、Prettier 与依赖/security 更新 | 在 streaming 启动前应用 work-buffer 的 `minContribution`、`alphaClip`、`antiAlias`、`debug` 参数；性能设置变化触发 `app.renderNextFrame` | PC `2.21.3` 是本轮新增的主要回归面；streaming 修复应优先移植，不能只停在 `v1.28.0` |
| [`v1.29.1`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.29.1) | — | streaming SH 更新阈值从 `performanceMode ? 2 : 0` 改为 `performanceMode ? 1 : 0.2`；package/lock 版本更新 | 修复 quality 零阈值造成的每帧 SH reevaluation | 与 M 已发布的 `performanceMode ? 4 : 2` 策略冲突；早期候选先保留本地值并 A/B，2026-08-13 后续产品决策明确改为上游 `1/0.2` |

区间最终依赖差异：PlayCanvas `2.19.2 → 2.21.3`；`@playcanvas/eslint-config 2.1.0 → 3.0.0-beta.8`；新增 Prettier `3.9.6`；TypeScript 保持 `5.9.3`。上游没有声明 URL/settings breaking change，但 M 的 settings-v2 运行失败证明“没有 release-note breaking”不等于兼容。

## 4. B → M 与 M ↔ N：逐能力矩阵

处置词含义：`Keep` 为保留现有 M 行为；`Port` 为把 M 行为重新落到 N 已变化的代码面；`Replace` 为用 N 的等价或更完整实现替换本地实现；`Drop` 为明确删除；`Conflict` 为存在阻断性冲突且本报告必须给出解决方式。没有任何本地能力留作“实现时再决定”，也没有本地能力被归为 Drop。

| 功能区域 | B 行为 | M 行为 / 本地能力 | N 行为 | 处置 | 兼容风险 / 工作量 | 验证与未验证 |
|---|---|---|---|---|---|---|
| route、index、alias | 只解析显式 query | 从稳定 route/alias 查询 `data/index.json`，再解析 settings/content/environment/collision | 仍以 query 为主 | **Keep** | 高 / M | 四条真实 route 已运行；需要全 index route 自动回归 |
| legacy SOG | 单 SOG 加载 | 保留 legacy SOG、排序完成或超时后的首帧兜底 | 可加载 SOG，但 on-demand/engine 路径已变化 | **Port** | 高 / L | Cyrene 完整加载；需弱网、重试和 timeout 专项 |
| streaming LOD | 上游 streamed SOG | M 保留 loading 阶段、预算、reveal 与 streaming 状态机 | N 修复 work-buffer 参数生效时序；PlayCanvas 以入口身份选择 parser | **Port + Replace**：保留 M 状态机，采用 N 的参数初始化顺序，并由 `lod-meta.json` 身份选择 octree parser | 高 / L | 当前 9 条 streaming route 的入口未变化；Xunyangpai、Dayun、Bijiashan 已完成真实运行，Bijiashan 缺 tile 局部降级不阻断主体 |
| streaming SH 更新阈值 | B 默认值；没有 M 的 4/2 策略 | M 明确使用 `colorUpdateAngle = performanceMode ? 4 : 2` | N 使用 `performanceMode ? 1 : 0.2` | **Conflict → Replace**：按后续用户决策采用 N `1/0.2`；M `4/2` 仅保留为迁移前行为和 A/B 证据 | 高 / M | `cb4a3f1` 锁定源码与单测；WebGPU/WebGL 真实运行均确认 quality `0.2`、performance `1`。更小阈值可能增加小幅相机运动时的 SH 工作量 |
| 主体来源身份与 parser | B/N 由 `.sog`、`.ply`、`.json` basename/extension 选择 Engine parser | M 曾用 JSON 结构参与 legacy/streaming 判定，可能与 Engine 实际 parser 不一致 | N/PC `2.21.3`：`lod-meta.json` 为 octree，其他 JSON（含 `meta.json`）为 loose SOG meta | **Conflict → Replace**：入口身份决定 parser，结构只验证所选格式；保留公开 `legacy-sog` / `streaming-json` 两态 | 高 / M | 当前 87 条 `files.model` 逐字不变：9 streaming、78 SOG；6 个具备未选 streaming 候选的 Firefly route 继续使用既有 SOG；实际 LOD manifest 全部通过严格校验 |
| environment | 支持 environment | 环境单独加载且不阻塞主体首帧，route 可配置 | 基础支持保留 | **Port** | 中 / M | Xunyangpai 环境可见；需大环境弱网行为 |
| 首帧与 loading complete | 上游基础加载 UI | `frame:ready`、sort/LOD timeout、loading→visible→animation 顺序 | on-demand rendering 改变何时安排帧 | **Port** | 高 / L | Cyrene、Xun、Dayun 完成；必须增加“没有持续 render loop”回归 |
| radial reveal / LOD reveal | 无 M 的粒子揭示合同 | legacy、streaming、environment 分路径揭示，支持 `?noreveal` | 无等价能力；会受 GSplat 参数和 render-next-frame 影响 | **Port** | 高 / M | MF-30 在 Cyrene、Xunyangpai、Dayun、Bijiashan 运行并保存代表截图；未建立全资源像素阈值基线 |
| Orbit / walk / fly | 有基础相机模式 | route settings 控制 walk/fly，M 调整控制器、cursor 与退出策略 | camera/engine 接口继续演进 | **Port** | 高 / M | Xun fly、Cyrene/C2 Orbit 运行；手柄未实测 |
| single voxel collision | 有 voxel 基础 | 加载单一 voxel，WebGPU 查询与 debug overlay | 基础类存在 | **Keep + Port** | 中 / M | Xunyangpai single voxel 运行；CPU/WebGL collision 语义需复核 |
| tiled voxel collision | 无 | manifest、按位置装载、缓存、坐标转换与 active collider | 无等价能力 | **Keep** | 高 / L | Dayun 数值化 tile 切换与坐标映射、Bijiashan 缺 tile 局部降级和恢复均已运行；跨 tile 长时间漫游未覆盖 |
| voxel coordinate space | 单一上游空间 | 支持默认与 `metaflow-rz180`，tiled scene 有明确空间映射 | 无 M 兼容层 | **Keep** | 高 / M | Dayun/Bijiashan 目视；需数值化边界与法向 fixture |
| 相机与 synthetic animation 首次退出 | 上游退出策略 | 首次用户 Orbit 输入可退出 synthetic animation，并按资源策略隐藏/恢复 timeline | 无资源级策略 | **Keep + Port** | 高 / M | C2-Lib 实测 timeline/pause 隐藏、play 出现；触摸退出需重跑 |
| settings v1/v2 | 上游 schema v1/v2 | 扩展 post effects、loading、collision、route 产品字段 | N 的 `anyPostEffectEnabled` 假设字段存在 | **Conflict**：在 M 增加版本归一化/默认值适配，禁止要求现有资源重写后才可升级 | 高 / L | N 读取 Cyrene settings-v2 在 `postEffectSettings.*.enabled` 报错；这是 Adopt 的发布阻断项 |
| 桌面/移动输入 | 基础键鼠/触控 | M 修复 touch 尺寸、安全区、pointer/touch、游戏式移动 | N 无等价 Metaflow 调整 | **Port** | 高 / M | Cyrene 360×732 WebGL 运行；多点触控、iOS Safari 真机未验证 |
| XR | 基础 XR | M 有 `xr-navigation`、teleport/smooth/snap vertical 与产品 UI | N 修复 WebGPU XR 检测 | **Replace + Port**：采用 N 检测，保留 M navigation/UI | 高 / L | 入口和非 XR 回归通过；真实 XR session **未验证** |
| Analytics | 无 | PostHog/rrweb/自有事件、首帧与错误遥测、隐私/节流边界 | 无 | **Keep** | 中 / M | 52 项 M 测试含 analytics；本轮不向生产后端发送验证事件 |
| 品牌与产品导航 | SuperSplat 品牌 | Metaflow logo、域名、标题、分享入口 | SuperSplat 品牌 | **Keep** | 低 / S | 截图确认；需要无障碍名称回归 |
| locale | 上游 9 locale | M 为产品文案与新增控制补齐 locale | N 新增 annotation 文案并更新同一批 locale | **Port** | 中 / M | 当前中文/英文可见；所有 9 locale key 一致性需自动化 |
| voxel/reveal 调试工具 | 上游基础 debug | M 增加 voxel overlay、streaming/loading conflict、reveal 逃生参数 | N 有 opt-in Debug Engine 与 streaming debug 参数 | **Port + Replace**：保留运行时调试合同，并增加 `ENGINE=debug npm run build`；普通 build 仍解析 production export | 中 / M | production 与 Debug Engine 构建均通过；Debug 只用于本地诊断，不成为部署默认值 |
| on-demand rendering 与 near clip | 持续渲染旧路径 | M 依赖首帧、reveal 和调试主动调度 | N 以 on-demand 为准并 clamp near clip | **Replace**，同时为每个 M 动画/状态更新显式请求帧 | 高 / M | MF-30 已组合验证 legacy/streaming、reveal、animation、collision/debug、capture、WebGL/WebGPU；所有完成态均保持 `autoRender=false` |
| `captureFrame` | 无 | 无稳定公共 capture 合同 | `window.captureFrame` 可用 | **Replace**：采用 N API，不另造本地接口 | 中 / S | MF-30 已验证 WebGL/WebGPU、默认/非法尺寸、supersample、并发、动画 scrub、后处理和注入 readback 失败后的状态恢复 |
| annotation 显隐 | 没有 sticky toggle | M 保留 annotation 展示但无 N 的持久化开关 | UI 开关并写 `showAnnotations=false` | **Replace + Port**：采用 N 状态与 UI，合并 M locale/品牌 | 低 / S | N Xun active→inactive，localStorage 正确；route 切换持久性待自动化 |
| 用户偏好生命周期 | B 在 UI 初始化路径可写性能/Gaming Controls | M 启动时把设备推导默认写入 localStorage，并保留旧 `retinaDisplay` 映射 | N 启动只读取，用户修改后才持久化 | **Conflict → Replace**：`5.19.0` 一次性清理三个旧键，之后只持久化初始化完成后的状态变化；Annotation 不参与迁移 | 中 / M | 桌面/移动默认、迁移幂等、启动不写、用户修改恢复和 Annotation 保留均有自动测试；移动 viewport 不等于真机 |
| `Config.lang` | localization 自行从浏览器推导 | M 支持 9 locale 与 `?lang=`，但 URL 读取耦合在 localization 模块 | N 把语言纳入 `Config` 初始化链 | **Replace + Port**：入口把 `?lang=` 写入 `config.lang`；支持 programmatic config，再按 navigator、English 回退 | 低 / S | `zh-CN`、`pt-BR`、大小写/base-language、无效值和 programmatic config 已覆盖；九 locale 不改格式 |
| heatmap 参数 | 旧行为含糊 | M 不建立另一套公开定义 | N 文档明确 URL 参数 | **Replace** | 低 / S | 静态参数路径；没有合适 heatmap 视觉 fixture |
| PlayCanvas / 构建链 | PC `2.19.2` | PC `2.19.2`，M 增加 analytics 与 Playwright | PC `2.21.3`、ESLint config v3 beta、Prettier | **Conflict → Replace + Keep**：PC/工具升级和格式化分别提交，保留 Analytics、rrweb、Playwright 与多入口构建 | 高 / L | MF-30 clean install/fmt/lint/typecheck/publint/build 通过；collision、后处理、WebGL/WebGPU 与移动 emulation 已组合运行，XR 硬件仍未验证 |
| 生产 CSS source map | B/M production SCSS 未形成可交付的组合 map | M 的 Sass processor 只返回 CSS，map 链在 PostCSS 后丢失 | N 开启 CSS source map | **Replace**：发布有效 v3 map、单一相对 annotation，并拒绝本机绝对路径 | 低 / S | `index.css.map` JSON、引用、sources 路径与 `npm pack` 内容已检查；map 不计入运行时 gzip 增长 |
| production 依赖安全 | DOMPurify 间接版本未形成当前风险结论 | M 由 `posthog-js@1.386.8` 间接解析 DOMPurify | 锁文件更新但仍须按当前 advisory 核验 | **Replace**：只把间接 DOMPurify 精确更新为 `3.4.13`，不升级 PostHog、不运行 `npm audit fix` | 中 / S | clean install 后 `npm ls` 为 `3.4.13`，`npm audit --omit=dev` 为 0；开发依赖 4 high 分开披露 |
| npm package tree-shaking | B/M 未声明 `sideEffects` | root/settings exports 不应在 import 时初始化 DOM 或全局状态 | N/publint 建议声明副作用合同 | **Replace**：仅在 Node import、Rollup 与 packed-tarball Webpack 同意后声明 `sideEffects:false` | 中 / M | Node、Rollup、Webpack `5.109.2` 均验证 named/settings import 保留、bare import 可移除；Webpack 不进入 Viewer devDependencies |
| 双源默认与未来标签 | 无数据标签产品合同 | 当前 `files.model` 是每条 route 唯一运行时权威 | 上游 parser 能力不自动决定产品默认 | **Keep + scope boundary**：当前默认零变化；未来标签同时存在时以 streaming 为默认、highest-quality SOG 由用户切换 | 高 / L（未来） | 本 PR 不改 schema/UI/URL/运行时换源；未来必须处理旧主体释放、相机/动画、environment、collision、失败回退与移动内存峰值 |

本地能力的主要源码证据位于 [`metaflow-viewer/src/index.ts`](../../../../metaflow-viewer/src/index.ts)、[`viewer.ts`](../../../../metaflow-viewer/src/viewer.ts)、[`camera-manager.ts`](../../../../metaflow-viewer/src/camera-manager.ts)、[`collision/`](../../../../metaflow-viewer/src/collision)、[`settings.ts`](../../../../metaflow-viewer/src/settings.ts)、[`schemas/v2.ts`](../../../../metaflow-viewer/src/schemas/v2.ts)、[`xr-navigation.ts`](../../../../metaflow-viewer/src/xr-navigation.ts)、[`analytics/client.ts`](../../../../metaflow-viewer/src/analytics/client.ts) 与 [`voxel-debug-overlay.ts`](../../../../metaflow-viewer/src/voxel-debug-overlay.ts)。

## 5. 构建与自动测试证据

| 对象 | Node | 命令与结果 | 说明 |
|---|---|---|---|
| B `v1.26.2` | `20.19.0` | disposable copy `npm ci`、build：通过 | 没有把 Cyrene settings-v2 的运行失败误写成构建失败 |
| M `5.18` | `20.19.0` | install/build：通过；`node --test tests/*.mjs`：52/52 通过 | e2e fixture 使用一次性副本准备，产品目录未写入 |
| 中间 `v1.28.0` | `20.19.0` | install/build：通过 | annotation toggle 浏览器实测通过 |
| 中间 N `v1.29.0` | `20.19.0` | `npm ci`、`npm run fmt`、lint、typecheck、build：全部通过 | build 79.11 s，最大 RSS 949,870,592 bytes；npm audit 5 high；需在实现 Change 中处置而非自动修包 |
| 目标 N `v1.29.1` | `20.19.0` | 精确 tag/commit/tree/85 files/规范化摘要已验证；MF-30 活跃源码 clean install、fmt、lint、typecheck、publint、production/Debug build 通过；完整只读 fixture 的产品/resource/package tests 为 77/77 | SH 先经保守 A/B，再按明确产品决策采用 `1/0.2`；production audit 为 0；release-record 全量测试在 SHA 对齐后复跑 |

N 的 disposable build 只在 `.codex-work/` 副本中读取现有 data；`references/supersplat-viewer-v1.29.0/` 与 `references/supersplat-viewer-v1.29.1/` 本身保持无依赖、无 dist。

## 6. 浏览器、DOM、console 与 network 证据

| 场景 | Renderer / viewport | 观察到的行为 | Console / network | 证据 |
|---|---|---|---|---|
| M `/acg/fireflyfes38/cyrene` | WebGL 1280×720 | legacy SOG 完成、首帧可见、synthetic animation 和 voxel 路径正常 | 页面完成，无阻断错误 | [桌面 WebGL](evidence/viewer/metaflow-cyrene-desktop-webgl.png) |
| M Cyrene | WebGL 360×732 | 移动布局和触控控制可见，资源完成 | 页面完成，无阻断错误；真机手势未覆盖 | [移动 WebGL](evidence/viewer/metaflow-cyrene-mobile-webgl.png) |
| M `/acg/j05/xunyangpai` | WebGPU 1280×720 | streaming LOD、environment、single voxel、fly 完成 | 资源请求完成，无阻断错误 | [Xunyangpai](evidence/viewer/metaflow-xunyangpai-webgpu.png) |
| M `/shenzhen/dayun` | WebGPU | streaming/tiled voxel/LOD 可见，坐标方向正常 | 完成，无阻断错误 | [Dayun](evidence/viewer/metaflow-dayun-webgpu.png) |
| M `/shenzhen/bijiashan` | WebGPU | 主场景完成，tiled voxel 工作 | 两个 `x12_z7` tile 请求落到 SPA HTML，随后 JSON parse warning；主场景未中断 | [Bijiashan](evidence/viewer/metaflow-bijiashan-webgpu.png) |
| M `/sztu/c2-lib` | WebGPU | 第一次 Orbit 输入退出 synthetic animation；timeline/pause 隐藏并显示 play | 交互后状态符合资源策略 | [C2-Lib 退出](evidence/viewer/metaflow-c2-lib-after-first-orbit-exit.png) |
| B + Xun query | WebGPU | 模型正常可见；`captureFrame` 不存在，无 annotation toggle row | 仅非功能性资源提示 | [B Xun](evidence/viewer/upstream-viewer-v1.26.2-xunyangpai.png) |
| `v1.28.0` + Xun query | WebGPU | `captureFrame` 可用；annotation toggle active→inactive，localStorage 为 `showAnnotations=false` | 加载完成 | [v1.28 annotations off](evidence/viewer/upstream-viewer-v1.28.0-xunyangpai-annotations-off.png) |
| N + Xun query | WebGPU 1280×720 | 场景完整；loading hidden、canvas 1280×720、`captureFrame` 为 function、annotation toggle 持久化 | 唯一 console error 为 `favicon.ico` 404 | [N Xun](evidence/viewer/upstream-viewer-v1.29.0-xunyangpai.png) |
| B / `v1.28.0` / N + Cyrene settings-v2 | WebGPU | loading 显示到 100%，但控制和 Viewer 初始化未完成 | `TypeError: Cannot read properties of undefined (reading 'enabled')`，位置为 `anyPostEffectEnabled`；N 仍可复现 | [N Cyrene 失败](evidence/viewer/upstream-viewer-v1.29.0-cyrene-settings-v2-failure.png) |

原始 console 与 DOM 快照见 [`evidence/viewer/raw/`](evidence/viewer/raw/)。本次没有保留完整 HAR；network 结论仅限上表中实际观察的完成请求、404 与 tile parse warning，不宣称拥有请求瀑布的长期原始副本。

MF-30 实现后的完整必测 route、WebGL/WebGPU、移动 viewport、capture、annotation、retry、Analytics、missing tile 和 SH A/B 结果已单独归档到 [MF-30 implementation evidence](../../../changes/30-viewer-upstream-v1.29.1/evidence.md)。该记录区分了升级前 M/N 审查证据和移植后的组合运行证据，避免用后验结果改写原始三方观察。

## 7. 未验证与失败项

- XR 头显、immersive session、controller/hand input：硬件不可用，**未验证**。
- iOS Safari、Android Chrome 真机、多点触控、手柄：**未验证**；移动 viewport 不能替代真机。
- MF-30 已补 delayed SOG/environment、bounded retry、终态错误 UI 与 Analytics error-beacon 节流；没有做操作系统级带宽/丢包整形。
- B/N 直接读取 Cyrene settings-v2 的既有失败已由 MF-30 归一化层解决，现有数据没有重写。
- Bijiashan 缺失 tile 已验证为局部关闭 walk、主场景不中断、回到完整 tile 后恢复；没有修改缺失数据。
- `captureFrame` 已覆盖 WebGL/WebGPU、post effects、supersample、并发、动画 scrub 和注入 readback 失败后的恢复；没有把单机截图当作跨 GPU 字节稳定性声明。
- heatmap WebGL 受控降级已运行；真实 XR 仍未验证。

## 8. 决策：Adopt

### 收益

1. on-demand rendering、near-clip clamp 和 streaming work-buffer 参数时序修复直接改善性能与 streaming 正确性；
2. `captureFrame`、annotation 显隐持久化和明确 heatmap 参数增加可测试的公共能力；
3. WebGPU XR 能力检测修复可与 M 的 XR navigation 组合；
4. 依赖/security 更新把当前上游维护线推进到 PC `2.21.3`；
5. 偏好生命周期与 `Config.lang` 把设备默认、用户选择和可编程嵌入入口分开；
6. Debug Engine、有效 CSS map、production audit 清零与经过双 bundler 验证的 package metadata 补齐诊断和消费合同。

### 必须移植或替换

- 优先移植 `v1.29.0` 的 streaming 参数初始化顺序；在保留 M `4/2` 完成 A/B 后，按后续明确产品决策采用 `v1.29.1` 的 `1/0.2`；
- 采用上游 on-demand/near-clip、`captureFrame`、annotation toggle、heatmap 定义和 WebGPU XR 检测；
- 把 route/index、legacy/streaming 双路径、environment、首帧/reveal/LOD、walk/fly、single/tiled voxel、坐标空间、相机退出、settings v1/v2、移动输入、Analytics、品牌、locale 和 debug 工具移植到新的上游代码面；
- 增加 settings-v2 归一化层，使现有资源无需批量迁移即可继续打开；
- 将 PlayCanvas `2.21.3` 作为独立回归批次，不与大规模格式化混入一个提交。

### 风险、工作量与回退

- 风险：高。风险集中在 settings、first-frame/on-demand、streaming/reveal、collision 坐标、camera、mobile、XR 与 PC 大版本面。
- 估算：9–14 个工程人日，外加一次可获得 XR 硬件的验证窗口。估算不包含生产观察、全资源视觉基线重录或数据修复。
- 回退目标：实现分支基点 `origin/main` commit `dbbd0015a8d13d4380d100fad4e5121dc2b29746` 上的 `metaflow-viewer/` tree，即 Viewer `5.18.1`。回退不得修改不可变 reference，也不得回写已发布历史。

## 9. 后续唯一实现 Spec

以下 Spec 只适用于 Viewer Adopt，不约束 Editor 或 Transform。

### 9.1 范围

实施只允许修改 `metaflow-viewer/` 及其必要的 Viewer 测试、文档和发布元数据。后续授权允许准备 `5.19.0`、Ledger、Version History、Issue 与 Draft PR；`references/**` 内容、Editor、Transform、现有资源内容和生产环境仍不在范围。

### 9.2 可观察需求

| ID | 必须满足的契约 |
|---|---|
| V-01 | 所有当前 stable route、alias 和显式 query 继续按照 `data/index.json` 解析，URL 优先级不变。 |
| V-02 | legacy SOG 与 streaming LOD 双路径均可加载；environment 的加载不阻断主体首帧。 |
| V-03 | settings v1/v2 在进入 Viewer 前归一化；缺省 post-effect 字段不得导致异常；现有 Cyrene settings-v2 无需改文件即可打开。 |
| V-04 | first-frame、sort/LOD timeout、loading complete、reveal 和 synthetic animation 的事件顺序保持；on-demand 模式下每个动画/状态变化显式请求下一帧。 |
| V-05 | 采用 N 的 streaming work-buffer 参数时序；`minContribution`、`alphaClip`、`antiAlias`、`debug` 在 streaming start 前生效。 |
| V-06 | Orbit、walk、fly、首次退出 animation、桌面/移动输入保持当前可观察行为。 |
| V-07 | single voxel、tiled voxel、tile cache、缺失 tile 降级和 `metaflow-rz180` 坐标空间保持兼容。 |
| V-08 | 采用 upstream `captureFrame`，在 WebGL/WebGPU 上提供一致的成功/失败 Promise 合同，并补充自动测试。 |
| V-09 | 采用 upstream annotation toggle 与 localStorage key，合并 M locale/品牌；route 切换后状态保持。 |
| V-10 | heatmap 参数按 upstream `v1.29.1` 定义，不建立第二套同名语义。 |
| V-11 | 采用 upstream WebGPU XR detection，保留 M teleport/smooth/snap navigation；没有 XR 硬件证据时发布记录必须继续标记未验证。 |
| V-12 | Analytics 不得阻断资源加载、首帧或错误 UI；相同错误必须受节流，测试不得向生产后端写入。 |
| V-13 | 品牌、9 个 locale、debug/voxel overlay 和 `?noreveal` 逃生参数继续存在。 |
| V-14 | PlayCanvas `2.21.3` 升级后，WebGL/WebGPU、后处理、camera、collision 和 XR 类型检查均通过；不保留隐式旧 API shim。 |
| V-15 | references 保持摘要不变，构建与浏览器产物仅写 `.codex-work/tmp/`。 |
| V-16 | PR 候选使用 Viewer `5.19.0` 并同步 Version History/Ledger；生产仍为 `5.18.1`。Adopt 实现和候选记录都不等于已 merge、tag、deploy 或观察的稳定发布。 |
| V-17 | streaming SH 最终使用 performance `1°` / quality `0.2°`；旧 `4°/2°` 只保留为候选历史与 A/B 证据。 |
| V-18 | 性能模式、Gaming Controls 与旧 `retinaDisplay` 只在 `5.19.0` 首次运行时清理一次；启动不写偏好，初始化后的用户状态变化才持久化。 |
| V-19 | 主体入口身份决定 parser；`lod-meta.json` 才是 streaming octree manifest，`meta.json` 是 loose SOG meta；结构验证不得覆盖 parser。 |
| V-20 | 顶层主体和 environment prefetch 对 transient failure 共尝试 4 次，等待 `500/1000/2000ms`；永久 4xx 一次失败，environment 终态不阻塞主体。 |
| V-21 | production build 交付无本机路径的组合 CSS source map，production audit 为 0；`sideEffects:false` 必须有 Node、Rollup 和 packed-tarball Webpack 证据。 |
| V-22 | 当前 87 条 route 的 `files.model` 全部保持；未来 streaming/highest-quality 标签与换源在独立数据标签 Change 中实施。 |

### 9.3 明确非目标

- 不重构 `data/index.json` 或迁移现有资源 settings；
- 不升级 Editor，不改变 Editor 导出验收门；
- 不创建统一的 Viewer/Editor/Transform 升级门；
- 不复用或修改 upstream snapshot 作为活跃源码；
- 不把 Bijiashan 的缺失 tile 数据修复混入 Viewer 上游同步。

## 10. 后续唯一实现 Plan

1. **重新预检并隔离**：从实施时最新 `origin/main` 新建 `codex/viewer-upstream-v1.29.1`；重新查询 stable release。若高于 `v1.29.1`，先更新本 Spec 的候选与差异，不静默继续。
2. **固定兼容 fixture**：为 Cyrene、Xunyangpai、Dayun、Bijiashan、C2-Lib 建立不包含大资产的 route/settings/collision 契约 fixture；先锁定 V-01～V-07 的当前行为。
3. **移植低耦合上游能力**：以行为为提交边界移植 annotation toggle、heatmap 和 `captureFrame`；每项分别补测试，不整树复制。
4. **移植渲染/streaming 核心**：采用 on-demand、near-clip、LOD range 与 `v1.29.1` work-buffer 时序；为 reveal、first-frame 和 debug 的每个更新点补 `renderNextFrame`；先记录 M `4/2` A/B，再按后续产品决策采用 `1/0.2`。
5. **实现 settings 归一化**：在 schema 解析后、post-effect 访问前补完整默认值；Cyrene 失败 fixture 必须转绿，禁止批量改 data 规避。
6. **升级 PlayCanvas 与构建链**：独立提交 PC `2.21.3` 和必要类型/API 修复；格式化变化单独提交或限制 hunk，便于回退。
7. **重新叠加 M 能力**：route/index、legacy/streaming、environment、camera、mobile、collision/tiled/space、XR navigation、Analytics、brand/locale/debug 逐组通过 matrix，不以文件“看起来保留”代替行为验证。
8. **浏览器验收**：WebGL/WebGPU、桌面/360×732、五条 route；保存 screenshot、DOM、console 和 network。Bijiashan 缺 tile 必须表现为受控降级；新错误不得被 favicon 噪音掩盖。
9. **硬件与负面验收**：可获得 XR 硬件时跑 immersive session；另跑弱网、timeout、retry、error-beacon 节流、captureFrame 失败、settings 缺字段和 tile 404。
10. **实现 checkpoint**：只暂存 Viewer 相关文件并形成原子本地 commit。若未获远端/发布授权，到此停止；不 push、不建 PR、不更新版本、不部署。
11. **发布候选阶段**：已获授权准备 `5.19.0`、Version History/Ledger、Issue 和 Draft PR；merge 后回填最终 SHA，tag、staging/deploy、smoke 和观察仍须另行授权。失败时回退到实施分支基点的 `5.18.1` tree，并以新记录表达回退。

### 10.1 实现验证矩阵

| Gate | 最低通过条件 |
|---|---|
| Static | lint、typecheck、`git diff --check`；references validator 通过 |
| Unit | 当前 52 项测试全部保留，并增加 settings normalization、render scheduling、annotation persistence、captureFrame 与 tile failure 测试 |
| Build | Node `20.19.0` 的 clean install/build 通过；依赖审计逐项记录处置或接受理由 |
| Route | Cyrene、Xunyangpai、Dayun、Bijiashan、C2-Lib 全部达到各自 loading/interaction/collision 断言 |
| Renderer | WebGL 和本机 WebGPU 均通过；不以一个 renderer 代替另一个 |
| Viewport/input | desktop 与移动 viewport；正式发布前补 iOS/Android 真机或明确批准未验证风险 |
| XR | 有硬件才可标记通过；无硬件时必须保留未验证，不得阻塞非 XR Adopt 实现，但可以阻塞“XR 已验证”的发布声明 |
| Compatibility | 现有 settings v1/v2、legacy SOG、streaming LOD、single/tiled voxel 无需数据迁移 |

本报告的 Adopt 结论已在 `codex/viewer-upstream-v1.29.1` 分支实现并验证，并形成 Viewer `5.19.0` PR 候选。生产仍保持审查前的 Viewer `5.18.1`；merge、tag、部署和生产观察尚未发生。
