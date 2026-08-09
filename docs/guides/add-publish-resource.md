# 添加并发布资源

本指南从“资源文件已经准备好”开始，目标是让它获得稳定 route，并通过现有静态发布链路可访问。

## 1. 确定分类与目录

生成器识别的一级分类由 `scripts/generate_index.py` 的 `CATEGORIES` 定义；部分分类还有 `SUBCATEGORIES`。先复用现有结构，不要只为一个资源随意新增分类。

目录名可以保留采集信息，公开 route 使用规范化 slug 或显式 override。需要兼容旧链接时使用 alias，不复制一份资源。

## 2. 准备文件

一个可发布资源至少需要可识别的模型。常见组合：

- legacy：`*.sog` + `settings.json`；
- streaming：`lod-meta.json` + 分块文件 + `settings.json`；
- 可选环境：文件名包含 `environment` 的压缩 PLY；
- 可选缩略图：`loading.*`、`thumbnail.*` 等生成器支持的命名；
- 可选碰撞：单体 voxel 或 tiled `voxel-tiles.json`。

生成器对部分历史目录有明确 override。不要依赖“碰巧按字母排序选中正确文件”；存在多个 settings 或 model 候选时应写规则。

## 3. 处理 Git 与 LFS

先检查文件大小和 `.gitattributes`。当前策略是只有精确列出的超大资产进入 LFS，较小的 SOG、PLY 和 voxel 文件保持普通 Git。

```bash
git check-attr filter -- "data/<资源路径>/<文件>"
git lfs ls-files
```

若目标被标记为 LFS，确认提交的是 pointer，且托管端已有对象。不要为了让本地 checkout 变小而扩大 LFS glob；这会改变部署和历史可用性。

## 4. 生成并审查 index

```bash
python3 scripts/generate_index.py
python3 scripts/validate_data.py --check-files
git diff -- data/index.json
```

重点审查：

- `route`、`aliases` 唯一且稳定；
- `files.*` 都是 `data/` 内相对路径；
- `experienceType` 和 `viewer.*` 符合实际交互；
- `fileSize`、`totalResources`、release 元数据由生成器更新；
- 没有把环境文件误选为主体模型。

字段说明见 [资源索引参考](../reference/resource-index.md)。

## 5. 更新版本历史

代码、行为和工具变化使用新的数字版本；只增加或替换资源时使用当前数字版本的字母后缀。Viewer 当前规则定义在 [`metadata/version-history.json`](../../metadata/version-history.json)。

版本历史是源，`data/version-history.json` 是发布镜像；两者必须完全一致。运行生成器后再用 `scripts/validate_data.py` 检查。

## 6. 验证与发布

至少验证新增 route、一个 alias（若有）、直接资源 URL、settings 解析和移动端首屏。只有 data/fixture 变化时，路径级 CI 会运行 data 验证与受影响 Viewer 检查，不应触发 Editor、Design 或 reference。

合并后由现有 Netlify build 重新生成 index、构建 Viewer，并同步 `data/` 与 `metaflow-editor/`。不要在文档或资源 PR 中手动触发 production mutation。
