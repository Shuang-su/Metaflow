import { Asset, Color, ShaderChunks, FramePassBloom, Mat4, RenderPassCompose, RenderTarget, Texture,
    ADDRESS_CLAMP_TO_EDGE, FILTER_LINEAR, PIXELFORMAT_RGBA8, PIXELFORMAT_RGBA16F,
    TONEMAP_NONE, TONEMAP_LINEAR, TONEMAP_FILMIC, TONEMAP_HEJL, TONEMAP_ACES, TONEMAP_ACES2, TONEMAP_NEUTRAL } from 'playcanvas';

import { StudioHotspots } from './hotspots';
import { composeGradientGlsl } from './viewer-compat/background-gradient';
import type { ExperienceSettings } from '../../../metaflow-viewer/src/settings';
import type { Scene } from '../scene';
import { vertexShader } from '../shaders/blit-shader';
import { ShaderQuad, SimpleRenderPass } from '../utils/simple-render-pass';

const backgroundShader = /* glsl */ `
uniform sampler2D srcTexture;
uniform sampler2D skyTexture;
uniform vec2 outputSize;
uniform vec3 backgroundColor;
uniform vec3 cameraPosition;
uniform mat4 inverseViewProjection;
uniform float skyEncoding;
uniform float hasSky;
uniform float hasGradient;
void main() {
    vec2 uv = gl_FragCoord.xy / outputSize;
    vec4 source = texture2D(srcTexture, uv);
    vec3 background = pow(backgroundColor, vec3(2.2));
    if (hasSky > 0.5) {
        vec4 world = inverseViewProjection * vec4(uv * 2.0 - 1.0, 1.0, 1.0);
        vec3 dir = normalize(world.xyz / world.w - cameraPosition);
        vec2 coord = vec2(atan(dir.x, -dir.z) / 6.2831853 + 0.5, acos(clamp(dir.y, -1.0, 1.0)) / 3.14159265);
        vec4 sky = texture2D(skyTexture, coord);
        background = sky.rgb;
        if (skyEncoding < 0.5) background = pow(sky.rgb, vec3(2.2));
        else if (skyEncoding < 1.5) background = pow(sky.rgb * (8.0 - sky.a * 7.0), vec3(2.0));
        else if (skyEncoding < 2.5) background = sky.a == 0.0 ? vec3(0.0) : sky.rgb * pow(2.0, sky.a * 255.0 - 128.0);
    }
    // Editor splats write premultiplied gamma-space color into their MRT. Decode
    // once at this boundary. Picking/work buffers remain owned by Editor.
    float alpha = clamp(source.a, 0.0, 1.0);
    vec3 linearColor = pow(max(source.rgb / max(alpha, 0.00001), vec3(0.0)), vec3(2.2)) * alpha;
    gl_FragColor = hasGradient > 0.5 && hasSky < 0.5 ? vec4(linearColor / max(alpha, 0.00001), alpha) : vec4(linearColor + background * (1.0 - alpha), 1.0);
}`;
const tones = { none: TONEMAP_NONE, linear: TONEMAP_LINEAR, filmic: TONEMAP_FILMIC, hejl: TONEMAP_HEJL, aces: TONEMAP_ACES, aces2: TONEMAP_ACES2, neutral: TONEMAP_NEUTRAL };

export class StudioCompositor {
    private hotspots: StudioHotspots;
    private linear: RenderTarget;
    output: RenderTarget;
    private background: SimpleRenderPass;
    private quad: ShaderQuad;
    private bloom: FramePassBloom;
    private compose: RenderPassCompose;
    private sky: Asset;
    private skyGeneration = 0;
    private inverse = new Mat4();
    private precision: boolean;
    private gradientPatch = '';
    private originalComposeEnd: string;
    constructor(private scene: Scene, private settings: () => ExperienceSettings, private hotspotState: () => { enabled: boolean; hovered: number; cssHeight: number }) {
        this.hotspots = new StudioHotspots(scene);
        this.originalComposeEnd = ShaderChunks.get(scene.graphicsDevice, 'glsl').get('composeMainEndPS') ?? '';
        scene.events.on('prerender', () => this.prepare());
    }
    async setSky(url?: string, filename?: string) {
        const generation = ++this.skyGeneration;
        if (!url) {
            this.sky?.unload(); if (this.sky) this.scene.app.assets.remove(this.sky);
            this.sky = null; this.scene.forceRender = true; return;
        }
        // TextureHandler substitutes a blank texture when HDR parsing returns null.
        // Validate with the same locked engine parser before replacing a working sky.
        const isHdr = /\.hdr(?:$|[?#])/i.test(filename ?? url);
        if (isHdr) {
            const response = await fetch(url);
            if (!response.ok) throw new Error(`天空盒读取失败：${response.status}`);
            let parsed;
            try {
                const parser = this.scene.app.loader.getHandler('texture').parsers.reverse().find(parser => parser.canParse({ ext: 'hdr', url: filename ?? url, basename: filename ?? url, asset: null, app: this.scene.app }));
                if (parser && 'parse' in parser && typeof parser.parse === 'function') parsed = parser.parse(await response.arrayBuffer());
            } catch { /* reported below */ }
            if (!parsed || !Number.isSafeInteger(parsed.width) || !Number.isSafeInteger(parsed.height) || parsed.width < 1 || parsed.height < 1) {
                throw new Error('HDR 文件损坏或格式不受支持，原天空盒已保留。');
            }
        }
        const asset = new Asset('studio-skybox', 'texture', { url, filename }, { type: isHdr ? 'rgbe' : 'rgbp', mipmaps: false, addressu: 'repeat', addressv: 'clamp' });
        const loaded = new Promise<void>((resolve, reject) => {
            asset.once('load', resolve); asset.once('error', reject);
        });
        this.scene.app.assets.add(asset); this.scene.app.assets.load(asset);
        try {
            await loaded;
        } catch (error) {
            this.scene.app.assets.remove(asset); throw error;
        }
        if (generation !== this.skyGeneration) {
            asset.unload(); this.scene.app.assets.remove(asset); return;
        }
        this.sky?.unload(); if (this.sky) this.scene.app.assets.remove(this.sky);
        this.sky = asset; this.scene.forceRender = true;
    }
    private allocate() {
        this.bloom?.destroy(); this.compose?.destroy(); this.background?.destroy(); this.quad?.destroy();
        for (const target of [this.linear, this.output]) {
            target?.destroyTextureBuffers(); target?.destroy();
        }
        const device = this.scene.graphicsDevice;
        const { width, height } = this.scene.camera.targetSize;
        const make = (name: string, format: number) => new RenderTarget({ depth: false,
            colorBuffer: new Texture(device, {
                name,
                width,
                height,
                format,
                mipmaps: false,
                minFilter: FILTER_LINEAR,
                magFilter: FILTER_LINEAR,
                addressU: ADDRESS_CLAMP_TO_EDGE,
                addressV: ADDRESS_CLAMP_TO_EDGE
            }) });
        this.precision = this.settings().highPrecisionRendering;
        this.linear = make('Studio linear scene', this.precision ? PIXELFORMAT_RGBA16F : PIXELFORMAT_RGBA8);
        this.output = make('Studio final scene', PIXELFORMAT_RGBA8);
        this.quad = new ShaderQuad(device, vertexShader, backgroundShader, 'studio-background-linear');
        this.background = new SimpleRenderPass(device, this.quad, { vars: () => {
            const camera = this.scene.camera;
            this.inverse.mul2(camera.camera.projectionMatrix, camera.camera.viewMatrix).invert();
            const encoding = (this.sky?.resource as Texture)?.encoding;
            return { srcTexture: camera.mainTarget.colorBuffer,
                skyTexture: this.sky?.resource ?? camera.mainTarget.colorBuffer,
                hasSky: this.sky ? 1 : 0,
                hasGradient: this.settings().background.gradient ? 1 : 0,
                skyEncoding: encoding === 'rgbp' ? 1 : encoding === 'rgbe' ? 2 : encoding === 'linear' ? 3 : 0,
                backgroundColor: this.settings().background.color,
                outputSize: [this.output.width, this.output.height],
                inverseViewProjection: this.inverse.data,
                cameraPosition: [camera.position.x, camera.position.y, camera.position.z] };
        } });
        this.background.init(this.linear);
        this.bloom = new FramePassBloom(device, this.linear.colorBuffer, this.linear.colorBuffer.format);
        this.compose = new RenderPassCompose(device);
        this.compose.init(this.output); this.compose.sceneTexture = this.linear.colorBuffer;
    }
    private prepare() {
        const camera = this.scene.camera;
        if (!camera.mainTarget) return;
        if (!this.output || this.precision !== this.settings().highPrecisionRendering) this.allocate();
        const { width, height } = camera.targetSize;
        if (this.output.width !== width || this.output.height !== height) {
            this.linear.resize(width, height); this.output.resize(width, height);
        }
        // Tone mapping occurs only in the final composition, including skybox.
        camera.camera.toneMapping = TONEMAP_NONE;
        const settings = this.settings(), p = settings.postEffectSettings, compose = this.compose;
        const gradient = !this.sky && settings.background.gradient;
        const patch = gradient ? `${composeGradientGlsl(gradient)}
scene.a = 1.0;` : '';
        if (patch !== this.gradientPatch) {
            this.gradientPatch = patch;
            ShaderChunks.get(this.scene.graphicsDevice, 'glsl').set('composeMainEndPS', this.originalComposeEnd + patch);
        }
        compose.hdrScene = this.precision;
        compose.toneMapping = tones[settings.tonemapping];
        compose.sharpness = p.sharpness.enabled ? p.sharpness.amount : 0;
        this.bloom.blurLevel = Math.max(1, Math.round(p.bloom.blurLevel));
        compose.bloomTexture = p.bloom.enabled ? this.bloom.bloomTexture : null;
        compose.bloomIntensity = p.bloom.intensity;
        compose.gradingEnabled = p.grading.enabled;
        compose.gradingBrightness = p.grading.brightness; compose.gradingContrast = p.grading.contrast;
        compose.gradingSaturation = p.grading.saturation; compose.gradingTint = new Color(...p.grading.tint);
        compose.vignetteEnabled = p.vignette.enabled;
        compose.vignetteInner = p.vignette.inner; compose.vignetteOuter = p.vignette.outer;
        compose.vignetteCurvature = p.vignette.curvature; compose.vignetteIntensity = p.vignette.intensity;
        compose.fringingEnabled = p.fringing.enabled; compose.fringingIntensity = p.fringing.intensity;
        const hotspots = this.hotspotState();
        this.hotspots.prepare(settings.annotations, hotspots.hovered, hotspots.enabled, hotspots.cssHeight);
        camera.finalPass.vars = () => ({ srcTexture: this.output.colorBuffer });
        camera.camera.framePasses = [camera.clearPass, camera.mainPass, this.hotspots.base, camera.splatPass, this.hotspots.overlay, camera.gizmoPass,
            this.background, ...(p.bloom.enabled ? [this.bloom] : []), this.compose, camera.finalPass];
    }
}
