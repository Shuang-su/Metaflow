# MetaFlow 桌面数字人：独立 Three.js 站点

本目录是从现有 Netlify 站点 `https://polite-semolina-b478fc.netlify.app/` 的公开源码恢复、带 SHA-256 记录的独立应用，不是 SuperSplat Viewer，也不是同仓库的早期 `vrm-desktop` 或 PlayCanvas 实验。唯一行为规格与计划见 [MF-165 Spec](../../../..//docs/changes/165-desktop-portrait/spec.md) 和 [Plan](../../../..//docs/changes/165-desktop-portrait/plan.md)。

## 本轮功能

- iPhone 小屏/标准屏/大屏、iPad mini 8.3 英寸和其他小平板配置；尺寸是近似起点，必须用实体尺核对可见画布。物理尺寸不等于 CSS 像素，也不等于机身尺寸。
- 横竖屏变化重新确认画布与镜头位置；旧眼位追踪暂停，不能把旧标定直接套到新方向。新增下侧镜头选项。
- 手机和触控设备的 44px 按钮、16px 表单、小屏/横屏可滚动控制面板；模型检查模式支持双指缩放。降低手机/平板最大渲染像素比。
- 有限时长的招手、点头、摇头、鞠躬与停止动作；动作控制角色骨骼，不控制观察相机。
- 1–500 字可编辑系统朗读，声音、语速和音量选择。不是奶绿原声、Fish Audio 或 AI 对话；系统语音使用示意口型。
- 最大 30 MiB 的本地音频播放，基于真实播放音频的幅度驱动近似口型；不上传、不读取麦克风。平台声音自身可能联网。
- 停止、换模型、隐藏页面和销毁时关闭语音、清理音频节点与 blob URL，晚到事件不能重新启动已停止会话。

## 模型状态：保留而不冒充

继续保留“文镜 · 作者目录版”和“明前奶绿 · 重建版”。[模型核对记录](model-verification.json) 记录了 2026-11-14 从 Persona 当前目录获取的 MilkyGreen 1.1.0：ZIP 内 `MilkyGreen_VRM1.vrm` 的 SHA-256 与现有重建版完全一致。因此没有复制同一个文件冒充第三款模型。用户所指的另一款视频/花店奶绿仍待取得独立文件证据；用户已说明拥有使用权，本轮未重复要求授权。保留来源署名与各文件原有许可信息。

## 本地构建与检查

需要 Node.js 22 和 Python 3.10+，构建时联网获取现有依赖和模型；两个模型进行固定 SHA-256 校验，MediaPipe 包校验官方 npm SHA-512。模型二进制不提交到 Git。

```sh
cd metaflow-viewer/experiments/desktop-companion
node --test mobile-voice.test.mjs
python3 restore-assets.py
python3 -m http.server 4173 --bind 127.0.0.1 --directory dist
```

`dist/` 是完整静态站点。已有 Netlify 站点应上传这个目录，或将本目录设为 Netlify Base directory，构建命令 `python3 restore-assets.py`、Publish directory `dist`。不要向生产主站配置写入本实验。摄像头和移动端传感器需 HTTPS；本机 localhost 可用于开发。

CI 使用固定 Playwright 1.56.1、Chromium 软件 WebGL，验证 iPhone 尺寸、mini 尺寸和 Mac 窗口，保存真实 VRM 渲染截图、本地 WAV 播放/停止及口型检查报告。运行 `mobile-voice.e2e.mjs` 需要 Playwright 和已启动的 4173 服务器。截图与报告只在 CI artifacts，不进入源码仓库。

## 验证边界和发布状态

首轮 [CI 43559514401](https://github.com/Shuang-su/Metaflow/actions/runs/43559514401) 已通过 24 项模块测试和 3 个真实浏览器场景；渲染后的三角形数 249320，三个场景均未记录 JS/console error。另检查手机横屏、现有重建模型切换。后续提交以对应最新 CI 为准。

这不是实体 iPhone/iPad/Safari 验收。系统声音的真实输出、权限弹窗、真人追踪精度、低光、发热、长时间运行、与视频视觉一致性尚待实机检查。测试替身通过不代表角色声线或云对话已接入。

**本轮未发布 Netlify。** 当前会话没有可操作的 Netlify 账户会话/部署连接；源码和可部署构建物不等于线上版本。不得仅凭旧网址可访问就宣布新版上线。发布前还需独立审查与目标设备检查。
