# 添加并发布资源

本指南从“资源文件已经准备好”开始，目标是让它获得稳定 route，并通过现有静态发布链路可访问。先判断规模与契约变化，再选择最短可信流程。

## 1. 选择发布路线

| 路线 | 判断条件 | 最小流程 |
|---|---|---|
| 常规资源 | 既有格式、schema、生成器、缓存和现有 route；不涉及 LFS、许可证、运行时代码或部署配置 | 可 Direct Commit；生成并审查 index，运行数据和 route 定向验证 |
| 大型或新增入口 | 新 route/alias、超过 20 个文件、新增超过 100 MiB、LFS 或大量 tiled/LOD 文件，但契约不变 | 轻量 Issue 或 PR checklist + PR；审查存储、路径、index 和缓存 |
| 结构性资源变更 | 修改 schema、生成器语义、Loader、Viewer、缓存/部署、格式兼容、授权来源或公共 URL 契约 | Issue + Spec + Plan + PR；运行被实际行为命中的检查 |

文件数量和体积决定操作路线，不自动把已有契约内的资源变成架构任务。仅 staging 且尚未进入公开 index/route 的上传不提升产品版本。

## 2. 确定分类与目录

生成器识别的一级分类由 `scripts/generate_index.py` 的 `CATEGORIES` 定义；部分分类还有 `SUBCATEGORIES`。先复用现有结构，不要只为一个资源随意新增分类。

目录名可以保留采集信息，公开 route 使用规范化 slug 或显式 override。需要兼容旧链接时使用 alias，不复制一份资源。新增普通 route/alias 若完全复用既有契约，属于兼容内容变化；它会触发轻量 PR 路线，但不需要完整 Spec。

## 3. 准备文件

一个可发布 route 至少需要生成器可识别的主体模型。当前组合：

- legacy：`*.sog` + `settings.json`；
- streaming：`lod-meta.json` + 分块文件 + `settings.json`；
- 独立 compressed PLY：只能通过 Viewer direct URL 或 legacy package 使用，当前不会被生成器选为 route 主模型；
- 可选环境：文件名包含 `environment` 的压缩 PLY；
- 可选缩略图：`loading.*`、`thumbnail.*` 等生成器支持的命名；
- 可选碰撞：单体 voxel 或 tiled `voxel-tiles.json`。

生成器对部分历史目录有明确 override。不要依赖“碰巧按字母排序选中正确文件”；存在多个 settings 或 model 候选时应写规则。

`files.model` 是当前 route 的唯一运行时主体来源。目录中同时存在 SOG 与 `lod-meta.json` 时，本轮不会自动改成 streaming，也没有用户切换 UI；既有 route 继续使用 index 已选入口。未来数据标签系统会另行登记 `streaming` 与 `highest-quality` 来源及默认值，不要提前手写未定义字段。

同一路径覆盖大型 immutable 文件前必须评估缓存；优先采用新文件名或内容地址，避免客户端继续命中旧内容。

## 4. 处理 Git 与 LFS

先检查文件大小和 `.gitattributes`。当前规则是混合策略：多数 LFS 资产按精确路径列出，但 `data/Shenzhen/250917 Dayun/**` 是目录级规则。Dayun 目录下即使新增较小的 settings、thumbnail、SOG、PLY 或 voxel，也会命中 LFS；不能用“文件较小”推断它会进入普通 Git。

```bash
git check-attr filter -- "data/<资源路径>/<文件>"
git lfs ls-files
```

若目标被标记为 LFS，确认提交的是 pointer，且托管端已有对象。目录级例外是否合理应在独立存储/部署变更中调整；不要在一次资源上传中顺手扩大或缩小 LFS glob，这会改变部署和历史可用性。

## 5. 生成并审查 index

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

字段和可索引模型边界见 [资源索引 schema](../reference/resource-index.md)。

## 6. 更新版本历史与 Ledger

公开 route、thumbnail、settings 或资源内容发生变化时，使用 Viewer PATCH，并同时更新：

- `metadata/version-history.json` 结构化事实源；
- `data/version-history.json` 发布镜像；
- `data/index.json.release`、Viewer package/lock 和当前版本摘要；
- [Viewer 变更总账](../metaflow-viewer-change-ledger.md)。

当前代码/记录候选为 `5.19.0`，生产仍为 `5.18.1`。旧字母版本不改写；`5.19.0` 合并并完成最终 SHA 对齐后，下一次 PATCH 资源发布使用 `5.19.1`，之后依次递增，不再新增 `5.18b`。完整职责见 [版本与发布](../maintenance/versioning-and-release.md)。

常规 Direct Commit 发布使用两个本地原子提交并一次 push：先提交资源/index，再以 `chore(release)` 引用前一个真实 SHA 并更新版本记录。PR 使用 squash merge 时，合并后以极小 release-record commit 回填最终 SHA；在回填完成前不标记稳定完成。

## 7. 验证与交付

至少验证新增 route、一个 alias（若有）、直接资源 URL、settings 解析和与资源相关的首屏/交互。常规资源不运行无关 Editor、Design、Reference 或全仓 E2E；实际命令、结果和未运行项记录在 PR、Issue 或直接提交交付中。

可以用本地路由器预览建议检查：

```bash
node scripts/ci-routing.mjs route --base origin/main
```

GitHub Actions 只按需手动运行，不是资源发布的通用完成条件。合并或 direct push 后由现有 Netlify 配置决定站点构建；文档或资源任务本身不手动触发 production mutation，除非发布 Plan 明确授权。
