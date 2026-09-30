# MF97 地面分析与审查

`scripts/ground-analysis.ts` 只读源 `.voxel.json/.bin`，按批准 Plan 的 8 m core + 1.04 m halo 遍历所有 XZ 与所有有净空的支持高度，以 Open3D 0.19 `detect_planar_patches` 提出局部平面。没有检测到或不能判定的支持面保留 `unknown`，墙脚、薄板、孔洞、边界、重复踏步和超过一个源体素的改动保持保护状态。候选只包含体素原值/目标值的稀疏差分，不生成已接受资产。

使用已有 arm64 Node 执行，避免 Rosetta Node 与 esbuild 的平台冲突：

```sh
/Users/shuangsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs scripts/ground-analysis.ts --scene apms-2026
/Users/shuangsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs scripts/ground-analysis.ts --scene sdi-2026
/Users/shuangsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node node_modules/tsx/dist/cli.mjs scripts/ground-analysis.ts --dayun-inventory
```

默认输出在主项目 `.codex-work/cache/mf97-navigation/ground`，不复制输入。工具环境实际在本 worktree `.codex-work/cache/mf97-python`，主项目 `mf97-navigation/python` 用 symlink 保留原绝对入口；基于已有 bundled CPython 3.12 的 system-site packages，Open3D CPU 模块与 import 所需依赖已本地安装。没有安装 Jupyter/notebook 或 ML 框架；`nbformat` 这一仅供 notebook 视觉化的元数据依赖有意省略。环境不能当作完整 Open3D GUI/ML 安装。

`ground-review.html` 接受同一 source hash 的一个或多个分块报告，显示原支持面、拟改体素与侧面高度，提供接受/拒绝/撤销。新报告必须是 `protectionVersion: 2`，且有非空匹配 analysis hash；选择原始 JSON/BIN 重新计算 SHA-256 后才启用接受和导出 `GroundDecisions`。未知/保护候选无法接受。旧报告只允许查看，提示重新筛查并禁止接受/导出。`--review <分块或coverage目录> --decisions <决定JSON>` 同样重新读源、核验版本/hash 与每个 before mask，再核验源未在导出期间变化。接受决定随后让原生步行、导航网格和高度查询对同一接受资产验证。`overlay.ts` 提供 CPU 共用 occupancy；原 octree GPU 节点仍不可变，GPU 使用前须重新打包接受资产，不能把 CPU overlay 称为已修正的原二进制。

每片完成后原子保存 `coverage.json`；资源失败和 Open3D 失败记录 `error/nextChunk` 并保留已完成片。使用 `--resume` 只在源与 8 m/1.04 m 参数一致时继续。分块报告的 `completeCoverage` 只指该 core 的格点枚举，整场完成以 `coverage.json.completeCoverage` 为准。

资源门槛：Prism 始终保留 10 GiB；Node RSS 上限 1.5 GiB；每次运行输出上限 256 MiB；每块最多 100000 个点；检测串行，超时失败而非全场压平。分析全 bounds 不代表全场自动修复，完整 coverage 仍可能大量未知。

稳定 `surfaceId/layerId` 来自全 scene/asset 命名空间、持久层锚点和厘米足迹/单位平面数据，不以 chunk 或 Detour polyRef 命名。上下层的 XY 重叠没有邻接含义；`linkSurfaceContact` 需要原生支持验证与真实接触高度，才可登记楼梯/坡道相邻关系。地面候选的 8 水平邻域只要一个支持同高即保留相连结构，避免削去窄凸条/45° 斜条端点；邻支持有一体素高程分带也保留踏步，未知/保护项均不能接受。旧全场报告须经 `ground-migrate-reviews.ts` 重新筛查及身份迁移后才对应新规则，迁移只接受已审计两展原算法 hash 与 world 坐标，不重跑 Open3D，并逐片保留原后 hash 和恢复信息。
