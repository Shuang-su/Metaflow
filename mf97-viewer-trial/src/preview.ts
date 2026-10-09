import { createViewer } from "../../metaflow-viewer/src/index";
import "virtual:mf97-viewer-styles";
import { withNavigationEnabled } from "../../metaflow-viewer/src/navigation/nav-annotation";
import scenes from "../../mf79-viewer-trial/scene-exhibitions.json";
import apms from "../../mf79-viewer-trial/apms.settings.json";
import studio from "../../mf79-viewer-trial/apms-markers-42.mfstudio.json";
import sdi from "../../mf79-viewer-trial/sdi-25.settings.json";
import { selectDayunInspectionSource } from "./dayun-inspection-source";
import { loadTrialBundle } from "./trial-bundle";
import navigationWorkerUrl from "../../mf79-viewer-trial/src/worker.ts?worker&url";
const params = new URLSearchParams(location.search),
  id = params.get("scene") ?? "apms-2026",
  dayun = id === "dayun";
const scene = scenes.scenes.find((s) => s.id === id) ?? scenes.scenes[0];
// Read-only inspection viewpoints from the unchanged native x10-z20-v4 replay.
// A/B identify sampled endpoints; they are not building-floor identities.
const dayunViews = {
  a: {
    position: [-297.16, -6.228, 486.68],
    target: [-296.78018214235556, -6.056, 483.8353724857093],
  },
  b: {
    position: [-324.52000000000004, -0.932, 450.76],
    target: [-322.1901226009687, -1.928, 453.33092384605663],
  },
  connection: {
    position: [-306.11528066799025, -3.0878917891838715, 466.2952984373655],
    target: [-308.56753950274134, -3.832, 464.2473541954946],
  },
  "overlap-low": {
    position: [-669.08, -4.1, -301.4],
    target: [-669.08, -4.6, -296.4],
  },
  "overlap-high": {
    position: [-669.08, 1.74, -301.4],
    target: [-669.08, 1.24, -296.4],
  },
} as const;
const dayunViewName = params.get("dayunView"),
  inspection =
    dayun && dayunViewName && Object.hasOwn(dayunViews, dayunViewName)
      ? dayunViews[dayunViewName as keyof typeof dayunViews]
      : null;
const settings = structuredClone(id === "sdi-2026" ? sdi : apms) as any;
if (id === "apms-2026")
  settings.annotations = structuredClone(studio.experience.annotations);
settings.annotations = dayun
  ? []
  : settings.annotations.map((a: any) => withNavigationEnabled(a, true));
// Mixed capability fixture only; default remains the complete 42/25 target set.
if (params.has("mixed") && settings.annotations.length)
  settings.annotations[0] = withNavigationEnabled(
    settings.annotations[0],
    false,
  );
settings.animTracks = [];
settings.startMode = "default";
settings.cameras = [
  {
    initial: {
      position: inspection
        ? [...inspection.position]
        : dayun
          ? [-694.823644, 166.774502, -0.769584]
          : [scene.start.x, scene.start.y, scene.start.z],
      target: inspection
        ? [...inspection.target]
        : dayun
          ? [-359.567177, -51.547946, -127.010187]
          : [scene.viewTarget.x, scene.viewTarget.y, scene.viewTarget.z],
      fov: 75,
    },
  },
];
const dayunRoot = "/repository-data/Shenzhen/250917%20Dayun/";
let localInspection: ReturnType<typeof selectDayunInspectionSource> | null =
  null;
let originalManifestHash: string | null = null,
  localManifestHash: string | null = null;
const sha256 = async (bytes: Uint8Array) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes)),
    ),
  ]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
let inspectionContents: Promise<Response> | undefined;
let inspectionUrl: string | undefined;
let actualInspectionSourceMatches = false;
const inspectionDecode = {
  splats: 0,
  limit: 8_000_000,
  files: [] as { url: string; count: number; sha256: string }[],
};
if (inspection) {
  const response = await fetch(dayunRoot + "lod-meta.json", {
    cache: "no-store",
  });
  if (!response.ok) throw Error("Dayun original manifest unavailable");
  const bytes = new Uint8Array(await response.arrayBuffer());
  originalManifestHash = await sha256(bytes);
  localInspection = selectDayunInspectionSource(
    JSON.parse(new TextDecoder().decode(bytes)),
    inspection.position,
    6,
  );
  // The engine's octree parser fetches its URL independently of Asset.data and
  // prefetched contents. A real local manifest URL prevents full-scene reload.
  localInspection.manifest.filenames = localInspection.manifest.filenames.map(
    (file) =>
      new URL(file, new URL(dayunRoot + "lod-meta.json", location.href)).href,
  );
  // Whole SOG files are decoded even when only some of their leaf intervals are
  // selected. Check that separate budget before the Viewer requests textures.
  for (const index of localInspection.coverage.fileIndices) {
    const url = localInspection.manifest.filenames[index],
      response = await fetch(url, { cache: "no-store" });
    if (!response.ok) throw Error("Original local SOG metadata unavailable");
    const bytes = new Uint8Array(await response.arrayBuffer()),
      metadata = JSON.parse(new TextDecoder().decode(bytes));
    if (!Number.isSafeInteger(metadata.count) || metadata.count <= 0)
      throw Error("Invalid local SOG point count");
    inspectionDecode.splats += metadata.count;
    if (inspectionDecode.splats > inspectionDecode.limit)
      throw Error("Local inspection exceeds its whole-file decode budget");
    inspectionDecode.files.push({
      url,
      count: metadata.count,
      sha256: await sha256(bytes),
    });
  }
  const local = JSON.stringify(localInspection.manifest);
  localManifestHash = await sha256(new TextEncoder().encode(local));
  inspectionContents = Promise.resolve(
    new Response(local, { headers: { "Content-Type": "application/json" } }),
  );
  inspectionUrl = URL.createObjectURL(
    new Blob([local], { type: "application/json" }),
  );
  window.addEventListener("pagehide", (event) => {
    if (!event.persisted) URL.revokeObjectURL(inspectionUrl!);
  });
}
const trialId = params.get("trial");
const trial = trialId ? await loadTrialBundle(trialId, id) : null;
const viewer = await createViewer({
  container: document.querySelector("#viewer") as HTMLElement,
  contentUrl:
    inspectionUrl ?? (dayun ? dayunRoot + "lod-meta.json" : scene.assetUrl),
  ...(inspectionUrl ? { contentFilename: "lod-meta.json" } : {}),
  ...(inspectionContents ? { contents: inspectionContents } : {}),
  settings,
  ...(dayun
    ? {
        voxelManifestUrl: dayunRoot + "tiled-voxel/voxel-tiles.json",
        voxelCoordinateSpace: "metaflow-rz180" as const,
      }
    : {
        collisionUrl: trial?.collisionUrl ?? scene.collisionUrl,
        voxelCoordinateSpace: "world" as const,
        navigationManifestUrl:
          trial?.navigationManifestUrl ??
          `/navigation/${scene.id}/manifest.json`,
        navigationWorkerUrl,
      }),
  navigationMapUrl: inspection
    ? undefined
    : (trial?.navigationMapUrl ??
      `/mf97-maps/${dayun ? "dayun" : scene.id}/manifest.json`),
  ...(inspection ? { revealEffect: "none" as const } : {}),
  defaultCameraMode: dayun ? "fly" : "walk",
  experienceType: "scene",
  ui: true,
  noanim: true,
  noanalytics: true,
  renderer: "webgpu",
  budget: 1,
});
if (trial) {
  const label = document.createElement("div");
  label.style.cssText =
    "position:fixed;left:12px;bottom:64px;z-index:20;padding:8px 12px;color:white;background:#17212bd9;border-radius:8px;font:13px sans-serif";
  label.append(document.createTextNode("地面微修正试用 · 1 个体素 · "));
  const original = document.createElement("a");
  original.href = trial.originalUrl;
  original.textContent = "切回原碰撞与导航";
  original.style.color = "#8fd6ff";
  label.append(original);
  document.body.append(label);
}
if (inspection) {
  const label = document.createElement("div");
  label.textContent = `局部原件 LOD0 检查 · ${dayunViewName} · ±6m 源范围 · 楼层与通路尚未确认`;
  label.style.cssText =
    "position:fixed;left:12px;top:12px;z-index:20;padding:8px 12px;color:white;background:#17212bd9;border-radius:8px;font:13px sans-serif;pointer-events:none";
  document.body.append(label);
  viewer.app.assets.on("load", (asset: any) => {
    const tree = asset.resource?.octree;
    if (!tree) return;
    actualInspectionSourceMatches =
      tree.nodes.length === localInspection!.coverage.selectedLeaves &&
      asset.resource.numSplats === localInspection!.coverage.selectedSplats &&
      tree.lodLevels === 1 &&
      JSON.stringify(
        tree.nodes.map((node: any) => ({
          file: node.lods[0].fileIndex,
          offset: node.lods[0].offset,
          count: node.lods[0].count,
        })),
      ) === JSON.stringify(localInspection!.coverage.leafReferences);
    if (!actualInspectionSourceMatches) {
      viewer.destroy();
      throw Error(
        "Loaded octree differs from the bounded original source selection",
      );
    }
  });
  // Visual-only LOD/lens settings. Initial settings choose the observation pose;
  // nothing here writes physical state or reacts to map layer selection.
  viewer.app.on("prerender", () => {
    for (const splat of viewer.app.root.findComponents("gsplat") as any[]) {
      splat.lodRangeMin = 0;
      splat.lodRangeMax = 0;
    }
    for (const camera of viewer.app.root.findComponents("camera") as any[])
      camera.farClip = 6;
  });
}
const evidence: any[] = [];
let latest: any;
(window as any).mf97 = {
  viewer,
  evidence,
  trialBundle: trial?.bundle ?? null,
  dayunInspection: inspection
    ? {
        view: dayunViewName,
        lod: 0,
        farClip: 6,
        originalManifestHash,
        localManifestHash,
        coverage: localInspection?.coverage,
        decode: inspectionDecode,
        pose: {
          position: [...inspection.position],
          target: [...inspection.target],
        },
        get actualSourceMatches() {
          return actualInspectionSourceMatches;
        },
        proof: dayunViewName?.startsWith("overlap-")
          ? "dayun/overlap-native-x16-z8.json"
          : "dayun/recast-proof/x10-z20-v4.json",
        proofHash: dayunViewName?.startsWith("overlap-")
          ? "9df7057a27e205a923906fc04b0ff3cdc6cf92975f1246e29cd37aa2cda79666"
          : "c8b4f4b407f4ee7705e4341e5a6affceec8da7e53790785c4e6cd238d93551b1",
        collisionFingerprint:
          "cfbe6431889f55190146086e9642d82b18b9ca9068875e3d06f14c40504b070d",
        meaning: dayunViewName?.startsWith("overlap-")
          ? "native standing sample; floor and connection identities unconfirmed"
          : "native connection sample; floor identity unconfirmed",
      }
    : null,
  get actual() {
    return latest;
  },
};
viewer.events.on("walk:physics", (s: any) => {
  latest = s;
});
viewer.events.on("guidance:diagnostic", (e: any) => {
  evidence.push({ at: performance.now(), ...e });
  if (evidence.length > 256) evidence.shift();
});
viewer.events.on("guidance:arrived", (e: any) => evidence.push({ arrival: e }));
