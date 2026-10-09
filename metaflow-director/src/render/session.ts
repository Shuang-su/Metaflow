import { observeFailure, observeProfile } from "./device-events";
import { waitForGraphicsDevice, type DeviceStartup } from "./device-startup";
import { srgbToLinear } from "./srgb";
import { clippingRange } from "./clipping";
import { setScenePrecision } from "./precision-target";
import { ApertureGpu } from "./aperture-gpu";
import { FloatImage } from "./float-image";
import { OffscreenSurface } from "./offscreen-surface";
import {
  apertureDiameter,
  apertureSample,
  PROJECTED_KERNEL_VARIANCE,
} from "./optics";
import {
  Color,
  Entity,
  Vec3,
  GAMMA_NONE,
  GAMMA_SRGB,
  TONEMAP_NONE,
  createGraphicsDevice,
} from "playcanvas";
import { WebPCodec } from "@playcanvas/splat-transform";
import { Scene } from "@upstream/scene";
import { Events } from "@upstream/events";
import { CommandQueue } from "@upstream/command-queue";
import { getSceneConfig } from "@upstream/scene-config";
import { MappedReadFileSystem } from "@upstream/io/read/file-systems";
export type Pose = {
  target: number[];
  yaw: number;
  pitch: number;
  roll: number;
  distance: number;
  fov: number;
  focus: number;
  focusPoint?: number[] | null;
  focusInfinity?: boolean;
  blur: number;
  dof: boolean;
  nearBlur: boolean;
  continuousRotation?: boolean;
  optics: { model: string; apertureScale: number };
};
// Attached sessions share camera targets, projected caches and the GPU sorter.
// Serialize their commands even when a transition uses two aperture sessions.
const sceneTails = new WeakMap<Scene, Promise<unknown>>();
export class CandidateSession {
  scene: Scene;
  device: any;
  canvas: HTMLCanvasElement;
  pose: Pose;
  splat: any;
  radius = 1;
  generation = 0;
  sceneRevision = 0;
  profile = false;
  gpuTimings: { renderVersion: number; spanMs: number; passes: number[] }[] =
    [];
  strategy = "disabled";
  minimumPixelSize = 0;
  path = "native";
  precision: "packed" | "alpha" | "float32" = "float32";
  /** Historical diagnostics retain this switch; public adjustment uses previewFrame. */
  legacyFast = false;
  stableOrder = true;
  private apertureEpoch = 0;
  private job: any = null;
  private guide: FloatImage | null = null;
  private adjustment: FloatImage | null = null;
  private surface: OffscreenSurface | null = null;
  background = "#303030";
  private tail: Promise<unknown> = Promise.resolve();
  private accumulation = new AbortController();
  display: ApertureGpu | null = null;
  disposers: (() => void)[] = [];
  fs: any;
  disposed = false;
  private ownsScene = true;
  presentationControlsCanvas = true;
  /** Optional host-owned retained image, presented during intermediate batches. */
  presentation?: () => void;
  /** Attach to a page-owned scene; switching never reloads or disposes its assets. */
  static attach(scene: Scene) {
    const s = new CandidateSession();
    s.scene = scene;
    s.device = scene.graphicsDevice;
    s.canvas = s.device.canvas;
    s.path = "candidate";
    s.ownsScene = false;
    s.disposers.push(
      observeFailure(s.device.wgpu, (error) => {
        s.gpuError = error;
      }),
    );
    s.disposers.push(
      observeProfile(s.device.gpuProfiler, (version, timings, span) => {
        if (s.profile && timings && Number.isFinite(span)) {
          s.gpuTimings.push({
            renderVersion: version,
            spanMs: span!,
            passes: [...timings],
          });
          if (s.gpuTimings.length > 1024) s.gpuTimings.shift();
        }
      }),
    );
    s.radius = Math.max(0.01, scene.bound.halfExtents.length());
    return s;
  }
  async settled() {
    await this.tail;
  }
  async releaseFrameBuffers() {
    this.cancel();
    await this.tail;
    this.job?.gpu.destroy();
    this.job = null;
    this.display?.destroy();
    this.display = null;
    this.guide?.destroy();
    this.guide = null;
    this.adjustment?.destroy();
    this.adjustment = null;
    this.surface?.destroy();
    this.surface = null;
  }
  get apertureTexture() {
    return this.job?.gpu.texture ?? null;
  }
  private gpuError: Error | null = null;
  get needsDeviceRecovery() {
    return this.gpuError !== null;
  }
  static async create(canvas: HTMLCanvasElement, startup: DeviceStartup = {}) {
    startup.signal?.throwIfAborted();
    WebPCodec.wasmUrl = "/director/static/lib/webp/webp.wasm";
    const s = new CandidateSession();
    s.canvas = canvas;
    const creating = createGraphicsDevice(canvas, {
      deviceTypes: ["webgpu"],
      antialias: false,
      depth: false,
      stencil: false,
      // Let the browser select its available adapter. A power hint does not
      // establish rendering precision; the actual float capabilities are
      // checked below and by ResourceRuntime before photography is enabled.
      powerPreference: "default",
    });
    s.device = await waitForGraphicsDevice(creating, startup);
    if (!s.device.isWebGPU) {
      s.device.destroy();
      throw Error("摄影需要 WebGPU，请返回 Viewer");
    }
    s.disposers.push(
      observeFailure(s.device.wgpu, (error) => {
        s.gpuError = error;
      }),
    );
    const events = new Events();
    events.function("workbench.mode", () => "director");
    const defaults: any = {
      "view.perfOverlay": false,
      "view.overdraw": false,
      "view.bands": 3,
      "view.editView": false,
      "view.gaussians": true,
      "view.centers": false,
      "view.rings": false,
      "view.selectionCenters": false,
      "view.selectionRings": false,
      "view.centerSize": 3,
      "view.ringSize": 0,
      "view.outlineSelection": false,
      "view.splatsColorBlend": 0,
      "view.splatsSelectionBlend": 0,
      "view.centersColorBlend": 0,
      "view.centersSelectionBlend": 0,
      "view.ringsColorBlend": 0,
      "view.ringsSelectionBlend": 0,
      "view.selectionColor": false,
      selection: null,
      "selection.footprint": 1,
      "colorPanel.pending": null,
      "camera.poses": [],
      "camera.showPoses": false,
      "camera.bound": true,
      selectedClr: new Color(1, 1, 0, 1),
      unselectedClr: new Color(0, 0, 1, 0),
      lockedClr: new Color(1, 1, 1, 1),
    };
    for (const [k, v] of Object.entries(defaults)) events.function(k, () => v);
    events.function("view.stochastic", () =>
      s.path === "candidate" ? "disabled" : s.strategy,
    );
    events.function("view.minPixelSize", () =>
      s.scene?.lockedRenderMode ? 0 : s.path === "native" ? 2 : 0,
    );
    s.scene = new Scene(
      events,
      getSceneConfig([
        {
          show: { grid: false, bound: false },
          camera: { overlay: false, fov: 50 },
        },
      ]),
      canvas,
      s.device,
      new CommandQueue(),
    );
    s.scene.grid.visible = false;
    s.scene.underlay.enabled = false;
    s.scene.stochastic.warp = false;
    s.scene.camera.controller.destroy();
    s.scene.start();
    cancelAnimationFrame((s.scene.app as any).frameRequestId);
    (s.scene.app as any).frameRequestId = null;
    await Promise.resolve();
    return s;
  }
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const next = (sceneTails.get(this.scene) ?? this.tail).then(fn);
    this.tail = next.catch(() => {});
    sceneTails.set(this.scene, this.tail);
    return next;
  }
  cancel() {
    this.accumulation.abort();
    this.apertureEpoch++;
  }
  /** All declared scene members load together; missing environments never count as ready. */
  loadScene(
    assets: { name: string; bytes: ArrayBuffer }[],
    pose: Pose,
    signal?: AbortSignal,
  ) {
    this.cancel();
    const version = ++this.generation;
    return this.enqueue(async () => {
      this.scene.clear();
      this.splat = null;
      this.fs?.sources.forEach((source: any) => source.close());
      this.fs = new MappedReadFileSystem();
      assets.forEach((asset) =>
        this.fs.addFile(asset.name, new Blob([asset.bytes])),
      );
      let points = 0;
      try {
        for (const asset of assets) {
          signal?.throwIfAborted();
          const splat = await this.scene.assetLoader.load(asset.name, this.fs);
          if (this.disposed || version !== this.generation || signal?.aborted) {
            splat?.destroy();
            throw new DOMException("Superseded", "AbortError");
          }
          if (!splat) throw Error(`无法读取模型：${asset.name}`);
          splat.entity.setLocalEulerAngles(0, 0, 180);
          await this.scene.add(splat);
          points += splat.numSplats;
          this.splat ??= splat;
        }
        this.path = "candidate";
        this.precision = "float32";
        this.pose = structuredClone(pose);
        return { points, models: assets.length };
      } catch (error) {
        this.scene.clear();
        this.splat = null;
        throw error;
      }
    });
  }
  apply(p: Pose, width = 960, height = 540, fast = false) {
    this.pose = structuredClone(p);
    const camera = this.scene.camera;
    camera.renderOverlays = false;
    if (this.path === "candidate") camera.ortho = false;
    this.scene.canvasResize = null;
    // These are render pixels, not CSS pixels. In the shared workbench the
    // visible compositor owns the canvas; offscreen jobs only own their targets.
    if (
      this.ownsScene &&
      !this.presentationControlsCanvas &&
      (this.canvas.width !== width || this.canvas.height !== height)
    )
      this.device.setResolution(width, height);
    camera.startOffscreenMode(width, height);
    const precision = this.path === "candidate" ? this.precision : "packed";
    (this.scene as any).directorStableOrder =
      this.path === "candidate" && this.stableOrder;
    (this.scene as any).directorPrecision = { packed: 0, alpha: 1, float32: 2 }[
      precision
    ];
    setScenePrecision(camera, this.device, precision === "float32");
    const bg = new Color().fromString(this.background);
    if (this.path === "candidate") {
      bg.r = srgbToLinear(bg.r);
      bg.g = srgbToLinear(bg.g);
      bg.b = srgbToLinear(bg.b);
    }
    camera.clearPass.setClearColor(bg);
    const a = (p.yaw * Math.PI) / 180,
      b = (p.pitch * Math.PI) / 180,
      t = new Vec3(...p.target);
    const position = t
      .clone()
      .add(
        new Vec3(
          Math.sin(a) * Math.cos(b),
          Math.sin(b),
          Math.cos(a) * Math.cos(b),
        ).mulScalar(p.distance),
      );
    const e = new Entity();
    e.setPosition(position);
    e.lookAt(
      t,
      p.continuousRotation
        ? new Vec3(
            -Math.sin(a) * Math.sin(b),
            Math.cos(b),
            -Math.cos(a) * Math.sin(b),
          )
        : Vec3.UP,
    );
    e.rotateLocal(0, 0, p.roll);
    const bounds = (this.scene.elements as any[])
      .filter((s) => s.visible !== false && s.worldBound && s.filename)
      .map((s) => {
        const b = s.worldBound;
        return {
          min: [
            b.center.x - b.halfExtents.x,
            b.center.y - b.halfExtents.y,
            b.center.z - b.halfExtents.z,
          ],
          max: [
            b.center.x + b.halfExtents.x,
            b.center.y + b.halfExtents.y,
            b.center.z + b.halfExtents.z,
          ],
        };
      });
    const clip = clippingRange(
      bounds,
      [position.x, position.y, position.z],
      [e.forward.x, e.forward.y, e.forward.z],
    );
    this.radius = clip.radius;
    camera.setPoseOverride({
      position,
      rotation: e.getRotation().clone(),
      fov: p.fov,
      near: clip.near,
      far: clip.far,
    });
    e.destroy();
    camera.camera.gammaCorrection =
      this.path === "candidate" ? GAMMA_NONE : GAMMA_SRGB;
    camera.camera.toneMapping = TONEMAP_NONE;
    const focus = p.focusPoint
      ? new Vec3(...p.focusPoint).sub(position).dot(camera.mainCamera.forward)
      : p.focusInfinity
        ? 1e30
        : p.focus;
    (this.scene as any).directorOptics = [
      Math.max(camera.near, focus),
      apertureDiameter(p.optics as any, p.blur),
      this.path === "candidate" && (fast || this.legacyFast) && p.dof
        ? 1 / PROJECTED_KERNEL_VARIANCE
        : 0,
      p.nearBlur ? 1 : 0,
    ];
  }
  async frame(
    moving = false,
    signal?: AbortSignal,
    display: boolean | (() => void) = false,
    wait = true,
  ) {
    signal?.throwIfAborted();
    if (this.disposed) throw Error("Disposed");
    if (this.gpuError) throw this.gpuError;
    this.scene.forceInteracting = moving;
    this.scene.forceRender = !moving;
    this.scene.lockedRender = true;
    (this.scene as any).directorProfile =
      this.profile && !!(this.device as any).supportsTimestampQuery;
    const start = performance.now();
    this.scene.app.update(0);
    // One app frame and one profiler report: a second frameStart/frameEnd for
    // presentation would feed only the final blit time into upstream Auto.
    const present = () =>
      typeof display === "function" ? display() : this.present(true);
    if (display) this.scene.app.once("postrender", present);
    try {
      if (this.path === "candidate" && this.presentation) {
        this.surface ??= new OffscreenSurface(this.device);
        this.surface.run(() => this.scene.app.render());
      } else this.scene.app.render();
    } finally {
      this.scene.app.off("postrender", present);
    }
    this.device.submit();
    const cpu = performance.now() - start;
    if (wait) await this.device.wgpu.queue.onSubmittedWorkDone();
    signal?.throwIfAborted();
    if (this.gpuError) throw this.gpuError;
    return { cpu, completed: performance.now() - start };
  }
  render(p = this.pose, width = 960, height = 540, signal?: AbortSignal) {
    this.cancel();
    const generation = this.generation;
    return this.enqueue(async () => {
      if (generation !== this.generation)
        throw new DOMException("Superseded", "AbortError");
      return this.renderNow(p, width, height, signal);
    });
  }
  private async renderNow(
    p: Pose,
    width: number,
    height: number,
    signal?: AbortSignal,
  ) {
    this.apply(p, width, height);
    await this.frame(false, signal);
    return this.read();
  }
  /** One centered float splat preview, never an aperture sample or readback. */
  previewFrame(p: Pose, width: number, height: number) {
    const generation = this.generation,
      revision = this.sceneRevision,
      epoch = this.apertureEpoch;
    return this.enqueue(async () => {
      const valid = () => {
        if (
          this.disposed ||
          generation !== this.generation ||
          revision !== this.sceneRevision ||
          epoch !== this.apertureEpoch
        )
          throw new DOMException("Superseded", "AbortError");
      };
      valid();
      if (
        !this.adjustment ||
        this.adjustment.width !== width ||
        this.adjustment.height !== height
      ) {
        this.adjustment?.destroy();
        this.adjustment = new FloatImage(this.device, width, height);
      }
      this.apply(p, width, height, true);
      this.scene.lockedRenderMode = true;
      try {
        await this.frame(false, undefined, () => {
          this.adjustment!.copy(this.scene.camera.colorTarget.colorBuffer);
          this.presentation?.();
        });
        valid();
        return this.adjustment.texture;
      } finally {
        this.scene.lockedRenderMode = false;
        this.apply(p, width, height);
      }
    });
  }
  /** Clear geometry produces an alpha-weighted optical warning, independent of accumulation. */
  peakingMask(p: Pose, width: number, height: number) {
    const generation = this.generation,
      revision = this.sceneRevision;
    return this.enqueue(async () => {
      if (
        this.disposed ||
        generation !== this.generation ||
        revision !== this.sceneRevision
      )
        throw new DOMException("Superseded", "AbortError");
      this.apply({ ...p, dof: false }, width, height);
      if (
        !this.guide ||
        this.guide.width !== width ||
        this.guide.height !== height
      ) {
        this.guide?.destroy();
        this.guide = new FloatImage(this.device, width, height);
      }
      try {
        (this.scene as any).directorPeaking = [1, 0, 0, 0];
        this.scene.camera.clearPass.setClearColor(new Color(0, 0, 0, 0));
        await this.frame(false, undefined, () => {
          this.guide!.copy(this.scene.camera.colorTarget.colorBuffer);
          // Preserve the previous composition on the isolated frame surface.
          // Only composePreview presents the finished image to the browser.
          this.presentation?.();
        });
        return this.guide.texture;
      } finally {
        (this.scene as any).directorPeaking = [0, 0, 0, 0];
        this.apply({ ...p, dof: false }, width, height);
      }
    });
  }
  apertureCount(
    p: Pose,
    width: number,
    height: number,
    precision = this.precision,
  ) {
    const key = JSON.stringify([
      this.generation,
      this.sceneRevision,
      this.apertureEpoch,
      this.stableOrder,
      precision,
      this.background,
      width,
      height,
      p,
    ]);
    return this.job?.key === key ? this.job.gpu.count : 0;
  }
  /** Resume only an identical full state. Four GPU samples per scheduling turn;
   * no pixel readback and no per-sample GPU fence in interactive preview. */
  advance(
    p: Pose,
    width: number,
    height: number,
    count = 4,
    display = true,
    signal?: AbortSignal,
    observe?: (values: Uint16Array | Float32Array, i: number) => void,
    retainPreview = false,
  ) {
    const epoch = this.apertureEpoch,
      generation = this.generation,
      sceneRevision = this.sceneRevision;
    const snapshot = structuredClone(p);
    const precision = this.precision,
      background = this.background;
    return this.enqueue(async () => {
      const valid = () => {
        signal?.throwIfAborted();
        if (this.gpuError) throw this.gpuError;
        if (
          epoch !== this.apertureEpoch ||
          generation !== this.generation ||
          sceneRevision !== this.sceneRevision ||
          this.disposed
        )
          throw new DOMException("Superseded", "AbortError");
      };
      valid();
      const key = JSON.stringify([
        generation,
        sceneRevision,
        epoch,
        this.stableOrder,
        precision,
        background,
        width,
        height,
        snapshot,
      ]);
      const beganPreparation = performance.now();
      if (this.job?.key !== key) {
        const old = this.job;
        let gpu = old?.gpu;
        if (gpu && (gpu.width !== width || gpu.height !== height)) {
          gpu.destroy();
          gpu = null;
        }
        this.path = "candidate";
        this.precision = precision;
        this.background = background;
        this.apply({ ...snapshot, dof: false }, width, height);
        if (!this.device.textureFloatRenderable)
          throw Error("此 GPU 不支持 32 位浮点孔径累积");
        gpu ??= new ApertureGpu(this.device, width, height, true);
        gpu.count = 0;
        const c = this.scene.camera,
          cam = c.camera,
          entity = c.mainCamera;
        const origin = entity.getPosition().clone(),
          rotation = entity.getRotation().clone();
        const focus = Math.max(
          cam.nearClip,
          snapshot.focusPoint
            ? new Vec3(...snapshot.focusPoint).sub(origin).dot(entity.forward)
            : snapshot.focusInfinity
              ? 1e30
              : snapshot.focus,
        );
        this.job = {
          key,
          gpu,
          origin,
          rotation,
          focus,
          base: cam.projectionMatrix.clone(),
          right: entity.right.clone(),
          up: entity.up.clone(),
          near: cam.nearClip,
          far: cam.farClip,
          diameter: snapshot.dof
            ? apertureDiameter(snapshot.optics as any, snapshot.blur)
            : 0,
          started: performance.now(),
          renderTimes: [],
          addTimes: [],
          batchTimes: [],
          preparationMs: performance.now() - beganPreparation,
        };
      }
      const j = this.job,
        c = this.scene.camera,
        cam = c.camera;
      const projection = cam.calculateProjection,
        began = performance.now();
      this.scene.lockedRenderMode = true;
      try {
        for (let k = 0; k < count; k++) {
          valid();
          const i = j.gpu.count,
            [dx, dy] = apertureSample(i, j.diameter);
          c.setPoseOverride({
            position: j.origin
              .clone()
              .add(j.right.clone().mulScalar(dx))
              .add(j.up.clone().mulScalar(dy)),
            rotation: j.rotation,
            fov: snapshot.fov,
            near: j.near,
            far: j.far,
          });
          cam.calculateProjection = (matrix) => {
            matrix.copy(j.base);
            matrix.data[8] -= (j.base.data[0] * dx) / j.focus;
            matrix.data[9] -= (j.base.data[5] * dy) / j.focus;
          };
          const t = performance.now();
          await this.frame(
            false,
            signal,
            () => {
              const a = performance.now();
              j.gpu.add(c.colorTarget.colorBuffer);
              j.addTimes.push(performance.now() - a);
              if (retainPreview) {
                if (display && k === count - 1) {
                  // Retain the last published milestone across engine frames.
                  // Intermediate 12/20/... samples must not blank the swapchain.
                  if (
                    !this.display ||
                    this.display.width !== width ||
                    this.display.height !== height
                  ) {
                    this.display?.destroy();
                    this.display = new ApertureGpu(
                      this.device,
                      width,
                      height,
                      true,
                    );
                  }
                  this.display.count = 0;
                  this.display.add(
                    (j.gpu as any).targets[(j.gpu.count - 1) % 2].colorBuffer,
                  );
                }
                this.display?.present();
              } else if (display && k === count - 1) j.gpu.present();
              if (!display) this.presentation?.();
            },
            false,
          );
          j.renderTimes.push(performance.now() - t);
          if (observe) {
            const sample = await this.read();
            if (!(
              sample.raw instanceof Float32Array ||
              sample.raw instanceof Uint16Array
            ))
              throw Error("Non-float sample");
            observe(sample.raw, i);
          }
        }
        await this.device.wgpu.queue.onSubmittedWorkDone();
        valid();
        const ms = performance.now() - began;
        j.batchTimes.push(ms);
        return {
          count: j.gpu.count,
          batchMs: ms,
          key,
          precision,
          sceneFormat: c.colorTarget.colorBuffer.format,
          timing: {
            kind: "wall-clock",
            preparationMs: j.preparationMs,
            renderMs: j.renderTimes
              .slice(-count)
              .reduce((a: number, b: number) => a + b, 0),
            accumulationCpuMs: j.addTimes
              .slice(-count)
              .reduce((a: number, b: number) => a + b, 0),
            gpu: this.gpuTimings.slice(-count),
            gpuSupported: !!(this.device as any).supportsTimestampQuery,
          },
        };
      } finally {
        cam.calculateProjection = projection;
        c.setPoseOverride({
          position: j.origin,
          rotation: j.rotation,
          fov: snapshot.fov,
          near: j.near,
          far: j.far,
        });
        this.pose = structuredClone(snapshot);
        this.scene.lockedRenderMode = false;
      }
    });
  }
  /** Diagnostics only: one final linear read, never used by the preview scheduler. */
  readApertureLinear() {
    return this.enqueue(async () => {
      const gpu = this.job?.gpu;
      if (!gpu?.count) throw Error("No aperture frame");
      const rt = (gpu as any).targets[(gpu.count - 1) % 2];
      return rt.colorBuffer.read(0, 0, rt.width, rt.height, {
        renderTarget: rt,
        immediate: true,
      });
    });
  }
  readAperture(signal?: AbortSignal) {
    return this.enqueue(async () => {
      signal?.throwIfAborted();
      const j = this.job;
      if (!j?.gpu.count) throw Error("尚未完成孔径样本");
      const readStart = performance.now(),
        frame = await j.gpu.read();
      signal?.throwIfAborted();
      return {
        ...frame,
        cameraSnapshot: {
          projection: Array.from(j.base.data),
          origin: j.origin.toString(),
          rotation: j.rotation.toString(),
          focus: j.focus,
          diameter: j.diameter,
        },
        timing: {
          total: performance.now() - j.started,
          render: j.renderTimes,
          add: j.addTimes,
          batches: j.batchTimes,
          read: performance.now() - readStart,
          prepare: null, // Not instrumented separately; never report a synthetic zero.
        },
      };
    });
  }
  async accumulate(
    p: Pose,
    width: number,
    height: number,
    samples: number,
    signal?: AbortSignal,
    progress?: (n: number) => void,
    observe?: (values: Uint16Array | Float32Array, i: number) => void,
  ) {
    if (![128, 256, 512].includes(samples))
      throw Error("Expected 128, 256 or 512 samples");
    this.cancel();
    this.accumulation = new AbortController();
    const joined = signal
      ? AbortSignal.any([signal, this.accumulation.signal])
      : this.accumulation.signal;
    for (let n = 0; n < samples; n += 4) {
      await this.advance(p, width, height, 4, !!progress, joined, observe);
      if (n + 4 === samples || ((n + 4) & (n + 3)) === 0) progress?.(n + 4);
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    return this.readAperture(joined);
  }
  async read() {
    const rt = this.scene.camera.colorTarget;
    const raw = await rt.colorBuffer.read(0, 0, rt.width, rt.height, {
      renderTarget: rt,
      immediate: true,
    });
    return { width: rt.width, height: rt.height, raw };
  }
  onDispose(fn: () => void) {
    this.disposers.push(fn);
  }
  present(withinFrame = false) {
    if (!withinFrame) this.device.frameStart();
    if (this.path === "candidate") {
      const rt = this.scene.camera.colorTarget;
      if (
        !this.display ||
        this.display.width !== rt.width ||
        this.display.height !== rt.height
      ) {
        this.display?.destroy();
        this.display = new ApertureGpu(this.device, rt.width, rt.height);
      }
      this.display.count = 0;
      this.display.add(rt.colorBuffer);
      this.display.present();
    } else {
      this.scene.camera.finalPass.enabled = true;
      this.scene.camera.finalPass.render();
      this.scene.camera.finalPass.enabled = false;
    }
    if (!withinFrame) this.device.frameEnd();
  }
  pick(x: number, y: number) {
    this.cancel();
    const generation = this.generation,
      epoch = this.apertureEpoch,
      pose = JSON.stringify(this.pose),
      savedPose = structuredClone(this.pose),
      width = this.canvas.width,
      height = this.canvas.height;
    return this.enqueue(async () => {
      if (
        generation !== this.generation ||
        epoch !== this.apertureEpoch ||
        pose !== JSON.stringify(this.pose)
      )
        return null;
      const optics = (this.scene as any).directorOptics;
      try {
        // Aperture integration leaves the camera at its last off-axis sample.
        // Pick from the central, sharp camera captured with this request.
        this.apply(savedPose, width, height);
        (this.scene as any).directorOptics = [1, 0, 0, 1];
        const hit = await this.pickNow(x, y);
        return epoch === this.apertureEpoch ? hit : null;
      } finally {
        (this.scene as any).directorOptics = optics;
      }
    });
  }
  private async pickNow(x: number, y: number) {
    const generation = this.generation;
    const result = await this.scene.camera.intersect(x, y);
    if (generation !== this.generation) return null;
    return result
      ? {
          point: [result.position.x, result.position.y, result.position.z],
          distance: result.depth,
        }
      : null;
  }
  async dispose() {
    this.cancel();
    this.disposed = true;
    this.generation++;
    await this.tail;
    this.guide?.destroy();
    this.guide = null;
    this.adjustment?.destroy();
    this.adjustment = null;
    this.surface?.destroy();
    this.surface = null;
    if (!this.ownsScene) {
      this.display?.destroy();
      this.job?.gpu.destroy();
      this.disposers.forEach((fn) => fn());
      return;
    }
    this.scene.clear();
    this.fs?.sources.forEach((s: any) => s.close());
    (this.scene as any).directorObserver?.disconnect();
    (this.scene as any).directorDetach?.();
    for (const element of [...this.scene.elements]) this.scene.remove(element);
    this.scene.projectedSplatRenderer.destroy();
    this.display?.destroy();
    this.job?.gpu.destroy();
    this.job = null;
    this.disposers.forEach((fn) => fn());
    this.scene.app.destroy();
  }
}
