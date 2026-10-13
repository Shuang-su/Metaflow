/** Compare spawn free space with native source-tile solids at ray-supported
 * lattice samples. Bounded diagnostic only; neither floor IDs nor source edits. */
import { readFileSync } from "node:fs";
import { collisionSourceFile, sha } from "../../mf79-viewer-trial/scripts/source";
import { containsPoint } from "../../mf79-viewer-trial/src/collision-source";
import { TiledVoxelCollision } from "../../metaflow-viewer/src/collision/tiled-voxel-collision";
import { createOfflineResources, offlineResourceOptions, MiB } from "../src/offline-resources";

const args = process.argv.slice(2), option = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`);
  return args[i + 1];
};
const manifest = JSON.parse(readFileSync(option("--manifest"), "utf8")),
  viewBytes = readFileSync(option("--view")), view = JSON.parse(viewBytes.toString());
if (manifest.status !== "analysis-complete" || manifest.usage !== "offline-native-verification-only" ||
    sha(JSON.stringify(manifest.key)) !== manifest.fingerprint ||
    ![view.minX, view.maxX, view.minZ, view.maxZ, view.rayY, view.maxDistance].every(Number.isFinite) ||
    view.minX > view.maxX || view.minZ > view.maxZ || view.maxDistance <= 0 || view.maxDistance > 4)
  throw Error("Requires an explicit bounded analysis view");
const resources = createOfflineResources({ ...offlineResourceOptions(args), taskOutputBytes: 16 * MiB }),
  loaded = await collisionSourceFile(option("--source"), manifest.key.geometryScope);
try {
  if (loaded.sourceHash !== manifest.sourceHash || !(loaded.space.collision instanceof TiledVoxelCollision) ||
      !loaded.space.occupiedAt) throw Error("Requires the same tiled source with geometry occupancy");
  const tiles = loaded.manifest.tiles.filter(t => loaded.loadedTileIds.includes(t.id)),
    colliders = loaded.space.collision.getActiveColliders(), r = loaded.manifest.voxelResolution,
    nx = Math.floor((view.maxX - view.minX) / r + 1e-9) + 1,
    nz = Math.floor((view.maxZ - view.minZ) / r + 1e-9) + 1;
  if (tiles.length !== colliders.length || nx * nz > 16384 ||
      view.minX < manifest.bounds.min.x || view.maxX > manifest.bounds.max.x ||
      view.minZ < manifest.bounds.min.z || view.maxZ > manifest.bounds.max.z ||
      view.rayY > manifest.bounds.max.y || view.rayY - view.maxDistance < manifest.bounds.min.y)
    throw Error("Audit escaped its reviewed navigation scope or sample budget");
  const samples = [];
  for (let iz = 0; iz < nz; iz++) for (let ix = 0; ix < nx; ix++) {
    const x = view.minX + ix * r, z = view.minZ + iz * r,
      hit = loaded.space.collision.queryRay(x, view.rayY, z, 0, -1, 0, view.maxDistance);
    if (!hit) { samples.push({ x, z, status: "no-native-support" }); continue; }
    const y = hit.y - r / 2;
    if (!loaded.space.known(x, y, z)) { samples.push({ x, y, z, status: "unknown-source" }); continue; }
    const states = tiles.flatMap((tile, i) => containsPoint(tile.dataBounds, x, y, z)
      ? [{ tile: tile.id, free: colliders[i].isFreeAt(x, y, z) }] : []),
      anySolid = states.some(s => !s.free), spawnFree = loaded.space.collision.isFreeAt(x, y, z),
      geometryOccupied = loaded.space.occupiedAt(x, y, z);
    if (anySolid !== geometryOccupied) throw Error("Derived occupancy differs from verified source solids");
    samples.push({ x, y, z, status: "native-supported", hitY: hit.y, states,
      anySolid, spawnFree, geometryOccupied, legacyWouldOmit: anySolid && spawnFree });
  }
  const result = { version: 1, usage: "analysis-only", sourceHash: loaded.sourceHash,
    navigationFingerprint: manifest.fingerprint, viewHash: sha(viewBytes), view,
    loadedTileIds: loaded.loadedTileIds, confirmedFloors: false, counts: {
      requested: samples.length, supported: samples.filter(s => s.status === "native-supported").length,
      legacyWouldOmit: samples.filter(s => s.legacyWouldOmit).length }, samples };
  resources.writeJsonAtomic(option("--output"), result, { replace: false });
  console.log(JSON.stringify({ ...result, samples: undefined }));
} finally { loaded.destroy(); }
