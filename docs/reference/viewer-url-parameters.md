# Viewer URL 参数参考

当前解析实现以 [`metaflow-viewer/src/index.html`](../../metaflow-viewer/src/index.html) 为准；页面把 `?lang=` 写入 `Config.lang`，再由 [`src/localization.ts`](../../metaflow-viewer/src/localization.ts) 完成 locale 选择。嵌入式入口也可在初始化前设置 `window.sse.config.lang`。本页记录实际参数和优先级，不把理想行为写成已经实现的契约。

## 两种入口

稳定发布使用 index route：

```text
/acg/yzx/yzx
```

临时验证或未进入 index 的资源使用直接参数：

```text
/?content=/data/path/model.sog&settings=/data/path/settings.json
```

`content` 支持 Viewer 能直接加载的 SOG、PLY（包括 compressed PLY）、loose SOG metadata JSON 或 streamed LOD。当前 `generate_index.py` 只把 SOG 或 `lod-meta.json` 识别为稳定 route 主模型；独立 PLY 和 `meta.json` 仅用于 direct URL、明确的已有合同或 legacy package，不能仅靠放入目录获得 index route。

入口身份固定对应 PlayCanvas parser：

| `content` basename/extension | 内部来源类型 | 对外 loading mode |
|---|---|---|
| basename 恰为 `lod-meta.json` | `streaming-lod` | `streaming-json` |
| `.sog` | `sog-bundle` | `legacy-sog` |
| 其他 `.json`，包括 `meta.json` | `sog-meta` | `legacy-sog` |
| `.ply` | `ply` | `legacy-sog` |
| 其他 | unsupported，加载前明确失败 | — |

JSON 结构用于验证所选入口，不会改选另一个 parser。损坏的 `lod-meta.json` 会进入明确的 manifest-invalid 终态，不会猜测为 loose SOG。

## 资源参数

| 参数 | 值 | 作用 |
|---|---|---|
| `content` | URL | 主模型入口 |
| `settings` | URL | settings JSON；页面兼容 JSONC 注释与尾逗号 |
| `poster` | URL | 加载封面 |
| `skybox` | URL | 天空盒图片 |
| `environment` | URL | 独立 Gaussian Splat 环境 |
| `collision` | URL | GLB 网格或兼容碰撞资源 |
| `voxel` | URL | 单体 voxel JSON |
| `voxelManifest` | URL | tiled voxel manifest |

参数值中的空格、中文、`#`、`&` 和 `?` 必须 URL 编码。不要把 token、内部 endpoint 或其他秘密放进公开 URL。

## 实际 route/query 优先级

当前实现不是“所有显式参数都覆盖 route”。初始化顺序如下：

1. 页面先读取 query 参数。
2. 只有 pathname 不是根路径且 **没有 `content`** 时，才请求 `/data/index.json` 并解析 route。
3. route 命中后，`content` 和 `settings` 会直接改为 index 中的值。
4. `poster`、`environment`、`collision`、`voxel`、`voxelManifest` 只在 query 没有提供时才从 route 补齐。
5. 最后，缺少 `content` / `settings` 时分别回退到 `./scene.compressed.ply` / `./settings.json`。

由此得到：

| URL 形式 | 实际结果 |
|---|---|
| `/route` | 使用 route 的模型、settings、viewer 策略和资源元数据 |
| `/route?poster=...` | route 仍解析；显式 poster 保留，其余值来自 route |
| `/route?settings=custom.json` | route 解析后会覆盖显式 settings；当前不能这样覆盖 route settings |
| `/route?content=custom.sog` | 完全跳过 route/index；不会继承 route settings、viewer 策略或 Analytics resource 元数据 |
| `/?content=...&settings=...` | 使用两个显式地址；不需要 route |
| `/?settings=...` | 主模型回退到 `./scene.compressed.ply`，settings 使用显式值 |

如果需要临时替换 route 模型并保留原 route 的其他信息，当前代码没有完整的“先取 route 默认值再逐项覆盖”能力；应显式提供所需参数，或在独立产品 Change 中修改加载契约和测试。

## 界面、渲染与调试

| 参数 | 作用 |
|---|---|
| `noui` | 隐藏 Viewer UI |
| `noanim` | 禁止默认动画自动播放 |
| `webgl` | 强制 WebGL；未设置时使用 WebGPU 路线 |
| `aa` | 启用 Gaussian Splat 抗锯齿 |
| `nofx` | 禁用 CameraFrame 后处理 |
| `noreveal` | 禁用首帧 radial reveal |
| `hpr` | 空、`1`、`true`、`enable` 表示强制启用；其他显式值表示关闭 |
| `budget` | 以百万为单位覆盖 splat budget，例如 `budget=3` |
| `fullload` | 等待完整 streaming LOD 质量 |
| `colorize` | 显示 LOD 层级颜色 |
| `unified` | 保留的统一加载兼容开关 |
| `ministats` | 显示性能统计 |
| `heatmap` | 将可用碰撞调试叠层设为热力图 |
| `debug` | 自动打开相机调试面板 |
| `lang` | UI 语言，例如 `zh-CN`、`en` |

布尔 flag 以“参数是否存在”判断，例如 `?noui`；`hpr` 是例外，会读取值。未知参数会被 Viewer 忽略。

语言的最终优先级是 `Config.lang`（自带 HTML 入口默认来自 `?lang=`）→ `navigator.languages` / `navigator.language` → English。大小写和 base-language 匹配继续生效；localization 模块不再重复读取 URL，也没有第二套语言参数。

## Analytics 与隐私参数

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

公开部署优先从环境和页面 meta 配置 sink；URL 参数适合脱敏调试，不适合持久保存敏感配置。专项说明见 [Analytics 实施资料](../analytics-implementation.md)。

## 相关参考

- settings 字段与版本：[Viewer settings schema](viewer-settings-schema.md)
- route/index 字段：[资源索引 schema](resource-index.md)
- 调试组合：[调试与性能分析](../guides/debug-and-profile.md)
