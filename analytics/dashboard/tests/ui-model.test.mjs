import test from "node:test";
import assert from "node:assert/strict";
import {
  freshness,
  sortedResources,
  validateSnapshot,
  number,
  duration,
} from "../src/model.mjs";
test("fresh, failed, stale, missing and future states stay distinguishable", () => {
  const now = Date.parse("2026-09-28T03:00:00Z");
  const data = { generated_at: "2026-09-28T02:59:00Z" };
  assert.equal(freshness(null, false, 1800, now).text, "数据准备中");
  assert.equal(freshness(null, true, 1800, now).text, "暂时无法获取数据");
  assert.equal(freshness(data, false, 180, now).tone, "good");
  assert.match(freshness(data, true, 180, now).text, /保留最近数据/);
  assert.equal(freshness(data, false, 30, now).tone, "warning");
  assert.equal(
    freshness({ generated_at: "2026-09-29T03:00:00Z" }, false, 1800, now).tone,
    "warning",
  );
  assert.equal(number(0), "0");
  assert.equal(duration(null), "—");
});
test("search and sort keep null samples last in either direction without mutating rows", () => {
  const rows = [
    { id: "a", title: "深圳", p95_ms: null },
    { id: "b", title: "校园", p95_ms: 400 },
    { id: "c", title: "校园湖", p95_ms: 100 },
  ];
  assert.deepEqual(
    sortedResources(rows, "校园", { key: "p95_ms", direction: "asc" }).map(
      (r) => r.id,
    ),
    ["c", "b"],
  );
  assert.deepEqual(
    sortedResources(rows, "", { key: "p95_ms", direction: "desc" }).map(
      (r) => r.id,
    ),
    ["b", "c", "a"],
  );
  assert.deepEqual(
    rows.map((r) => r.id),
    ["a", "b", "c"],
  );
});
test("a wrong period response cannot populate another selected range", () => {
  assert.throws(() =>
    validateSnapshot(
      {
        schema_version: 1,
        kind: "analytics",
        generated_at: "2026-09-28T00:00:00Z",
        period: { days: 30 },
        kpis: {},
        daily: [],
        resources: [],
        devices: [],
        errors: [],
      },
      "analytics",
      7,
    ),
  );
});
