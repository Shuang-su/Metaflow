# MF-97 本地试用与复跑

唯一范围见 `../docs/changes/97-guidance-ui-layered-map/spec.md` 和 `plan.md`。这是 Viewer 5.20.1 的隔离试用，保留 MF79 原生行走、Recast 和高斯遮挡路线。原件、旧试用、正式数据索引均未改写。未发布。

## 入口

```sh
cd /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow/mf97-viewer-trial
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5185 --strictPort
```

- Viewer：`http://127.0.0.1:5185/?scene=apms-2026`，或 `scene=sdi-2026`。
- 独立单体素修正版：`http://127.0.0.1:5185/?scene=apms-2026&trial=62e9fc9f1c2826ea3d7c5094`。已通过成套加载/原生短步/切回原件浏览器检查；不是默认替换或全场修正。
- 设置中开启导览，顶部标题选择目标；小地图独立。范围固定2米，忽略旧3米偏好。
- `mixed=1` 是测试夹具：第一点为普通说明，导览列表隐藏它，但场景说明仍可点击。默认67点全部显式启用Nav，只改变内存试用副本。
- Studio：`http://127.0.0.1:5185/studio/`。需要先构建下述隔离Studio。
- 地面审查：`http://127.0.0.1:5185/ground-review.html`。仅导出决定，不自动替换体素。
- 大运：`scene=dayun` 为原始全场资料查看；`scene=dayun&dayunView=overlap-low` / `overlap-high` 是已核验的局部原件LOD0站位，±6m源范围，清楚标示局部覆盖。上下支撑已实测，连接未确认，尚无可用楼层导航/底图。华发没有加入线上资源或导览目标。

Node使用既有arm64 runtime；依赖在本机复用只读node_modules。新机可按各项目现有lockfile安装，不能将复用symlink当成可移植依赖包。此试用Vite直接编译当前SCSS，改样式后重启服务器；不依赖旧public/index.css。

2026-10-09 起新机器使用固定 Node22.23.3、独立 lockfile 与统一本地资源配置，不再需要旧机器的目录布局或依赖链接。按 [Mac Studio 迁移步骤](./docs/mac-studio-migration.md) 获取必要代码、复用已有场景和选择缓存。上面的旧绝对路径仅描述原机；新机入口仍为 `127.0.0.1:5185`。旧实景证明不会自动成为迁移后的验证。

## 验证

```sh
node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts
node ../metaflow-viewer/node_modules/typescript/bin/tsc --noEmit -p ../metaflow-viewer/tsconfig.json
node ../metaflow-viewer/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node scripts/browser-ui.mjs
node scripts/browser-touch.mjs
node scripts/browser-soak.mjs
node node_modules/tsx/dist/cli.mjs scripts/regression.ts
```

真实浏览器使用本机Chrome，不安装浏览器。UI脚本分别测试桌面与窄屏触控上下文，检查列表、独立开关、原生输入、菜单键盘隔离；不是手机真机测试，不替代全部真实长路线或30分钟验收。Studio脚本使用600点合成PLY，经真实菜单/画布进行创建、编辑、撤销重做、保存、导出、冷重开和重新导入；调试事件仅读取快照。

Studio构建（原MF58工作树保持只读）：

```sh
cd ../supersplat-v2.32.5
node --test tests/studio-contract.test.mjs
STUDIO_BUILD=1 STUDIO_OUTPUT_DIR=/Volumes/Prism/Metaflow/.codex-work/tmp/mf97-studio-build node node_modules/rollup/dist/bin/rollup -c
```

原生路线回归使用上面的 `scripts/regression.ts`：只复制三个小配置到本轮新目录，再复用MF79当前脚本。媒体峰会42点、SDI25点均完整列出；30/60/120Hz和jitter按同一原生输入tape检查，当前全部通过、固定tick误差0、到达只触发一次。旧七组和额外marker-2单列，固定20为SDI `[1,4,5,7,8,9,10,11,12,13,14,16,18,19,20,21,22,23,24,25]`。

原件证据位于 `continuation-20261002/validation/regression/`。显式设置 `MF79_REPLAY_ASSETS` 时，回归入口从JSON映射读取单独碰撞/导航组合，严格核对源、元数据、标点和BIN哈希，再写 `validation/corrected-regression/`；它不改变浏览器默认资产。

## 资产与边界

地图详见 `docs/gaussian-maps.md`，地面详见 `docs/ground-analysis.md`。只读导航清单在本地服务器合并已冻结map job的高斯哈希和矩阵，用于来源核验，不修改MF79缓存。缓存来源、缺块、地图和路线状态分别报告。

路线表面分段、原生只读支撑关联、目标区域和地图已共享显式表面目录接口；真实区域必须由证据目录绑定，不使用半米高度桶冒充楼层。大运原件的局部连接正在核对，具体覆盖和限制见唯一报告。华发缺少已核验世界配准和可直接用于浏览器的高斯/碰撞输入组合，继续作为本地候选。

新产物统一写 `/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/continuation-20261002/`。本轮用户明确批准Prism预留5GiB，累计新增8GiB、单任务RSS1.5GiB；工具与重生成串行，原件/旧缓存不删除。资源检查、恢复记录与原子写盘复用同一模块。

472块旧地面报告已复制并重筛，审查页增加独立高斯剖面及源校验。已有两份各一个孤立体素的独立副本，只有c98/14通过严格原生穿越和成套导航验证；这不意味着默认Viewer已应用。完整树差异、原生穿越、GPU占据查询和同源Recast分别验收，实际状态以地面记录与报告为准。

Open3D已经恢复到外置独立 `continuation-20261002/tools/python-cd8fefe83d09/mf97-python`。重跑全套测试时设置 `MF97_GROUND_PYTHON` 为其 `bin/python`，并设置 `PYTHONDONTWRITEBYTECODE=1`；真实detector已运行，不把skip算通过。旧工具链接与归档保持原位。

真实Chrome30分钟稳定运行完成，114次目标切换、29次采样，0浏览器错误；只有原生键盘短步而非两展完整长路线人工验收。触控事件验证拖图、双指缩放、选择/取消，地图操作不改人物状态；这是桌面Chrome模拟，不是真机。测试日志与图像位于本轮 `validation/`，无发布、推送或公开资源入口变化。

## 修正版成套验证及回归

下列命令在 `mf97-viewer-trial/` 执行。离线地面、地图、导航与试用包输出使用同一资源模块；浏览器证据另做磁盘检查并纳入后续目录统计；旧副本与失败报告保留，不在原件上覆写。

```sh
MF97_RUN_ROOT=/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/continuation-20261002
MF79_REPLAY_ASSETS="$MF97_RUN_ROOT/validation/corrected-assets.json" MF97_REGRESSION_OUTPUT=validation/corrected-regression-v2 node node_modules/tsx/dist/cli.mjs scripts/regression.ts
```

已完成证据目录不会覆盖；重跑时使用新的 `MF97_REGRESSION_OUTPUT`，并将下列 `--regression` 指向新结果。回归在执行前冻结实际实现import闭包及输入，结束复验未变；manifest、完整67点及旧七组结果逐文件绑定。

```sh
node node_modules/tsx/dist/cli.mjs scripts/prepare-trial-bundle.ts \
  --artifact "$MF97_RUN_ROOT/accepted/d80fd685122da078e4cf90d9" \
  --navigation "$MF97_RUN_ROOT/navigation/apms-2026-503656bf35d8" \
  --native-validation "$MF97_RUN_ROOT/validation/real-patch-apms-c98-14.json" \
  --gpu-proof "$MF97_RUN_ROOT/validation/gpu-collision-d80fd685122da078e4cf90d9-v2.json" \
  --regression "$MF97_RUN_ROOT/validation/corrected-regression-v2/summary.json" \
  --review "$MF97_RUN_ROOT/ground-v2/apms-2026/chunk-00098.review.json" \
  --decisions "$MF97_RUN_ROOT/review-decisions/apms-single-bump-c98-14.json" \
  --original /Volumes/Prism/Metaflow/.codex-work/cache/mf79-native-viewer-v1/apms-2026 \
  --map-manifest /Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/maps/apms-2026/manifest.json \
  --check
```

`--check`只读预检；去掉它生成三个小型清单overlay，不复制高斯底图或改写原导航。打印的24位id可作为 `/?scene=apms-2026&trial=<id>`，页面标注“1个体素微修正”，提供“切回原碰撞与导航”。原件URL不带trial参数，试用版本不保存为用户默认。

```sh
MF97_TRIAL_ID=62e9fc9f1c2826ea3d7c5094 node node_modules/tsx/dist/cli.mjs scripts/browser-trial-bundle.mjs
MF97_DAYUN_VIEWS=overlap-low,overlap-high node node_modules/tsx/dist/cli.mjs scripts/browser-dayun-inspect.mjs
MF97_DAYUN_VIEWS=a,b,connection node node_modules/tsx/dist/cli.mjs scripts/browser-dayun-inspect.mjs
```

大运第二组技术加载通过但高斯内容稀疏，不能凭它交付建筑楼层地图。具体参数、原生双向轨迹、部分路径与视觉不足原因见唯一报告及 `validation/dayun-view/interpretation.md`。当前磁盘剩余约5.57GiB，离5GiB底线约0.56GiB；资源快照会随其他任务使用变化，继续生成前必须重新检查。


大运同XZ上下支撑的扩大检查已完成16块，仍双向partial，不标为全场不可达。重跑只读完成资产核验：

```sh
node node_modules/tsx/dist/cli.mjs scripts/dayun-generate.ts --job "$MF97_RUN_ROOT/dayun/jobs/x16-z8-overlap-recast-82m-v1.json"
```

若重新生成，使用独立job ID/输出，在开始时固定100MiB批次累计预算并监视本轮Node总RSS，约1.4GiB时提前停止；现成记录包含首进程11块停止、核验后续5块完成。不要重跑时提高限制掩盖内存增长，也不要把partial路线送入到达回放。原件293块索引不变，局部导航只覆盖明确记录的81.92m窗口。
