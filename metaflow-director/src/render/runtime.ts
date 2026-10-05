import { CandidateSession, type Pose as RenderPose } from "./session";
import { AperturePreview } from "./aperture-preview";
import { SharedGpuCompositor } from "./gpu-compositor";
import { FloatImage } from "./float-image";
import { FrameCache } from "./frame-cache";
import { OperationQueue } from "../core/operation-queue";
import {
  evaluate,
  type Project,
  type Pose,
  type Transition,
} from "../core/model";
export type FrameState = {
  project: Project;
  pose: Pose;
  time: number;
  video: boolean;
  width: number;
  height: number;
  samples: number;
  playing: boolean;
  original?: boolean;
  peaking?: boolean;
  viewRevision?: number;
};
const camera = (p: Pose) => p as RenderPose;
/** One device, one scene, two accumulators only when a shot transition requires it. */
export class ResourceRuntime {
  primary: CandidateSession;
  secondary: CandidateSession;
  preview: SharedGpuCompositor;
  output: SharedGpuCompositor;
  scheduler: AperturePreview<FrameState>;
  displayed: FrameState | null = null;
  disposed = false;
  private readonly operations = new OperationQueue();
  private pendingPreview: FrameState | null = null;
  private requestVersion = 0;
  readonly metrics = { batches: 0, cacheHits: 0 };
  private cache = new FrameCache<FloatImage>(128 * 1024 * 1024, (v) =>
    v.destroy(),
  );
  private constructor(
    primary: CandidateSession,
    onDisplay: (s: FrameState, count: number) => void,
    onError: (e: unknown) => void,
  ) {
    this.primary = primary;
    this.secondary = CandidateSession.attach(primary.scene);
    this.secondary.background = primary.background;
    this.preview = new SharedGpuCompositor(primary.device, true);
    this.output = new SharedGpuCompositor(primary.device, false);
    const background = document.createElement("canvas");
    background.width = background.height = 1;
    background.getContext("2d")!.fillStyle = primary.background;
    background.getContext("2d")!.fillRect(0, 0, 1, 1);
    this.preview.upload("backdrop", background);
    this.output.upload("backdrop", background);
    primary.presentation = () => this.preview.present();
    this.secondary.presentation = primary.presentation;
    this.scheduler = new AperturePreview({
      target: (s) => (s.playing ? 4 : s.samples),
      count: (s) => this.count(s),
      restore: async (s) => {
        const cached = !s.peaking && this.cache.get(this.cacheKey(s));
        if (cached) {
          this.preview.presentTexture(cached.texture, s.width, s.height);
          this.metrics.cacheHits++;
        } else await this.composePreview(s);
      },
      cancel: () => {
        primary.cancel();
        this.secondary.cancel();
      },
      batch: async (s, display) => {
        const start = performance.now();
        this.metrics.batches++;
        const state = this.state(s);
        await primary.advance(camera(state.pose), s.width, s.height, 4, false);
        if (state.previousPose)
          await this.secondary.advance(
            camera(state.previousPose),
            s.width,
            s.height,
            4,
            false,
          );
        if (display) {
          await this.composePreview(s);
          if (!s.playing && !s.peaking && this.count(s) >= s.samples)
            this.retain(s);
        }
        return { count: this.count(s), batchMs: performance.now() - start };
      },
      displayed: (s, n) => {
        this.displayed = structuredClone(s);
        onDisplay(s, n);
      },
      error: onError,
    });
  }
  static async create(
    canvas: HTMLCanvasElement,
    assets: { name: string; bytes: ArrayBuffer }[],
    pose: Pose,
    background: string,
    onDisplay: (s: FrameState, count: number) => void,
    onError: (e: unknown) => void,
  ) {
    const session = await CandidateSession.create(canvas);
    try {
      if (!session.device.textureFloatRenderable)
        throw Error("当前图形设备不支持 RGBA32F 浮点摄影，请返回 Viewer");
      session.background = background;
      await session.loadScene(assets, camera(pose));
      return new ResourceRuntime(session, onDisplay, onError);
    } catch (e) {
      await session.dispose();
      throw e;
    }
  }
  private state(s: FrameState) {
    const state = (s.video ? evaluate(s.project.shots, s.time) : null) ?? {
      pose: s.pose,
      previousPose: null,
      previous: null,
      blend: 1,
      entryBlend: 1,
      exitBlend: 1,
      shot: s.project.shots[0],
    };
    return s.original
      ? {
          ...state,
          pose: { ...state.pose, dof: false },
          previousPose: state.previousPose
            ? { ...state.previousPose, dof: false }
            : null,
        }
      : state;
  }
  private cacheKey(s: FrameState) {
    return JSON.stringify([
      this.primary.generation,
      this.primary.sceneRevision,
      this.primary.background,
      this.state(s),
      s.width,
      s.height,
      s.samples,
    ]);
  }
  private retain(s: FrameState) {
    if (s.width * s.height * 16 > 128 * 1024 * 1024) return;
    const image = new FloatImage(this.primary.device, s.width, s.height);
    const device = this.primary.device;
    device.frameStart();
    image.copy(this.preview.texture!);
    device.frameEnd();
    device.submit();
    this.cache.set(this.cacheKey(s), image, s.width * s.height * 16);
  }
  private async composePreview(s: FrameState) {
    const state = this.state(s);
    const mask =
      s.peaking && !s.original && state.pose.dof
        ? await this.primary.peakingMask(camera(state.pose), s.width, s.height)
        : null;
    await this.compose(s, this.preview, mask);
  }
  private count(s: FrameState) {
    if (!s.playing && !s.peaking && this.cache.get(this.cacheKey(s)))
      return s.samples;
    const state = this.state(s);
    return Math.min(
      this.primary.apertureCount(camera(state.pose), s.width, s.height),
      state.previousPose
        ? this.secondary.apertureCount(
            camera(state.previousPose),
            s.width,
            s.height,
          )
        : Infinity,
    );
  }
  request(s: FrameState) {
    if (this.disposed) return;
    this.requestVersion++;
    if (this.operations.busy) this.pendingPreview = structuredClone(s);
    else this.scheduler.request(s);
  }
  async stop() {
    const version = this.requestVersion;
    this.pendingPreview = null;
    await this.operations.settled();
    // A foreground request may supersede a tab-hide stop while capture drains.
    if (version === this.requestVersion) await this.stopPreview();
  }
  private async stopPreview() {
    this.scheduler.cancel();
    await this.scheduler.settled();
    await this.primary.settled();
    await this.secondary.settled();
  }
  private assertActive(signal?: AbortSignal) {
    signal?.throwIfAborted();
    if (this.disposed) throw new DOMException("摄影会话已释放", "AbortError");
  }
  private async exclusive<T>(work: () => Promise<T>, signal?: AbortSignal) {
    try {
      return await this.operations.run(async () => {
        this.assertActive(signal);
        await this.stopPreview();
        this.assertActive(signal);
        return work();
      });
    } finally {
      if (!this.operations.busy && this.pendingPreview && !this.disposed) {
        const latest = this.pendingPreview;
        this.pendingPreview = null;
        this.request(latest);
      }
    }
  }
  private async compose(s: FrameState, gpu: SharedGpuCompositor, mask?: any) {
    const state = this.state(s),
      w = s.width,
      h = s.height;
    gpu.uploadBorrowed("incoming", this.primary.apertureTexture);
    if (state.previousPose)
      gpu.uploadBorrowed("previous", this.secondary.apertureTexture);
    gpu.begin(w, h);
    gpu.draw("backdrop", 0, 0, w, h);
    const draw = (key: string, x = 0, y = 0, scale = 1, opacity = 1) =>
      gpu.draw(
        key,
        x + (w * (1 - scale)) / 2,
        y + (h * (1 - scale)) / 2,
        w * scale,
        h * scale,
        opacity,
      );
    const layer = (
      key: string,
      t: number,
      transition: Transition,
      entering: boolean,
    ) => {
      const { kind, direction } = transition,
        vertical = direction === "up" || direction === "down",
        sign = direction === "right" || direction === "down" ? -1 : 1;
      if (kind === "push")
        draw(
          key,
          vertical ? 0 : sign * (entering ? 1 : -1) * w * (1 - t),
          vertical ? sign * (entering ? 1 : -1) * h * (1 - t) : 0,
        );
      else if (kind === "zoom")
        draw(
          key,
          0,
          0,
          direction === "out"
            ? entering
              ? 1 + 0.3 * (1 - t)
              : 1 - 0.3 * (1 - t)
            : entering
              ? 1 - 0.3 * (1 - t)
              : 1 + 0.3 * (1 - t),
          t,
        );
      else draw(key, 0, 0, 1, kind === "cut" ? 1 : t);
    };
    if (state.previousPose) {
      if (state.shot.transition.kind === "fade") draw("previous");
      else layer("previous", 1 - state.blend, state.shot.transition, false);
      layer("incoming", state.blend, state.shot.transition, true);
    } else if (state.entryBlend < 1)
      layer("incoming", state.entryBlend, state.shot.transition, true);
    else if (state.exitBlend < 1)
      layer("incoming", state.exitBlend, state.shot.exitTransition!, false);
    else draw("incoming");
    await gpu.finish(undefined, mask);
  }
  async capture(
    s: FrameState,
    signal: AbortSignal,
    progress?: (n: number) => void,
  ) {
    // Comparison and optical guides are preview state, never output settings.
    s = { ...s, original: false, peaking: false };
    return this.exclusive(async () => {
      const state = this.state(s);
      this.primary.cancel();
      this.secondary.cancel();
      for (let n = 0; n < s.samples; n += 4) {
        this.assertActive(signal);
        await this.primary.advance(
          camera(state.pose),
          s.width,
          s.height,
          4,
          false,
          signal,
        );
        if (state.previousPose)
          await this.secondary.advance(
            camera(state.previousPose),
            s.width,
            s.height,
            4,
            false,
            signal,
          );
        progress?.((n + 4) / s.samples);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
      this.assertActive(signal);
      await this.compose(s, this.output);
      return this.output.snapshot();
    }, signal);
  }
  async pick(x: number, y: number) {
    const s = this.displayed;
    if (!s) return null;
    return this.exclusive(async () => {
      this.primary.pose = camera(this.state(s).pose);
      return this.primary.pick(x, y);
    });
  }
  async dispose() {
    this.disposed = true;
    await this.stop();
    this.cache.clear();
    this.preview.destroy();
    this.output.destroy();
    await this.secondary.dispose();
    await this.primary.dispose();
  }
}
