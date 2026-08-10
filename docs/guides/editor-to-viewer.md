# 从 Editor 到 Viewer

这条流程适用于“在 Editor 中完成场景配置，然后把模型与展示配置纳入 Metaflow 稳定路由”。

## 1. 在 Editor 中准备场景

从 `supersplat-v2.28.0/` 启动 Editor，导入源模型，完成裁剪、朝向、颜色、相机姿态、动画和标注。

导出前至少检查：

- 主体坐标与朝向正确；
- 初始相机不会落在模型内部；
- 动画帧率、loop mode 与 start mode 符合预期；
- 背景与后处理不会依赖本机绝对路径；
- 导出“全部”还是“选中对象”已经确认。

## 2. 选择导出物

面向 Metaflow 路由，推荐分别导出：

1. 模型：优先 SOG；已有流水线也可以使用压缩 PLY 或 streaming `lod-meta.json`。
2. Viewer 配置：在 Viewer 导出类型中选择 `settings.json`。

`Metaflow legacy ZIP` 适合验证一份可独立打开的旧 Viewer 包，其内部包含 `scene.compressed.ply` 与 `settings.json`；它不是 `data/index.json` 的首选发布形态。完整差异见 [Editor 导出契约](../reference/editor-export-contract.md)。

## 3. 放入资源目录

沿用现有分类和子分类，例如：

```text
data/ACG/FireflyFes38/<资源文件夹>/
├── <资源名>.sog
├── <资源名>_environment.compressed.ply   # 可选
├── settings.json                         # 或明确的 settings-*.json
└── loading.jpg                           # 可选
```

不要把本机绝对路径写进 settings 或 index。大于仓库阈值的资源是否进入 Git LFS，由 `.gitattributes` 的精确规则决定；不要擅自把整个 `data/**` 改成 LFS。

## 4. 生成索引

在仓库根运行：

```bash
python3 scripts/generate_index.py
python3 scripts/validate_data.py --check-files
```

生成器扫描资源目录、选取模型/settings/缩略图/环境/voxel，应用脚本中的 slug、route alias 和特例映射，然后重写 `data/index.json`。不要手工修改生成结果来掩盖目录或规则错误。

若资源需要稳定标题、slug、alias、体验类型或特殊 Viewer 策略，在 `scripts/generate_index.py` 的对应声明区增加明确规则，并接受 data + Viewer 路线检查。

## 5. 本地验证

启动 Viewer：

```bash
cd metaflow-viewer
npm ci
npm run develop
```

确认 `metaflow-viewer/public/data` 是指向仓库根 `data/` 的本地链接，或已同步为当前副本；否则刚生成的 index 与资源不会出现在本地静态服务器中。首次设置方法见 [Viewer 快速开始](../getting-started/viewer.md)。

然后访问 index 生成的 route。检查：

- route/alias 能命中唯一资源；
- 模型、settings、缩略图与环境没有 404；
- 初始相机、动画、标注、碰撞策略与 Editor 预期一致；
- 直接 `?content=...&settings=...` 与稳定 route 的表现没有意外差异。

## 6. 准备发布证据

资源或行为发布需要同步 Viewer Version History 与 Ledger。当前 `5.18a` 保留为历史状态；下一次真实资源或兼容修复从 `5.18.1` 开始使用 SemVer PATCH。提交前记录 route、变更类型、验证范围和未运行检查。发布步骤见 [版本、发布与部署](../maintenance/release-deploy.md)。
