# MF-165 实施 Plan

唯一行为契约：[Spec](spec.md)。基线 `32deff73956991e6d92c42a236b003048e7b4253`。组件 Viewer；首轮风险为独立实验与可选本地摄像头权限。当前用户已要求实现该展示方向；本轮不合并或部署生产。

1. 独立实验目录实现纯投影/桌面几何模块与不依赖浏览器的几何测试。
2. 使用现有 PlayCanvas 2.23.0 实现真正 PLY/SOG 输入、桌面/脚点/接触阴影、校准和展示 UI。实验单独加载引擎，不改生产打包配置。
3. 独立追踪模块处理用户主动开启、版本固定的 MediaPipe、相对眼位标定、限幅、平滑、失脸与释放。拒绝权限及依赖失败始终回到可用手动模式。
4. 运行有意义的数学测试与 Chromium WebGL2 浏览器测试，加载真实高斯样本。使用假视频/生命周期替身验证摄像头状态，但不宣称完成 iPad 真人验证。
5. 由非实现者审查几何契约、生命周期与原型边界；修复实际问题。记录检查、未运行项目和限制。
6. 原子提交到隔离分支，创建草稿 PR，回读验证；更新 MF-165 的 Spec/Plan/PR 链接，并将新应用链接回 MF-147。

预计路径：`metaflow-viewer/experiments/desktop-portrait/{index.html,app.mjs,projection.mjs,projection.test.mjs,tracking.mjs,README.md}`，必要的独立实验依赖/开发脚本同目录。

检查选型：`node --test` 验证纯几何与生命周期；语法检查；本地服务器 + Playwright Chromium 验证实际 WebGL2、导入、错误、响应布局与控制。生产入口未改，不扩展为全仓/发布测试。相机实机、真实 iPad、WebGPU、LOD 和正式产品交接作为明确未完成项。
