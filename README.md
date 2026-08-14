# Metaflow

Metaflow 把基于 [SuperSplat](https://github.com/playcanvas/supersplat) 的 Editor、资源索引和定制 Viewer 组合成一条 3D Gaussian Splatting 编辑、发布与分享链路。

## 项目入口

| 入口 | 用途 |
|---|---|
| [中文文档总入口](docs/README.md) | 快速开始、操作指南、概念、参考与维护 |
| [Viewer 快速开始](docs/getting-started/viewer.md) | 本地运行 Viewer 与打开 route |
| [Editor 快速开始](docs/getting-started/editor.md) | 本地运行当前 Editor 源码 |
| [Editor 到 Viewer](docs/guides/editor-to-viewer.md) | 导出模型/settings 并进入稳定路由 |
| [资源索引参考](docs/reference/resource-index.md) | `data/index.json` schema 与生成规则 |
| [兼容边界与版本事实源](docs/reference/compatibility-and-version-sources.md) | Viewer、Editor、index、上游与发布事实从哪里读取 |
| [版本与发布](docs/maintenance/versioning-and-release.md) | SemVer、Version History 与 Ledger 的更新边界 |
| [部署](docs/maintenance/deployment.md) | Viewer、data 与 Editor 镜像怎样进入 Netlify publish 目录 |
| [仓库地图](docs/reference/repository-map.md) | 活跃源码、生成物与历史快照边界 |

## 当前发布恢复基线

| 产品 | 当前版本 | 上游基线 | 唯一事实来源 |
|---|---|---|---|
| Viewer | `5.19.1` / package `5.19.1` | SuperSplat Viewer `1.29.1` / PlayCanvas `2.21.3` | [`metadata/version-history.json`](metadata/version-history.json) |
| Editor | `1.1` / app `1.1.0` | SuperSplat Editor `2.28.0` | [`metadata/editor-version-history.json`](metadata/editor-version-history.json) |
| 资源索引 | schema `1.2` | 不适用 | [`data/index.json`](data/index.json) |

Viewer 源码在 `metaflow-viewer/`；Editor 源码在 `supersplat-v2.28.0/`，`metaflow-editor/` 是发布构建。MF-30 的 v1.29.1 运行时产品 SHA 为 `26e311c`，发布控制 SHA 为 `534b013`。`viewer-v5.19.0` 的 prepare 在部署前失败且生产从未切换；`viewer-v5.19.1` 已通过 D2 Prepare、精确 D2 CLI/API 生产发布、真实浏览器 smoke 与 15 分钟观察，当前生产稳定版为 `5.19.1`。贡献与变更流程见 [`CONTRIBUTING.md`](CONTRIBUTING.md) 和 [MCL v1.0 candidate](docs/metaflow-change-lifecycle-v1.0.md)。

下方保留原有 Viewer 快速参考，方便已有读者继续使用；新的分层手册和当前契约以 [`docs/README.md`](docs/README.md) 为入口。

## 快速开始

```bash
# 进入 Viewer 包
cd metaflow-viewer

# 安装依赖
npm ci

# 首次需要读取仓库 data/ 时建立本地链接（public/data 不存在时执行）
mkdir -p public
ln -s ../../data public/data

# 构建项目
npm run build

# 用 SPA fallback 启动服务器，稳定 route 才不会直接 404
npx --no-install serve -s public -l 3000
```

服务器将在 http://localhost:3000 启动。

## 开发模式

稳定 route 的开发模式使用两个终端：

```bash
# 终端 1：自动重新构建
npm run watch

# 终端 2：为未知路径提供 index.html fallback
npx --no-install serve -s public -l 3000
```

当前 `npm run develop` 内部使用不带 `-s` 的 `serve public`，适合根路径或直接 query 调试，不能单独验证 `/acg/...` 之类的深层 route。完整说明见 [Viewer 快速开始](docs/getting-started/viewer.md)。

## 使用方式

### 1. URL 路由（推荐）

直接访问路由路径即可加载对应资源：

```
http://localhost:3000/acg/ad05/delta-force
http://localhost:3000/acg/ad05/frieren
http://localhost:3000/acg/yzx/yzx
```

路由信息来自 `/data/index.json`。本地服务器必须提供 SPA fallback；否则资源即使存在，直接打开深层路径也会先得到静态服务器 404。

### 2. URL 参数

也可以使用 URL 参数指定内容：

```
http://localhost:3000/?content=/data/path/to/model.sog&settings=/data/path/to/settings.json
```

支持的参数：
| 参数 | 说明 |
|------|------|
| `content` | 模型文件路径 (.sog / .compressed.ply) |
| `settings` | 设置文件路径 (.json) |
| `poster` | 加载时显示的图片 |
| `skybox` | 天空盒图片 |
| `noui` | 隐藏 UI |
| `noanim` | 禁用动画 |

## 项目结构

```
metaflow-viewer/
├── src/                    # 源代码
│   ├── index.html          # HTML 模板（含路由配置）
│   ├── index.scss          # 样式
│   ├── index.ts            # 入口
│   └── ...                 # 其他模块
├── public/                 # 构建产物
│   ├── index.html
│   ├── index.css
│   ├── index.js            # 打包后的 JS (含 PlayCanvas 引擎)
│   ├── data -> ../../data  # 本地开发链接；部署时由 Netlify 同步副本
│   └── serve.json          # 服务器配置（SPA 路由）
├── package.json
├── rollup.config.mjs
└── tsconfig.json
```

## 数据目录

`/data/index.json` 包含所有资源的索引信息：

```json
{
  "resources": [
    {
      "id": "delta-force",
      "title": "三角洲",
      "route": "/acg/ad05/delta-force",
      "files": {
        "model": "ACG/AD05/.../Delta Force.sog",
        "settings": "ACG/AD05/.../settings.json"
      }
    }
  ]
}
```

## 部署

`npm run build` 生成 Viewer 文件；完整平台发布还要把仓库根 `data/` 和 `metaflow-editor/` 同步到 `public/data/`、`public/editor/`。当前 Netlify 命令已执行这一步，手工部署时也不能漏掉。Editor 源码的 `dist/` 不会被 Netlify 自动采用；完整 staging 和发布步骤见 [部署](docs/maintenance/deployment.md)。

**注意**：需要配置服务器支持 SPA 路由（将所有路径重定向到 index.html，除了 /data/ 等静态资源）。

Nginx 配置示例：

```nginx
location / {
    try_files $uri $uri/ /index.html;
}
```

## 当前版本

| 字段 | 值 |
|------|----|
| 展示版本 | `5.19.1`（生产稳定） |
| 包版本 | `5.19.1` |
| 索引 schema | `1.2` |
| 上游 SuperSplat Viewer | `v1.29.1` |
| PlayCanvas | `2.21.3` |
| 运行时产品实现 commit | `26e311c` |
| 发布控制修复 commit | `534b013` |

## 当前 Editor

| 字段 | 值 |
|------|----|
| Metaflow Editor | `1.1` |
| 上游 SuperSplat Editor | `v2.28.0` |
| 当前源码目录 | [`supersplat-v2.28.0`](supersplat-v2.28.0) |
| 历史基线源码目录 | [`references/supersplat-v2.18.1`](references/supersplat-v2.18.1)；其 `v2.18.1` 仅表示 lineage，内容身份见 [`metadata/reference-snapshots.json`](metadata/reference-snapshots.json) |
| `/editor` 运行时版本 | [`metaflow-editor/version.json`](metaflow-editor/version.json) |
| 版本历史 | [`metadata/editor-version-history.json`](metadata/editor-version-history.json) |
| 三方审查快照登记 | [`metadata/reference-snapshots.json`](metadata/reference-snapshots.json)：Viewer `v1.26.2/v1.29.1`、Editor `v2.28.0/v2.32.3`、Transform CLI `v2.5.1/v3.3.0`；执行中发布的前一候选 `v1.28.0/v1.29.0/v3.2.0` 仍作为不可变中间快照保留 |
| 三方审查结论 | [`docs/history/upstream-reviews/2026-08-10/`](docs/history/upstream-reviews/2026-08-10/README.md)：Viewer Adopt、Editor Defer、Transform CLI Adopt（离线工具）；均未在本轮发布 |

## 最近版本

| 版本 | commit | 摘要 |
|------|--------|------|
| `5.19.1` | `534b013` | MF-30 正式生产发布：修复 release/CI sparse fixture 与 build-before-test 顺序；D2 controlled Prepare 通过后，因 Netlify Git build 再次停滞，经明确授权使用精确 D2 CLI/API 发布 deploy `6a7efc396f36c800cfa0702e`；真实浏览器 smoke、15 分钟观察与 GitHub Release 均完成 |
| `5.19.0` | `26e311c` | MF-30 同步 Viewer v1.29.1 / PlayCanvas 2.21.3 并保留 Metaflow 合同；不可变 Tag 已建立，但 workflow run `31779246997` 在 prepare 的 sparse/order 校验阶段失败，production job 未执行、没有 GitHub Release，生产从未切换到 5.19.0 |
| `5.18.1` | `578272c` | 发布 BitCity 260711 与第十五届深圳动漫节 27 条人物资源及默认 figure8 动画策略 |
| `5.18a` | `c613a87` | 新增并对齐深圳笔架山动态 voxel 场景 |
| `5.18` | `7ce294a` | 优化移动端触控游戏控制 |
| `5.17` | `f371f48` | 对照支付宝式数据面板补齐全局筛选、指标口径、D30 留存、访问时长/时段画像、可信机型明细、机型质量排行和转化目标 |
| `5.16` | `e68d52b` | 新增 Metabase 看板汇总层：今日小时对比、留存 cohort、来源分析、保守机型统计和双语看板卡片 |
| `5.15` | `46b4ec2` | 为 SZTU 全部资源补齐中文域名短链 alias，包括 `/top10-26` 和 `/fes/top10-26` |
| `5.14` | `7c52315` | 修复 深圳技术大学.com 根域跳转到 `/sztu/c2-lib`，并恢复 `/c2-lib` 短链 alias |
| `5.13` | `4031c46` | 新增 `/dashboard` 和 `/dashboard/*` 到 Metabase 仪表盘子域的重定向 |
| `5.12` | `de75ce5` | 修复 analytics sendBeacon 跨域 credentials 上报失败，并关闭缺失 CSS sourcemap 引用 |
| `5.11` | `b06b13c` | 补充 UA/Client Hints、来源归因、Web Vitals、Resource Timing、聚合交互深度和设备/性能/用户/数据质量建模 |
| `5.10` | `8b37760` | 新增 Supabase 权威埋点链路、15 秒可见心跳、Metabase 建模表、可选 PostHog 精简镜像和多人同屏分析事件预留 |
| `5.9` | `1d9ab2b` | 调慢 SOG/流式 reveal、uRevealActive 藏点、流式主体提前高 LOD、环境不阻塞首帧、c2-lib 首次退出动画进 Orbit |
| `5.8` | `4e848ac` | 按场景分档 reveal 点大小，修复流式 LOD 双波揭示，恢复 loading 后可见再播放 |
| `5.7` | `4114e8f` | 简化 reveal 振荡：去掉 lift 波前隆起，保留 sin 抖动，delay 缩至 1.0s |
| `5.5` | `f4c4621` | 新增全站高斯点 reveal 粒子揭示效果，支持环境模型并提供 `?noreveal` 逃生参数 |
| `5.3a` | `74c04c0` | 更新 Cyrene 初始构图和缩略图 |
| `5.3` | `7672825` | 修复 Netlify 发布目录的数据同步方式 |
| `5.2` | `99ffe6c` | 路由索引改为强制重新验证，避免旧缓存导致黑屏 |
| `5.1` | `6558254` | 恢复旧 SOG 排序完成或超时后的首帧兜底 |
| `5.0` | `f41f6de` | 同步 SuperSplat v1.26.2 架构并移植 Metaflow 定制 |
| `4.4` | `e47067b` | 发布 Dayun tiled voxel 与版本历史基础设施 |
| `4.3` | `8bc11d5` | 补充 Firefly 设置与包管理声明 |

完整审计资料：

- [逐提交详细变更总账](docs/metaflow-viewer-change-ledger.md)
- [结构化版本历史](metadata/version-history.json)
- [Editor 结构化版本历史](metadata/editor-version-history.json)
- [Editor 变更总账](docs/metaflow-editor-change-ledger.md)
- [当前同步差异审计](docs/metaflow-current-sync-diff-audit.md)
- [SuperSplat 同步对比](docs/metaflow-viewer-sync-comparison.md)

`5.18a / 5.18.0` 是最后一个双轨历史版本，`5.18.1` 是此后的首个完整 SemVer 发布。`5.19.0` 是已合并但在部署前失败的 MINOR 发布尝试；`5.19.1` 是不改变 Viewer 运行时能力的 PATCH 发布恢复。旧字母版本保持原样，后续统一使用 SemVer PATCH/MINOR/MAJOR。

## URL 查询参数详解

查询参数可以追加在资源路由或根路径之后。第一个参数使用 `?`，后续参数使用 `&`：

```text
http://localhost:3000/acg/fireflyfes38/cyrene?debug&ministats
http://localhost:3000/?content=/data/model.sog&settings=/data/settings.json
```

包含空格或中文的路径应进行 URL 编码。当前覆盖规则不是统一的“query 优先”：存在 `content` 时会完全跳过 route/index；route 命中后会覆盖 query 中的 `settings`；`poster`、`environment`、`collision`、`voxel` 和 `voxelManifest` 则保留显式 query 值。完整矩阵和当前实现来源见 [Viewer URL 参数参考](docs/reference/viewer-url-parameters.md)。

### 资源参数

| 参数 | 值 | 说明 |
|------|----|------|
| `content` | URL | 主模型地址，支持 SOG、压缩 PLY 或流式 LOD JSON |
| `settings` | URL | Viewer 设置文件地址，支持 JSON 和现有 JSONC 兼容语法 |
| `poster` | URL | 加载阶段显示的封面图片 |
| `skybox` | URL | 环境天空盒图片 |
| `environment` | URL | 独立环境 Gaussian Splat 模型 |
| `collision` | URL | 碰撞资源地址；GLB 作为网格碰撞，voxel JSON 作为体素碰撞 |
| `voxel` | URL | 单体 `walk.voxel.json` 地址；首帧后在后台加载对应 BIN |
| `voxelManifest` | URL | tiled voxel 清单地址；分块按照用户位置按需加载 |

### 界面与动画参数

| 参数 | 说明 |
|------|------|
| `noui` | 隐藏 Viewer UI，适合嵌入或纯画面输出 |
| `noanim` | 禁止默认动画自动播放；不会启动 figure8，也不会消耗首次动画退出策略 |

### 渲染参数

| 参数 | 值 | 说明 |
|------|----|------|
| `webgl` | 无 | 强制使用 WebGL；未设置时优先尝试 WebGPU |
| `aa` | 无 | 启用 Gaussian Splat 抗锯齿 |
| `nofx` | 无 | 禁用 CameraFrame 后处理 |
| `noreveal` | 无 | 禁用高斯点首帧粒子揭示效果；不影响普通 loading UI |
| `hpr` | `1`、`true`、`enable` 或空值 | 强制启用高精度渲染；其他显式值表示禁用 |
| `budget` | 数字 | 覆盖 splat budget，单位为百万，例如 `budget=3` |
| `fullload` | 无 | 等待完整 LOD 质量，适合截图或离线验收 |
| `colorize` | 无 | 使用颜色显示 LOD 层级 |
| `unified` | 无 | 保留的统一渲染兼容参数；当前加载器默认使用 unified 语义 |

### 调试参数

| 参数 | 说明 |
|------|------|
| `debug` | 自动打开相机调试面板，可查看/编辑位置与焦点并截图；也可按 `Ctrl+Shift+D`，macOS 可按 `Cmd+Shift+D` |
| `ministats` | 显示实时性能仪表盘，包括帧率、显存和 splat 数量 |
| `heatmap` | 将可用的碰撞调试叠层初始化为热力图模式 |

Viewer 会忽略未识别的查询参数。例如 `cb=时间戳` 可以用于生成不同 URL 或辅助缓存排查，但不会改变 Viewer 行为。
