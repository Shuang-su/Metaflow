# MF-89 实施状态与验收记录

更新：2026-09-28，北京时间。**境外公开看板和业务 API 已发布；服务器接入及 Metabase 按需切换尚未验收。** 唯一契约见 [Spec](spec.md) 与 [Plan](plan.md)，操作说明见 [dashboard README](../../../analytics/dashboard/README.md)。

## 当前架构与生产写入

用户确认未备案并明确选择将公开看板和 API 托管到中国内地以外；深圳 Caddy 公网托管方案已被取代。

- [公开看板](https://dashboard.metaflow.shuang-su.com)：独立 Netlify 项目 `mf89-shuangsu`，site ID `1679bf5c-c8df-46cd-a0aa-15c8b2701134`，Functions 实际区域 `us-east-2`。静态页面、只读 Blobs API、15 分钟 Scheduled Function 均已部署。当前有效 deploy `6ab9894e5b1b2d44407fd3a5`。
- DNS `dashboard.metaflow` 已由深圳 A 记录改为 `mf89-shuangsu.netlify.app` CNAME，TTL 10 分钟；控制台、公共 DNS、独立 GitHub runner 和浏览器已读回。Netlify 自定义域名证书及完整 TLS 验证通过。
- [独立状态页](https://status.metaflow.shuang-su.com)：GitHub Pages 自定义域名证书已签发、强制 HTTPS 已开启，CNAME 指向 `shuang-su.github.io`。页面、历史和 Upptime 均独立于应用服务器。业务入口已激活，服务器 API 尚未激活，明确显示准备中。
- Supabase 原始数据仍在东京项目。迁移 `20260927191429`、`20260927191505`、`20260927191608`、`20260927202908` 已应用并读回。私有固定汇总函数和 99 条 canonical route 白名单已上线，4 个重复资源 ID 用 ID + route 区分。
- `metaflow_dashboard_reader` 为 LOGIN、连接上限 2、默认只读，只能执行固定汇总函数；无原始事件读取权限、owner 成员身份或 anon 函数入口。业务密码仅在独立 Netlify 项目的 production 私有环境配置。深圳不持有新业务 reader 凭据。
- `MF89_ANALYTICS_DATABASE_URL` 受 legacy Free 平台限制：自定义 scopes 被 403 拒绝、secret 标记因默认 post_processing scope 被 422 拒绝；最终使用普通私有环境变量和默认 scopes。项目管理员、构建环境及同站 Functions 可取得该值，不声称平台级逐函数秘密隔离。前端构建不读取变量，公开 handler 不导入 SQL 客户端，dist / Functions 包中没有连接字符串。未升级套餐或购买服务，实际资源仍计入共享 Free 额度。
- Supabase TLS 使用官方 Root 2021 CA，显式验证主机名和证书链。CA SHA-256 为 `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`，2031-04-26 到期。

## 业务与浏览器验证

- 真实 7 天数据：PV 167、UV 67、有效加载 167、成功 141、P95 51,761 ms；30 天：PV 346、UV 184、有效加载 346、成功 291、P95 86,688.5 ms。7 天独立原始事件查询一致；整个范围去重、加权分子分母和样本 P95 已通过合成 SQL 测试。
- 北京时间 04:55 人工触发及 **05:00:50、05:15、05:30 自动调度刷新**均生成有效真实快照。7 / 30 天整体 CAS 原子写入，读请求不执行 SQL。刷新失败保留原时间戳和上一有效数据。
- 生产 8 并发、共 48 个只读请求全部 200。前后 `pg_stat_statements` 的两个固定汇总调用计数保持 1 / 2 不变，证明这批公网读取没有触发业务查询。
- 自定义域名及 Netlify 默认域名均验证；本机 CLI 的代理 / fake DNS 路径曾返回旧 Metabase 或 TLS reset，浏览器、自定义域名独立 GitHub runner 与指定 Netlify IP 的完整证书验证正常。未关闭证书验证，也不声称每个网络都已测试。
- 页面 7 / 30 天、搜索“小乔”的两个不同活动、P95 排序、零值 / 无样本 / 获取失败 / 过期状态通过。桌面 1280×720、手机 390×844 无整页横向溢出，无前端 console error。服务器接口未上线时真实显示准备中。
- 公开接口 POST 405、HEAD 200 空体；未知 API / login 404；调度函数公网 POST 403。签名上传在未配置 secret 时为 503，不接受未授权数据。
- 独立业务激活 [run 36349854096](https://github.com/Shuang-su/metaflow-status/actions/runs/36349854096) 验证主站、看板、7 / 30 天 API 和无埋点 OPTIONS 均成功；后续 [run 36350013732](https://github.com/Shuang-su/metaflow-status/actions/runs/36350013732) 和 [run 36351811909](https://github.com/Shuang-su/metaflow-status/actions/runs/36351811909) 监测与 Pages 均成功。`*/5` 已配置，但此记录时尚未观察到 schedule 类型运行；GitHub 调度延迟由 30 分钟未知状态保护，不能把手动运行称为自动定时验收。

## 服务器维护与事故核对

- SSH 共享连接已恢复。维护前可用内存 299 MiB，Swap 已用 228 MiB；系统盘约 12 / 40 GiB。没有删除历史数据或事故目录。
- 05:01 完成 app DB、配置、运行环境和加密密钥的受限备份；Mac `~/.ssh/metaflow-backups/` 为离机存放，0700 目录 / 0600 文件。六个文件逐一 SHA-256 校验。隔离、无网络临时 PostgreSQL 从完整 dump 恢复成功，核对 118 张卡片、3 个看板、2 个账号和 2 个数据源；只移除新建恢复容器，保留恢复数据作为证据。
- 活跃管理员 1、活跃用户 1；维护登录尝试前 sessions 0、API keys 0、订阅 / 告警 pulses 0、channels 0、remote sync tasks 0、公开卡片 / 看板 0。既有 inactive 账号保留，没有新增管理员。
- 当前数据库无 event trigger / foreign server / large object，47 个非内置函数全部属于标准 citext 扩展；app role 无 superuser 或额外高权限成员身份。
- 历史事故记录有 app DB 密码、维护密码、管理员密码更新、会话与 API key 撤销和 08-14 encryption key rotation 完成记录。凭据核验发现仍需整改的项目；现存管理员登录验证未通过。详细证据仅保存于受限服务器记录及本地备份，不进入公开状态页。依赖范围已向用户确认，未直接轮换可能影响其他连接的凭据，也未重置用户密码或创建新管理员。
- 宿主当前账号 / cron / systemd / profile / rc.local / 监听与二进制包验证已核对，未发现无法解释的持久化。RPM 差异仅在 SSH、sudoers、sysctl 配置；root 密码 SSH 与 Aliyun admin / assist sudo 配置、云网络调优能对应当前部署。此为有界核对，不声称完整取证或绝对无入侵。
- Caddy 备份、真实 validate 后原位写入并 reload：当前只监听 `127.0.0.1:8080`，Metabase `127.0.0.1:3000`，无公网 80 / 443 监听。宝塔 8888 在宿主监听，但云防火墙未放行；数据库无公网端口。云防火墙现有 22 / 80 / 443 / ICMP 规则，未成功修改规则；80 / 443 已无服务监听，不以 UI 点击视作规则修改成功。
- Metabase 已从 v0.62.9 升级为固定 digest 的 v0.62.19：`sha256:fe1f3c82a102cfc168359ff777e9b96ba7d0fa84bcb044d3b5ba6d3019033a6e`。维护后 `/api/health` 已返回 ok，加密功能启用。原 DB 和 external volume 保留；事故旧容器未启动。
- 安全包维护中 05:10:48 出现一次宿主 OOM，旧 Java 进程被终止、自动重启一次。此发生在观察期开始前，不能省略。补丁版本 JVM heap 调整为 512 MiB，不能等同进程总 RSS；当前健康正常，后续仍需观察。公开境外站点未受此次主机事件影响。
- `dnf upgrade-minimal --security` 成功完成，安装 10 个包、升级 105 个包。剩余 7 项安全通告均涉及运行中的旧内核；新内核 5.10.134-19.8 已安装并通过 grubby 选为默认，正在运行的仍是 19.1。SSH 配置验证、Docker / sshd active 与两个容器健康检查通过。新内核需要重启，已询问用户重启时机。生命周期脚本增加 `os_security_updates_verified` 门槛，未生效的内核补丁不能解锁停用。

## 代码验证与已知限制

8 项 Node 看板测试通过；11 项 Python 测试（包括新增系统补丁门槛）全部通过。TypeScript / Vite 构建、npm audit 0、真实 Caddy 2.11.4 适配、字段 / 签名 / 原子失败 / 24 小时门槛均已覆盖。仓库文档链接、secret / hygiene、75 项 Node 治理测试、9 项 Python 平台测试、registry / routing、platform validate 和 diff 检查通过。宿主实际 Python 3.6 编译、真实采样与 systemd unit 验证通过。

未运行 Viewer / Editor 构建或 CodeQL。既有 `mcl check-all` / `validate-version-history` 报 `metadata/version-history.json: trace.completionManifest is required`；相关文件与基线 `58e54096` 一致，未重写既有发布历史。Supabase advisor 中既有 `analytics.refresh_rollups` 与 `public.rls_auto_enable` 建议未在本任务改写。

准备阶段曾出现 managed worktree 空间不足、SQL 初次事务授权顺序错误、GitHub Pages OIDC 超时及证书等待；均已分项恢复。首次 Netlify no-build symlink 打包漏依赖，不能回退到该 deploy；后续配置缺失 / 数据库 CA 链失败已解决并有真实调度结果。Netlify env MCP 的成功提示没有对应实际值，最终通过 SDK 配置和读回校验。状态仓库曾由 Upptime 自动提交 pycache，已移除生成文件并添加 ignore / PYTHONDONTWRITEBYTECODE。

## 未完成与回退

服务器采样代码、受限 secret、独立分析 profile 已准备并校验；timer 保持 disabled，未上传生产采样。安全记录中的凭据 / 系统补丁两项为 false，禁止伪造完成标记。补丁后的第二份完整备份也已离机并隔离恢复验证，数量仍为 118 / 3 / 2 / 2。生产凭据扫描再次通过（8 个产物文件并展开 Functions ZIP），没有 DB URL 或上传 secret。桌面 heartbeat `mf-89` 已配置为每 15 分钟跟进，等待相同用户输入期间静默，不提前重启、轮换或停用；独立 GitHub schedule 未验证时仅按需补充触发既有监测，不把此替代手段称为 5 分钟 schedule 成功。服务器采样上传、完整状态激活、至少 24 小时连续观察、正式 Metabase 停用、30 分钟后验收、按需 start / stop 实测、实际内存释放量仍未验收。不能提前停止或把维护重启称为按需切换完成。

网页回退仅选择验证过的 Netlify deploy；Blobs 保留 previous，恢复时保持原生成时间。Metabase 必须用配套备份、密钥和已审查版本恢复，始终保留内部 SSH 隧道访问，禁止恢复公网代理或启动事故旧容器。

主仓库既有 ahead 19 提交和未跟踪研究保持不动。已推送 checkpoint `767ef33d`、`bfb3dbec`、`4299a159`、`997c66da`。[Issue #89](https://github.com/Shuang-su/Metaflow/issues/89) 与 [Draft PR #90](https://github.com/Shuang-su/Metaflow/pull/90) 保持开放；没有 merge、tag 或 Viewer / Editor 发布。本记录不声明独立 review 或全部生产验收完成。
