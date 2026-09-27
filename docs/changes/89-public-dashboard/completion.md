# MF-89 实施状态与验收记录

更新：2026-09-28，北京时间。**实现可审查，生产切换未完成。** 唯一契约见 [Spec](spec.md) 与 [Plan](plan.md)，操作说明见 [dashboard README](../../../analytics/dashboard/README.md)。

## 已实现

- 静态 React / Vite 中文看板，7 / 30 天、PV / UV / 成功率 / P95、趋势、公开资源搜索排序、设备 / 错误汇总及服务器 24 小时图表；手机布局已实测。
- Supabase 私有固定汇总函数、低权限 owner 与独立 reader、99 条公开 canonical route 白名单。4 个重复 resource ID 跨不同活动存在，按 ID + route 匹配，避免错误合并。原始埋点不迁移。
- Python 3.6 标准库快照、严格字段白名单与统计一致性校验、原子替换、最后有效结果、systemd 15 分钟 / 1 分钟任务。
- Caddy 公网静态允许列表，管理 / 登录 / 分享 / 未知 API 路径 404，写入方法 405；Metabase 仅 loopback 内部访问。旧配置脚本不再生成公网 Metabase 代理。
- 受限备份与隔离恢复工具、固定镜像的独立分析 Compose 模板、按需启停命令。首次停止检查真实 24 小时本机及外部成功记录，最终停止后检查 30 分钟；未运行这些生产操作。
- 独立 [metaflow-status 仓库](https://github.com/Shuang-su/metaflow-status)：Upptime 记录事故与恢复，轻量 Pages 页面单独呈现 HTTP 与数据新鲜度，监测过期 30 分钟显示未知；无通知渠道。新看板未上线时明确显示待上线。

## 物质性外部写入与读回

1. 创建 [Issue #89](https://github.com/Shuang-su/Metaflow/issues/89)，保护主 checkout 的 ahead 19 提交和未跟踪研究目录，在隔离 sparse clone 实施。
2. Supabase 生产迁移版本 `20260927191429`、`20260927191505`、`20260927191608` 已应用并读回。reader 仍为 NOLOGIN，无凭据配置；EXECUTE 固定函数为 true，读取原表、owner 成员身份、public schema CREATE 及 anon EXECUTE 均为 false。管理员仅获显式 SET ROLE 能力，非继承。
3. 固定函数真实快照截至 2026-09-28 03:16:10 北京时间：7 天 PV 167、UV 67、加载 167 / 成功 141、P95 51,761 ms；30 天 PV 346、UV 184、加载 346 / 成功 291、P95 86,688.5 ms。7 天独立原始事件查询逐项吻合。两份快照均通过严格公开字段与统计验证；本地预览使用该真实快照，没有虚构服务器采样。
4. 状态仓库初始提交 `69f1f2f`，首次 [监测与 Pages 部署](https://github.com/Shuang-su/metaflow-status/actions/runs/36344138816) 成功。主网站 GET 和接收接口 OPTIONS 200；OPTIONS 不写埋点。独立 [HTTPS 诊断](https://github.com/Shuang-su/metaflow-status/actions/runs/36344268226) 已完成。
5. 阿里云 DNS 添加 `status.metaflow` CNAME → `shuang-su.github.io`，TTL 10 分钟；控制台与权威 DNS、公共 DNS 已读回。GitHub Pages custom domain 已配置，DNS health 返回 valid / HTTPS eligible；截至 03:42 尚未签发匹配证书，未称 HTTPS 已可用，未绕过证书验证。
6. 云防火墙只读核验：4 条已启用规则为 TCP 22 / 80 / 443 和 ICMP，来源均为 0.0.0.0/0；无 3000 / 5432 / 8888 放行规则。没有修改防火墙。

## 验证与限制

- 4 项 Node 测试通过：PGlite 真 SQL、整个范围 UV、加权成功率、原始样本 P95、北京时间边界、同 ID 不同 route、无样本、越权拒绝和 UI 数据模型。
- 7 项 Python 测试通过：快照私密字段 / 非法数值拒绝、原子替换失败保护、实际采样计算、24 小时门槛拒绝与通过、真实 Caddy 路由和 8 并发共 48 次静态请求。生产端数据库调用计数验证仍待部署。
- Vite 生产构建成功，JS 约 235 KB（gzip 约 75 KB）、CSS 约 9 KB；npm audit 安装时 0 漏洞。Caddy 2.11.4 官方二进制已校验 SHA-512，配置验证通过。
- 桌面 1280 × 720、手机 390 × 844 检查；手机文档宽度等于视口，无整页横向溢出。近 30 天显示正确真实 KPI；搜索“小乔”保留两个不同活动资源；P95 排序通过。未获得服务器快照时显示“数据准备中”。无样本 / 过期 / 获取失败由模型测试覆盖。
- Python 编译、旧 shell 脚本语法、CI routing validate、diff whitespace 检查通过。仓库文档链接、secret / hygiene scan、75 项 Node 治理测试、9 项 Python 平台测试、registry / routing 和 platform validate 均通过。没有执行 Viewer / Editor 构建或 CodeQL。
- Supabase advisor 报告现有 `analytics.refresh_rollups` 与 `public.rls_auto_enable` SECURITY DEFINER 可执行性建议；本次没有更改既有函数。reader 无 analytics schema usage，未因此获得原始数据权限。

- 既有 `mcl check-all` / `validate-version-history` 失败：`metadata/version-history.json: trace.completionManifest is required`。相关脚本及两份 version history 与基线 `58e54096` 无差异，未为本次平台任务重写 Viewer 发布历史。首次全量治理测试因 sparse checkout 缺少 CONTRIBUTING / version history / references 而有 3 项失败；补全基线文件后 75 项全通过。

## 未完成、失败及下一步

- SSH control socket 不存在，当前阿里云 CLI OAuth 刷新失败；未执行服务器发布、升级、备份、恢复、账号 / API key / 订阅核查、事故持久化检查或 Metabase 停止。
- 外部 GitHub runner 可解析 DNS 并建立 TCP 443，TLS ClientHello 后被重置；HTTP 80 返回 403 / Beaver。Mac 的 HTTP 响应明确是阿里云 `Non-compliance ICP Filing` 拦截页。需要核对域名备案 / 接入状态，合法解除拦截后重新验证；不是通过关闭 TLS 验证解决。
- 服务器安全审查和离机恢复验证仍是发布前置条件。发现不明持久化则转干净实例，不在旧主机继续发布。
- reader LOGIN / 安全凭据、服务器定时器、Caddy 入口、真实服务器趋势、生产有限并发 / DB 调用计数和状态页新接口激活均未完成。
- 24 小时并行运行尚未开始；Metabase 未停止，30 分钟切换观察、真实内存释放量及按需 start / stop 实测没有结果。
- 初次 managed worktree 因完整资源 checkout 空间不足失败并由工具清理；改用 shared sparse clone，未删除用户资源。首次 SQL 迁移因所有权转移后的权限顺序失败，事务回滚经确认；调整授权顺序后完整重试成功。Caddy 校验文件为 SHA-512，纠正最初算法选择后才执行二进制。文档链接检查曾在本记录创建前报告目标不存在，补全后重跑。

## 回退与交接

新数据库对象为增量私有对象，reader 未启用 LOGIN；服务器现有服务尚未切换。后续网页 / JSON 回退只使用已验证版本，不能把过期数据重新标成当前；Metabase 回退必须保留配套数据库、密钥与安全版本，并始终走 SSH 隧道。事故旧容器 / 数据卷没有启动或删除。

代码 checkpoint：`767ef33d`，已推送 `codex/mf-89-public-dashboard`；[Draft PR #90](https://github.com/Shuang-su/Metaflow/pull/90) 保持开放。状态页格式同步提交 `3f54847` 后，GitHub Pages 部署曾因 OIDC 请求超时失败；仅重试失败 job 后 [run 36345416948](https://github.com/Shuang-su/metaflow-status/actions/runs/36345416948) 已成功，独立监测历史仍正常提交。

本记录不声明独立 review、生产发布或验收完成。后续恢复连接后沿用本 Spec / Plan 继续。
