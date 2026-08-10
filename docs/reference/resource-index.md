# 资源索引参考

`data/index.json` 是 Viewer route 的发布索引，当前 schema 为 `1.2`。它由 `scripts/generate_index.py` 生成，不是手工资源数据库。

## 顶层字段

| 字段 | 说明 |
|---|---|
| `version` | 兼容保留的索引文档版本字段 |
| `schemaVersion` | 当前必须为 `1.2` |
| `release` | Viewer display/app 版本、schema、日期和 gitRef |
| `lastUpdated` | 生成日期 |
| `totalResources` | 必须等于 `resources.length` |
| `categories` | 一级分类显示信息 |
| `subcategories` | 子分类与设备信息 |
| `resources` | 资源条目 |

当前资源数量会随发布变化，不应写进长期说明；直接读取 `totalResources`。

## Resource 条目

| 字段 | 必需性 | 说明 |
|---|---|---|
| `id` | 必需 | 分类内稳定 slug |
| `title` / `titleEn` | 必需 | 展示标题 |
| `category[]` | 必需 | 一级分类及可选子分类 |
| `route` | 必需 | 唯一、绝对、非根应用路径 |
| `aliases[]` | 可选 | 兼容 route；也必须唯一 |
| `source` | 必需 | 当前采集来源分类 |
| `experienceType` | 必需 | `character`、`scene` 或现有 object 语义 |
| `files` | 必需 | 模型及关联文件 |
| `fileSize` | 必需 | 字节数与总量 |
| `meta` | 必需 | date、device、原始 folderName |
| `viewer` | 可选 | 资源级交互策略 |
| `animation` | 可选 | 首条动画摘要 |
| `version` | 必需 | `addedIn`、`updatedIn` |

## 可索引模型边界

`scripts/generate_index.py` 当前只为以下主体模型生成稳定 resource：

- 资源目录中的 `*.sog`；
- 根目录 `lod-meta.json` / `meta.json`；
- 生成器支持的一层 streaming 子目录入口，或显式 `STREAMING_MODEL_OVERRIDES`。

独立 `*.compressed.ply` 不满足主体模型条件，放入目录后会被静默跳过，不能得到 route。Viewer 本身仍可通过显式 `content` 或 legacy package 加载 compressed PLY；生成器只会把文件名包含 `environment` 或 `point_cloud` 的 compressed PLY 选作环境。要让 compressed PLY 成为稳定 route 主模型，必须先修改生成器与公共数据契约，而不是只改文档或手写 index。

## `files` 对象

- `model`：主入口，当前由生成器选择 SOG 或 streaming JSON。
- `lod[]`：legacy 多级文件，含 level/file/size。
- `environment`：独立环境模型。
- `settings`：Viewer settings。
- `thumbnail`：加载封面。
- `voxel`：单体碰撞。
- `voxelManifest`：tiled voxel。

所有路径必须相对 `data/`，不得是绝对路径或包含 `..`。

## `viewer` 对象

| 字段 | 当前值 |
|---|---|
| `defaultCameraMode` | `anim`、`orbit`、`fly`、`walk` |
| `syntheticAnimation` | 当前仅 `figure8` |
| `animationFirstExitMode` | `orbit` 或默认策略 |
| `voxelCoordinateSpace` | `world` 或 `metaflow-rz180` |

## 生成优先级

- settings：优先 `settings.json`，否则选择 `settings*.json`；历史冲突使用显式 override。
- streaming model：优先根目录 `lod-meta.json` / `meta.json`，再找一层子目录；可被 override。
- legacy model：非 `_LOD` 的 SOG；只有 LOD 时使用兼容回退。
- environment：压缩 PLY 名称包含 `environment` 或 `point_cloud`。
- voxel：优先 `walk.voxel.json`；tiled manifest 优先 `tiled-voxel/voxel-tiles.json`。

不符合这些规则时修改生成器声明，不手改生成后的条目。

## 验证

```bash
python3 scripts/generate_index.py
python3 scripts/validate_data.py
python3 scripts/validate_data.py --check-files
```

`--check-files` 需要完整 data checkout；CI 的小 fixture 路线可能只验证 schema、镜像和路径安全。
