import { CandidateSession, type Pose as RenderPose } from "./session";
import { AperturePreview } from "./aperture-preview";
import { SharedGpuCompositor } from "./gpu-compositor";
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
      cancel: () => {
        primary.cancel();
        this.secondary.cancel();
      },
      batch: async (s, display) => {
        const start = performance.now();
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
        if (display) await this.compose(s, this.preview);
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
    return (
      (s.video ? evaluate(s.project.shots, s.time) : null) ?? {
        pose: s.pose,
        previousPose: null,
        previous: null,
        blend: 1,
        entryBlend: 1,
        exitBlend: 1,
        shot: s.project.shots[0],
      }
    );
  }
  private count(s: FrameState) {
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
    if (!this.disposed) this.scheduler.request(s);
  }
  async stop() {
    this.scheduler.cancel();
    await this.scheduler.settled();
    await this.primary.settled();
    await this.secondary.settled();
  }
  private async compose(s: FrameState, gpu: SharedGpuCompositor) {
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
    await gpu.finish();
  }
  async capture(
    s: FrameState,
    signal: AbortSignal,
    progress?: (n: number) => void,
  ) {
    await this.stop();
    const state = this.state(s);
    this.primary.cancel();
    this.secondary.cancel();
    for (let n = 0; n < s.samples; n += 4) {
      signal.throwIfAborted();
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
    signal.throwIfAborted();
    await this.compose(s, this.output);
    return this.output.snapshot();
  }
  async pick(x: number, y: number) {
    const s = this.displayed;
    if (!s) return null;
    await this.stop();
    this.primary.pose = camera(this.state(s).pose);
    return this.primary.pick(x, y);
  }
  async dispose() {
    this.disposed = true;
    await this.stop();
    this.preview.destroy();
    this.output.destroy();
    await this.secondary.dispose();
    await this.primary.dispose();
  }
}
