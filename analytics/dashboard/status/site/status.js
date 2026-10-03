let latest = null;
const clock = (value) =>
  new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
const node = (tag, text, className) => {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
};
function render() {
  const age = latest ? Date.now() - Date.parse(latest.completed_at) : Infinity;
  const unknown = !Number.isFinite(age) || age > 1800000 || age < -60000;
  const checks = latest?.checks ?? [];
  const failed = checks.some(
    (c) => !c.pending && (!c.http_ok || c.fresh === false),
  );
  const pending = checks.some((c) => c.pending);
  const banner = document.getElementById("overall");
  banner.className = `banner ${unknown ? "unknown" : failed ? "warning" : pending ? "unknown" : "good"}`;
  banner.replaceChildren(
    node(
      "strong",
      unknown
        ? "状态未知"
        : failed
          ? "部分服务需要关注"
          : pending
            ? "部分服务准备中"
            : "所有公众服务正常",
    ),
    node(
      "span",
      unknown
        ? "最近 30 分钟内没有可确认的监测结果"
        : pending && !failed
          ? "已上线入口持续监测，待接入项目单独标明"
          : failed
            ? "请查看下方各项状态和故障记录"
            : "公众入口可达，公开数据刷新正常",
    ),
  );
  document.getElementById("checked").textContent = latest
    ? `最近完成监测：${clock(latest.completed_at)} · 北京时间 · 约每 5 分钟检查一次`
    : "尚无监测结果";
  const services = document.getElementById("services");
  services.replaceChildren();
  for (const c of checks) {
    const row = node("article", null, "service");
    const label = node("div");
    label.append(node("strong", c.name));
    if (c.response_ms != null)
      label.append(node("small", `最近响应 ${c.response_ms} ms`));
    const state = node(
      "div",
      null,
      `service-status ${unknown || c.pending ? "" : !c.http_ok || c.fresh === false ? "warning" : "good"}`,
    );
    state.append(
      node(
        "span",
        unknown
          ? "状态未知"
          : c.pending
            ? "准备中"
            : c.http_ok
              ? "入口可达"
              : "暂时不可达",
      ),
    );
    if (c.generated_at)
      state.append(
        node(
          "small",
          `${unknown ? "最近快照" : c.fresh ? "数据已更新" : "数据更新延迟"} · ${clock(c.generated_at)}`,
        ),
      );
    else if (c.fresh === false && !c.pending)
      state.append(node("small", "快照不可用"));
    row.append(label, state);
    services.append(row);
  }
}
async function refresh() {
  try {
    // Fetch the independently committed heartbeat, so a stale Pages deployment cannot mask monitor failure.
    const response = await fetch(
      "https://raw.githubusercontent.com/Shuang-su/metaflow-status/main/history/monitor.json?t=" +
        Date.now(),
      { cache: "no-store", signal: AbortSignal.timeout(12000) },
    );
    if (!response.ok) throw Error("monitor unavailable");
    const data = await response.json();
    if (
      data.schema_version !== 1 ||
      !Array.isArray(data.checks) ||
      !Number.isFinite(Date.parse(data.completed_at))
    )
      throw Error("invalid monitor");
    latest = data;
  } catch {
    /* Keep the last successful observation; the independent age clock will turn it unknown. */
  }
  render();
}
refresh();
setInterval(refresh, 60000);
setInterval(render, 15000);
