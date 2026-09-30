import {
  Asset,
  Color,
  Entity,
  Mat4,
  Vec3,
  createGraphicsDevice,
  PROJECTION_ORTHOGRAPHIC,
  GSPLAT_LODMODE_DISTANCE,
} from "playcanvas";
import type { CameraComponent, Layer, TextureHandler } from "playcanvas";
import { App } from "../../../metaflow-viewer/src/app";
import { Capture } from "../../../metaflow-viewer/src/capture";
import { validateStreamingLodManifest } from "../../../metaflow-viewer/src/resource-source";
import { sliceModifier } from "./model";
import type { MapRenderJob, MapRenderTile } from "./model";

/** Separate app, device, camera and material. The live Viewer is never modified. */
class GaussianMapGenerator {
  private app: App;
  private camera: Entity;
  private splat: Entity;
  private capture: Capture;
  private failures: string[] = [];
  private rendered = 0;
  private job: MapRenderJob;
  private sourceBounds: { min: Vec3; max: Vec3 }[];
  private destroyed = false;

  private constructor(
    app: App,
    camera: Entity,
    splat: Entity,
    job: MapRenderJob,
    sourceBounds: { min: Vec3; max: Vec3 }[],
  ) {
    this.app = app;
    this.camera = camera;
    this.splat = splat;
    this.job = job;
    this.sourceBounds = sourceBounds;
    this.capture = new Capture(app, camera.camera, () => null);
    app.assets.on("error", (error: unknown, asset: Asset) =>
      this.failures.push(
        `${(asset?.file as { url?: string })?.url ?? "asset"}: ${String(error)}`,
      ),
    );
    app.on("frameend", () => this.rendered++);
  }

  static async create(canvas: HTMLCanvasElement, job: MapRenderJob) {
    if (job.transform.length !== 16 || !job.transform.every(Number.isFinite))
      throw new Error("Invalid model transform");
    const response = await fetch(job.assetUrl);
    if (!response.ok)
      throw new Error(`Gaussian manifest: HTTP ${response.status}`);
    const manifest = await response.json();
    validateStreamingLodManifest(manifest);
    // The engine consumes and clears data.tree while parsing its octree.
    const sourceTree = structuredClone(manifest.tree);
    if (
      !Number.isInteger(job.lod) ||
      job.lod < 0 ||
      job.lod >= manifest.lodLevels
    )
      throw new Error("Invalid fixed source LOD");
    const device = await createGraphicsDevice(canvas, {
      deviceTypes: ["webgl2"],
      antialias: false,
      depth: true,
      stencil: false,
      ...{ alpha: false },
    });
    const app = new App(canvas, {
      graphicsDevice: device,
      mouse: null,
      keyboard: null,
      touch: null,
    });
    (app.loader.getHandler("texture") as TextureHandler).imgParser.crossOrigin =
      "anonymous";
    const camera = new Entity("offline-gaussian-map-camera");
    camera.addComponent("camera", {
      projection: PROJECTION_ORTHOGRAPHIC,
      clearColor: new Color(0.055, 0.075, 0.085),
      nearClip: 0.01,
      farClip: 1000,
    });
    app.root.addChild(camera);
    const asset = new Asset(
      "lod-meta.json",
      "gsplat",
      { url: job.assetUrl, filename: "lod-meta.json" },
      manifest,
    );
    const load = new Promise<void>((resolve, reject) => {
      asset.once("load", () => resolve());
      asset.once("error", reject);
    });
    app.assets.add(asset);
    app.assets.load(asset);
    try {
      await load;
      const splat = new Entity("offline-gaussian-map-model");
      // The trial uses rotation(0,0,180), but jobs carry its complete world transform.
      const m = new Mat4();
      m.set(job.transform);
      splat.setLocalPosition(m.getTranslation());
      splat.setLocalEulerAngles(m.getEulerAngles());
      splat.setLocalScale(m.getScale());
      splat.addComponent("gsplat", {
        unified: true,
        asset,
        lodRangeMin: job.lod,
        lodRangeMax: job.lod,
      });
      app.root.addChild(splat);
      app.scene.gsplat.lodMode = GSPLAT_LODMODE_DISTANCE;
      app.scene.gsplat.radialSorting = false; // Orthographic depth order depends on direction.
      app.scene.gsplat.lodBehindPenalty = 1;
      app.scene.gsplat.lodUpdateDistance = 0;
      app.scene.gsplat.lodUpdateAngle = 0;
      app.scene.gsplat.minContribution = 0;
      app.scene.gsplat.minPixelSize = 0;
      app.scene.gsplat.alphaClip = 1 / 255;
      app.scene.gsplat.splatBudget = 5_000_000;
      const sourceBounds: { min: Vec3; max: Vec3 }[] = [];
      const visit = (node: any) => {
        if (node.children) {
          node.children.forEach(visit);
          return;
        }
        const min = new Vec3(Infinity, Infinity, Infinity),
          max = new Vec3(-Infinity, -Infinity, -Infinity);
        for (const x of [node.bound.min[0], node.bound.max[0]])
          for (const y of [node.bound.min[1], node.bound.max[1]])
            for (const z of [node.bound.min[2], node.bound.max[2]]) {
              const p = m.transformPoint(new Vec3(x, y, z));
              min.x = Math.min(min.x, p.x);
              min.y = Math.min(min.y, p.y);
              min.z = Math.min(min.z, p.z);
              max.x = Math.max(max.x, p.x);
              max.y = Math.max(max.y, p.y);
              max.z = Math.max(max.z, p.z);
            }
        sourceBounds.push({ min, max });
      };
      visit(sourceTree);
      const generator = new GaussianMapGenerator(
        app,
        camera,
        splat,
        job,
        sourceBounds,
      );
      app.start();
      return generator;
    } catch (error) {
      app.destroy();
      throw error;
    }
  }

  async render(tile: MapRenderTile, signal?: AbortSignal) {
    if (this.destroyed) throw new Error("Map generator disposed");
    const layer = this.job.layers.find((v) => v.id === tile.layerId);
    if (!layer) throw new Error("Unknown map layer");
    this.failures.length = 0;
    const width = tile.bounds.maxX - tile.bounds.minX,
      height = tile.bounds.maxZ - tile.bounds.minZ;
    const cx = (tile.bounds.minX + tile.bounds.maxX) / 2,
      cz = (tile.bounds.minZ + tile.bounds.maxZ) / 2;
    const camera = this.camera.camera;
    this.app.graphicsDevice.resizeCanvas(tile.width, tile.height);
    camera.orthoHeight = height / 2;
    camera.aspectRatio = width / height;
    camera.nearClip = 0.01;
    camera.farClip = Math.max(
      100,
      layer.sliceRange[1] - layer.sliceRange[0] + 30,
    );
    this.camera.setPosition(cx, layer.sliceRange[1] + 20, cz);
    this.camera.lookAt(
      new Vec3(cx, layer.sliceRange[0], cz),
      new Vec3(0, 0, -1),
    );
    this.splat.gsplat.setWorkBufferModifier(sliceModifier(...layer.sliceRange));
    const hasSource = this.sourceBounds.some(
      (b) =>
        b.max.x >= tile.bounds.minX &&
        b.min.x <= tile.bounds.maxX &&
        b.max.z >= tile.bounds.minZ &&
        b.min.z <= tile.bounds.maxZ &&
        b.max.y >= layer.sliceRange[0] &&
        b.min.y <= layer.sliceRange[1],
    );
    const readiness = await this.waitReady(!hasSource, signal);
    if (this.failures.length) throw new Error(this.failures.join("\n"));
    const raw = await this.capture.grab({
      width: tile.width,
      height: tile.height,
      supersample: 1,
    });
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const bytes = Uint8Array.from(atob(raw.data), (c) => c.charCodeAt(0));
    const output = document.createElement("canvas");
    output.width = tile.width;
    output.height = tile.height;
    output
      .getContext("2d")
      .putImageData(
        new ImageData(new Uint8ClampedArray(bytes), tile.width, tile.height),
        0,
        0,
      );
    const blob = await new Promise<Blob>((resolve, reject) =>
      output.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("WebP encode failed"))),
        "image/webp",
        0.88,
      ),
    );
    return {
      data: await new Promise<string>((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result).split(",")[1]);
        reader.readAsDataURL(blob);
      }),
      ...readiness,
    };
  }

  private waitReady(
    knownEmpty: boolean,
    signal?: AbortSignal,
  ): Promise<{ frames: number; splats: number; ms: number }> {
    const start = performance.now(),
      initialFrame = this.rendered;
    return new Promise((resolve, reject) => {
      let stable = 0,
        sawWork = false;
      const done = (error?: Error) => {
        this.app.systems.gsplat.off("frame:ready", ready);
        signal?.removeEventListener("abort", aborted);
        if (error) reject(error);
      };
      const aborted = () => done(new DOMException("Aborted", "AbortError"));
      const ready = (
        camera: CameraComponent,
        _layer: Layer,
        valid: boolean,
        loading: number,
      ) => {
        if (camera !== this.camera.camera) return;
        if (loading > 0 || this.app.stats.frame.gsplats > 0) sawWork = true;
        if (this.failures.length) {
          done(new Error(this.failures.join("\n")));
          return;
        }
        // Three subsequent frames include work-buffer output and latest sort.
        if (
          valid &&
          loading === 0 &&
          (sawWork || knownEmpty) &&
          this.rendered - initialFrame >= 3
        )
          stable++;
        else stable = 0;
        if (stable >= 3) {
          done();
          resolve({
            frames: this.rendered - initialFrame,
            splats: this.app.stats.frame.gsplats,
            ms: performance.now() - start,
          });
        }
      };
      signal?.addEventListener("abort", aborted, { once: true });
      this.app.systems.gsplat.on("frame:ready", ready);
      if (signal?.aborted) aborted();
      this.app.renderNextFrame = true;
    });
  }
  destroy() {
    if (!this.destroyed) {
      this.destroyed = true;
      this.capture.destroy();
      this.app.destroy();
    }
  }
}

let generator: GaussianMapGenerator | null = null;
const status = document.querySelector("#map-generator-status");
(window as any).mf97MapGenerator = {
  async create(job: MapRenderJob) {
    generator?.destroy();
    status.textContent = `正在加载 ${job.scene} 的独立高斯地图场景`;
    generator = await GaussianMapGenerator.create(
      document.querySelector("canvas"),
      job,
    );
    status.textContent = "资源已加载，等待指定瓦片的流式内容和排序";
  },
  async render(tile: MapRenderTile) {
    status.textContent = `生成 ${tile.id}（固定 LOD，世界高度切片）`;
    const result = await generator.render(tile);
    status.textContent = `${tile.id} 已完成，${result.frames} 帧准备，${result.splats} 个高斯`;
    return result;
  },
  destroy() {
    generator?.destroy();
    generator = null;
  },
};
