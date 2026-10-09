/** Bounded analysis only. Complete Detour paths still need unchanged native walking. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { init, importNavMesh } from "../../mf79-viewer-trial/src/recast-runtime";
import {
  collisionSourceFile,
  sha,
} from "../../mf79-viewer-trial/scripts/source";
import { NativePlanner } from "../../mf79-viewer-trial/src/planner";
import {
  NativeDriver,
  BODY,
  stand,
} from "../../mf79-viewer-trial/src/native-motion";
import { replayNativePolyline } from "../src/dayun-native-proof";
import {
  createOfflineResources,
  offlineResourceOptions,
  MiB,
} from "../src/offline-resources";
const args = process.argv.slice(2);
const option = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`);
  return args[i + 1];
};
const manifestFile = option("--manifest"),
  pairsFile = option("--pairs");
const m = JSON.parse(readFileSync(manifestFile, "utf8"));
if (
  m.status !== "analysis-complete" ||
  m.usage !== "offline-native-verification-only"
)
  throw Error("Requires the explicitly bounded analysis-only navigation asset");
const pairsBytes = readFileSync(pairsFile),
  pairs = JSON.parse(pairsBytes.toString());
const bytes = readFileSync(resolve(dirname(manifestFile), "nav.bin"));
if (sha(bytes) !== m.navHash) throw Error("Navigation hash mismatch");
const loaded = await collisionSourceFile(
  option("--source"),
  m.key.geometryScope,
);
if (loaded.sourceHash !== m.sourceHash)
  throw Error("Collision fingerprint mismatch");
const resources = createOfflineResources({
  ...offlineResourceOptions(args),
  taskOutputBytes: 64 * MiB,
});
await init();
const nav = importNavMesh(bytes).navMesh,
  planner = new NativePlanner(nav, loaded.space, m.fingerprint);
const settle = (eye: { x: number; y: number; z: number }) => {
  const standing = stand(loaded.space.collision, {
    ...eye,
    y: eye.y - BODY.eye - BODY.hover,
  });
  if (!standing) return null;
  const d = new NativeDriver(loaded.space.collision, standing);
  for (let tick = 0; tick < 30; tick++) d.step(0, 0);
  return d.state.grounded && d.state.collision === "active" ? d.state : null;
};
try {
  const proofs = [];
  for (const pair of pairs.pairs) {
    const from = settle(pair.from),
      to = settle(pair.to);
    if (!from || !to) {
      proofs.push({
        ...pair,
        reason: "native-endpoint-rejected",
        fromState: from,
        toState: to,
      });
      continue;
    }
    const a = planner.associate(from),
      b = planner.associate(to);
    if (!a || !b) {
      proofs.push({
        ...pair,
        reason: "native-surface-association-rejected",
        fromState: from,
        toState: to,
        associations: [a, b],
      });
      continue;
    }
    const forwardPath = planner.path(a, b),
      reversePath = planner.path(b, a);
    const prove = (
      r: typeof forwardPath,
      begin: typeof from,
      end: typeof from,
    ) => {
      if (r.reason !== "complete")
        return { ok: false, reason: r.reason, polys: r.polys };
      const points = [
        begin.position,
        ...r.points.map((p) => ({ ...p, y: p.y + BODY.eye + BODY.hover })),
        end.position,
      ];
      const result = replayNativePolyline(loaded.space.collision, points, (p) =>
        loaded.space.known(p.x, p.y, p.z),
      );
      return { ...result, points, polys: r.polys };
    };
    const forward = prove(forwardPath, from, to),
      reverse = prove(reversePath, to, from);
    // Directed Detour searches may use different middle corridors. Certify an
    // actual two-way corridor separately before deriving any contact catalog.
    const returnAlongForward =
      forward.ok && "points" in forward
        ? replayNativePolyline(
            loaded.space.collision,
            [...forward.points].reverse(),
            (p) => loaded.space.known(p.x, p.y, p.z),
          )
        : undefined;
    const returnAlongReverse =
      reverse.ok && "points" in reverse
        ? replayNativePolyline(
            loaded.space.collision,
            [...reverse.points].reverse(),
            (p) => loaded.space.known(p.x, p.y, p.z),
          )
        : undefined;
    const proof = {
      ...pair,
      fromState: from,
      toState: to,
      associations: [a, b],
      forward,
      reverse,
      returnAlongForward,
      returnAlongReverse,
      reason:
        forward.ok && reverse.ok
          ? "native-bidirectional-height-connection"
          : "candidate-not-yet-verified",
    };
    proofs.push(proof);
    console.log(
      JSON.stringify({
        id: pair.id,
        forward: forward.reason,
        reverse: reverse.reason,
      }),
    );
    resources.assertCapacity(8 * MiB, "native Recast evidence");
  }
  const result = {
    version: 1,
    usage: "analysis-only",
    navigationFingerprint: m.fingerprint,
    sourceHash: loaded.sourceHash,
    loadedTileIds: loaded.loadedTileIds,
    scope: m.bounds,
    pairsHash: sha(pairsBytes),
    body: BODY,
    nativeParametersUnchanged: true,
    automaticJump: false,
    verifiedBidirectional: proofs.filter(
      (p) => p.reason === "native-bidirectional-height-connection",
    ).length,
    semantics:
      "Local Detour and native replay results do not establish named floors or full scene reachability",
    proofs,
  };
  resources.writeJsonAtomic(option("--output"), result);
  console.log(JSON.stringify({ ...result, proofs: undefined }));
} finally {
  planner.destroy();
  nav.destroy();
  loaded.destroy();
}
