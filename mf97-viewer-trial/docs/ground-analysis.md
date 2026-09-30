# MF97 离线地面分析与审查记录

这份记录区分已完成的全场枚举、待人工审查的候选和实际碰撞资产。两展原件未修改，真实候选接受数为 0，Viewer 应用数为 0。媒体峰会没有采集上层，报告中的高处支持面不命名为真实楼层，也不尝试接通。**当前缓存报告仍是旧规则；新保护代码通过回归，但报告保护迁移受 Prism 10 GiB reserve 阻止，尚未执行。**

## 完成范围

Open3D 0.19 CPU `detect_planar_patches` 在本地环境真实运行。按批准 Plan 的 8 m core + 1.04 m halo、源 8 cm 网格串行枚举全 bounds 的所有支持高度，不以入口连通分量代表全场。保留孔洞、边界、竖向结构、薄板/净空不足、超过一个源体素的差异、小于 4 m² 的独立台面，以及连续路缘/平台/踏步。检测失败或不能自动判断的面保留未知；没有全场压平或 SDF/Poisson 重建。

全检测后、最终保护迁移前的可复核统计如下。观察数量含 halo 重复，不等于不同原始支持点数量。

| 场景 | 完整 core | 拟改候选 | 保护候选 | 拟改体素引用 | 不同拟改体素 | 未知支持面观察 | 报告量 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 媒体峰会 | 336/336 | 534 | 1711 | 125888 | 125826 | 1627966 | 23.0 MB |
| 学院展 | 136/136 | 265 | 786 | 67077 | 66968 | 619288 | 11.5 MB |

原始检测/分类 hash 为 `b595d2a99dd4966ea755ccfb08b176ad3516084eba8394a60fbcea21cf8e0262`。随后回归发现连续 8 cm 路缘只保护边缘、内部仍可能削平，窄条端点及 45° 斜条也可能遗漏，已经修复执行代码和测试：8 水平邻域中只要一个同高支持即保留，邻支持有一体素以上高度分带也保留踏步，`coherentPlateauMinNeighbors: 1`、`coherentPlateauNeighborhood: 8`。新算法 hash 为 `bab6f04704b6cc9250e16b019ba6849be2e2cfaf2fd8a1f41e34b4e6caedaf03`，新报告必须有 `protectionVersion: 2`。

报告迁移同时修正 scene 层命名空间与这一保护漏项，必须记为 **namespace-and-coherent-plateau-protection**，不能记为 ID-only。迁移仅允许已审计 `b595…` 原算法、每片原 hash 同值及 `world` 坐标，拒绝未知算法或 flip 报告；每片先保存原/后 SHA-256 与 prepared 状态，再原子替换报告并记录 finished，中断可按这两个 hash 恢复。它记录移除的拟改体素、原/后算法 hash、源 hash，零接受状态下串行处理，不重跑 Open3D。最终结果以各场景 `coverage.json` 与 `migration-log.json` 为准；资源门槛拒绝写入时旧报告仅可查看，UI 禁止接受/导出，CLI 同样拒绝旧保护版本与缺失/不匹配算法 hash。当前待迁移记录位于 worktree `.codex-work/tmp/mf97-navigation/ground-migration-pending.json`。

输出目录为 `/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/ground/`，每场景有 `coverage.json` 和分块报告。原始源在外置 `Prism_初号機/3D高斯`；开始和结束均重新计算 JSON/BIN SHA-256，源 hash 匹配。`coverage.json.completeCoverage` 才表示整场完成；单片报告明确 `coverageScope: chunk`。

## 可执行入口

在 `mf97-viewer-trial` 执行，使用已有 arm64 Node，避免 Rosetta Node 与 esbuild 架构冲突。

```sh
/Users/shuangsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs scripts/ground-analysis.ts --scene apms-2026
/Users/shuangsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs scripts/ground-analysis.ts --scene sdi-2026
```

每片原子保存恢复清单；资源/检测失败写 `error` 和 `nextChunk`，保留前片。相同源、参数与算法 hash 可用 `--resume` 继续。已用限制为一片的真实读取 fixture 验证故障恢复：第二片使用不存在的 Python 时返回预期错误，第一片及 `nextChunk: 1` 保留。

```sh
... scripts/ground-analysis.ts --scene apms-2026 --resume
... scripts/ground-migrate-reviews.ts
```

`ground-review.html` 显示俯视与侧视的原支持面样本、候选面及稀疏增/删体素。选择同一 source/analysis hash 的版本 2 分块，重新选取原 JSON/BIN 计算 SHA-256 后才启用接受与导出。可以拒绝与撤销决定；未知/保护项不能接受。旧规则报告可以查看，但明确提示重新筛查并禁止接受/导出。选择只导出决定，不改变碰撞。

```sh
... scripts/ground-analysis.ts --review <coverage目录或一个分块> --decisions <ground-decisions.json>
... scripts/ground-materialize.ts --review <coverage目录或一个分块> --decisions <ground-decisions.json>
```

materialize 只根据显式批准的决定写 `/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/accepted/` 下独立副本。它要求 protection version 2 与同值非空 analysis hash，重核源和每个 before mask，以 copy-on-write 八叉树路径重打包 v1.1；不分配 dense 全场数组，不改原节点。修改 block 的 64 个 bit 全部核验，差异只能是接受的 voxel edits，bounds 保持。新元数据/BIN及 manifest 读回 hash；`nativeValidation: pending` 与 `appliedToViewer: false` 明确保留。此前只含一个接受 bit 的 **synthetic fixture** 已实际写出/读回副本，但该磁盘 fixture 属于版本 2 收紧前的结构验证，不再可以作为当前接受输入。新版 classify → 匹配指纹决定 → materialize 的内存 fixture 已通过；版本 2 新磁盘副本受 reserve 限制未重写。没有将 fixture 接受冒称真实场景审查。

CPU `overlay.ts` 共用 occupancy 可用于原生查询与 Recast geometry。GPU 原 octree 仍只读，必须使用 materialize 出来的完整接受资产才可宣称 GPU 与 CPU 同源；替换 Viewer、native、worker、Recast 或发布均未发生。

## 资源与依赖

本地 Python 环境实际位于 worktree `.codex-work/cache/mf97-python`，约 622 MiB；原 `/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/python` 是指向它的 symlink，保留 venv 绝对入口。迁移逐个核验 12478 个文件/链接，tree SHA-256 为 `2f6bc5843d316986f9ff78797196f0eca7587f00cd04b8d40c0c54e223b67ce0`；成功导入 Open3D 0.19 并经原入口执行真实 detector fixture 后，才移除旧工具副本。全文件迁移日志位于 worktree `.codex-work/cache/mf97-python-migration.json`。

环境基于既有 bundled arm64 CPython 3.12 的 system-site packages 复用 numpy/pandas/Pillow。Open3D 0.19 wheel 为 103202754 B、解包 293611190 B，SHA-256 `9e4a8d29443ba4c83010d199d56c96bf553dd970d3351692ab271759cbe2d7ac`。安装 staging wheel 已在核验 exact path/size/hash 后移除，安装环境保留。没有更改全局 Python、产品 dependency 或安装 notebook/ML 框架。`nbformat` 这一仅供 notebook 可视化的声明依赖有意省略，本环境不能宣称完整 Open3D GUI/ML 环境。最小导入依赖版本见 `scripts/ground-python-requirements.txt`。

Prism 保留 10 GiB 的门槛、Node RSS 1.5 GiB、每次输出 256 MiB、每片 100000 点上限均在执行路径检查。工具环境迁移后实测 Prism 9.841 GiB、internal 1.673 GiB，因此报告仍不能新增写入。工具资源不足时曾经用户明确授权目录例外，把新副本复制到资产卷专用非模型 cache：该卷 ExFAT 对 622 MiB 小文件生成 14374 个 AppleDouble sidecar，实际占用 7.35 GiB，校验显示全部源文件/链接一致，仅有这些目标卷元数据 extras。随后仅清理本任务刚复制的整个工具目录并迁入 internal，资产卷空间恢复；小型审计保留于 `/Volumes/Prism_初号機/.codex-work/Metaflow/cache/mf97-navigation/python-exfat-copy-audit.json`。清理中 ExFAT 自动删除配对 sidecar 引发一次可恢复 ENOENT，仅忽略这一已消失项继续精确路径清理。原始 `3D高斯` 模型目录始终只读，工具缓存例外不等于要求整个源卷只读。

算法依据为 [Open3D planar patch detection 官方文档](https://www.open3d.org/docs/release/tutorial/geometry/pointcloud.html#planar-patch-detection)。Open3D 采用 [MIT license](https://github.com/isl-org/Open3D/blob/main/LICENSE)。没有集成 CGAL、全局 PolyFit、KSR、PCL 或未经验证的单层 floor projector。

## 大运与华发的证据边界

大运碰撞 manifest 的 293 个 JSON/BIN 均存在、binary word count 匹配，共 1178793196 B，8 cm，沿用既有 `metaflow-rz180`：Viewer 以负 camera.x 查询 raw tile，FlippedVoxelCollision 转换 X/Y。四个有限 tile 的稀疏列样本都有相隔超过 2 m、带 1.76 m 列净空的多支持面；这证明多表面碰撞存在，不证明楼层可行走或楼梯连通。四块 raw-X profile 搜索重复 16/24 cm rise、24..120 cm tread、0.48 m 邻支持未找到合格楼梯候选，confirmed stair connection 为 0。

大运视觉 stream 与碰撞完整性不同：820 个 meta 引用中 808 个有效；11 个缺失（`1_14` 与 `1_134`..`1_143`），`1_144/meta.json` 实际是 JPEG，`1_133` 缺 `scales.webp`/`sh0.webp`。这些被引用缺口均为 **LOD1**；最高 LOD0 未发现这类参考文件缺口，仍未做全 Gaussian 解码/渲染完整性验收。有效 metadata 引用 4040 个视觉文件、计 5178369832 B，无残留 LFS pointer。未补写、修复或下载任何原件。详见 `dayun-inventory.json`、`dayun-model-inventory.json`、`dayun-stair-samples.json`。

华发 P1 `mesh.ply` 是实际 triangle mesh，2699643 vertices/4630792 faces；每 32 面抽样呈现 4598 个同水平格多高程候选。几何主水平轴为 Z，显式标为 inferred 而非已注册 authoring transform；高程带含屋顶/天花可能，confirmed walkable floors 为 0，无现成 voxel/nav。L2 Pro 也有可读 triangle PLY 与 lcc2，未整体重建/生成碰撞，未发布。详见 `huafa-p1-mesh-audit.json`。

## 验证与未完成项

ground/layers 定向测试 13/13 通过，涵盖真实 Open3D noisy-plane 检测、所有支持层枚举、source XY flip、整块 8 cm curb、窄条端点/相连双点/45° 斜条/对角步阶/连续楼梯/小台面、墙脚、小凸起、错误源/旧算法/缺算法 hash、旧保护版本、空决定、新版 classify → 决定 → materialize、完整 synthetic 体素体积保持、compressed-solid/empty-tree 重打包、顶点顺序/法线尺度重建稳定性、双向验证邻接和错层拒绝。当前 TypeScript 检查通过。缺失 Python 环境会明确 skip，不能冒称 Open3D 已运行；实际环境存在并真实运行。

真实场景还没有人工批准地面候选、接受资产的 native capsule/步行轨迹验收、碰撞与导航重生成、真实多层/楼梯双向连通验证、Viewer 原件替换、上线或发布。小噪声与真实低矮结构几何上无法完全自动区分，因此大块连续平台保留；本实现更保守的候选不能称已自动修正全场地面。

独立审查地图模块发现：world-Y modifier 与完整 Mat4 的渲染链有明确坐标依据；map layer supportRange 只是显示建议。多层缺少已验证 surface catalog、map namespace 与 Route.surfaces 关联时，不应仅按高度显示当前路线/到达区；退出高度范围也不等于通往真实另一个楼层。两个现有场景只有一个已确认展示层，可保留明确的单层回退。新增大运/华发需要碰撞、Gaussian source hash、world transform 与稳定 scene/layer 身份的显式配准；图片不能作为导航拓扑证据。

### 最后工具缓存归档

长期浏览器试验期间系统盘继续跌到205MiB附近。只把本任务Open3D环境打包到资产卷独立项目缓存，逐一重新读取全部12478个文件/链接，比较文件SHA/大小与链接目标后才释放内部盘的工具副本；原始高斯/模型不参与归档。归档为 `/Volumes/Prism_初号機/.codex-work/Metaflow/cache/mf97-navigation/mf97-python-environment.tar.gz`，194683582 bytes，SHA-256 `cd8fefe83d09c0af9f365b4c26c99b866cd7aac00313f69f3402813f43c8f8a1`。同目录 `mf97-python-archive.json` 保留逐项清单与恢复位置。资产卷是ExFAT，单一tar避免再次因万余小文件/元数据产生7GiB实际占用。

当前原Prism工具路径的symlink保留，目标环境已归档，**运行detector前需要恢复**。确认内部卷至少1.5GiB可用、目标目录尚不存在，并先核对上述SHA：

```sh
mkdir -p /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow/.codex-work/cache
tar -xzf '/Volumes/Prism_初号機/.codex-work/Metaflow/cache/mf97-navigation/mf97-python-environment.tar.gz' -C /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow/.codex-work/cache
```

归档前实际Open3D、13/13定向和43/43完整测试均通过；归档后便携检查若跳过detector，必须如实记为跳过。没有替换全局Python/产品依赖。格式规范化后当前算法hash为 `924784524d4aec35702a133d8786eee0e574ecd1388bb12d1e074b48ade95d20`；旧报告仍待保护/身份迁移，不因纯格式hash变化获得接受资格。原件终检SHA仍与pending记录一致。
