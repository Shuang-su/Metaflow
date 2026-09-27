# Metaflow 服务状态

公开、独立的 Upptime 监测与 GitHub Pages 状态页。原始业务数据、用户标识、凭据和内部服务不进入本仓库。源模板随 [Metaflow MF-89](https://github.com/Shuang-su/Metaflow/issues/89) 维护。

- `.upptimerc.yml`：Upptime 公众入口探测及故障 / 恢复 Issue；使用仓库内置 `GITHUB_TOKEN`，没有个人 PAT 或通知服务。
- `scripts/monitor.py`：独立 HTTPS 与 JSON 新鲜度检查，`history/monitor.json` 仅保存公开状态及最近 48 小时布尔观察点。
- `site/`：中文静态呈现；30 分钟未更新显示未知，即使阿里云服务不可用也可访问。
- `deployment-state.json`：按实际接入范围记录 `active_checks`。境外业务看板通过后先运行 `python3 scripts/activate.py --business-only`；服务器采样接入后再运行不带参数的激活命令。脚本先验证对应 HTTPS / 新鲜度，再提交并推送。只有全部接入后 `dashboard_live=true`，此前不产生完整 24 小时切换通过记录。
- Pages 使用 GitHub Actions 部署；目标自定义域为 `status.metaflow.shuang-su.com`。未绑定 DNS 时仍可在 GitHub Pages 默认地址查看。

每五分钟调度不是实时 SLA；以 `completed_at` 为准。主网站或已上线公众入口失败由 Upptime 记录 Issue，历史不从其他服务复制。数据接收检查只发送 OPTIONS，绝不发送模拟 POST 埋点。内部按需运行的 Metabase 不列为公众服务。

不配置邮件、短信或聊天通知。固定 action commit 需要主动审查升级，未启用自动模板覆写。静态页面是本项目的小型呈现层，Upptime 原版重型站点生成器不参与部署。
