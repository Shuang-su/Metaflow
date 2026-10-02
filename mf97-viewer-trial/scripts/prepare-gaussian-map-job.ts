import { readFileSync } from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
import { createOfflineResources, offlineResourceOptions } from "../src/offline-resources";
import { verifyGaussianJobSource } from "../src/verify-gaussian-source";
import { localAsset, sourceChild, mapOutput, collisionIdentity, hashFile } from "./gaussian-map-offline";
import {
  Mat4,
  Vec3,
  Quat,
} from "../../metaflow-viewer/node_modules/playcanvas/build/playcanvas/src/index.js";
import type { MapRenderJob } from "../src/maps/model";

const args = process.argv.slice(2),
  option = (k: string) =>
    args.includes(k) ? args[args.indexOf(k) + 1] : undefined;
const sceneId = option("--scene"),
  layersFile = option("--layers");
if (!sceneId || !layersFile)
  throw new Error(
    "Usage: tsx scripts/prepare-gaussian-map-job.ts --scene ID --layers reviewed-layers.json [--output FILE]",
  );
const sceneFile = option("--scenes") || "scene-exhibitions.json";
const scene = JSON.parse(readFileSync(sceneFile, "utf8")).scenes.find(
  (s: any) => s.id === sceneId,
);
if (!scene) throw new Error("Unknown map scene");
const resources = createOfflineResources(offlineResourceOptions(args));
if (!/^[a-zA-Z0-9_-]+$/.test(sceneId)) throw Error("Invalid scene identity");
const output = mapOutput(resources, option("--output") || `jobs/${sceneId}.json`);
resources.assertCapacity(1024 * 1024, "Gaussian job preparation");
const modelPath = localAsset(scene.assetUrl),
  manifestBytes = readFileSync(modelPath),
  model = JSON.parse(manifestBytes.toString());
if (!Number.isInteger(model.lodLevels) || model.lodLevels < 1)
  throw new Error("Invalid source Gaussian manifest");
const lod = option("--lod") ? Number(option("--lod")) : model.lodLevels - 1;
if (!Number.isInteger(lod) || lod < 0 || lod >= model.lodLevels)
  throw new Error("Invalid requested source LOD");
const fileIndices = new Set<number>();
const visit = (node: any) => {
  if (node.children) node.children.forEach(visit);
  else {
    const source = node.lods[String(lod)];
    if (source?.count > 0) fileIndices.add(source.file);
  }
};
visit(model.tree);
const sources = new Set<string>([modelPath]);
for (const index of fileIndices) {
  const path = sourceChild(dirname(modelPath), model.filenames[index]);
  if (relative(dirname(modelPath), path).startsWith(".."))
    throw new Error("Gaussian source escaped source directory");
  sources.add(path);
  if (path.endsWith(".json")) {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const files = (v: any) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v.files))
        for (const file of v.files) {
          const child = sourceChild(dirname(modelPath), relative(dirname(modelPath), resolve(dirname(path), file)));
          if (relative(dirname(modelPath), child).startsWith(".."))
            throw new Error("Gaussian texture escaped source directory");
          sources.add(child);
        }
      for (const [key, child] of Object.entries(v))
        if (key !== "files") files(child);
    };
    files(data);
  }
}
const inventory: { file: string; sha256: string }[] = [];
for (const path of [...sources].sort()) {
  resources.assertCapacity(0, "Gaussian source hashing");
  inventory.push({
    file: relative(dirname(modelPath), path),
    sha256: await hashFile(path),
  });
}
const collisionPath = localAsset(scene.collisionUrl);
const collision = await collisionIdentity(collisionPath, option("--collision-source"));
const collisionHash = collision.hash;
const outer = new Mat4().setTRS(
  new Vec3(
    scene.transform?.translation?.x ?? 0,
    scene.transform?.translation?.y ?? 0,
    scene.transform?.translation?.z ?? 0,
  ),
  new Quat().setFromEulerAngles(0, scene.transform?.yawDegrees ?? 0, 0),
  new Vec3(
    scene.transform?.scale ?? 1,
    scene.transform?.scale ?? 1,
    scene.transform?.scale ?? 1,
  ),
);
const visual = new Mat4().setTRS(
  new Vec3(),
  new Quat().setFromEulerAngles(...((scene.visualRotation ?? [0, 0, 180]) as [number, number, number])),
  new Vec3(1, 1, 1),
);
const transform = Array.from(new Mat4().mul2(outer, visual).data);
const job: MapRenderJob & {
  sourceInventory: typeof inventory;
  layersProvenance: unknown;
  collisionProvenance: typeof collision.provenance;
} = {
  scene: sceneId,
  assetUrl: scene.assetUrl,
  transform,
  lod,
  gaussianHash: createHash("sha256")
    .update(JSON.stringify({ lod, inventory }))
    .digest("hex"),
  collisionHash,
  collisionProvenance: collision.provenance,
  layers: JSON.parse(readFileSync(layersFile, "utf8")),
  tileMetres: 20.48,
  pixels: 512,
  sourceInventory: inventory,
  layersProvenance: {
    file: layersFile,
    sha256: await hashFile(layersFile),
    status: "reviewed-display-slices-not-navigation-connectivity",
  },
};
await verifyGaussianJobSource(job, dirname(modelPath));
resources.writeJsonAtomic(output, job, { replace: false });
console.log(
  JSON.stringify({
    output,
    resources: resources.snapshot(),
    lod,
    sourceFiles: inventory.length,
    gaussianHash: job.gaussianHash,
    collisionHash,
    layers: job.layers.map((l) => l.id),
  }),
);
