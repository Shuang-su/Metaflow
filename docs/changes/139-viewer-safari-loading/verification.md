# MF-139 Safari 启动修复与加载信息发布核验

唯一计划与范围：[Issue #139](https://github.com/Shuang-su/Metaflow/issues/139)。当前阶段：本地实现完成，5.21.10 候选待 PR 与部署。生产基线重新核验为 5.21.9，100 项资源，schema 1.2，Netlify `6ac8a216e683f6d6589d8376`；回退采用该已成功部署。

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
