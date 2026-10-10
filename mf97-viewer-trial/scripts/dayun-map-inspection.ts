/** Prepare a bounded, display-only LOD0 inspection. Original leaves and files
 * remain unchanged; the generated page uses the separate map renderer. */
import { readFileSync } from "node:fs";
import { dirname, relative } from "node:path";
import { selectDayunInspectionSource } from "../src/dayun-inspection-source";
import { createOfflineResources, offlineResourceOptions } from "../src/offline-resources";
import { localAsset, sourceChild, hashFile, sha } from "./gaussian-map-offline";
import { verifyGaussianJobSource } from "../src/verify-gaussian-source";
import { mapTiles } from "../src/maps/model";
import { sectionProjection } from "../src/ground/section";
import type { MapRenderJob } from "../src/maps/model";

const args = process.argv.slice(2),
  option = (name: string) => {
    const i = args.indexOf(name);
    if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`);
    return args[i + 1];
  };
const viewBytes = readFileSync(option("--view")), view = JSON.parse(viewBytes.toString());
if (!/^[a-z0-9][a-z0-9_-]*$/.test(view.id) || !Array.isArray(view.layers) || view.layers.length !== 2)
  throw Error("Requires an explicit two-surface inspection view");
if (new Set(view.layers.map((layer: any) => layer.id)).size !== 2 ||
    view.layers.some((layer: any) => !/^[a-z0-9][a-z0-9_-]*$/.test(layer.id) ||
      typeof layer.label !== "string" || [layer.supportRange, layer.sliceRange].some(range =>
        !Array.isArray(range) || range.length !== 2 || !range.every(Number.isFinite) || range[0] > range[1])))
  throw Error("Invalid inspection layer identity or height range");
const resources = createOfflineResources(offlineResourceOptions(args)),
  originalUrl = "/repository-data/Shenzhen/250917%20Dayun/lod-meta.json",
  sourceFile = localAsset(originalUrl), sourceRoot = dirname(sourceFile),
  originalBytes = readFileSync(sourceFile), original = JSON.parse(originalBytes.toString()),
  selected = selectDayunInspectionSource(original, view.center, view.halfExtent),
  sourceUrl = new URL(originalUrl, "http://127.0.0.1:5185"),
  files = new Set<string>([sourceFile]);
let decodedSplats = 0;
for (const index of selected.coverage.fileIndices) {
  const file = sourceChild(sourceRoot, original.filenames[index]),
    meta = JSON.parse(readFileSync(file, "utf8"));
  if (!Number.isSafeInteger(meta.count) || meta.count <= 0) throw Error("Invalid SOG point count");
  decodedSplats += meta.count;
  files.add(file);
  const textures = (v: any) => {
    if (!v || typeof v !== "object") return;
    if (Array.isArray(v.files))
      for (const child of v.files)
        files.add(sourceChild(sourceRoot, relative(sourceRoot, sourceChild(dirname(file), child))));
    for (const [key, value] of Object.entries(v)) if (key !== "files") textures(value);
  };
  textures(meta);
}
if (decodedSplats > 8_000_000) throw Error("Whole-file decode exceeds the small-view budget");
selected.manifest.filenames = selected.manifest.filenames.map(file => new URL(file, sourceUrl).pathname);
const directory = `maps/${view.id}`, url = `/mf97-continuation-maps/${view.id}/`,
  selectedFile = `${directory}/source/lod-meta.json`;
const inventory = [];
for (const file of [...files].sort())
  inventory.push({ file: relative(sourceRoot, file), sha256: await hashFile(file) });
const collisionFile = resources.resolveOutput("dayun/collision-source.json"),
  collisionBytes = readFileSync(collisionFile), collision = JSON.parse(collisionBytes.toString());
let nativeRoute: {
  file: string; sha256: string; pair: string; navigationFingerprint: string;
  points: { x: number; y: number; z: number }[];
} | undefined;
if (view.routeProof) {
  const file = resources.resolveOutput(view.routeProof.file), bytes = readFileSync(file),
    proof = JSON.parse(bytes.toString()), pair = proof.proofs?.find((p: any) => p.id === view.routeProof.pair);
  if (proof.sourceHash !== collision.sourceHash || proof.nativeParametersUnchanged !== true ||
      proof.automaticJump !== false || !pair ||
      ["forward", "reverse", "returnAlongForward", "returnAlongReverse"].some(name =>
        pair[name]?.ok !== true || !Array.isArray(pair[name].trace) ||
        !pair[name].trace.length || pair[name].trace.length > 100_000 ||
        pair[name].trace.some((p: any) => !p.grounded || p.collision !== "active" ||
          ![p.position?.x, p.position?.y, p.position?.z].every(Number.isFinite))))
    throw Error("Route overlay requires a same-source, grounded, two-way native proof");
  nativeRoute = { file, sha256: sha(bytes), pair: pair.id,
    navigationFingerprint: proof.navigationFingerprint,
    points: pair.forward.trace.map((p: any) => p.position) };
}
const job = {
  scene: view.id, assetUrl: `${url}source/lod-meta.json`, lod: 0,
  transform: [-1,0,0,0, 0,-1,0,0, 0,0,1,0, 0,0,0,1],
  gaussianHash: sha(JSON.stringify({ lod: 0, inventory })), collisionHash: collision.sourceHash,
  sourceInventory: inventory, layers: view.layers, tileMetres: view.halfExtent * 2, pixels: 512,
  sourceSelection: { file: resources.resolveOutput(selectedFile), sha256: "",
    originalManifestHash: sha(originalBytes), coverage: selected.coverage, decodedSplats },
  sourceRootUrl: originalUrl,
  sectionRequests: view.sections ?? [],
  ...(nativeRoute ? { nativeRoute } : {}),
  renderImplementations: Object.fromEntries([
    ["generator", new URL("../src/maps/generator.ts", import.meta.url)],
    ["model", new URL("../src/maps/model.ts", import.meta.url)],
    ["capture", new URL("../../metaflow-viewer/src/capture.ts", import.meta.url)],
    ["dependencyLock", new URL("../package-lock.json", import.meta.url)],
  ].map(([name, file]) => [String(name), sha(readFileSync(file))])),
  collisionProvenance: { kind: "tiled", sourceHash: collision.sourceHash, file: collisionFile,
    sha256: sha(collisionBytes), binaryValidation: "previous-frozen-source-audit" },
  layersProvenance: { file: option("--view"), sha256: sha(viewBytes),
    status: "local-support-height-research-slices", namedFloors: false, connected: false,
    supportEvidence: view.supportEvidence },
} satisfies MapRenderJob & Record<string, unknown>;
const tiles = mapTiles(job);
for (const request of job.sectionRequests) {
  sectionProjection(request);
  if (["x", "y", "z"].some((axis, i) =>
    request.bounds.min[axis] < selected.coverage.bounds.min[i] ||
    request.bounds.max[axis] > selected.coverage.bounds.max[i]))
    throw Error("Section escaped selected local bounds");
}
if (tiles.length !== 2 || view.layers.some((layer: any) =>
  layer.bounds.minX < selected.coverage.bounds.min[0] || layer.bounds.maxX > selected.coverage.bounds.max[0] ||
  layer.bounds.minZ < selected.coverage.bounds.min[2] || layer.bounds.maxZ > selected.coverage.bounds.max[2]))
  throw Error("Inspection map tiles must stay within the selected local XZ bounds");
await verifyGaussianJobSource(job, sourceRoot);
job.sourceSelection.sha256 = resources.writeJsonAtomic(selectedFile, selected.manifest, { replace: false });
const jobFile = `${directory}/job.json`, jobHash = resources.writeJsonAtomic(jobFile, job, { replace: false });
const html = `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>大运局部上下表面切片</title>
<style>body{margin:28px;background:#101c21;color:#dce9ed;font:16px system-ui}button{padding:10px 18px;font:inherit}section{display:flex;gap:20px;flex-wrap:wrap}figure{margin:20px 0}img{width:512px;max-width:100%;border:1px solid #405057}p{max-width:1050px;line-height:1.6}.map{position:relative;width:512px;max-width:100%}.map img{display:block;width:100%;box-sizing:border-box}.map svg{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}[hidden]{display:none}canvas{position:absolute;left:-2000px;width:512px;height:512px}</style>
<h1>大运 · 局部上下表面</h1><p>仅 ${view.halfExtent * 2}×${view.halfExtent * 2} 米研究切片；上下表面标签不代表已确认建筑楼层或可通行连接。固定原始LOD0，世界Y过滤，Rz(180)。</p>
<p id="identity">源叶 ${selected.coverage.selectedLeaves} / ${selected.coverage.sourceLeaves}；选择 ${selected.coverage.selectedSplats} 个高斯，${selected.coverage.fileIndices.length} 个SOG文件；整文件解码 ${decodedSplats} 个高斯。</p>
<button id="render">生成两张局部切片</button><p id="map-generator-status" role="status">待生成</p><p id="errors" role="alert"></p><canvas width="512" height="512"></canvas><section id="images"></section>
${nativeRoute ? '<label><input id="route-visible" type="checkbox" checked>显示橙色原生行走轨迹（两图共用同一XZ投影，不能表示楼层归属）</label>' : ''}
<p>GPU读取结果保存在页面导出区。</p><textarea id="render-results" aria-hidden="true" hidden readonly></textarea>
<script type="module">
import { GaussianMapGenerator } from '/src/maps/generator.ts';
const status=document.querySelector('#map-generator-status'), errors=document.querySelector('#errors'), button=document.querySelector('#render');
window.addEventListener('error',e=>errors.textContent=String(e.message));
window.addEventListener('unhandledrejection',e=>errors.textContent=String(e.reason));
button.onclick=async()=>{button.disabled=true;let generator;
try{const response=await fetch('./job.json',{cache:'no-store'});if(!response.ok)throw Error('Job unavailable');
const bytes=await response.arrayBuffer();const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
if(digest!==${JSON.stringify(jobHash)})throw Error('Job identity changed');
const job=JSON.parse(new TextDecoder().decode(bytes));status.textContent='正在加载局部LOD0';generator=await GaussianMapGenerator.create(document.querySelector('canvas'),job);
const results=[],sections=[];for(const tile of ${JSON.stringify(tiles)}){status.textContent='正在生成 '+tile.id;const result=await generator.render(tile);results.push({tile,result});
const layer=job.layers.find(l=>l.id===tile.layerId),figure=document.createElement('figure'),caption=document.createElement('figcaption'),img=document.createElement('img');
caption.textContent=layer.label+' · Y切片 '+layer.sliceRange.map(v=>v.toFixed(3)).join(' 至 ')+'m';img.alt=layer.label;img.src='data:image/webp;base64,'+result.data;const map=document.createElement('div');map.className='map';map.append(img);
if(job.nativeRoute){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg'),line=document.createElementNS(svg.namespaceURI,'polyline');svg.setAttribute('viewBox','0 0 '+tile.width+' '+tile.height);line.setAttribute('points',job.nativeRoute.points.map(p=>[(p.x-tile.bounds.minX)/(tile.bounds.maxX-tile.bounds.minX)*tile.width,(p.z-tile.bounds.minZ)/(tile.bounds.maxZ-tile.bounds.minZ)*tile.height].join(',')).join(' '));line.setAttribute('fill','none');line.setAttribute('stroke','#ff9e3b');line.setAttribute('stroke-width','3');svg.append(line);map.append(svg);}figure.append(caption,map);document.querySelector('#images').append(figure);}
for(const request of job.sectionRequests){status.textContent='正在生成 '+request.axis+' 方向剖面';const result=await generator.renderSection(request),canvas=document.createElement('canvas');canvas.width=request.width;canvas.height=request.height;canvas.getContext('2d').putImageData(result.image,0,0);const data=canvas.toDataURL('image/png');
sections.push({request,data,hasSource:result.hasSource,frames:result.frames,splats:result.splats,ms:result.ms});const figure=document.createElement('figure'),caption=document.createElement('figcaption'),img=document.createElement('img');caption.textContent=(request.axis==='z'?'X/Y':'Z/Y')+' 高斯剖面（研究）';img.alt=caption.textContent;img.src=data;figure.append(caption,img);document.querySelector('#images').append(figure);}
document.querySelector('#render-results').value=JSON.stringify({jobHash:${JSON.stringify(jobHash)},results,sections});status.textContent='2 / 2 局部切片及 '+sections.length+' 张剖面已完成；建筑楼层名称尚未确认';
}catch(error){errors.textContent=String(error);status.textContent='生成失败，保留失败原因';}finally{generator?.destroy();button.disabled=false;}};
document.querySelector('#route-visible')?.addEventListener('change',event=>{document.querySelectorAll('.map svg').forEach(svg=>svg.style.display=event.target.checked?'':'none');});
</script></html>`;
resources.writeFileAtomic(`${directory}/inspection.html`, html, { replace: false });
console.log(JSON.stringify({ page: `${url}inspection.html`, job: resources.resolveOutput(jobFile), jobHash,
  sourceSelection: job.sourceSelection, inventoryFiles: inventory.length, gaussianHash: job.gaussianHash }));
