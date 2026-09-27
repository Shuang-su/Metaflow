import { getStore, getDeployStore } from "@netlify/blobs";
import type { Context } from "@netlify/functions";
export function snapshots(context: Context) {
  return context.deploy.context === "production"
    ? getStore({ name: "mf89-public-snapshots-v1", consistency: "strong" })
    : getDeployStore({
        name: "mf89-public-snapshots-v1",
        consistency: "strong",
      });
}
