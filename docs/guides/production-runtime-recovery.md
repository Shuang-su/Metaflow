# 生产 Viewer 运行时源码恢复

状态：Viewer 5.23.2 正式发布准备；当前生产仍为 5.23.1，未切换。日期：2026-11-14（北京时间）。下方保留隔离恢复阶段的证据；新的版本与历史来源处理见文末。

## 目的与边界

WebGL 对照已获得用户确认，兼容补丁需要保留实际线上 5.23.1 的背景与捕获行为。仓库 main 仍记录 5.22.0，原始 5.23.0/5.23.1 提交暂不可访问。本次从生产脚本明确引用的 source map 恢复浏览器运行时源码，不伪造原始 Git 历史，也不将恢复结果称作完整的 5.23.1 仓库或 SDK/Editor 发布。

隔离恢复阶段只恢复 Viewer 运行时及构建所需的最小类型声明，观察到的线上版本输入先用于独立复现。随后用户明确要求推生产，本 PR 补充真实 5.23.2 记录与有界的旧记录来源导入；模型、资源设置与 Editor 不属于源码恢复范围。

## 已核对来源

- 仓库基线：`a76f2708232d9d6acba8a370ecbe7808a2a7052d`。
- [生产版本记录](https://metaflow.shuang-su.com/data/version-history.json)：5.23.1，记录原始提交 `3c95767645a506dbe311d3ecce59380c011fe780`；该提交未在当前可访问仓库或本地对象中找到。
- [生产脚本](https://metaflow.shuang-su.com/index.js)：SHA-256 `48441c86c649ae4f110effbdbed064fda8ab8d60736589b0934e4300a09a970a`。
- [脚本明确引用的 source map](https://metaflow.shuang-su.com/index.js.map)：9,498,460 bytes，SHA-256 `06aca005964364749daaa6b4681ec9628d2649b2b0c3a9e2ad13bd8c02455c59`；1,030 个 sources 与对应的完整 sourcesContent。
- 其中 89 个自有 src 文件，84 个与基线字节一致；引擎源码明确为 PlayCanvas 2.23.0 / `cfef43d`。

## 恢复范围

| 文件 | 来源与处理 |
|---|---|
| `src/background.ts` | 从 source map 原样恢复，新增共享颜色与渐变采样 |
| `src/background-renderer.ts` | 从 source map 原样恢复，新增 LUT 与背景合成 |
| `src/capture.ts` | 从 source map 原样恢复，保留截图背景合成回调 |
| `src/gsplat-reveal-radial.ts` | 从 source map 恢复，保留离线采样接口；PR 仅将 captureTiming 对象按仓库格式换行 |
| `src/viewer.ts` | 从 source map 原样恢复，保留背景管线接入 |
| `src/schemas/v2.ts` | source map 未包含此文件；仅根据已恢复的 BackgroundGradient 类型补充可选字段，不声称恢复原始文件 |

原始锁文件、HTML 构建模板、离线导出入口以及 Editor 修改不由此 map 单独证明。隔离复现沿用当前仓库锁定依赖和模板，并临时使用从生产读取的 5.23.1 版本输入，依赖内容不变。生产 version-history 比仓库多两条发布和两条维护记录，既有 133 条 entries、74 条 maintenanceCommits 完整保留；data/index.json 的差异只有 release 字段，资源内容完全相同。原始 Git 对象仍未找到；正式发布准备将这些记录按生产原文导入，并用独立来源契约表达“已经公开、原 Git 对象暂不可访问”，不伪造 Git 见证。

## 验证顺序

1. 在独立 worktree 恢复五份精确运行时源文件，保留来源摘要。
2. 只补充必要类型，运行类型检查与完整构建。
3. 将未应用兼容补丁的 `public/index.js` 与已取证生产脚本逐字节比较；若不一致，明确列出差异，不能称为精确重现。
4. 仅在运行时基线核对后叠加 PR #167 的环境选择与 WebGL 解码保护，再运行对应验证。

## 验证结果

未叠加兼容补丁的恢复基线通过 TypeScript 与完整构建。用生产 HTML 中已经公开的 analytics endpoint 作为构建输入后，下列三个文件与取证生产文件**逐字节完全一致**，没有删除、归一化或忽略任何差异：

| 构建文件 | 字节数 | SHA-256 |
|---|---:|---|
| `public/index.js` | 4,424,108 | `48441c86c649ae4f110effbdbed064fda8ab8d60736589b0934e4300a09a970a` |
| `public/index.css` | 38,572 | `547476e1a1f04e7b672e1817726e6eeb80578e49402d239d3f5c6b90151d03a6` |
| `public/index.html` | 29,831 | `6f3b08bbfbb4474066d741437f93365b6126775b6da5256906e0398a474fa2bb` |

首次构建仅有三个版本值不同（package version、current.displayVersion、current.gitRef），HTML 仅缺少部署环境中的公开 analytics endpoint；对齐这些实际输入后再次完整构建，得到上表结果。941 份第三方源码与 source map 逐字一致，UI/locale/分析配置的有效输出也由最终脚本字节一致性覆盖。

这证明本次涉及的托管 Viewer 运行时、样式与入口能够精确重现，解除“不能保留线上 Viewer 行为”的源码基线缺口。它不恢复原始 Git 提交，也不证明独立 SDK/settings 导出包、Editor 或完整部署目录已重现。将兼容补丁应用于此基线后仍需候选验证；用户已确认的旧线上 WebGL 入口反馈不等于新 guard 的像素验收。


## PR 与正式发布边界

PR #167 最初保留仓库原有 5.22.0 身份字段，随后根据用户生产指令补齐 5.23.2 正式版本。上述逐字节一致结论属于使用实际生产输入的隔离恢复基线，不能套用为“PR 的所有构建产物与生产相同”。交付采用生产完整快照上的窄覆盖，不将工作树整包覆盖生产。


候选移植后重新通过 30 项定向测试、TypeScript 和相关源码 ESLint。新增恢复源码的 Prettier 检查发现 captureTiming 对象排版，已做机械格式修正；扩展检查同时报告 site-html.mjs 原有启动函数格式，本轮未修改这些无关函数，按项目既有格式范围验证改动源码。完整 Viewer 构建通过，另有 3 项版本一致性定向检查通过。以上为候选阶段结果；正式发布新增的历史来源校验单独记录如下。

## 5.23.2 发布身份与历史来源

- 正式产品提交：`7cbe28cd2f552dcd850c7a5724365244d523bb65`，为 PR #167 的实际 squash 结果；合并前源码恢复来源为 `47a8d9a155492285a61875594360e503f9e99956`，兼容候选为 `eca0cb7d3fba8cec7f6101a5a0fd6eacf6f6792c`。仓库不允许普通合并提交，按既定流程在 squash 后回填尚未发布的 5.23.2 身份，普通 Git 检查和合并策略都未放宽。
- 原生产部署：[`6af6e65d93d318c79774c315`](https://app.netlify.com/projects/charming-salamander-fc1af0/deploys/6af6e65d93d318c79774c315)，不可变产物入口为 https://6af6e65d93d318c79774c315--charming-salamander-fc1af0.netlify.app 。它已保留 Editor 1.3.2 与 Horizon 路由，不能以仓库旧全量产物覆盖。
- 原 production history 有 135 条版本、76 条维护记录。5.23.2 完整保留该前缀，只追加正式版本及其发布支撑记录；未独立发布的候选工作归并到真实 squash 产品提交，原 SHA 仅作为 PR 过程证据保留。资源索引仅修改 release，100 项资源内容不变。
- [`metadata/production-history-recovery.json`](../../metadata/production-history-recovery.json) 固定原始生产 JSON 的 SHA-256、字节数、观察时间、部署 URL、四条导入记录与已有仓库基线。原始 JSON 和来源清单均提供 data 镜像。
- `scripts/production-history-provenance.mjs` 被 MCL 与版本测试共同使用：四条旧记录必须与固定快照完全一致；已有仓库历史仍要求 Git 见证，本次及未来发布继续要求真实提交与 trace。关闭来源字段、删改历史、扩大例外、使用错误恢复提交或回填日期均应失败。
- 记录原始 5.23.0／5.23.1 生产事实不等于恢复其 Git 对象。其原 trace 缺失不由当前 PR 冒名补写，统一以公开的恢复来源说明。

## 生产交付范围

发布以当前生产完整 SHA1 文件清单为基底，仅叠加已验证的 Viewer JS／source map／托管 HTML、必要版本数据、来源证据和 build 身份。样式若与生产一致则沿用原文件。所有未覆盖文件的路径与 SHA 原样保留，包括 Editor、Director、Horizon 配置、模型和 settings。

创建候选前与晋升前均回读生产指针；若它不再指向上述基底则停止并重新核对。候选应通过版本和历史镜像、入口策略、受影响场景资源、Editor／Director／Horizon 路由与覆盖清单检查，再晋升同一候选。最终 source/tag/deploy 身份与回读结果在实际完成后追加。当前自动分流与新解码保护尚未在目标 iPhone 上实测像素或性能，已有用户正常截图仅验证原生产显式 WebGL 路径。

## 发布准备验证与当前阻塞

2026-11-14 已完成最终记录的完整版本历史检查 **8/8**、历史来源及 trace 检查 **25/25**、MCL check-all、Viewer 5.23.2 release contract 与带正式 analytics endpoint 的完整 build。版本历史检查补齐真实 Git 历史、旧 release tags 和必要历史索引 blob 后通过，未跳过普通记录的 Git 检查。独立审查提出的来源链接整体删除、错误首发提交和日期绕过三项反例均已修复并重新验证。

合并前完整候选 `2ba782b688c529bec2639ae4169c56acc9d31a53` 已通过 66 项定向测试与完整构建；当时 `index.js` SHA-256 为 `a6476ba0e096f64d4527a8f2b0d7b3183bd11f66700afd4dff1f126a0497d971`，`index.html` 为 `b73c98dad2251d692907b72e7c0efd515e278e611562630196ec4dbbbb463dae`，CSS 与原生产完全一致。最终记录回填后应重新构建并以其实际打包 commit 为准；不能把候选构建成功称为上线。

发布 API 的完整文件清单请求返回 401。账号已有 Netlify CLI 授权记录，但本环境 CLI 未登录；尝试正常恢复 CLI 登录时，自动审批拒绝了会赋予跨团队创建／管理项目持久权限的 OAuth 授权。该拒绝未被绕过，未取得新凭据、未创建生产候选、未切换生产。用户已授权发布 MetaFlow，完成此工具授权仍需明确确认其额外权限范围。
