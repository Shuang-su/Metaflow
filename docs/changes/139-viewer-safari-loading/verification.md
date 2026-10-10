# MF-139 Safari 启动修复与加载信息发布核验

唯一计划与范围：[Issue #139](https://github.com/Shuang-su/Metaflow/issues/139)。当前阶段：5.21.10 已发布生产，已生产发布并完成回读与观察，含一次探针传输失败及成功追加复核。生产基线重新核验为 5.21.9，100 项资源，schema 1.2，Netlify `6ac8a216e683f6d6589d8376`；回退采用该已成功部署。

## 问题与实际变更

Safari 18.5 原生浏览器在 `/shenzhen/dayun` 请求错误的 `/shenzhen/index.js`，出现通用启动失败。入口使用 document.baseURI 构造绝对 URL；仅网络型模块错误重试 3 次（100/300/900 ms，独立查询 URL），资源索引沿用现有 fetchWithRetry（500/1000/2000 ms）。耗尽或不可重试错误明确呈现，支持手动重新加载。Director 原有恢复与 SDK 静态入口保持。

进度详情按实例观察资源计时与引擎事件，清理监听器和定时器。请求数、读取速率、耗时、重试及错误常显；没有有效字节时使用破折号。上方仅数字百分比，下方呈现不同加载阶段，包括 LOD 加载中。友好错误不展示原始路径或堆栈。九种语言；透明样式，无新增背景和边框。

## 已验证

| 层 | 结果 |
|---|---|
| Viewer | 160 单测通过；类型、lint、格式、生产构建、publint 通过 |
| Chromium/WebKit | 7 个加载/恢复用例通过：模块及索引耗尽后重载、瞬时故障恢复、大运 LOD、笔架山 LOD、390×844 缇宝 SOG+环境、Director 返回 Viewer；3 个百分比复查通过 |
| 原生 macOS Safari 18.5 | 7 用例通过：生产与旧实验 HTML 复现错误路径；修复加载；模块/索引瞬时 503 恢复；各 4 次耗尽后手动重新加载；加载后飞行相机按钮、设置面板操作通过 |
| 视觉与生命周期 | 数字标题及阶段行分离、透明无边框、移动画幅无溢出；加载完成隐藏、实例销毁清理 |

证据保留于项目 `.codex-work/online-diagnostic-20261010/`：fix-tests-final.log、fix-heading-build.log、fix-browser-summary.json、fix-heading-browser.log、safari-native-summary.json 及逐项截图/JSON。真实 Safari 证据与 Playwright WebKit 分开。

## 限制与失败记录

- 未做 iPhone/iPad 真机验收；本机受控故障注入不代表用户真实弱网已全面覆盖。
- settings 单次请求及响应体读取未全面新增重试；有限重试无法恢复持续离线或永久缺失。
- 原生 Safari 自动拖动没有产生相机位移，后续使用实际飞行按钮和设置操作验收；拖动交互通过 Chromium/WebKit 用例验证，不声称原生 Safari 拖动验收完成。
- 早期 Safari 探针把状态对象 error 误认协议错误，并把重试提示误认终态；修正为 W3C error 字符串与 role=alert 后重跑 7 用例。旧日志保留，未隐藏产品失败。

## 发布执行

产品 PR、最终产品 SHA、tag/build、完整候选部署、生产指针/字节/浏览器/分析回读和至少 15 分钟观察完成后追加。保持 100 项资源对象、schema、模型/settings/环境/体素/封面、Editor 和 Director 原值；复用已核验的大型静态文件，避免再次复制 14 GB。无管理员绕过、强推或本地主线重置。

- 产品 [PR #140](https://github.com/Shuang-su/Metaflow/pull/140)；版本候选再次运行 160 单测及构建/类型/lint/格式/publint、数据/平台/Markdown 校验通过。精确 HEAD 远端检查正在运行。

- 首轮远端 CI [38036181523](https://github.com/Shuang-su/Metaflow/actions/runs/38036181523) 在 Director bootstrap 旧文本断言失败：仍要求直接 `await import('./index.js')`。更新为新帮助函数，保留 Director 分支不静态导入 Viewer、Director 动态入口位于分支内、Viewer 仅在 else 初始化的断言；未删除测试或改变 Director 产品代码。重新跑 Director 44 项与精确 HEAD CI。
- 完整 staging 核验 10,255 个文件（5,453 个 LFS），注册数据/Editor 共 14,471,658,141 字节；LFS 按仓库 OID 和大小验证，小型文件从 release tree 物化。资源对象 100 项逐项与发布前相等。

- 本地首次 Director 测试缺少 esbuild，安装锁定依赖后剩余两项缺少 sparse settings；补齐仅 settings JSON 后 44 项通过。额外根 URL 文本断言变量拼写修正为帮助函数实际 baseUrl；相关旧日志保留。Netlify config clone 下误用相对 validator 路径失败，改用绝对路径重跑成功，不把该失败视为完整性通过。

- 精确 HEAD CI [38036576096](https://github.com/Shuang-su/Metaflow/actions/runs/38036576096) 全部所选检查通过。自动审查指出 SDK 默认 exposeGlobals=false 的计时起点晚于预取；将起点移至 resolveConfig 前并新增真实 SDK 双预取 E2E；再次验证最新 HEAD 后才合并。候选 6ac9f140f81ab29064093fef：Safari 18.5 三场景、Chromium 三场景及 WebKit 大运通过；15 文件字节和 513 route/reference HEAD 通过。候选 analytics 被既有来源白名单拒绝，正式域名再验收，不扩大白名单。
- npm audit --omit=dev 报告已有间接依赖告警：dompurify low、fflate moderate、source-map-js high，共 3 项，依赖树与 5.21.9 相同；本次兼容修复不升级依赖。单列审计失败，不称 audit 通过。

## 最终产品合并

[PR #140](https://github.com/Shuang-su/Metaflow/pull/140) 正常 squash 产品 SHA `92958b569259e9cf1918efe0c006071b4fef2458`；最新精确 HEAD [CI38037012781](https://github.com/Shuang-su/Metaflow/actions/runs/38037012781) 所选检查全通过，包含新增 SDK 桌面/手机双预取 E2E。来源 rc1/rc2/rc3 标签可达，两个审查线程已响应并解决。正式 release record 回填实际产品 SHA，当前生产仍是 5.21.9。

## 正式发布

- 产品 SHA `92958b569259e9cf1918efe0c006071b4fef2458`（PR140）；release-record SHA/tag/build `7188544bc8778784a1a568a28aa5d027da4fd285`（[PR141](https://github.com/Shuang-su/Metaflow/pull/141)，精确 HEAD [CI38037281801](https://github.com/Shuang-su/Metaflow/actions/runs/38037281801) 全通过，受检与合并 tree 相同）。
- 正式 tag `viewer-v5.21.10`；production-context 构建保留既有公开分析配置。所有 100 项资源对象与 5.21.9 相同，完整 staging 的 --check-files 验证通过，模型与 Editor/Director 使用已验证内容。
- 最终候选 `6ac9f5892bf0719ac8c32a8b`：15 文件字节与 513 route/reference HEAD、Chromium 三场景及 WebKit 大运通过；真实 macOS Safari 18.5 三场景加载及原生飞行按钮通过。Safari 探针起初在 loaded 后立即点击，读到 anim；等待 loading 隐藏、controls opacity=1 的就绪状态后，三场景通过，旧失败 JSON 保留，不归为已证明的产品回归。
- 于 2026-10-10T08:31:02.201Z 原样提升候选，重新读取 Netlify published_deploy.id 为 `6ac9f5892bf0719ac8c32a8b`，正式域名 build.json 的版本/产品/构建身份一致。deploy_source=cli、commit_ref=null、原 deploy context=deploy-preview；生产身份由实际 published pointer 与 tag/tree/字节回读证明，不将 context 标签当作生产指针。
- 使用用户授权的完整 CLI/API 发布路径；现有 Controlled release workflow 仍要求 legacy strict Completion Dossier，本常规兼容修复未复制该旧结构，也未宣称该旧 gate 已通过。
- 生产浏览器、分析、HTTP 回读及至少 15 分钟观察结果随后追加。回退候选仍 `6ac8a216e683f6d6589d8376`，截至当前未触发回退。

## 正式域名回读与观察

- Chromium 大运、笔架山、390×844 缇宝及 WebKit 大运加载/交互通过；15 文件逐字节/哈希与 513 路由引用 HEAD 通过。生产分析 3 批 HTTP 200，共 18 个唯一 event_id，服务端 accepted 18/rejected 0，page_viewed/first_frame_ready 各一次。
- 原生 Safari 18.5 三场景均完成加载，根入口正确。W3C click 有间歇未投递：捕获事件探针记录笔架山/缇宝失败时没有 click 事件，DOM click 可切换 fly；1280×900 大运/笔架山曾实际按钮通过。保留原生输入自动化限制，不以 DOM click 冒充真实按钮覆盖全部通过，也不再把该问题唯一归因于就绪时序。
- 2026-10-10T08:32:44.847Z 至08:47:44.848Z 共16轮/900.003秒；前15轮身份、脚本哈希、100索引、路由与持续浏览器状态通过，最后一轮探针 fetch 报 TypeError: fetch failed。持续浏览器未记录脚本或资源失败；不将本轮标作全部通过。补充回读随后追加，没有出现阻断性白屏、广泛加载失败或路由损坏，未触发回退。
- 新增用户反馈由 MF-142 另做 5.21.11：细化分块内读取百分比、缇宝压缩编码 4K WebP；5.21.10 tag/产物不改写。

- 追加复核 2026-10-10T08:50:16.213Z 至08:51:46.213Z、4轮90秒全部通过：正式版本/身份、脚本字节、100项索引、五条路线和实际持续浏览器状态。单次探针 fetch 故障未复现；记录为未定位的传输失败，不隐藏也不据此认定广泛产品故障。观察完成，未回退。
