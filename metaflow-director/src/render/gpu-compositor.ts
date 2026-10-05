import { FloatImage } from "./float-image";
import { srgbWGSL } from "./srgb";
import {
  Texture,
  RenderTarget,
  ShaderUtils,
  BlendState,
  drawQuadWithShader,
  PIXELFORMAT_RGBA32F,
  FILTER_NEAREST,
  BLENDEQUATION_ADD,
  BLENDMODE_ONE,
  BLENDMODE_ONE_MINUS_SRC_ALPHA,
  SEMANTIC_POSITION,
} from "playcanvas";
import { ApertureGpu } from "./aperture-gpu";
/** All composition targets stay on the scene's WebGPU device. Only final delivery reads pixels. */
export class SharedGpuCompositor {
  readonly canvas: HTMLCanvasElement;
  private images = new Map<
    string,
    { texture: Texture; owned: boolean; linear: boolean; copy?: FloatImage }
  >();
  private target: RenderTarget | null = null;
  private output: ApertureGpu | null = null;
  private shader: any;
  private peakingShader: any;
  private peakingTarget: FloatImage | null = null;
  private width = 0;
  private height = 0;
  constructor(
    private device: any,
    private presentToCanvas = false,
  ) {
    this.canvas = device.canvas;
    this.shader = ShaderUtils.createShader(device, {
      uniqueName: "workbench-compose",
      attributes: { vertex_position: SEMANTIC_POSITION },
      vertexChunk: "fullscreenQuadVS",
      fragmentWGSL:
        `${srgbWGSL} varying vUv0:vec2f; var image:texture_2d<f32>;var imageSampler:sampler;
      uniform rectangle:vec4f; uniform outputSize:vec2f; uniform opacity:f32; uniform linearInput:f32;uniform radius:f32;
      @fragment fn fragmentMain(input:FragmentInput)->FragmentOutput{
        var output:FragmentOutput;
        let point=pcPosition.xy-uniform.rectangle.xy;
        let uv=point/uniform.rectangle.zw;
        let inside=all(uv>=vec2f(0.0)) && all(uv<=vec2f(1.0));
        if(!inside){discard;}
        var c=textureSample(image,imageSampler,uv);
        if(uniform.linearInput<0.5){c=vec4f(decodeSRGB(max(c.rgb,vec3f(0.0)))*c.a,c.a);}
        let q=abs(point-uniform.rectangle.zw*.5)-uniform.rectangle.zw*.5+uniform.radius;
        let d=length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0)-uniform.radius;
        let mask=1.0-smoothstep(-.5,.5,d);
        output.color=c*uniform.opacity*mask;return output;
      }`.replaceAll(";", ";\n"),
    });
    this.peakingShader = ShaderUtils.createShader(device, {
      uniqueName: "director-preview-peaking",
      attributes: { vertex_position: SEMANTIC_POSITION },
      vertexChunk: "fullscreenQuadVS",
      fragmentWGSL:
        `varying vUv0:vec2f; var image:texture_2d<f32>; var imageSampler:sampler;
        var guide:texture_2d<f32>; var guideSampler:sampler;
        @fragment fn fragmentMain(input:FragmentInput)->FragmentOutput {
          var output:FragmentOutput;
          let uv=vec2f(input.vUv0.x,1.0-input.vUv0.y);
          let c=textureSample(image,imageSampler,uv);
          let warning=clamp(textureSample(guide,guideSampler,uv).r,0.0,0.76);
          output.color=vec4f(mix(c.rgb,vec3f(1.0,0.002709,0.001548)*c.a,warning),c.a);
          return output;
        }`.replaceAll(";", ";\n"),
    });
  }
  upload(key: string, source: Texture | TexImageSource) {
    const old = this.images.get(key);
    if (source instanceof Texture) {
      let copy = old?.copy;
      if (
        !copy ||
        copy.width !== source.width ||
        copy.height !== source.height
      ) {
        copy?.destroy();
        if (old?.owned && !old.copy) old.texture.destroy();
        copy = new FloatImage(this.device, source.width, source.height);
      }
      this.device.frameStart();
      copy.copy(source);
      this.device.frameEnd();
      this.images.set(key, {
        texture: copy.texture!,
        owned: true,
        linear: true,
        copy,
      });
      return;
    }
    old?.copy?.destroy();
    const texture =
      old?.owned && !old.copy
        ? old.texture
        : new Texture(this.device, { mipmaps: false });
    texture.setSource(source as any);
    this.images.set(key, { texture, owned: true, linear: false });
  }
  /** Caller holds the source until finish() has submitted this composition. */
  uploadBorrowed(key: string, texture: Texture) {
    const old = this.images.get(key);
    old?.copy?.destroy();
    if (old?.owned && !old.copy) old.texture.destroy();
    this.images.set(key, { texture, owned: false, linear: true });
  }
  begin(width: number, height: number) {
    // Only the visible composition may resize the shared canvas. Exports,
    // thumbnails and device screens must not change its aspect between batches.
    if (
      this.presentToCanvas &&
      (this.canvas.width !== width || this.canvas.height !== height)
    )
      this.device.setResolution(width, height);
    if (this.width !== width || this.height !== height) {
      this.target?.destroyTextureBuffers();
      this.target?.destroy();
      this.output?.destroy();
      this.peakingTarget?.destroy();
      this.peakingTarget = null;
      this.target = new RenderTarget({
        depth: false,
        colorBuffer: new Texture(this.device, {
          width,
          height,
          format: PIXELFORMAT_RGBA32F,
          mipmaps: false,
          minFilter: FILTER_NEAREST,
          magFilter: FILTER_NEAREST,
        }),
      });
      this.output = new ApertureGpu(this.device, width, height, true, true);
      this.width = width;
      this.height = height;
    }
    this.device.frameStart();
    // The first backdrop draw covers the entire target with opacity one.
  }
  draw(
    key: string,
    x: number,
    y: number,
    w: number,
    h: number,
    opacity = 1,
    radius = 0,
  ) {
    const source = this.images.get(key);
    if (!source) throw Error(`Missing composition input: ${key}`);
    if (!source.texture.device)
      throw Error(
        `Released composition input: ${key} / ${source.texture.name} (${source.texture.width}x${source.texture.height})`,
      );
    const scope = this.device.scope;
    for (const [name, value] of Object.entries({
      image: source.texture,
      rectangle: [x, y, w, h],
      outputSize: [this.width, this.height],
      opacity,
      radius,
      linearInput: source.linear ? 1 : 0,
    }))
      scope.resolve(name).setValue(value);
    this.device.setBlendState(
      key === "backdrop"
        ? BlendState.NOBLEND
        : new BlendState(
            true,
            BLENDEQUATION_ADD,
            BLENDMODE_ONE,
            BLENDMODE_ONE_MINUS_SRC_ALPHA,
            BLENDEQUATION_ADD,
            BLENDMODE_ONE,
            BLENDMODE_ONE_MINUS_SRC_ALPHA,
          ),
    );
    drawQuadWithShader(this.device, this.target, this.shader);
  }
  get texture() {
    return this.output?.texture;
  }
  async finish(present = this.presentToCanvas, guide?: Texture | null) {
    if (this.shader.failed) throw Error("共享合成器着色器编译失败");
    this.output!.setSource(this.target!.colorBuffer);
    if (guide) {
      this.peakingTarget ??= new FloatImage(
        this.device,
        this.width,
        this.height,
      );
      const scope = this.device.scope;
      scope.resolve("image").setValue(this.target!.colorBuffer);
      scope.resolve("guide").setValue(guide);
      this.device.setBlendState(BlendState.NOBLEND);
      drawQuadWithShader(
        this.device,
        this.peakingTarget.renderTarget,
        this.peakingShader,
      );
      if (this.peakingShader.failed) throw Error("离焦参考着色器编译失败");
      this.output!.setSource(this.peakingTarget.texture);
    }
    if (present) this.output!.present();
    this.device.frameEnd();
    this.device.submit();
  }
  present() {
    this.output?.present();
  }
  presentTexture(texture: Texture, width: number, height: number) {
    this.begin(width, height);
    this.output!.setSource(texture);
    this.output!.present();
    this.device.frameEnd();
    this.device.submit();
  }
  async snapshot() {
    const frame = await this.output!.read();
    const c = document.createElement("canvas");
    c.width = frame.width;
    c.height = frame.height;
    c.getContext("2d")!.putImageData(
      new ImageData(
        new Uint8ClampedArray(frame.pixels),
        frame.width,
        frame.height,
      ),
      0,
      0,
    );
    return c;
  }
  destroy() {
    this.images.forEach((v) => {
      if (v.copy) v.copy.destroy();
      else if (v.owned) v.texture.destroy();
    });
    this.target?.destroyTextureBuffers();
    this.target?.destroy();
    this.output?.destroy();
    this.peakingTarget?.destroy();
    // Cached shader belongs to the shared device's program library.
  }
}
