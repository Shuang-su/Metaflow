import {
  changeControls,
  controlsFor,
  type CameraControls,
} from "./camera-controls";
export type Vec3Tuple = [number, number, number];
export type Pose = {
  optics?: { model: "splat-v1" | "aperture-v1"; apertureScale: number };
  controls?: CameraControls;
  continuousRotation?: boolean;
  target: Vec3Tuple;
  yaw: number;
  pitch: number;
  roll: number;
  distance: number;
  fov: number;
  focus: number;
  focusInfinity?: boolean;
  focusPoint: Vec3Tuple | null;
  focusRange: number;
  blur: number;
  nearBlur: boolean;
  dof: boolean;
};
export type Keyframe = { id: string; time: number; pose: Pose };
export type Transition = {
  kind: "cut" | "fade" | "push" | "zoom";
  duration: number;
  direction?: "left" | "right" | "up" | "down" | "in" | "out";
};
export type Shot = {
  interestAreas?: ({
    x: number;
    y: number;
    width: number;
    height: number;
  } | null)[];
  interestPoints?: Vec3Tuple[];
  exitTransition?: Transition;
  id: string;
  name: string;
  assetId: string;
  duration: number;
  keys: Keyframe[];
  easing: [number, number, number, number];
  transition: Transition;
};
export type AssetInfo = {
  id: string;
  name: string;
  size: number;
  format: "sog" | "ply";
  hash: string;
  thumbnail?: string;
};
export type Project = {
  version: 3 | 4;
  frame?: {
    rounding: number;
    enabled: boolean;
    width: number;
    color: string;
    style: "solid" | "tab";
  };
  name: string;
  assets: AssetInfo[];
  shots: Shot[];
  aspect: string;
  mobileCanvasFill?: boolean;
  backdrop: string;
  backdropMode?: "color" | "image";
  backdropImage?: { name: string; dataUrl: string };
  border: number;
  shadow: number;
};
export const uid = () => crypto.randomUUID();
export const clamp = (n: number, min: number, max: number) =>
  Math.max(min, Math.min(max, n));
export const DEFAULT_POSE: Pose = {
  optics: { model: "aperture-v1", apertureScale: 0.84 },
  target: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  roll: 0,
  distance: 6,
  fov: 50,
  focus: 6,
  focusPoint: null,
  focusRange: 1,
  blur: 4,
  nearBlur: true,
  dof: true,
};
export const createProject = (): Project => ({
  version: 4,
  frame: {
    rounding: 12,
    enabled: false,
    width: 6,
    color: "#000000",
    style: "solid",
  },
  name: "Untitled project",
  assets: [],
  shots: [],
  aspect: "16:9",
  mobileCanvasFill: true,
  backdrop: "#ffffff",
  border: 0,
  shadow: 0,
});
export const makeShot = (
  assetId: string,
  pose: Pose,
  name = "Scene 1",
): Shot => ({
  id: uid(),
  name,
  assetId,
  duration: 3,
  keys: [
    { id: uid(), time: 0, pose: structuredClone(pose) },
    { id: uid(), time: 3, pose: structuredClone(pose) },
  ],
  easing: [0.25, 0.1, 0.25, 1],
  transition: { kind: "cut", duration: 0.5 },
});
export function cubicBezier(t: number, curve: Shot["easing"]) {
  const [x1, y1, x2, y2] = curve;
  const f = (u: number, a: number, b: number) =>
    3 * (1 - u) * (1 - u) * u * a + 3 * (1 - u) * u * u * b + u * u * u;
  let l = 0,
    r = 1;
  for (let i = 0; i < 24; i++) {
    const m = (l + r) / 2;
    if (f(m, x1, x2) < t) l = m;
    else r = m;
  }
  return f((l + r) / 2, y1, y2);
}
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
const angle = (a: number, b: number, t: number) =>
  a + (((((b - a) % 360) + 540) % 360) - 180) * t;
export function interpolatePose(a: Pose, b: Pose, t: number): Pose {
  const p = structuredClone(a);
  if (a.optics && b.optics)
    p.optics = {
      model: "aperture-v1",
      apertureScale: mix(a.optics.apertureScale, b.optics.apertureScale, t),
    };
  for (const k of ["distance", "fov", "focus", "focusRange", "blur"] as const)
    p[k] = mix(a[k], b[k], t);
  if (a.focusInfinity || b.focusInfinity) {
    const inverse = mix(
      a.focusInfinity ? 0 : 1 / Math.max(1e-6, a.focus),
      b.focusInfinity ? 0 : 1 / Math.max(1e-6, b.focus),
      t,
    );
    p.focusInfinity = inverse === 0;
    p.focus = inverse === 0 ? a.focus : Math.min(1e9, 1 / inverse);
  }
  p.target = a.target.map((v, i) => mix(v, b.target[i], t)) as Vec3Tuple;
  for (const k of ["yaw", "pitch", "roll"] as const)
    p[k] =
      a.continuousRotation || b.continuousRotation
        ? mix(a[k], b[k], t)
        : angle(a[k], b[k], t);
  if (a.continuousRotation || b.continuousRotation) p.continuousRotation = true;
  if (a.controls || b.controls) {
    const from = controlsFor(a),
      to = controlsFor(b);
    p.controls = { ...from };
    for (const k of [
      "blurAmount",
      "zoom",
      "perspective",
      "zoomBaseline",
      "baseFov",
      "baseDistance",
    ] as const)
      p.controls[k] = mix(from[k], to[k], t);
    if (t >= 1) p.controls.focusMode = to.focusMode;
    const resolved = changeControls(p, {
      zoom: p.controls.zoom,
      perspective: p.controls.perspective,
    });
    p.fov = resolved.fov;
    p.distance = resolved.distance;
    p.blur = p.controls.blurAmount * 0.3;
  }
  p.focusPoint =
    a.focusPoint && b.focusPoint
      ? (a.focusPoint.map((v, i) => mix(v, b.focusPoint![i], t)) as Vec3Tuple)
      : a.focusPoint
        ? [...a.focusPoint]
        : null;
  if (t >= 1) {
    p.optics = b.optics ? { ...b.optics } : undefined;
    p.nearBlur = b.nearBlur;
    p.dof = b.dof;
    p.focusPoint = b.focusPoint;
  }
  return p;
}
export function poseAt(shot: Shot, time: number): Pose {
  const keys = [...shot.keys].sort((a, b) => a.time - b.time);
  if (!keys.length) throw new Error("镜头缺少机位");
  if (time <= keys[0].time) return structuredClone(keys[0].pose);
  const right = keys.findIndex((k) => k.time > time);
  if (right < 0) return structuredClone(keys[keys.length - 1].pose);
  const a = keys[right - 1],
    b = keys[right];
  return interpolatePose(
    a.pose,
    b.pose,
    cubicBezier(clamp((time - a.time) / (b.time - a.time), 0, 1), shot.easing),
  );
}
export function transitionDuration(shots: Shot[], i: number) {
  if (i < 1 || shots[i].transition.kind === "cut") return 0;
  return Math.min(
    shots[i].transition.duration,
    shots[i - 1].duration / 2,
    shots[i].duration / 2,
  );
}
export function layoutShots(shots: Shot[]) {
  let end = 0;
  return shots.map((shot, i) => {
    const overlap = transitionDuration(shots, i);
    const start = end - overlap;
    end = start + shot.duration;
    return { shot, start, end, overlap };
  });
}
export function totalDuration(shots: Shot[]) {
  return layoutShots(shots).at(-1)?.end ?? 0;
}
export function evaluate(shots: Shot[], t: number) {
  const layout = layoutShots(shots);
  if (!layout.length) return null;
  const time = clamp(t, 0, layout.at(-1)!.end);
  let i = layout.findLastIndex((x) => x.start <= time);
  i = Math.max(0, i);
  const current = layout[i];
  const local = clamp(time - current.start, 0, current.shot.duration);
  const transition = i > 0 && local < current.overlap;
  return {
    shot: current.shot,
    pose: poseAt(current.shot, local),
    local,
    index: i,
    previous: transition ? layout[i - 1].shot : null,
    previousPose: transition
      ? poseAt(layout[i - 1].shot, time - layout[i - 1].start)
      : null,
    blend: transition ? local / current.overlap : 1,
    entryBlend:
      i === 0 && current.shot.transition.kind !== "cut"
        ? clamp(
            local /
              Math.max(
                0.000001,
                Math.min(
                  current.shot.transition.duration,
                  current.shot.duration / 2,
                ),
              ),
            0,
            1,
          )
        : 1,
    exitBlend:
      current.shot.exitTransition && current.shot.exitTransition.kind !== "cut"
        ? clamp(
            (current.shot.duration - local) /
              Math.max(
                0.000001,
                Math.min(
                  current.shot.exitTransition.duration,
                  current.shot.duration / 2,
                ),
              ),
            0,
            1,
          )
        : 1,
  };
}
export function frameGeometry(project: Project, width: number, height: number) {
  project = {
    ...project,
    frame: project.frame
      ? { ...project.frame, rounding: 0, style: "solid" }
      : undefined,
    shadow: 0,
  };
  const margin = (project.border / 100) * Math.min(width, height),
    scale = Math.min(width, height) / 1080;
  const f = project.frame,
    border = f?.enabled ? f.width * scale : 0;
  const tab = f?.enabled && f.style === "tab" ? 36 * scale : 0;
  return {
    x: margin + border,
    y: margin + border + tab,
    width: width - 2 * (margin + border),
    height: height - 2 * (margin + border) - tab,
    margin,
    border,
    tab,
    rounding: (f?.rounding ?? 0) * scale,
    scale,
  };
}
export function projectPointToSceneUV(
  project: Project,
  x: number,
  y: number,
  width: number,
  height: number,
): [number, number] | null {
  const r = frameGeometry(project, width, height),
    px = x * width,
    py = y * height;
  if (px < r.x || py < r.y || px > r.x + r.width || py > r.y + r.height)
    return null;
  return [(px - r.x) / r.width, (py - r.y) / r.height];
}
export function resizeShot(shot: Shot, duration: number): Shot {
  const d = clamp(duration, 0.25, 3600);
  return {
    ...shot,
    duration: d,
    keys: shot.keys.map((k) => ({ ...k, time: (k.time / shot.duration) * d })),
  };
}

/** The observed camera-position editor inserts after the selected position,
 * interpolates the next view, and redistributes the sequence over the shot. */
export function insertCameraPosition(
  shot: Shot,
  time: number,
  workingPose?: Pose,
) {
  const result = structuredClone(shot);
  result.keys.sort((a, b) => a.time - b.time);
  const selected = result.keys.reduce(
    (best, key, i) =>
      Math.abs(key.time - time) < Math.abs(result.keys[best].time - time)
        ? i
        : best,
    0,
  );
  if (workingPose) result.keys[selected].pose = structuredClone(workingPose);
  const after = selected + 1,
    a = result.keys[selected].pose,
    b = result.keys[after]?.pose;
  result.keys.splice(after, 0, {
    id: uid(),
    time: 0,
    pose: b ? interpolatePose(a, b, 0.5) : structuredClone(a),
  });
  result.keys.forEach((key, i) => {
    key.time = (shot.duration * i) / (result.keys.length - 1);
  });
  return { shot: result, time: result.keys[after].time };
}

export function removeCameraPosition(shot: Shot, time: number) {
  if (shot.keys.length <= 2) return { shot: structuredClone(shot), time };
  const result = structuredClone(shot);
  result.keys.sort((a, b) => a.time - b.time);
  const selected = result.keys.reduce(
    (best, key, i) =>
      Math.abs(key.time - time) < Math.abs(result.keys[best].time - time)
        ? i
        : best,
    0,
  );
  result.keys.splice(selected, 1);
  result.keys.forEach((key, i) => {
    key.time = (shot.duration * i) / (result.keys.length - 1);
  });
  return {
    shot: result,
    time: result.keys[Math.min(selected, result.keys.length - 1)].time,
  };
}
export function outputSize(
  aspect: string,
  shortSide: number,
): [number, number] {
  const [a, b] = aspect.split(":").map(Number);
  const even = (v: number) => Math.round(v / 2) * 2;
  return a >= b
    ? [even((shortSide * a) / b), shortSide]
    : [shortSide, even((shortSide * b) / a)];
}
export const frameCount = (duration: number, fps: number) =>
  Math.ceil(duration * fps - 1e-8);
export type SavedCamera = {
  position: Vec3Tuple;
  target: Vec3Tuple;
  fov?: number;
};
export function poseFromCamera(
  camera: SavedCamera | undefined | null,
  fallback: Pose,
): Pose {
  if (
    !camera ||
    !Array.isArray(camera.position) ||
    !Array.isArray(camera.target) ||
    camera.position.length !== 3 ||
    camera.target.length !== 3 ||
    ![...camera.position, ...camera.target].every(Number.isFinite)
  )
    return fallback;
  const [x, y, z] = camera.position.map((v, i) => v - camera.target[i]),
    distance = Math.hypot(x, y, z);
  if (distance < 0.000001) return fallback;
  return {
    ...fallback,
    target: [...camera.target],
    yaw: (Math.atan2(x, z) * 180) / Math.PI,
    pitch: (Math.asin(y / distance) * 180) / Math.PI,
    distance,
    focus: distance,
    focusRange: distance * 0.1,
    fov:
      typeof camera.fov === "number" ? clamp(camera.fov, 1, 179) : fallback.fov,
  };
}

export function frameToSceneUV(
  x: number,
  y: number,
  width: number,
  height: number,
  border: number,
): [number, number] | null {
  const margin = (border / 100) * Math.min(width, height),
    w = width - margin * 2,
    h = height - margin * 2;
  if (w <= 0 || h <= 0) return null;
  const u = (x * width - margin) / w,
    v = (y * height - margin) / h;
  return u >= 0 && u <= 1 && v >= 0 && v <= 1 ? [u, v] : null;
}

/** A drop targets the gap immediately before the target shot in either direction. */
export function moveShotBefore(shots: Shot[], id: string, target: string) {
  const from = shots.findIndex((shot) => shot.id === id);
  const to = shots.findIndex((shot) => shot.id === target);
  if (from < 0 || to < 0 || from === to) return;
  const [shot] = shots.splice(from, 1);
  shots.splice(to - (from < to ? 1 : 0), 0, shot);
}
