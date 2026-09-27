function requireThat(ok) {
  if (!ok) throw new Error("invalid_snapshot");
}
function fields(obj, names) {
  requireThat(obj && !Array.isArray(obj) && typeof obj === "object");
  const expected = names.split(" ");
  requireThat(
    Object.keys(obj).length === expected.length &&
      expected.every((k) => Object.hasOwn(obj, k)),
  );
}
function count(n) {
  requireThat(Number.isSafeInteger(n) && n >= 0);
}
function numeric(n, max, nullable = false) {
  requireThat(
    (nullable && n === null) ||
      (typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= max),
  );
}
function timestamp(s) {
  requireThat(
    typeof s === "string" &&
      /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,6})?(?:Z|[+-]\d\d:\d\d)$/.test(
        s,
      ),
  );
  const n = Date.parse(s);
  requireThat(Number.isFinite(n));
  return n;
}
function stats(row) {
  for (const k of ["pv", "uv", "attempts", "successes", "p95_samples"])
    count(row[k]);
  requireThat(
    row.uv <= row.pv &&
      row.successes <= row.attempts &&
      row.p95_samples === row.successes,
  );
  numeric(row.success_rate, 1, true);
  numeric(row.p95_ms, 86400000, true);
  requireThat(
    row.attempts
      ? row.success_rate !== null &&
          Math.abs(row.success_rate - row.successes / row.attempts) < 1e-8
      : row.success_rate === null,
  );
  requireThat((row.p95_samples === 0) === (row.p95_ms === null));
}
export function validateAnalytics(data, days, catalog, now = Date.now()) {
  fields(
    data,
    "schema_version kind timezone period source_cutoff_at generated_at latest_event_at kpis daily resources devices errors",
  );
  requireThat(
    data.schema_version === 1 &&
      data.kind === "analytics" &&
      data.timezone === "Asia/Shanghai",
  );
  fields(data.period, "days start end");
  requireThat([7, 30].includes(days) && data.period.days === days);
  const start = timestamp(data.period.start),
    end = timestamp(data.period.end),
    cut = timestamp(data.source_cutoff_at),
    generated = timestamp(data.generated_at);
  requireThat(
    start <= end && end === cut && cut <= generated && generated <= now + 60000,
  );
  const localStart = new Date(start + 28800000),
    localEnd = new Date(end + 28800000);
  requireThat(
    localStart.toISOString().slice(11) === "00:00:00.000Z" &&
      Math.floor(localEnd.getTime() / 86400000) -
        Math.floor(localStart.getTime() / 86400000) ===
        days - 1,
  );
  if (data.latest_event_at !== null)
    requireThat(
      timestamp(data.latest_event_at) >= start &&
        timestamp(data.latest_event_at) <= cut,
    );
  fields(
    data.kpis,
    "pv uv uv_missing_pv attempts successes success_rate p95_ms p95_samples",
  );
  stats(data.kpis);
  count(data.kpis.uv_missing_pv);
  requireThat(data.kpis.uv_missing_pv <= data.kpis.pv);
  requireThat(Array.isArray(data.daily) && data.daily.length === days);
  for (const [i, row] of data.daily.entries()) {
    fields(row, "date pv uv");
    count(row.pv);
    count(row.uv);
    requireThat(
      row.uv <= row.pv &&
        row.date ===
          new Date(localStart.getTime() + i * 86400000)
            .toISOString()
            .slice(0, 10),
    );
  }
  requireThat(data.daily.reduce((n, r) => n + r.pv, 0) === data.kpis.pv);
  requireThat(
    Array.isArray(data.resources) &&
      data.resources.length === Object.keys(catalog).length,
  );
  const ids = new Set();
  for (const row of data.resources) {
    fields(
      row,
      "id title pv uv attempts successes success_rate p95_ms p95_samples",
    );
    stats(row);
    requireThat(
      Object.hasOwn(catalog, row.id) &&
        catalog[row.id] === row.title &&
        !ids.has(row.id),
    );
    ids.add(row.id);
  }
  for (const k of ["pv", "attempts", "successes"])
    requireThat(data.resources.reduce((n, r) => n + r[k], 0) <= data.kpis[k]);
  for (const [name, allowed] of [
    ["devices", ["mobile", "desktop", "tablet", "unknown"]],
    ["errors", ["network", "renderer", "resource", "other"]],
  ]) {
    requireThat(
      Array.isArray(data[name]) && data[name].length <= allowed.length,
    );
    const seen = new Set();
    for (const row of data[name]) {
      fields(row, "category count");
      count(row.count);
      requireThat(allowed.includes(row.category) && !seen.has(row.category));
      seen.add(row.category);
    }
  }
  requireThat(data.devices.reduce((n, r) => n + r.count, 0) === data.kpis.pv);
  return data;
}
export function validateServer(data, now = Date.now()) {
  fields(
    data,
    "schema_version kind generated_at history_window_hours sample_interval_seconds current history",
  );
  requireThat(
    data.schema_version === 1 &&
      data.kind === "server" &&
      data.history_window_hours === 24 &&
      data.sample_interval_seconds === 60,
  );
  const generated = timestamp(data.generated_at);
  requireThat(generated <= now + 60000);
  fields(data.current, "cpu_pct memory_pct disk_pct");
  requireThat(
    Array.isArray(data.history) &&
      data.history.length > 0 &&
      data.history.length <= 1441,
  );
  let previous = generated - 86400001;
  for (const row of data.history) {
    fields(row, "at cpu_pct memory_pct disk_pct");
    const at = timestamp(row.at);
    requireThat(at > previous && at <= generated);
    previous = at;
    for (const key of ["cpu_pct", "memory_pct", "disk_pct"])
      numeric(row[key], 100, key === "cpu_pct");
  }
  requireThat(previous === generated);
  for (const key of ["cpu_pct", "memory_pct", "disk_pct"])
    requireThat(data.current[key] === data.history.at(-1)[key]);
  return data;
}
