/** Persist DOM-exported renders through the existing atomic/resumable map
 * pipeline. This command does not launch or control a browser. */
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { generateGaussianMap } from "./generate-gaussian-map";
import { localAsset, sha } from "./gaussian-map-offline";
import { createOfflineResources, offlineResourceOptions } from "../src/offline-resources";
import { mapTiles } from "../src/maps/model";

const args = process.argv.slice(2), option = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`);
  return args[i + 1];
};
const bytes = readFileSync(option("--job")), job = JSON.parse(bytes.toString()),
  renders = JSON.parse(readFileSync(option("--renders"), "utf8"));
if (renders.jobHash !== sha(bytes) || !Array.isArray(renders.results) ||
    !job.sourceSelection || job.layersProvenance?.namedFloors !== false ||
    job.layersProvenance?.connected !== false)
  throw Error("Requires renders bound to this local display-only inspection");
for (const [name, file] of [
  ["generator", new URL("../src/maps/generator.ts", import.meta.url)],
  ["model", new URL("../src/maps/model.ts", import.meta.url)],
  ["capture", new URL("../../metaflow-viewer/src/capture.ts", import.meta.url)],
  ["dependencyLock", new URL("../package-lock.json", import.meta.url)],
] as const)
  if (job.renderImplementations?.[name] !== sha(readFileSync(file)))
    throw Error(`Render implementation changed: ${name}`);
const checkSelection = () => {
  if (sha(readFileSync(job.sourceSelection.file)) !== job.sourceSelection.sha256)
    throw Error("Selected Gaussian manifest changed");
  if (job.nativeRoute && sha(readFileSync(job.nativeRoute.file)) !== job.nativeRoute.sha256)
    throw Error("Native route proof changed");
};
checkSelection();
const tiles = mapTiles(job), records = new Map<string, any>();
for (const entry of renders.results) {
  const tile = tiles.find(t => t.id === entry.tile?.id);
  if (!tile || JSON.stringify(tile) !== JSON.stringify(entry.tile) || records.has(tile.id))
    throw Error("Unexpected, duplicate or changed rendered tile");
  records.set(tile.id, entry.result);
}
if (records.size !== tiles.length) throw Error("Incomplete inspection export");
const sections = renders.sections ?? [], requests = job.sectionRequests ?? [];
if (!Array.isArray(sections) || sections.length !== requests.length)
  throw Error("Incomplete section export");
const sectionRecords = new Map<string, { data: Buffer; request: any; readiness: any }>();
for (const entry of sections) {
  const request = requests.find((r: any) => r.axis === entry.request?.axis);
  if (!request || JSON.stringify(request) !== JSON.stringify(entry.request) ||
      sectionRecords.has(request.axis) || !entry.data?.startsWith("data:image/png;base64,"))
    throw Error("Unexpected, duplicate or changed section");
  const data = Buffer.from(entry.data.slice("data:image/png;base64,".length), "base64");
  if (data.length < 33 || data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
      data.subarray(12, 16).toString() !== "IHDR" || data.readUInt32BE(16) !== request.width ||
      data.readUInt32BE(20) !== request.height || typeof entry.hasSource !== "boolean" ||
      ![entry.frames, entry.splats, entry.ms].every(Number.isFinite) ||
      entry.frames < 1 || entry.splats < 0 || entry.ms < 0)
    throw Error("Invalid section PNG or readiness");
  sectionRecords.set(request.axis, { data, request,
    readiness: { hasSource: entry.hasSource, frames: entry.frames, splats: entry.splats, ms: entry.ms } });
}
const resources = createOfflineResources(offlineResourceOptions(args));
const result = await generateGaussianMap({ job,
  resources,
  assetRoot: dirname(localAsset(job.sourceRootUrl)),
  output: `maps/${job.scene}/tiles`, urlPrefix: `/mf97-continuation-maps/${job.scene}/tiles/`,
  render: async tile => records.get(tile.id),
});
checkSelection();
const directory = `maps/${job.scene}`, url = `/mf97-continuation-maps/${job.scene}/`,
  savedSections = [];
for (const [axis, section] of sectionRecords) {
  const file = `${directory}/sections/${axis}.png`,
    sha256 = resources.writeFileAtomic(file, section.data, { replace: false });
  savedSections.push({ axis, url: `${url}sections/${axis}.png`, sha256,
    request: section.request, readiness: section.readiness });
}
resources.writeJsonAtomic(`${directory}/sections/manifest.json`,
  { jobHash: sha(bytes), status: "complete", sections: savedSections }, { replace: false });
const escape = (text: string) => String(text).replace(/[&<>"']/g, c =>
  ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const figures = tiles.map(tile => {
  const layer = job.layers.find((l: any) => l.id === tile.layerId),
    points = job.nativeRoute?.points.map((p: any) =>
      `${(p.x - tile.bounds.minX) / (tile.bounds.maxX - tile.bounds.minX) * tile.width},${(p.z - tile.bounds.minZ) / (tile.bounds.maxZ - tile.bounds.minZ) * tile.height}`).join(" "),
    overlay = points ? `<svg viewBox="0 0 ${tile.width} ${tile.height}"><polyline fill="none" stroke="#ff9e3b" stroke-width="3" points="${escape(points)}"/></svg>` : "";
  return `<figure><figcaption>${escape(layer.label)} · Y切片 ${layer.sliceRange.map((v: number) => v.toFixed(3)).join(" 至 ")}m</figcaption><div class="map"><img alt="${escape(layer.label)}" src="${url}tiles/${tile.id}.webp">${overlay}</div></figure>`;
}).join("") + savedSections.map(section => `<figure><figcaption>${section.axis === "z" ? "X/Y" : "Z/Y"} 高斯剖面（研究）</figcaption><img alt="高斯剖面" src="${section.url}"></figure>`).join("");
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>大运局部通路研究结果</title>
<style>body{margin:28px;background:#101c21;color:#dce9ed;font:16px system-ui}section{display:flex;gap:20px;flex-wrap:wrap}figure{margin:20px 0}img{width:512px;max-width:100%;border:1px solid #405057}p{max-width:1050px;line-height:1.6}.map{position:relative;width:512px;max-width:100%}.map img{display:block;width:100%;box-sizing:border-box}.map svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}</style>
<h1>大运 · 局部通路研究结果</h1><p>${tiles.length} 张局部高斯切片、${savedSections.length} 张剖面已保存。仅展示原始LOD0的已记录范围；建筑楼层名称与楼层归属尚未确认。</p>
<p>范围 ${job.tileMetres}×${job.tileMetres}m · 选择 ${job.sourceSelection.coverage.selectedSplats} 个高斯 · 原件LOD0 · 世界Y切片 · Rz(180)</p>
<section>${figures}</section>
${job.nativeRoute ? '<label><input id="route-visible" type="checkbox" checked>显示橙色原生行走轨迹（两图共用同一XZ投影，不能表示楼层归属）</label><script>document.querySelector("#route-visible").onchange=e=>document.querySelectorAll(".map svg").forEach(svg=>svg.style.display=e.target.checked?"":"none");</script>' : ''}
<p>切片中的空白保留为未显示范围，不能据此断言空域或完整楼层覆盖。</p></html>`;
resources.writeFileAtomic(`${directory}/review.html`, html, { replace: false });
console.log(JSON.stringify({ ...result, sections: savedSections.length, review: `${url}review.html`, resources: resources.snapshot() }));
