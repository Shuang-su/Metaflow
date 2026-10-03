export const LABELS = {
  mobile: "手机",
  desktop: "桌面",
  tablet: "平板",
  unknown: "未知",
  network: "网络",
  renderer: "渲染器",
  resource: "资源解析",
  other: "其他",
};
export const number = (n) =>
  n == null
    ? "—"
    : new Intl.NumberFormat("zh-CN", { maximumFractionDigits: 0 }).format(n);
export const percent = (n) => (n == null ? "—" : `${(n * 100).toFixed(1)}%`);
export const duration = (n) => (n == null ? "—" : `${(n / 1000).toFixed(2)} s`);
export const time = (value) =>
  value
    ? new Intl.DateTimeFormat("zh-CN", {
        timeZone: "Asia/Shanghai",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      }).format(new Date(value))
    : "—";
export function freshness(data, error, seconds, now = Date.now()) {
  if (!data)
    return {
      tone: "muted",
      text: error && error !== "missing" ? "暂时无法获取数据" : "数据准备中",
    };
  const age = now - Date.parse(data.generated_at);
  if (!Number.isFinite(age) || age > seconds * 1000 || age < -60000)
    return { tone: "warning", text: "数据更新延迟" };
  if (error) return { tone: "warning", text: "刷新失败 · 保留最近数据" };
  return { tone: "good", text: "数据已更新" };
}
export function sortedResources(rows, search, sort) {
  const query = search.trim().toLocaleLowerCase();
  return rows
    .filter((r) => `${r.title} ${r.id}`.toLocaleLowerCase().includes(query))
    .sort((a, b) => {
      const av = a[sort.key],
        bv = b[sort.key];
      if (av == null) return bv == null ? 0 : 1;
      if (bv == null) return -1;
      const cmp =
        typeof av === "string" ? av.localeCompare(bv, "zh-CN") : av - bv;
      return (
        cmp * (sort.direction === "asc" ? 1 : -1) || a.id.localeCompare(b.id)
      );
    });
}
export function validateSnapshot(data, kind, days) {
  if (
    !data ||
    data.schema_version !== 1 ||
    data.kind !== kind ||
    !Number.isFinite(Date.parse(data.generated_at))
  )
    throw Error("Invalid snapshot");
  if (
    kind === "analytics" &&
    (data.period?.days !== days ||
      !data.kpis ||
      !["daily", "resources", "devices", "errors"].every((k) =>
        Array.isArray(data[k]),
      ))
  )
    throw Error("Invalid analytics");
  if (kind === "server" && (!data.current || !Array.isArray(data.history)))
    throw Error("Invalid server");
  return data;
}
