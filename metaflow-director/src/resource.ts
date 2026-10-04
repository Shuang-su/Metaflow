import { importSettings } from "../../metaflow-viewer/src/settings";
import {
  resolveDirectorResource,
  resourceDataUrl,
  handoffIdentity,
  readDirectorPosition,
  validDirectorPosition,
  type DirectorResource,
} from "../../metaflow-viewer/src/director-handoff";
import { DEFAULT_POSE, poseFromCamera, type Pose } from "./core/model";
import { controlsFor } from "./core/camera-controls";
export type ResourceScene = {
  resource: DirectorResource;
  pose: Pose;
  background: string;
  cameraSource: "viewer" | "settings";
  assets: { name: string; bytes: ArrayBuffer }[];
};
async function response(url: string, signal: AbortSignal) {
  const r = await fetch(url, { signal });
  if (!r.ok) throw Error(`资源加载失败（HTTP ${r.status}）：${url}`);
  return r;
}
export async function loadResource(
  path: string,
  signal: AbortSignal,
  progress: (message: string) => void,
): Promise<ResourceScene> {
  progress("读取资源目录…");
  const index = await (await response("/data/index.json", signal)).json();
  const resource = resolveDirectorResource(index.resources ?? [], path);
  progress(`读取 ${resource.title ?? resource.id} 的相机设置…`);
  const raw = await (
    await response(resourceDataUrl(resource.files.settings!), signal)
  ).json();
  const settings = importSettings(raw);
  let current = null;
  try {
    current = readDirectorPosition(sessionStorage, handoffIdentity(resource));
  } catch {
    /* Restricted storage falls back to settings. */
  }
  const initial =
    raw.version === undefined ? raw.camera : raw.cameras?.[0]?.initial;
  const camera =
    current ??
    (validDirectorPosition(initial) ? settings.cameras?.[0]?.initial : null);
  if (!validDirectorPosition(camera))
    throw Error("此资源没有有效的 Viewer 机位或 JSON 初始机位，无法开始摄影");
  // FOV, roll and aperture belong to Director; only position/target cross the boundary.
  const pose = poseFromCamera(
    { position: camera.position, target: camera.target },
    structuredClone(DEFAULT_POSE),
  );
  pose.focusPoint = [...camera.target];
  pose.focusInfinity = false;
  pose.optics = { model: "aperture-v1", apertureScale: pose.distance * 0.14 };
  pose.controls = { ...controlsFor(pose), focusMode: "manual" };
  const color = settings.background?.color;
  if (!Array.isArray(color) || color.length < 3)
    throw Error("此资源未提供支持的背景颜色");
  const background =
    "#" +
    color
      .slice(0, 3)
      .map((v) =>
        Math.round(Math.max(0, Math.min(1, v)) * 255)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("");
  const files = [
    ["主体", resource.files.model!],
    ...(resource.files.environment
      ? [["环境", resource.files.environment]]
      : []),
  ];
  const assets = [];
  for (let i = 0; i < files.length; i++) {
    const [role, file] = files[i];
    progress(`加载${role}模型（${i + 1}/${files.length}）…`);
    try {
      assets.push({
        name: `${i}-${file.split("/").at(-1)}`,
        bytes: await (
          await response(resourceDataUrl(file), signal)
        ).arrayBuffer(),
      });
    } catch (e) {
      if (signal.aborted) throw e;
      throw Error(`${role}模型未能完整加载。${(e as Error).message}。请重试。`);
    }
  }
  signal.throwIfAborted();
  return {
    resource,
    pose,
    background,
    cameraSource: current ? "viewer" : "settings",
    assets,
  };
}
