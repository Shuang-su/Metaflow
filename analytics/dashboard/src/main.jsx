import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  LABELS,
  number,
  percent,
  duration,
  time,
  freshness,
  sortedResources,
  validateSnapshot,
} from "./model.mjs";
import "./style.css";

function Icon({ kind = "chart" }) {
  const paths = {
    chart: (
      <>
        <path d="M4 20V12M10 20V7M16 20V3" />
      </>
    ),
    people: (
      <>
        <circle cx="8" cy="7" r="3" />
        <path d="M2 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6M18 21v-3a5 5 0 0 0-2-4" />
      </>
    ),
    shield: (
      <>
        <path d="m11 2 8 3v6c0 5-8 10-8 10S3 16 3 11V5Z" />
        <path d="m7 11 3 3 5-6" />
      </>
    ),
    clock: (
      <>
        <circle cx="11" cy="11" r="9" />
        <path d="M11 5v7l4 2" />
      </>
    ),
    table: (
      <>
        <path d="M3 4h16v16H3zM3 9h16M8 9v11" />
      </>
    ),
    server: (
      <>
        <rect x="3" y="3" width="16" height="7" rx="2" />
        <rect x="3" y="13" width="16" height="7" rx="2" />
        <path d="M6 6h2M6 16h2" />
      </>
    ),
  };
  return (
    <svg
      viewBox="0 0 22 24"
      className="icon"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[kind] ?? paths.chart}
    </svg>
  );
}
function useSnapshot(kind, days) {
  const [cache, setCache] = useState({});
  const [errors, setErrors] = useState({});
  const key = kind === "analytics" ? `${days}d` : "server";
  useEffect(() => {
    let active = true;
    let controller;
    async function refresh() {
      controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 12000);
      try {
        const path = kind === "analytics" ? `analytics/${key}` : "server";
        const res = await fetch(`/api/public/v1/${path}.json`, {
          signal: controller.signal,
          cache: "no-cache",
        });
        if (res.status === 404) {
          if (active) setErrors((v) => ({ ...v, [key]: "missing" }));
          return;
        }
        if (!res.ok) throw Error("unavailable");
        const data = validateSnapshot(await res.json(), kind, days);
        if (active) {
          setCache((v) => ({ ...v, [key]: data }));
          setErrors((v) => ({ ...v, [key]: false }));
        }
      } catch (e) {
        if (active) setErrors((v) => ({ ...v, [key]: true }));
      } finally {
        clearTimeout(timer);
      }
    }
    refresh();
    const timer = setInterval(refresh, 60000);
    return () => {
      active = false;
      clearInterval(timer);
      controller?.abort();
    };
  }, [kind, days, key]);
  return [cache[key] ?? null, errors[key] ?? false];
}
function Badge({ data, error, seconds, now }) {
  const state = freshness(data, error, seconds, now);
  return (
    <span role="status" className={`badge ${state.tone}`}>
      <i />
      {state.text}
    </span>
  );
}
function Empty({ text = "数据准备中", small = false }) {
  return (
    <div className={`empty ${small ? "small" : ""}`}>
      <Icon kind="chart" />
      <span>{text}</span>
    </div>
  );
}
function LineChart({
  rows,
  series,
  maximum,
  compact = false,
  labelFormat = (x) => x.slice(5),
  emptyText = "暂无样本",
}) {
  const [hover, setHover] = useState(null);
  if (!rows?.length || !rows.some((r) => series.some((s) => r[s.key] != null)))
    return <Empty text={emptyText} small={compact} />;
  const w = 800,
    h = compact ? 145 : 238,
    left = 40,
    right = 12,
    top = 16,
    bottom = 30;
  const max =
    maximum ??
    Math.max(1, ...rows.flatMap((r) => series.map((s) => r[s.key] ?? 0))) *
      1.15;
  const x = (i) =>
    left +
    (w - left - right) * (rows.length === 1 ? 0.5 : i / (rows.length - 1));
  const y = (v) => h - bottom - ((h - top - bottom) * v) / max;
  const path = (s) =>
    rows
      .map((r, i) => (r[s.key] == null ? null : { i, v: r[s.key] }))
      .reduce(
        (a, p, i, all) =>
          p
            ? [
                ...a,
                `${i === 0 || all[i - 1] === null || (rows[i].at && Date.parse(rows[i].at) - Date.parse(rows[i - 1].at) > 180000) ? "M" : "L"}${x(p.i)},${y(p.v)}`,
              ]
            : a,
        [],
      )
      .join(" ");
  const indices = [
    0,
    Math.floor((rows.length - 1) / 2),
    rows.length - 1,
  ].filter((v, i, a) => a.indexOf(v) === i);
  const tooltip = hover == null ? null : rows[hover];
  return (
    <div
      className={`chart ${compact ? "compact" : ""}`}
      onMouseLeave={() => setHover(null)}
    >
      <svg
        viewBox={`0 0 ${w} ${h}`}
        role="img"
        aria-label={series.map((s) => s.label).join("、") + "趋势图"}
        onMouseMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHover(
            Math.max(
              0,
              Math.min(
                rows.length - 1,
                Math.round(
                  ((((e.clientX - rect.left) / rect.width) * w - left) /
                    (w - left - right)) *
                    (rows.length - 1),
                ),
              ),
            ),
          );
        }}
      >
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <g key={f}>
            <line
              x1={left}
              x2={w - right}
              y1={y(max * f)}
              y2={y(max * f)}
              className="gridline"
            />
            <text x={left - 9} y={y(max * f) + 4} textAnchor="end">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        {indices.map((i) => (
          <text key={i} x={x(i)} y={h - 7} textAnchor="middle">
            {labelFormat(rows[i].date ?? rows[i].at)}
          </text>
        ))}
        {series.map((s) => (
          <g key={s.key}>
            <path
              d={path(s)}
              stroke={s.color}
              fill="none"
              strokeWidth={compact ? 2.5 : 3}
              vectorEffect="non-scaling-stroke"
            />
            {rows.length === 1 && rows[0][s.key] != null && (
              <circle cx={x(0)} cy={y(rows[0][s.key])} r="4" fill={s.color} />
            )}
          </g>
        ))}
        {tooltip && (
          <line
            x1={x(hover)}
            x2={x(hover)}
            y1={top}
            y2={h - bottom}
            className="cursorline"
          />
        )}
      </svg>
      {tooltip && (
        <div className="chart-tooltip">
          {labelFormat(tooltip.date ?? tooltip.at)} ·{" "}
          {series
            .map(
              (s) =>
                `${s.label} ${tooltip[s.key] == null ? "无样本" : Math.round(tooltip[s.key] * 10) / 10}`,
            )
            .join(" / ")}
        </div>
      )}
    </div>
  );
}
function Breakdown({ title, rows, emptyText }) {
  const total = (rows ?? []).reduce((n, r) => n + r.count, 0);
  return (
    <section className="card breakdown">
      <h2>
        <Icon />
        {title}
        <span className="subtle">{total ? `${number(total)} 次` : ""}</span>
      </h2>
      {!rows?.length ? (
        <Empty small text={emptyText} />
      ) : (
        rows.map((r) => (
          <div className="breakdown-row" key={r.category}>
            <div>
              <span>{LABELS[r.category]}</span>
              <span>
                {number(r.count)}{" "}
                <small>{percent(total ? r.count / total : 0)}</small>
              </span>
            </div>
            <div className="bar-track">
              <div
                className="bar"
                style={{ width: `${total ? (r.count / total) * 100 : 0}%` }}
              />
            </div>
          </div>
        ))
      )}
    </section>
  );
}
function ResourceTable({ rows, ready }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState({ key: "pv", direction: "desc" });
  const filtered = useMemo(
    () => sortedResources(rows ?? [], search, sort),
    [rows, search, sort],
  );
  const columns = [
    ["title", "资源"],
    ["pv", "访问量"],
    ["uv", "匿名访客"],
    ["success_rate", "首帧成功率"],
    ["p95_ms", "P95 首帧耗时"],
  ];
  return (
    <section className="card resource-card">
      <div className="section-head">
        <h2>
          <Icon kind="table" />
          资源表现{" "}
          <span className="subtle">{ready ? `${filtered.length} 项` : ""}</span>
        </h2>
        <label className="search">
          <span aria-hidden="true">⌕</span>
          <input
            aria-label="搜索资源"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜索资源名称或 ID…"
          />
          {search && (
            <button onClick={() => setSearch("")} aria-label="清空搜索">
              ×
            </button>
          )}
        </label>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              {columns.map(([key, label]) => (
                <th
                  key={key}
                  aria-sort={
                    sort.key === key
                      ? sort.direction === "asc"
                        ? "ascending"
                        : "descending"
                      : "none"
                  }
                >
                  <button
                    onClick={() =>
                      setSort({
                        key,
                        direction:
                          sort.key === key && sort.direction === "desc"
                            ? "asc"
                            : "desc",
                      })
                    }
                  >
                    {label}
                    <span>
                      {sort.key === key
                        ? sort.direction === "asc"
                          ? " ↑"
                          : " ↓"
                        : " ↕"}
                    </span>
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.title}</strong>
                  <small>{r.id}</small>
                </td>
                <td>{number(r.pv)}</td>
                <td>{number(r.uv)}</td>
                <td>
                  {r.success_rate == null ? (
                    <span className="subtle">无样本</span>
                  ) : (
                    <>
                      <span
                        className={
                          r.success_rate < 0.9
                            ? "quality-warning"
                            : "quality-good"
                        }
                      >
                        {percent(r.success_rate)}
                      </span>
                      <small>
                        {number(r.successes)} / {number(r.attempts)} 次
                      </small>
                    </>
                  )}
                </td>
                <td>
                  {r.p95_ms == null ? (
                    <span className="subtle">无样本</span>
                  ) : (
                    <>
                      {duration(r.p95_ms)}
                      <small>{number(r.p95_samples)} 个样本</small>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!filtered.length && (
        <Empty
          text={
            search ? "没有匹配的资源" : ready ? "暂无公开资源" : "数据准备中"
          }
        />
      )}
      <p className="card-note">
        仅显示已公开的资源。访客按资源分别去重，不可相加作为总访客数。
      </p>
    </section>
  );
}
function App() {
  const [days, setDays] = useState(7);
  const [now, setNow] = useState(Date.now());
  const [analytics, aError] = useSnapshot("analytics", days);
  const [server, sError] = useSnapshot("server");
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(id);
  }, []);
  const k = analytics?.kpis;
  const cards = [
    [
      "访问量 PV",
      number(k?.pv),
      analytics ? "页面访问次数" : "等待数据",
      "chart",
    ],
    [
      "匿名访客 UV",
      number(k?.uv),
      analytics ? `整个 ${days} 天范围去重` : "等待数据",
      "people",
    ],
    [
      "首帧成功率",
      percent(k?.success_rate),
      k ? `${number(k.successes)} / ${number(k.attempts)} 次加载` : "等待数据",
      "shield",
    ],
    [
      "P95 首帧耗时",
      duration(k?.p95_ms),
      k ? `${number(k.p95_samples)} 个有效样本` : "等待数据",
      "clock",
    ],
  ];
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <a className="brand" href="https://metaflow.shuang-su.com">
            <span className="logo">M</span>
            <strong>Metaflow</strong>
            <span>数据看板</span>
          </a>
          <a
            className="status-link"
            href="https://status.metaflow.shuang-su.com"
            target="_blank"
            rel="noreferrer"
          >
            服务状态 ↗
          </a>
        </div>
      </header>
      <main>
        <div className="page-heading">
          <div>
            <p className="eyebrow">METAFLOW ANALYTICS</p>
            <h1>看见每一次探索</h1>
            <p>访问表现、加载质量与服务器状态</p>
          </div>
          <div className="heading-actions">
            <div className="freshness">
              <Badge data={analytics} error={aError} seconds={1800} now={now} />
              <small>汇总更新：{time(analytics?.generated_at)}</small>
            </div>
            <div
              className="period-switch"
              role="group"
              aria-label="统计时间范围"
            >
              {[7, 30].map((n) => (
                <button
                  key={n}
                  aria-pressed={days === n}
                  className={days === n ? "active" : ""}
                  onClick={() => setDays(n)}
                >
                  近 {n} 天
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="scope-line">
          {analytics
            ? `${time(analytics.period.start)} — ${time(analytics.period.end)} · 北京时间 · 今日未结束`
            : "北京时间 · 业务汇总每 15 分钟更新"}
          <span>公开汇总 · 无需登录</span>
        </div>
        {aError && (aError !== "missing" || analytics) && (
          <p className="notice" role="alert">
            暂时无法连接业务数据接口。
            {analytics
              ? "正在显示上次有效数据。"
              : "请稍后重试，服务状态页提供独立监测。"}
          </p>
        )}
        <div className="kpi-grid">
          {cards.map(([label, value, note, icon]) => (
            <section className="card kpi" key={label}>
              <Icon kind={icon} />
              <div>
                <h2>{label}</h2>
                <div className="kpi-value">{value}</div>
                <p>
                  {note}
                  {k &&
                  ((icon === "shield" && k.attempts === 0) ||
                    (icon === "clock" && k.p95_samples === 0))
                    ? " · 无样本"
                    : ""}
                </p>
              </div>
            </section>
          ))}
        </div>
        <div className="analysis-grid">
          <section className="card trend-card">
            <div className="section-head">
              <h2>
                <Icon />
                访问趋势
              </h2>
              <div className="legend">
                <span>
                  <i />
                  访问量 PV
                </span>
                <span>
                  <i className="light" />
                  匿名访客 UV
                </span>
              </div>
            </div>
            <LineChart
              rows={analytics?.daily}
              series={[
                { key: "pv", label: "PV", color: "#2877e7" },
                { key: "uv", label: "UV", color: "#8ab7f6" },
              ]}
              emptyText={analytics ? "暂无访问样本" : "数据准备中"}
            />
            <p className="card-note">
              每天 UV 独立去重；上方总 UV 按整个范围去重。
            </p>
          </section>
          <Breakdown
            title="设备分布"
            rows={analytics?.devices}
            emptyText={analytics ? "暂无访问样本" : "数据准备中"}
          />
        </div>
        <ResourceTable rows={analytics?.resources} ready={!!analytics} />
        <div className="details-grid">
          <Breakdown
            title="加载错误类别"
            rows={analytics?.errors}
            emptyText={
              analytics ? "该时间范围内没有加载失败事件" : "数据准备中"
            }
          />
          <section className="card methodology">
            <h2>
              <Icon kind="shield" />
              如何理解这些数字
            </h2>
            <p>
              首帧成功率 = 成功呈现首帧的加载尝试 ÷
              全部加载尝试。尚未完成的加载计入分母。
            </p>
            <p>
              P95 表示 95%
              的有效加载在这个时间内完成首帧。无有效样本时显示“—”，不等于耗时为零。
            </p>
            <p>
              匿名访客依据匿名标识去重，同一人在不同设备或清除存储后可能重复计数。
              {k?.uv_missing_pv > 0
                ? `有 ${number(k.uv_missing_pv)} 次访问缺少匿名标识，未计入 UV。`
                : ""}
            </p>
            <small>
              数据截止：{time(analytics?.source_cutoff_at)} · 最近事件：
              {time(analytics?.latest_event_at)}
            </small>
          </section>
        </div>
        <section className="card server-section">
          <div className="section-head">
            <div>
              <h2>
                <Icon kind="server" />
                服务器概况
              </h2>
              <p className="subtle">最近 24 小时 · 每分钟采样</p>
            </div>
            <div className="freshness">
              <Badge data={server} error={sError} seconds={180} now={now} />
              <small>最近采样：{time(server?.generated_at)}</small>
            </div>
          </div>
          {sError && (sError !== "missing" || server) && (
            <p className="notice">
              暂时无法获取服务器状态。
              {server ? "以下保留最近有效采样。" : "请稍后重试。"}
            </p>
          )}
          <div className="server-grid">
            {[
              ["cpu_pct", "CPU 使用率"],
              ["memory_pct", "内存使用率"],
              ["disk_pct", "磁盘使用率"],
            ].map(([key, label]) => (
              <div className="server-metric" key={key}>
                <h3>{label}</h3>
                <strong>
                  {server?.current[key] == null
                    ? "—"
                    : `${server.current[key].toFixed(1)}%`}
                </strong>
                <LineChart
                  rows={server?.history}
                  series={[{ key, label, color: "#2877e7" }]}
                  maximum={100}
                  compact
                  labelFormat={(v) => time(v).slice(-5)}
                  emptyText="等待采样"
                />
              </div>
            ))}
          </div>
          <p className="card-note">
            仅展示资源使用率。服务器负载与公众入口可用性分别监测；故障记录请查看服务状态页。
          </p>
        </section>
      </main>
      <footer>
        <span>Metaflow · 让探索更简单</span>
        <span>
          北京时间 / UTC+8 ·{" "}
          <a href="https://status.metaflow.shuang-su.com">独立服务状态 ↗</a>
        </span>
      </footer>
    </>
  );
}
createRoot(document.getElementById("root")).render(<App />);
