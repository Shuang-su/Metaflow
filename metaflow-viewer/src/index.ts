import '@playcanvas/web-components';
import {
    Asset,
    Entity,
    EventHandler,
    type Texture,
    type AppBase,
    revision as engineRevision,
    version as engineVersion
} from 'playcanvas';

import { observe } from './core/observe';
import { importSettings } from './settings';
import type { Config, Global } from './types';
import { initPoster, initUI } from './ui';
import { Viewer } from './viewer';
import { initXr } from './xr';
import { version as appVersion } from '../package.json';

interface LoadCallbacks {
    onProgress: (progress: number) => void;  // 0-99 for determinate, -1 for indeterminate
    onStatus: (status: string) => void;
}

const loadGsplat = async (app: AppBase, config: Config, callbacks: LoadCallbacks, forceUnified = false) => {
    const { contents, contentUrl, unified, aa } = config;
    const c = contents as unknown as ArrayBuffer;
    const filename = new URL(contentUrl, location.href).pathname.split('/').pop();
    const data = filename.toLowerCase() === 'meta.json' ? await (await contents).json() : undefined;
    const asset = new Asset(filename, 'gsplat', { url: contentUrl, filename, contents: c }, data);

    return new Promise<Entity>((resolve, reject) => {
        asset.on('load', () => {
            const entity = new Entity('gsplat');
            entity.setLocalEulerAngles(0, 0, 180);
            // Use unified mode when: explicitly set, LOD file, or forced (when environment exists)
            const useUnified = forceUnified || unified || filename.toLowerCase().endsWith('lod-meta.json');
            entity.addComponent('gsplat', {
                unified: useUnified,
                asset
            });
            const material = useUnified ? app.scene.gsplat.material : entity.gsplat.material;
            material.setDefine('GSPLAT_AA', aa);
            material.setParameter('alphaClip', 1 / 255);
            app.root.addChild(entity);
            resolve(entity);
        });

        let watermark = 0;
        let isCached = false;
        let progressEventCount = 0;
        asset.on('progress', (received, length) => {
            progressEventCount++;

            // Detect cached content: length is 0 or undefined
            if (!length || length <= 0) {
                if (!isCached) {
                    isCached = true;
                    callbacks.onStatus('正在加载模型...');
                    callbacks.onProgress(-1); // indeterminate
                }
                return;
            }

            // Determinate progress: cap at 99%, 100% reserved for post-processing
            const progress = Math.min(0.99, received / length) * 100;
            if (progress > watermark) {
                watermark = progress;
                callbacks.onProgress(Math.trunc(watermark));
            }
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
        readyToRender: false,
        hqMode: true,
        progress: 0,
        loadingStatus: '',
        inputMode: 'desktop',
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
    state.loadingStatus = '正在初始化...';

    // Determine if we need unified mode (required when loading multiple gsplats)
    const hasEnvironment = !!config.environmentUrl;

    // Load environment first (background gsplat - renders behind main model)
    const environmentLoad = hasEnvironment && loadEnvironment(app, config);

    // Load main model after environment
    const gsplatLoad = (async () => {
        // Wait for environment to load first if it exists
        if (environmentLoad) {
            state.loadingStatus = '正在加载环境...';
            state.progress = -1; // indeterminate
            await environmentLoad;
        }
        state.loadingStatus = '正在下载模型...';
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
                }
            },
            hasEnvironment  // Force unified mode when environment exists
        );
        // Model data downloaded and parsed by engine
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

console.log(`SuperSplat Viewer v${appVersion} | Engine v${engineVersion} (${engineRevision})`);

export { main };
