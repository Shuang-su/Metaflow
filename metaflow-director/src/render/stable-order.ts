import {
  ComputeRadixSort,
  Compute,
  Shader,
  BindGroupFormat,
  BindStorageBufferFormat,
  BindTextureFormat,
  BindUniformBufferFormat,
  UniformBufferFormat,
  UniformFormat,
  SHADERSTAGE_COMPUTE,
  SHADERLANGUAGE_WGSL,
  SAMPLETYPE_UINT,
  UNIFORMTYPE_UINT,
  UNIFORMTYPE_FLOAT,
  Vec2,
} from "playcanvas";

/** Stable secondary entry ID, then the ORIGINAL 20-bit depth key. Both sorts use
 * the pinned upstream GPU radix implementation; this kernel only gathers keys.
 * No CPU readback, replacement sort algorithm or change to depth quantization. */
export class StableOrder {
  private sorter: ComputeRadixSort;
  private compute: Compute;
  private shader: Shader;
  private bindings: BindGroupFormat;
  private dispatch = new Vec2();
  constructor(private device: any) {
    this.sorter = new ComputeRadixSort(device, { indirect: true });
    this.bindings = new BindGroupFormat(device, [
      new BindStorageBufferFormat("keys", SHADERSTAGE_COMPUTE),
      new BindStorageBufferFormat("values", SHADERSTAGE_COMPUTE),
      new BindStorageBufferFormat("ordered", SHADERSTAGE_COMPUTE, true),
      new BindStorageBufferFormat("count", SHADERSTAGE_COMPUTE, true),
      new BindTextureFormat(
        "cache",
        SHADERSTAGE_COMPUTE,
        undefined,
        SAMPLETYPE_UINT,
        false,
      ),
      new BindUniformBufferFormat("uniforms", SHADERSTAGE_COMPUTE),
    ]);
    const uniform = new UniformBufferFormat(device, [
      new UniformFormat("width", UNIFORMTYPE_UINT),
      new UniformFormat("near", UNIFORMTYPE_FLOAT),
      new UniformFormat("far", UNIFORMTYPE_FLOAT),
    ]);
    this.shader = new Shader(device, {
      name: "DirectorStableDepthGather",
      shaderLanguage: SHADERLANGUAGE_WGSL,
      cshader: `struct Uniforms {width:u32,near:f32,far:f32}
      @group(0) @binding(0) var<storage,read_write> keys:array<u32>;
      @group(0) @binding(1) var<storage,read_write> values:array<u32>;
      @group(0) @binding(2) var<storage,read> ordered:array<u32>;
      @group(0) @binding(3) var<storage,read> count:array<u32>;
      @group(0) @binding(4) var cache:texture_2d<u32>;
      @group(0) @binding(5) var<uniform> uniforms:Uniforms;
      @compute @workgroup_size(256) fn main(@builtin(global_invocation_id) id:vec3u,@builtin(num_workgroups) groups:vec3u){
        let i=id.x+id.y*groups.x*256u; if(i>=count[0]){return;}
        let entry=ordered[i]; let uv=vec2i(i32(entry%uniforms.width),i32(entry/uniforms.width));
        let depth=bitcast<f32>(textureLoad(cache,uv,0).y);
        let normDepth=clamp((depth-uniforms.near)/(uniforms.far-uniforms.near),0.0,1.0);
        keys[i]=u32((1.0-normDepth)*f32((1u<<20u)-1u)); values[i]=entry;
      }`,
      computeBindGroupFormat: this.bindings,
      computeUniformBufferFormats: { uniforms: uniform },
    });
    this.compute = new Compute(
      device,
      this.shader,
      "Director stable entry/depth",
    );
  }
  run(
    keys: any,
    entries: any,
    count: any,
    cache: any,
    capacity: number,
    slot: number,
    width: number,
    near: number,
    far: number,
  ) {
    const ordered = this.sorter.sortIndirect(
      entries,
      capacity,
      32,
      slot,
      count,
      entries,
      true,
      false,
    );
    const c = this.compute;
    for (const [k, v] of Object.entries({
      keys,
      values: entries,
      ordered,
      count,
      cache,
      width,
      near,
      far,
    }))
      c.setParameter(k, v as any);
    Compute.calcDispatchSize(Math.ceil(capacity / 256), this.dispatch);
    c.setupDispatch(this.dispatch.x, this.dispatch.y);
    this.device.computeDispatch([c], "Director stable depth gather");
  }
  destroy() {
    this.compute.destroy();
    this.shader.destroy();
    this.bindings.destroy();
    this.sorter.destroy();
  }
}
