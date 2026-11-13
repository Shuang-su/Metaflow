# 生产 Viewer 运行时源码恢复

状态：隔离恢复与可复现构建验证，未发布。日期：2026-11-14（北京时间）。

## 目的与边界

WebGL 对照已获得用户确认，兼容补丁需要保留实际线上 5.23.1 的背景与捕获行为。仓库 main 仍记录 5.22.0，原始 5.23.0/5.23.1 提交暂不可访问。本次从生产脚本明确引用的 source map 恢复浏览器运行时源码，不伪造原始 Git 历史，也不将恢复结果称作完整的 5.23.1 仓库或 SDK/Editor 发布。

本 PR 恢复 Viewer 运行时及构建所需的最小类型声明。已观察到的线上版本输入只用于隔离复现，不写回本 PR 的权威版本记录；模型、资源设置、Editor 和生产部署指针未改变。

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

原始锁文件、HTML 构建模板、离线导出入口以及 Editor 修改不由此 map 单独证明。隔离复现沿用当前仓库锁定依赖和模板，并临时使用从生产读取的 5.23.1 版本输入，依赖内容不变。生产 version-history 比仓库多两条发布和两条维护记录，既有 133 条 entries、74 条 maintenanceCommits 完整保留；data/index.json 的差异只有 release 字段，资源内容完全相同。因原始 Git 对象仍未找到，本 PR 不将这些缺少仓库历史见证的记录直接写回，也不削弱现有版本完整性测试。

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

PR #167 本身保留仓库原有 5.22.0 身份字段，属于未发布候选。上述逐字节一致结论属于使用实际生产输入的隔离恢复基线，不能套用为“PR 的所有构建产物与生产相同”。正式发布前仍须安排真实新发布版本及可追溯的记录，保留生产已有历史，并验证候选自动分流与解码保护；不得直接将当前 PR 整包覆盖生产。


候选移植后重新通过 30 项定向测试、TypeScript 和相关源码 ESLint。新增恢复源码的 Prettier 检查发现 captureTiming 对象排版，已做机械格式修正；扩展检查同时报告 site-html.mjs 原有启动函数格式，本轮未修改这些无关函数，按项目既有格式范围验证改动源码。完整 Viewer 构建通过，另有 3 项版本一致性定向检查通过；版本历史校验未修改。
