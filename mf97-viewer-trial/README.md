# MF-97 本地试用与复跑

唯一范围见 `../docs/changes/97-guidance-ui-layered-map/spec.md` 和 `plan.md`。这是 Viewer 5.20.1 的隔离试用，保留 MF79 原生行走、Recast 和高斯遮挡路线。原件、旧试用、正式数据索引均未改写。未发布。

## 入口

```sh
cd /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow/mf97-viewer-trial
node node_modules/vite/bin/vite.js --host 127.0.0.1 --port 5185 --strictPort
```

- Viewer：`http://127.0.0.1:5185/?scene=apms-2026`，或 `scene=sdi-2026`。
- 设置中开启导览，顶部标题选择目标；小地图独立。范围固定2米，忽略旧3米偏好。
- `mixed=1` 是测试夹具：第一点为普通说明，导览列表隐藏它，但场景说明仍可点击。默认67点全部显式启用Nav，只改变内存试用副本。
- Studio：`http://127.0.0.1:5185/studio/`。需要先构建下述隔离Studio。
- 地面审查：`http://127.0.0.1:5185/ground-review.html`。仅导出决定，不自动替换体素。
- 大运：`scene=dayun` 仅是原始资料查看。无已确认导航/地图资产，不声称跨层可走。华发没有加入线上资源或导览目标。

Node使用既有arm64 runtime；依赖在本机复用只读node_modules。新机可按各项目现有lockfile安装，不能将复用symlink当成可移植依赖包。此试用Vite直接编译当前SCSS，改样式后重启服务器；不依赖旧public/index.css。

## 验证

```sh
node node_modules/tsx/dist/cli.mjs --test tests/*.test.ts
node ../metaflow-viewer/node_modules/typescript/bin/tsc --noEmit -p ../metaflow-viewer/tsconfig.json
node ../metaflow-viewer/node_modules/typescript/bin/tsc --noEmit -p tsconfig.json
node scripts/browser-ui.mjs
node scripts/browser-studio.mjs --output=/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/evidence/studio
```

真实浏览器使用本机Chrome，不安装浏览器。UI脚本分别测试桌面与窄屏触控上下文，检查列表、独立开关、原生输入、菜单键盘隔离；不是手机真机测试，不替代全部真实长路线或30分钟验收。Studio脚本使用600点合成PLY，经真实菜单/画布进行创建、编辑、撤销重做、保存、导出、冷重开和重新导入；调试事件仅读取快照。

Studio构建（原MF58工作树保持只读）：

```sh
cd ../supersplat-v2.32.5
node --test tests/studio-contract.test.mjs
STUDIO_BUILD=1 STUDIO_OUTPUT_DIR=/Volumes/Prism/Metaflow/.codex-work/tmp/mf97-studio-build node node_modules/rollup/dist/bin/rollup -c
```

原生路线回归在独立输出目录执行，避免覆盖历史结果。准备scene-exhibitions.json、apms-markers-42.mfstudio.json、sdi-25.settings.json的只读链接后，从该目录调用当前工作树脚本：

```sh
cd /Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/regression
node /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow/mf79-viewer-trial/node_modules/tsx/dist/cli.mjs /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow/mf79-viewer-trial/scripts/region-regression.ts apms-2026
node /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow/mf79-viewer-trial/node_modules/tsx/dist/cli.mjs /Users/shuangsu/.codex/worktrees/mf97-navigation/Metaflow/mf79-viewer-trial/scripts/replay.ts apms-2026 --region
```

SDI同样执行；`legacy-routes.ts`复跑旧七组，marker-2额外单列。固定20为SDI `[1,4,5,7,8,9,10,11,12,13,14,16,18,19,20,21,22,23,24,25]`，不得删失败或改变分母。

## 资产与边界

地图详见 `docs/gaussian-maps.md`，地面详见 `docs/ground-analysis.md`。只读导航清单在本地服务器合并已冻结map job的高斯哈希和矩阵，用于来源核验，不修改MF79缓存。缓存来源、缺块、地图和路线状态分别报告。

多层的路线surface span producer、底图目录与原生支持面的完整配准尚未完成；多层没有明确身份时不按Y范围伪造楼层连通。当前审查视图展示碰撞支持点与差异，尚无高斯侧剖面叠加。真实地面候选未接受，没有新碰撞/导航应用。完整多层试走、接受地面的原生验证和长期游览完成前，保持试用状态。

Open3D工具环境为本任务可恢复归档，恢复和SHA见 `docs/ground-analysis.md` 的“最后工具缓存归档”。当前地图/Viewer/Studio不依赖它运行；detector真实重跑前需恢复，不将缺环境的跳过当成实际执行。30分钟浏览器资源试验可用 `node scripts/browser-soak.mjs`，输出工作树 `.codex-work/cache/mf97-soak/`；本轮因系统盘空间停止，只有19次切换、约5分钟证据，不是30分钟通过。
