# 配置 Viewer

Viewer 配置由两层组成：URL/资源索引负责“加载什么”，`settings.json` 负责“怎样展示”。显式参数只会覆盖 route 的部分资源地址：`content` 会让加载器完全跳过 route，而 route 命中又会覆盖 query 中的 `settings`。先读 [Viewer URL 参数](../reference/viewer-url-parameters.md#实际-routequery-优先级)，不要假设统一的 query 优先规则。

## 1. 优先从 Editor 导出

当前 Editor 可以直接导出 `settings.json`。这比手写完整动画和相机数组更稳妥，也能保持与上游 `ExperienceSettings` 的字段一致。

## 2. 使用 schema v2

当前推荐 schema 是 `version: 2`。Viewer 仍能读取没有 `version` 的旧 v1，并迁移到 v2；新资源不应继续创建 v1。

一个没有动画和标注的最小 v2 配置：

```json
{
  "version": 2,
  "tonemapping": "none",
  "highPrecisionRendering": false,
  "background": {"color": [0, 0, 0]},
  "postEffectSettings": {
    "sharpness": {"enabled": false, "amount": 0},
    "bloom": {"enabled": false, "intensity": 1, "blurLevel": 2},
    "grading": {
      "enabled": false,
      "brightness": 0,
      "contrast": 1,
      "saturation": 1,
      "tint": [1, 1, 1]
    },
    "vignette": {
      "enabled": false,
      "intensity": 0.5,
      "inner": 0.3,
      "outer": 0.75,
      "curvature": 1
    },
    "fringing": {"enabled": false, "intensity": 0.5}
  },
  "animTracks": [],
  "cameras": [
    {"initial": {"position": [0, 0, 5], "target": [0, 0, 0], "fov": 60}}
  ],
  "annotations": [],
  "startMode": "default",
  "hasStartPose": true
}
```

完整字段以 `metaflow-viewer/src/schemas/v2.ts` 为准，查表见 [Viewer settings schema](../reference/viewer-settings-schema.md)。

## 3. 配置相机与启动方式

- `cameras[0].initial` 决定初始 position、target 和 fov。
- `startMode` 可为 `default`、`animTrack`、`annotation`。
- `hasStartPose` 表示是否存在明确起始姿态。
- route 的 `viewer.defaultCameraMode` 可为 `anim`、`orbit`、`fly`、`walk`，它属于 index 资源策略，不是 settings v2 字段。

不要把相机模式、体验分类和碰撞坐标系全塞进 settings；这些与资源路由相关的策略应由 index 的 `viewer` 对象表达。

## 4. 配置动画

动画轨道必须同时提供 `duration`、`frameRate`、`loopMode`、`interpolation`、`smoothness`，以及对齐的 times/position/target/fov 数组。

动画可以优先在 Editor 中建立并导出；手改后至少运行 Viewer settings 校验相关测试。

## 5. 标注的当前限制

Viewer schema 支持 `annotations[]`，每项需要空间位置、标题、正文和目标相机。但当前 Editor 的 Viewer export 和 publish settings 都固定生成 `annotations: []`，不能创作或保留已有标注。

需要标注时，把手工 settings 作为受审查的独立来源；每次从 Editor 重新导出后显式合并并验证，避免静默清空。若需要 Editor 内完整往返，应先实现对应产品能力。字段见 [Viewer settings schema](../reference/viewer-settings-schema.md#标注及当前-editor-限制)。

## 6. JSONC 兼容边界

页面加载器接受 JSON 注释和尾逗号，便于兼容现有资源；公共契约与 Editor 导出仍是标准 JSON。不要因为加载器宽容就把 JSONC 当成跨工具标准。

## 7. 验证覆盖关系

用同一 route 分别测试：

```text
/resource/route
/resource/route?noreveal&noanim
/?content=/data/model.sog&settings=/data/settings.json
```

若只有显式 URL 正常，优先检查 index 的 `files`；若两者都失败，检查模型、settings 与浏览器日志。

调试开关和对照矩阵见 [调试与性能分析](debug-and-profile.md)。
