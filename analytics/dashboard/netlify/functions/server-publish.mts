import type { Config, Context } from "@netlify/functions";
import { receiveServer } from "../lib/snapshots.mjs";
import { snapshots } from "../lib/store.mts";
export default (request: Request, context: Context) =>
  receiveServer(
    request,
    snapshots(context),
    Netlify.env.get("MF89_SERVER_PUBLISH_SECRET"),
  );
export const config: Config = { path: "/api/internal/v1/server-snapshot" };
