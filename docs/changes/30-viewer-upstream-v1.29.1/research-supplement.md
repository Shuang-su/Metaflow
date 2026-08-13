# MF-30 Viewer v1.29.1 深度研究补充

## 1. 来源、边界与结论

本补充整理自用户指定的 Codex 研究任务
`codex://threads/019ff933-fc9b-7063-9f4e-dc5cbee87df2`，并在准备 Issue/PR
时重新核对官方 release、tag diff、Issue、PR 与固定快照。线程内容是研究输入，本文才是随
MF-30 进入仓库、可由源码和外部链接复核的长期记录。

比较轴固定为：

| 对象 | 版本与身份 | 角色 |
|---|---|---|
| 旧上游基线 B | Viewer `v1.26.2`，commit `f1327060f0a17c342de518712aabf7f30f2747c5`；PlayCanvas `2.19.2` | 当前已发布 Viewer `5.18.1` 的上游 lineage |
| 当前 Metaflow M | `metaflow-viewer/`，含 route、双加载链、reveal、移动/XR、Analytics、tiled voxel 等本地能力 | 唯一活跃 Viewer 源码 |
| 新上游 N | Viewer `v1.29.1`，commit `3a61fa606e12640b1e87f9a733ed43d7fbc5d925`；PlayCanvas `2.21.3` | 本次升级目标 |

官方比较区间 [`v1.26.2...v1.29.1`](https://github.com/playcanvas/supersplat-viewer/compare/v1.26.2...v1.29.1)
包含 26 个提交和 70 个变更文件。账面差异混入 ESLint、Prettier 和 lockfile 重写，不能把
文件数直接当成功能数。累计价值来自 `v1.26.4`、`v1.27.x`、`v1.28.0`、`v1.29.0`
与 Engine `2.20/2.21`；`v1.29.1` 自身只在运行时修正 SH 阈值并提升版本号。

研究结论是：

1. 这是 streamed GSplat 渲染正确性、空闲功耗、资源生命周期和自动化能力升级；
2. 这不是 voxel conversion 或 voxel streaming 升级；
3. Metaflow 的 tiled voxel runtime 没有上游等价实现，必须保留；
4. Viewer、Editor 和 Transform 继续独立决策；
5. 本次最终按用户决策采用 `v1.29.1` SH `1°/0.2°`，而不是本地候选早期保留的 `4°/2°`。

## 2. 逐版本累计变化

| Viewer release | 日期 | PlayCanvas | 影响本次产品的变化 |
|---|---:|---:|---|
| [`v1.26.3`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.26.3) | 2026-06-16 | `2.19.7` | 依赖维护，没有 Viewer 运行时功能变化 |
| [`v1.26.4`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.26.4) | 2026-06-30 | `2.20.2` | on-demand rendering、near-clip clamp、LOD range 迁到 `GSplatComponent`、可选 debug engine |
| [`v1.27.0`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.27.0) | 2026-07-01 | `2.20.4` | `window.captureFrame()` GPU 超采样截图 |
| [`v1.27.1`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.27.1) | 2026-07-08 | `2.20.6` | backend-aware WebGPU/WebXR 检测 |
| [`v1.28.0`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.28.0) | 2026-07-20 | `2.20.6` | Annotation 显隐、`showAnnotations` 偏好持久化、语言/配置链整理、heatmap 文档澄清 |
| [`v1.29.0`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.29.0) | 2026-08-10 | `2.21.3` | work-buffer 参数在首批 streaming 数据前生效，性能切换请求帧，构建/格式工具更新 |
| [`v1.29.1`](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.29.1) | 2026-08-12 | `2.21.3` | SH 阈值从 `2°/0°` 修正为 `1°/0.2°` |

## 3. 大场景 GSplat 改进

### 3.1 真正的 on-demand rendering

旧基线依靠四秒 idle window 维持连续渲染。新模型在加载期间保持
`autoRender=true`，当 legacy 首个有效帧或 streaming `ready && loading === 0` 后切换
为 `autoRender=false`，随后由 GSplat `frame:request`、相机矩阵变化或显式
`renderNextFrame` 驱动。参见 [Viewer PR #265](https://github.com/playcanvas/supersplat-viewer/pull/265)。

对 Metaflow 的迁移代价是：radial reveal、synthetic animation、Annotation、碰撞/debug
overlay、性能模式、XR 和 capture 必须各自请求帧。本次实现逐项补齐后才移除四秒兜底。

### 3.2 near clip 与组件级 LOD range

大包围盒场景可能把 near plane 推到相机前方很远。`v1.26.4` 把计算结果 clamp 到不超过
`1.0` 个场景单位，避免用户附近 splat 被裁掉。LOD range 同时从 scene 全局默认迁到具体
`GSplatComponent`，避免多 GSplat 资产共享错误的范围。

### 3.3 work-buffer 参数时序

`minContribution`、`alphaClip`、`antiAlias`、debug 以及 SH 阈值会进入持久 work-buffer
数据。旧顺序在第一批 splat 创建 work buffer 后才应用性能设置，导致早期 chunk 和后续
chunk 行为可能不一致。`v1.29.0` 在 streaming 启动前应用这些参数，并在性能切换后主动
请求一帧。参见 [Viewer PR #284](https://github.com/playcanvas/supersplat-viewer/pull/284)。

## 4. SH `colorUpdateAngle` 决策

| 版本/阶段 | performance | quality | 含义 |
|---|---:|---:|---|
| 旧 `v1.26.2` / Metaflow 首轮候选 | `4°` | `2°` | 较少触发视角相关颜色重算 |
| 上游 `v1.29.0` | `2°` | `0°` | quality 零阈值会造成高成本的每帧 reevaluation |
| 上游 `v1.29.1` / 最终 MF-30 候选 | `1°` | `0.2°` | 避免零阈值，同时更积极更新视角相关颜色 |

上游 [Issue #286](https://github.com/playcanvas/supersplat-viewer/issues/286) 指出零阈值会让
所有相关 splat 每帧重新评估 SH；[PR #287](https://github.com/playcanvas/supersplat-viewer/pull/287)
将其修正为 `1°/0.2°`。阈值越小，视角相关颜色响应越及时，但小幅相机移动可能触发更多
work-buffer 更新，因此它是画质响应与 GPU 工作量之间的策略选择，不是无条件性能提升。

PlayCanvas 的 per-octree-node SH 局部更新并不是本次 Engine `2.19.2→2.21.3` 才获得的
新能力；[Engine PR #8593](https://github.com/playcanvas/engine/pull/8593) 的 merge commit
已经是 `v2.19.2` 的祖先。该 PR 提到约 40M splat、强制全 LOD 下 SH pass 从约 `10 ms`
降到 `<1 ms`，只能用于解释参数机制，不能写成本次升级或 Metaflow 场景的实测收益。

本地早期候选对 `2°` 与 `0.2°` 做过固定相机 A/B：31 次 frame commit，截图 SSIM
`0.999902`、平均 PSNR `65.50 dB`。由于预热、执行顺序、streaming cache 和后台工作没有
随机化，耗时被明确拒绝作为 benchmark。2026-08-13 用户在审阅研究后明确选择与
`v1.29.1` 对齐，因此最终实现使用 `1°/0.2°`，并在 WebGPU/WebGL 两种 backend 下验证
quality/performance 切换后的运行时值。

## 5. Capture、Annotation 与 XR

- `captureFrame` 使用 offscreen target 和 GPU supersample/downsample，支持 WebGL/WGSL，
  通过串行队列避免并发调用争夺相机；成功或失败都恢复相机、动画和 render target。
- Annotation 新增品牌化显隐设置、`showAnnotations` localStorage、无 annotation 隐藏设置行、
  关闭时收起 tooltip，并保持九个 locale 的 key parity。
- XR 采用 backend-aware capability detection；可用 WebGPU XR 时直接进入，不可用但 WebGL
  可用时保留 reload fallback。Metaflow teleport/smooth/snap navigation 和品牌 UI 不被覆盖。

## 6. Engine `2.19.2→2.21.3` 的相关收益

只统计进入 Viewer GSplat/SOG/asset/XR 链路的变化：

- on-demand 下 GSplat streaming 仍可推进，新数据准备好后请求帧；
- multi-file LOD 的请求并发调度更受控；
- SOG texture upload 后释放 archive 内存；
- load 中取消、unload、reload、streaming world detach 和 device restore 的稳定性修复；
- streamed placement/work-buffer consumer 更新修复；
- WebGPU、GPU sort、AA、XR stereo/frustum 与部分 GPU hang 修复。

Engine 底层出现 SPZ/KHR gaussian 能力不等于 Metaflow Viewer 已建立新的 URL、route、schema
或上传格式合同；本次不宣称新增这些公共格式。

## 7. 明确不属于 Viewer v1.29.1 的能力

### 7.1 没有新增 voxel conversion

大型 voxel processing 优化属于 `@playcanvas/splat-transform v3.1+`，不是 Viewer。
Transform 的 typed-array map、cleanup、octree direct path 只改善离线转换；启用 exterior/floor
fill、navigation carve 或 collision mesh 时仍可能需要完整可变 voxel grid。

### 7.2 没有新增真正的 voxel streaming

官方 Viewer 仍完整 `fetch()` 单对 `.voxel.json + .voxel.bin`，没有 Range、`206`、page
manifest、camera-driven voxel residency、eviction、voxel LOD 或 partial decode。Transform voxel
writer 也没有生成这些运行时协议。

### 7.3 Metaflow tiled voxel 必须保留

Metaflow 通过 `voxel-tiles.json`、相机位置周围 `3×3` tile、远 tile 移除、缺 tile 局部降级和
`metaflow-rz180` 坐标策略处理 Dayun/Bijiashan。每个 tile 内部仍是完整 voxel 文件，因此应
准确称为“空间分片、按位置加载的 tiled voxel collision”，而不是 byte-range/page streaming
voxel。Viewer v1.29.1 没有等价能力，不能替换本地 collision 层。

## 8. 产品含义与后续边界

MF-30 可以宣称：

- streamed GSplat 渲染/LOD/work-buffer 正确性升级；
- 空闲 on-demand 渲染；
- PlayCanvas 资源生命周期与 GPU 稳定性累计修复；
- `captureFrame`、Annotation preference、backend-aware XR 和有界初始资源重试；
- 保留 Metaflow route、settings、reveal、移动端、Analytics 和 tiled voxel。

MF-30 不可以宣称：

- 新增 voxel conversion 或流式 voxel；
- Viewer 自动支持新的 SPZ/KHR 上传/route 合同；
- Editor 或 Transform 已随 Viewer 一起升级；
- 浏览器移动 viewport 等于 iOS/Android 真机；
- XR API detection 等于沉浸式硬件验证；
- PR 候选等于已经部署和观察的生产发布。

若未来研究真正的 streaming voxel，应单独设计 page/tile manifest、优先级、取消/重试、
byte-budget LRU、hysteresis、hash/schema/version、缺块安全边界和 CDN Range/CORS 合同，不把
它隐含进本次 Viewer 升级。
