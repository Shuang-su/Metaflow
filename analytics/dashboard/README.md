# Metaflow 公开看板 · MF-89

静态 React / Vite 页面 + Supabase 固定汇总函数 + Netlify Blobs / Functions + Python 标准库服务器采样。生产契约见 [Spec](../../docs/changes/89-public-dashboard/spec.md) 与 [Plan](../../docs/changes/89-public-dashboard/plan.md)。没有常驻 Node 服务；读网页不会执行 SQL。原始数据仍在 Supabase。

## 本地开发与验证

从本目录运行：

```sh
npm ci --cache ../../.codex-work/cache/npm
npm test
npm run typecheck
npm run build
python3 -m unittest discover -s tests -p 'test_*.py' -v
node scripts/catalog.mjs ../../.codex-work/dashboard-catalog
```

`npm test` 在独立 PGlite 数据库中运行 SQL 合成样本、权限拒绝与 UI 数据模型测试。`test_caddy.py` 需设置 `CADDY_BIN` 指向校验过的 Caddy 2.11.4 二进制；否则明确跳过。它验证真实 Caddy 适配结果只有 loopback 监听。Node hosting 测试覆盖公开路径、方法、48 次并发只读、签名与过期拒绝、原子更新失败保留；Python 测试覆盖采样、原子落盘、上传签名与禁止重定向。

预览时把已通过 `ops/snapshot.py` 校验的公开 7d / 30d JSON 放到本地静态服务的 `/api/public/v1/analytics/`；没有服务器采样时保持 404，页面显示“数据准备中”，不可填入假实时数值。所有 API 同源。`npm run dev` 用于布局开发；发布只使用 `dist/`。

## 境外托管与数据库权限

用户于 2026-09-28 确认域名未备案并批准改用中国内地以外托管。独立 Netlify 项目 `mf89-shuangsu`（site ID `1679bf5c-c8df-46cd-a0aa-15c8b2701134`）提供静态页面、公开 API 和 Scheduled Function；Supabase 项目位于东京，GitHub Pages 独立托管状态页。阿里云深圳只保留内部分析及向外推送的服务器采样。

数据库迁移包含私有函数 / 角色、99 条公开资源路径白名单、管理员验证权限及独立 reader LOGIN。`dashboard_private` 不加入 Supabase exposed schemas。`metaflow_dashboard_reader` 连接上限 2、默认只读，只能执行固定汇总函数，不能查询原始事件表或切换至函数 owner。密码通过受限渠道单独配置，不写入 migration、PR、终端历史、缓存或前端。

`MF89_ANALYTICS_DATABASE_URL` 只配置在这个独立 Netlify 项目的 production context。现有 legacy Free 套餐实测拒绝自定义 scopes（403），开启 secret 标记又因默认包含 post*processing 而被拒绝（422）；因此使用普通私有环境变量、平台默认 scopes，项目管理员可通过控制台 / API 读取。构建环境与同站点 Functions 均可取得该配置，这是已知平台边界。不得使用 VITE* 等前端公开前缀，构建脚本不读取 / 输出该变量，发布前扫描 dist、Functions zip 与本地配置缓存中没有连接字符串。公开 handler 不读取该变量、不导入 SQL 客户端、不执行查询；这些是代码边界，不能称为平台逐函数秘密隔离。调度 handler 随部署包含从 Supabase 官方 HTTPS 来源取得的公开 Root 2021 CA（SHA-256 `807025ad50d4ed219d2c9c7d299c004f824eb00cf7f65afef607d07b72e6cafa`），显式验证数据库 TLS 主机名及证书链，CA 到期前需受审更新。调度 handler 使用完整 TLS 证书验证，15 分钟一次查询 7 / 30 天并整体写入 Blobs `analytics` 对象。公开 handler 只读 Blobs，CDN 缓存 30 秒；没有公网 SQL 查询入口。

公开资源 ID 是 canonical route。同名 / 同 ID 的不同活动不能合并。目录变更后重新生成 catalog、事务更新 `dashboard_private.public_resources`、同步 `netlify/lib/public-resources.json` 并重新部署。`ops/db-service.example.conf` 和 `snapshot.py analytics` 仅供受限人工核验，不在深圳安装业务查询凭据或业务定时器。

## Netlify 发布与回退

从本目录构建和部署，始终显式指定独立项目 ID，避免仓库根目录的主站配置：

```sh
npm ci
npm test
npm run typecheck
npm run build
netlify deploy --site 1679bf5c-c8df-46cd-a0aa-15c8b2701134 --prod
```

使用已登录的受权 Netlify CLI；不在命令行传 token。`netlify.toml` 不设置 `base="."`，否则 monorepo 第二轮配置解析可能误选根目录配置。部署需从实际依赖目录执行完整 build；经验证，仅复制源码加 node_modules symlink 的 no-build 暂存部署会漏掉 Functions 依赖，不能复用该方式。检查部署状态 ready、production context、三个 Functions 与 `*/15 * * * *` 调度，再核验 HTTPS 与实际快照更新时间。

`dashboard.metaflow.shuang-su.com` CNAME 指向 `mf89-shuangsu.netlify.app`；平台证书签发后必须验证主机名与证书链，不能跳过验证。新 API 首次无数据时返回 `404 {"error":"preparing"}`。服务器未接入期间真实保留准备状态，不能上传测试数值代替生产采样。

未知 API / 登录 / 分享 / 管理路径 404，公开 API 只允许 GET / HEAD，写方法 405。定时汇总函数公网访问由平台拒绝。接收端 `/api/internal/v1/server-snapshot` 只接受时间窗内的 HMAC 签名、有限长度及严格 server schema，不接受 analytics 数据。上传 secret 未配置时为 503，保留旧快照。

快照使用强一致读与 ETag 条件更新，`{current,previous}` 存在一个 Blob 中；业务两个范围一起替换。失败 / 冲突不会抹去旧快照。网站回退选上一份已验证 Netlify deploy；快照回退在受限管理员环境校验 `previous` 后以 ETag 条件写回，保留原生成时间，不伪造新鲜度。不要回退到最初依赖打包失败的部署，也不恢复旧公网 Metabase 代理。

使用现有 Free 团队，不开付费功能。API / Functions / Blobs 使用量计入共享套餐额度；每分钟采样只更新对象，不触发网站部署。发布后核对实际使用量，不能将 Free 理解为无限容量。

## 深圳服务器安装门槛与目录

服务器安装前先完成 `ops/security-review.example.json` 中的事实核验，0600 保存 `/etc/metaflow-dashboard/security-review.json` 与证据引用。不能把示例 false 改 true 代替核验。检查账号 / 会话 / API key、任务与依赖、事故整改、离机备份恢复、安全版本、云防火墙及宿主监听。发现不明持久化则停止原机发布并转干净实例重建。

| 路径                                                | 用途                                                 |
| --------------------------------------------------- | ---------------------------------------------------- |
| `/opt/metaflow-dashboard/ops/`                      | 采样、签名上传、切换脚本与 systemd units             |
| `/etc/metaflow-dashboard/`                          | 上传 secret、公开资源白名单、安全核对记录；目录 0700 |
| `/var/lib/metaflow-dashboard/snapshots/server.json` | 已校验的本机采样，不由公网文件服务暴露               |
| `/var/lib/metaflow-dashboard/publish-receipt.json`  | 服务端确认过的生成时间                               |
| `/var/lib/metaflow-dashboard/`                      | 内部计数器、上一快照、连续观察与切换证据；目录 0700  |

采样器兼容现有 Python 3.6，无常驻 Node 服务。安装前创建 systemd ReadWritePaths 目录。单次采样以文件锁防重入、fsync + rename 更新本地 JSON；每分钟运行 `metaflow-server-sample.timer`，依次采样、签名上传、记录观察。上传失败时 Netlify 保留旧对象，公众页面超 3 分钟显示延迟。

安全核对完成后生成专用随机 32 字节十六进制上传 secret：本机放在 root:root 0600 的 `/etc/metaflow-dashboard/publisher.json`，格式仅 `{"secret":"<64 hex>"}`；同一值配置为 Netlify 独立项目 production 私有环境变量 `MF89_SERVER_PUBLISH_SECRET`（同上 Free 套餐限制） 后重新部署。此密钥不能部署站点、读取数据库或更改业务汇总。HTTPS 上传禁止跟随重定向；成功确认生成时间后才保存本地回执。凭据不进入项目缓存。

`metaflow-analytics.timer` 已从方案移除；若曾安装旧版，先核实再停用旧业务 timer，避免重复查询。不要在深圳配置新的数据库查询定时器。

保留当前 Caddy 配置的受限备份，校验 `ops/Caddyfile` 后仅保留 `http://127.0.0.1:8080` 内部代理，不监听公网 80 / 443。现有单文件 bind mount 应保留 inode 原位写入，再 reload；失败恢复安全的内部配置，不能恢复公网管理接口。Metabase 绑定 `127.0.0.1:3000`；Mac 用 `ssh -L 18080:127.0.0.1:8080 root@47.107.148.167` 后访问 `http://127.0.0.1:18080`，保留账号验证。

独立状态仓库先运行 `python3 scripts/activate.py --business-only` 验证并激活业务入口；服务器采样就绪后才运行完整激活。只有所有公开接口持续新鲜、主机检查通过后，才开始完整 24 小时观察。每分钟本机观察核对上传回执，独立 GitHub runner 检查公网；停用前再读取全部真实公网快照。

## 备份、恢复和按需运行

`python3 ops/backup_metabase.py /var/backups/metaflow/<UTC-timestamp>` 生成自包含、受限的 app DB dump、运行配置、加密密钥、镜像 ID、对象数量及 SHA-256 清单。**备份仍在服务器上时不能算离机完成。** 用已经授权的 SSH 连接复制到 Mac 的 `~/.ssh/metaflow-backups/<timestamp>/`（父目录 0700、文件 0600，不放 `.codex-work`），逐文件核验清单。路径内含敏感数据，不提交或贴到聊天。

`python3 ops/restore_check.py <backup-directory>` 在新建的、无网络 / 无公开端口 / 有资源限额的临时 PostgreSQL 容器中完整恢复并核对对象数量。只删除本次创建的临时测试容器，保留受限测试目录，绝不删除生产数据卷。Docker 本地未运行时不冒称恢复已验证。加密密钥与应用配置受同一备份清单保护；补丁版 Metabase 的实际启动健康验证仍单独完成。

先检查订阅 / 告警 / 定时查询及事故旧版本；首次转按需运行前升级到审查过的安全版本。`analysis.compose.yml` 是独立、默认不开启的 `analysis` profile，图片必须是完整 digest，数据库引用现有 external volume。采用前现场核对现有 Compose project / service labels，不能用空卷替代，也不能通过 `down -v` 或删除旧容器清理冲突。Caddy 不属于此配置。

系统补丁安装与实际生效分开核验。若包含内核更新，完成受控重启并核对正在运行的 kernel 后才能把 `os_security_updates_verified` 标为 true；补丁包已下载或安装不能绕过停用门槛。2 GB 主机的 Metabase 使用 512 MiB JVM heap；维护期间仍需核对宿主可用内存、Swap 和 OOM 日志，不把 heap 当成进程总内存。

本次已在服务器 `/etc/metaflow-analysis/compose.yml` 生成独立配置，引用现有 external volume / network；私有环境文件仅存在该目录。配置已经 `docker compose config --quiet` 验证，尚未执行最终按需切换。此前 recovered Compose 配置保留作审计；后续重建分析服务使用独立配置与显式 `--profile analysis`，不能从旧的常驻配置重新部署。

两个运维命令（部署后）：

```sh
python3 /opt/metaflow-dashboard/ops/analysisctl.py start
python3 /opt/metaflow-dashboard/ops/analysisctl.py stop
```

start 先检查未过期安全记录与镜像，再启动数据库等待就绪，最后启动 Metabase 等待健康。stop 首次必须有至少 24 小时本机与独立外部成功观察；先停 Metabase，再停数据库，并记录内存 / Swap。二者设置 restart=no，不拉取镜像、不删除卷。连续记录中断或失败会阻止首次停用；安全记录超过 30 天需重新核验。

`analysisctl.py verify` 只在最终停止至少 30 分钟后通过，检查期间快照和外部入口持续正常、服务确实停止。另行记录一次已实测的按需 start / stop 周期，核对 Docker 重启计数、kernel OOM / journal 和实际内存释放量，不能预写承诺释放 1.2 GiB。

## 回退

网站与境外快照按上文回退；服务器本地 JSON 可从 `/var/lib/metaflow-dashboard/previous/` 校验后恢复，旧时间戳不得伪装成新数据。保留服务器 timer 及独立状态页，页面显示真实延迟。

Metabase 回退必须使用配套 app DB、密钥及已审查镜像，始终只绑定 loopback。**禁止重新启动 `*-compromised-20260813` 等事故旧容器，禁止恢复旧公网反向代理。** 不支持安全回退的事故或版本状态，转入干净实例重建。
