import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import catalog from "../netlify/lib/public-resources.json" with { type: "json" };
import {
  readPublic,
  receiveServer,
  refreshAnalytics,
  saveSnapshot,
} from "../netlify/lib/snapshots.mjs";
import { validateAnalytics, validateServer } from "../netlify/lib/validate.mjs";

const now = Date.parse("2026-09-28T02:00:00Z"),
  secret = "local-test-only-do-not-use";
function server(at = now) {
  const current = { cpu_pct: 12, memory_pct: 40, disk_pct: 30 };
  return {
    schema_version: 1,
    kind: "server",
    generated_at: new Date(at).toISOString(),
    history_window_hours: 24,
    sample_interval_seconds: 60,
    current,
    history: [{ at: new Date(at).toISOString(), ...current }],
  };
}
function analytics(days) {
  const start = Date.parse("2026-09-27T16:00:00Z") - (days - 1) * 86400000;
  const stats = {
    pv: 0,
    uv: 0,
    attempts: 0,
    successes: 0,
    success_rate: null,
    p95_ms: null,
    p95_samples: 0,
  };
  return {
    schema_version: 1,
    kind: "analytics",
    timezone: "Asia/Shanghai",
    period: {
      days,
      start: new Date(start).toISOString(),
      end: new Date(now).toISOString(),
    },
    source_cutoff_at: new Date(now).toISOString(),
    generated_at: new Date(now).toISOString(),
    latest_event_at: null,
    kpis: { ...stats, uv_missing_pv: 0 },
    daily: Array.from({ length: days }, (_, i) => ({
      date: new Date(start + 28800000 + i * 86400000)
        .toISOString()
        .slice(0, 10),
      pv: 0,
      uv: 0,
    })),
    resources: Object.entries(catalog).map(([id, title]) => ({
      id,
      title,
      ...stats,
    })),
    devices: [],
    errors: [],
  };
}
class MemoryStore {
  values = new Map();
  version = 0;
  writes = 0;
  conflict = false;
  async get(key) {
    return this.values.get(key)?.data ?? null;
  }
  async getWithMetadata(key) {
    return structuredClone(this.values.get(key) ?? null);
  }
  async setJSON(key, data, condition) {
    const old = this.values.get(key);
    this.writes++;
    if (
      this.conflict ||
      (condition.onlyIfNew && old) ||
      (condition.onlyIfMatch && condition.onlyIfMatch !== old?.etag)
    )
      return { modified: false };
    this.values.set(key, {
      data: structuredClone(data),
      etag: String(++this.version),
    });
    return { modified: true };
  }
}
function upload(data, { at = now, key = secret } = {}) {
  const body = JSON.stringify(data),
    stamp = String(Math.floor(at / 1000));
  return new Request(
    "https://dashboard.example/api/internal/v1/server-snapshot",
    {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "X-Metaflow-Time": stamp,
        "X-Metaflow-Signature": createHmac("sha256", key)
          .update(stamp + "\n" + body)
          .digest("hex"),
      },
    },
  );
}

test("hosting validators reject private fields, invalid arithmetic and resource relabeling", () => {
  validateServer(server(), now);
  validateAnalytics(analytics(7), 7, catalog, now);
  for (const mutate of [
    (d) => (d.password = "private"),
    (d) => (d.history[0].hostname = "private"),
    (d) => (d.current.cpu_pct = Infinity),
    (d) => (d.history[0].at = "2026-09-20T02:00:00Z"),
  ]) {
    const d = server();
    mutate(d);
    assert.throws(() => validateServer(d, now));
  }
  for (const mutate of [
    (d) => (d.kpis.session_id = "private"),
    (d) => (d.kpis.success_rate = 0),
    (d) => (d.resources[0].title = "unknown"),
    (d) => d.daily.pop(),
  ]) {
    const d = analytics(7);
    mutate(d);
    assert.throws(() => validateAnalytics(d, 7, catalog, now));
  }
});
test("server publishing is scoped, authenticated, fresh and idempotent", async () => {
  const store = new MemoryStore();
  assert.equal(
    (
      await receiveServer(
        upload(server(), { key: "wrong" }),
        store,
        secret,
        now,
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await receiveServer(
        upload(server(), { at: now - 120000 }),
        store,
        secret,
        now,
      )
    ).status,
    401,
  );
  assert.equal(
    (await receiveServer(upload(analytics(7)), store, secret, now)).status,
    400,
  );
  assert.equal(
    (await receiveServer(upload(server(now - 181000)), store, secret, now))
      .status,
    400,
  );
  assert.equal(store.writes, 0);
  assert.equal(
    (await receiveServer(upload(server()), store, secret, now)).status,
    200,
  );
  assert.equal(
    (await receiveServer(upload(server()), store, secret, now)).status,
    200,
  );
  assert.equal(store.writes, 1);
  assert.equal(
    (await receiveServer(upload(server(now - 1000)), store, secret, now))
      .status,
    409,
  );
  assert.deepEqual([...store.values.keys()], ["server"]);
});
test("concurrent reads use snapshots only; management routes and write methods are rejected", async () => {
  const store = new MemoryStore();
  await saveSnapshot(store, "server", server());
  const writes = store.writes;
  const results = await Promise.all(
    Array.from({ length: 48 }, () =>
      readPublic(
        new Request("https://dashboard.example/api/public/v1/server.json"),
        store,
      ),
    ),
  );
  assert.ok(results.every((r) => r.status === 200));
  assert.equal(store.writes, writes);
  assert.ok(
    results[0].headers.get("Netlify-CDN-Cache-Control").includes("s-maxage=30"),
  );
  assert.deepEqual(await results[0].json(), server());
  assert.equal(
    (
      await readPublic(
        new Request("https://dashboard.example/api/session"),
        store,
      )
    ).status,
    404,
  );
  assert.equal(
    (
      await readPublic(
        new Request("https://dashboard.example/api/public/v1/server.json", {
          method: "POST",
        }),
        store,
      )
    ).status,
    405,
  );
  assert.equal(
    (
      await readPublic(
        new Request(
          "https://dashboard.example/api/public/v1/analytics/7d.json",
        ),
        store,
      )
    ).status,
    404,
  );
});
test("refresh publishes both periods atomically and preserves good data on query, validation or CAS failure", async () => {
  const store = new MemoryStore(),
    data = { "7d": analytics(7), "30d": analytics(30) };
  await refreshAnalytics(async () => data, store, catalog, now);
  const previous = await store.get("analytics");
  await assert.rejects(
    refreshAnalytics(
      async () => {
        throw Error("unavailable");
      },
      store,
      catalog,
      now,
    ),
  );
  const bad = structuredClone(data);
  bad["30d"].resources[0].visitor = "private";
  await assert.rejects(refreshAnalytics(async () => bad, store, catalog, now));
  assert.deepEqual(await store.get("analytics"), previous);
  await saveSnapshot(store, "server", server());
  store.conflict = true;
  await assert.rejects(
    saveSnapshot(store, "server", server(now + 1000)),
    /write_conflict/,
  );
  assert.deepEqual((await store.get("server")).current, server());
});
