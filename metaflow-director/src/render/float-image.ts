import {
  Texture,
  RenderTarget,
  ShaderUtils,
  BlendState,
  drawQuadWithShader,
  PIXELFORMAT_RGBA32F,
  FILTER_NEAREST,
  SEMANTIC_POSITION,
} from "playcanvas";
/** Immutable across awaited composition; one float texture instead of an accumulator pair. */
export class FloatImage {
  private target: RenderTarget;
  private shader: any;
  constructor(
    private device: any,
    readonly width: number,
    readonly height: number,
  ) {
    this.target = new RenderTarget({
      depth: false,
      colorBuffer: new Texture(device, {
        width,
        height,
        format: PIXELFORMAT_RGBA32F,
        mipmaps: false,
        minFilter: FILTER_NEAREST,
        magFilter: FILTER_NEAREST,
      }),
    });
    this.shader = ShaderUtils.createShader(device, {
      uniqueName: "fusion-float-snapshot",
      attributes: { vertex_position: SEMANTIC_POSITION },
      vertexChunk: "fullscreenQuadVS",
      fragmentWGSL: `
      varying vUv0:vec2f; var source:texture_2d<f32>; var sourceSampler:sampler;
      @fragment fn fragmentMain(input:FragmentInput)->FragmentOutput {
        var output:FragmentOutput;
        output.color=textureSample(source,sourceSampler,vec2f(input.vUv0.x,1.0-input.vUv0.y));return output;
      }`.replaceAll(";", ";\n"),
    });
  }
  copy(source: Texture) {
    this.device.scope.resolve("source").setValue(source);
    this.device.setBlendState(BlendState.NOBLEND);
    drawQuadWithShader(this.device, this.target, this.shader);
    if (this.shader.failed) throw new Error("浮点快照着色器编译失败");
  }
  get texture() {
    return this.target.colorBuffer;
  }
  get renderTarget() {
    return this.target;
  }
  destroy() {
    this.target.destroyTextureBuffers();
    this.target.destroy();
  }
}
