# 调试与性能分析

本指南用于定位 Viewer 的 route、下载、settings、渲染、LOD、碰撞或遥测问题。它不规定性能目标，也不替代行为变化所需的 E2E；目标是用最少变量留下可复现证据。

## 先固定基线

记录以下信息后再改变参数：

- 完整 URL、route 和对应的 `data/index.json` resource ID；
- Viewer display/package 版本及浏览器、OS、设备、WebGPU/WebGL；
- 首屏是否出现、失败发生在下载前还是首帧后；
- Network 中 index、settings、主体模型、environment 和 collision 的状态；
- Console 第一条相关错误，不要只截最后一次连锁异常。

使用无痕窗口或明确记录 cache 状态。不要一开始清理所有 cache、重装依赖或同时更换模型和 settings，否则无法判断哪项变化生效。

## 建立正确的本地 route 服务

稳定 route 需要 SPA fallback。按 [Viewer 快速开始](../getting-started/viewer.md) 分两个终端运行 watch 与 `serve -s`；`npm run develop` 当前只适合根路径或直接 query 调试，不能单独证明深层 route 可用。

## 用对照 URL 缩小范围

| 对照 | 能回答的问题 |
|---|---|
| 稳定 `/route` 与根路径 `?content=...&settings=...` | 是 index/route 问题，还是资源/settings 本身问题 |
| 默认 WebGPU 与 `?webgl` | 是否与渲染后端或设备能力相关 |
| 默认效果与 `?nofx&noreveal` | 是否与后处理或 reveal 阶段相关 |
| 流式默认与 `?fullload` | 是否只在渐进 LOD/首帧时序中出现 |
| 默认 budget 与 `?budget=3` | 是否与 splat budget 或设备资源有关 |
| 默认遥测与 `?noanalytics&noreplay` | 遥测本应 fail-open；若结果变化，记录为独立问题 |

`content` 会完全跳过 route/index 解析，因此这组对照不会继承 route 的 settings、viewer 策略或 Analytics resource 元数据。实际优先级见 [Viewer URL 参数](../reference/viewer-url-parameters.md)。

## Viewer 内置诊断开关

| 参数 | 用途 | 注意 |
|---|---|---|
| `ministats` | 显示实时性能统计 | 用于趋势比较，不代替浏览器 Performance trace |
| `debug` | 自动打开相机调试面板 | Console 也会提供 `logCameraPose()` / `getCameraPose()` |
| `colorize` | 用颜色显示 streaming LOD 层级 | 会改变画面，只用于诊断 |
| `fullload` | 等待完整 LOD 后进入可用状态 | 会改变首屏时序，不能作为默认体验 |
| `heatmap` | 将可用碰撞调试叠层设为热力图 | 只有已加载 voxel/collision 时有意义 |
| `nofx` | 禁用 CameraFrame 后处理 | 用于隔离 shader/post effect |
| `noreveal` | 禁用 radial reveal | 不会跳过模型下载和解析 |
| `hpr=1` / `hpr=0` | 强制开/关高精度渲染 | 覆盖 settings 的 `highPrecisionRendering` |

组合参数时每轮只改变一个维度，并保留对照 URL。

## Network 分段

按加载链路依次判断：

1. `/data/index.json` 是否返回、是否命中 route；
2. settings 是否成功下载和解析；
3. 主模型入口是 SOG 还是 streaming JSON；
4. streaming 子资源是否持续前进，是否出现重复失败；
5. environment 是否失败但主体仍能 reveal；
6. 首帧后 collision/voxel 是否按需加载。

压缩 PLY 可以由 Viewer 直接加载，但当前 index 生成器不会把独立 compressed PLY 识别为稳定 route 主模型；不要把 direct URL 成功误判为 index 发布成功。

## 性能记录

- 使用浏览器 Performance 记录从导航到首帧，以及首帧后的交互区间；
- 对 streaming 场景同时记录 Network waterfall 和 splat/LOD 统计；
- 对移动端记录设备、内存压力、横竖屏和触控方式；
- 对 Walk 问题记录 collision 类型、坐标系和加载时刻；
- 不把开发模式 bundle 与 production build 的绝对耗时直接比较。

发现回归时给出一个可重放 route、一个正常基线、一个异常环境和最小参数差异。涉及用户可见性能或兼容行为时，再按任务范围运行相应 Viewer 测试、构建和必要 E2E。

## 交付证据

在 Issue 或 PR 中记录：

- 期望与实际；
- route/direct、WebGPU/WebGL 和关键参数矩阵；
- 浏览器、设备、版本与 commit；
- Network/Console/Performance 的脱敏摘要；
- 已运行和未运行检查；
- 临时规避方式是否改变公开契约。

常见症状的第一检查点见 [故障排查](../maintenance/troubleshooting.md)；参数精确定义见 [Viewer URL 参数](../reference/viewer-url-parameters.md)。
