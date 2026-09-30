import {
  readFileSync,
  createReadStream,
  mkdirSync,
  writeFileSync,
  statfsSync,
} from "node:fs";
import { resolve, dirname, relative } from "node:path";
import { createHash } from "node:crypto";
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
const local = (url: string) => {
  const roots = [
    ["/scene-assets/", "/Volumes/Prism_初号機/3D高斯"],
    ["/repository-data/", "/Volumes/Prism/Metaflow/data"],
  ] as const;
  const match = roots.find(([prefix]) => url.startsWith(prefix));
  if (!match) throw new Error(`Unsupported read-only asset URL: ${url}`);
  const path = resolve(
    match[1],
    decodeURIComponent(url.slice(match[0].length)),
  );
  if (relative(match[1], path).startsWith(".."))
    throw new Error("Asset path escaped source root");
  return path;
};
const output = resolve(
  option("--output") ||
    `/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/jobs/${sceneId}.json`,
);
mkdirSync(dirname(output), { recursive: true });
const disk = statfsSync(dirname(output));
if (disk.bavail * disk.bsize < 10 * 1024 ** 3)
  throw new Error("Preserve 10 GiB disk reserve");
const modelPath = local(scene.assetUrl),
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
  const path = resolve(dirname(modelPath), model.filenames[index]);
  if (relative(dirname(modelPath), path).startsWith(".."))
    throw new Error("Gaussian source escaped source directory");
  sources.add(path);
  if (path.endsWith(".json")) {
    const data = JSON.parse(readFileSync(path, "utf8"));
    const files = (v: any) => {
      if (!v || typeof v !== "object") return;
      if (Array.isArray(v.files))
        for (const file of v.files) {
          const child = resolve(dirname(path), file);
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
const hashFile = async (path: string) => {
  const hash = createHash("sha256");
  for await (const bytes of createReadStream(path)) hash.update(bytes);
  return hash.digest("hex");
};
const inventory: { file: string; sha256: string }[] = [];
for (const path of [...sources].sort())
  inventory.push({
    file: relative(dirname(modelPath), path),
    sha256: await hashFile(path),
  });
const collisionPath = local(scene.collisionUrl);
const collisionHash = `${await hashFile(collisionPath)}:${await hashFile(collisionPath.replace(/\.json$/, ".bin"))}`;
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
  new Quat().setFromEulerAngles(...(scene.visualRotation ?? [0, 0, 180])),
  new Vec3(1, 1, 1),
);
const transform = Array.from(new Mat4().mul2(outer, visual).data);
const job: MapRenderJob & {
  sourceInventory: typeof inventory;
  layersProvenance: unknown;
} = {
  scene: sceneId,
  assetUrl: scene.assetUrl,
  transform,
  lod,
  gaussianHash: createHash("sha256")
    .update(JSON.stringify({ lod, inventory }))
    .digest("hex"),
  collisionHash,
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
writeFileSync(output, JSON.stringify(job, null, 2));
console.log(
  JSON.stringify({
    output,
    lod,
    sourceFiles: inventory.length,
    gaussianHash: job.gaussianHash,
    collisionHash,
    layers: job.layers.map((l) => l.id),
  }),
);
