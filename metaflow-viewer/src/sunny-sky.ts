import {
    Asset,
    BoxGeometry,
    CULLFACE_FRONT,
    Entity,
    FILTER_LINEAR,
    FUNC_LESSEQUAL,
    LAYERID_SKYBOX,
    Mesh,
    MeshInstance,
    SEMANTIC_POSITION,
    ShaderMaterial
} from 'playcanvas';
import type { AppBase, GraphicsDevice, Shader, Texture } from 'playcanvas';
import { LightList } from 'playcanvas/build/playcanvas/src/scene/lighting/light-list.js';

import { startSkyFallback } from './sky-fallback';
import type { SkyLayer, SkyState } from './sky-fallback';
import { vertexGLSL, vertexWGSL, fragmentGLSL, fragmentWGSL, cloudGLSL } from './sky-shaders';

const cloudWGSL = /* wgsl */ `
var backgroundSky: texture_2d<f32>;
var backgroundSkySampler: sampler;
uniform cloudDisplacement: vec2f;
varying skyDirection: vec3f;
fn mfHash(p: vec2f) -> f32 { return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453); }
fn mfNoise(p: vec2f) -> f32 {
    let i = floor(p); let f = fract(p); let u = f * f * (3.0 - 2.0 * f);
    return mix(mix(mfHash(i), mfHash(i + vec2f(1.0,0.0)), u.x),
        mix(mfHash(i + vec2f(0.0,1.0)), mfHash(i + vec2f(1.0,1.0)), u.x), u.y);
}
fn mfCloudNoise(p: vec2f) -> f32 {
    return 0.55 * mfNoise(p) + 0.25 * mfNoise(p * 2.03 + 7.1)
        + 0.13 * mfNoise(p * 4.11 + 13.7) + 0.07 * mfNoise(p * 8.21);
}
@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let d = normalize(input.skyDirection);
    let uv = vec2f(atan2(d.x,d.z) / 6.28318530718 + 0.5, acos(clamp(d.y,-1.0,1.0)) / 3.14159265359);
    var color = pow(textureSample(backgroundSky, backgroundSkySampler, uv).rgb, vec3f(2.2));
    let cloudUv = d.xz / max(d.y + 0.1, 0.12) * 1.8 - uniform.cloudDisplacement;
    let cloudField = mfCloudNoise(cloudUv);
    let coverage = smoothstep(0.74 - 0.32 * 0.55, 0.94 - 0.32 * 0.55, cloudField) * smoothstep(-0.025, 0.16, d.y);
    var cloudColor = vec3f(0.80,0.84,0.91) * (0.72 + 0.3 * (1.0 - coverage) + 0.12 * cloudField);
    cloudColor += vec3f(1.0,0.88,0.7) * pow(max(d.y,0.0),12.0) * coverage * (1.0 - coverage);
    color = mix(cloudColor, color, exp(-coverage * 3.2));
    output.color = vec4f(pow(clamp(color,vec3f(0.0),vec3f(1.0)), vec3f(1.0/2.2)), 1.0);
    return output;
}`;

export type SunnySkyOptions = { dynamicUrl?: string; staticUrl?: string; authoredUrl?: string };

/** Compile before adding the mesh to the visible layer. Both backends retain the old sky until success. */
async function validateShader(app: AppBase, instance: MeshInstance) {
    const camera = app.root.findByName('camera') as Entity;
    const lights = new LightList() as unknown as Parameters<MeshInstance['getShaderInstance']>[1];
    lights.update([], false);
    const device = app.graphicsDevice;
    const format = app.renderer.getViewUniformFormat(false, lights);
    const params = camera.camera?.shaderParams;
    if (!params) throw new Error('Sky camera unavailable');
    const { shader } = instance.getShaderInstance(0, lights, app.scene, params, format);
    if (shader.failed) throw new Error('Sky shader processing failed');
    if (device.isWebGPU) {
        type Module = { getCompilationInfo(): Promise<{ messages: readonly { type: string }[] }> };
        const impl: { getVertexShaderModule(): Module; getFragmentShaderModule(): Module } = shader.impl;
        const modules = [impl.getVertexShaderModule(), impl.getFragmentShaderModule()];
        const infos = await Promise.all(modules.map((module) => module.getCompilationInfo()));
        if (infos.some((info) => info.messages.some((message) => message.type === 'error')))
            throw new Error('Sky WGSL compilation failed');
    } else {
        const impl: {
            link(device: GraphicsDevice, shader: Shader): void;
            finalize(device: GraphicsDevice, shader: Shader): boolean;
        } = shader.impl;
        impl.link(device, shader);
        if (!impl.finalize(device, shader)) throw new Error('Sky GLSL compilation failed');
    }
}

export function installSunnySky(app: AppBase, options: SunnySkyOptions, onState: (state: SkyState) => void) {
    let disposed = false;
    const pending = new Set<() => void>();
    const media = matchMedia('(prefers-reduced-motion: reduce)');
    async function create(url: string, dynamic: boolean): Promise<SkyLayer> {
        const layer = app.scene.layers.getLayerById(LAYERID_SKYBOX);
        if (!layer || disposed) throw new Error('Sky unavailable');
        let instance: MeshInstance | undefined,
            material: ShaderMaterial | undefined,
            destroyed = false;
        const node = new Entity('sunny-background');
        const asset = new Asset(
            'sunny-background',
            'texture',
            { url },
            {
                type: 'default',
                srgb: false,
                mipmaps: false,
                flipY: false,
                addressu: 'repeat',
                addressv: 'clamp'
            }
        );
        const destroy = () => {
            if (destroyed) return;
            destroyed = true;
            if (instance) {
                layer.removeMeshInstances([instance]);
                instance.destroy();
            }
            material?.destroy();
            node.destroy();
            asset.unload();
            app.assets.remove(asset);
            pending.delete(destroy);
        };
        pending.add(destroy);
        try {
            await new Promise<void>((resolve, reject) => {
                asset.once('load', () => {
                    if (destroyed) {
                        asset.unload();
                        reject(new Error('Sky disposed'));
                    } else resolve();
                });
                asset.once('error', reject);
                app.assets.add(asset);
                app.assets.load(asset);
            });
            if (disposed || destroyed) throw new Error('Sky disposed');
            const texture = asset.resource as Texture;
            texture.minFilter = texture.magFilter = FILTER_LINEAR;
            material = new ShaderMaterial({
                uniqueName: dynamic ? 'SPSlowClouds' : 'SPStaticSunnySky',
                vertexGLSL,
                vertexWGSL,
                fragmentGLSL: dynamic ? cloudGLSL : fragmentGLSL,
                fragmentWGSL: dynamic ? cloudWGSL : fragmentWGSL,
                attributes: { aPosition: SEMANTIC_POSITION }
            });
            material.cull = CULLFACE_FRONT;
            material.depthWrite = false;
            material.depthFunc = FUNC_LESSEQUAL;
            if ('sceneTexturesWrite' in material) material.sceneTexturesWrite = false;
            material.setParameter('backgroundSky', texture);
            material.setParameter('cloudDisplacement', [0.036, 0.012]);
            instance = new MeshInstance(Mesh.fromGeometry(app.graphicsDevice, new BoxGeometry()), material, node);
            instance.cull = false;
            instance.pick = false;
            instance.castShadow = false;
            await validateShader(app, instance);
            if (disposed || destroyed) throw new Error('Sky disposed');
            let seconds = 12;
            return {
                destroy,
                activate: () => {
                    layer.addMeshInstances([instance!]);
                    app.renderNextFrame = true;
                },
                update: dynamic
                    ? (dt) => {
                          if (document.hidden || media.matches || disposed) return;
                          seconds += Math.min(dt, 0.1);
                          material!.setParameter('cloudDisplacement', [seconds * 0.003, seconds * 0.001]);
                          app.renderNextFrame = true;
                      }
                    : undefined
            };
        } catch (error) {
            destroy();
            throw error;
        }
    }
    let authored: SkyLayer | undefined;
    const baseReady = options.authoredUrl
        ? create(options.authoredUrl, false)
              .then((layer) => {
                  if (disposed) {
                      layer.destroy();
                      return;
                  }
                  authored = layer;
                  layer.activate();
              })
              .catch((): void => undefined)
        : Promise.resolve();
    const { dynamicUrl, staticUrl } = options;
    const fallback =
        dynamicUrl && staticUrl
            ? startSkyFallback(
                  {
                      dynamic: async () => {
                          await baseReady;
                          return create(dynamicUrl, true);
                      },
                      static: () => create(staticUrl, false)
                  },
                  (state) => {
                      if (state === 'dynamic' || state === 'static') authored?.destroy();
                      onState(state);
                  }
              )
            : undefined;
    if (!fallback)
        void baseReady.then(() => {
            if (!disposed) onState('authored');
        });
    const update = (dt: number) => fallback?.update(dt);
    app.on('update', update);
    return () => {
        disposed = true;
        app.off('update', update);
        fallback?.destroy();
        authored?.destroy();
        for (const destroy of [...pending]) destroy();
    };
}
