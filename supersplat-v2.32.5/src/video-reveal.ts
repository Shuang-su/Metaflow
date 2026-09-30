import {
    ADDRESS_CLAMP_TO_EDGE, BlendState, BoundingBox, drawQuadWithShader, FILTER_NEAREST,
    Mat4, PIXELFORMAT_RGBA32F, RenderTarget, SEMANTIC_POSITION, ShaderUtils, Texture, Vec3,
    type Shader, type ShaderMaterial
} from 'playcanvas';

import type { Scene } from './scene';
import { vertexShader as positionVertex } from './shaders/position-shader';
import type { Splat } from './splat';
import { awaitVideoTask, sortVideoSplats, videoSorter } from './video-render-session';
import { GsplatRevealRadial, gsplatRevealRadialGLSL, type RevealDotProfile } from './studio/viewer-compat/gsplat-reveal-radial';

// The effect and all profile/timing constants are owned by the Viewer class.
// This file only adapts world coordinates, Editor covariance and its sorter.
const revealCorner = /* glsl */`
bool initVideoRevealCorner(SplatSource source, SplatCenter center, out SplatCorner corner) {
    if (gRevealLiftTime > 0.0 && gRevealLiftWave >= gRevealDist + 2.0) {
        // Keep the Editor's full palette/object covariance when restored.
        return initCorner(source, center, corner);
    }
    mat4 model = applyPaletteTransform(matrix_model);
    vec3 modelScale = vec3(length(model[0].xyz), length(model[1].xyz), length(model[2].xyz));
    vec3 scale = getScale() * modelScale;
    vec4 rotation = getRotation().yzwx;
    modifySplatRotationScale(center.modelCenterOriginal, center.modelCenterModified, rotation, scale);
    if (all(equal(scale, vec3(0.0)))) return false;
    SplatCenter sphere = center;
    sphere.modelView = matrix_view;
    vec3 covA, covB;
    computeCovariance(vec4(1.0, 0.0, 0.0, 0.0), scale, covA, covB);
    return initCornerCov(source, sphere, corner, covA, covB);
}
`;

// Run the SAME position modifier on GPU for depth sorting. CPU Math.sin has
// different precision from GLSL and cannot reproduce this hash-based motion.
const positionFragment = /* glsl */`
uniform highp usampler2D transformA;
uniform highp usampler2D splatTransform;
uniform highp sampler2D transformPalette;
uniform ivec2 splat_params;
uniform mat4 mfModel;
uniform mat4 mfInverse;
void gsplatMakeSpherical(inout vec3 scale, float size) { scale = vec3(size); }
float gsplatGetSizeFromScale(vec3 scale) { return sqrt(dot(scale, scale) / 3.0); }
${gsplatRevealRadialGLSL}
void main(void) {
    ivec2 uv = ivec2(gl_FragCoord);
    if (uv.x + uv.y * splat_params.x >= splat_params.y) discard;
    vec3 center = uintBitsToFloat(texelFetch(transformA, uv, 0).xyz);
    mat4 model = mfModel;
    uint index = texelFetch(splatTransform, uv, 0).r;
    if (index > 0u) {
        int u = int(index % 512u) * 3;
        int v = int(index / 512u);
        mat4 t;
        t[0] = texelFetch(transformPalette, ivec2(u, v), 0);
        t[1] = texelFetch(transformPalette, ivec2(u + 1, v), 0);
        t[2] = texelFetch(transformPalette, ivec2(u + 2, v), 0);
        t[3] = vec4(0.0, 0.0, 0.0, 1.0);
        model = model * transpose(t);
    }
    vec3 worldCenter = (model * vec4(center, 1.0)).xyz;
    modifySplatCenter(worldCenter);
    gl_FragColor = vec4((mfInverse * vec4(worldCenter, 1.0)).xyz, 0.0);
}
`;

const visibleRevealSplats = (scene: Scene): Splat[] => scene.events.invoke('scene.splats').filter((s: Splat) => s.visible && s.numSplats > 0);
const revealUniforms = ['Time', 'Center', 'Radius', 'Speed', 'Acceleration', 'Delay', 'Oscillation', 'DotSize', 'Active'].map(n => `uReveal${n}`);
type ParameterValue = Parameters<ShaderMaterial['setParameter']>[1];
const parameter = (material: ShaderMaterial, name: string) => (material.getParameter(name) as { data: ParameterValue } | undefined)?.data;

const createVideoRevealEffect = (scene: Scene, splats: Splat[], dotProfile: RevealDotProfile = 'streamingScene') => {
    if (!splats.length) throw new Error('There are no visible Gaussian elements to render');
    const bounds = new BoundingBox();
    bounds.copy(splats[0].worldBound);
    for (const s of splats.slice(1)) bounds.add(s.worldBound);
    const focus = scene.events.invoke('camera.getPose')?.target;
    return new GsplatRevealRadial(scene.app, splats.map(s => s.entity), bounds,
        focus ? new Vec3(focus.x, focus.y, focus.z) : bounds.center,
        { dotProfile });
};

class VideoReveal {
    readonly effect: GsplatRevealRadial;
    private scene: Scene;
    private shader: Shader;
    private restored = true;
    private patches: {
        splat: Splat;
        vertex: string;
        center: string;
        modifier: string | undefined;
        chunkVersion: string;
        parameters: Map<string, ParameterValue>;
        centers: Float32Array;
        target?: RenderTarget;
        pixels?: Float32Array;
    }[];

    constructor(scene: Scene, splats: Splat[], dotProfile: RevealDotProfile = 'streamingScene') {
        this.scene = scene;
        this.effect = createVideoRevealEffect(scene, splats, dotProfile);
        this.patches = splats.map((splat) => {
            const { material, sorter } = splat.entity.gsplat.instance;
            const glsl = material.shaderChunks.glsl;
            videoSorter(scene, splat);
            return { splat,
                vertex: glsl.get('gsplatVS'),
                center: glsl.get('gsplatCenterVS'),
                modifier: glsl.get('gsplatModifyVS'),
                centers: sorter.centers.slice(),
                chunkVersion: material.shaderChunksVersion,
                parameters: new Map(revealUniforms.map(n => [n, parameter(material, n)])) };
        });
    }

    private patchMaterials() {
        for (const p of this.patches) {
            const material = p.splat.entity.gsplat.instance.material;
            const glsl = material.shaderChunks.glsl;
            glsl.set('gsplatVS', p.vertex.replace('void main(void)', `${revealCorner}\nvoid main(void)`)
            .replace('!initCorner(source, center, corner)', '!initVideoRevealCorner(source, center, corner)'));
            glsl.set('gsplatCenterVS', p.center.replace('vec4 centerView = modelView * vec4(modelCenter, 1.0);', `
                vec3 worldCenter = (applyPaletteTransform(matrix_model) * vec4(modelCenter, 1.0)).xyz;
                modifySplatCenter(worldCenter);
                vec4 centerView = matrix_view * vec4(worldCenter, 1.0);
            `));
            material.update();
        }
        this.restored = false;
    }

    private async updatePositions(p: VideoReveal['patches'][number], signal: AbortSignal) {
        const device = this.scene.graphicsDevice;
        const { instance } = p.splat.entity.gsplat;
        const transformA = instance.resource.getTexture('transformA');
        if (!this.shader) {
            this.shader = ShaderUtils.createShader(device, {
                uniqueName: 'MetaflowVideoRevealSort',
                attributes: { vertex_position: SEMANTIC_POSITION },
                vertexGLSL: positionVertex,
                fragmentGLSL: positionFragment
            });
        }
        if (!p.target) {
            const texture = new Texture(device, {
                name: 'MetaflowVideoRevealPositions',
                width: transformA.width,
                height: transformA.height,
                format: PIXELFORMAT_RGBA32F,
                mipmaps: false,
                minFilter: FILTER_NEAREST,
                magFilter: FILTER_NEAREST,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            });
            p.target = new RenderTarget({ colorBuffer: texture, depth: false });
            p.pixels = new Float32Array(transformA.width * transformA.height * 4);
        }
        const values: Record<string, unknown> = {
            transformA,
            splatTransform: p.splat.transformTexture,
            transformPalette: p.splat.transformPalette.texture,
            splat_params: [transformA.width, p.splat.splatData.numSplats],
            mfModel: p.splat.worldTransform.data,
            mfInverse: new Mat4().invert(p.splat.worldTransform).data
        };
        // Consume the canonical class's exact current uniform values.
        for (const name of revealUniforms) values[name] = parameter(instance.material, name);
        for (const [name, value] of Object.entries(values)) device.scope.resolve(name).setValue(value);
        device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(device, p.target, this.shader);
        await awaitVideoTask(p.target.colorBuffer.read(0, 0, transformA.width, transformA.height,
            { renderTarget: p.target, data: p.pixels }), signal);
        signal.throwIfAborted();
        const centers = instance.sorter.centers;
        for (let i = 0; i < p.splat.splatData.numSplats; ++i) {
            centers[i * 3] = p.pixels[i * 4];
            centers[i * 3 + 1] = p.pixels[i * 4 + 1];
            centers[i * 3 + 2] = p.pixels[i * 4 + 2];
        }
    }

    async prepare(seconds: number, signal: AbortSignal) {
        signal.throwIfAborted();
        const active = this.effect.setCaptureTime(seconds);
        if (!active) {
            this.restore();
            await sortVideoSplats(this.scene, this.patches.map(p => p.splat), signal);
            return;
        }
        if (this.restored) this.patchMaterials();
        for (const p of this.patches) await this.updatePositions(p, signal);
        await sortVideoSplats(this.scene, this.patches.map(p => p.splat), signal);
    }

    private restore() {
        this.effect.destroy();
        if (this.restored) return;
        for (const p of this.patches) {
            const { material, sorter } = p.splat.entity.gsplat.instance;
            const glsl = material.shaderChunks.glsl;
            glsl.set('gsplatVS', p.vertex);
            glsl.set('gsplatCenterVS', p.center);
            if (p.modifier === undefined) glsl.delete('gsplatModifyVS');
            else glsl.set('gsplatModifyVS', p.modifier);
            material.shaderChunksVersion = p.chunkVersion;
            for (const [name, value] of p.parameters) {
                if (value === undefined) material.deleteParameter(name);
                else material.setParameter(name, value);
            }
            material.update();
            sorter.centers.set(p.centers);
        }
        this.restored = true;
    }

    destroy() {
        this.restore();
        for (const p of this.patches) {
            p.target?.colorBuffer.destroy();
            p.target?.destroy();
        }
        this.shader?.destroy();
        this.patches = [];
    }
}

export { createVideoRevealEffect, VideoReveal, visibleRevealSplats };
