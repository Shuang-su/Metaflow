# Viewer URL 与 settings 参考

权威实现是 `metaflow-viewer/src/index.html` 与 `metaflow-viewer/src/schemas/`。本页提供当前可查摘要。

## 资源 URL 参数

| 参数 | 值 | 作用 |
|---|---|---|
| `content` | URL | 主模型；SOG、压缩 PLY 或 streaming JSON |
| `settings` | URL | settings JSON；加载器兼容 JSONC 注释与尾逗号 |
| `poster` | URL | 加载封面 |
| `skybox` | URL | 天空盒图片 |
| `environment` | URL | 独立 Gaussian Splat 环境 |
| `collision` | URL | GLB 网格或兼容碰撞资源 |
| `voxel` | URL | 单体 voxel JSON |
| `voxelManifest` | URL | tiled voxel manifest |

Route 模式先从 index 取得默认值，显式参数对相应资源地址优先。

## 界面、渲染与调试

| 参数 | 作用 |
|---|---|
| `noui` | 隐藏 Viewer UI |
| `noanim` | 禁止默认动画自动播放 |
| `webgl` | 强制 WebGL；默认优先 WebGPU |
| `aa` | Gaussian Splat 抗锯齿 |
| `nofx` | 禁用 CameraFrame 后处理 |
| `noreveal` | 禁用首帧 radial reveal |
| `hpr` | 空、`1`、`true`、`enable` 表示强制高精度；其他显式值表示关闭 |
| `budget` | 以百万为单位覆盖 splat budget |
| `fullload` | 等待完整 LOD 质量 |
| `colorize` | 显示 LOD 层级颜色 |
| `unified` | 统一加载兼容开关 |
| `ministats` | 显示性能统计 |
| `heatmap` | 以热力图初始化可用碰撞叠层 |
| `debug` | 打开相机调试面板 |
| `lang` | UI 语言，例如 `zh-CN`、`en` |

## Analytics 与隐私开关

| 参数 | 作用 |
|---|---|
| `noanalytics` 或 `analytics=0` | 禁用页面 Analytics |
| `noreplay` | 禁用 replay |
| `analyticsSink` / `analytics_sink` | `supabase`、`posthog` 或 `dual` |
| `analyticsEndpoint` | 显式事件 endpoint |
| `analyticsReplayRate` | replay 采样率 |
| `posthogKey` / `posthog_key` | PostHog project key |
| `posthogHost` / `posthog_host` | PostHog host |
| `posthogReplay` / `posthog_replay` | 启用 PostHog replay |

不要把敏感凭据放进公开 URL。Analytics 的专项维护说明见 [`analytics-implementation.md`](../analytics-implementation.md)。

## Settings 版本

- v1：没有 `version`；包含 `camera`、`background`、可选 `animTracks`。Viewer 会迁移到 v2。
- v2：`version: 2`；当前推荐与 Editor 导出格式。
- 其他版本：不支持。

## Settings v2 字段

| 字段 | 说明 |
|---|---|
| `version` | 必须为 `2` |
| `tonemapping` | `none`、`linear`、`filmic`、`hejl`、`aces`、`aces2`、`neutral` |
| `highPrecisionRendering` | 高精度默认值 |
| `soundUrl` | 可选音频 |
| `background.color` | RGB 三元数组；可选 skybox/gradient |
| `postEffectSettings` | sharpness、bloom、grading、vignette、fringing 的完整对象 |
| `animTracks[]` | 动画元数据与 times/position/target/fov 数组 |
| `cameras[]` | 初始 position、target、fov |
| `annotations[]` | position、title、text 与目标 camera |
| `startMode` | `default`、`animTrack`、`annotation` |
| `hasStartPose` | 可选，是否存在明确起始姿态 |

资源级 `defaultCameraMode`、`syntheticAnimation`、`animationFirstExitMode` 和 `voxelCoordinateSpace` 属于 index 的 `viewer` 对象，不属于 settings v2。
