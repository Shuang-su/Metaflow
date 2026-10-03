import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";

test("bounded aggregates: period UV, weighted rate, percentile, Beijing dates and role isolation", async () => {
  const db = new PGlite();
  try {
    await db.exec(`create role anon; create role authenticated; create schema analytics;
      create table analytics.events_raw(event_name text,occurred_at timestamptz,received_at timestamptz default now(),session_id text,page_view_id text,anonymous_user_id_hash text,resource_id text,route text,context jsonb default '{}',device jsonb default '{}',properties jsonb default '{}');
      alter table analytics.events_raw enable row level security;`);
    await db.exec(
      await readFile(
        new URL(
          "../../../supabase/migrations/20260927191429_public_dashboard_v1.sql",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    await db.exec(
      "insert into dashboard_private.public_resources values ('public-a','/public-a','公开资源 A'),('empty','/empty','尚无访问'),('public-a','/another-event/public-a','同 ID 的另一个资源');",
    );
    const {
      rows: [{ start }],
    } = await db.query(
      "select (((now() at time zone 'Asia/Shanghai')::date-3)::timestamp at time zone 'Asia/Shanghai') as start",
    );
    const base = new Date(start).getTime();
    async function event(
      name,
      session,
      page,
      offset,
      visitor = "private-visitor-A",
      resource = "public-a",
      device = "mobile",
      properties = {},
    ) {
      await db.query(
        "insert into analytics.events_raw(event_name,occurred_at,session_id,page_view_id,anonymous_user_id_hash,resource_id,device,properties,route) values($1,$2,$3,$4,$5,$6,$7,$8,$9)",
        [
          name,
          new Date(base + offset),
          session,
          page,
          visitor,
          resource,
          JSON.stringify({ device_class: device }),
          JSON.stringify(properties),
          "/" + resource,
        ],
      );
    }
    await event("page_viewed", "session1", "page1", 0);
    await event("page_viewed", "session2", "page2", 86400000); // Same visitor, next Beijing day.
    await event(
      "page_viewed",
      "session3",
      "page3",
      86400001,
      "private-visitor-B",
      "private-secret-resource",
      "CUSTOM DEVICE TOKEN",
    );
    await event("page_viewed", "session4", "page4", 86400002, null);
    await event("resource_load_started", "session1", "page1", 1000);
    await event("first_frame_ready", "session1", "page1", 2000); // 1s
    await event("first_frame_ready", "session1", "page1", 3000); // Duplicate, not another success.
    await event("resource_load_started", "session2", "page2", 86400000);
    await event("first_frame_ready", "session2", "page2", 86403000); // 3s
    await event("resource_load_started", "session3", "page3", 86400000);
    await event(
      "resource_load_failed",
      "session3",
      "page3",
      86401000,
      "private-visitor-B",
      "public-a",
      "mobile",
      { error_name: "secret-password-in-name", error_message: "private-stack" },
    );
    await event("resource_load_started", "session4", "page4", 86400000);
    await event("first_frame_ready", "session4", "page4", 86399999); // Before start: invalid.
    await event("resource_load_started", "session5", null, 86400000); // No page: exclude quality denominator.
    await event("page_viewed", "outside", "outside", -40 * 86400000, "outside");
    await db.exec("set session authorization metaflow_dashboard_reader");
    const {
      rows: [{ result }],
    } = await db.query(
      "select dashboard_private.analytics_snapshot(7) as result",
    );
    assert.equal(result.kpis.pv, 4);
    assert.equal(result.kpis.uv, 2);
    assert.equal(
      result.daily.reduce((n, r) => n + r.uv, 0),
      3,
    );
    assert.equal(result.kpis.uv_missing_pv, 1);
    assert.equal(result.kpis.attempts, 4);
    assert.equal(result.kpis.successes, 2);
    assert.equal(result.kpis.success_rate, 0.5);
    assert.equal(result.kpis.p95_ms, 2900);
    assert.equal(result.kpis.p95_samples, 2);
    assert.equal(result.daily.length, 7);
    assert.equal(result.resources.find((r) => r.id === "/public-a").pv, 3);
    assert.equal(
      result.resources.find((r) => r.id === "/another-event/public-a").pv,
      0,
    );
    assert.equal(result.resources.find((r) => r.id === "/empty").p95_ms, null);
    assert.equal(
      result.resources.find((r) => r.id === "/empty").success_rate,
      null,
    );
    assert.deepEqual(result.errors, [{ category: "other", count: 1 }]);
    assert.equal(result.devices.find((r) => r.category === "unknown").count, 1);
    assert(
      !JSON.stringify(result).match(
        /private-|session1|page1|CUSTOM DEVICE|secret-password/,
      ),
    );
    assert.equal(new Date(result.period.start).getUTCHours(), 16);
    await assert.rejects(
      db.query("select dashboard_private.analytics_snapshot(31)"),
      /unsupported period/,
    );
    await assert.rejects(
      db.query("select * from analytics.events_raw"),
      /permission denied/,
    );
    await assert.rejects(
      db.query("select * from dashboard_private.public_resources"),
      /permission denied/,
    );
    await assert.rejects(
      db.exec("set role metaflow_dashboard_owner"),
      /permission denied/,
    );
    await db.exec("set session authorization postgres");
    await db.exec("reset role");
    await db.exec("set session authorization anon");
    await assert.rejects(
      db.query("select dashboard_private.analytics_snapshot(7)"),
      /permission denied/,
    );
    await db.exec("set session authorization postgres");
    await db.exec("reset role");
    await db.exec("truncate analytics.events_raw");
    await db.exec("set session authorization metaflow_dashboard_reader");
    const empty = (
      await db.query(
        "select dashboard_private.analytics_snapshot(30) as result",
      )
    ).rows[0].result;
    assert.equal(empty.kpis.pv, 0);
    assert.equal(empty.kpis.uv, 0);
    assert.equal(empty.kpis.p95_ms, null);
    assert.equal(empty.kpis.success_rate, null);
    assert.equal(empty.daily.length, 30);
    assert(empty.daily.every((r) => r.pv === 0 && r.uv === 0));
  } finally {
    await db.close();
  }
});
