# MF-70 验证记录

2026-09-16。当前结论：实现可审查，**完整体验验收未通过，禁止据此宣称可发布**。

## 基线与环境

- 实现从 `origin/main a871786dffdb195399f3e7427987d8db70296491` 隔离；Viewer 5.19.1、SuperSplat Viewer 1.29.1、PlayCanvas 2.21.3。用户主工作区中的其他实验未合并。
- PICO 4 Ultra：OS 5.15.4、PICO Browser 4.0.38、Chromium 125.0.6422.53；USB 调试连接；本地 Viewer 通过端口转发加载公开生产资产，不部署生产。
- 本地入口：`http://127.0.0.1:4180/acg/fireflyfes38/azur-lane?webgl&noanalytics`。现有生产页面作诊断基线。
- 浏览器自动化：Browser plugin not available；使用项目锁定的 Playwright 1.62.1 / Chromium 151.0.7922.34。桌面 1440×900、移动 390×844；额外触控正向对照 1024×768。
- Node 20.19.0 按命令指定，不变更全局 Node/Xcode。依赖锁文件和引擎版本未改。

## 已确认的真机问题

| 项目 | 证据和结果 | 状态 |
|---|---|---|
| 模糊菜单 | 窗口 DPR 1.25，进入 XR 后 DPR 4；引擎将 XR scale 再乘旧 maxPixelRatio / 新 DPR。旧候选每眼只有 510×510。重建原生 scale 1 的呈现层后 framebuffer 为 3840×1920，即每眼 1920×1920；用户反馈文字清楚了 | 根因修复已进入源码；清晰度为真机用户确认，自动重入仍需复核 |
| 场景随头部平移 | 浏览器 `XRViewerPose.emulatedPosition === true`，系统跟踪日志显示 3DoF；旋转存在，真实平移未提供。代码新增状态提示 | 尚未恢复 6DoF，不能算场景稳定性验收通过 |
| WebGPU XR | 真机有 `navigator.gpu`，没有 `XRGPUBinding`；因此当前浏览器可用普通 WebGPU，不具备本轮引擎需要的 WebGPU XR 绑定 | WebGL 降级可进入；保留其他设备的 WebGPU XR 路径 |
| 手部输入 | `XRHand` / `XRJointSpace` 存在，但此前会话未收到实际输入源 | 构造器存在不是手势通过证据 |
| 窗口双手手势 | 真机声明 maxTouchPoints=5。普通页事件探针已安装；尚未收到用户实际双手操作的事件 | 待真机输入，不能判为浏览器不支持，也不能判为 MetaFlow 已适配 |

定位设置名称通过设备已安装设置应用的文字资源核实为“定位追踪”；“躺下使用／斜躺使用”与关闭定位追踪关联。未修改底层系统跟踪属性或替用户设定安全边界。

## 性能：仍未达标

采集的是页面 `frameend` 间隔，仅会话 active 且 visibility=visible 时记样；不是 GPU 时间，不等同于真实移动路线验收。会话报告 72 Hz，对应 13.89 ms 周期。

| 条件 | 样本数 | p50 | p95 | p99 |
|---|---:|---:|---:|---:|
| 生产基线，旧窗口相关分辨率／4M 默认预算 | 7,427 | 97.3 ms | 181.1 ms | 195.2 ms |
| 本地候选，原生 1920×1920/眼、1M 预算 | 261 | 71.8 ms | 84.1 ms | 88.9 ms |
| 同会话诊断，原生分辨率、临时 250K 预算 | 926 | 41.7 ms | 43.7 ms | 52.0 ms |

三行并非同路线、同视角受控 A/B，不计算“性能提升百分比”。250K 只用于诊断，没有作为产品默认值提交。旧候选在 510×510/眼时的高帧率不能用作清晰度修复后的验收。原生分辨率的碧蓝航线场景明显超过刷新预算，仍需定位排序、重叠像素与渲染成本。十分钟采样/30 秒静态录屏不等于十分钟人为连续探索。

## 自动化与浏览器检查

- Node 20 `type:check`、`lint`、`build` 通过。构建仅有既有 Sass legacy API / empty style chunk 提示。
- 新增 XR 行为测试 **15/15**：模拟力度和死区、抬头速度、绕头转向、任意 rig 朝向瞬移、无效地面／墙体／未知分块、相机与运行时恢复、取消与输入移除、菜单隔离、中位重置、分段转向、迟到碰撞显式校准、坐站姿、菜单命中、XR DPR 与单右手柄。测试执行真实 shipping 模块，输入和碰撞使用测试桩。
- Viewer 全量测试 **99/100**。唯一失败是 `upstream-compatibility.test.mjs` 的既有 README 发布状态断言；原 `HEAD` 测试单独执行也复现该失败。未为本轮修改历史发布文字。
- `MCL_SMALL_FIXTURES=1 npm run e2e:build` **8/8**，包含桌面／移动 UI、已有视觉快照、XR 重复请求／授权取消／重试及 AR 失败恢复。XR 浏览器接口为测试桩，不代表头显测试。
- 额外 Chromium 正向对照：两个真实浏览器注入触点拉开使 orbit distance 从 3 变为 1.505，合拢恢复到 2.869；合成 Ctrl+wheel 缩放至 2.181。页面身份正确、画布与控件非空、无页面异常；桌面／移动设置截图已检查。**这证明 MetaFlow 现有两种输入路径有效，不证明 PICO 会发送这两种输入。**
- `git diff --check` 通过。自查与行为 Spec 对照由实现作者执行，不标记独立审查。

## 上游核对

2026-09-16 核对 [SuperSplat Viewer 1.31.2](https://github.com/playcanvas/supersplat-viewer/releases/tag/v1.31.2)：使用引擎 2.22.1。1.29.1→1.31.2 的主要变化是 LOD 首帧设置、动画／嵌入、画布尺寸与加载；没有更新其 XR 导航文件。引擎 [2.22.0](https://github.com/playcanvas/engine/releases/tag/v2.22.0) / [2.22.2](https://github.com/playcanvas/engine/releases/tag/v2.22.2) 含 LOD／排序和 XR 菜单退出隐藏修复；同时存在 API 变更，不能视作无风险依赖替换。本轮复用当前后端和模型支持，修复自己的菜单生命周期，不整体升级上游。

[PICO 4 Ultra 官方开发说明](https://developer.picoxr.com/zh/pico4-ultra/)明确列出 WebXR Hand Input。它未证明普通浏览器窗口会把双手暴露为两个 DOM 触点。PICO OS 6 Spatial SDK 的原生双手缩放文档也不能作为 OS 5.15.4 浏览器能力证明。

## 模拟器与未运行项

Vision Pro 模拟器启动为 visionOS 26.2。已打开本地 URL，但 Safari 被现有原生应用窗口遮挡；自动化可以读取窗口／截图，交互返回 `noWindowsAvailable`，未完成网页选择和 XR 会话测试。未关闭或改动用户现有原生应用。模拟器验证不记通过，Vision Pro 真机舒适度／追踪／性能未验证。

待完成：

1. PICO 恢复真实 6DoF，确认模型不随真实平移移动。
2. 真实单右手柄及手部菜单、移动、舒适模式、追踪丢失／恢复、站坐与重入；验证源码中的原生分辨率修复自动生效。
3. 普通浏览器窗口的单手拖动／双手拉伸事件分类，再决定窗口手势和虚拟摇杆适配。
4. 有碰撞／无碰撞／大型流式场景同路线十分钟 A/B、录屏、实际帧时间；原生分辨率性能先达标。
5. Vision Pro 模拟器输入、菜单、相机与生命周期。

原始截图、静态视频、性能 JSON 与窗口手势对照保存在主仓库未跟踪目录 `.codex-work/artifacts/mf-70/`；包含 `pico-native-resolution.png`、`pico-native-sample.json`、`pico-native-250k-sample.json`、`browser-input-positive-control.json`、`desktop-settings.png`、`mobile-settings.png`。未提交设备序列号、系统日志、安装包、生成构建或缓存。回退为撤回本分支提交；生产从未更改。

## 追加真机反馈：窗口单触点与旧页面重入

同日用户报告已开启“定位追踪”，并试用了普通窗口手势。此前安装的只读探针收集到 980 条画布／摇杆事件：6 次可信 touch pointerdown、2 次 pointercancel、4 次 pointerup，最大同时活动指针数为 **1**，touchstart 的 touches 均为 1，没有 wheel 事件。其中两次出现旧指针 pointercancel 后开始新 pointerId 的情况。结合用户双手操作反馈，这支持**当前配置普通窗口将输入串行化**的判断，但不是所有 PICO OS／浏览器版本均不支持双手的证明。原始记录：`pico-window-hand-events.json`。现有网页双触点缩放正向对照仍通过；沉浸 WebXR 的手部数据是独立通道。

随后用户报告 VR/AR 又模糊。读取当时会话：immersive-ar、XR scale **0.85**、DPR 4、graphics maxPixelRatio 1.25、framebuffer **1020×510**。说明页面仍运行此前尚未刷新的旧代码，临时原生分辨率绑定未跨会话保留；不是已提交 scale 1 代码的重入结果。该会话已出现左手 XR 输入源（hand=true、axes=[]），说明至少该手部输入通道实际可用。

已保存记录、退出该会话并刷新本地页面，新的 manager scale 为 **1**。页面显示 visible / focused，但 requestAnimationFrame 超时、应用 frame=0，初始流式加载等待画面刷新；已请用户戴上头显回到窗口。最终 framebuffer 和新 6DoF 位姿必须等实际 XR 帧后复核，尚不记通过。系统跟踪属性与之前不同，不能仅凭属性值代替 `emulatedPosition` 实测。
