# Metaflow 公开看板 · MF-89

静态 React / Vite 页面 + Supabase 固定汇总函数 + Python 标准库定时快照。生产契约见 [Spec](../../docs/changes/89-public-dashboard/spec.md) 与 [Plan](../../docs/changes/89-public-dashboard/plan.md)。没有常驻 Node 服务；读网页不会执行 SQL。原始数据仍在 Supabase。

## 本地开发与验证

从本目录运行：

```sh
npm ci --cache ../../.codex-work/cache/npm
npm test
npm run build
python3 -m unittest discover -s tests -p 'test_*.py' -v
node scripts/catalog.mjs ../../.codex-work/dashboard-catalog
```

`npm test` 在独立 PGlite 数据库中运行 SQL 合成样本、权限拒绝与 UI 数据模型测试。`test_caddy.py` 需设置 `CADDY_BIN` 指向校验过的 Caddy 2.11.4 二进制；否则明确跳过。它启动仅 loopback 的临时测试监听，验证允许路径 / 拒绝路径、POST 405、48 次有限并发与纯静态处理器。

预览时把已通过 `ops/snapshot.py` 校验的公开 7d / 30d JSON 放到本地静态服务的 `/api/public/v1/analytics/`；没有服务器采样时保持 404，页面显示“数据准备中”，不可填入假实时数值。所有 API 同源。`npm run dev` 用于布局开发；发布只使用 `dist/`。

## 数据库发布

迁移按顺序包含私有函数 / 角色、99 条公开资源路径白名单、管理员显式切换到受限角色的验证权限。应用时使用迁移工具，不在业务请求中创建表。`dashboard_private` 不加入 Supabase 的 exposed schemas。

`metaflow_dashboard_reader` 初始为 NOLOGIN。服务器安全核对完成后，用安全渠道配置专用密码并启用 LOGIN，连接数上限 2；不可授予 `analytics_reader`、函数 owner 或原表权限。worker 只执行 `dashboard_private.analytics_snapshot(7/30)`。不把密码写入 migration、PR、终端历史或缓存。`ops/db-service.example.conf` 只是占位模板，真实文件归 root 所有且 0600。pooler 主机和数据库用户名须现场核验，TLS 使用 `verify-full`，不得降低验证级别。

公开资源 ID 使用 canonical route：目录中同名 / 同 ID 的不同活动路径不能合并。目录发布变更后，重新导出 catalog，事务更新 `dashboard_private.public_resources`，并同步服务器 `/etc/metaflow-dashboard/public-resources.json`。先验证再恢复刷新。

## 服务器目录与服务

| 路径 | 用途 |
|---|---|
| `/opt/metaflow-dashboard/ops/` | 本目录 ops 中的脚本与 systemd unit |
| `/etc/metaflow-dashboard/` | 受限数据库连接、公开资源白名单、安全核对记录；目录 0700 |
| `/var/lib/metaflow-dashboard/` | 内部采样计数器、旧快照、连续观察、切换证据；目录 0700 |
| `/opt/metaflow-metabase/caddy/data/public-dashboard/` | Caddy 容器可读的纯公开文件 |
| `public-dashboard/releases/<commit>/` | 不可变静态 `dist` 发布版本 |
| `public-dashboard/current` | 指向已验证 release 的相对 symlink；原子替换 |
| `public-dashboard/api/public/v1/` | 仅三种固定 JSON；不放配置 / 备份 |

采样器兼容现有 Python 3.6，无需升级系统 Python。业务 worker 使用固定 PostgreSQL 16.14 镜像摘要的一次性 `psql`，即使 Metabase 与其数据库停止也可运行。服务有超时与 CPU / 内存限额，单次重入使用文件锁。两个业务快照全部验证后才逐个原子替换，失败保持上次有效版本；两文件的更替可能相差几毫秒，客户端不跨范围合并结果。

`metaflow-analytics.timer` 每 15 分钟、`metaflow-server-sample.timer` 每分钟。systemd 安装 / 启用只在发布审查通过后进行；必须先创建 unit 的 ReadWritePaths 目录。`snapshot.py analytics` 手动成功、`snapshot.py server` 连续至少两次采样后，再启用 timers。检查 journal 只有有界错误类型，不输出 DSN 或原始 SQL 响应。

## 发布门槛与 Caddy

先完成 `ops/security-review.example.json` 中的事实核验，在 `/etc/metaflow-dashboard/security-review.json` 留下证据引用与时间（0600）。不要将示例的 false 直接改 true 代替工作。核对账号 / 会话 / API key、依赖任务、事故整改、备份恢复、固定镜像、云防火墙及外部 HTTPS。发现不明持久化则停止原机发布。

**2026-09-28 已观察到该域名的阿里云备案拦截页，外部 TLS 在 ClientHello 后被重置。发布前须解除合法入口拦截并重做外部验证；不能用关闭证书验证或改成公网 HTTP 通过门槛。**

实际部署顺序：

1. 记录现有 Caddy 配置、容器挂载和服务状态，保存受限备份。确认现有 Caddy `/data` 的主机挂载与上表一致。
2. 将 `dist/` 放入新的不可变 release，复制 ops 至 `/opt/metaflow-dashboard/ops/`；凭据另行安全配置。生成并验证三份快照，确保 Caddy 可读公开文件，不能读取 private 目录。
3. 使用当前 Caddy **同一固定版本** `caddy validate` 校验 `ops/Caddyfile`。先在隔离监听验证路由，再把原配置备份到受限目录。现有单文件 bind mount 必须原位写入配置，保留 inode，随后 `docker exec metaflow-metabase-caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`；失败恢复旧文件内容，但不能恢复公网管理代理。
4. public `current` 用相对 symlink + rename 原子切换。Caddy 公网只读 `/`、构建 assets 和三份 API；旧 `/metaflow/` 重定向首页，其他 Metabase 路径 404。
5. Metabase 位于 `127.0.0.1:3000`，内部 Caddy `127.0.0.1:8080`。Mac 执行 `ssh -L 18080:127.0.0.1:8080 root@47.107.148.167` 后访问 `http://127.0.0.1:18080`，仍需要 Metabase 登录。
6. 开启 timers，独立网络验证 HTTPS、JSON 口径 / 新鲜度，运行有限并发并比较数据库调用计数；复制并激活 `status/` 独立仓库配置。记录首次正式上线时间，然后才开始 24 小时门槛。

## 备份、恢复和按需运行

`python3 ops/backup_metabase.py /var/backups/metaflow/<UTC-timestamp>` 生成自包含、受限的 app DB dump、运行配置、加密密钥、镜像 ID、对象数量及 SHA-256 清单。**备份仍在服务器上时不能算离机完成。** 用已经授权的 SSH 连接复制到 Mac 的 `~/.ssh/metaflow-backups/<timestamp>/`（父目录 0700、文件 0600，不放 `.codex-work`），逐文件核验清单。路径内含敏感数据，不提交或贴到聊天。

`python3 ops/restore_check.py <backup-directory>` 在新建的、无网络 / 无公开端口 / 有资源限额的临时 PostgreSQL 容器中完整恢复并核对对象数量。只删除本次创建的临时测试容器，保留受限测试目录，绝不删除生产数据卷。Docker 本地未运行时不冒称恢复已验证。加密密钥与应用配置受同一备份清单保护；补丁版 Metabase 的实际启动健康验证仍单独完成。

先检查订阅 / 告警 / 定时查询及事故旧版本；首次转按需运行前升级到审查过的安全版本。`analysis.compose.yml` 是独立、默认不开启的 `analysis` profile，图片必须是完整 digest，数据库引用现有 external volume。采用前现场核对现有 Compose project / service labels，不能用空卷替代，也不能通过 `down -v` 或删除旧容器清理冲突。Caddy 不属于此配置。

两个运维命令（部署后）：

```sh
python3 /opt/metaflow-dashboard/ops/analysisctl.py start
python3 /opt/metaflow-dashboard/ops/analysisctl.py stop
```

start 先检查未过期安全记录与镜像，再启动数据库等待就绪，最后启动 Metabase 等待健康。stop 首次必须有至少 24 小时本机与独立外部成功观察；先停 Metabase，再停数据库，并记录内存 / Swap。二者设置 restart=no，不拉取镜像、不删除卷。连续记录中断或失败会阻止首次停用；安全记录超过 30 天需重新核验。

`analysisctl.py verify` 只在最终停止至少 30 分钟后通过，检查期间快照和外部入口持续正常、服务确实停止。另行记录一次已实测的按需 start / stop 周期，核对 Docker 重启计数、kernel OOM / journal 和实际内存释放量，不能预写承诺释放 1.2 GiB。

## 回退

静态站点回指上一已验证 release；JSON 从 `/var/lib/metaflow-dashboard/previous/` 校验后原子恢复（旧时间戳不得伪装成新数据）。保留 snapshot timers 及独立状态页，页面显示延迟。

Metabase 回退必须使用配套 app DB、密钥及已审查镜像，始终只绑定 loopback。**禁止重新启动 `*-compromised-20260813` 等事故旧容器，禁止恢复旧公网反向代理。** 不支持安全回退的事故或版本状态，转入干净实例重建。
