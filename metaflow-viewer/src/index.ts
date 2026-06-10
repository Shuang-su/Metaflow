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
    type Texture,
    type TextureHandler,
    type AppBase,
    revision as engineRevision,
    version as engineVersion
} from 'playcanvas';

import { App } from './app';
import { MeshCollision, loadTiledVoxelCollision, loadVoxelCollision } from './collision';
import type { Collision } from './collision';
import { observe } from './core/observe';
import { initLocalization } from './localization';
import { importSettings } from './settings';
import type { Config, Global, LoadMode, LoadingStage } from './types';
import { initPoster, initUI } from './ui';
import { Viewer } from './viewer';
import { initXr } from './xr';
import versionHistory from '../../metadata/version-history.json';
import { version as appVersion } from '../package.json';

interface LoadCallbacks {
    onProgress: (progress: number) => void;
    onStatus: (status: string) => void;
    onMode: (mode: LoadMode) => void;
    onStage: (stage: LoadingStage) => void;
    onConflict: (conflict: boolean) => void;
}

const formatSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatSplats = (n: number) => n >= 10000 ? `${(n / 10000).toFixed(1)} 万` : `${n}`;

const detectStreamingLodByStructure = (data: any) => {
    if (!data || typeof data !== 'object') return false;

    const root = data as Record<string, any>;
    const meta = (root.meta && typeof root.meta === 'object') ? root.meta : undefined;
    const octree = (root.octree && typeof root.octree === 'object') ? root.octree : undefined;
    const stream = (root.stream && typeof root.stream === 'object') ? root.stream : undefined;

    const hasCoreLodArrays = (
        Array.isArray(root.lods) ||
        Array.isArray(root.levels) ||
        Array.isArray(meta?.lods) ||
        Array.isArray(meta?.levels)
    );

    const hasCoreNumericHints = (
        typeof root.lodCount === 'number' ||
        typeof root.maxLod === 'number' ||
        typeof root.minLod === 'number' ||
        typeof meta?.lodCount === 'number' ||
        typeof octree?.lodLevels === 'number'
    );

    const hasStrongStreamingShape = (
        typeof octree === 'object' &&
        (
            typeof octree?.lodLevels === 'number' ||
            Array.isArray(octree?.nodes)
        )
    ) || (
        typeof stream === 'object' &&
        (
            typeof stream?.chunkCount === 'number' ||
            Array.isArray(stream?.chunks)
        )
    );

    const hasWeakHints = (
        typeof root.chunkCount === 'number' ||
        Array.isArray(root.chunks) ||
        Array.isArray(root.nodes)
    );

    if (hasCoreLodArrays || hasStrongStreamingShape) return true;
    if (hasCoreNumericHints && hasWeakHints) return true;
    return false;
};

const loadGsplat = async (app: AppBase, config: Config, callbacks: LoadCallbacks) => {
    const { contents, contentUrl, aa } = config;
    const c = contents as unknown as ArrayBuffer;
    const filename = new URL(contentUrl, location.href).pathname.split('/').pop() || '';
    const lowerFilename = filename.toLowerCase();
    const isJsonFile = lowerFilename.endsWith('.json');
    const data = isJsonFile ? await (await contents).json() : undefined;
    const streamingByStructure = detectStreamingLodByStructure(data);
    const streamingByName = lowerFilename === 'meta.json' || lowerFilename.endsWith('lod-meta.json');
    const hasStructurePayload = !!(data && typeof data === 'object');
    const loadMode: LoadMode = streamingByName
        ? 'streaming-json'
        : (hasStructurePayload && streamingByStructure ? 'streaming-json' : 'legacy-sog');

    callbacks.onConflict(false);
    if (isJsonFile && streamingByName && !streamingByStructure) {
        console.info('[Loader] 已按文件名强制使用流式 LOD 入口', {
            filename,
            streamingByStructure,
            decision: 'streaming-json(文件名优先)'
        });
    } else if (isJsonFile && hasStructurePayload && streamingByStructure !== streamingByName) {
        callbacks.onConflict(true);
        const decision = streamingByStructure ? 'streaming-json(结构优先)' : 'legacy-sog(结构优先)';
        console.warn('[Loader] 资源识别冲突: 结构特征与文件名不一致', {
            filename,
            streamingByStructure,
            streamingByName,
            decision
        });
        callbacks.onStatus(`资源识别冲突，已采用 ${decision}`);
    }

    callbacks.onMode(loadMode);
    callbacks.onStage('detect');
    callbacks.onStatus(loadMode === 'streaming-json' ? '已识别流式 LOD 资源，准备加载索引...' : '已识别传统 SOG 资源，准备加载模型...');

    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data);

    return new Promise<Entity>((resolve, reject) => {
        asset.on('load', () => {
            callbacks.onStage('gpu');
            const entity = new Entity('gsplat');
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
            callbacks.onStatus(numSplats ?
                `已解析 ${formatSplats(numSplats)} 个高斯点，正在创建 GPU 资源...` :
                '正在解析模型结构数据...');
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

const loadEnvironment = async (app: AppBase, config: Config) => {
    const { environmentContents, environmentUrl } = config;
    if (!environmentUrl || !environmentContents) return null;

    const c = environmentContents as unknown as ArrayBuffer;
    const filename = new URL(environmentUrl, location.href).pathname.split('/').pop();
    const asset = new Asset(filename, 'gsplat', { url: environmentUrl, filename, contents: c });

    return new Promise<Entity | null>((resolve) => {
        asset.on('load', () => {
            const entity = new Entity('environment');
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
        const asset = new Asset('skybox', 'texture', {
            url
        }, {
            type: 'rgbp',
            mipmaps: false,
            addressu: 'repeat',
            addressv: 'clamp'
        });

        asset.on('load', () => resolve(asset));
        asset.on('error', (err) => reject(err));

        app.assets.add(asset);
        app.assets.load(asset);
    });
};

const createApp = async (canvas: HTMLCanvasElement, config: Config) => {
    const useWebGPU = config.renderer === 'webgpu';

    const device = await createGraphicsDevice(canvas, {
        deviceTypes: useWebGPU ? ['webgpu'] : [],
        // Metaflow gradient backgrounds are composited behind the transparent
        // canvas. Keep requesting an alpha backbuffer when using the newer
        // createGraphicsDevice path.
        alpha: true,
        antialias: false,
        depth: true,
        stencil: false,
        xrCompatible: true,
        powerPreference: 'high-performance'
    } as Parameters<typeof createGraphicsDevice>[1] & { alpha: boolean });

    console.log(`Renderer: ${device.deviceType}`);

    const renderer: 'webgl' | 'webgpu' = device.deviceType === 'webgpu' ? 'webgpu' : 'webgl';
    device.maxPixelRatio = window.devicePixelRatio;

    const app = new App(canvas, {
        graphicsDevice: device,
        mouse: new Mouse(canvas),
        touch: new TouchDevice(canvas),
        keyboard: new Keyboard(window)
    });

    (app.loader.getHandler('texture') as TextureHandler).imgParser.crossOrigin = 'anonymous';

    const cameraRoot = new Entity('camera root');
    app.root.addChild(cameraRoot);

    const camera = new Entity('camera');
    cameraRoot.addChild(camera);

    const light = new Entity('light');
    light.setEulerAngles(35, 45, 0);
    light.addComponent('light', {
        color: new Color(1.0, 0.98, 0.957),
        intensity: 1
    });
    app.root.addChild(light);

    app.scene.ambientLight.set(0.51, 0.55, 0.65);

    return { app, camera, renderer };
};

const initCanvas = (global: Global) => {
    const { app, events, state } = global;
    const { canvas } = app.graphicsDevice;

    const maxPixelDim = platform.mobile ? 1080 : 2160;
    const calcPixelRatio = () => Math.min(maxPixelDim / Math.min(screen.width, screen.height), window.devicePixelRatio);
    const deviceSize = { width: 0, height: 0 };

    const set = (width: number, height: number) => {
        const ratio = calcPixelRatio();
        deviceSize.width = width * ratio;
        deviceSize.height = height * ratio;
    };

    const apply = () => {
        if (app.xr?.active) return;

        const s = state.performanceMode ? 0.5 : 1.0;
        const w = Math.ceil(deviceSize.width * s);
        const h = Math.ceil(deviceSize.height * s);
        if (w !== canvas.width || h !== canvas.height) {
            canvas.width = w;
            canvas.height = h;
        }
    };

    const resizeObserver = new ResizeObserver((entries: ResizeObserverEntry[]) => {
        const e = entries[0]?.contentBoxSize?.[0];
        if (e) {
            set(e.inlineSize, e.blockSize);
            app.renderNextFrame = true;
        }
    });
    resizeObserver.observe(canvas);

    events.on('performanceMode:changed', () => {
        app.renderNextFrame = true;
    });

    app.on('framerender', apply);

    // @ts-ignore
    app._allowResize = false;
    set(canvas.clientWidth, canvas.clientHeight);
    apply();
};

type CollisionLoadPlan = {
    immediate?: Promise<Collision | null>;
    deferred?: () => Promise<Collision | null>;
};

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

const main = async (canvas: HTMLCanvasElement, settingsJson: any, config: Config) => {
    const { app, camera, renderer } = await createApp(canvas, config);
    const events = new EventHandler();

    const legacyRetina = localStorage.getItem('retinaDisplay');
    if (legacyRetina !== null && localStorage.getItem('performanceMode') === null) {
        localStorage.setItem('performanceMode', String(legacyRetina === 'false'));
        localStorage.removeItem('retinaDisplay');
    }
    const storedPerformanceMode = localStorage.getItem('performanceMode');

    const state = observe(events, {
        loaded: false,
        readyToRender: false,
        performanceMode: storedPerformanceMode !== null ? storedPerformanceMode === 'true' : platform.mobile,
        progress: 0,
        loadingMode: 'legacy-sog',
        loadingStage: 'init',
        loadingConflict: false,
        loadingStatus: '',
        inputMode: platform.mobile ? 'touch' : 'desktop',
        cameraMode: 'orbit',
        hasAnimation: false,
        animationDuration: 0,
        animationTime: 0,
        animationPaused: true,
        hasAR: false,
        hasVR: false,
        hasCollision: false,
        hasCollisionOverlay: false,
        walkCapability: !!(config.voxelManifestUrl || config.voxelUrl || config.collisionUrl),
        walkAllowed: false,
        collisionOverlayEnabled: false,
        isFullscreen: false,
        controlsHidden: false,
        gamingControls: localStorage.getItem('gamingControls') === 'true'
    });

    const global: Global = {
        app,
        settings: importSettings(settingsJson),
        config,
        state,
        events,
        camera,
        renderer
    };

    initCanvas(global);
    app.start();

    if (config.poster) {
        initPoster(events);
    }

    camera.addComponent('camera');
    initXr(global);
    initLocalization();
    initUI(global);

    state.loadingStage = 'renderer';
    state.loadingStatus = renderer === 'webgpu' ? '渲染器已初始化：WebGPU' : '渲染器已初始化：WebGL';

    const hasEnvironment = !!config.environmentUrl;
    const environmentLoad = hasEnvironment ? loadEnvironment(app, config) : null;
    if (environmentLoad) {
        state.loadingStage = 'environment';
        state.loadingStatus = '正在加载环境模型...';
        environmentLoad.then((entity) => {
            if (entity) {
                console.info('[Environment] 环境模型已并行挂载');
            }
        });
    }

    const gsplatLoad = (async () => {
        state.loadingStage = 'detect';
        state.loadingStatus = '正在识别资源结构...';
        state.progress = 0;
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
            }
        );
        state.loadingStage = 'prepare';
        state.loadingStatus = '主体模型已就绪，正在准备首帧...';
        state.progress = -1;
        return entity;
    })();

    const skyboxLoad = config.skyboxUrl &&
        loadSkybox(app, config.skyboxUrl).then((asset) => {
            app.scene.envAtlas = asset.resource as Texture;
        }).catch((err: Error) => {
            console.warn('Failed to load skybox:', err);
        });

    const collisionLoadPlan = createCollisionLoadPlan(app, config, state);

    if (global.settings.soundUrl) {
        const sound = new Audio(global.settings.soundUrl);
        sound.crossOrigin = 'anonymous';
        document.body.addEventListener('click', () => {
            if (sound) {
                sound.play();
            }
        }, {
            capture: true,
            once: true
        });
    }

    return new Viewer(
        global,
        gsplatLoad,
        skyboxLoad,
        collisionLoadPlan.immediate,
        collisionLoadPlan.deferred
    );
};

console.log(
    `Metaflow Viewer ${versionHistory.current.displayVersion} ` +
    `(semver ${appVersion}, index schema ${versionHistory.current.indexSchemaVersion}) | ` +
    `Metaflow fork synced toward SSV v1.26.2 (PlayCanvas 2.19.2) | ` +
    `Engine v${engineVersion} (${engineRevision})`
);

export { main };
