# MF-79 原版 Viewer 导览本地试用

状态：**试用，整体验收未完成**。当前进展、失败及证据边界见 [report.md](docs/report.md)，来源见 [provenance.md](docs/provenance.md)。唯一有效计划仍在 [Plan](../jev-guide-lab/docs/plan.md)，不维护第二份实施计划。

## 运行条件

在本目录执行命令。此 checkout 为 `/Users/shuangsu/.codex/worktrees/mf79-viewer-guidance/Metaflow`。试用读取 `/Volumes/Prism_初号機/3D高斯` 原资产，导航缓存写入 `/Volumes/Prism/Metaflow/.codex-work/cache/mf79-native-viewer-v1`。资产卷需要挂载，原体素和高斯不会被修改。

本地依赖复用已有安装：trial 的 node_modules 指向 MF-79 旧实验依赖，Viewer 的 node_modules 指向主仓依赖。固定版本为 recast-navigation 0.43.0、tsx 4.23.15、Vite 7.3.6、PlayCanvas 2.22.4。package.json 固定实验直接依赖；当前没有独立 lockfile 或自动 setup 脚本，尚不宣称可脱离本机资产一键安装。

```sh
npm test
node_modules/.bin/tsx scripts/generate.ts apms-2026 sdi-2026
npm run dev
```

生成器串行执行、保留完成瓦片以便恢复；只在源、控制器、身体配置、生成参数匹配时复用。资源异常不会缩小场景或删除目标。完整缓存已有时无需重复生成。

入口：`http://127.0.0.1:5184/?scene=apms-2026` 或 `?scene=sdi-2026`。设置中开启导览模式，选择标点。使用原版 Viewer 键鼠/点击地面移动和手动观察。导览不注入行走、转向或光点动画。到达半径默认为 2 米，可选 3 米。

## 定向复跑

```sh
# 用户 35 号截图的原路线及原生位置、前进/后退/侧移/观察
node_modules/.bin/tsx scripts/side-step.ts
node_modules/.bin/tsx scripts/topology-regression.ts
node_modules/.bin/tsx scripts/captured-query.ts apms-2026 42 -1.9450585538746286 1.276 -25.380537780929927

# 全部标点从冻结入口的候选 + 完整路线 + 原版控制器验证
node_modules/.bin/tsx scripts/audit.ts apms-2026
node_modules/.bin/tsx scripts/audit.ts sdi-2026
node_modules/.bin/tsx scripts/audit.ts apms-2026 --radius=3
node_modules/.bin/tsx scripts/audit.ts sdi-2026 --radius=3

# 固定原生输入录像，30/60/120 Hz 与抖动渲染分组
node_modules/.bin/tsx scripts/replay.ts apms-2026
node_modules/.bin/tsx scripts/replay.ts sdi-2026

# 行走过程中每 6 个物理 tick 维护路线；原始行走路径独立于维护结果
node_modules/.bin/tsx scripts/maintenance.ts apms-2026
node_modules/.bin/tsx scripts/maintenance.ts sdi-2026
node_modules/.bin/tsx scripts/maintenance.ts apms-2026 31 38 41
node_modules/.bin/tsx scripts/legacy-routes.ts

# 性能串行运行，不同时截图或执行其他实景回放
node_modules/.bin/tsx scripts/benchmark.ts apms-2026 35
node_modules/.bin/tsx scripts/benchmark.ts sdi-2026 25
```

脚本写入 docs 下对应 JSON。带标点参数的定向输出使用 `-selected` 后缀，与完整分母文件分开。性能冷启动是新 Node 进程、保留操作系统文件缓存，不含高斯加载、Worker 通信或浏览器帧时间。

## Viewer 检查

本机可选原生构建绑定放在项目缓存。以下命令从 checkout 根目录执行：

```sh
NODE_PATH=/Volumes/Prism/Metaflow/.codex-work/cache/mf79-build-native/node_modules MCL_SMALL_FIXTURES=1 node --test metaflow-viewer/tests/*.mjs
cd metaflow-viewer
node_modules/.bin/tsc --noEmit
NODE_PATH=/Volumes/Prism/Metaflow/.codex-work/cache/mf79-build-native/node_modules node_modules/.bin/eslint src/navigation src/index.ts src/options.ts src/preferences.ts src/types.ts src/ui/annotation-controls.ts src/viewer.ts
NODE_PATH=/Volumes/Prism/Metaflow/.codex-work/cache/mf79-build-native/node_modules npm run build
```

全套 Viewer 检查中的版本历史 guard 在此未发布分支失败，见报告；不通过修改 guard 或虚构发布记录使其转绿。`MCL_SMALL_FIXTURES=1` 跳过未物化的大型 LFS 场景校验。

## 浏览器证据

使用当前 in-app browser 实际键鼠与选择控件测试，保留原生物理状态及路线事件。`window.mf79` 是本地试用诊断接口。Vite 的 `/__mf79_evidence` 仅接受同源 localhost 图片、固定写入项目缓存，5 MiB/张且检查磁盘保留空间；不发送到第三方、不接受任意文件路径。此接口不属于生产 Viewer。

HMR 关闭以保护行走状态。重新选择目的地会加载最新 Worker；Viewer UI 的源变更需下次刷新后生效。不要为更新显示而把用户瞬移回入口。当前页面为 WebGPU、本地高斯预算 1；不能据此宣称 WebGL、窄屏、受限 CPU 或真机已验收。
