import { createViewer } from "../../metaflow-viewer/src/index";
import "../../metaflow-viewer/public/index.css";
import scenes from "../scene-exhibitions.json";
import apms from "../apms.settings.json";
import studio from "../apms-markers-42.mfstudio.json";
import sdi from "../sdi-25.settings.json";
import navigationWorkerUrl from "./worker.ts?worker&url";
const params = new URLSearchParams(location.search),
  scene =
    scenes.scenes.find((s) => s.id === (params.get("scene") ?? "apms-2026")) ??
    scenes.scenes[0];
const settings = structuredClone(scene.id === "apms-2026" ? apms : sdi) as any;
if (scene.id === "apms-2026")
  settings.annotations = studio.experience.annotations;
settings.cameras = [
  {
    initial: {
      position: [scene.start.x, scene.start.y, scene.start.z],
      target: [scene.viewTarget.x, scene.viewTarget.y, scene.viewTarget.z],
      fov: 75,
    },
  },
];
const viewer = await createViewer({
  container: document.querySelector("#viewer") as HTMLElement,
  contentUrl: scene.assetUrl,
  settings,
  collisionUrl: scene.collisionUrl,
  voxelCoordinateSpace: "world",
  navigationManifestUrl: `/navigation/${scene.id}/manifest.json`,
  navigationWorkerUrl,
  defaultCameraMode: "walk",
  experienceType: "scene",
  ui: true,
  noanim: true,
  noanalytics: true,
  renderer: "webgpu",
  budget: params.has("qa-budget") ? Math.max(0.25, Math.min(1, Number(params.get("qa-budget")) || 1)) : 1,
});
// Preview-only diagnostics; no replacement motion, camera setter or autoplay.
const evidence: any[] = [];
(window as any).mf79 = {
  viewer,
  evidence,
  get actual() {
    return latest;
  },
};
let latest: any;
viewer.events.on("walk:physics", (s: any) => {
  latest = s;
});
viewer.events.on("guidance:diagnostic", (e: any) => {
  evidence.push({ at: performance.now(), ...e });
  if (evidence.length > 256) evidence.shift();
});
viewer.events.on("guidance:arrived", (e: any) => evidence.push({ arrival: e }));
