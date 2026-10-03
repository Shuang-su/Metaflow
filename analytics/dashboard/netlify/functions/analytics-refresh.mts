import type { Config, Context } from "@netlify/functions";
import postgres from "postgres";
import catalog from "../lib/public-resources.json" with { type: "json" };
import { refreshAnalytics } from "../lib/snapshots.mjs";
import { snapshots } from "../lib/store.mts";
import { supabaseCA } from "../lib/supabase-ca.mjs";
export default async (_request: Request, context: Context) => {
  if (context.deploy.context !== "production") {
    console.info("analytics_refresh_skipped_nonproduction");
    return;
  }
  const url = Netlify.env.get("MF89_ANALYTICS_DATABASE_URL");
  if (!url) throw new Error("analytics_connection_not_configured");
  const sql = postgres(url, {
    ssl: {
      ca: supabaseCA,
      rejectUnauthorized: true,
      servername: new URL(url).hostname,
    },
    max: 1,
    prepare: false,
    connect_timeout: 8,
    idle_timeout: 1,
    connection: {
      application_name: "metaflow-dashboard-scheduled",
      statement_timeout: 20000,
    },
  });
  try {
    await refreshAnalytics(
      async () => {
        const rows =
          await sql`select jsonb_build_object('7d',dashboard_private.analytics_snapshot(7),'30d',dashboard_private.analytics_snapshot(30)) as snapshots`;
        return rows[0].snapshots;
      },
      snapshots(context),
      catalog,
    );
    console.info("analytics_snapshot_published");
  } catch (error) {
    const code = (error as { code?: string }).code;
    const allowed = new Set([
      "SELF_SIGNED_CERT_IN_CHAIN",
      "UNABLE_TO_VERIFY_LEAF_SIGNATURE",
      "CERT_HAS_EXPIRED",
      "ERR_TLS_CERT_ALTNAME_INVALID",
      "CONNECT_TIMEOUT",
      "ECONNREFUSED",
      "28P01",
      "42501",
      "57014",
    ]);
    console.error(allowed.has(code ?? "") ? code : "analytics_refresh_failed");
    throw new Error("analytics_refresh_failed_previous_snapshot_retained");
  } finally {
    await sql.end({ timeout: 1 });
  }
};
// Netlify scheduled functions cannot be invoked through the public website.
export const config: Config = { schedule: "*/15 * * * *" };
