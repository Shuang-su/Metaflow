/** Read-only source and environment inventory. No downloads or output writes. */
import { existsSync, readFileSync, statSync, statfsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { arch, totalmem } from "node:os";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  loadAssetConfig,
  machineLimits,
  resolveAssetUrl,
  GiB,
  contained,
} from "../../scripts/mf97/asset-config.mjs";
import { verifyGaussianJobSource } from "../src/verify-gaussian-source";
import { hashFile, collisionIdentity } from "./gaussian-map-offline";
import { groundAnalysisHash } from "../src/ground-analysis-fingerprint";

const config = loadAssetConfig(),
  quick = process.argv.includes("--quick");
const sha = (file: string) =>
  createHash("sha256").update(readFileSync(file)).digest("hex");
const read = (file: string) => JSON.parse(readFileSync(file, "utf8"));
const messages: { component: string; status: string; detail?: unknown }[] = [];
const checks = async (component: string, callback: () => Promise<unknown>) => {
  try {
    messages.push({
      component,
      status: quick ? "present-unverified" : "matching",
      detail: await callback(),
    });
  } catch (error) {
    messages.push({
      component,
      status: ["ENOENT", "MF_ASSET_MISSING"].includes(
        (error as NodeJS.ErrnoException).code ?? "",
      )
        ? "missing"
        : "version-different",
      detail: String(error),
    });
  }
};
const scenes = read(
  resolve(config.projectRoot, "mf79-viewer-trial/scene-exhibitions.json"),
).scenes;
for (const scene of scenes) {
  await checks(`${scene.id}:collision`, async () => {
    const file = resolveAssetUrl(scene.collisionUrl, config),
      binary = file.replace(/\.json$/, ".bin");
    const job = read(resolve(config.roots.mapJobs, scene.id + ".json"));
    const meta = read(file),
      bytes = statSync(binary).size;
    if (
      (meta.nodeWordCount ?? meta.nodeCount) * 4 + meta.leafDataCount * 4 !==
      bytes
    )
      throw Error("Collision length differs from metadata");
    if (
      !quick &&
      `${sha(file)}:${await hashFile(binary)}` !== job.collisionHash
    )
      throw Error("Collision source hash differs");
    return { file, bytes, sourceHash: job.collisionHash };
  });
  await checks(`${scene.id}:gaussian`, async () => {
    const file = resolveAssetUrl(scene.assetUrl, config),
      job = read(resolve(config.roots.mapJobs, scene.id + ".json"));
    read(file);
    if (!quick) await verifyGaussianJobSource(job, dirname(file));
    return { file, expectedGaussianHash: job.gaussianHash };
  });
  await checks(`${scene.id}:navigation`, async () => {
    const folder = resolve(config.roots.navigation, scene.id),
      manifest = read(resolve(folder, "manifest.json"));
    const job = read(resolve(config.roots.mapJobs, scene.id + ".json"));
    if (
      manifest.status !== "complete" ||
      manifest.sourceHash !== job.collisionHash
    )
      throw Error("Navigation needs rebuilding for this collision");
    if (
      !quick &&
      manifest.navHash !== (await hashFile(resolve(folder, "nav.bin")))
    )
      throw Error("Navigation binary changed");
    return { tiles: manifest.tiles.length, sourceHash: manifest.sourceHash };
  });
  await checks(`${scene.id}:map`, async () => {
    const folder = resolve(config.roots.maps, scene.id),
      manifest = read(resolve(folder, "manifest.json"));
    const job = read(resolve(config.roots.mapJobs, scene.id + ".json"));
    if (
      manifest.scene !== scene.id ||
      manifest.source?.collisionHash !== job.collisionHash ||
      manifest.source?.gaussianHash !== job.gaussianHash ||
      JSON.stringify(manifest.source?.transform) !==
        JSON.stringify(job.transform)
    )
      throw Error("Map source or coordinates differ; rebuild needed");
    const tiles = manifest.layers.flatMap((layer: any) => layer.tiles);
    for (const tile of tiles) {
      const url = tile.url ?? tile.imageUrl;
      const file = resolve(
        folder,
        decodeURIComponent(url.replace(`/mf97-maps/${scene.id}/`, "")),
      );
      if (!contained(folder, file))
        throw Error("Map tile escaped its configured directory");
      statSync(file);
      if (!quick && tile.sha256 && (await hashFile(file)) !== tile.sha256)
        throw Error("Map tile changed");
    }
    return { tiles: tiles.length };
  });
  const coverage = resolve(
    process.env.MF97_GROUND_ROOT ??
      resolve(config.roots.continuation, "ground-v2"),
    scene.id,
    "coverage.json",
  );
  if (existsSync(coverage))
    messages.push({
      component: `${scene.id}:ground-reports`,
      status:
        read(coverage).analysisHash === groundAnalysisHash()
          ? "matching"
          : "needs-revalidation",
      detail:
        "Historical reports are preserved; current analysis fingerprint must match before acceptance.",
    });
  else
    messages.push({
      component: `${scene.id}:ground-reports`,
      status: "missing",
      detail:
        "Ground coverage manifest is absent; import reports or regenerate against matching source.",
    });
}
await checks("dayun:collision", async () => {
  const frozen = read(
    resolve(config.roots.continuation, "dayun/collision-source.json"),
  );
  await collisionIdentity(
    resolveAssetUrl(
      "/repository-data/Shenzhen/250917%20Dayun/tiled-voxel/voxel-tiles.json",
      config,
    ),
    resolve(config.roots.continuation, "dayun/collision-source.json"),
  );
  for (const tile of frozen.tiles) {
    const file = resolveAssetUrl(tile.binaryUrl, config);
    const metadata = file.replace(/\.bin$/, ".json");
    if (sha(metadata) !== tile.metadataHash)
      throw Error(`Dayun tile ${tile.id} metadata differs`);
    if (statSync(file).size !== tile.binaryBytes)
      throw Error(`Dayun tile ${tile.id} differs`);
    if (!quick && (await hashFile(file)) !== tile.binaryHash)
      throw Error(`Dayun tile ${tile.id} hash differs`);
  }
  return { tiles: frozen.tiles.length, sourceHash: frozen.sourceHash };
});
let parent = config.roots.continuation;
while (!existsSync(parent)) parent = dirname(parent);
const disk = statfsSync(parent),
  limits = machineLimits(config);
let python: unknown = "not-configured";
if (config.python) {
  try {
    python = execFileSync(
      config.python,
      ["-c", "import open3d; print(open3d.__version__)"],
      {
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: "1" },
        encoding: "utf8",
        timeout: 30000,
      },
    ).trim();
  } catch (error) {
    python = String(error);
  }
}
const required = [
  "metaflow-viewer",
  "supersplat-v2.32.5",
  "mf79-viewer-trial",
  "mf97-viewer-trial",
];
const dependencies = required.map((name) => ({
  name,
  lock: existsSync(resolve(config.projectRoot, name, "package-lock.json")),
  installed: existsSync(resolve(config.projectRoot, name, "node_modules")),
}));
const report = {
  version: 1,
  readonly: true,
  quick,
  codeRuntime: {
    node: process.version,
    arch: arch(),
    nodeMatchesPinned: process.version === "v22.23.3",
  },
  configured: config.configured,
  configFile: config.file,
  memoryGiB: totalmem() / GiB,
  limits,
  freeGiB: (disk.bavail * disk.bsize) / GiB,
  dependencies,
  python,
  scenes: messages,
};
console.log(JSON.stringify(report, null, 2));
if (
  messages.some((m) =>
    ["missing", "version-different", "needs-revalidation"].includes(m.status),
  ) ||
  dependencies.some((d) => !d.lock || !d.installed) ||
  process.version !== "v22.23.3" ||
  arch() !== "arm64" ||
  python !== "0.19.0" ||
  report.freeGiB < limits.reserveGiB
)
  process.exitCode = 1;
