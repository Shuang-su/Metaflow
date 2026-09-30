import { installNavigation } from './navigation/integration';
import { navigationCapability } from './navigation/nav-annotation';
import {
    Asset,
    Color,
    createGraphicsDevice,
    Entity,
    EventHandler,
    Keyboard,
    Mouse,
    platform,
    TouchDevice,
    revision as engineRevision,
    version as engineVersion
} from 'playcanvas';
import type { Texture, TextureHandler, AppBase } from 'playcanvas';

import { createAnalyticsClient } from './analytics/client';
import { classifyPrimarySource, getResourceComposition, validateStreamingLodManifest } from './resource-source';
import type { LoadMode, LoadingStage, Config, Global, ViewerHandle } from './types';
import versionHistory from '../../metadata/version-history.json';
import { App } from './app';
import { MeshCollision, loadTiledVoxelCollision, loadVoxelCollision } from './collision';
import type { Collision } from './collision';
import { observe } from './core/observe';
import { initLocalization } from './localization';
import type { CreateViewerOptions } from './options';
import { parseSettings } from './parse-settings';
import { persistPreferences, readPreferences } from './preferences';
import { importSettings } from './settings';
import { initPoster, initUI } from './ui';
import uiHtml from './ui.html';
import { Viewer } from './viewer';
import { version as appVersion } from '../package.json';

type LoadCallbacks = {
    onProgress: (progress: number) => void;
    onStatus: (status: string) => void;
    onMode: (mode: LoadMode) => void;
    onStage: (stage: LoadingStage) => void;
    onConflict: (conflict: boolean) => void;
};

const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatSplats = (n: number) => (n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : `${n}`);

const formatError = (err: unknown) => {
    if (err instanceof Error) {
        return {
            error_name: err.name,
            error_message: err.message
        };
    }
    return {
        error_name: 'Error',
        error_message: String(err)
    };
};

const loadGsplat = async (app: AppBase, config: Config, callbacks: LoadCallbacks, cancelled: () => boolean) => {
    const { contents, contentUrl, aa } = config;
    const c = contents as unknown as ArrayBuffer;
    const filename = config.contentFilename || new URL(contentUrl, location.href).pathname.split('/').pop() || '';
    const primarySourceKind = classifyPrimarySource(config.contentFilename || contentUrl, location.href);
    const loadMode: LoadMode = primarySourceKind === 'streaming-lod' ? 'streaming-json' : 'legacy-sog';

    callbacks.onConflict(false);
    callbacks.onMode(loadMode);
    callbacks.onStage('detect');

    if (primarySourceKind === 'unsupported') {
        callbacks.onConflict(true);
        callbacks.onStatus(`不支持的主体资源入口：${filename || '(empty)'}`);
        throw new Error(`Unsupported primary resource entry: ${filename || '(empty)'}`);
    }

    const sourceStatuses = {
        'streaming-lod': '已识别流式 LOD 资源，准备加载索引...',
        'sog-bundle': '已识别 SOG Bundle，准备加载模型...',
        'sog-meta': '已识别 Loose SOG 元数据，准备加载模型...',
        ply: '已识别 PLY 模型，准备加载模型...'
    } as const;
    callbacks.onStatus(sourceStatuses[primarySourceKind]);

    let data: object | undefined;
    if (primarySourceKind === 'streaming-lod') {
        if (!contents) {
            throw new Error('Streaming LOD entry is missing its prefetched response');
        }
        const response = await contents;
        try {
            const manifest: unknown = await response.clone().json();
            validateStreamingLodManifest(manifest);
            data = manifest as object;
        } catch (err) {
            callbacks.onConflict(true);
            const error = formatError(err);
            callbacks.onStatus(`流式 LOD 清单无效：${error.error_message}`);
            throw new Error(`Invalid streaming LOD manifest: ${error.error_message}`, { cause: err });
        }
    }

    if (cancelled()) throw new Error('Viewer destroyed while loading');
    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data);

    return new Promise<Entity>((resolve, reject) => {
        asset.on('load', () => {
            if (cancelled()) {
                resolve(null);
                return;
            }
            callbacks.onStage('gpu');
            const entity = new Entity('gsplat', app);
            entity.setLocalEulerAngles(0, 0, 180);
            entity.addComponent('gsplat', {
                unified: true,
                asset
            });
            app.root.addChild(entity);
            app.scene.gsplat.antiAlias = aa;
            callbacks.onStatus('模型 GPU 资源已就绪，等待渲染准备...');
            resolve(entity);
        });

        asset.on('load:data', (data: any) => {
            callbacks.onStage('parse');
            const numSplats = data?.numSplats;
            callbacks.onStatus(
                numSplats
                    ? `已解析 ${formatSplats(numSplats)} 个高斯点，正在创建 GPU 资源...`
                    : '正在解析模型结构数据...'
            );
        });

        let watermark = 0;
        let isCached = false;
        asset.on('progress', (received, length) => {
            callbacks.onStage('download');

            if (!length || length <= 0) {
                if (!isCached) {
                    isCached = true;
                    callbacks.onProgress(-1);
                }
                callbacks.onStatus(`正在解析模型数据 ${formatSize(received)}`);
                return;
            }

            const progress = Math.min(0.99, received / length) * 100;
            if (progress > watermark) {
                watermark = progress;
                callbacks.onProgress(Math.trunc(watermark));
            }

            callbacks.onStatus(`正在下载模型 ${formatSize(received)} / ${formatSize(length)}`);
        });

        asset.on('error', (err) => {
            console.error(err);
            reject(err);
        });

        app.assets.add(asset);
        app.assets.load(asset);
    });
};

const loadEnvironment = async (app: AppBase, config: Config, cancelled: () => boolean) => {
    const { environmentContents, environmentUrl } = config;
    if (!environmentUrl || !environmentContents) return null;

    const c = environmentContents as unknown as ArrayBuffer;
    const filename = new URL(environmentUrl, location.href).pathname.split('/').pop();
    const asset = new Asset(filename, 'gsplat', { url: environmentUrl, filename, contents: c });

    return new Promise<Entity | null>((resolve) => {
        asset.on('load', () => {
            if (cancelled()) {
                resolve(null);
                return;
            }
            const entity = new Entity('environment', app);
            entity.setLocalEulerAngles(0, 0, 180);
            entity.addComponent('gsplat', {
                unified: true,
                asset
            });
            app.root.addChild(entity);
            app.renderNextFrame = true;
            resolve(entity);
        });

        asset.on('error', (err) => {
            console.error('Environment load error:', err);
            resolve(null);
        });

        app.assets.add(asset);
        app.assets.load(asset);
    });
};

const loadSkybox = (app: AppBase, url: string) => {
    return new Promise<Asset>((resolve, reject) => {
        const asset = new Asset(
            'skybox',
            'texture',
            {
                url
            },
            {
                type: 'rgbp',
                mipmaps: false,
                addressu: 'repeat',
                addressv: 'clamp'
            }
        );

        asset.on('load', () => {
            resolve(asset);
        });

        asset.on('error', (err) => {
            console.log(err);
            reject(err);
        });

        app.assets.add(asset);
        app.assets.load(asset);
    });
};

const createApp = async (canvas: HTMLCanvasElement, config: Config) => {
    const useWebGPU = config.renderer === 'webgpu';

    // Create the graphics device. The engine auto-appends WebGL2/null fallbacks
    // when WebGPU isn't supported. Request xrCompatible so the device — WebGPU
    // (via XRGPUBinding) or the WebGL fallback — is usable for AR/VR.
    const device = await createGraphicsDevice(canvas, {
        deviceTypes: useWebGPU ? ['webgpu'] : [],
        antialias: false,
        // The engine supports alpha, although createGraphicsDevice omits it from its declaration.
        ...{ alpha: true },
        depth: true,
        stencil: false,
        xrCompatible: true,
        powerPreference: 'high-performance'
    });

    console.log(`Renderer: ${device.deviceType}`);

    // The engine may have fallen back from WebGPU to WebGL2; downstream code
    // (voxel overlay, XR, gsplat renderer selection) needs the *actual* renderer.
    const renderer: 'webgl' | 'webgpu' = device.deviceType === 'webgpu' ? 'webgpu' : 'webgl';

    // Set maxPixelRatio so the XR framebuffer scale factor is computed correctly.
    // Regular rendering bypasses maxPixelRatio via the custom initCanvas sizing.
    device.maxPixelRatio = window.devicePixelRatio;

    // Create the application
    const app = new App(canvas, {
        graphicsDevice: device,
        mouse: new Mouse(canvas),
        touch: new TouchDevice(canvas),
        keyboard: new Keyboard(window)
    });

    // enable anonymous CORS for image loading in safari (must be set before any
    // texture asset starts loading, otherwise the <img> is fetched without the
    // crossorigin attribute and WebGL rejects it with SecurityError)
    (app.loader.getHandler('texture') as TextureHandler).imgParser.crossOrigin = 'anonymous';

    // Create entity hierarchy
    const cameraRoot = new Entity('camera root', app);
    app.root.addChild(cameraRoot);

    const camera = new Entity('camera', app);
    cameraRoot.addChild(camera);

    const light = new Entity('light', app);
    light.setEulerAngles(35, 45, 0);
    light.addComponent('light', {
        color: new Color(1.0, 0.98, 0.957),
        intensity: 1
    });
    app.root.addChild(light);

    app.scene.ambientLight.set(0.51, 0.55, 0.65);

    return { app, camera, renderer };
};

// measure the canvas's css size. a hidden canvas (e.g. inside a display:none
// iframe) measures 0×0 — resizeCanvas skips those, keeping the current backing
// size until the resize observer reports a real layout
const measureCanvas = (canvas: HTMLCanvasElement) => ({
    width: canvas.clientWidth,
    height: canvas.clientHeight
});

// size the canvas backbuffer from a css size: scaled by the pixel ratio (capped to
// limit resolution on high-DPI devices), halved in performance mode. a zero css size
// (hidden canvas) is skipped — the canvas keeps its previous size, as a zero-sized
// swap chain is invalid in webgpu.
const resizeCanvas = (
    canvas: HTMLCanvasElement,
    cssSize: { width: number; height: number },
    performanceMode: boolean
) => {
    if (!cssSize.width || !cssSize.height) return;

    // maximum pixel dimension we will allow along the shortest screen dimension based on platform
    const maxPixelDim = platform.mobile ? 1080 : 2160;
    const pixelRatio = Math.min(maxPixelDim / Math.min(screen.width, screen.height), window.devicePixelRatio);

    const scale = pixelRatio * (performanceMode ? 0.5 : 1.0);
    const width = Math.ceil(cssSize.width * scale);
    const height = Math.ceil(cssSize.height * scale);
    if (width !== canvas.width || height !== canvas.height) {
        canvas.width = width;
        canvas.height = height;
    }
};

// initialize canvas size and resizing
const initCanvas = (global: Global) => {
    const { app, events, state } = global;
    const { canvas } = app.graphicsDevice;

    // the canvas css size, kept current by the resize observer. measured directly at
    // startup so the first frames are sized before the observer's first delivery.
    const cssSize = measureCanvas(canvas);

    const apply = () => {
        // don't resize the canvas during XR - the XR system manages its own framebuffers
        // and resetting canvas dimensions can invalidate the XRWebGLLayer
        if (app.xr?.active) return;

        resizeCanvas(canvas, cssSize, state.performanceMode);
    };

    const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        const e = entries[0]?.contentBoxSize?.[0];
        // ignore hidden deliveries (0×0), keeping the last real size
        if (e && e.inlineSize && e.blockSize) {
            cssSize.width = e.inlineSize;
            cssSize.height = e.blockSize;
            app.renderNextFrame = true;
        }
    });
    resizeObserver.observe(canvas);

    events.on('performanceMode:changed', () => {
        app.renderNextFrame = true;
    });

    // Resize canvas before render() so the swap chain texture is acquired at the correct size.
    app.on('framerender', apply);

    // Disable the engine's built-in canvas resize — we handle it via ResizeObserver
    (app as unknown as { _allowResize: boolean })._allowResize = false;
    apply();

    return () => resizeObserver.disconnect();
};

const createImage = (url: string) => {
    const img = new Image();
    img.src = url;
    return img;
};

// the options with every default applied
const resolveConfig = (options: CreateViewerOptions): Config => ({
    ...options,
    noui: options.noui ?? options.ui === false,
    noanalytics: options.noanalytics ?? !options.exposeGlobals,
    unified: options.unified ?? false,
    environmentContents:
        options.environmentContents ?? (options.environmentUrl ? fetchWithRetry(options.environmentUrl) : undefined),
    contentUrl: options.contentUrl,
    contentFilename: options.contentFilename,
    posterUrl: options.posterUrl,
    skyboxUrl: options.skyboxUrl,
    collisionUrl: options.collisionUrl,
    poster: options.poster ?? (options.posterUrl ? createImage(options.posterUrl) : undefined),
    contents: options.contents ?? fetchWithRetry(options.contentUrl),
    renderer: options.renderer ?? 'webgpu',
    ui: options.ui ?? !options.noui,
    reticle: options.reticle ?? false,
    noanim: options.noanim ?? false,
    nofx: options.nofx ?? false,
    hpr: options.hpr,
    ministats: options.ministats ?? false,
    colorize: options.colorize ?? false,
    fullload: options.fullload ?? false,
    aa: options.aa ?? false,
    budget: options.budget,
    heatmap: options.heatmap ?? false,
    debug: options.debug ?? false,
    lang: options.lang,
    exposeGlobals: options.exposeGlobals ?? false
});

type CollisionLoadPlan = { immediate?: Promise<Collision | null>; deferred?: () => Promise<Collision | null> };

const createCollisionLoadPlan = (app: AppBase, config: Config, state: Global['state']): CollisionLoadPlan => {
    const voxelOptions = {
        coordinateSpace: config.voxelCoordinateSpace ?? 'world'
    };

    if (config.voxelManifestUrl) {
        state.loadingStage = 'voxel-manifest';
        state.loadingStatus = '正在解析 tiled voxel 清单...';
        state.progress = -1;
        return {
            immediate: loadTiledVoxelCollision(config.voxelManifestUrl, voxelOptions).catch((err: Error): null => {
                console.warn('Failed to load tiled voxel manifest:', err);
                state.loadingStage = 'prepare';
                state.loadingStatus = 'tiled voxel 清单加载失败，继续以无碰撞模式准备渲染...';
                return null;
            })
        };
    }

    const collisionUrl = config.collisionUrl ?? config.voxelUrl;
    if (!collisionUrl) {
        return {};
    }

    const ext = new URL(collisionUrl, location.href).pathname.split('.').pop()?.toLowerCase();
    if (ext === 'glb') {
        state.loadingStage = 'collision';
        state.loadingStatus = '正在准备碰撞数据...';
        return {
            immediate: MeshCollision.fromGlb(app, collisionUrl).catch((err: Error): null => {
                console.warn('Failed to load mesh collision:', err);
                return null;
            })
        };
    }

    // Legacy single-voxel assets can be large. Preserve the Metaflow loading
    // contract: reveal the scene first, then fetch and attach collision in the
    // background without reopening the completed loading screen.
    return {
        deferred: () => {
            console.info('[Collision] 首帧已完成，开始后台加载单体碰撞体素');
            return loadVoxelCollision(collisionUrl, voxelOptions).catch((err: Error): null => {
                console.warn('Failed to load voxel data in background:', err);
                return null;
            });
        }
    };
};

const fetchWithRetry = async (url: string): Promise<Response> => {
    for (let attempt = 0; ; attempt++) {
        try {
            const response = await fetch(url);
            if (response.ok) return response;
            if (attempt >= 3 || (![408, 425, 429].includes(response.status) && response.status < 500)) {
                throw Object.assign(new Error(`HTTP ${response.status}: ${url}`), { terminal: true });
            }
        } catch (error) {
            if (attempt >= 3 || (error as { terminal?: boolean }).terminal) throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 500 * 2 ** attempt));
    }
};

const createViewer = async (options: CreateViewerOptions): Promise<ViewerHandle> => {
    const { container } = options;
    const config = resolveConfig(options);
    // Prefetch may fail while the graphics device initializes. Keep the original rejection
    // for the asset loader, but attach a handler immediately to avoid an unhandled rejection.
    for (const pending of [config.contents, config.environmentContents])
        void pending?.catch(() => {
            /* The asset loader reports the original failure. */
        });

    // the instance root. The canvas and the ui markup are siblings under it, which scopes
    // everything the viewer looks up or attaches in the dom; the viewer owns it outright, so
    // nothing on the host's own element is read or written, and destroy() removes it whole
    const root = document.createElement('div');
    root.className = 'sse-viewer';
    root.tabIndex = 0;
    root.addEventListener(
        'pointerdown',
        (event) => {
            const target = event.target as HTMLElement;
            if (!target.closest('input, textarea, select, [contenteditable]')) root.focus({ preventScroll: true });
        },
        { capture: true }
    );
    if (config.ui) {
        root.innerHTML = uiHtml;
    } else {
        root.appendChild(document.createElement('canvas'));
    }

    container.appendChild(root);
    const canvas = root.querySelector('canvas');

    // create events
    const events = new EventHandler();
    root.style.setProperty('--canvas-opacity', '0');
    events.once('firstFrame', () => root.style.setProperty('--canvas-opacity', '1'));

    // the poster covers the hidden canvas from the first moment, before the graphics device
    // exists. It is part of the ui, so a headless instance shows the canvas from the start and
    // its host covers the wait however it likes
    if (config.poster && config.ui) {
        initPoster(root, config.poster, events);
    }

    // resolve settings after showing the poster, including a fetch started by the document
    let importedSettings: ReturnType<typeof importSettings>;
    try {
        const settingsJson =
            typeof options.settings === 'string'
                ? parseSettings(await (await fetchWithRetry(options.settings)).text())
                : await options.settings;
        importedSettings = importSettings(settingsJson);
    } catch (error) {
        root.remove();
        throw error;
    }

    try {
        const preferenceMigrationKey = 'metaflowViewerPreferenceMigration';
        const preferenceMigrationVersion = '5.19.0';
        if (localStorage.getItem(preferenceMigrationKey) !== preferenceMigrationVersion) {
            localStorage.removeItem('performanceMode');
            localStorage.removeItem('gamingControls');
            localStorage.removeItem('retinaDisplay');
            localStorage.setItem(preferenceMigrationKey, preferenceMigrationVersion);
        }
    } catch {
        /* Storage can be unavailable in an embedded document. */
    }
    const preferences = readPreferences(platform.mobile);

    // size the canvas backbuffer before the graphics device is created, so the swap
    // chain and any backbuffer-sized resources start at the correct resolution instead
    // of being recreated on the first frame's resize. a hidden embed keeps the default
    // canvas size here; the resize observer sizes it on reveal
    resizeCanvas(canvas, measureCanvas(canvas), preferences.performanceMode);

    const { app, camera, renderer } = await createApp(canvas, config).catch((error) => {
        root.remove();
        throw error;
    });

    // translate the markup and get this instance's string lookup, before the ui reads any
    const localize = initLocalization(config.lang, root);

    const state = observe(events, {
        loaded: false,
        readyToRender: false,
        loadingMode: 'legacy-sog',
        loadingStage: 'init',
        loadingConflict: false,
        loadingStatus: '',
        walkCapability: !!(config.voxelManifestUrl || config.voxelUrl || config.collisionUrl),
        ...preferences,
        progress: 0,
        inputMode: platform.mobile ? 'touch' : 'desktop',
        cameraMode: 'orbit',
        hasAnimation: false,
        animationDuration: 0,
        animationTime: 0,
        animationPaused: true,
        hasAR: false,
        hasVR: false,
        canStartAR: false,
        canStartVR: false,
        xrMode: null,
        hasCollision: false,
        hasCollisionOverlay: false,
        walkAllowed: false,
        collisionOverlayEnabled: false,
        isFullscreen: false,
        controlsHidden: false,
        selectedAnnotation: null,
        guidanceTarget: null,
        guidanceStatus: '',
        inputEnabled: true
    });

    const analytics = createAnalyticsClient({
        interactionRoot: root,
        endpoint: config.analyticsEndpoint,
        enabled: !config.noanalytics,
        sink: config.analyticsSink,
        replaySampleRate: config.analyticsReplayRate,
        posthogKey: config.posthogKey,
        posthogHost: config.posthogHost,
        posthogReplay: config.posthogReplay,
        sourceApp: 'metaflow-viewer',
        appVersion,
        releaseDisplayVersion: versionHistory.current.displayVersion,
        gitRef: versionHistory.current.gitRef,
        route: location.pathname,
        contentUrl: config.contentUrl,
        resource: config.analyticsResource,
        resourceUrls: config.analyticsResourceUrls,
        renderer: config.renderer
    });

    const global: Global = {
        app,
        settings: importedSettings,
        config,
        state,
        events,
        camera,
        renderer,
        root,
        localize,
        analytics
    };

    const primarySourceKind = classifyPrimarySource(config.contentFilename || config.contentUrl, location.href);
    const resourceComposition = getResourceComposition(config.environmentUrl);
    analytics.setStateProvider(() => ({
        loaded: state.loaded,
        loadingStage: state.loadingStage,
        inputMode: state.inputMode,
        cameraMode: state.cameraMode
    }));
    analytics.start();
    analytics.track('resource_load_started', {
        content_url: config.contentUrl,
        route_matched: config.analyticsRouteMatched,
        has_environment: !!config.environmentUrl,
        has_collision: !!(config.voxelManifestUrl || config.voxelUrl || config.collisionUrl),
        requested_renderer: config.renderer,
        primary_source_kind: primarySourceKind,
        resource_composition: resourceComposition
    });

    const analyticsPageStartedAt = Date.now();
    let analyticsLoadingStageStartedAt = analyticsPageStartedAt;
    events.on('loadingStage:changed', (stage: LoadingStage, previousStage: LoadingStage) => {
        const now = Date.now();
        analytics.track('loading_stage_changed', {
            stage,
            previous_stage: previousStage,
            stage_elapsed_ms: Math.max(0, now - analyticsLoadingStageStartedAt),
            page_elapsed_ms: Math.max(0, now - analyticsPageStartedAt),
            progress: state.progress,
            loading_mode: state.loadingMode,
            primary_source_kind: primarySourceKind,
            resource_composition: resourceComposition
        });
        analyticsLoadingStageStartedAt = now;
    });
    events.on('firstFrame', () => {
        analytics.markFirstFrame({
            primary_source_kind: primarySourceKind,
            resource_composition: resourceComposition
        });
        void analytics.flush();
    });
    events.on('cameraMode:changed', (cameraMode: string, previousCameraMode: string) => {
        analytics.track('camera_mode_changed', {
            camera_mode: cameraMode,
            previous_camera_mode: previousCameraMode
        });
    });
    events.on('performanceMode:changed', (value: boolean) => {
        analytics.track('settings_changed', {
            setting: 'performance_mode',
            value
        });
    });
    events.on('gamingControls:changed', (value: boolean) => {
        analytics.track('settings_changed', {
            setting: 'gaming_controls',
            value
        });
    });
    events.on('showAnnotations:changed', (value: boolean) => {
        analytics.track('settings_changed', {
            setting: 'show_annotations',
            value
        });
    });
    events.on('collisionOverlayEnabled:changed', (value: boolean) => {
        analytics.track('settings_changed', {
            setting: 'collision_overlay',
            value
        });
    });
    events.on('isFullscreen:changed', (value: boolean) => {
        analytics.track('fullscreen_changed', {
            is_fullscreen: value
        });
    });
    events.on('navigateTo', (_position, _normal, speedMul = 1) => {
        analytics.track('navigation_requested', {
            camera_mode: state.cameraMode,
            speed_multiplier: speedMul
        });
    });
    events.on('navigateCancel', () => {
        analytics.track('navigation_cancelled', {
            camera_mode: state.cameraMode
        });
    });
    events.on('navigateComplete', () => {
        analytics.track('navigation_completed', {
            camera_mode: state.cameraMode
        });
    });
    events.on('selectedAnnotation:changed', (selected: number | null) => {
        const annotation = selected === null ? null : global.settings.annotations[selected];
        if (!annotation) return;
        analytics.track('annotation_opened', {
            has_title: !!annotation?.title,
            has_text: !!annotation?.text
        });
    });

    const disposeCanvas = initCanvas(global);

    // start the application
    app.start();

    camera.addComponent('camera');

    // a load continuation can outlive a destroy, so anything that resumes after an await checks
    // this before touching the app
    let destroyed = false;

    const environmentLoad = config.environmentUrl ? loadEnvironment(app, config, () => destroyed) : null;
    const gsplatLoad = (async () => {
        state.loadingStage = 'detect';
        state.loadingStatus = '正在识别资源结构...';
        state.progress = 0;
        try {
            const entity = await loadGsplat(
                app,
                config,
                {
                    onProgress: (progress: number) => {
                        state.progress = progress;
                    },
                    onStatus: (status: string) => {
                        state.loadingStatus = status;
                    },
                    onMode: (mode: LoadMode) => {
                        state.loadingMode = mode;
                    },
                    onStage: (stage: LoadingStage) => {
                        state.loadingStage = stage;
                    },
                    onConflict: (conflict: boolean) => {
                        state.loadingConflict = conflict;
                    }
                },
                () => destroyed
            );
            state.loadingStage = 'prepare';
            state.loadingStatus = '主体模型已就绪，正在准备首帧...';
            state.progress = -1;
            return entity;
        } catch (err) {
            if (destroyed) throw err;
            const error = formatError(err);
            analytics.track(
                'resource_load_failed',
                {
                    loading_stage: state.loadingStage,
                    loading_mode: state.loadingMode,
                    primary_source_kind: primarySourceKind,
                    resource_composition: resourceComposition,
                    ...error
                },
                { beacon: true }
            );
            state.progress = 100;
            state.loadingStage = 'error';
            state.loadingStatus = `主体模型加载失败：${error.error_message}。请检查网络后刷新页面重试。`;
            app.autoRender = false;
            app.renderNextFrame = false;
            throw err;
        }
    })();

    // Load skybox (continue without if it fails — e.g. CORS, 404)
    const skyboxLoad =
        config.skyboxUrl &&
        loadSkybox(app, config.skyboxUrl)
            .then((asset) => {
                if (!destroyed) app.scene.envAtlas = asset.resource as Texture;
            })
            .catch((err: Error) => {
                console.warn('Failed to load skybox:', err);
            });

    const collisionLoadPlan = createCollisionLoadPlan(app, config, state);

    // Load and play sound
    let disposeAudio: (() => void) | undefined;
    if (global.settings.soundUrl) {
        const sound = new Audio(global.settings.soundUrl);
        sound.crossOrigin = 'anonymous';
        const unlock = () => {
            if (sound) {
                sound.play();
            }
        };
        root.addEventListener('click', unlock, {
            capture: true,
            once: true
        });
        disposeAudio = () => {
            root.removeEventListener('click', unlock, { capture: true });
            sound.pause();
        };
    }

    // Create the viewer
    const viewer = new Viewer(
        global,
        gsplatLoad,
        environmentLoad,
        skyboxLoad,
        collisionLoadPlan.immediate,
        collisionLoadPlan.deferred
    );
    viewer.onDestroy(persistPreferences(events));
    const handle: ViewerHandle = {
        app,
        state,
        events,
        annotations: global.settings.annotations,
        captureFrame: (captureOptions) => viewer.captureFrame(captureOptions),
        seek: (time) => viewer.seek(time),
        frameScene: () => viewer.frameScene(),
        resetCamera: () => viewer.resetCamera(),
        toggleWalk: () => viewer.toggleWalk(),
        selectAnnotation: (index) => viewer.selectAnnotation(index),
        setMoveInput: (x, z) => viewer.setMoveInput(x, z),
        requestFullscreen: () => viewer.requestFullscreen(),
        exitFullscreen: () => viewer.exitFullscreen(),
        startXR: (mode) => viewer.startXR(mode),
        endXR: () => viewer.endXR(),
        destroy: () => viewer.destroy()
    };

    viewer.onDestroy(installNavigation(global));
    // Public selection retains its explicit camera-view semantics. Built-in controls dispatch to walking navigation.
    const uiHandle: ViewerHandle = {
        ...handle,
        selectAnnotation: (index) => {
            if (state.guidanceMode) {
                if (index === null) state.selectedAnnotation = null;
                else if (navigationCapability(global.settings.annotations[index]).enabled)
                    events.fire('guidance:select', index);
                else state.selectedAnnotation = index;
                app.renderNextFrame = true;
            } else handle.selectAnnotation(index);
        }
    };
    // The built-in controls use the same observable state returned to an embedding host.
    const disposeUI = config.ui ? initUI(global, uiHandle, () => viewer.picker) : null;
    viewer.onDestroy(() => {
        destroyed = true;
    });
    viewer.onDestroy(disposeCanvas);
    viewer.onDestroy(() => analytics.stop());
    if (disposeUI) {
        viewer.onDestroy(disposeUI);
    }
    if (disposeAudio) {
        viewer.onDestroy(disposeAudio);
    }

    return handle;
};

console.log(`Metaflow Viewer v${appVersion} | SuperSplat v1.35.2 | Engine v${engineVersion} (${engineRevision})`);

export type { CaptureResult } from './capture';
export type { CreateViewerOptions, ViewerAssets, ViewerFlags } from './options';
export type { CaptureOptions, ViewerHandle, ViewerState, XrMode } from './types';
export { createViewer };
