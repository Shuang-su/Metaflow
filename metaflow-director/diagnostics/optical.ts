import { CandidateSession, type Pose } from "../src/render/session";
import { ApertureGpu } from "../src/render/aperture-gpu";
import { depthFixture } from "./fixture";
import { linearToSrgb } from "../src/render/srgb";
import { apertureDiameter } from "../src/render/optics";
const canvas = document.querySelector<HTMLCanvasElement>("#view")!,
  status = document.querySelector<HTMLElement>("#status")!;
const pose: Pose = {
  target: [0, 0, 0],
  yaw: 0,
  pitch: 0,
  roll: 0,
  distance: 7.5,
  fov: 50,
  focus: 7.5,
  focusPoint: null,
  blur: 30,
  dof: true,
  nearBlur: true,
  optics: { model: "aperture-v1", apertureScale: 1.05 },
};
const records: Record<
  string,
  {
    url?: string;
    pose: Pose;
  }
> = {
  depth: { pose },
  point: { pose },
  ramp: {
    url: "/fixture/depth-ramp.ply",
    pose: { ...pose, focus: 7.489091396331787 },
  },
  foreground: {
    url: "/fixture/depth-layers.ply",
    pose: {
      ...pose,
      target: [0, 0.03099998430814077, -0.011999998525721534],
      distance: 7.390753505706454,
      focus: 9.190753505706454,
      optics: { model: "aperture-v1", apertureScale: 1.0347054907989037 },
    },
  },
  portrait: {
    url: "/data/ACG/AD05/260102%20165752%20AD05%20%E8%91%AC%E9%80%81%E7%9A%84%E8%8A%99%E8%8E%89%E8%8E%B2%20%E8%8A%99%E8%8E%89%E8%8E%B2%E8%BE%9B%E7%BE%8E%E5%B0%94/260102%20165752%20AD05%20Frieren.sog",
    pose: {
      ...pose,
      target: [-3.3197491396347583, 0.7199845518052846, 2.0659918219468487],
      yaw: -39.9599571463798,
      pitch: 6.159995695157629,
      distance: 1.041324084470951,
      fov: 75,
      focus: 6.202818393707275,
      optics: { model: "aperture-v1", apertureScale: 0.14578537182593315 },
    },
  },
  interior: {
    url: "/data/SZMG/251217%20%E5%B9%BF%E7%94%B5%E5%A4%A7%E5%8E%A66%E6%A5%BC%E6%BC%94%E6%92%AD%E5%AE%A4/SZMG6L.sog",
    pose: {
      ...pose,
      target: [9.126799157443136, 0.7043933191142095, 4.3351272620044705],
      yaw: 47.99997320223851,
      pitch: 4.600002942218457,
      distance: 0.4909308878176911,
      fov: 65,
      focus: 16.044418334960938,
      optics: { model: "aperture-v1", apertureScale: 0.06873032429447676 },
    },
  },
};
const s = await CandidateSession.create(canvas);
s.background = "#000000";
s.presentation = () => {};
let current = pose;
async function load(label: string) {
  const record = records[label];
  status.textContent = "正在加载 " + label;
  const bytes = record.url
    ? await (await fetch(record.url)).arrayBuffer()
    : depthFixture(label === "point");
  const hash = [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
  await s.loadScene(
    [{ name: record.url?.split("/").pop() ?? "depth.ply", bytes }],
    record.pose,
  );
  current = structuredClone(record.pose);
  status.textContent = `已加载 ${label} · ${s.splat.numSplats} 点 · ${hash}`;
  return { hash, points: s.splat.numSplats, pose: current };
}
function image(frame: { width: number; height: number; pixels: Uint8Array }) {
  const c = document.createElement("canvas");
  c.width = frame.width;
  c.height = frame.height;
  c.getContext("2d")!.putImageData(
    new ImageData(new Uint8ClampedArray(frame.pixels), c.width, c.height),
    0,
    0,
  );
  return c.toDataURL("image/png");
}
function moments(raw: Float32Array) {
  let mass = 0,
    x = 0,
    y = 0,
    xx = 0,
    yy = 0;
  for (let j = 0; j < 540; j++)
    for (let i = 0; i < 960; i++) {
      const w = raw[(j * 960 + i) * 4];
      mass += w;
      x += w * i;
      y += w * j;
      xx += w * i * i;
      yy += w * j * j;
    }
  return {
    mass,
    x: x / mass,
    y: y / mass,
    varX: xx / mass - (x / mass) ** 2,
    varY: yy / mass - (y / mass) ** 2,
  };
}
async function fastMetrics() {
  const png = await sharp(true);
  return { png, moments: moments((await s.read()).raw as Float32Array) };
}
async function sharp(fast = false) {
  s.legacyFast = fast;
  await s.render({ ...current, dof: fast });
  s.legacyFast = false;
  const display = new ApertureGpu(s.device, 960, 540, true, true);
  display.setSource(s.scene.camera.colorTarget.colorBuffer);
  const frame = await display.read();
  s.device.frameStart();
  display.present();
  s.device.frameEnd();
  await s.device.wgpu.queue.onSubmittedWorkDone();
  display.destroy();
  status.textContent = fast ? "调整预览" : "清晰原片";
  return image(frame);
}
async function stages(target = 512) {
  s.cancel();
  const results = [];
  const cpu = new Float64Array(960 * 540 * 4);
  let samples = 0;
  for (const n of [4, 8, 16, 32, 64, 128, 256, 512].filter(
    (x) => x <= target,
  )) {
    const started = performance.now();
    await s.advance(current, 960, 540, n - samples, true, undefined, (raw) => {
      for (let i = 0; i < raw.length; i++) cpu[i] += raw[i];
      samples++;
    });
    const frame = await s.readAperture(),
      linear = await s.readApertureLinear();
    let max = 0,
      mae = 0;
    for (let i = 0; i < linear.length; i++) {
      const d = Math.abs(linear[i] - cpu[i] / samples);
      max = Math.max(max, d);
      mae += d;
    }
    const cpuPixels = new Uint8Array(frame.pixels.length);
    for (let i = 0; i < cpuPixels.length; i += 4) {
      const a = cpu[i + 3] / samples;
      for (let c = 0; c < 3; c++)
        cpuPixels[i + c] = Math.round(
          255 *
            Math.max(
              0,
              Math.min(
                1,
                linearToSrgb(cpu[i + c] / samples / Math.max(a, 0.000001)),
              ),
            ),
        );
      cpuPixels[i + 3] = Math.round(255 * a);
    }
    const encodedError = (flip: boolean) => {
      let max = 0,
        sum = 0;
      for (let y = 0; y < 540; y++)
        for (let x = 0; x < 960 * 4; x++) {
          const d = Math.abs(
            cpuPixels[(flip ? 539 - y : y) * 960 * 4 + x] -
              frame.pixels[y * 960 * 4 + x],
          );
          max = Math.max(max, d);
          sum += d;
        }
      return { max, mae: sum / cpuPixels.length };
    };
    const direct = encodedError(false),
      flipped = encodedError(true),
      flip = flipped.mae < direct.mae;
    if (flip) {
      const row = 960 * 4;
      for (let y = 0; y < 270; y++) {
        const a = cpuPixels.slice(y * row, (y + 1) * row),
          other = (539 - y) * row;
        cpuPixels.copyWithin(y * row, other, other + row);
        cpuPixels.set(a, other);
      }
    }
    results.push({
      n,
      ms: performance.now() - started,
      cpuMax: max,
      cpuMae: mae / linear.length,
      cpuEncoded: flip ? flipped : direct,
      cpuReadbackFlipY: flip,
      moments: moments(linear),
      camera: frame.cameraSnapshot,
      timing: frame.timing,
      png: image(frame),
      cpuPng: n >= 128 ? image({ ...frame, pixels: cpuPixels }) : undefined,
    });
    status.textContent = `成片 ${n}/${target}`;
  }
  return results;
}
async function order() {
  const r: any = s.scene.projectedSplatRenderer;
  const n = (await r.splatCounter.read(0, 4, new Uint32Array(1), true))[0];
  const ids = await r.material
    .getParameter("sortedIndices")
    .data.read(0, n * 4, new Uint32Array(n), true);
  const cache = await r.cacheA.read(0, 0, r.cacheA.width, r.cacheA.height, {
    immediate: true,
  });
  const f = new Float32Array(cache.buffer);
  return {
    near: s.scene.camera.near,
    far: s.scene.camera.far,
    entries: [...ids].map((id: number) => ({ id, depth: f[id * 4 + 1] })),
  };
}
let job: any = null;
function start(label: string) {
  if (job?.state === "running") throw Error("诊断任务正在执行");
  job = { label, state: "running", started: performance.now() };
  void (async () => {
    try {
      const model = await load(label),
        clear = await sharp(),
        fast = await fastMetrics(),
        frames = await stages(512);
      job = {
        ...job,
        state: "complete",
        ms: performance.now() - job.started,
        model,
        diameter: apertureDiameter(current.optics as any, current.blur),
        clear,
        fast,
        frames,
      };
    } catch (error) {
      job = { ...job, state: "failed", error: String(error) };
    }
  })();
  return { label, state: job.state };
}
function repeatStart() {
  if (job?.state === "running") throw Error("诊断任务正在执行");
  job = {
    label: "repeat",
    state: "running",
    started: performance.now(),
    results: [],
  };
  void (async () => {
    try {
      for (const label of ["foreground", "ramp", "portrait", "interior"]) {
        const model = await load(label);
        let base: Uint8Array | null = null;
        const runs = [];
        for (let i = 0; i < 10; i++) {
          const started = performance.now();
          await s.accumulate(current, 960, 540, 128);
          const frame = await s.readAperture();
          const hash = [
            ...new Uint8Array(
              await crypto.subtle.digest("SHA-256", frame.pixels),
            ),
          ]
            .map((x) => x.toString(16).padStart(2, "0"))
            .join("");
          let max = 0,
            changed = 0;
          if (base)
            for (let k = 0; k < base.length; k++) {
              const d = Math.abs(base[k] - frame.pixels[k]);
              max = Math.max(max, d);
              if (d) changed++;
            }
          else base = new Uint8Array(frame.pixels);
          runs.push({ i, ms: performance.now() - started, hash, max, changed });
          status.textContent = `重复性 ${label} ${i + 1}/10`;
        }
        job.results.push({ label, model, runs });
      }
      job = { ...job, state: "complete", ms: performance.now() - job.started };
    } catch (error) {
      job = { ...job, state: "failed", error: String(error) };
    }
  })();
  return { state: job.state };
}
const api = {
  session: s,
  records,
  load,
  sharp,
  stages,
  order,
  image,
  fastMetrics,
  start,
  repeatStart,
  job: () => job,
  current: () => structuredClone(current),
};
Object.assign(window, { __opticalParity: api });
status.textContent = "诊断已就绪";
document
  .querySelectorAll("button")
  .forEach((button) => (button.disabled = false));
document
  .querySelector("#load")!
  .addEventListener(
    "click",
    () =>
      void load(
        (document.querySelector("#scene") as HTMLSelectElement).value,
      ).catch((e) => (status.textContent = String(e))),
  );
document
  .querySelector("#sharp")!
  .addEventListener(
    "click",
    () => void sharp().catch((e) => (status.textContent = String(e))),
  );
document
  .querySelector("#fast")!
  .addEventListener(
    "click",
    () => void sharp(true).catch((e) => (status.textContent = String(e))),
  );
document
  .querySelector("#aperture")!
  .addEventListener(
    "click",
    () => void stages(128).catch((e) => (status.textContent = String(e))),
  );
