import type { WalkPhysicsState } from '../cameras/walk-controller';
import type { Global } from '../types';

import { Arrival } from './contracts';
import type { Goal, NavigationUpdate, Region, Route, NavigationManifest, NavigationTaskState } from './contracts';
import { NavigationDrawing } from './drawing';
import { NavigationTask } from './task-state';
import { NAV_ARRIVAL_RADIUS, navigationCapability } from './nav-annotation';

export function installNavigation(global: Global): () => void {
    const { state, events, config, app, settings } = global;
    let worker: Worker | null = null,
        generation = 0,
        ready = false,
        session = 0;
    let goal: Goal | null = null,
        actual: WalkPhysicsState | null = null;
    let regions: Region[] = [],
        route: Route | null = null,
        lastSent: WalkPhysicsState | null = null;
    let pending = false,
        queryCount = 0,
        paused = false,
        destroyed = false,
        startedSession = -1;
    let manifest: NavigationManifest | null = null;
    let metadataPromise: Promise<NavigationManifest> | null = null;
    let connectedMap = '';
    const metadata = () => {
        if (manifest) return Promise.resolve(manifest);
        if (!metadataPromise)
            metadataPromise = (async () => {
                const response = await fetch(config.navigationManifestUrl);
                if (!response.ok) throw Error(`导航清单加载失败 (${response.status})`);
                const value = (await response.json()) as NavigationManifest;
                if (value.status !== 'complete') throw Error('导航覆盖尚未生成完成');
                manifest = value;
                return value;
            })().finally(() => {
                metadataPromise = null;
            });
        return metadataPromise;
    };
    const prepareMap = async () => {
        // A map-only scene needs no navigation Worker. A sidecar needs only the small manifest.
        const connect = (url: string, value?: NavigationManifest | null) => {
            if (destroyed) return;
            const expected = {
                collisionHash: value?.sourceHash,
                gaussianHash: value?.mapSource?.gaussianHash,
                transform: value?.mapSource?.transform
            };
            const identity = `${url}:${JSON.stringify(expected)}`;
            if (connectedMap === identity) return;
            connectedMap = identity;
            drawing.mapAssets(url, expected);
        };
        // Explicit visual resources must not wait behind a pending navigation request.
        if (config.navigationMapUrl && !connectedMap) connect(config.navigationMapUrl);
        try {
            const value = config.navigationManifestUrl ? await metadata() : null;
            if (destroyed) return;
            const url =
                config.navigationMapUrl ??
                (value?.mapsUrl
                    ? new URL(value.mapsUrl, new URL(config.navigationManifestUrl, location.href)).href
                    : null);
            if (!url) return;
            // Once collision provenance arrives, re-check the visual source binding.
            connect(url, value);
        } catch {
            // Explicit maps have already started. A missing sidecar stays unavailable.
        }
    };
    const arrival = new Arrival();
    const task = new NavigationTask();
    const cancellations = new Map<number, ReturnType<typeof setTimeout>>();
    const drawing = new NavigationDrawing(
        global,
        () => goal,
        (floor) => {
            if (goal && worker) {
                arrival.interrupt();
                regions = [];
                route = null;
                drawing.route(null);
                status('正在检查所选地面', 'computing');
                worker.postMessage({ type: 'floor', session, floor });
            }
        }
    );
    const present = () => {
        const waiting =
            goal && !arrival.fired && active() && actual && (actual.collision !== 'active' || !actual.grounded);
        const text =
            goal && !active()
                ? document.hidden
                    ? '导览已暂停'
                    : '返回步行模式后继续导览'
                : waiting
                  ? '等待有效碰撞和落地，随后继续寻路'
                  : task.text();
        if (state.guidanceStatus !== text) {
            state.guidanceStatus = text;
            drawing.status(text);
        }
    };
    const status = (message: string, phase: NavigationTaskState = task.state) => {
        task.set(phase, message);
        pending = phase === 'computing';
        present();
    };
    const active = () => state.guidanceMode && state.cameraMode === 'walk' && !state.xrMode && !document.hidden;
    const stopWorker = () => {
        generation++;
        cancellations.forEach(clearTimeout);
        cancellations.clear();
        startedSession = -1;
        worker?.terminate();
        worker = null;
        ready = false;
        pending = false;
    };
    const cancelSession = () => {
        if (!worker || !ready) return;
        const old = session,
            currentWorker = worker;
        worker.postMessage({ type: 'cancel', session: old });
        if (cancellations.has(old)) clearTimeout(cancellations.get(old));
        cancellations.set(
            old,
            setTimeout(() => {
                cancellations.delete(old);
                if (worker !== currentWorker) return;
                stopWorker();
                // Only cancellation has a deadline. A long search never reaches here by itself.
                if (goal && !destroyed && state.guidanceMode) void boot();
            }, 100)
        );
    };
    const cancel = () => {
        cancelSession();
        session++;
        goal = null;
        route = null;
        regions = [];
        lastSent = null;
        arrival.reset();
        state.guidanceTarget = null;
        drawing.route(null);
        drawing.regions([]);
        drawing.choices([]);
        status('', 'idle');
    };
    const startQuery = () => {
        if (!worker || !ready || !goal || !actual || !active()) return;
        if (actual.collision !== 'active' || !actual.grounded) {
            status('等待有效碰撞和落地，随后继续寻路', 'ground');
            return;
        }
        task.begin('正在寻找路线，可继续行走');
        pending = true;
        startedSession = session;
        queryCount++;
        worker.postMessage({ type: 'goal', session, goal, actual });
        status('正在寻找路线，可继续行走', 'computing');
    };
    const boot = async () => {
        if (worker || destroyed || !state.guidanceMode) return;
        if (!config.navigationManifestUrl || !config.navigationWorkerUrl) {
            status('此场景暂未提供导览', 'idle');
            return;
        }
        const mine = ++generation;
        status('正在加载导览地图', 'loading');
        try {
            manifest = await metadata();
            void prepareMap();
            if (destroyed || generation !== mine || !state.guidanceMode) return;
            worker = new Worker(config.navigationWorkerUrl, { type: 'module' });
            worker.onmessage = ({ data }: MessageEvent<NavigationUpdate>) => {
                if (destroyed || generation !== mine) return;
                if (data.type === 'cancelled') {
                    clearTimeout(cancellations.get(data.session));
                    cancellations.delete(data.session);
                    return;
                }
                if (data.type === 'ready') {
                    ready = true;
                    if (manifest) {
                        drawing.assets(manifest, config.navigationManifestUrl);
                        void prepareMap();
                    }
                    if (goal) startQuery();
                    else status('选择一个标点，开始步行导览', 'idle');
                    return;
                }
                if (data.type === 'error' && !ready) {
                    status(data.message ?? '导航资源加载失败', 'error');
                    stopWorker();
                    return;
                }
                if (data.session !== session || !goal || arrival.fired) return;
                if (data.invalidRoute) {
                    route = null;
                    drawing.route(null);
                }
                if (data.type === 'region') {
                    regions = data.regions ?? [];
                    drawing.regions(regions);
                    drawing.choices(data.choices ?? []);
                    if (!regions.length) status(data.message ?? '目标地面待确认', data.taskState ?? 'floor');
                }
                if (data.type === 'route' && data.route && !arrival.fired) {
                    route = data.route;
                    pending = false;
                    drawing.route(route);
                    status(`前往标点 ${goal.index + 1}`, 'route');
                }
                if (data.type === 'progress' && !arrival.fired)
                    status(data.message ?? '正在寻找路线，可继续行走', data.taskState ?? 'computing');
                if (data.type === 'exhausted' || data.type === 'error') {
                    pending = false;
                    if (!arrival.fired) status(data.message ?? '暂未找到路线；移动后继续寻找', data.type);
                }
                events.fire('guidance:diagnostic', { ...data, queryCount });
            };
            worker.onerror = (event) => {
                if (generation !== mine) return;
                pending = false;
                status(`导航运行错误：${event.message || 'Worker 异常'}；可点击目的地重试`, 'error');
                stopWorker();
            };
            worker.postMessage({
                type: 'init',
                manifest,
                base: new URL('.', new URL(config.navigationManifestUrl, location.href)).href
            });
        } catch (error) {
            if (generation === mine && !destroyed) status(String(error), 'error');
        }
    };
    const select = (index: number) => {
        if (!state.guidanceMode || !state.loaded || !Number.isInteger(index) || !settings.annotations[index]) return;
        if (!config.navigationManifestUrl) {
            status('此场景暂未提供导览', 'idle');
            return;
        }
        const capability = navigationCapability(settings.annotations[index]);
        if (!capability.enabled) {
            status(capability.reason || '此标识未启用导览', 'idle');
            return;
        }
        const initial = settings.annotations[index].camera?.initial;
        if (!initial) {
            cancel();
            status('此标点尚未保存观看相机', 'error');
            return;
        }
        const same = goal?.index === index;
        cancelSession();
        session++;
        if (!same) {
            arrival.reset();
            state.selectedAnnotation = null;
        }
        goal = {
            index,
            camera: { x: initial.position[0], y: initial.position[1], z: initial.position[2] },
            radius: NAV_ARRIVAL_RADIUS
        };
        state.guidanceTarget = index;
        regions = [];
        route = null;
        lastSent = null;
        drawing.route(null);
        drawing.regions([]);
        drawing.choices([]);
        // Native mode entry owns spawn/ground handling. Guidance never writes a camera pose.
        if (state.walkAllowed && state.cameraMode !== 'walk') state.cameraMode = 'walk';
        if (same && arrival.fired) {
            state.selectedAnnotation = index;
            status('已到达', 'arrived');
            return;
        }
        if (worker && ready) startQuery();
        else void boot();
    };
    const physics = (s: WalkPhysicsState) => {
        actual = s;
        drawing.pose(s);
        present();
        if (!goal || !active()) return;
        if (arrival.sample(s, goal, regions)) {
            state.selectedAnnotation = goal.index;
            route = null;
            drawing.route(null);
            pending = false;
            worker?.postMessage({ type: 'arrived', session });
            status(`已到达标点 ${goal.index + 1}`, 'arrived');
            app.renderNextFrame = true;
            events.fire('guidance:arrived', { session, index: goal.index, tick: s.tick });
        }
        if (arrival.fired || !worker || !ready) return;
        if (
            !lastSent ||
            (s.tick - lastSent.tick >= 6 &&
                (Math.hypot(s.position.x - lastSent.position.x, s.position.z - lastSent.position.z) >= 0.05 ||
                    s.collision !== lastSent.collision ||
                    s.grounded !== lastSent.grounded))
        ) {
            lastSent = s;
            worker.postMessage({ type: 'pose', session, actual: s });
        }
        if (!pending && !route && startedSession !== session) startQuery();
    };
    const pause = () => {
        paused = !active();
        arrival.interrupt();
        drawing.visible((state.guidanceMode || state.guidanceMapVisible) && !state.xrMode);
        worker?.postMessage({ type: 'pause', paused });
        present();
        if (!paused && goal && actual) {
            lastSent = null;
            if (startedSession !== session) startQuery();
            else worker?.postMessage({ type: 'pose', session, actual });
        }
    };
    const mode = () => {
        drawing.preferences();
        drawing.visible((state.guidanceMode || state.guidanceMapVisible) && !state.xrMode);
        if (!state.guidanceMode) cancel();
        else if (ready) status('选择一个标点，开始步行导览', 'idle');
        else void boot();
    };
    const timer = window.setInterval(() => {
        if (goal && !arrival.fired && active()) {
            present();
        }
    }, 500);
    const subscriptions = [
        events.on('guidance:select', select),
        events.on('guidance:cancel', cancel),
        events.on('walk:physics', physics),
        events.on('guidanceMode:changed', mode),
        events.on('guidanceMapVisible:changed', () => {
            drawing.preferences();
            drawing.visible((state.guidanceMode || state.guidanceMapVisible) && !state.xrMode);
        }),
        events.on('cameraMode:changed', pause),
        events.on('xrMode:changed', pause)
    ];
    document.addEventListener('visibilitychange', pause);
    drawing.onCancel = cancel;
    drawing.onSelect = select;
    if (config.navigationMapUrl || config.navigationManifestUrl) void prepareMap();
    mode();
    return () => {
        destroyed = true;
        clearInterval(timer);
        stopWorker();
        subscriptions.forEach((s) => s.off());
        document.removeEventListener('visibilitychange', pause);
        drawing.destroy();
    };
}
