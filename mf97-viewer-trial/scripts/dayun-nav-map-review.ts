/** Read-only before/after navigation overlay on an existing Gaussian map.
 * Triangle height slices are a diagnostic, never runtime floor identities. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { sha } from "./gaussian-map-offline";
import { createOfflineResources, offlineResourceOptions } from "../src/offline-resources";

const args = process.argv.slice(2), option = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`);
  return args[i + 1];
};
const mapBytes = readFileSync(option("--map-job")), job = JSON.parse(mapBytes.toString()),
  resources = createOfflineResources(offlineResourceOptions(args));
const output = option("--output");
if (!output.endsWith(".html")) throw Error("Navigation map review output must be HTML");
if (job.layersProvenance?.namedFloors !== false || job.layersProvenance?.connected !== false ||
    !/^[a-z0-9][a-z0-9_-]*$/.test(job.scene)) throw Error("Requires a display-only local map");
const maps = JSON.parse(readFileSync(resources.resolveOutput(`maps/${job.scene}/tiles/manifest.json`), "utf8"));
if (maps.fingerprint !== sha(JSON.stringify(job)) || maps.coverage.status !== "complete")
  throw Error("Map source/coverage differs from its job");
const readMesh = (file: string) => {
  const bytes = readFileSync(file), m = JSON.parse(bytes.toString()),
    positions = readFileSync(resolve(dirname(file), "nav-positions.bin")),
    indices = readFileSync(resolve(dirname(file), "nav-indices.bin"));
  if (m.status !== "analysis-complete" || m.usage !== "offline-native-verification-only" ||
      m.sourceHash !== job.collisionHash || sha(JSON.stringify(m.key)) !== m.fingerprint ||
      sha(positions) !== m.display.positionsHash || sha(indices) !== m.display.indicesHash ||
      positions.length % 12 || indices.length % 12)
    throw Error("Navigation display geometry identity mismatch");
  return { file, sha256: sha(bytes), navigationFingerprint: m.fingerprint,
    positions: new Float32Array(Uint8Array.from(positions).buffer),
    indices: new Uint32Array(Uint8Array.from(indices).buffer) };
};
const meshes = { before: readMesh(option("--before")), after: readMesh(option("--after")) },
  project = (mesh: ReturnType<typeof readMesh>, tile: any, layer: any) => {
    const points = mesh.positions, output: string[] = [], b = tile.bounds;
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const vertices = [0, 1, 2].map(offset => {
        const n = mesh.indices[i + offset] * 3;
        if (n + 2 >= points.length) throw Error("Invalid navigation display index");
        return { x: points[n], y: points[n + 1], z: points[n + 2] };
      });
      if (vertices.some(p => p.y < layer.supportRange[0] - 0.12 || p.y > layer.supportRange[1] + 0.12) ||
          Math.max(...vertices.map(p => p.x)) < b.minX || Math.min(...vertices.map(p => p.x)) > b.maxX ||
          Math.max(...vertices.map(p => p.z)) < b.minZ || Math.min(...vertices.map(p => p.z)) > b.maxZ) continue;
      output.push(vertices.map(p => `${((p.x - b.minX) / (b.maxX - b.minX) * tile.width).toFixed(2)},${((p.z - b.minZ) / (b.maxZ - b.minZ) * tile.height).toFixed(2)}`).join(" "));
    }
    return output;
  };
const escape = (text: string) => String(text).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const records: any[] = [];
const figures = maps.layers.map((layer: any) => layer.tiles.map((tile: any) => {
  if (tile.status !== "ready" || sha(readFileSync(resources.resolveOutput(`maps/${job.scene}/tiles/${tile.id}.webp`))) !== tile.sha256)
    throw Error("Displayed Gaussian tile changed");
  const triangles = Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => [name, project(mesh, tile, layer)]));
  records.push({ layer: layer.id, tile: tile.id, beforeTriangles: triangles.before.length, afterTriangles: triangles.after.length });
  const overlays = Object.entries(triangles).map(([name, points]) => `<g class="${name}" style="display:${name === "after" ? "" : "none"}">${points.map(p => `<polygon points="${p}"/>`).join("")}</g>`).join("");
  return `<figure><figcaption>${escape(layer.label)}</figcaption><div class="map"><img src="${escape(tile.url)}" alt="${escape(layer.label)}"><svg viewBox="0 0 ${tile.width} ${tile.height}">${overlays}</svg></div></figure>`;
}).join("")).join("");
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><link rel="icon" href="data:,"><title>大运建网占据对照</title><style>body{margin:28px;background:#101c21;color:#dce9ed;font:16px system-ui}p{line-height:1.6;max-width:1050px}label{display:inline-block;margin:10px 20px 10px 0}section{display:flex;flex-wrap:wrap;gap:20px}figure{margin:20px 0}.map{position:relative;width:512px;max-width:100%}img{display:block;width:100%;box-sizing:border-box;border:1px solid #405057}svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}polygon{fill:#37c7da;fill-opacity:.3;stroke:#37c7da;stroke-opacity:.18;stroke-width:.3}.before polygon{fill:#ffb162;stroke:#ffb162}</style>
<h1>大运 · 建网占据对照</h1><p>同一份原始LOD0局部切片，叠加修复前/后的真实导航三角形。仅显示支撑高度附近的网格，不能代表完整楼层或跨层连接。</p>
<label><input type="radio" name="mesh" value="after" checked>修复后网格</label><label><input type="radio" name="mesh" value="before">旧网格</label><label><input type="radio" name="mesh" value="none">仅高斯</label><section>${figures}</section>
<p>图中未出现网格的区域保留未确认状态，不能据此断言实体阻挡。楼层身份与上下通路仍需分别验证。</p>
<script>document.querySelectorAll('input').forEach(input=>input.onchange=()=>document.querySelectorAll('svg g').forEach(group=>group.style.display=group.classList.contains(input.value)?'':'none'));</script></html>`;
resources.writeFileAtomic(output, html, { replace: false });
resources.writeJsonAtomic(output.replace(/\.html$/, ".json"), { version: 1, usage: "analysis-only", mapJobHash: sha(mapBytes),
  sourceHash: job.collisionHash, meshes: Object.fromEntries(Object.entries(meshes).map(([name, mesh]) => [name,
    { file: mesh.file, sha256: mesh.sha256, navigationFingerprint: mesh.navigationFingerprint }])), records }, { replace: false });
console.log(JSON.stringify({ output: resources.resolveOutput(output), records }));
