import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  existsSync,
  statfsSync,
  statSync,
} from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "../../metaflow-viewer/node_modules/playwright/index.mjs";
import { mapTiles } from "../src/maps/model";
import type { MapRenderJob } from "../src/maps/model";
import { validateMapManifest } from "../../metaflow-viewer/src/navigation/map-assets";
import type { GaussianMapManifest } from "../../metaflow-viewer/src/navigation/map-assets";

// Source Gaussian/collision data is served read-only by the local preview. The
// output contains derived WebP tiles and provenance, never copies of the source.
const args = process.argv.slice(2),
  value = (key: string) =>
    args.includes(key) ? args[args.indexOf(key) + 1] : undefined;
if (!args.includes("--job"))
  throw new Error(
    "Usage: tsx scripts/generate-gaussian-map.ts --job JOB.json [--origin http://127.0.0.1:5185] [--output DIR]",
  );
const job = JSON.parse(readFileSync(value("--job"), "utf8")) as MapRenderJob;
const origin = value("--origin") || "http://127.0.0.1:5185";
const output = resolve(
  value("--output") ||
    `/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/maps/${job.scene}`,
);
const urlPrefix = value("--url-prefix") || `/mf97-maps/${job.scene}/`;
const tiles = mapTiles(job),
  sha = (b: string | Uint8Array) =>
    createHash("sha256").update(b).digest("hex");
const fingerprint = sha(JSON.stringify(job));
if (
  !/^[a-zA-Z0-9_-]+$/.test(job.scene) ||
  !job.gaussianHash ||
  !job.collisionHash ||
  job.transform.length !== 16
)
  throw new Error("Incomplete map source identity");
mkdirSync(output, { recursive: true });
const resources = () => {
  const disk = statfsSync(output);
  if (disk.bavail * disk.bsize < 10 * 1024 ** 3)
    throw new Error("Map generation stopped: preserve 10 GiB disk reserve");
  if (process.memoryUsage().rss > 1.5 * 1024 ** 3)
    throw new Error("Map generation stopped: 1.5 GiB process budget");
};
resources();
const file = resolve(output, "manifest.json");
type OutputManifest = GaussianMapManifest & {
  fingerprint: string;
  readiness: Record<string, { frames: number; splats: number; ms: number }>;
  sourceInventory?: unknown;
};
let manifest: OutputManifest;
if (existsSync(file)) {
  manifest = JSON.parse(readFileSync(file, "utf8"));
  if (manifest.fingerprint !== fingerprint)
    throw new Error("Existing map job differs; use a distinct cache directory");
  validateMapManifest(manifest, {
    collisionHash: job.collisionHash,
    gaussianHash: job.gaussianHash,
  });
} else {
  manifest = {
    version: 1,
    generator: "mf97-gaussian-world-slice-v1-playcanvas-2.22.4",
    scene: job.scene,
    fingerprint,
    source: {
      gaussianHash: job.gaussianHash,
      collisionHash: job.collisionHash,
      transform: job.transform,
    },
    sourceInventory: (job as any).sourceInventory,
    layers: job.layers.map((layer) => ({
      ...layer,
      tiles: tiles
        .filter((t) => t.layerId === layer.id)
        .map((t) => ({
          id: t.id,
          bounds: t.bounds,
          width: t.width,
          height: t.height,
          url: `${urlPrefix}${t.id}.webp`,
          sha256: "",
          status: "missing",
        })),
    })),
    coverage: { expected: tiles.length, ready: 0, status: "incomplete" },
    readiness: {},
  };
}
const save = () => {
  manifest.coverage.ready = manifest.layers
    .flatMap((l) => l.tiles)
    .filter((t) => t.status === "ready").length;
  manifest.coverage.status =
    manifest.coverage.ready === manifest.coverage.expected
      ? "complete"
      : "incomplete";
  validateMapManifest(manifest);
  writeFileSync(file, JSON.stringify(manifest, null, 2));
};
save();
const browser = await chromium.launch({
  headless: !args.includes("--headed"),
  // Reuse full Chromium in headless mode without installing headless-shell.
  executablePath: args.includes("--browser")
    ? value("--browser")
    : chromium.executablePath(),
  args: ["--enable-webgl", "--ignore-gpu-blocklist"],
});
const page = await browser.newPage({ viewport: { width: 768, height: 768 } });
const errors: string[] = [];
page.on("pageerror", (e: Error) => errors.push(e.message));
page.on("console", (m: any) => {
  if (m.type() === "error") errors.push(m.text());
});
page.on("response", (r: any) => {
  if (r.status() >= 400 && !r.url().endsWith("favicon.ico"))
    errors.push(`HTTP ${r.status()}: ${r.url()}`);
});
try {
  await page.goto(`${origin}/map-generator.html`, { waitUntil: "networkidle" });
  await page.waitForFunction(() => !!(window as any).mf97MapGenerator);
  await page.evaluate(
    async (j: MapRenderJob) => (window as any).mf97MapGenerator.create(j),
    job,
  );
  for (const tile of tiles) {
    resources();
    const record = manifest.layers
      .find((l) => l.id === tile.layerId)!
      .tiles.find((t) => t.id === tile.id)!;
    const path = resolve(output, `${tile.id}.webp`);
    if (record.status === "ready") {
      if (!existsSync(path) || sha(readFileSync(path)) !== record.sha256)
        throw new Error(`Damaged map tile: ${tile.id}`);
      continue;
    }
    if (errors.length) throw new Error(errors.join("\n"));
    console.log(
      JSON.stringify({
        scene: job.scene,
        tile: tile.id,
        state: "waiting-for-lod-workbuffer-sort",
      }),
    );
    const result = await page.evaluate(
      async (t: typeof tile) => (window as any).mf97MapGenerator.render(t),
      tile,
    );
    if (errors.length) throw new Error(errors.join("\n"));
    const bytes = Buffer.from(result.data, "base64");
    if (
      bytes.length < 16 ||
      bytes.subarray(0, 4).toString() !== "RIFF" ||
      bytes.subarray(8, 12).toString() !== "WEBP"
    )
      throw new Error("Generator did not encode WebP");
    resources();
    writeFileSync(path, bytes);
    record.sha256 = sha(bytes);
    record.status = "ready";
    manifest.readiness[tile.id] = {
      frames: result.frames,
      splats: result.splats,
      ms: result.ms,
    };
    save();
    console.log(
      JSON.stringify({
        scene: job.scene,
        tile: tile.id,
        state: "ready",
        bytes: bytes.length,
        ...manifest.readiness[tile.id],
      }),
    );
  }
  const totalBytes = manifest.layers
    .flatMap((l) => l.tiles)
    .reduce((n, t) => n + statSync(resolve(output, `${t.id}.webp`)).size, 0);
  console.log(
    JSON.stringify({ file, coverage: manifest.coverage, bytes: totalBytes }),
  );
} catch (error) {
  save();
  throw error;
} finally {
  await page
    .evaluate(() => (window as any).mf97MapGenerator?.destroy())
    .catch(() => {});
  await browser.close();
}
