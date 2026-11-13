# SOG 格式与渲染环境兼容

状态：兼容修复候选，未发布。检查窗口：北京时间 2026-11-13 晚至 11-14 凌晨。

本记录把模型格式兼容与渲染环境兼容分开。选择顺序是：确认资产的实际格式与布局 → 选择支持该布局的引擎 → 选择设备和浏览器上已验证的 WebGPU/WebGL 路径。能够创建 GPU 设备只证明 API 可用，不证明纹理解码、排序、混合及最终画质正确。

## 线上证据

- [线上版本记录](https://metaflow.shuang-su.com/data/version-history.json) 为 Viewer 5.23.1；[实际 bundle](https://metaflow.shuang-su.com/index.js) 报告 SuperSplat Viewer 1.37.0 / PlayCanvas 2.23.0 (`cfef43d`)。
- [截图对应资源](https://metaflow.shuang-su.com/acg/sztuccf260919/lolita-burgundy_lace) 的 [scene.sog](https://metaflow.shuang-su.com/data/ACG/SZTUCCF260919/A003C0025_700101_RH8603/scene.sog) 是 SOG v2，由 splat-transform 3.6.4 生成，550,360 点，已有 `quats.webp`。完整文件 9,887,653 bytes，SHA-256 `8c5285f6ee0a0b14530760013e7fc8a2202b70871f7d43ec6774926c7ae287f7`。
- 主体 `means_l`、`means_u`、`scales` 的有效像素 alpha 全 255；`quats` alpha 为 252–255。它不属于早期 SOG v3 的 alpha 旋转布局。`sh0` alpha 为 1–254，不能据此排除其他 WebKit 解码误差。
- [独立场景环境](https://metaflow.shuang-su.com/data/ACG/SZTUCCF260919/A003C0025_700101_RH8603/environment.compressed.ply) 是 5,652 点 compressed PLY，来自 splat-transform 3.6.4，未经过 SOG WebP 解码。它构成远景壳，不作为错误离群点删除。
- 当前远端 main `a76f2708232d9d6acba8a370ecbe7808a2a7052d` 仍记录 5.22.0。线上记录的 `3c95767645a506dbe311d3ecce59380c011fe780` 在本轮 GitHub 查询中不存在。后续已通过生产 source map 恢复本次涉及的 Viewer 运行时，并在隔离基线重建出与线上逐字节一致的脚本、样式和入口 HTML；见[恢复依据](production-runtime-recovery.md)。原始提交与正式发布记录仍未对齐，不能把当前 main 整包覆盖到 5.23.1。

## 用户确认的 WebGL 对照（2026-11-14，北京时间）

用户先补充同场景截图，随后明确确认该截图来自所给现有线上 `?webgl` 链接。当前显示尺度下，人物脸部和腿部的大面积深色斑驳已不明显，墙面与地面也比首图更均匀、明亮。本次记录用户确认与视觉观察，不上传用户截图。

证据状态升级为**用户已确认 WebGL 入口画面明显改善**。这支持优先以兼容渲染路径恢复体验；现有 SOG v2 资源至少能在所示视角正常呈现，无需把重新转换模型作为本次修复的前置条件。它仍不能单独区分 WebGPU 排序、纹理解码、混合或其他渲染环节的根因。

截图机位更远、人物占比更小，截图分辨率和播放状态也不同；没有程序采集的图形设备诊断。因此它属于用户端后端入口对照，不作为同机位像素对照、持续交互、性能或候选补丁的完整验收。

确认用户反馈时，线上版本记录仍为 5.23.1，PR #167 为 Draft、未合并。当前线上 `?webgl` 入口不含本候选新增的嵌入式 WebKit 解码保护，不能把改善归因于本补丁或宣称 WebGPU 根因已修复。后续已将补丁接到经字节比对核实的生产运行时源码上，候选近景与旋转缩放仍待验证；不再把入口参数是否为 `?webgl` 列为待确认事项。

## 格式与引擎矩阵

以下是格式判断规则和采用方案，不是本补丁已经实现的运行时自动探测。

| 实际资产 | 判断依据 | 采用规则 |
|---|---|---|
| SOG v2 | `meta.version === 2`，存在 `meta.quats` | 本轮线上 2.23.0 可读取；2.24.1 也保留 v2 路径。无需为了 v3 修复重转 |
| 早期 SOG v3 | `version === 3`，缺少 `quats`，旋转放在其他纹理 alpha | 与修订版布局不同。2.24.1 reader 不兼容；从原始场景重转，或使用经过验证的旧运行时与资产成套回退。不能仅切 WebGL 就让不支持该布局的 reader 正常工作 |
| 修订版 SOG v3 | `version === 3`，独立 `quats.webp` 存储旋转 | 使用已核对的 Engine 2.24.1 / Viewer 1.43.2 / SplatTransform 3.11.2 组合，再做设备验收；这些版本不是本轮已经采用的依赖 |
| PLY / compressed PLY | 文件 header 和 parser | 与 SOG 布局分别判断，仍需验证绘制、排序与资源预算 |
| Streamed LOD | `lod-meta.json` 及其引用的各级资源 | 顶层 manifest 不是 SOG 版本证据。每一级/子块须与所选 reader 配套，发布时一起更新 |

新引擎可继续读取 v2，因此长期不必为每个 SOG 版本都维护一个完整 Viewer。仅在新运行时仍有目标设备回归时，保留一套经过验证的旧运行时作为临时回退。新旧资产采用不同 URL 或内容哈希，禁止把同一路径下的模型静默换成 reader 不支持的布局。

依据：[Engine #10007](https://github.com/playcanvas/engine/pull/10007)、[Viewer #365](https://github.com/playcanvas/supersplat-viewer/pull/365)、[SplatTransform #379](https://github.com/playcanvas/splat-transform/pull/379)。#10007 的 Chromium 测试不替代 Safari/iPhone 验收。

## 本候选实现的浏览器与设备策略

| 环境 / 显式选择 | 托管入口请求 | 解码与验证边界 |
|---|---|---|
| iPhone / iPad 的 Apple WebKit，包括嵌入式浏览器及桌面 UA iPad | 默认 WebGL 2 | 在实际 WebGL 设备上关闭 ImageBitmap 图片解码（含 SOG 数据纹理）；现有线上 WebGL 入口已有用户正向反馈，候选画面仍待验 |
| macOS Safari、Windows/Android Chromium、未知平台 | 保留 WebGPU 默认 | 保持现有行为，不把这些组合标记为已通过所有资产验收 |
| `?webgpu` | WebGPU | 明确的对照入口，仍可由引擎在设备不可用时 fallback |
| `?stochastic` / `?heatmap` | WebGPU | 保留已显式请求的 WebGPU 实验/调试能力 |
| `?webgl`，即使同时存在上述参数 | WebGL 2 | 优先级最高，兼容原有 XR reload 链路 |

移动 WebKit 判定检查 AppleWebKit UA 与 iPhone/iPad/iPod 标识，或 `MacIntel + maxTouchPoints > 1`。这是客户端特征匹配，不是 GPU 品牌认证，也不能保证未来所有设备身份都能准确识别。没有按 RTX、Apple GPU、Adreno 品牌一刀切放行或禁用。

实现位于 `src/render-compatibility.js`，`siteHtml()` 只将后端选择应用到托管 `index.html`。SDK 的默认 `renderer`、未经转换的 `embed.html`、离线导出和独立 Director 后端选择不变。实际设备创建后再应用 WebGL 解码保护，覆盖请求 WebGPU 后自动退到 WebGL 的情况。

Engine 2.23.0 的 WebGL ImageBitmap 保护依赖 Safari UA token；一些 WKWebView 不带此 token。本补丁使这些 Apple 移动 WebKit 设备与 Safari 的现有保护一致，在 WebGL 下改用 HTMLImageElement；目标画面仍待真机验证。该开关不应用到 WebGPU，因为 WebGPU 的 HTMLImageElement 上传不是等价修复。

依据：[Engine #10002](https://github.com/playcanvas/engine/issues/10002)。精确 WebP 软件解码候选 [#10003](https://github.com/playcanvas/engine/pull/10003) 仍 Open，本轮未合入；新版 v3 的布局修复也不代表所有 `sh0` 低 alpha 颜色误差已消失。

## 验收和后续定位

保持同一原始资产、相机、后处理、分辨率和 LOD 预算，比较：

1. 当前 WebGPU + GPU sort。
2. WebGPU + CPU sort，仅在隔离诊断构建中调整，以区分排序与纹理解码。
3. WebGL 2 + HTML image decode。

检查首帧、静止连续帧、旋转缩放、LOD 切换与恢复。截图中的人物和场景均有斑驳；只凭现象不能区分排序键精度、equal-key 次序、解码或其他混合问题。[#9548](https://github.com/playcanvas/engine/issues/9548) 和 [#9899](https://github.com/playcanvas/engine/pull/9899) 是不同问题；后者同时改进 CPU/GPU 排序键，切 CPU sort 不等于解决全部精度问题。

分支定向检查覆盖生成后 HTML 的真实 bootstrap、平台识别、显式参数优先级、Director 分流、embed 默认、实际后端的解码保护；它们不验证 GPU 像素结果。本轮云 Chrome 无 WebGPU adapter 且无 WebGL；本地 Chromium 启动受 `socket(): Operation not permitted` 限制。云端与本地检查未生成新的可渲染截图，未取得候选补丁的目标 iPhone 视觉或性能结论；用户随后提供的截图单独记录于上文，不替代候选验收。

已执行：三份定向测试 30/30、TypeScript、改动源码 ESLint/Prettier、完整 Viewer 构建和 `git diff --check` 通过。非实现者独立审查与重复定向测试通过；从实际线上 bundle 提取真实 `ImgParser`、替换 I/O 的分流检查 3/3，验证 WebGL Apple / WebGPU Apple / WebGL 非 Apple 三种路径，未验证解码像素。首次类型检查发现稀疏检出缺少 tracking plan 及 GraphicsDevice 基类没有声明运行时字段；补齐检出、修正 helper 类型后通过，未降低检查标准。

生产 Viewer 运行时基线已恢复并经逐字节比对核实，兼容候选保留其背景与捕获行为。发布前仍需对齐正式版本记录及发布包，并在目标 iPhone 上验证候选补丁的近景和交互。现有线上 WebGL 入口画面改善已获用户确认，但不替代候选验收。候选只在独立分支，未提升生产版本、未覆盖模型、未部署或回滚。发布前补齐正式版本及 Ledger/Version History 发布记录；部署后追加观察结果。


### 生产运行时恢复后的候选验证

五份生产运行时差异及最小 schema 类型已并入兼容候选，保留线上背景/捕获行为；reveal 采样对象仅机械格式化。移植后 30 项启动/兼容测试、3 项版本一致性定向检查、TypeScript、相关源码 ESLint/Prettier、完整 Viewer 构建、git diff --check 通过。独立代码与文档复核通过；候选构建的目标设备像素/性能验证仍未完成。

隔离恢复基线与生产的逐字节对照见[恢复记录](production-runtime-recovery.md)。本 PR 仍沿用仓库原有 5.22.0 身份字段；正式版本及发布记录未安排完成，因此不作为可直接覆盖生产的发布包。
