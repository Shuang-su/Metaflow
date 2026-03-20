import '@playcanvas/web-components';
import {
    Asset,
    Entity,
    EventHandler,
    type Texture,
    type AppBase,
    platform,
    revision as engineRevision,
    version as engineVersion
} from 'playcanvas';

import { observe } from './core/observe';
import { importSettings } from './settings';
import type { Config, Global, LoadMode, LoadingStage } from './types';
import { initPoster, initUI } from './ui';
import { Viewer } from './viewer';
import { initXr } from './xr';
import { version as appVersion } from '../package.json';

interface LoadCallbacks {
    onProgress: (progress: number) => void;  // 0-99 for determinate, -1 for indeterminate
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

    // Additional weak hints are only used when paired with stronger signals.
    const hasWeakHints = (
        typeof root.chunkCount === 'number' ||
        Array.isArray(root.chunks) ||
        Array.isArray(root.nodes)
    );

    // Structure-first, but conservative to avoid false positives on generic JSON payloads.
    if (hasCoreLodArrays || hasStrongStreamingShape) return true;
    if (hasCoreNumericHints && hasWeakHints) return true;
    return false;
};

const loadGsplat = async (app: AppBase, config: Config, callbacks: LoadCallbacks, forceUnified = false) => {
    const { contents, contentUrl, unified, aa } = config;
    const c = contents as unknown as ArrayBuffer;
    const filename = new URL(contentUrl, location.href).pathname.split('/').pop() || '';
    const lowerFilename = filename.toLowerCase();
    const isJsonFile = lowerFilename.endsWith('.json');
    const data = isJsonFile ? await (await contents).json() : undefined;
    const streamingByStructure = detectStreamingLodByStructure(data);
    const streamingByName = lowerFilename === 'meta.json' || lowerFilename.endsWith('lod-meta.json');
    const hasStructurePayload = !!(data && typeof data === 'object');
    const loadMode: LoadMode = hasStructurePayload
        ? (streamingByStructure ? 'streaming-json' : 'legacy-sog')
        : (streamingByName ? 'streaming-json' : 'legacy-sog');
    callbacks.onConflict(false);

    // Conflict reporting: structure-first, filename-second. We surface mismatches immediately.
    if (isJsonFile && streamingByStructure !== streamingByName) {
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
            // Use unified mode when: explicitly set, LOD file, or forced (when environment exists)
            const useUnified = forceUnified || unified || lowerFilename.endsWith('lod-meta.json');
            entity.addComponent('gsplat', {
                unified: useUnified,
                asset
            });
            const material = useUnified ? app.scene.gsplat.material : entity.gsplat.material;
            material.setDefine('GSPLAT_AA', aa);
            material.setParameter('alphaClip', 1 / 255);
            app.root.addChild(entity);
            callbacks.onStatus('模型 GPU 资源已就绪，等待渲染准备...');
            resolve(entity);
        });

        // PLY parsing milestone: fires when data is parsed, before GPU resource creation
        asset.on('load:data', (data: any) => {
            callbacks.onStage('parse');
            const numSplats = data?.numSplats;
            if (numSplats) {
                callbacks.onStatus(`已解析 ${formatSplats(numSplats)} 个高斯点，正在创建 GPU 资源...`);
            } else {
                callbacks.onStatus('正在解析模型结构数据...');
            }
        });

        let watermark = 0;
        let isCached = false;
        let progressEventCount = 0;
        asset.on('progress', (received, length) => {
            progressEventCount++;
            callbacks.onStage('download');

            // Detect cached content: length is 0 or undefined
            if (!length || length <= 0) {
                if (!isCached) {
                    isCached = true;
                    callbacks.onProgress(-1); // indeterminate
                }
                // Still show received bytes even when cached
                callbacks.onStatus(`正在解析模型数据 ${formatSize(received)}`);
                return;
            }

            // Determinate progress: cap at 99%, 100% reserved for post-processing
            const progress = Math.min(0.99, received / length) * 100;
            if (progress > watermark) {
                watermark = progress;
                callbacks.onProgress(Math.trunc(watermark));
            }

            // Update status with download size details
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

// Load environment gsplat (background/scene)
const loadEnvironment = async (app: AppBase, config: Config) => {
    const { environmentContents, environmentUrl, aa, unified } = config;
    if (!environmentUrl || !environmentContents) return null;

    const c = environmentContents as unknown as ArrayBuffer;
    const filename = new URL(environmentUrl, location.href).pathname.split('/').pop();
    const asset = new Asset(filename, 'gsplat', { url: environmentUrl, filename, contents: c });

    return new Promise<Entity>((resolve, reject) => {
        asset.on('load', () => {
            const entity = new Entity('environment');
            entity.setLocalEulerAngles(0, 0, 180);
            entity.addComponent('gsplat', {
                // Use unified mode for global sorting with main model
                unified: true,
                asset
            });
            // In unified mode, material is shared via app.scene.gsplat.material
            // No need to set material here as it's set by the main model
            app.root.addChild(entity);
            resolve(entity);
        });

        asset.on('error', (err) => {
            console.error('Environment load error:', err);
            resolve(null); // Don't reject, environment is optional
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

        asset.on('load', () => {
            resolve(asset);
        });

        asset.on('error', (err) => {
            console.error(err);
            reject(err);
        });

        app.assets.add(asset);
        app.assets.load(asset);
    });
};

const main = (app: AppBase, camera: Entity, settingsJson: any, config: Config) => {
    const events = new EventHandler();

    const state = observe(events, {
        loaded: false,
        readyToRender: false,
        retinaDisplay: platform.mobile ? localStorage.getItem('retinaDisplay') === 'true' : localStorage.getItem('retinaDisplay') !== 'false',
        hqMode: true,
        loadingMode: 'legacy-sog',
        loadingStage: 'init',
        loadingConflict: false,
        progress: 0,
        loadingStatus: '',
        inputMode: platform.mobile ? 'touch' : 'desktop',
        cameraMode: 'orbit',
        hasAnimation: false,
        animationDuration: 0,
        animationTime: 0,
        animationPaused: true,
        hasAR: false,
        hasVR: false,
        isFullscreen: false,
        controlsHidden: false
    });

    const global: Global = {
        app,
        settings: importSettings(settingsJson),
        config,
        state,
        events,
        camera
    };

    // Initialize the load-time poster
    if (config.poster) {
        initPoster(events);
    }

    camera.addComponent('camera');

    // Initialize XR support
    initXr(global);

    // Initialize user interface
    initUI(global);

    // Set initial loading status after UI is ready
    state.loadingStage = 'init';
    state.loadingStatus = '正在初始化...';

    // Determine if we need unified mode (required when loading multiple gsplats)
    const hasEnvironment = !!config.environmentUrl;

    // Load environment first (background gsplat - renders behind main model)
    const environmentLoad = hasEnvironment && loadEnvironment(app, config);

    // Load main model after environment
    const gsplatLoad = (async () => {
        // Wait for environment to load first if it exists
        if (environmentLoad) {
            state.loadingStage = 'environment';
            state.loadingStatus = '正在加载环境...';
            state.progress = -1; // indeterminate
            await environmentLoad;
            state.loadingStatus = '环境加载完成，准备加载主体模型...';
        }
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
            },
            hasEnvironment  // Force unified mode when environment exists
        );
        // Model data downloaded and parsed by engine
        state.loadingStage = 'prepare';
        state.loadingStatus = '正在准备渲染...';
        state.progress = -1; // indeterminate while waiting for sorting
        return entity;
    })();

    // Load skybox
    const skyboxLoad = config.skyboxUrl &&
        loadSkybox(app, config.skyboxUrl).then((asset) => {
            app.scene.envAtlas = asset.resource as Texture;
        });

    // Load and play sound
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

    // Create the viewer
    return new Viewer(global, gsplatLoad, skyboxLoad);
};

console.log(
    `Metaflow Viewer v${appVersion} | ` +
    `Base SSV v1.11.1 (PlayCanvas 2.15.2) | ` +
    `Upstream SSV v1.18.2 (PlayCanvas 2.17.1) | ` +
    `Engine v${engineVersion} (${engineRevision})`
);

export { main };
