import type { GraphicsDevice, Shader } from 'playcanvas';
import {
    ADDRESS_CLAMP_TO_EDGE,
    FILTER_LINEAR,
    PIXELFORMAT_RGBA8,
    SEMANTIC_POSITION,
    BlendState,
    RenderTarget,
    ShaderUtils,
    Texture,
    drawQuadWithShader
} from 'playcanvas';

import type { Background } from './background';
import { normalizeColor, normalizeGradient, sampleRamp } from './background';

// Both backends use the same sRGB ramp and top-left normalized output coordinates.
export const backgroundGLSL = `
uniform sampler2D mfBackgroundRamp;
uniform vec4 mfBackgroundMeta;
uniform vec4 mfBackgroundGeometry;
uniform vec2 mfBackgroundSize;
vec3 mfBackgroundColor(vec2 uvTop) {
    float linearT = .5 + dot((uvTop - .5) * mfBackgroundSize, mfBackgroundMeta.zw) /
        max(dot(abs(mfBackgroundMeta.zw), mfBackgroundSize), .00001);
    float radialT = length((uvTop - mfBackgroundGeometry.xy) / mfBackgroundGeometry.zw);
    float t = mix(linearT, radialT, mfBackgroundMeta.y);
    return texture2D(mfBackgroundRamp, vec2((clamp(t, 0., 1.) * 1023. + .5) / 1024., .5)).rgb;
}
`;
export const backgroundWGSL = `
var mfBackgroundRamp: texture_2d<f32>;
var mfBackgroundRampSampler: sampler;
uniform mfBackgroundMeta: vec4f;
uniform mfBackgroundGeometry: vec4f;
uniform mfBackgroundSize: vec2f;
fn mfBackgroundColor(uvTop: vec2f) -> vec3f {
    let linearT = .5 + dot((uvTop - .5) * uniform.mfBackgroundSize, uniform.mfBackgroundMeta.zw) /
        max(dot(abs(uniform.mfBackgroundMeta.zw), uniform.mfBackgroundSize), .00001);
    let radialT = length((uvTop - uniform.mfBackgroundGeometry.xy) / uniform.mfBackgroundGeometry.zw);
    let t = mix(linearT, radialT, uniform.mfBackgroundMeta.y);
    return textureSampleLevel(mfBackgroundRamp, mfBackgroundRampSampler, vec2f((clamp(t, 0., 1.) * 1023. + .5) / 1024., .5), 0.).rgb;
}
`;
export class BackgroundRenderer {
    enabled = false;
    private ramp: Texture;
    private target?: RenderTarget;
    private shader?: Shader;
    private meta = [0, 0, 0, 1];
    private geometry = [0.5, 0.5, 0.5, 0.5];
    constructor(private device: GraphicsDevice) {
        this.ramp = new Texture(device, {
            name: 'background-ramp',
            width: 1024,
            height: 1,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
            minFilter: FILTER_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        this.setBackground({ color: [0, 0, 0] });
    }
    setBackground(bg: Background) {
        const base = normalizeColor(bg.color);
        this.enabled = !!bg.gradient;
        const g = bg.gradient && normalizeGradient(bg.gradient);
        const a = ((g?.angle ?? 180) * Math.PI) / 180;
        this.meta = [this.enabled ? 1 : 0, g?.type === 'radial' ? 1 : 0, Math.sin(a), -Math.cos(a)];
        this.geometry = g ? [...g.center, ...g.radius] : [0.5, 0.5, 0.5, 0.5];
        const data = this.ramp.lock() as Uint8Array;
        for (let i = 0; i < 1024; i++) {
            const c = g ? sampleRamp(g, base, i / 1023) : base;
            data.set([...c.map((v) => Math.round(v * 255)), 255], i * 4);
        }
        this.ramp.unlock();
    }
    bindings(width: number, height: number) {
        return {
            mfBackgroundRamp: this.ramp,
            mfBackgroundMeta: this.meta,
            mfBackgroundGeometry: this.geometry,
            mfBackgroundSize: [width, height]
        };
    }
    bind(width: number, height: number) {
        for (const [key, value] of Object.entries(this.bindings(width, height)))
            this.device.scope.resolve(key).setValue(value);
    }
    /** Source must contain premultiplied sRGB colour. Never samples and writes the same target. */
    compose(source: RenderTarget): RenderTarget {
        if (!this.enabled) return source;
        const { width, height } = source;
        if (this.target?.width !== width || this.target?.height !== height) {
            this.target?.colorBuffer.destroy();
            this.target?.destroy();
            this.target = new RenderTarget({
                colorBuffer: new Texture(this.device, {
                    name: 'background-composite',
                    width,
                    height,
                    format: PIXELFORMAT_RGBA8,
                    mipmaps: false,
                    minFilter: FILTER_LINEAR,
                    magFilter: FILTER_LINEAR
                }),
                depth: false
            });
        }
        this.shader ??= ShaderUtils.createShader(this.device, {
            uniqueName: 'metaflow-background-composite',
            attributes: { vertex_position: SEMANTIC_POSITION },
            vertexGLSL: 'attribute vec2 vertex_position; void main(){gl_Position=vec4(vertex_position,0.,1.);}',
            fragmentGLSL: `${backgroundGLSL}\nuniform sampler2D mfBackgroundSource;
                void main(){vec2 uv=gl_FragCoord.xy/mfBackgroundSize; vec4 s=texture2D(mfBackgroundSource,uv);
                gl_FragColor=vec4(s.rgb+mfBackgroundColor(vec2(uv.x,1.-uv.y))*(1.-s.a),1.);}`,
            vertexWGSL:
                'attribute vertex_position: vec2f; @vertex fn vertexMain(input: VertexInput)->VertexOutput {var o: VertexOutput; o.position=vec4f(input.vertex_position,0.,1.); return o;}',
            fragmentWGSL: `${backgroundWGSL}\nvar mfBackgroundSource: texture_2d<f32>;
                @fragment fn fragmentMain(input: FragmentInput)->FragmentOutput {var o: FragmentOutput;
                let s=textureLoad(mfBackgroundSource,vec2i(pcPosition.xy),0);
                o.color=vec4f(s.rgb+mfBackgroundColor(pcPosition.xy/uniform.mfBackgroundSize)*(1.-s.a),1.); return o;}`
        });
        this.bind(width, height);
        this.device.scope.resolve('mfBackgroundSource').setValue(source.colorBuffer);
        this.device.setBlendState(BlendState.NOBLEND);
        drawQuadWithShader(this.device, this.target, this.shader);
        return this.target;
    }
    destroy() {
        this.ramp.destroy();
        this.target?.colorBuffer.destroy();
        this.target?.destroy();
        this.shader?.destroy();
    }
}
