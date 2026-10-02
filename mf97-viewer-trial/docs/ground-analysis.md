# MF97 地面审查与同源修正记录

更新：2026-10-03。当前原件均保持只读，默认 Viewer 仍使用原碰撞。本轮已有 **2 个真实候选分别写入独立副本，每份各改 1 个体素；其中 1 份通过严格穿越和同源导航验收，另一份未通过**；接受是 Agent 对高斯剖面的技术审查，不是用户人工验收，也不代表自动修正全场。

## 472 块报告恢复与重筛

旧报告已复制到 `/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/continuation-20261002/ground-v2/`。336 块媒体峰会与136块SDI共472块全部完成，未重跑全场 Open3D。复制核对原/副本哈希，再应用八邻域连续平台、窄条与踏步保护；每项保留或剔除都有原因，新的 edit 集合是旧集合的子集。旧报告和两展源 JSON/BIN 结束复核未变。

| 场景 | 报告 | 新拟改候选 | 保护候选 | 未知候选 | 旧 edit 引用 → 新引用 | 新不同体素 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 媒体峰会 | 336/336 | 157 | 2063 | 25 | 125888 → 1771 | 1770 |
| SDI | 136/136 | 81 | 958 | 12 | 67077 → 603 | 600 |

候选计数包含 halo 重复，不能当作实际修正量。37个旧的零edit拟改候选改为未知。当前分析指纹为 `60d2abd5a1cb409c4c0a1ce3c720bc85ad36d8f171a5c4b4af6192ac42a573fe`，`protectionVersion: 2`。程序版本是源文件哈希的一部分，不能格式化后继续冒用旧指纹。

迁移测试覆盖中断恢复、重复执行、源变化、未知算法、损坏产物、嵌套源输出路径和符号链接别名。完成记录再次执行为 `alreadyComplete: true`、本次写入0 bytes；迁移程序本身升级后可以只读核验已完成资产，部分完成且程序指纹不同则拒绝继续。证据：`validation/ground-migration-audit.json`，每场景 `coverage.json` 和 `migration-log.json`。

## 高斯剖面审查

5185的 `ground-review.html?scene=apms-2026` 默认读取完整新版报告。原碰撞、拟合面和稀疏差异与独立高斯剖面共享世界坐标；使用高斯世界空间过滤，不把相机 near/far 当作剖切，也不改变主 Viewer 材质/相机。可切X/Z两个正交剖面、隐藏差异检查原高斯。

接受前必须同时满足：当前分析与源指纹、非空拟改候选、服务端逐文件高斯哈希核验、真实加载/排序完成的高斯帧，以及填写明确理由。重新选文件、换候选/剖面、取消或恢复缓存页面均作废旧证据；一个未销毁的渲染任务未结束时不并发创建新设备。实际Chrome测试覆盖自动/手动文件竞态、取消、重复选择同内容的新File，3/3通过。其他候选保持待审，不能仅靠降采样点图接受。

首个真实候选为 `chunk-00198.review.json` 的第9号数组项，ID `apms-2026:layer:0:surface:77aa844b5314e44f:patch:9`。两方向剖面显示该位置为连续地面，一个独立体素高于周围表面；不是连续路缘、踏步或墙脚。删除 raw `[1200,106,699]` 的一个占据bit，世界中心 `[1.96,-0.12,-4.20]`，中心向下射线支撑顶面从 −0.08m 到 −0.16m，四邻不变。

决定 `review-decisions/apms-single-bump-c198-9.json` 记录理由、四张实际截图的哈希及源/算法身份。此前 `chunk-00182` 的填坑候选双向剖面证据不足，未接受，未将拟合平面当成真实地面证据。

## 独立碰撞与原生验证

产物目录 `accepted/3e549296eae92fe8128bf676/`，只写独立 `walk.voxel.json/bin`。原件输出哈希分别为：

- 原件：`5482cf4b4320778af797fa0f39a9f86ba1f965e5aa09233290a40d64881d320b:9776e05a27757a32900ddedfcbb62d1832627903aebb2791b23da46fb9b4802b`
- 副本：`5441a5506d57536a01013d4a71354c611b07859ccbf238ca525aef2939599a25:2528ea36c08f8c7df97e4d8329ab922b95fd8f24431076c9b0d664d4fb7291ec`

完整稀疏树差异核验访问1,451,985节点、比较587,591叶块，证明全场恰好一个bit变化，而非只检查候选附近。新版合成测试覆盖写出/读回、压缩实心节点、空树、源匹配和保护结构。

第一版局部输入只证明未退化，没有真正穿过修改位置。独立复核后收紧为四向连续穿越、两侧越过修改区、同一支撑面、接地且碰撞有效；`validation/real-patch-apms-c198-9-v4.json` **未通过**，未生成其导航或试用包。不能拿原 v2 的“轨迹相同”作为有效穿越证据。其 GPU 占据验证通过也不能覆盖这项失败。

## 第二处：完成独立成套试用验证

`chunk-00098.review.json` 第14号候选，ID `apms-2026:layer:0:surface:0c39cfccfda9de4d:patch:14`。X/Z高斯剖面及隐藏差异的四张实际画面显示连续地面上单独微凸体素，决定保存在 `review-decisions/apms-single-bump-c98-14.json`。删除 `[688,106,296]` 的一个占据bit，世界中心 `[-39,-0.12,-36.44]`。它是另一份从原件生成的副本，**没有叠加第一处修改**。

- 碰撞：`accepted/d80fd685122da078e4cf90d9/`；输出身份 `5441a5506d57536a01013d4a71354c611b07859ccbf238ca525aef2939599a25:943e150f7b8ca11e83d76d341b0957773d9ed13f90520dc841bc4257a3bcac98`。完整树比较1,451,985节点、587,591叶块，恰好1个bit变化。
- 原版行走：`validation/real-patch-apms-c98-14.json`，9组输入；四个方向均120tick移动加120tick停步收敛，全240tick正常接地且移动段确实穿过，两侧越界和尾段收敛通过，最近经过修改中心约0.00265m。水平轨迹前后差为0，局部垂直差约0.016–0.02m，不能扩大成全场体验改善。
- 实际WebGPU：`validation/gpu-collision-d80fd685122da078e4cf90d9-v2.json`。原件/副本各8,232,436字节GPU上传后完整读回SHA一致；生产WGSL占据查询各125点与CPU零差异，仅该bit改变。**未将GPU射线DDA、胶囊物理或整场GPU碰撞冒充已验收。**
- 同源Recast：`navigation/apms-2026-503656bf35d8/`。54块中重建受影响的 `tile-2-1`，53块核对输入未变后复用；完整资产53,307,575bytes。重建块的导航hash与原块相同，合并nav hash为 `fa5a236dc271f8dc36c68f14de53640280369dde8efa52960540175b652db206`。这说明该微修正没有改变现有导航连通性，不能声称修好了不可达目标。
- 全量自动回放：修正版媒体峰会42/42，原版SDI对照25/25，固定20/20、旧7/7；30/60/120Hz及抖动分别核对。完整来源、执行代码及结果文件指纹见 `validation/corrected-regression-v2/summary.json`，逐目标表见唯一报告。

最终成套试用ID为 `62e9fc9f1c2826ea3d7c5094`，真实浏览器加载新碰撞/导航/地图、选点、原生WASD和切回原件通过。

试用包只有在材料化、严格原生穿越、GPU数据、同源导航、完整回归与地图来源全部匹配时才允许生成。浏览器通过显式 `trial` 参数成套选择，不保存为默认；原件入口始终保留。视觉高斯和82张底图像素不变，独立地图清单记录碰撞版本的派生关系。

SDI `chunk-00094` 第2号虽然原件局部行走通过，但一方向高斯剖面缺少足够内容；APMS `chunk-00182` 第30号填坑处存在高度结构歧义。两者均未接受。候选数量减少、局部行走通过或平面拟合本身都不是接受依据。

## 资源和可复跑命令

新输出统一为 `continuation-20261002/`。用户本轮批准Prism预留 **5GiB**，累计新增上限8GiB、进程RSS1.5GiB，重型任务串行；不足保存恢复信息，不裁剪目标或覆盖。

已从SHA核验归档恢复12478项、622,723,924 bytes到 `tools/python-cd8fefe83d09/mf97-python`，旧工具链接和归档均保留。归档SHA `cd8fefe83d09c0af9f365b4c26c99b866cd7aac00313f69f3402813f43c8f8a1`。真实Open3D0.19 detector测试已在新路径执行，没有把环境缺失的skip算作执行。

以下命令在MF97目录执行，`ROOT`是本任务输出目录，Node使用既有arm64 runtime：

```sh
ROOT=/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/continuation-20261002
node node_modules/tsx/dist/cli.mjs scripts/ground-migrate-reviews.ts
MF97_GROUND_PYTHON="$ROOT/tools/python-cd8fefe83d09/mf97-python/bin/python" PYTHONDONTWRITEBYTECODE=1 MPLCONFIGDIR="$ROOT/tools/matplotlib" node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts
node scripts/browser-ground-review.mjs
node scripts/browser-ground-races.mjs
```

最终GPU证据已经冻结，日常复核使用README的 `prepare-trial-bundle.ts --check`，不会重写v2报告。首次采证使用 `MF97_ACCEPTED_ID=d80fd685122da078e4cf90d9`、`MF97_DECISIONS_FILE=$ROOT/review-decisions/apms-single-bump-c98-14.json`、`MF97_REVIEW_FILE=$ROOT/ground-v2/apms-2026/chunk-00098.review.json`。GPU脚本不带这些参数会选择旧c198样本；当前脚本的输出名固定且禁止覆盖，不能把无参数执行当作最终副本的复跑。未来重新采证需使用独立证据目的地并重新绑定试用包，保留原报告。

真实materialize、局部原生检查和Recast重建需要明确 `--review`、`--decisions` 与独立输出；不能直接接受全部拟改候选。脚本参数和具体本轮产物以各脚本入口及报告为准。旧2026-10-01的10GiB阻塞和工具归档历史保留在Git基线 `3b8ba998`，不再作为当前状态或恢复命令。

## 多层与华发边界

大运使用293块原碰撞，全高度core+halo索引；当前真实连接与局部覆盖见实施报告。半米分桶仅作分析辅助，不能定义楼层。原件LOD1缺失/损坏不伪装已修复；新地图显式使用通过引用核对的LOD0，并独立检查实际加载解码。

华发P1有2,699,643顶点/4,630,792面三角网格及LCC资料。多高程带不等于可走楼层，Z-up仍是推断；未确认尺度、authoring变换及高斯/碰撞配准，没有可用的已核验浏览器输入组合。本轮无新LCC转换管线、无公开入口。源审计保留 `huafa-source-audit.json`。
