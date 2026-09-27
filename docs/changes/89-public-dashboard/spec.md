# MF-89 · 公开看板契约

状态：用户于 2026-09-28 批准实施；生产状态以 Issue / PR 的实测交付为准。
Issue：https://github.com/Shuang-su/Metaflow/issues/89 。组件：platform；风险：T3（公开数据、安全边界、生产切换）。

## 页面与数据边界

`dashboard.metaflow.shuang-su.com` 提供中文、手机适配的静态页面，7 / 30 天切换、PV / UV / 首帧成功率 / P95、每日趋势、资源搜索排序、设备与错误类别、服务器 CPU / 内存 / 磁盘及 24 小时趋势。样式采用浅灰背景、白色卡片、蓝色图表。原始业务数据仍在 Supabase；公网请求不查询数据库。独立 `status.metaflow.shuang-su.com` 由 GitHub Pages 托管。

固定 GET 接口：`/api/public/v1/analytics/7d.json`、`/api/public/v1/analytics/30d.json`、`/api/public/v1/server.json`。不开放任意查询、用户 / 会话 / 回放 / 原始错误、IP、主机名、软件版本、凭据。资源名称和 ID 必须来自已公开的 `data/index.json` 白名单；未知资源只计入总体汇总，不输出标签。

## 指标口径

- 时间范围为北京时间当日起向前 7 / 30 个自然日，末日截至本次一致性查询时间；开始包含、截止包含。`period.start` / `period.end`、`source_cutoff_at`、`generated_at` 均使用带时区 ISO 时间，`timezone=Asia/Shanghai`。
- PV：范围内 `page_viewed` 事件数；UV：这些事件的非空匿名 hash 在整个范围内去重，不能相加每日 UV。`uv_missing_pv` 说明缺少 hash 的 PV 数。
- 加载尝试：范围内首次 `resource_load_started`，按 session / page_view / resource / route 归组；缺失 page_view 不作为有效加载样本。一次页面内的重试合并为一个尝试。成功是开始后首次 `first_frame_ready`，最长 24 小时；成功率为成功尝试 / 全部尝试，包括尚未完成的尝试。
- 资源维度用公开路径作输出 ID，查询同时匹配资源 ID 与去掉尾部斜线的公开路径。目录有同 ID 不同活动路径的资源，禁止仅以 ID 合并或覆盖标题。
- P95：成功尝试的首帧时间减开始时间（毫秒），对有效的 0–24 小时样本计算 `percentile_cont(0.95)`；无样本为 null，不返回 0。公开同时返回分子、分母和样本量。每日及资源汇总采用相同口径。
- 设备仅 mobile / desktop / tablet / unknown 四类，按 PV 计数；错误仅 network / renderer / resource / other 四类，按失败事件计数。源端自由文本不可进入输出。
- 真实零值显示 0，无样本显示“无样本”，首次没有快照显示“数据准备中”；请求失败有旧结果则保留，并明确提示。

## 生成与最小权限

独立 NOLOGIN 函数所有者仅可读原始事件所需列与公开资源白名单；RLS 显式允许该角色读取。私有 schema 的 SECURITY DEFINER 函数固定空 search_path、固定 SQL、仅接受 7 / 30 天。运行角色无原表权限、无所有者角色成员关系，只能 EXECUTE 这一个固定函数。PUBLIC / anon / authenticated 无执行权；该 schema 不加入 PostgREST exposed schemas。密码另行安全配置，仓库中不包含凭据。

每 15 分钟生成业务快照；每分钟采样服务器。严格白名单校验全部字段、类型、范围及一致性后，同目录 fsync + rename 原子替换；失败保留有效旧版本。发布目录不放备份、密钥或内部采样状态。业务生成时间超过 30 分钟、服务器最新采样超过 3 分钟显示延迟；最近事件时间不是刷新时间。前端每分钟刷新，所有 API 同源。

## 生产与恢复边界

安全整改、离机受限备份及隔离恢复验证、HTTPS 独立外部验证通过后才能发布。异常持久化或无法解释的高权限修改则停止原机发布，转为干净重建。云防火墙和宿主监听分别核对；不将宿主监听直接当作已验证公网暴露。

Caddy 公网只允许页面、构建资产及三个 API，其他 API / 登录 / 分享 / 管理路径返回 404。Metabase 仅 loopback + SSH 隧道、保留账号验证。更新旧配置脚本，避免以后重建时恢复公网代理。

先核查 Metabase 订阅 / 告警 / 任务，再备份应用库、配置、必要密钥和固定镜像。不得启动事故旧容器。并行运行至少 24 小时后才可设为默认停止；启停不得删除数据卷。切换后观察至少 30 分钟并实测一次启停，记录内存与 Swap。不得用短时测试替代时间门槛。

状态页使用独立公开仓库 `Shuang-su/metaflow-status` / Upptime，每约 5 分钟检查网站、看板、JSON、接收接口 OPTIONS（不写事件）。GitHub 调度可能延迟，超过 30 分钟无完成监测显示未知；API HTTP 可达与快照新鲜度分开。停用内部 Metabase 不算故障。第一版无短信、邮件、聊天通知。

回退保留上一有效网页及 JSON；Metabase 配套备份恢复仍只允许内部访问。无付费服务、无原始库迁移、无历史数据卷删除。
