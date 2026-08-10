# Viewer settings schema 参考

当前校验实现以 [`metaflow-viewer/src/schemas/v1.ts`](../../metaflow-viewer/src/schemas/v1.ts)、[`v2.ts`](../../metaflow-viewer/src/schemas/v2.ts) 和 [`settings.ts`](../../metaflow-viewer/src/settings.ts) 为准。新资源使用 `version: 2`；没有 `version` 的 v1 只为历史兼容保留。

## 版本识别

| 输入 | Viewer 行为 | 新内容建议 |
|---|---|---|
| 没有 `version` | 按 v1 校验，再迁移到 v2 | 不再新建 |
| `version: 2` | 按当前 v2 校验 | 使用 |
| 其他 `version` | 拒绝并报告不支持 | 不使用 |

页面下载 settings 时兼容 JSONC 注释和尾逗号；Editor 导出与跨工具契约仍是标准 JSON。加载器的宽容不能用来要求其他工具支持 JSONC。

## 最小 v2

```json
{
  "version": 2,
  "tonemapping": "none",
  "highPrecisionRendering": false,
  "background": {
    "color": [0, 0, 0]
  },
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
    {
      "initial": {
        "position": [0, 0, 5],
        "target": [0, 0, 0],
        "fov": 60
      }
    }
  ],
  "annotations": [],
  "startMode": "default"
}
```

## v2 顶层字段

| 字段 | 必需 | 契约 |
|---|---|---|
| `version` | 是 | 固定为 `2` |
| `tonemapping` | 是 | `none`、`linear`、`filmic`、`hejl`、`aces`、`aces2`、`neutral` |
| `highPrecisionRendering` | 是 | boolean；URL `hpr` 可在运行时覆盖 |
| `soundUrl` | 否 | 音频 URL |
| `background` | 是 | 必含 RGB `color`；可选 skybox/gradient |
| `postEffectSettings` | 是 | 必须提供五组完整对象，即使全部关闭 |
| `animTracks` | 是 | 动画数组，可为空 |
| `cameras` | 是 | 相机数组，可为空，但发布场景通常应提供初始相机 |
| `annotations` | 是 | 标注数组，可为空 |
| `startMode` | 是 | `default`、`animTrack`、`annotation` |
| `hasStartPose` | 否 | 是否有明确起始姿态 |

`defaultCameraMode`、`syntheticAnimation`、`animationFirstExitMode` 和 `voxelCoordinateSpace` 属于 `data/index.json` resource 的 `viewer` 策略，不属于 settings。

## 动画

每条 `animTracks[]` 必须包含：

- `name`、`duration`、`frameRate`；
- `loopMode`：`none`、`repeat` 或 `pingpong`；
- `interpolation`：`step` 或 `spline`；
- `smoothness`；
- `keyframes.times`；
- `keyframes.values.position`、`target`、`fov`。

schema 验证数组类型，但创作方仍要保证 times 与 position/target/fov 的采样数量、顺序和时长语义一致。`startMode: animTrack` 时应至少有一条有效轨道。

## 相机

`cameras[].initial` 包含：

- `position`：三个数字；
- `target`：三个数字；
- `fov`：数字。

当前 Editor 可以从 viewport 姿态生成这一结构。route 的相机交互模式由 index `viewer.defaultCameraMode` 决定，不要混入 settings。

## 标注及当前 Editor 限制

Viewer 接受的 `annotations[]` 每项包含：

- `position`；
- `title`；
- `text`；
- `camera.initial.position`、`target`、`fov`。

但当前 Editor 的 Viewer export 和 publish settings 代码都会构造 `annotations: []`。因此：

- Editor 目前不能创作、导入并保留 Metaflow Viewer annotations；
- 从 Editor 重新导出 settings 可能覆盖手工维护的标注；
- 需要标注时应把手工补充步骤和源文件纳入审查，并在重新导出后显式合并、验证；
- 不要把“在 Editor 中建立并导出标注”写成已支持工作流；
- 若要产品化标注创作/往返，应作为 Editor 行为 Change 实现并增加契约测试。

## v1 兼容摘要

v1 没有 `version`，主要字段是 `camera`、`background` 和可选 `animTracks`。迁移器会把旧相机、背景和动画转换为 v2；它不意味着 v1 仍是新资源写作格式。

## 相关参考

- URL、route 和 settings 的实际优先级：[Viewer URL 参数](viewer-url-parameters.md)
- index 的资源级 Viewer 策略：[资源索引 schema](resource-index.md)
- Editor 当前能生成什么：[Editor 导出契约](editor-export-contract.md)
