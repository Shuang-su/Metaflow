import { createViewer } from "../../metaflow-viewer/src/index";
import "virtual:mf97-viewer-styles";
import { withNavigationEnabled } from "../../metaflow-viewer/src/navigation/nav-annotation";
import scenes from "../../mf79-viewer-trial/scene-exhibitions.json";
import apms from "../../mf79-viewer-trial/apms.settings.json";
import studio from "../../mf79-viewer-trial/apms-markers-42.mfstudio.json";
import sdi from "../../mf79-viewer-trial/sdi-25.settings.json";
const params = new URLSearchParams(location.search),
  id = params.get("scene") ?? "apms-2026",
  dayun = id === "dayun";
const scene = scenes.scenes.find((s) => s.id === id) ?? scenes.scenes[0];
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
      position: dayun
        ? [-694.823644, 166.774502, -0.769584]
        : [scene.start.x, scene.start.y, scene.start.z],
      target: dayun
        ? [-359.567177, -51.547946, -127.010187]
        : [scene.viewTarget.x, scene.viewTarget.y, scene.viewTarget.z],
      fov: 75,
    },
  },
];
const dayunRoot = "/repository-data/Shenzhen/250917%20Dayun/";
const viewer = await createViewer({
  container: document.querySelector("#viewer") as HTMLElement,
  contentUrl: dayun ? dayunRoot + "lod-meta.json" : scene.assetUrl,
  settings,
  ...(dayun
    ? {
        voxelManifestUrl: dayunRoot + "tiled-voxel/voxel-tiles.json",
        voxelCoordinateSpace: "metaflow-rz180" as const,
      }
    : {
        collisionUrl: scene.collisionUrl,
        voxelCoordinateSpace: "world" as const,
        navigationManifestUrl: `/navigation/${scene.id}/manifest.json`,
        navigationWorkerUrl: new URL(
          "../../mf79-viewer-trial/src/worker.ts",
          import.meta.url,
        ).href,
      }),
  navigationMapUrl: `/mf97-maps/${dayun ? "dayun" : scene.id}/manifest.json`,
  defaultCameraMode: dayun ? "fly" : "walk",
  experienceType: "scene",
  ui: true,
  noanim: true,
  noanalytics: true,
  renderer: "webgpu",
  budget: 1,
});
const evidence: any[] = [];
let latest: any;
(window as any).mf97 = {
  viewer,
  evidence,
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
