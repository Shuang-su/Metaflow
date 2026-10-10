import {
    BoundingBox,
    CameraFrame,
    Color,
    RenderTarget,
    Mat4,
    MiniStats,
    ShaderChunks,
    PIXELFORMAT_RGBA16F,
    PIXELFORMAT_RGBA32F,
    TONEMAP_NONE,
    TONEMAP_LINEAR,
    TONEMAP_FILMIC,
    TONEMAP_HEJL,
    TONEMAP_ACES,
    TONEMAP_ACES2,
    TONEMAP_NEUTRAL,
    Vec3,
    GSPLAT_DEBUG_LOD,
    GSPLAT_DEBUG_NONE,
    GSPLAT_LODMODE_DISTANCE,
    GSPLAT_RENDERER_RASTER_CPU_SORT,
    GSPLAT_RENDERER_RASTER_GPU_SORT,
    platform
} from 'playcanvas';
import type { CameraComponent, Entity, GraphicsDevice, GSplatComponent, Layer } from 'playcanvas';

import { CameraManager, isWalkAllowed } from './camera-manager';
import type { Camera } from './cameras/camera';
import { Capture } from './capture';
import type { CaptureResult } from './capture';
import type { Collision } from './collision';
import { MeshCollision, TiledVoxelCollision, VoxelCollision } from './collision';
import { nearlyEquals } from './core/math';
import type { DebugPanel } from './debug';
import { captureCameraState, restoreCameraState } from './debug/camera-state';
import { handoffIdentity, saveDirectorPosition } from './director-handoff';
import type { DirectorPosition } from './director-handoff';
import { initFullscreen } from './fullscreen';
import { GsplatRevealRadial } from './gsplat-reveal-radial';
import type { RevealDotProfile } from './gsplat-reveal-radial';
import { InputController } from './input-controller';
import { MeshDebugOverlay } from './mesh-debug-overlay';
import { NavCursor } from './nav-cursor';
import { Picker } from './picker';
import type { ExperienceSettings, PostEffectSettings } from './settings';
import type { LoadMode, CaptureOptions, Config, Global, XrMode } from './types';
import { TiledVoxelDebugOverlay, VoxelDebugOverlay } from './voxel-debug-overlay';
import { initXr } from './xr';

function resolveRevealDotProfile(config: Config, loadingMode: LoadMode): RevealDotProfile {
    if (loadingMode === 'legacy-sog' && config.experienceType === 'character') {
        return 'characterSog';
    }
    if (config.voxelManifestUrl) {
        return 'megaVoxel';
    }
    return 'streamingScene';
}
// String.replace wrapper that warns when the source substring is missing, so
// shader chunk patches against the engine fail loudly instead of silently
// producing the original chunk.
const patchChunk = (source: string, search: string, replacement: string, name: string): string => {
    if (!source.includes(search)) {
        console.warn(
            `patchChunk: substring not found in '${name}', shader chunk patch may be out of sync with the engine.`
        );
    }
    return source.replace(search, replacement);
};

const gammaChunkGlsl = `
vec3 prepareOutputFromGamma(vec3 gammaColor, float depth) {
    return gammaColor;
}
`;

const gammaChunkWgsl = `
fn prepareOutputFromGamma(gammaColor: vec3f, depth: f32) -> vec3f {
    return gammaColor;
}
`;

const rendererTable: Record<Config['renderer'], number> = {
    webgl: GSPLAT_RENDERER_RASTER_CPU_SORT,
    webgpu: GSPLAT_RENDERER_RASTER_GPU_SORT
};

type GSplatOctreeResourceLike = {
    octree?: {
        lodLevels: number;
    } | null;
};

const tonemapTable: Record<string, number> = {
    none: TONEMAP_NONE,
    linear: TONEMAP_LINEAR,
    filmic: TONEMAP_FILMIC,
    hejl: TONEMAP_HEJL,
    aces: TONEMAP_ACES,
    aces2: TONEMAP_ACES2,
    neutral: TONEMAP_NEUTRAL
};

const applyPostEffectSettings = (cameraFrame: CameraFrame, settings: PostEffectSettings) => {
    if (settings.sharpness.enabled) {
        cameraFrame.rendering.sharpness = settings.sharpness.amount;
    } else {
        cameraFrame.rendering.sharpness = 0;
    }

    const { bloom } = cameraFrame;
    if (settings.bloom.enabled) {
        bloom.intensity = settings.bloom.intensity;
        bloom.blurLevel = settings.bloom.blurLevel;
    } else {
        bloom.intensity = 0;
    }

    const { grading } = cameraFrame;
    if (settings.grading.enabled) {
        grading.enabled = true;
        grading.brightness = settings.grading.brightness;
        grading.contrast = settings.grading.contrast;
        grading.saturation = settings.grading.saturation;
        grading.tint = new Color().fromArray(settings.grading.tint);
    } else {
        grading.enabled = false;
    }

    const { vignette } = cameraFrame;
    if (settings.vignette.enabled) {
        vignette.intensity = settings.vignette.intensity;
        vignette.inner = settings.vignette.inner;
        vignette.outer = settings.vignette.outer;
        vignette.curvature = settings.vignette.curvature;
    } else {
        vignette.intensity = 0;
    }

    const { fringing } = cameraFrame;
    if (settings.fringing.enabled) {
        fringing.intensity = settings.fringing.intensity;
    } else {
        fringing.intensity = 0;
    }
};

const anyPostEffectEnabled = (settings: PostEffectSettings): boolean => {
    return (
        (settings.sharpness.enabled && settings.sharpness.amount > 0) ||
        (settings.bloom.enabled && settings.bloom.intensity > 0) ||
        settings.grading.enabled ||
        (settings.vignette.enabled && settings.vignette.intensity > 0) ||
        (settings.fringing.enabled && settings.fringing.intensity > 0)
    );
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const toCssColor = (color: [number, number, number]) =>
    `rgb(${color.map((v) => Math.round(clamp01(v) * 255)).join(' ')})`;
const toShaderFloat = (value: number) => clamp01(value).toFixed(8);
const toShaderVec3 = (color: [number, number, number]) => {
    // Compose runs before gamma output. Convert CSS/sRGB colors to linear so
    // the displayed gradient matches the Metaflow CSS background semantics.
    const channels = color.map((v) => Math.pow(clamp01(v), 2.2).toFixed(8));
    return `vec3(${channels.join(', ')})`;
};
const toShaderVec3Wgsl = (color: [number, number, number]) => {
    const channels = color.map((v) => Math.pow(clamp01(v), 2.2).toFixed(8));
    return `vec3f(${channels.join(', ')})`;
};
const backgroundColor = new Color();
const gradientCss = (gradient: NonNullable<ExperienceSettings['background']['gradient']>) => {
    const horizonStop = `${Math.round(clamp01(gradient.horizonStop ?? 0.55) * 100)}%`;
    const bottomStop = `${Math.round(clamp01(gradient.bottomStop ?? 1) * 100)}%`;
    const stops = [
        `${toCssColor(gradient.topColor)} 0%`,
        `${toCssColor(gradient.horizonColor ?? gradient.bottomColor)} ${horizonStop}`,
        `${toCssColor(gradient.bottomColor)} ${bottomStop}`
    ];
    return `linear-gradient(180deg, ${stops.join(', ')})`;
};

const composeGradientGlsl = (gradient: NonNullable<ExperienceSettings['background']['gradient']>) => {
    const horizonStop = toShaderFloat(gradient.horizonStop ?? 0.55);
    const bottomStop = toShaderFloat(gradient.bottomStop ?? 1);
    const horizonColor = gradient.horizonColor ?? gradient.bottomColor;

    return /* glsl */ `
        // Metaflow scene gradients live behind a transparent splat render.
        // CameraFrame composes through an offscreen texture, so we recreate the
        // CSS gradient here instead of letting transparent pixels become black.
        float metaflowGradientY = clamp(1.0 - uv.y, 0.0, 1.0);
        float metaflowGradientTopToHorizon = max(${horizonStop}, 0.00001);
        float metaflowGradientHorizonToBottom = max(${bottomStop} - ${horizonStop}, 0.00001);
        vec3 metaflowGradientTop = ${toShaderVec3(gradient.topColor)};
        vec3 metaflowGradientHorizon = ${toShaderVec3(horizonColor)};
        vec3 metaflowGradientBottom = ${toShaderVec3(gradient.bottomColor)};
        vec3 metaflowGradientFirst = mix(metaflowGradientTop, metaflowGradientHorizon, clamp(metaflowGradientY / metaflowGradientTopToHorizon, 0.0, 1.0));
        vec3 metaflowGradientSecond = mix(metaflowGradientHorizon, metaflowGradientBottom, clamp((metaflowGradientY - ${horizonStop}) / metaflowGradientHorizonToBottom, 0.0, 1.0));
        vec3 metaflowGradient = mix(metaflowGradientFirst, metaflowGradientSecond, step(${horizonStop}, metaflowGradientY));
        result = mix(metaflowGradient, result, scene.a);
    `;
};

const composeGradientWgsl = (gradient: NonNullable<ExperienceSettings['background']['gradient']>) => {
    const horizonStop = toShaderFloat(gradient.horizonStop ?? 0.55);
    const bottomStop = toShaderFloat(gradient.bottomStop ?? 1);
    const horizonColor = gradient.horizonColor ?? gradient.bottomColor;

    return /* wgsl */ `
        // Metaflow scene gradients live behind a transparent splat render.
        // CameraFrame composes through an offscreen texture, so we recreate the
        // CSS gradient here instead of letting transparent pixels become black.
        // WebGPU scene textures use top-left UVs; the engine already handles target flipping.
        let metaflowGradientY = clamp(uv.y, 0.0, 1.0);
        let metaflowGradientTopToHorizon = max(${horizonStop}, 0.00001);
        let metaflowGradientHorizonToBottom = max(${bottomStop} - ${horizonStop}, 0.00001);
        let metaflowGradientTop = ${toShaderVec3Wgsl(gradient.topColor)};
        let metaflowGradientHorizon = ${toShaderVec3Wgsl(horizonColor)};
        let metaflowGradientBottom = ${toShaderVec3Wgsl(gradient.bottomColor)};
        let metaflowGradientFirst = mix(metaflowGradientTop, metaflowGradientHorizon, clamp(metaflowGradientY / metaflowGradientTopToHorizon, 0.0, 1.0));
        let metaflowGradientSecond = mix(metaflowGradientHorizon, metaflowGradientBottom, clamp((metaflowGradientY - ${horizonStop}) / metaflowGradientHorizonToBottom, 0.0, 1.0));
        let metaflowGradient = mix(metaflowGradientFirst, metaflowGradientSecond, step(${horizonStop}, metaflowGradientY));
        result = mix(metaflowGradient, result, scene.a);
    `;
};

const vec = new Vec3();
const focusPoint = new Vec3();

const round6 = (value: number) => Math.round(value * 1000000) / 1000000;

// When post effects are on, the final compose blit must not convert linear to gamma, which
// the engine decides from `isColorBufferSrgb` on the target. The backbuffer is not ours to
// flag, so the prototype is patched — keyed by device rather than closed over one, so several
// viewers on a page (with and without post effects) each get the right answer. Restored when
// no device needs it.
const origIsColorBufferSrgb = RenderTarget.prototype.isColorBufferSrgb;
const srgbBackBufferDevices = new Set<GraphicsDevice>();

const patchedIsColorBufferSrgb = function (this: RenderTarget, index: number) {
    return srgbBackBufferDevices.has(this.device) && this === this.device.backBuffer
        ? true
        : origIsColorBufferSrgb.call(this, index);
};

const setBackBufferSrgb = (device: GraphicsDevice, enabled: boolean) => {
    if (enabled) {
        srgbBackBufferDevices.add(device);
    } else {
        srgbBackBufferDevices.delete(device);
    }
    RenderTarget.prototype.isColorBufferSrgb = srgbBackBufferDevices.size
        ? patchedIsColorBufferSrgb
        : origIsColorBufferSrgb;
};

class Viewer {
    global: Global;

    cameraFrame: CameraFrame;

    inputController: InputController;

    cameraManager: CameraManager;

    picker: Picker;

    voxelOverlay: VoxelDebugOverlay | TiledVoxelDebugOverlay | null = null;

    tiledVoxelCollision: TiledVoxelCollision | null = null;

    meshOverlay: MeshDebugOverlay | null = null;

    gsplatReveal: GsplatRevealRadial | null = null;

    navCursor: NavCursor | null = null;

    debugPanel: DebugPanel | null = null;

    sceneBackgroundCss: string | null = null;

    sceneBackgroundGradient: NonNullable<ExperienceSettings['background']['gradient']> | null = null;

    sceneBackgroundRevealed = false;
    /** Set once {@link destroy} has run. Load continuations check it and bail. */
    destroyed = false;

    private disposers: (() => void)[] = [];

    private fullscreen: ReturnType<typeof initFullscreen>;

    private xr: ReturnType<typeof initXr>;

    private capture: Capture | null = null;

    // captures are serialised: they share the viewer camera, so concurrent ones would
    // interleave the redirect/restore and could leave it mis-targeted
    private captureQueue: Promise<unknown> = Promise.resolve();

    // Resolves once the first complete frame has rendered, and rejects if the viewer is
    // destroyed before that — the frame event it waits on is gone by then, so a capture
    // waiting here would never settle. One shared promise, so its waiters are released when it
    // settles either way.
    private ready: Promise<void>;

    private failReady!: (reason: Error) => void;

    // Abort signals for frame waits and captures in flight. A capture's later waits are inside the engine,
    // so they are raced against one of these rather than handled individually — and each is
    // removed as its capture settles, since a signal that outlived it would keep the race, and
    // with it the captured image, reachable until the viewer went away.
    private abortHandlers = new Set<(reason: Error) => void>();

    origChunks: {
        glsl: {
            gsplatOutputVS: string;
            skyboxPS: string;
            composePS: string;
            composeMainEndPS: string;
        };
        wgsl: {
            gsplatOutputVS: string;
            skyboxPS: string;
            composePS: string;
            composeMainEndPS: string;
        };
    };

    applyBackground(settings: ExperienceSettings) {
        const { app, camera } = this.global;
        const { background } = settings;
        this.sceneBackgroundCss = background.gradient ? gradientCss(background.gradient) : toCssColor(background.color);
        this.sceneBackgroundGradient = background.gradient ?? null;

        if (background.gradient) {
            // Metaflow gradients are composited behind transparent splats. Keep
            // the clear color transparent black so splat edges do not pre-blend
            // with a bright sky and produce white fringes.
            backgroundColor.set(0, 0, 0, 0);
        } else {
            backgroundColor.set(background.color[0], background.color[1], background.color[2], 1);
        }

        camera.camera.clearColor = backgroundColor;
        app.renderNextFrame = true;

        if (this.global.state.loaded) {
            this.revealSceneBackground();
        }
    }

    revealSceneBackground() {
        if (!this.sceneBackgroundCss) {
            return;
        }

        const rootStyle = this.global.root.style;
        rootStyle.setProperty('--app-background', this.sceneBackgroundCss);
        rootStyle.setProperty('--canvas-background', this.sceneBackgroundCss);
        this.sceneBackgroundRevealed = true;
        this.updateComposeBackgroundPatch();
        this.global.app.renderNextFrame = true;
    }

    updateComposeBackgroundPatch() {
        const { app } = this.global;
        const glsl = ShaderChunks.get(app.graphicsDevice, 'glsl');
        const wgsl = ShaderChunks.get(app.graphicsDevice, 'wgsl');
        const gradient = this.sceneBackgroundRevealed ? this.sceneBackgroundGradient : null;
        const glslComposePS = this.origChunks.glsl.composePS || glsl.get('composePS');
        const wgslComposePS = this.origChunks.wgsl.composePS || wgsl.get('composePS');
        const glslComposeMainEndPS = this.origChunks.glsl.composeMainEndPS || glsl.get('composeMainEndPS') || '';
        const wgslComposeMainEndPS = this.origChunks.wgsl.composeMainEndPS || wgsl.get('composeMainEndPS') || '';

        this.origChunks.glsl.composePS = glslComposePS;
        this.origChunks.wgsl.composePS = wgslComposePS;
        this.origChunks.glsl.composeMainEndPS = glslComposeMainEndPS;
        this.origChunks.wgsl.composeMainEndPS = wgslComposeMainEndPS;

        if (!glslComposePS || !wgslComposePS) {
            return;
        }

        if (this.cameraFrame && gradient) {
            glsl.set('composeMainEndPS', `${glslComposeMainEndPS}\n${composeGradientGlsl(gradient)}`);
            wgsl.set('composeMainEndPS', `${wgslComposeMainEndPS}\n${composeGradientWgsl(gradient)}`);
            glsl.set(
                'composePS',
                patchChunk(
                    glslComposePS,
                    'gl_FragColor = vec4(result, scene.a);',
                    'gl_FragColor = vec4(result, 1.0);',
                    'glsl composePS Metaflow gradient alpha'
                )
            );
            wgsl.set(
                'composePS',
                patchChunk(
                    wgslComposePS,
                    'output.color = vec4f(result, scene.a);',
                    'output.color = vec4f(result, 1.0);',
                    'wgsl composePS Metaflow gradient alpha'
                )
            );
            return;
        }

        glsl.set('composeMainEndPS', glslComposeMainEndPS);
        wgsl.set('composeMainEndPS', wgslComposeMainEndPS);
        glsl.set('composePS', glslComposePS);
        wgsl.set('composePS', wgslComposePS);
    }

    constructor(
        global: Global,
        gsplatLoad: Promise<Entity>,
        environmentLoad: Promise<Entity | null> | null,
        skyboxLoad: Promise<void> | undefined,
        collisionLoad: Promise<Collision | null> | undefined,
        deferredCollisionLoad?: () => Promise<Collision | null>
    ) {
        this.global = global;

        const { app, settings, config, events, state, camera, renderer } = global;
        const { graphicsDevice } = app;

        this.fullscreen = initFullscreen(global);
        this.xr = initXr(global);

        this.ready = new Promise((resolve, reject) => {
            events.once('firstFrame', () => resolve());
            this.failReady = reject;
        });
        // destroying a viewer that never captured anything must not report an unhandled rejection
        this.ready.catch(() => {
            // intentionally ignored
        });

        // render skybox as plain equirect
        const glsl = ShaderChunks.get(graphicsDevice, 'glsl');
        glsl.set('skyboxPS', patchChunk(glsl.get('skyboxPS'), 'mapRoughnessUv(uv, mipLevel)', 'uv', 'glsl skyboxPS'));

        const wgsl = ShaderChunks.get(graphicsDevice, 'wgsl');
        wgsl.set(
            'skyboxPS',
            patchChunk(wgsl.get('skyboxPS'), 'mapRoughnessUv(uv, uniform.mipLevel)', 'uv', 'wgsl skyboxPS')
        );

        this.origChunks = {
            glsl: {
                gsplatOutputVS: glsl.get('gsplatOutputVS'),
                skyboxPS: glsl.get('skyboxPS'),
                composePS: glsl.get('composePS'),
                composeMainEndPS: glsl.get('composeMainEndPS')
            },
            wgsl: {
                gsplatOutputVS: wgsl.get('gsplatOutputVS'),
                skyboxPS: wgsl.get('skyboxPS'),
                composePS: wgsl.get('composePS'),
                composeMainEndPS: wgsl.get('composeMainEndPS')
            }
        };

        // Streaming progress and readiness are advanced from rendered frames.
        // Render continuously while either loading path prepares its first valid
        // frame, then switch to frame:request + camera-driven on-demand rendering.
        // The canvas remains hidden by the loading contract until firstFrame.
        app.autoRender = true;

        // configure the camera
        this.configureCamera(settings);

        // reconfigure camera when entering/exiting XR
        const configureXrCamera = () => {
            if (!this.destroyed) this.configureCamera(settings);
        };
        const xrStart = app.xr.on('start', configureXrCamera);
        const xrEnd = app.xr.on('end', configureXrCamera);
        this.onDestroy(() => {
            xrStart.off();
            xrEnd.off();
        });

        // construct debug ministats
        if (config.ministats) {
            const options = MiniStats.getDefaultOptions() as any;
            options.cpu.enabled = false;
            options.stats = options.stats.filter((s: any) => s.name !== 'DrawCalls');
            options.stats.push(
                {
                    name: 'VRAM',
                    stats: ['vram.tex'],
                    decimalPlaces: 1,
                    multiplier: 1 / (1024 * 1024),
                    unitsName: 'MB',
                    watermark: 1024
                },
                {
                    name: 'Splats',
                    stats: ['frame.gsplats'],
                    decimalPlaces: 3,
                    multiplier: 1 / 1000000,
                    unitsName: 'M',
                    watermark: 5
                }
            );

            new MiniStats(app, options);
        }

        const prevProj = new Mat4();
        const prevWorld = new Mat4();
        const sceneBound = new BoundingBox();

        // track the camera state and trigger a render when it changes
        app.on('framerender', () => {
            const world = camera.getWorldTransform();
            const proj = camera.camera.projectionMatrix;

            if (!app.renderNextFrame) {
                if (
                    config.ministats ||
                    !nearlyEquals(world.data, prevWorld.data) ||
                    !nearlyEquals(proj.data, prevProj.data)
                ) {
                    app.renderNextFrame = true;
                }
            }

            // suppress rendering till we're ready, but let XR manage its own frame loop
            if (!state.readyToRender && !app.xr.active) {
                app.renderNextFrame = false;
            }

            if (app.renderNextFrame) {
                prevWorld.copy(world);
                prevProj.copy(proj);
            }
        });

        const applyCamera = (camera: Camera) => {
            const cameraEntity = global.camera;

            cameraEntity.setPosition(camera.position);
            cameraEntity.setEulerAngles(camera.angles);
            cameraEntity.camera.fov = camera.fov;

            cameraEntity.camera.horizontalFov = graphicsDevice.width > graphicsDevice.height;

            // fit clipping planes to bounding box
            const boundRadius = sceneBound.halfExtents.length();

            // calculate the forward distance between the camera to the bound center
            vec.sub2(sceneBound.center, camera.position);
            const dist = vec.dot(cameraEntity.forward);

            const far = Math.max(dist + boundRadius, 1e-2);
            const near = Math.max(dist - boundRadius, far / (1024 * 16));

            cameraEntity.camera.farClip = far;
            cameraEntity.camera.nearClip = Math.min(1.0, near);
        };

        // handle application update
        app.on('update', (deltaTime) => {
            // in xr mode we leave the camera alone
            if (app.xr.active) {
                return;
            }

            if (this.inputController && this.cameraManager) {
                // update inputs
                this.inputController.update(deltaTime, this.cameraManager.camera.distance);

                // update cameras
                this.cameraManager.update(deltaTime, this.inputController.frame);

                // apply to the camera entity
                applyCamera(this.cameraManager.camera);

                if (this.tiledVoxelCollision) {
                    const p = camera.getPosition();
                    this.tiledVoxelCollision.updateForQueryPosition(-p.x, p.z);
                }
            }
        });

        // Render voxel debug overlay
        app.on('prerender', () => {
            this.voxelOverlay?.update();
        });

        let revealPlaybackQueued = false;
        const beginRevealWhenSceneVisible = () => {
            if (revealPlaybackQueued || config.revealEffect === 'none') {
                return;
            }
            revealPlaybackQueued = true;

            // uRevealActive hides splats until playback; one rAF after loading UI hides is enough.
            window.requestAnimationFrame(() => {
                this.gsplatReveal?.beginVisiblePlayback();
            });
        };

        // Remember only a camera that reached a displayed frame, never an animation destination.
        if (config.exposeGlobals && config.analyticsResource?.category?.includes('acg')) {
            const refs = config.analyticsResourceUrls;
            if (refs?.content && refs.settings && /\.(sog|ply)$/i.test(refs.content)) {
                const file = (url: string) => decodeURIComponent(new URL(url, location.href).pathname);
                const identity = handoffIdentity({
                    id: config.analyticsResource.id!,
                    files: {
                        model: file(refs.content),
                        environment: refs.environment ? file(refs.environment) : undefined,
                        settings: file(refs.settings)
                    }
                });
                let displayed: DirectorPosition | null = null;
                let saved = '',
                    lastWrite = 0;
                const flush = () => {
                    if (!displayed || JSON.stringify(displayed) === saved) return;
                    try {
                        if (saveDirectorPosition(sessionStorage, identity, displayed)) {
                            saved = JSON.stringify(displayed);
                            lastWrite = performance.now();
                        }
                    } catch {
                        /* Storage may be unavailable in private or restricted contexts. */
                    }
                };
                const onRendered = () => {
                    if (!state.loaded || !this.cameraManager || this.destroyed) return;
                    const current = this.cameraManager.camera;
                    const target = new Vec3();
                    current.calcFocusPoint(target);
                    displayed = {
                        position: [current.position.x, current.position.y, current.position.z],
                        target: [target.x, target.y, target.z]
                    };
                    if (performance.now() - lastWrite >= 250) flush();
                };
                app.on('postrender', onRendered);
                events.once('firstFrame', () => queueMicrotask(onRendered));
                window.addEventListener('pagehide', flush);
                document.addEventListener('visibilitychange', flush);
                this.disposers.push(() => {
                    flush();
                    app.off('postrender', onRendered);
                    window.removeEventListener('pagehide', flush);
                    document.removeEventListener('visibilitychange', flush);
                });
            }
        }

        // update state on first frame
        events.on('firstFrame', () => {
            state.loaded = true;
            this.revealSceneBackground();
            beginRevealWhenSceneVisible();
            state.animationPaused = !!config.noanim;
            state.loadingStage = 'complete';
            state.progress = 100;
            state.loadingStatus = '加载完成';

            const getCameraPose = () => {
                if (!this.cameraManager) {
                    return null;
                }

                const activeCamera = this.cameraManager.camera;
                activeCamera.calcFocusPoint(focusPoint);

                return {
                    mode: state.cameraMode,
                    position: [
                        round6(activeCamera.position.x),
                        round6(activeCamera.position.y),
                        round6(activeCamera.position.z)
                    ] as [number, number, number],
                    target: [round6(focusPoint.x), round6(focusPoint.y), round6(focusPoint.z)] as [
                        number,
                        number,
                        number
                    ],
                    angles: [
                        round6(activeCamera.angles.x),
                        round6(activeCamera.angles.y),
                        round6(activeCamera.angles.z)
                    ] as [number, number, number],
                    distance: round6(activeCamera.distance),
                    fov: round6(activeCamera.fov)
                };
            };

            // the window.* hooks below are the standalone document's api for the thumbnail
            // pipeline and console debugging; an embedded instance keeps them off, since two
            // viewers would overwrite each other's
            if (!config.exposeGlobals) return;

            window.scrubTo = async (time: number) => {
                if (state.hasAnimation) this.seek(time);
                app.renderNextFrame = true;
                state.animationPaused = true;
                let onFrame!: () => void;
                const rendered = new Promise<void>((resolve) => {
                    onFrame = resolve;
                    app.once('frameend', onFrame);
                });
                try {
                    await this.untilDestroyed(rendered);
                } finally {
                    app.off('frameend', onFrame);
                }
            };

            window.getCameraPose = getCameraPose;
            window.logCameraPose = () => {
                const pose = getCameraPose();
                console.log(pose);
                return pose;
            };
            window.animationDuration = state.animationDuration;
            window.app = app;

            // capture hook for the thumbnail pipeline
            window.captureFrame = (options) => this.captureFrame(options);
        });

        const { gsplat } = app.scene;

        // Scene-level gsplat params. Set before any load resolves: streaming starts on the first
        // frame after the gsplat component is created, and lodUpdateAngle / lodBehindPenalty shape
        // which nodes that first pass pulls in.

        // these two allow LOD behind camera to drop, saves lots of splats
        gsplat.lodUpdateAngle = 90;
        gsplat.lodBehindPenalty = 5;
        gsplat.lodMode = GSPLAT_LODMODE_DISTANCE;
        gsplat.minContribution = 1;
        gsplat.alphaClip = 1 / 255;
        gsplat.antiAlias = config.aa;

        // same performance, but rotating on slow devices does not give us unsorted splats on sides
        gsplat.radialSorting = true;

        // apply before streaming starts: this bakes into the work-buffer copies as
        // persistent per-splat data, so the first loaded splats must already carry
        // it (later changes only apply on a full rebuild)
        gsplat.debug = config.colorize ? GSPLAT_DEBUG_LOD : GSPLAT_DEBUG_NONE;

        // Clamp to the coarsest LOD for the fastest possible reveal. This chains off gsplatLoad
        // alone (not the Promise.all below): the octree starts streaming on the first frame after
        // the component is created, and already-requested files are never cancelled — so waiting
        // on skybox/collision here would let a full-detail burst queue up and block the reveal
        // until it has all downloaded. The handler runs as a microtask of the asset's load event,
        // so no frame renders unclamped.
        // Both chains below are started and never awaited, so each needs a rejection handler or
        // a failed load is reported as unhandled. Nothing is logged here: `loadGsplat` already
        // logs its own asset errors, the skybox and collision loads resolve to null on failure,
        // and a destroy mid-load rejects deliberately.
        const ignoreLoadFailure = (error: unknown) => {
            this.failReady(error instanceof Error ? error : new Error(String(error)));
        };

        if (!config.fullload) {
            gsplatLoad.then((entity) => {
                if (this.destroyed) return;
                const gsplatComponent = entity.gsplat as GSplatComponent;
                const resource = gsplatComponent.resource as GSplatOctreeResourceLike | null;
                const lodLevels = resource?.octree?.lodLevels;
                if (lodLevels) {
                    gsplatComponent.lodRangeMax = gsplatComponent.lodRangeMin = lodLevels - 1;
                }
            }, ignoreLoadFailure);
        }

        // Loading progress has to start reporting as soon as the splat data starts streaming,
        // which is well before the reveal. The reveal is wired up in the `Promise.all` below, so
        // it also waits on the skybox and the collision data — and a collision download can take
        // far longer than the splats themselves (ten seconds against under six, on a 4G trace of
        // a real scene), leaving the bar frozen at 0% for the whole wait. Chaining off
        // `gsplatLoad` alone lets the bar track the one load it can measure, from the moment
        // that load begins. The reveal below stops it and puts the bar at 100.
        let stopProgress: (() => void) | undefined;
        gsplatLoad.then(() => {
            if (this.destroyed) return;

            const eventHandler = app.systems.gsplat;

            // `loading` counts the node files the streamer has requested and not yet made
            // resident. Before the reveal the LOD range is clamped to the coarsest level, so this
            // is a single wave and completed / (completed + in-flight) tracks it directly. A drop
            // in the count is work that finished, or was cancelled, which this cannot tell apart
            // and counts as done. Clamped monotone and capped below 100 so only the reveal fills
            // the bar. See docs/streaming-progress.md for the engine signal that would replace it.
            let prevLoading = 0;
            let completed = 0;
            const progressHandler = (camera: CameraComponent, layer: Layer, ready: boolean, loading: number) => {
                completed += Math.max(0, prevLoading - loading);
                prevLoading = loading;

                const total = completed + loading;
                if (total > 0) {
                    state.progress = Math.max(state.progress, Math.min(99, Math.trunc((completed / total) * 100)));
                }
            };

            eventHandler.on('frame:ready', progressHandler);
            stopProgress = () => eventHandler.off('frame:ready', progressHandler);
            this.onDestroy(stopProgress);
        }, ignoreLoadFailure);

        // Collision data is not needed to draw the scene, and it can be larger than the splats
        // themselves: 5.65 MB against 4.28 MB for the coarsest LOD level on a traced scene. So
        // it is kept out of the reveal path below, which would otherwise sit on a blank poster
        // with everything needed to render already in memory. `attachCollision` wires it up
        // whenever it lands; the two chains can resolve in either order, so whichever is second
        // performs the attach.
        //
        // Nothing in the opening view depends on it. The scene always starts in `anim` mode, so
        // no collision-dependent controller is entered until the user takes over. Until it
        // attaches, `walkAllowed` stays false so walk mode cannot be entered without the data it
        // needs to place the camera, fly mode has no collision response, and nav targeting falls
        // back to splat depth instead of collision ray hits.
        let collisionReady: Collision | null = null;
        let attachCollision: ((collision: Collision) => void) | undefined;

        collisionLoad?.then((collision) => {
            if (this.destroyed || !collision) return;
            collisionReady = collision;
            attachCollision?.(collision);
        }, ignoreLoadFailure);

        // wait for the model to load
        Promise.all([gsplatLoad, skyboxLoad]).then((results) => {
            // destroyed while loading: the app is gone, so there is nothing to wire up
            if (this.destroyed) return;

            const gsplatEntity = results[0];
            const gsplatComponent = gsplatEntity.gsplat as GSplatComponent;
            let environmentEntity: Entity | null = null;
            let collision = collisionReady;

            // get scene bounding box
            const gsplatBbox = gsplatComponent.customAabb;
            if (gsplatBbox) {
                sceneBound.setFromTransformedAabb(gsplatBbox, gsplatEntity.getWorldTransform());
            }

            this.picker = new Picker(app, camera);
            this.inputController = new InputController(global, this.picker);
            this.cameraManager = new CameraManager(global, sceneBound, collision);
            applyCamera(this.cameraManager.camera);

            if (!config.noui) {
                this.navCursor = new NavCursor(app, camera, collision, events, state, config.reticle);
            }

            const setOverlayLoadingStatus = (status: string) => {
                if (!state.loaded) {
                    state.loadingStage = 'overlay';
                    state.loadingStatus = status;
                }
            };

            const createCollisionOverlay = (nextCollision: Collision) => {
                // Voxel overlays use compute shaders and therefore remain
                // WebGPU-only; mesh collision uses standard line rendering.
                if (config.heatmap && renderer === 'webgl') {
                    console.warn('[Heatmap] WebGPU is required; continuing without the voxel heatmap overlay.');
                }
                if (nextCollision instanceof VoxelCollision && renderer !== 'webgl') {
                    setOverlayLoadingStatus('正在准备体素调试叠层...');
                    const overlay = new VoxelDebugOverlay(app, nextCollision, camera);
                    overlay.mode = config.heatmap ? 'heatmap' : 'overlay';
                    this.voxelOverlay = overlay;
                    state.hasCollisionOverlay = true;
                    events.on('collisionOverlayEnabled:changed', (value: boolean) => {
                        overlay.enabled = value;
                        app.renderNextFrame = true;
                    });
                } else if (nextCollision instanceof TiledVoxelCollision && renderer !== 'webgl') {
                    setOverlayLoadingStatus('正在准备 tiled voxel 调试叠层...');
                    const overlay = new TiledVoxelDebugOverlay(app, nextCollision, camera);
                    overlay.mode = config.heatmap ? 'heatmap' : 'overlay';
                    this.voxelOverlay = overlay;
                    state.hasCollisionOverlay = true;
                    events.on('collisionOverlayEnabled:changed', (value: boolean) => {
                        overlay.enabled = value;
                        app.renderNextFrame = true;
                    });
                } else if (nextCollision instanceof MeshCollision) {
                    setOverlayLoadingStatus('正在准备网格碰撞叠层...');
                    const overlay = new MeshDebugOverlay(app, nextCollision, camera, !!this.cameraFrame);
                    this.meshOverlay = overlay;
                    state.hasCollisionOverlay = true;
                    events.on('collisionOverlayEnabled:changed', (value: boolean) => {
                        overlay.enabled = value;
                        app.renderNextFrame = true;
                    });
                }
            };

            const updateWalkReadiness = () => {
                let ready = isWalkAllowed(sceneBound, collision);
                if (collision instanceof TiledVoxelCollision) {
                    // Walk waits for the foot tile, not the full 3x3 neighborhood.
                    // Adjacent tiles continue loading in the background.
                    const p = camera.getPosition();
                    collision.updateForQueryPosition(-p.x, p.z);
                    ready = ready && collision.isCurrentTileLoaded();
                }
                state.walkAllowed = ready;
            };

            attachCollision = (nextCollision: Collision | null) => {
                if (this.destroyed) return;
                collision = nextCollision;
                this.inputController.collision = nextCollision;
                state.hasCollision = !!nextCollision;
                updateWalkReadiness();
                this.cameraManager.setCollision(nextCollision);
                if (this.navCursor) {
                    this.navCursor.collision = nextCollision;
                }

                if (nextCollision instanceof TiledVoxelCollision) {
                    this.tiledVoxelCollision = nextCollision;
                    nextCollision.onTilesChanged = () => {
                        if (!state.loaded) {
                            state.loadingStage = 'voxel-tile-switch';
                            state.loadingStatus = '正在切换活动体素分块...';
                        }
                        updateWalkReadiness();
                        app.renderNextFrame = true;
                    };
                }

                if (nextCollision) {
                    createCollisionOverlay(nextCollision);
                }

                if (state.cameraMode === 'walk' && !state.walkAllowed) {
                    state.cameraMode = 'fly';
                }
                app.renderNextFrame = true;
            };

            // walkCapability was set from the resource declaration before any
            // collision work starts. Attach immediate collision now; legacy
            // single voxel remains disabled until its post-first-frame load
            // resolves and reaches this same attachment path.
            attachCollision(collision);

            if (deferredCollisionLoad) {
                events.once('firstFrame', () => {
                    deferredCollisionLoad()
                        .then(attachCollision)
                        .catch((err: Error) => {
                            console.warn('[Collision] Failed to attach deferred collision:', err);
                        });
                });
            }

            // collision may already have landed while the splats were still streaming
            if (collisionReady) attachCollision(collisionReady);

            const { gsplat } = app.scene;
            const mainSubjectBounds = (gsplatComponent.customAabb ?? sceneBound).clone();
            const revealBounds = mainSubjectBounds.clone();

            const attachEnvironmentToReveal = (env: Entity) => {
                environmentEntity = env;
                const environmentBbox = env.gsplat?.customAabb;
                if (environmentBbox) {
                    const transformedEnvironmentBbox = new BoundingBox();
                    transformedEnvironmentBbox.setFromTransformedAabb(environmentBbox, env.getWorldTransform());
                    revealBounds.add(transformedEnvironmentBbox);
                    this.gsplatReveal?.attachEntity(env, transformedEnvironmentBbox);
                } else {
                    this.gsplatReveal?.attachEntity(env);
                }
            };

            environmentLoad?.then((env) => {
                if (this.destroyed) return;
                if (env) {
                    attachEnvironmentToReveal(env);
                }
            });

            const startGsplatReveal = (revealCallbacks?: {
                onComplete?: () => void;
                onSubjectRevealed?: () => void;
            }) => {
                if (config.revealEffect === 'none') {
                    return;
                }

                // Streaming LOD dots scale with scene radius but a high/far camera can still
                // project them below the default 2px cull threshold. Lower minPixelSize for the
                // duration of the reveal so the first wave is not culled; applyPerfSettings
                // restores it to 2 once high-detail LOD opens.
                if (state.loadingMode === 'streaming-json') {
                    app.scene.gsplat.minPixelSize = 0.5;
                }

                this.cameraManager.camera.calcFocusPoint(focusPoint);
                const revealEntities = environmentEntity ? [gsplatEntity, environmentEntity] : gsplatEntity;
                this.gsplatReveal = new GsplatRevealRadial(app, revealEntities, revealBounds, focusPoint, {
                    streamingLod: state.loadingMode === 'streaming-json',
                    dotProfile: resolveRevealDotProfile(config, state.loadingMode),
                    subjectBounds: mainSubjectBounds,
                    onComplete: revealCallbacks?.onComplete,
                    onSubjectRevealed: revealCallbacks?.onSubjectRevealed
                });
                this.gsplatReveal.arm();
            };

            const instance = gsplatComponent.instance;
            if (instance) {
                // Standard SOG resources use the per-instance sorter and do
                // not participate in the octree system's `frame:ready` event.
                // Metaflow still publishes both formats, so preserve this
                // dedicated first-frame path alongside upstream LOD loading.
                const numSplats = instance.resource?.numSplats ?? 0;
                const splatLabel = numSplats >= 10000 ? `${(numSplats / 10000).toFixed(1)} 万` : `${numSplats}`;
                let firstFrameScheduled = false;
                let sortTimeout: ReturnType<typeof setTimeout> | null = null;

                const scheduleFirstFrame = () => {
                    if (firstFrameScheduled) {
                        return;
                    }
                    firstFrameScheduled = true;
                    if (sortTimeout) {
                        clearTimeout(sortTimeout);
                    }

                    startGsplatReveal();
                    state.readyToRender = true;
                    state.loadingStage = 'prepare';
                    state.loadingStatus = '高斯点排序就绪，正在准备首帧...';
                    state.progress = 100;
                    app.renderNextFrame = true;
                    app.once('frameend', () => {
                        // Legacy SOG is now stable; camera changes and explicit
                        // dynamic surfaces drive subsequent frames on demand.
                        app.autoRender = false;
                        events.fire('firstFrame');
                        if (config.exposeGlobals) window.firstFrame?.();
                    });
                };

                state.loadingStage = 'sort';
                state.loadingStatus = numSplats > 0 ? `正在排序 ${splatLabel} 个高斯点...` : '正在排序高斯点...';
                state.progress = -1;

                if (instance.sorter) {
                    const onSorterUpdated = () => {
                        instance.sorter.off('updated', onSorterUpdated);
                        scheduleFirstFrame();
                    };
                    instance.sorter.on('updated', onSorterUpdated);
                    instance.sort(camera);

                    // A few legacy SOG files do not emit sorter updates on
                    // newer PlayCanvas builds. Rendering their latest sorted
                    // state is preferable to leaving the loading UI forever.
                    sortTimeout = setTimeout(() => {
                        if (!firstFrameScheduled) {
                            console.warn('[Viewer] SOG sorter timeout - forcing first frame');
                            instance.sorter.off('updated', onSorterUpdated);
                            scheduleFirstFrame();
                        }
                    }, 3000);
                } else {
                    instance.sort(camera);
                    scheduleFirstFrame();
                }

                return;
            }

            // quality budget
            const budgets = {
                mobile: {
                    low: 1,
                    high: 2
                },
                desktop: {
                    low: 2,
                    high: 4
                }
            };

            const applyPerfSettings = () => {
                const budget = () => {
                    if (config.budget !== undefined && Number.isFinite(config.budget) && config.budget > 0) {
                        return config.budget;
                    }
                    const quality = platform.mobile ? budgets.mobile : budgets.desktop;
                    return state.performanceMode ? quality.low : quality.high;
                };

                gsplat.splatBudget = budget() * 1000000;
                // Match SuperSplat Viewer v1.29.1. A non-zero quality
                // threshold avoids the v1.29.0 every-frame SH regression,
                // while 1° / 0.2° keeps view-dependent color responsive.
                gsplat.colorUpdateAngle = state.performanceMode ? 1 : 0.2;
                gsplatComponent.lodRangeMin = 0;
                gsplatComponent.lodRangeMax = 1000;
                // Restore the default cull threshold lowered during the streaming reveal.
                app.scene.gsplat.minPixelSize = 2;

                // Parameter changes rebuild streaming work buffers. Ensure that
                // rebuild is submitted even when the camera is idle on demand.
                app.renderNextFrame = true;
            };

            if (config.fullload) {
                // reveal once full quality has finished loading (used for screenshots)
                applyPerfSettings();
            }

            const eventHandler = app.systems.gsplat;

            // Streaming continues to schedule LOD and sorting work while
            // autoRender is off. Submit a frame whenever that work becomes
            // visible, keeping work-buffer lifetime coupled to its render.
            eventHandler.on('frame:request', () => {
                app.renderNextFrame = true;
            });

            // `ready && loading === 0` describes the state before streaming starts just as well
            // as the state after it finishes: on the first frame the octree instance has not run
            // its LOD pass yet, so nothing is in flight and the world trivially reports ready.
            // Taken at face value that revealed the scene on the first event, before a single
            // frame had rendered, which both skipped the whole loading bar and undid the coarse
            // LOD clamp above by running applyPerfSettings immediately. So require evidence that
            // the streamer has left that initial state: work in flight, or splats on screen.
            // Only octree content has a streaming phase to wait for; single-file content is fully
            // loaded before this handler is registered, so it must not be gated.
            const octree = (gsplatComponent.resource as GSplatOctreeResourceLike | null)?.octree ?? null;
            let streamingStarted = !octree;

            const readyHandler = (camera: CameraComponent, layer: Layer, ready: boolean, loading: number) => {
                // `frame.gsplats` is the rendered splat count, the same stat the ministats panel
                // above reads. It covers an octree that renders before it reports work in flight.
                if (loading > 0 || app.stats.frame.gsplats > 0) {
                    streamingStarted = true;
                }

                if (ready && loading === 0 && streamingStarted) {
                    // scene is done with initial/reveal loading
                    eventHandler.off('frame:ready', readyHandler);

                    stopProgress?.();
                    state.progress = 100;

                    // switch to on-demand rendering (frame:request + camera-change detection)
                    app.autoRender = false;

                    // Keep lowest LOD through the dot wave; unlock high detail once the lift
                    // wave clears the main subject (environment may still be revealing).
                    let highDetailOpened = false;
                    const openHighDetailLod = () => {
                        if (highDetailOpened) {
                            return;
                        }
                        highDetailOpened = true;
                        events.on('performanceMode:changed', applyPerfSettings);
                        applyPerfSettings();
                    };

                    startGsplatReveal({
                        onSubjectRevealed: openHighDetailLod,
                        onComplete: openHighDetailLod
                    });
                    state.readyToRender = true;
                    state.loadingStage = 'prepare';
                    state.loadingStatus = 'LOD 数据就绪，正在准备首帧...';
                    state.progress = 100;

                    if (config.revealEffect === 'none') {
                        // No reveal will fire onComplete, so load high detail immediately.
                        openHighDetailLod();
                    }

                    gsplat.renderer = rendererTable[renderer];

                    // wait for the first valid frame to complete rendering
                    app.once('frameend', () => {
                        events.fire('firstFrame');

                        // emit first frame event on window
                        if (config.exposeGlobals) window.firstFrame?.();
                    });
                }

                // update loading status
                if (!state.loaded) {
                    if (loading > 0) {
                        state.loadingStage =
                            state.loadingMode === 'streaming-json' ? 'stream-loading' : 'legacy-lod-loading';
                        state.loadingStatus =
                            state.loadingMode === 'streaming-json'
                                ? `LOD 加载中（剩余 ${loading} 个分块）`
                                : `正在加载 LOD 数据 (剩余 ${loading} 个文件)`;
                    }
                }
            };

            eventHandler.on('frame:ready', readyHandler);
        }, ignoreLoadFailure);
    }

    private requireAlive(method: string): void {
        if (this.destroyed) {
            throw new Error(`${method}: the viewer has been destroyed`);
        }
    }

    private requireLoaded(method: string): void {
        this.requireAlive(method);
        if (!this.global.state.loaded) {
            throw new Error(`${method}: the viewer is not loaded`);
        }
    }

    frameScene(): void {
        this.requireLoaded('frameScene');
        this.global.events.fire('inputEvent', 'frame');
    }

    resetCamera(): void {
        this.requireLoaded('resetCamera');
        this.global.events.fire('inputEvent', 'reset');
    }

    toggleWalk(): void {
        this.requireLoaded('toggleWalk');
        this.global.events.fire('inputEvent', 'toggleWalk');
    }

    selectAnnotation(index: number | null): void {
        this.requireLoaded('selectAnnotation');
        const { settings, state, app } = this.global;
        if (index !== null) {
            if (!Number.isInteger(index) || index < 0 || index >= settings.annotations.length) {
                throw new RangeError('selectAnnotation: index must be an integer in range or null');
            }
            this.cameraManager.selectAnnotation(settings.annotations[index]);
        }
        state.selectedAnnotation = index;
        app.renderNextFrame = true;
    }

    setMoveInput(x: number, z: number): void {
        this.requireLoaded('setMoveInput');
        if (!Number.isFinite(x) || !Number.isFinite(z)) {
            throw new Error('setMoveInput: axes must be finite numbers');
        }
        this.inputController.setMoveInput(Math.max(-1, Math.min(1, x)), Math.max(-1, Math.min(1, z)));
    }

    async requestFullscreen(): Promise<void> {
        this.requireAlive('requestFullscreen');
        return this.untilDestroyed(this.fullscreen.request());
    }

    async exitFullscreen(): Promise<void> {
        this.requireAlive('exitFullscreen');
        return this.untilDestroyed(this.fullscreen.exit());
    }

    async startXR(mode: XrMode): Promise<void> {
        this.requireLoaded('startXR');
        return this.xr.start(mode);
    }

    async endXR(): Promise<void> {
        this.requireAlive('endXR');
        return this.xr.end();
    }

    seek(time: number): void {
        this.requireLoaded('seek');
        const { state, app } = this.global;
        if (!state.hasAnimation) {
            throw new Error('seek: no animation track');
        }
        if (!Number.isFinite(time)) {
            throw new Error('seek: time must be finite');
        }
        this.cameraManager.seek(time);
        app.renderNextFrame = true;
    }

    /**
     * Render the scene, with post effects, into an offscreen supersampled target, GPU
     * box-downsample it to the requested size and return just that small buffer. Waits for
     * the first frame. The capture target is created lazily on first use — no flag and no
     * preserveDrawingBuffer needed, and it works on both WebGL and WebGPU.
     */
    captureFrame({ time, width = 480, height = width, supersample }: CaptureOptions = {}): Promise<CaptureResult> {
        const run = async () => {
            await this.ready;
            if (this.destroyed) {
                throw new Error('captureFrame: the viewer has been destroyed');
            }
            const { app, camera, state } = this.global;
            if (!this.capture) {
                this.capture = new Capture(app, camera.camera, () => this.cameraFrame ?? null);
            }
            const savedCameraState = captureCameraState(this.cameraManager, state);
            const savedTime = state.animationTime;
            const savedPaused = state.animationPaused;
            state.animationPaused = true;
            try {
                const grab = this.capture.grab({
                    time,
                    width,
                    height,
                    supersample,
                    scrub: (t) => {
                        if (state.hasAnimation) {
                            state.animationPaused = true;
                            this.seek(t);
                        }
                    }
                });
                return await this.untilDestroyed(grab);
            } finally {
                if (!this.destroyed) {
                    const nextFrame = async () => {
                        let done!: () => void;
                        const frame = new Promise<void>((resolve) => {
                            done = resolve;
                            app.once('frameend', done);
                        });
                        app.renderNextFrame = true;
                        try {
                            await this.untilDestroyed(frame);
                        } finally {
                            app.off('frameend', done);
                        }
                    };
                    if (state.hasAnimation) {
                        this.global.events.fire('scrubAnim', savedTime, false);
                        await nextFrame();
                    }
                    if (!this.destroyed) {
                        restoreCameraState(this.cameraManager, state, savedCameraState);
                        await nextFrame();
                        state.animationPaused = savedPaused;
                    }
                }
            }
        };
        const result = this.captureQueue.then(run, run);
        this.captureQueue = result.then(
            () => {
                // intentionally ignored
            },
            () => {
                // intentionally ignored
            }
        );
        return result;
    }

    /**
     * Settle `work` when the viewer is destroyed, whatever it is waiting on. Racing rather than
     * cancelling, because the waits are the engine's; `work` runs on to completion unobserved,
     * and the race counts as its handler, so a late failure is not reported as unhandled.
     */
    private untilDestroyed<T>(work: Promise<T>): Promise<T> {
        let onAbort!: (reason: Error) => void;
        const aborted = new Promise<never>((_resolve, reject) => {
            onAbort = reject;
        });
        this.abortHandlers.add(onAbort);
        return Promise.race([work, aborted]).finally(() => {
            // releases the signal, and with it this race and its result
            this.abortHandlers.delete(onAbort);
        });
    }

    /**
     * Register cleanup to run from {@link destroy}, for things the caller set up around the
     * viewer (the canvas resize observer, document-level listeners). Runs immediately if the
     * viewer is already destroyed.
     *
     * @param fn - Cleanup to run.
     */
    onDestroy(fn: () => void) {
        if (this.destroyed) {
            fn();
            return;
        }
        this.disposers.push(fn);
    }

    /**
     * Tear the viewer down: stop rendering, remove every listener it added to the window,
     * document and canvas, restore the globals it patched, and release the graphics device.
     * Safe to call before loading has finished, and idempotent.
     *
     * Finally removes the instance root, and with it the canvas and ui subtree createViewer
     * built. Their element listeners go with them.
     */
    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;

        // settle anything waiting on an engine event, before the handlers go
        const gone = () => new Error('the viewer has been destroyed');
        this.failReady(gone());
        for (const onAbort of this.abortHandlers) {
            onAbort(gone());
        }
        this.abortHandlers.clear();

        const { app } = this.global;

        this.fullscreen.destroy();
        this.xr.destroy();

        // subsystems holding listeners on the canvas, window or document, or gpu resources
        // outside the entity hierarchy
        this.debugPanel?.destroy();
        this.navCursor?.destroy();
        this.inputController?.destroy();
        this.voxelOverlay?.destroy();
        this.meshOverlay?.destroy();
        this.tiledVoxelCollision?.destroy();
        this.gsplatReveal?.destroy();
        this.picker?.release();
        this.capture?.destroy();
        this.capture = null;
        if (this.cameraFrame) {
            this.cameraFrame.destroy();
            this.cameraFrame = null;
        }

        // configureCamera registers our device with the backbuffer srgb patch
        setBackBufferSrgb(app.graphicsDevice, false);

        // caller cleanup, in reverse registration order
        for (const dispose of this.disposers.reverse()) {
            dispose();
        }
        this.disposers.length = 0;

        // the first-frame globals, only if they are ours: a later instance may own them
        if (window.app === app) {
            delete window.app;
            delete window.scrubTo;
            delete window.captureFrame;
            delete window.animationDuration;
            delete window.getCameraPose;
            delete window.logCameraPose;
        }

        // The engine's destroy releases its own resources but leaves the underlying handle to
        // the garbage collector: the WebGL context is nulled, not lost, and the WebGPU device
        // is not destroyed. Browsers cap live WebGL contexts at around 16, so release both
        // explicitly once the engine is done with them. The canvas cannot host another
        // context type anyway. The engine's device-lost handler ignores a `destroyed` reason.
        const handles = app.graphicsDevice as unknown as {
            gl?: WebGL2RenderingContext | null;
            wgpu?: { destroy(): void } | null;
        };
        const gl = handles.gl ?? null;
        const wgpu = handles.wgpu ?? null;

        // entities (including the annotation scripts), input, assets, xr, the device and every
        // app event handler
        this.global.events.off();
        app.destroy();

        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        wgpu?.destroy();

        this.global.root.remove();
    }

    // configure camera based on application mode and post process settings
    configureCamera(settings: ExperienceSettings) {
        const { global } = this;
        const { app, config, camera } = global;
        const { postEffectSettings } = settings;
        this.applyBackground(settings);

        // hpr override takes precedence over settings.highPrecisionRendering
        const highPrecisionRendering = config.hpr ?? settings.highPrecisionRendering;

        const postFxRequested = !config.nofx && (anyPostEffectEnabled(postEffectSettings) || highPrecisionRendering);

        const enableCameraFrame = !app.xr.active && postFxRequested;

        if (enableCameraFrame) {
            // create instance
            if (!this.cameraFrame) {
                this.cameraFrame = new CameraFrame(app, camera.camera);
            }

            const { cameraFrame } = this;
            cameraFrame.enabled = true;
            cameraFrame.rendering.toneMapping = tonemapTable[settings.tonemapping];
            cameraFrame.rendering.renderFormats = highPrecisionRendering
                ? [PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F]
                : [];
            applyPostEffectSettings(cameraFrame, postEffectSettings);
            cameraFrame.update();

            // force gsplat shader to write gamma-space colors
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('gsplatOutputVS', gammaChunkGlsl);
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('gsplatOutputVS', gammaChunkWgsl);

            // force skybox shader to write gamma-space colors (inline pow replaces the
            // gammaCorrectOutput call which is a no-op under CameraFrame's GAMMA_NONE)
            ShaderChunks.get(app.graphicsDevice, 'glsl').set(
                'skyboxPS',
                patchChunk(
                    this.origChunks.glsl.skyboxPS,
                    'gammaCorrectOutput(toneMap(processEnvironment(linear)))',
                    'pow(toneMap(processEnvironment(linear)) + 0.0000001, vec3(1.0 / 2.2))',
                    'glsl skyboxPS gamma override'
                )
            );
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set(
                'skyboxPS',
                patchChunk(
                    this.origChunks.wgsl.skyboxPS,
                    'gammaCorrectOutput(toneMap(processEnvironment(linear)))',
                    'pow(toneMap(processEnvironment(linear)) + 0.0000001, vec3f(1.0 / 2.2))',
                    'wgsl skyboxPS gamma override'
                )
            );

            this.updateComposeBackgroundPatch();

            // ensure the final compose blit doesn't perform linear->gamma conversion.
            setBackBufferSrgb(app.graphicsDevice, true);
        } else {
            // no post effects needed, destroy camera frame if it exists
            if (this.cameraFrame) {
                this.cameraFrame.destroy();
                this.cameraFrame = null;
            }

            // restore shader chunks to engine defaults
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('gsplatOutputVS', this.origChunks.glsl.gsplatOutputVS);
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('gsplatOutputVS', this.origChunks.wgsl.gsplatOutputVS);
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('skyboxPS', this.origChunks.glsl.skyboxPS);
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('skyboxPS', this.origChunks.wgsl.skyboxPS);
            this.updateComposeBackgroundPatch();

            // restore original isColorBufferSrgb behavior
            setBackBufferSrgb(app.graphicsDevice, false);

            if (!app.xr.active) {
                camera.camera.toneMapping = tonemapTable[settings.tonemapping];
            }
        }

        // Mesh overlay bakes its vertex colors based on the current gamma
        // path; reapply when CameraFrame is created/destroyed (e.g. on XR
        // start/end) so the overlay tracks the new path.
        this.meshOverlay?.setCameraFrameEnabled(!!this.cameraFrame);
    }
}

export { Viewer };
