import {
    BoundingBox,
    CameraFrame,
    type CameraComponent,
    Color,
    type Entity,
    type Layer,
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
    GSPLAT_RENDERER_RASTER_CPU_SORT,
    GSPLAT_RENDERER_RASTER_GPU_SORT,
    GSplatComponent,
    platform
} from 'playcanvas';

import { Annotations } from './annotations';
import { CameraManager, isWalkAllowed } from './camera-manager';
import { Camera } from './cameras/camera';
import type { Collision } from './collision';
import { MeshCollision, TiledVoxelCollision, VoxelCollision } from './collision';
import { nearlyEquals } from './core/math';
import { DebugPanel } from './debug';
import { InputController } from './input-controller';
import { MeshDebugOverlay } from './mesh-debug-overlay';
import { NavCursor } from './nav-cursor';
import { Picker } from './picker';
import type { ExperienceSettings, PostEffectSettings } from './settings';
import type { Config, Global } from './types';
import { TiledVoxelDebugOverlay, VoxelDebugOverlay } from './voxel-debug-overlay';

// String.replace wrapper that warns when the source substring is missing, so
// shader chunk patches against the engine fail loudly instead of silently
// producing the original chunk.
const patchChunk = (source: string, search: string, replacement: string, name: string): string => {
    if (!source.includes(search)) {
        console.warn(`patchChunk: substring not found in '${name}', shader chunk patch may be out of sync with the engine.`);
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
    'webgl': GSPLAT_RENDERER_RASTER_CPU_SORT,
    'webgpu': GSPLAT_RENDERER_RASTER_GPU_SORT
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
    return (settings.sharpness.enabled && settings.sharpness.amount > 0) ||
        (settings.bloom.enabled && settings.bloom.intensity > 0) ||
        (settings.grading.enabled) ||
        (settings.vignette.enabled && settings.vignette.intensity > 0) ||
        (settings.fringing.enabled && settings.fringing.intensity > 0);
};

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const toCssColor = (color: [number, number, number]) => `rgb(${color.map((v) => Math.round(clamp01(v) * 255)).join(' ')})`;
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
        let metaflowGradientY = clamp(1.0 - uv.y, 0.0, 1.0);
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

// store the original isColorBufferSrgb so the override in updatePostEffects is idempotent
const origIsColorBufferSrgb = RenderTarget.prototype.isColorBufferSrgb;

class Viewer {
    global: Global;

    cameraFrame: CameraFrame;

    inputController: InputController;

    cameraManager: CameraManager;

    picker: Picker;

    annotations: Annotations;

    forceRenderNextFrame = false;

    voxelOverlay: VoxelDebugOverlay | TiledVoxelDebugOverlay | null = null;

    tiledVoxelCollision: TiledVoxelCollision | null = null;

    meshOverlay: MeshDebugOverlay | null = null;

    navCursor: NavCursor | null = null;

    debugPanel: DebugPanel | null = null;

    sceneBackgroundCss: string | null = null;

    sceneBackgroundGradient: NonNullable<ExperienceSettings['background']['gradient']> | null = null;

    sceneBackgroundRevealed = false;

    origChunks: {
        glsl: {
            gsplatOutputVS: string,
            skyboxPS: string,
            composePS: string,
            composeMainEndPS: string
        },
        wgsl: {
            gsplatOutputVS: string,
            skyboxPS: string,
            composePS: string,
            composeMainEndPS: string
        }
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

        const rootStyle = document.documentElement.style;
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
            glsl.set('composePS',
                patchChunk(
                    glslComposePS,
                    'gl_FragColor = vec4(result, scene.a);',
                    'gl_FragColor = vec4(result, 1.0);',
                    'glsl composePS Metaflow gradient alpha'
                )
            );
            wgsl.set('composePS',
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

    constructor(global: Global, gsplatLoad: Promise<Entity>, skyboxLoad: Promise<void> | undefined, collisionLoad: Promise<Collision | null> | undefined) {
        this.global = global;

        const { app, settings, config, events, state, camera, renderer } = global;
        const { graphicsDevice } = app;

        // render skybox as plain equirect
        const glsl = ShaderChunks.get(graphicsDevice, 'glsl');
        glsl.set('skyboxPS', patchChunk(glsl.get('skyboxPS'), 'mapRoughnessUv(uv, mipLevel)', 'uv', 'glsl skyboxPS'));

        const wgsl = ShaderChunks.get(graphicsDevice, 'wgsl');
        wgsl.set('skyboxPS', patchChunk(wgsl.get('skyboxPS'), 'mapRoughnessUv(uv, uniform.mipLevel)', 'uv', 'wgsl skyboxPS'));

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

        // disable auto render, we'll render only when camera changes
        app.autoRender = false;

        // configure the camera
        this.configureCamera(settings);

        // reconfigure camera when entering/exiting XR
        app.xr.on('start', () => this.configureCamera(settings));
        app.xr.on('end', () => this.configureCamera(settings));

        // construct debug ministats
        if (config.ministats) {
            const options = MiniStats.getDefaultOptions() as any;
            options.cpu.enabled = false;
            options.stats = options.stats.filter((s: any) => s.name !== 'DrawCalls');
            options.stats.push({
                name: 'VRAM',
                stats: ['vram.tex'],
                decimalPlaces: 1,
                multiplier: 1 / (1024 * 1024),
                unitsName: 'MB',
                watermark: 1024
            }, {
                name: 'Splats',
                stats: ['frame.gsplats'],
                decimalPlaces: 3,
                multiplier: 1 / 1000000,
                unitsName: 'M',
                watermark: 5
            });

            // eslint-disable-next-line no-new
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
                if (config.ministats ||
                    !nearlyEquals(world.data, prevWorld.data) ||
                    !nearlyEquals(proj.data, prevProj.data)) {
                    app.renderNextFrame = true;
                }
            }

            // suppress rendering till we're ready, but let XR manage its own frame loop
            if (!state.readyToRender && !app.xr.active) {
                app.renderNextFrame = false;
            }

            if (this.forceRenderNextFrame) {
                app.renderNextFrame = true;
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
            cameraEntity.camera.nearClip = near;
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

        // update state on first frame
        events.on('firstFrame', () => {
            state.loaded = true;
            this.revealSceneBackground();
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
                    target: [
                        round6(focusPoint.x),
                        round6(focusPoint.y),
                        round6(focusPoint.z)
                    ] as [number, number, number],
                    angles: [
                        round6(activeCamera.angles.x),
                        round6(activeCamera.angles.y),
                        round6(activeCamera.angles.z)
                    ] as [number, number, number],
                    distance: round6(activeCamera.distance),
                    fov: round6(activeCamera.fov)
                };
            };

            window.scrubTo = (time: number) => {
                if (!state.hasAnimation) {
                    return Promise.reject(new Error('No animation track'));
                }

                state.animationPaused = true;
                return new Promise<void>((resolve) => {
                    events.fire('scrubAnim', time);
                    app.renderNextFrame = true;
                    app.once('frameend', () => resolve());
                });
            };

            window.animationDuration = state.animationDuration;
            window.getCameraPose = getCameraPose;
            window.logCameraPose = () => {
                const pose = getCameraPose();
                if (!pose) {
                    console.warn('Camera is not ready yet.');
                    return null;
                }

                console.log('Current camera pose:', pose);
                console.log('Settings snippet:\n' + JSON.stringify({
                    initial: {
                        position: pose.position,
                        target: pose.target,
                        fov: pose.fov
                    }
                }, null, 2));
                return pose;
            };
            console.info('Camera debug helpers ready: logCameraPose() / getCameraPose()');
        });

        // wait for the model to load
        Promise.all([gsplatLoad, skyboxLoad, collisionLoad]).then((results) => {
            const gsplatComponent = results[0].gsplat as GSplatComponent;
            const collision = results[2];
            if (collision instanceof TiledVoxelCollision) {
                this.tiledVoxelCollision = collision;
            }

            // get scene bounding box
            const gsplatBbox = gsplatComponent.customAabb;
            if (gsplatBbox) {
                sceneBound.setFromTransformedAabb(gsplatBbox, results[0].getWorldTransform());
            }

            if (!config.noui) {
                this.annotations = new Annotations(global, this.cameraFrame != null);
            }

            this.picker = new Picker(app, camera);
            this.inputController = new InputController(global, this.picker);
            this.inputController.collision = collision ?? null;

            // hasCollision = a collision provider exists. walkCapability was
            // set from the resource declaration before loading so the UI can
            // show walk mode early; walkAllowed is stricter and only flips true
            // once the collision needed under the user is ready. For tiled
            // voxel this waits for the foot tile, not the full 3x3 neighborhood.
            state.hasCollision = !!collision;
            const hasWalkArea = isWalkAllowed(sceneBound, collision ?? null);
            const updateWalkReadiness = () => {
                let ready = hasWalkArea;
                if (collision instanceof TiledVoxelCollision) {
                    const p = camera.getPosition();
                    collision.updateForQueryPosition(-p.x, p.z);
                    ready = ready && collision.isCurrentTileLoaded();
                }
                state.walkAllowed = ready;
            };
            updateWalkReadiness();

            if (collision instanceof TiledVoxelCollision) {
                collision.onTilesChanged = () => {
                    if (!state.loaded) {
                        state.loadingStage = 'voxel-tile-switch';
                        state.loadingStatus = '正在切换活动体素分块...';
                    }
                    updateWalkReadiness();
                    app.renderNextFrame = true;
                };
            }

            // Create collision debug overlay (voxel uses a compute shader, mesh
            // uses standard line rendering). The voxel path requires WebGPU.
            if (collision instanceof VoxelCollision && renderer !== 'webgl') {
                state.loadingStage = 'overlay';
                state.loadingStatus = '正在准备体素调试叠层...';
                this.voxelOverlay = new VoxelDebugOverlay(app, collision, camera);
                this.voxelOverlay.mode = config.heatmap ? 'heatmap' : 'overlay';
                state.hasCollisionOverlay = true;

                events.on('collisionOverlayEnabled:changed', (value: boolean) => {
                    this.voxelOverlay.enabled = value;
                    app.renderNextFrame = true;
                });
            } else if (collision instanceof TiledVoxelCollision && renderer !== 'webgl') {
                state.loadingStage = 'overlay';
                state.loadingStatus = '正在准备 tiled voxel 调试叠层...';
                this.voxelOverlay = new TiledVoxelDebugOverlay(app, collision, camera);
                this.voxelOverlay.mode = config.heatmap ? 'heatmap' : 'overlay';
                state.hasCollisionOverlay = true;

                events.on('collisionOverlayEnabled:changed', (value: boolean) => {
                    this.voxelOverlay.enabled = value;
                    app.renderNextFrame = true;
                });
            } else if (collision instanceof MeshCollision) {
                state.loadingStage = 'overlay';
                state.loadingStatus = '正在准备网格碰撞叠层...';
                this.meshOverlay = new MeshDebugOverlay(app, collision, camera, !!this.cameraFrame);
                state.hasCollisionOverlay = true;

                events.on('collisionOverlayEnabled:changed', (value: boolean) => {
                    this.meshOverlay.enabled = value;
                    app.renderNextFrame = true;
                });
            }

            this.cameraManager = new CameraManager(global, sceneBound, collision);
            applyCamera(this.cameraManager.camera);
            if (this.tiledVoxelCollision) {
                const p = camera.getPosition();
                this.tiledVoxelCollision.updateForQueryPosition(-p.x, p.z);
            }
            updateWalkReadiness();
            if (state.cameraMode === 'walk' && !state.walkAllowed) {
                state.cameraMode = 'fly';
            }

            if (!config.noui) {
                this.navCursor = new NavCursor(app, camera, collision ?? null, events, state);
            }

            this.debugPanel = new DebugPanel(global, this.cameraManager);

            const { gsplat } = app.scene;

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
                gsplat.lodRangeMin = 0;
                gsplat.lodRangeMax = 1000;
                gsplat.colorUpdateAngle = state.performanceMode ? 4 : 2;
                gsplat.minContribution = 1;
                gsplat.alphaClip = 1 / 255;
                gsplat.antiAlias = config.aa;
            };

            if (config.fullload) {
                // reveal once full quality has finished loading (used for screenshots)
                applyPerfSettings();
            } else {
                // reveal once low lod has loaded for fastest possible reveal
                const resource = results[0].gsplat.resource as GSplatOctreeResourceLike | null;
                const lodLevels = resource?.octree?.lodLevels;
                if (lodLevels) {
                    gsplat.lodRangeMax = gsplat.lodRangeMin = lodLevels - 1;
                }
            }

            state.loadingStage = state.loadingMode === 'streaming-json' ? 'stream-schedule' : 'legacy-lod-loading';
            state.loadingStatus = state.loadingMode === 'streaming-json'
                ? '正在建立流式 LOD 调度...'
                : '正在加载 LOD 数据...';
            state.progress = 0;

            // these two allow LOD behind camera to drop, saves lots of splats
            gsplat.lodUpdateAngle = 90;
            gsplat.lodBehindPenalty = 5;

            // same performance, but rotating on slow devices does not give us unsorted splats on sides
            gsplat.radialSorting = true;

            const eventHandler = app.systems.gsplat;

            // idle timer: force continuous rendering until 4s of inactivity
            let idleTime = 0;
            this.forceRenderNextFrame = true;

            app.on('update', (dt: number) => {
                idleTime += dt;
                this.forceRenderNextFrame = idleTime < 4;
            });

            events.on('inputEvent', (type: string) => {
                if (type !== 'interact') {
                    idleTime = 0;
                }
            });

            eventHandler.on('frame:ready', (_camera: CameraComponent, _layer: Layer, ready: boolean, loading: number) => {
                if (loading > 0 || !ready) {
                    idleTime = 0;
                }
            });

            let current = 0;
            let watermark = 1;
            const readyHandler = (camera: CameraComponent, layer: Layer, ready: boolean, loading: number) => {
                if (ready && loading === 0) {
                    // scene is done loading
                    eventHandler.off('frame:ready', readyHandler);

                    state.readyToRender = true;
                    state.loadingStage = 'prepare';
                    state.loadingStatus = 'LOD 数据就绪，正在准备首帧...';
                    state.progress = 100;

                    // handle quality mode changes
                    events.on('performanceMode:changed', applyPerfSettings);
                    applyPerfSettings();

                    // debug colorize lods
                    gsplat.debug = config.colorize ? GSPLAT_DEBUG_LOD : GSPLAT_DEBUG_NONE;
                    gsplat.renderer = rendererTable[renderer];

                    // wait for the first valid frame to complete rendering
                    app.once('frameend', () => {
                        events.fire('firstFrame');

                        // emit first frame event on window
                        window.firstFrame?.();
                    });
                }

                // update loading status
                if (loading !== current) {
                    watermark = Math.max(watermark, loading);
                    current = watermark - loading;
                    state.progress = Math.trunc(current / watermark * 100);
                    if (loading > 0) {
                        state.loadingStage = state.loadingMode === 'streaming-json' ? 'stream-loading' : 'legacy-lod-loading';
                        state.loadingStatus = state.loadingMode === 'streaming-json'
                            ? `流式 LOD 拉取中 (剩余 ${loading} 个分块)`
                            : `正在加载 LOD 数据 (剩余 ${loading} 个文件)`;
                    }
                }
            };

            eventHandler.on('frame:ready', readyHandler);
        });
    }

    // configure camera based on application mode and post process settings
    configureCamera(settings: ExperienceSettings) {
        const { global } = this;
        const { app, config, camera } = global;
        const { postEffectSettings } = settings;
        this.applyBackground(settings);

        // hpr override takes precedence over settings.highPrecisionRendering
        const highPrecisionRendering = config.hpr ?? settings.highPrecisionRendering;

        const postFxRequested = !config.nofx &&
            (anyPostEffectEnabled(postEffectSettings) || highPrecisionRendering);

        const enableCameraFrame = !app.xr.active && postFxRequested;

        if (enableCameraFrame) {
            // create instance
            if (!this.cameraFrame) {
                this.cameraFrame = new CameraFrame(app, camera.camera);
            }

            const { cameraFrame } = this;
            cameraFrame.enabled = true;
            cameraFrame.rendering.toneMapping = tonemapTable[settings.tonemapping];
            cameraFrame.rendering.renderFormats = highPrecisionRendering ? [PIXELFORMAT_RGBA16F, PIXELFORMAT_RGBA32F] : [];
            applyPostEffectSettings(cameraFrame, postEffectSettings);
            cameraFrame.update();

            // force gsplat shader to write gamma-space colors
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('gsplatOutputVS', gammaChunkGlsl);
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('gsplatOutputVS', gammaChunkWgsl);

            // force skybox shader to write gamma-space colors (inline pow replaces the
            // gammaCorrectOutput call which is a no-op under CameraFrame's GAMMA_NONE)
            ShaderChunks.get(app.graphicsDevice, 'glsl').set('skyboxPS',
                patchChunk(
                    this.origChunks.glsl.skyboxPS,
                    'gammaCorrectOutput(toneMap(processEnvironment(linear)))',
                    'pow(toneMap(processEnvironment(linear)) + 0.0000001, vec3(1.0 / 2.2))',
                    'glsl skyboxPS gamma override'
                )
            );
            ShaderChunks.get(app.graphicsDevice, 'wgsl').set('skyboxPS',
                patchChunk(
                    this.origChunks.wgsl.skyboxPS,
                    'gammaCorrectOutput(toneMap(processEnvironment(linear)))',
                    'pow(toneMap(processEnvironment(linear)) + 0.0000001, vec3f(1.0 / 2.2))',
                    'wgsl skyboxPS gamma override'
                )
            );

            this.updateComposeBackgroundPatch();

            // ensure the final compose blit doesn't perform linear->gamma conversion.
            RenderTarget.prototype.isColorBufferSrgb = function (index) {
                return this === app.graphicsDevice.backBuffer ? true : origIsColorBufferSrgb.call(this, index);
            };

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
            RenderTarget.prototype.isColorBufferSrgb = origIsColorBufferSrgb;

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
