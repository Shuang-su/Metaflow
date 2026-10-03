import type { Config, Context } from "@netlify/functions";
import { readPublic } from "../lib/snapshots.mjs";
import { snapshots } from "../lib/store.mts";
export default (request: Request, context: Context) =>
  readPublic(request, snapshots(context));
export const config: Config = {
  path: [
    "/api/public/v1/analytics/7d.json",
    "/api/public/v1/analytics/30d.json",
    "/api/public/v1/server.json",
  ],
};
