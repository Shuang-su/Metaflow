/// <reference types="vite/client" />
import {
  BindGroupFormat,
  BindStorageBufferFormat,
  BindUniformBufferFormat,
  BUFFERUSAGE_COPY_DST,
  BUFFERUSAGE_COPY_SRC,
  Compute,
  Entity,
  Shader,
  SHADERLANGUAGE_WGSL,
  SHADERSTAGE_COMPUTE,
  StorageBuffer,
  UniformBufferFormat,
  UniformFormat,
  UNIFORMTYPE_UINT,
  createGraphicsDevice,
} from "playcanvas";
import { App } from "../../metaflow-viewer/src/app";
import { VoxelCollision } from "../../metaflow-viewer/src/collision/voxel-collision";
import { VoxelDebugOverlay } from "../../metaflow-viewer/src/voxel-debug-overlay";
import overlaySource from "../../metaflow-viewer/src/voxel-debug-overlay.ts?raw";

type Query = [number, number, number];
type Request = {
  sources: { label: string; url: string; hash: string }[];
  queries: Query[];
  expectedProductionShaderSourceHash: string;
};
const digest = async (bytes: Uint8Array | string) => {
  const data =
    typeof bytes === "string"
      ? new TextEncoder().encode(bytes)
      : Uint8Array.from(bytes);
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("");
};
function excerpt(from: string, to: string, start = 0) {
  const begin = overlaySource.indexOf(from, start),
    end = overlaySource.indexOf(to, begin);
  if (begin < 0 || end <= begin)
    throw Error(
      "Production GPU kernel structure changed; review the probe extraction",
    );
  return overlaySource.slice(begin, end);
}
// These functions/statements come byte-for-byte from the active production
// overlay. Only their invocation and result storage are test-specific glue.
const queryBlock = excerpt("fn queryBlock(", "// Ray-AABB intersection");
const masks = excerpt("var maskLo: u32", "for (var vStep:");
const leafTest = excerpt(
  "var isSolid = false;",
  "let isHit =",
  overlaySource.indexOf("var maskLo: u32"),
);
const shaderSource = `
const SOLID_LEAF_MARKER: u32 = 0xFF000000u;
struct Uniforms { treeDepth:u32, nodeStride:u32, nodeWords:u32, leafWords:u32, queryCount:u32 };
@group(0) @binding(0) var<uniform> uniforms:Uniforms;
@group(0) @binding(1) var<storage,read> nodes:array<u32>;
@group(0) @binding(2) var<storage,read> leafData:array<u32>;
@group(0) @binding(3) var<storage,read> probes:array<u32>;
@group(0) @binding(4) var<storage,read_write> results:array<u32>;
${queryBlock}
@compute @workgroup_size(64) fn main(@builtin(global_invocation_id) id:vec3u) {
  let i=id.x; let total=uniforms.nodeWords+uniforms.leafWords;
  // Read back the exact buffers constructed by VoxelDebugOverlay. Its buffers
  // have no COPY_SRC flag, so a storage read copies them into our readback buffer.
  if(i<uniforms.nodeWords){results[i]=nodes[i];}
  else if(i<total){results[i]=leafData[i-uniforms.nodeWords];}
  if(i>=uniforms.queryCount){return;}
  let ix=probes[i*3u];let iy=probes[i*3u+1u];let iz=probes[i*3u+2u];
  let blockResult=queryBlock(i32(ix>>2u),i32(iy>>2u),i32(iz>>2u)).x;
  if(blockResult==0u){results[total+i]=0u;return;}
  let vx=i32(ix&3u);let vy=i32(iy&3u);let vz=i32(iz&3u);
  ${masks}
  ${leafTest}
  results[total+i]=select(0u,1u,isSolid);
}`;

async function run(request: Request) {
  if (
    request.sources.length !== 2 ||
    request.queries.length < 1 ||
    request.queries.length > 256
  )
    throw Error(
      "Proof is bounded to two sources and at most 256 occupancy probes",
    );
  const productionShaderSourceHash = await digest(overlaySource);
  if (productionShaderSourceHash !== request.expectedProductionShaderSourceHash)
    throw Error(
      "Browser production shader source differs from the frozen runner source",
    );
  const canvas = document.getElementById("gpu-proof") as HTMLCanvasElement;
  const device = await createGraphicsDevice(canvas, {
    deviceTypes: ["webgpu"],
  });
  if (!device.isWebGPU || !device.supportsCompute) {
    device.destroy();
    throw Error("Actual WebGPU compute is required; no CPU fallback");
  }
  const app = new App(canvas, {
    graphicsDevice: device,
    mouse: null,
    keyboard: null,
    touch: null,
  });
  const camera = new Entity("gpu-proof-camera");
  camera.addComponent("camera");
  app.root.addChild(camera);
  const gpuErrors: string[] = [];
  const wgpu = (device as any).wgpu;
  const onError = (event: any) =>
    gpuErrors.push(event.error?.message ?? String(event));
  wgpu.addEventListener("uncapturederror", onError);
  const sources = [];
  try {
    for (const source of request.sources) {
      document.getElementById("status")!.textContent = `核验 ${source.label}`;
      const [jr, br] = await Promise.all([
        fetch(source.url, { cache: "no-store" }),
        fetch(source.url.replace(/\.json$/, ".bin"), { cache: "no-store" }),
      ]);
      if (!jr.ok || !br.ok) throw Error("Collision source HTTP failure");
      const json = new Uint8Array(await jr.arrayBuffer()),
        binary = new Uint8Array(await br.arrayBuffer());
      if (binary.byteLength > 32 * 1024 ** 2)
        throw Error("GPU proof source exceeds its 32 MiB bound");
      const sourceHash = `${await digest(json)}:${await digest(binary)}`;
      if (sourceHash !== source.hash)
        throw Error("Collision source hash mismatch");
      const metadata = JSON.parse(new TextDecoder().decode(json)),
        nodeWords = metadata.nodeWordCount ?? metadata.nodeCount;
      if (
        (nodeWords + metadata.leafDataCount) * 4 !== binary.byteLength ||
        metadata.leafSize !== 4 ||
        metadata.treeDepth < 1
      )
        throw Error("Unsupported GPU probe octree layout");
      const words = new Uint32Array(
        binary.buffer,
        binary.byteOffset,
        binary.byteLength / 4,
      );
      const collision = new VoxelCollision(
        metadata,
        words.subarray(0, nodeWords),
        words.subarray(nodeWords),
      );
      for (const q of request.queries)
        if (
          q.length !== 3 ||
          !q.every(
            (v, i) =>
              Number.isInteger(v) &&
              v >= 0 &&
              v <
                [
                  collision.numVoxelsX,
                  collision.numVoxelsY,
                  collision.numVoxelsZ,
                ][i],
          )
        )
          throw Error("Probe outside source grid");
      const overlay = new VoxelDebugOverlay(app, collision, camera);
      // Test observation of the real uploader's private buffers, without any
      // production API or layout changes. No replacement uploader is used.
      const uploaded = overlay as unknown as {
        nodesBuffer: StorageBuffer;
        leafDataBuffer: StorageBuffer;
      };
      const probes = new StorageBuffer(
        device,
        request.queries.length * 12,
        BUFFERUSAGE_COPY_DST,
      );
      const output = new StorageBuffer(
        device,
        (words.length + request.queries.length) * 4,
        BUFFERUSAGE_COPY_SRC,
      );
      const shader = new Shader(device, {
        name: "MF97ProductionOctreeProbe",
        shaderLanguage: SHADERLANGUAGE_WGSL,
        cshader: shaderSource,
        computeUniformBufferFormats: {
          uniforms: new UniformBufferFormat(
            device,
            [
              "treeDepth",
              "nodeStride",
              "nodeWords",
              "leafWords",
              "queryCount",
            ].map((name) => new UniformFormat(name, UNIFORMTYPE_UINT)),
          ),
        },
        computeBindGroupFormat: new BindGroupFormat(device, [
          new BindUniformBufferFormat("uniforms", SHADERSTAGE_COMPUTE),
          new BindStorageBufferFormat("nodes", SHADERSTAGE_COMPUTE, true),
          new BindStorageBufferFormat("leafData", SHADERSTAGE_COMPUTE, true),
          new BindStorageBufferFormat("probes", SHADERSTAGE_COMPUTE, true),
          new BindStorageBufferFormat("results", SHADERSTAGE_COMPUTE, false),
        ]),
      });
      const compute = new Compute(device, shader, "MF97ProductionOctreeProbe");
      try {
        const probeWords = new Uint32Array(request.queries.flat());
        probes.write(0, probeWords, 0, probeWords.length);
        for (const [key, value] of Object.entries({
          treeDepth: collision.treeDepth,
          nodeStride: collision.nodeStride,
          nodeWords: collision.nodes.length,
          leafWords: collision.leafData.length,
          queryCount: request.queries.length,
          nodes: uploaded.nodesBuffer,
          leafData: uploaded.leafDataBuffer,
          probes,
          results: output,
        }))
          compute.setParameter(key, value);
        compute.setupDispatch(
          Math.ceil(Math.max(words.length, request.queries.length) / 64),
          1,
          1,
        );
        device.computeDispatch(
          [compute],
          "MF97 GPU upload readback and occupancy proof",
        );
        const readback = (await output.read(
          0,
          output.byteSize,
          null,
          true,
        )) as Uint8Array;
        if (gpuErrors.length) throw Error(gpuErrors.join("\n"));
        const gpuBinaryHash = await digest(
          readback.subarray(0, binary.byteLength),
        );
        if (gpuBinaryHash !== sourceHash.split(":")[1])
          throw Error("Uploaded GPU octree differs from source binary");
        const gpu = Array.from(
          new Uint32Array(
            readback.buffer,
            readback.byteOffset + binary.byteLength,
            request.queries.length,
          ),
        );
        const cpu = request.queries.map((q) =>
          Number(collision.isVoxelSolid(...q)),
        );
        if (gpu.some((value, index) => value !== cpu[index]))
          throw Error(
            `Production GPU occupancy differs from CPU for ${source.label}`,
          );
        sources.push({
          label: source.label,
          sourceHash,
          binaryBytes: binary.byteLength,
          nodeWords: collision.nodes.length,
          leafWords: collision.leafData.length,
          gpuBinaryHash,
          uploadedDataExactlyMatchesCpu: true,
          queryCount: request.queries.length,
          gpuOccupancy: gpu,
          cpuOccupancy: cpu,
          mismatches: 0,
        });
      } finally {
        compute.destroy();
        shader.destroy();
        probes.destroy();
        output.destroy();
        overlay.destroy();
      }
    }
    const report = {
      passed: true,
      backend: "actual-webgpu",
      scope:
        "production overlay buffer upload plus exact queryBlock/leaf-mask occupancy kernel",
      excludes: [
        "GPU ray-DDA hit distances",
        "capsule or walking movement",
        "same-source Recast",
        "default Viewer replacement",
      ],
      productionShaderSourceHash,
      harnessShaderHash: await digest(shaderSource),
      queryBlockHash: await digest(queryBlock),
      leafMaskHash: await digest(masks + leafTest),
      queries: request.queries,
      sources,
      gpuErrors,
    };
    document.getElementById("status")!.textContent = JSON.stringify(
      report,
      null,
      2,
    );
    return report;
  } finally {
    wgpu.removeEventListener("uncapturederror", onError);
    app.destroy();
  }
}
let running = false;
(window as any).runGpuCollisionProof = async (request: Request) => {
  if (running) throw Error("GPU proof is already running");
  running = true;
  try {
    return await run(request);
  } finally {
    running = false;
  }
};
