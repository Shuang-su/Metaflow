# MF-165 独立桌面数字人发布：2026-11-14.2

## 范围与用户批准

用户明确批准上一轮修改并要求更新原 Netlify 站点，同时追加 iPhone Air、掌心朝向屏幕、默认隐藏相机画面和侧放时整脸/头部追踪。本发布仅针对 `polite-semolina-b478fc.netlify.app`；不改变主站 Viewer / Editor / Director 或它们的版本、构建、域名、资源和生产站点 ID。

此前 PR166 包含旧 PlayCanvas/vrm-desktop 原型，PR168 堆叠在其上。因此从当前 main 创建独立发布分支，只纳入已验证的 `desktop-companion` 普通源码及本任务契约，不整体合并旧原型或任何无关变更。

## 实现和验证

测试后源码提交：`ff5204c8dff1e43d7c426575425231b9621657f7`。
[完整验证运行](https://github.com/Shuang-su/Metaflow/actions/runs/43570201947)：

- 41/41 模块与追踪状态机测试通过。
- iPhone 390×664、mini 744×1133、Mac 1440×900 原有实际 VRM / 本地 WAV 回归通过。
- 新增 iPhone Air 420×912 / 912×420 的实际方向事件、物理宽度更新、旧标定失效与相机释放检查通过；修复方向事件早于布局更新的竞态。
- 已授权相机的视频在隐藏预览时保持附着 BODY、非 display:none，并验证 currentTime 持续前进；旧“预览开启”偏好不会重新显示取景。诊断取景可手动开关。
- 文镜与奶绿重建版招手掌面朝屏幕：检测时 facing dot 分别约 0.981 / 0.981，手指向上约 0.973 / 0.970，观察相机位置保持不变。两张实际渲染截图已查看。
- 页面 JS 错误为空。上游 TensorFlow Lite 的精确 INFO 初始化消息保留在 upstreamInfo，不冒充错误，也不忽略其他错误。

[截图与报告 artifact 14103723837](https://github.com/Shuang-su/Metaflow/actions/runs/43570201947/artifacts/14103723837)。
[完整静态站点 artifact 14103948353](https://github.com/Shuang-su/Metaflow/actions/runs/43570201947/artifacts/14103948353)，ZIP SHA-256 `365f47691a1f5c5eb59090c12bff92dfefb9b1b153ef41f8d0cfd42df184ec04`，43 文件。

限制：Chromium/software WebGL、合成摄像头流和合成检测器输出；不是实体 iPhone Air/Safari、真实侧脸成功率、光学校准精度、发热和长期运行验收。没有启用 TrueDepth/ARKit，也没有原角色声音或云对话。完全背脸、遮挡、低光仍可能暂时失踪。

## 发布路径与保护

预检 [43568835314](https://github.com/Shuang-su/Metaflow/actions/runs/43568835314) 在执行前被拒绝。GitHub annotation 明确：功能分支不允许部署到 production。没有更改环境规则、解锁部署、读取秘密值或使用主站部署目标。

按用户批准，通过独立 PR 将上述源码与固定发布工作流合并到 main，再由既有受保护 production 环境执行。工作流只接受上述成功 CI 的固定 artifact / source SHA，先核验 artifact 元数据和源码，再核验精确站点与旧版 app.js 哈希，创建 draft、上传缺失文件、验证预览后原子发布。发现线上并发更改、目标不符、凭据缺失或锁定一律停止；发布后 smoke 失败仅在当前仍是本次版本时回滚到保存的前一部署。

**本文件创建时尚未发布。** 后续发布状态必须由具体 workflow 结果及生产 `release.json` 回读记录，不能仅凭源码合并/测试通过宣布上线。
