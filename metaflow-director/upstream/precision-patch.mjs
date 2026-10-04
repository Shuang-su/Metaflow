// Isolated source adapter. Original packed caches remain intact for native A/B.
// Exact float32 bits live in a uint texture: no filtering or float quantization.
export function precisionPatch(code, id) {
  const replace = (a, b) => {
    if (!code.includes(a)) throw Error(`Precision anchor missing: ${id}: ${a}`);
    code = code.replace(a, b);
  };
  const all = (a, b) => {
    if (!code.includes(a)) throw Error(`Precision anchor missing: ${id}: ${a}`);
    code = code.replaceAll(a, b);
  };
  if (id.endsWith("/projected-splat-renderer.ts")) {
    code = "import { StableOrder } from '@diagnostic/stable-order';\n" + code;
    replace(
      "private cacheA: Texture | null = null;",
      "private directorOrder: StableOrder | null = null;\n    private cacheA: Texture | null = null;",
    );
    replace(
      "const sortedIndices = this.sorter.sortIndirect(",
      `if ((this.scene as any).directorStableOrder) {
                this.directorOrder ??= new StableOrder(this.device);
                this.directorOrder.run(this.sortKeys,this.compactEntries,this.splatCounter,this.cacheA,
                    this.capacity,sortSlotBase,this.cacheWidth,cameraComponent.nearClip,cameraComponent.farClip);
            }
            const sortedIndices = this.sorter.sortIndirect(`,
    );
    replace(
      "this.sorter.destroy();",
      "this.directorOrder?.destroy();\n        this.sorter.destroy();",
    );
    replace(
      "private cacheA: Texture | null = null;",
      `private cacheHigh: Texture | null = null;
    private highLayout = '';
    private get precision() { return (this.scene as any).directorPrecision ?? 0; }
    private ensurePrecisionCache() {
        const planes = this.precision === 2 ? 3 : this.precision === 1 ? 1 : 0;
        const w = planes ? this.cacheWidth : 1, h = planes ? this.cacheHeight * planes : 1;
        const key = w + ':' + h;
        if (this.highLayout === key) return;
        if (h > this.device.maxTextureSize) throw Error('摄影高精度缓存超过 GPU 纹理尺寸限制');
        this.cacheHigh?.destroy();
        this.cacheHigh = new Texture(this.device, {name:'DirectorFloat32Cache', width:w, height:h,
            format:PIXELFORMAT_RGBA32U, mipmaps:false, storage:true});
        this.highLayout = key;
    }
    private cacheA: Texture | null = null;`,
    );
    // Both the regular render and out-of-frame picking visit this point.
    replace(
      "const start = performance.now();\n        const { camera,",
      "this.ensurePrecisionCache();\n        const start = performance.now();\n        const { camera,",
    );
    all(
      "new UniformFormat('cacheWidth', UNIFORMTYPE_UINT),",
      "new UniformFormat('directorPrecision', UNIFORMTYPE_UINT),\n            new UniformFormat('cacheWidth', UNIFORMTYPE_UINT),",
    );
    replace(
      "...textureFormats,\n            new BindUniformBufferFormat('uniforms'",
      "...textureFormats,\n            new BindStorageTextureFormat('cacheHigh', PIXELFORMAT_RGBA32U),\n            new BindUniformBufferFormat('uniforms'",
    );
    replace(
      "new BindTextureFormat('cacheB', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),",
      "new BindTextureFormat('cacheB', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),\n                new BindTextureFormat('cacheHigh', SHADERSTAGE_COMPUTE, undefined, SAMPLETYPE_UINT, false),",
    );
    all(
      "compute.setParameter('cacheB', this.cacheB);",
      "compute.setParameter('cacheB', this.cacheB);\n        compute.setParameter('cacheHigh', this.cacheHigh);\n        compute.setParameter('directorPrecision', this.precision);",
    );
    for (const receiver of ["this.material", "centers"]) {
      replace(
        `${receiver}.setParameter('cacheB', this.cacheB);`,
        `${receiver}.setParameter('cacheB', this.cacheB);\n        ${receiver}.setParameter('cacheHigh', this.cacheHigh);\n        ${receiver}.setParameter('directorPrecision', this.precision);`,
      );
    }
    replace(
      "const cacheBytes = this.cacheWidth",
      "const highBytes = this.cacheHigh ? this.cacheHigh.width * this.cacheHigh.height * 16 : 0;\n        const cacheBytes = highBytes + this.cacheWidth",
    );
    // Distinct final teardown, not layout rebuild teardown.
    replace(
      "this.sorter.destroy();",
      "this.cacheHigh?.destroy();\n        this.sorter.destroy();",
    );
  }
  if (id.endsWith("/shaders/projected-splat-projector-shader.ts")) {
    replace(
      "    cacheWidth: u32,",
      "    directorPrecision: u32,\n    cacheWidth: u32,",
    );
    const binding =
      "${14 + (bands > 0 ? 1 : 0) + (bands > 1 ? 2 : 0) + (bands > 2 ? 1 : 0)}";
    replace(
      `@group(0) @binding(${binding}) var<uniform> uniforms: ProjectorUniforms;`,
      `@group(0) @binding(${binding}) var cacheHigh: texture_storage_2d<rgba32uint, write>;
@group(0) @binding(${binding.replace("14", "15")}) var<uniform> uniforms: ProjectorUniforms;`,
    );
    replace(
      "let cacheUv = cacheCoord(entry);",
      `let cacheUv = cacheCoord(entry);
    if (uniforms.directorPrecision > 0u) {
        textureStore(cacheHigh, cacheUv, bitcast<vec4u>(color));
        if (uniforms.directorPrecision == 2u) {
            let h = i32(textureDimensions(cacheA).y);
            textureStore(cacheHigh, cacheUv + vec2i(0,h), bitcast<vec4u>(vec4f(ndc,depth,0.0)));
            textureStore(cacheHigh, cacheUv + vec2i(0,2*h), bitcast<vec4u>(vec4f(axis1,axis2)));
        }
    }`,
    );
  }
  const draw = id.endsWith("/shaders/projected-splat-shader.ts");
  const centers = id.endsWith("/shaders/splat-centers-shader.ts");
  if (draw || centers) {
    replace(
      "var cacheB: texture_2d<u32>;",
      "var cacheB: texture_2d<u32>;\nvar cacheHigh: texture_2d<u32>;\nuniform directorPrecision: u32;",
    );
    replace(
      "let ndc = unpack2x16snorm(a.x) * ndcRange;",
      `var ndc = unpack2x16snorm(a.x) * ndcRange;
    if (uniform.directorPrecision == 2u) {
        ndc = bitcast<vec4f>(textureLoad(cacheHigh, uv + vec2i(0,i32(textureDimensions(cacheA).y)),0)).xy;
    }`,
    );
    replace(
      "let color = vec3f(vec3u(rgbBits, rgbBits >> 10u, rgbBits >> 20u) & vec3u(1023u))\n        * (f32(1u << (rgbBits >> 30u)) / 1023.0);",
      `var color = vec3f(vec3u(rgbBits, rgbBits >> 10u, rgbBits >> 20u) & vec3u(1023u))
        * (f32(1u << (rgbBits >> 30u)) / 1023.0);
    if (uniform.directorPrecision == 2u) { color = bitcast<vec4f>(textureLoad(cacheHigh,uv,0)).rgb; }`,
    );
  }
  if (draw) {
    replace(
      "let alpha = f32(alphaByte) / 255.0;",
      `var alpha = f32(alphaByte) / 255.0;
    if (uniform.directorPrecision > 0u) { alpha = bitcast<vec4f>(textureLoad(cacheHigh,uv,0)).a; }`,
    );
    replace(
      "var axis2 = unpack2x16float(b).x * normalize(vec2f(axis1.y, -axis1.x));",
      `var axis2 = unpack2x16float(b).x * normalize(vec2f(axis1.y, -axis1.x));
    if (uniform.directorPrecision == 2u) {
        let axes=bitcast<vec4f>(textureLoad(cacheHigh,uv+vec2i(0,2*i32(textureDimensions(cacheA).y)),0));
        axis1=axes.xy; axis2=axes.zw;
    }`,
    );
    // Keep original varyings for unmodified native branch; photographic values
    // bypass BOTH the opacity byte and the half-float vertex output packing.
    all(
      "varying gaussianUV: vec2f;",
      "varying gaussianUV: vec2f;\nvarying @interpolate(flat) directorFill: vec4f;\nvarying @interpolate(flat) directorRing: vec3f;\nvarying @interpolate(flat) directorMode: u32;",
    );
    replace(
      "output.gaussianUV = corner;",
      "output.gaussianUV = corner;\n    output.directorMode = uniform.directorPrecision;",
    );
    replace(
      "output.packedColor0 = pack2x16float(fill.rg);",
      "output.directorFill = vec4f(fill, alpha);\n    output.directorRing = ring;\n    output.packedColor0 = pack2x16float(fill.rg);",
    );
    replace(
      "let opacity = f32((gaussianFlags >> 8u) & 0xffu) / 255.0;",
      "let opacity = select(f32((gaussianFlags >> 8u) & 0xffu) / 255.0, directorFill.a, directorMode > 0u);",
    );
    replace(
      "var color = vec3f(unpack2x16float(packedColor0), packedMid.x);",
      "var color = vec3f(unpack2x16float(packedColor0), packedMid.x);\n        if(directorMode == 2u) { color = directorFill.rgb; }",
    );
    replace(
      "color = vec3f(packedMid.y, unpack2x16float(packedColor2));",
      "color = vec3f(packedMid.y, unpack2x16float(packedColor2));\n                if(directorMode == 2u) { color = directorRing; }",
    );
  }
  if (id.endsWith("/shaders/footprint-intersect-shader.ts")) {
    replace(
      "struct Uniforms {",
      "struct Uniforms {\n    directorPrecision: u32,",
    );
    replace(
      "@group(0) @binding(6) var<uniform> uniforms: Uniforms;",
      "@group(0) @binding(6) var cacheHigh: texture_2d<u32>;\n@group(0) @binding(7) var<uniform> uniforms: Uniforms;",
    );
    replace(
      "let ndc = unpack2x16snorm(a.x) * ndcRange;",
      "var ndc = unpack2x16snorm(a.x) * ndcRange;\n    if(uniforms.directorPrecision==2u){ndc=bitcast<vec4f>(textureLoad(cacheHigh,uv+vec2i(0,i32(textureDimensions(cacheA).y)),0)).xy;}",
    );
    replace(
      "var axis2 = len2 * normalize(vec2f(axis1.y, -axis1.x));",
      "var axis2 = len2 * normalize(vec2f(axis1.y, -axis1.x));\n    if(uniforms.directorPrecision==2u){let axes=bitcast<vec4f>(textureLoad(cacheHigh,uv+vec2i(0,2*i32(textureDimensions(cacheA).y)),0)); axis1=axes.xy; axis2=axes.zw;}",
    );
  }
  if (id.endsWith("/picker.ts")) {
    // The upstream picker shares scene.colorTarget and originally assumes half-float.
    replace(
      "const r = half2Float(pixels[offset]);",
      "const r = pixels instanceof Float32Array ? pixels[offset] : half2Float(pixels[offset]);",
    );
    replace(
      "const transmittance = half2Float(pixels[offset + 3]);",
      "const transmittance = pixels instanceof Float32Array ? pixels[offset + 3] : half2Float(pixels[offset + 3]);",
    );
  }
  return code;
}
