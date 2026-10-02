/** Native stationary validation of same-X/Z overlap leads; never a cross-level shortcut. */
import { readFileSync } from "node:fs";
import {
  collisionSourceFile,
  sha,
} from "../../mf79-viewer-trial/scripts/source";
import { NativeDriver, stand } from "../../mf79-viewer-trial/src/native-motion";
import {
  createOfflineResources,
  offlineResourceOptions,
} from "../src/offline-resources";
const resources = createOfflineResources(offlineResourceOptions()),
  source = resources.resolveOutput("dayun/collision-source.json");
const leadBytes = readFileSync(
    resources.resolveOutput("dayun/overlapping-support-leads.json"),
  ),
  leads = JSON.parse(leadBytes.toString());
const row = leads.bestTiles.find((t: any) => t.tile === "x16_z8"),
  pair = row.leads[0];
const bounds = {
  min: { x: -690.56, y: -8.96, z: -321.92 },
  max: { x: -649.6, y: 4.16, z: -280.96 },
};
const loaded = await collisionSourceFile(source, bounds);
try {
  const endpoints: any[] = [];
  for (const [name, p] of [
    ["lower", pair.lowerSupport],
    ["upper", pair.upperSupport],
  ]) {
    const eye = stand(loaded.space.collision, p);
    if (!eye) {
      endpoints.push({
        name,
        requestedSupport: p,
        status: "native-capsule-rejected",
      });
      continue;
    }
    const driver = new NativeDriver(loaded.space.collision, eye),
      trace = [];
    for (let i = 0; i < 30; i++) trace.push(driver.step(0, 0));
    const state = driver.state,
      known = loaded.space.known(
        state.position.x,
        state.position.y,
        state.position.z,
      );
    endpoints.push({
      name,
      requestedSupport: p,
      state,
      known,
      trace,
      status:
        known && state.grounded && state.collision === "active"
          ? "native-grounded-stand"
          : "native-stand-unconfirmed",
      reviewBounds: {
        min: { x: p.x - 2, y: p.y - 0.5, z: p.z - 2 },
        max: { x: p.x + 2, y: p.y + 2, z: p.z + 2 },
      },
    });
  }
  resources.writeJsonAtomic("dayun/overlap-native-x16-z8.json", {
    sourceHash: loaded.sourceHash,
    loadedTileIds: loaded.loadedTileIds,
    leadHash: sha(leadBytes),
    bounds,
    endpoints,
    connectionConfirmed: false,
  });
  if (endpoints.every((e) => e.status === "native-grounded-stand")) {
    resources.writeJsonAtomic(
      "dayun/jobs/x16-z8-overlap-recast-v1.json",
      {
        id: "x16-z8-overlap-recast-v1",
        analysisOnly: true,
        collisionSourceFile: source,
        bounds,
        start: endpoints[0].state.position,
      },
      { replace: false },
    );
    resources.writeJsonAtomic(
      "dayun/jobs/x16-z8-overlap-pairs-v1.json",
      {
        pairs: [
          {
            id: "same-xz-overlap",
            from: endpoints[0].state.position,
            to: endpoints[1].state.position,
            evidence: "overlap-native-x16-z8.json",
          },
        ],
      },
      { replace: false },
    );
  }
  console.log(
    JSON.stringify({
      sourceHash: loaded.sourceHash,
      endpoints: endpoints.map((e) => ({ ...e, trace: undefined })),
    }),
  );
} finally {
  loaded.destroy();
}
