# MetaFlow 桌面数字人：独立 Three.js 站点

本目录针对既有 `https://polite-semolina-b478fc.netlify.app/`，不是生产 SuperSplat Viewer。唯一 [Spec](../../../docs/changes/165-desktop-portrait/spec.md) / [Plan](../../../docs/changes/165-desktop-portrait/plan.md) 保留历次范围；当前发布与验收状态见 [发布记录](../../../docs/changes/165-desktop-portrait/companion-release.md)。旧 PlayCanvas 和 vrm-desktop 原型未纳入本次生产交付。

## 当前能力

- iPhone、iPhone Air、iPad mini 与 Mac 近似物理尺寸配置。Air 使用 Apple 1260×2736、460 ppi，须手动选择并用实体尺核对可见画布；不是 UA 精确机型识别。
- 横竖屏事件等待布局稳定后测量，重新确认物理画布和镜头位置。小屏按钮、滚动设置、检查模式双指缩放和分设备渲染像素预算。
- 摄像头由用户点击授权后启动，默认不显示诊断取景，旧预览偏好不会重新打开。隐藏取景和纯净展示仍通过附着于 DOM 的视频供帧，保留系统摄像头指示与停止入口。
- 用整脸几何和头部姿态估计观察位置，不依赖虹膜或持续正对镜头。短暂丢失保位、稳定单人自动恢复；多人暂停；相机画面尺寸变化必须重新校准。完全侧脸、背脸、遮挡和低光仍可能检测不到。
- 招手、点头、摇头、鞠躬与停止。招手依据实际手指骨骼定义掌面，掌心朝向屏幕前方；动作不移动观察相机。
- 可编辑系统朗读、声音/语速/音量、本地音频与幅度近似口型。没有原角色声线、云 AI 对话、音素同步或麦克风录音。平台声音本身可能联网。
- 停止、换模型、隐藏/离开页面时清理相关相机或音频资源；不上传用户文件、摄像头画面或头部轨迹。

继续保留文镜与奶绿重建版。当前 Persona 的 MilkyGreen 1.1.0 与重建版字节一致，见 [模型核对](model-verification.json)；视频里另一款奶绿尚未确认，不把同一文件改名冒充新增。

## 本地构建

```sh
cd metaflow-viewer/experiments/desktop-companion
node --test mobile-voice.test.mjs tracking-refinement.test.mjs
python3 restore-assets.py
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

需要 Node.js 22、Python 3.10+。构建时恢复固定版本依赖与已核验模型，二进制不入 Git。模型 SHA-256、官方 MediaPipe 包 SHA-512 会核验；来源记录与署名保留。摄像头在 HTTPS 或 localhost 下使用。

[CI 43570201947](https://github.com/Shuang-su/Metaflow/actions/runs/43570201947) 完成 41/41 单元/状态机测试、原有三种屏幕浏览器回归和新增 Air 旋转/隐藏视频/双模型掌面检查。测试源提交 `ff5204c8dff1e43d7c426575425231b9621657f7`；该提交的普通运行源码已原样纳入此目录，一次性迁移脚本已移除。证据是 Chromium/software WebGL 和合成摄像头流，不是实体 Apple Safari 或真实侧脸检测成功率测量。页面截图已检查，非独立第三方审查。

生产发布仅使用 `desktop-companion-publish.yml` 的固定已验证 artifact，在 main 的受保护 production 环境执行。严格匹配原站点，先发布 draft、核对文件，再原子切换；不使用主站 NETLIFY_SITE_ID，也不改 production 保护规则。生产是否已上线以发布结果与远程 release.json 回读为准，不能把本 README 或 CI 成功当作上线证据。
