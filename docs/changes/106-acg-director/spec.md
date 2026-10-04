# MF-106 · ACG Director 线上实验入口

状态：实施中；关联 [MF-106](https://github.com/Shuang-su/Metaflow/issues/106)、[MF-62](https://github.com/Shuang-su/Metaflow/issues/62)。本 Spec 是 MF-62 摄影候选在限定 ACG 入口的产品化授权，不提升其他实验成熟度。

- 公开接口仅为已发布 ACG 单文件 SOG/PLY 主路由或别名追加 `/director`。索引动态判断格式；流式、未知和非 ACG 返回具体说明。
- 主体、声明的环境、JSON 设置全部准备后开放摄影；环境失败必须可重试，不呈现完整加载状态。源文件、资源索引字段、Editor 和 Viewer SDK 不变。
- 同标签页、同资源及素材引用、30 分钟内的 Viewer 实际显示 position/target 优先；失败读取 JSON camera 或 cameras[0].initial。无合法机位报错，不以包围盒代替。Director 默认投影独立，target 作为 MF 焦点。
- 保留摄影控制、原始对照、画幅、撤销、本地兴趣点/Compose、同场景视频时间轴、转场和文件输出。移除 Studio、工程系统、素材库、账号、在线服务、Frame/设备及装饰。背景来自资源设置。
- 独立 package 使用 PlayCanvas 2.22.4、SuperSplat 3.4.2 固定来源、splat-transform 3.6.4；全精度圆孔径四样本交互，静止 120ms 后至 128/256/512。输出固定完整目标，不降低质量。WebGPU/浮点/编码能力不满足时明确报错。
- 公开界面采用自有 CSS、系统字体、Lucide ISC 图标；不分发 ui.camera 原始 CSS、专有 SVG 或设备模型。

## 验收

- [ ] 动态解析全部已发布 ACG 主路由/别名及资源引用，正确排除流式。
- [ ] 当前机位、动画中间帧、存储不可用/过期/错资源及 JSON 两格式，误差 ≤1e-6。
- [ ] 缇宝、另一个环境、无环境、旧设置：轴向、背景、主体/环境均正确参与摄影。
- [ ] 摄影/时间轴/四种转场/取消/重复导出；三档照片、1080p 动态视频、短 4K 完整解码。
- [ ] 深链接/刷新/前后退/窄屏/DPR2；无双引擎、静态资源错误及本机地址请求。
- [ ] 普通 Viewer、非 ACG、Editor 回归；预览部署、正式部署与 15 分钟观察。

严格发丝、透明遮挡与源扫描残影仍为 MF-62 独立未完成项，本次入口验收不替代光学验收。
