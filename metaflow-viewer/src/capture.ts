import {
    ADDRESS_CLAMP_TO_EDGE,
    ASPECT_AUTO,
    BlendState,
    drawQuadWithShader,
    FILTER_LINEAR,
    PIXELFORMAT_RGBA8,
    RenderTarget,
    SEMANTIC_POSITION,
    ShaderUtils,
    Texture
} from 'playcanvas';
import type { AppBase, CameraComponent, GraphicsDevice, Shader } from 'playcanvas';

type CaptureFrame = { update(): void };

type CaptureFrameOptions = {
    time?: number;
    width?: number;
    height?: number;
    supersample?: number;
};

type GrabOptions = CaptureFrameOptions & {
    scrub?: (time: number) => void;
};

type CaptureResult = { width: number; height: number; data: string };

const positiveInteger = (value: number | undefined, fallback: number) =>
    typeof value === 'number' && Number.isFinite(value) ? Math.max(1, Math.round(value)) : fallback;

const normalizeCaptureOptions = ({ time, width, height, supersample }: CaptureFrameOptions = {}) => {
    const outW = positiveInteger(width, 480);
    const outH = positiveInteger(height, outW);
    const sample = typeof supersample === 'number' && Number.isFinite(supersample) ? Math.round(supersample) : 2;

    return {
        time: typeof time === 'number' && Number.isFinite(time) ? time : undefined,
        width: outW,
        height: outH,
        supersample: Math.min(8, Math.max(1, sample))
    };
};

// Box-average downsample of a supersampled render. Each output texel averages the
// uRatio x uRatio block of source texels it covers. uFlipY compensates for the
// render-target/readback row-order difference.
const boxDownsampleGLSL = /* glsl */ `
varying vec2 vUv0;

uniform sampler2D source;
uniform vec2 uSrcSize;
uniform float uRatio;
uniform float uFlipY;

void main(void) {
    int r = int(uRatio);
    vec2 outSize = uSrcSize / uRatio;
    vec2 uv = vUv0;
    if (uFlipY > 0.5) {
        uv.y = 1.0 - uv.y;
    }
    vec2 base = floor(uv * outSize) * uRatio;
    vec4 sum = vec4(0.0);
    for (int y = 0; y < 8; y++) {
        if (y >= r) break;
        for (int x = 0; x < 8; x++) {
            if (x >= r) break;
            vec2 texel = base + vec2(float(x) + 0.5, float(y) + 0.5);
            sum += texture2D(source, texel / uSrcSize);
        }
    }
    gl_FragColor = sum / (uRatio * uRatio);
}
`;

const boxDownsampleWGSL = /* wgsl */ `
varying vUv0: vec2f;
var source: texture_2d<f32>;
var sourceSampler: sampler;
uniform uSrcSize: vec2f;
uniform uRatio: f32;
uniform uFlipY: f32;

@fragment
fn fragmentMain(input: FragmentInput) -> FragmentOutput {
    var output: FragmentOutput;
    let r: i32 = i32(uniform.uRatio);
    let outSize: vec2f = uniform.uSrcSize / uniform.uRatio;
    var uv: vec2f = input.vUv0;
    if (uniform.uFlipY > 0.5) {
        uv.y = 1.0 - uv.y;
    }
    let base: vec2f = floor(uv * outSize) * uniform.uRatio;
    var sum: vec4f = vec4f(0.0);
    for (var y: i32 = 0; y < 8; y = y + 1) {
        if (y >= r) { break; }
        for (var x: i32 = 0; x < 8; x = x + 1) {
            if (x >= r) { break; }
            let texel: vec2f = base + vec2f(f32(x) + 0.5, f32(y) + 0.5);
            sum = sum + textureSample(source, sourceSampler, texel / uniform.uSrcSize);
        }
    }
    output.color = sum / (uniform.uRatio * uniform.uRatio);
    return output;
}
`;

// Captures the fully composed Viewer frame into an app-owned target, performs
// supersample downsampling on the GPU, and reads back only the requested output.
class Capture {
    private app: AppBase;

    private device: GraphicsDevice;

    private camera: CameraComponent;

    private getCameraFrame: () => CaptureFrame | null;

    private shader: Shader;

    private srcRT: RenderTarget | null = null;

    private dstRT: RenderTarget | null = null;

    constructor(app: AppBase, camera: CameraComponent, getCameraFrame: () => CaptureFrame | null) {
        this.app = app;
        this.device = app.graphicsDevice;
        this.camera = camera;
        this.getCameraFrame = getCameraFrame;
        this.shader = ShaderUtils.createShader(this.device, {
            uniqueName: 'captureBoxDownsample',
            attributes: { vertex_position: SEMANTIC_POSITION },
            vertexChunk: 'fullscreenQuadVS',
            fragmentGLSL: boxDownsampleGLSL,
            fragmentWGSL: boxDownsampleWGSL
        });
    }

    private makeRT(name: string, width: number, height: number, depth: boolean) {
        // Mirror the backbuffer sRGB flag so post-effect and non-post-effect
        // captures receive the same bytes as the visible frame on both backends.
        const dev = this.device as { backBuffer?: { isColorBufferSrgb?: (i: number) => boolean } };
        const srgb = dev.backBuffer?.isColorBufferSrgb?.(0) ?? false;
        const colorBuffer = new Texture(this.device, {
            name,
            width,
            height,
            format: PIXELFORMAT_RGBA8,
            mipmaps: false,
            minFilter: FILTER_LINEAR,
            magFilter: FILTER_LINEAR,
            addressU: ADDRESS_CLAMP_TO_EDGE,
            addressV: ADDRESS_CLAMP_TO_EDGE
        });
        const rt = new RenderTarget({ name, colorBuffer, depth });
        (rt as { isColorBufferSrgb: (index: number) => boolean }).isColorBufferSrgb = () => srgb;
        return rt;
    }

    private ensure(target: 'srcRT' | 'dstRT', width: number, height: number, depth: boolean) {
        const existing = this[target];
        if (existing && existing.width === width && existing.height === height) {
            return existing;
        }
        existing?.colorBuffer.destroy();
        existing?.destroy();
        const rt = this.makeRT(target, width, height, depth);
        this[target] = rt;
        return rt;
    }

    // CameraFrame caches its compose target. Marking layersDirty and updating
    // forces it to follow the temporary capture target and, later, the screen.
    private setCameraTarget(renderTarget: RenderTarget | null) {
        this.camera.renderTarget = renderTarget;
        const cameraFrame = this.getCameraFrame();
        if (cameraFrame) {
            const rpc = (cameraFrame as { renderPassCamera?: { layersDirty: boolean } }).renderPassCamera;
            if (rpc) {
                rpc.layersDirty = true;
            }
            cameraFrame.update();
        }
    }

    async grab(options: GrabOptions = {}): Promise<CaptureResult> {
        const { time, width: outW, height: outH, supersample: ss } = normalizeCaptureOptions(options);
        const { scrub } = options;
        const srcW = outW * ss;
        const srcH = outH * ss;
        const srcRT = this.ensure('srcRT', srcW, srcH, true);

        const camera = this.camera;
        const saved = {
            renderTarget: camera.renderTarget,
            aspectRatioMode: camera.aspectRatioMode,
            aspectRatio: camera.aspectRatio,
            horizontalFov: camera.horizontalFov
        };

        try {
            camera.aspectRatioMode = ASPECT_AUTO;
            camera.horizontalFov = srcW >= srcH;
            this.setCameraTarget(srcRT);

            if (time !== undefined && scrub) {
                scrub(time);
            }
            this.app.renderNextFrame = true;
            await new Promise<void>((resolve) => {
                this.app.once('frameend', () => resolve());
            });

            const dstRT = this.ensure('dstRT', outW, outH, false);
            const { scope } = this.device;
            scope.resolve('source').setValue(srcRT.colorBuffer);
            scope.resolve('uSrcSize').setValue([srcW, srcH]);
            scope.resolve('uRatio').setValue(ss);
            scope.resolve('uFlipY').setValue(srcRT.flipY ? 0 : 1);
            this.device.setBlendState(BlendState.NOBLEND);
            drawQuadWithShader(this.device, dstRT, this.shader);

            const pixels = await dstRT.colorBuffer.read(0, 0, outW, outH, {
                renderTarget: dstRT,
                immediate: true
            });
            const u8 = pixels instanceof Uint8Array ? pixels : new Uint8Array(pixels.buffer);
            const chunks: string[] = [];
            const chunk = 0x8000;
            for (let i = 0; i < u8.length; i += chunk) {
                chunks.push(String.fromCharCode.apply(null, u8.subarray(i, i + chunk) as unknown as number[]));
            }
            return { width: outW, height: outH, data: btoa(chunks.join('')) };
        } finally {
            camera.aspectRatioMode = saved.aspectRatioMode;
            camera.aspectRatio = saved.aspectRatio;
            camera.horizontalFov = saved.horizontalFov;
            this.setCameraTarget(saved.renderTarget);
            this.app.renderNextFrame = true;
        }
    }
}

export { Capture, normalizeCaptureOptions };
export type { CaptureFrameOptions, CaptureResult };
