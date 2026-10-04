import { srgbGLSL, srgbWGSL } from "./srgb";
import {
  ADDRESS_CLAMP_TO_EDGE,
  BlendState,
  drawQuadWithShader,
  FILTER_NEAREST,
  PIXELFORMAT_RGBA8,
  PIXELFORMAT_RGBA16F,
  PIXELFORMAT_RGBA32F,
  RenderTarget,
  SEMANTIC_POSITION,
  ShaderUtils,
  Texture,
} from "playcanvas";
import type { GraphicsDevice, Shader } from "playcanvas";

/** Session-owned, linear-light ping-pong accumulation. No per-sample readback. */
export class ApertureGpu {
  private targets: RenderTarget[] = [];
  private output!: RenderTarget;
  private addShader: Shader;
  private displayShader: Shader;
  count = 0;
  private external: Texture | null = null;
  constructor(
    private device: GraphicsDevice,
    readonly width: number,
    readonly height: number,
    standardSrgb = false,
    displayOnly = false,
  ) {
    if (!device.textureFloatRenderable && !device.textureHalfFloatRenderable)
      throw new Error("此设备不支持浮点累积，高质量成片不可用");
    const make = (name: string, format: number) =>
      new RenderTarget({
        colorBuffer: new Texture(device, {
          name,
          width,
          height,
          format,
          mipmaps: false,
          minFilter: FILTER_NEAREST,
          magFilter: FILTER_NEAREST,
          addressU: ADDRESS_CLAMP_TO_EDGE,
          addressV: ADDRESS_CLAMP_TO_EDGE,
        }),
        depth: false,
      });
    const format = device.textureFloatRenderable
      ? PIXELFORMAT_RGBA32F
      : PIXELFORMAT_RGBA16F;
    this.targets = displayOnly
      ? []
      : [make("Aperture A", format), make("Aperture B", format)];
    this.output = make("Aperture encoded output", PIXELFORMAT_RGBA8);
    const shader = (name: string, glsl: string, wgsl: string) =>
      ShaderUtils.createShader(device, {
        uniqueName: name,
        attributes: { vertex_position: SEMANTIC_POSITION },
        vertexChunk: "fullscreenQuadVS",
        fragmentGLSL: glsl,
        fragmentWGSL: wgsl.replaceAll("; ", ";\n"),
      });
    this.addShader = shader(
      "directorAccumulate",
      `varying vec2 vUv0; uniform sampler2D source; uniform sampler2D previous; uniform float weight; void main(){ vec4 s=texture2D(source,vUv0); if(weight>=1.0) gl_FragColor=s; else gl_FragColor=mix(texture2D(previous,vUv0),s,weight); }`,
      `varying vUv0: vec2f; var source: texture_2d<f32>; var sourceSampler: sampler; var previous: texture_2d<f32>; var previousSampler: sampler; uniform weight: f32; @fragment fn fragmentMain(input: FragmentInput)->FragmentOutput { var out:FragmentOutput; let uv=vec2f(input.vUv0.x,1.0-input.vUv0.y); let s=textureSample(source,sourceSampler,uv); if(uniform.weight>=1.0){out.color=s;}else{out.color=mix(textureSample(previous,previousSampler,uv),s,uniform.weight);} return out; }`,
    );
    this.displayShader = shader(
      standardSrgb
        ? "directorApertureDisplay-srgb"
        : "directorApertureDisplay-gamma22",
      `${standardSrgb ? srgbGLSL : ""} varying vec2 vUv0;
            uniform sampler2D source;
            uniform float flip;
            uniform float encode;
            uniform float premultiply;
            void main(){
                vec2 uv=vUv0;
                if(flip>0.5) uv.y=1.0-uv.y;
                vec4 c=texture2D(source,uv);
                c.rgb=max(c.rgb,vec3(0.0))/max(c.a,0.000001);
                ${standardSrgb ? "if(encode>0.5)c.rgb=encodeSRGB(c.rgb);" : "if(encode>0.5)c.rgb=pow(c.rgb,vec3(1.0/2.2));"}
                ${standardSrgb ? "if(premultiply>0.5)c.rgb=encode>0.5 ? c.rgb*c.a : decodeSRGB(encodeSRGB(c.rgb)*c.a);" : "if(premultiply>0.5)c.rgb*=pow(c.a,encode>0.5?1.0:2.2);"}
                gl_FragColor=c;
            }`,
      `${standardSrgb ? srgbWGSL : ""} varying vUv0: vec2f;
            var source: texture_2d<f32>;
            var sourceSampler: sampler;
            uniform flip:f32;
            uniform encode:f32;
            uniform premultiply:f32;
            @fragment fn fragmentMain(input:FragmentInput)->FragmentOutput {
                var out:FragmentOutput;
                var uv=input.vUv0;
                if(uniform.flip>0.5){uv.y=1.0-uv.y;}
                var c=textureSample(source,sourceSampler,uv);
                var rgb=max(c.rgb,vec3f(0.0))/max(c.a,0.000001);
                ${standardSrgb ? "if(uniform.encode>0.5){rgb=encodeSRGB(rgb);}" : "if(uniform.encode>0.5){rgb=pow(rgb,vec3f(1.0/2.2));}"}
                ${standardSrgb ? "if(uniform.premultiply>0.5){if(uniform.encode>0.5){rgb*=c.a;}else{rgb=decodeSRGB(encodeSRGB(rgb)*c.a);}}" : "if(uniform.premultiply>0.5){rgb*=pow(c.a,select(2.2,1.0,uniform.encode>0.5));}"}
                out.color=vec4f(rgb,c.a);
                return out;
            }`,
    );
  }
  get texture(): Texture | null {
    return (
      this.external ??
      (this.count ? this.targets[(this.count - 1) % 2].colorBuffer : null)
    );
  }
  /** Borrow a stable host-owned linear target for presentation, without copying it. */
  setSource(source: Texture) {
    this.external = source;
    this.count = 1;
  }
  add(source: Texture) {
    this.external = null;
    const d = this.device,
      next = this.targets[this.count % 2],
      previous = this.targets[(this.count + 1) % 2];
    d.scope.resolve("source").setValue(source);
    d.scope.resolve("previous").setValue(previous.colorBuffer);
    d.scope.resolve("weight").setValue(1 / (this.count + 1));
    d.setBlendState(BlendState.NOBLEND);
    drawQuadWithShader(d, next, this.addShader);
    this.count++;
  }
  private display(target: RenderTarget | null, flip: boolean, encode: boolean) {
    const d = this.device;
    d.scope.resolve("source").setValue(this.texture);
    d.scope.resolve("flip").setValue(flip ? 1 : 0);
    d.scope.resolve("encode").setValue(encode ? 1 : 0);
    // Browser canvas is premultiplied; read() returns straight RGBA for ImageData.
    d.scope.resolve("premultiply").setValue(target ? 0 : 1);
    d.setBlendState(BlendState.NOBLEND);
    drawQuadWithShader(d, target, this.displayShader);
  }
  present() {
    this.display(
      null,
      this.device.isWebGPU,
      !(this.device.backBuffer?.isColorBufferSrgb(0) ?? false),
    );
    (this.device as unknown as { submit?: () => void }).submit?.();
  }
  async read() {
    this.display(this.output, !this.output.flipY, true);
    const bytes = await this.output.colorBuffer.read(
      0,
      0,
      this.width,
      this.height,
      {
        renderTarget: this.output,
        immediate: true,
      },
    );
    return {
      width: this.width,
      height: this.height,
      pixels:
        bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes.buffer),
      samples: this.count,
    };
  }
  destroy() {
    for (const rt of [...this.targets, this.output]) {
      rt.destroyTextureBuffers();
      rt.destroy();
    }
    // ShaderUtils returns program-library-owned, cached shaders. Other
    // live accumulators share them; the device releases them at shutdown.
  }
}
