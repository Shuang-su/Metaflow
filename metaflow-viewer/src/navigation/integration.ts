import type { WalkPhysicsState } from '../cameras/walk-controller';
import type { Global } from '../types';

import { Arrival } from './contracts';
import type { Goal, NavigationUpdate, Region, Route, NavigationManifest } from './contracts';
import { NavigationDrawing } from './drawing';

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
        queryStart = 0,
        queryCount = 0,
        paused = false,
        destroyed = false,
        startedSession = -1;
    let manifest: NavigationManifest | null = null;
    const arrival = new Arrival();
    const drawing = new NavigationDrawing(
        global,
        () => goal,
        (floor) => {
            if (goal && worker) {
                arrival.interrupt();
                regions = [];
                route = null;
                worker.postMessage({ type: 'floor', session, floor });
            }
        }
    );
    const status = (message: string) => {
        state.guidanceStatus = message;
        drawing.status(message);
    };
    const active = () => state.guidanceMode && state.cameraMode === 'walk' && !state.xrMode && !document.hidden;
    const stopWorker = () => {
        generation++;
        worker?.terminate();
        worker = null;
        ready = false;
        pending = false;
    };
    const cancel = () => {
        session++;
        goal = null;
        route = null;
        regions = [];
        lastSent = null;
        arrival.reset();
        state.guidanceTarget = null;
        stopWorker();
        drawing.route(null);
        drawing.regions([]);
        status('');
    };
    const startQuery = () => {
        if (!worker || !ready || !goal || !actual || !active()) return;
        if (actual.collision !== 'active' || !actual.grounded) {
            status('等待有效碰撞和落地，随后继续寻路');
            return;
        }
        pending = true;
        startedSession = session;
        queryStart = performance.now();
        queryCount++;
        worker.postMessage({ type: 'goal', session, goal, actual });
        status('正在寻找路线，可继续行走');
    };
    const boot = async () => {
        if (worker || destroyed || !state.guidanceMode) return;
        if (!config.navigationManifestUrl || !config.navigationWorkerUrl) {
            status('此场景暂未提供导览');
            return;
        }
        const mine = ++generation;
        status('正在加载导览地图');
        try {
            if (!manifest) {
                const res = await fetch(config.navigationManifestUrl);
                if (!res.ok) throw Error(`地图加载失败 (${res.status})`);
                manifest = await res.json() as NavigationManifest;
                if (manifest.status !== 'complete') throw Error('导航覆盖尚未生成完成');
            }
            if (destroyed || generation !== mine || !state.guidanceMode) return;
            worker = new Worker(config.navigationWorkerUrl, { type: 'module' });
            worker.onmessage = ({ data }: MessageEvent<NavigationUpdate>) => {
                if (destroyed || generation !== mine) return;
                if (data.type === 'ready') {
                    ready = true;
                    if (manifest) drawing.assets(manifest, config.navigationManifestUrl);
                    if (goal) startQuery();
                    else status('选择一个标点，开始步行导览');
                    return;
                }
                if (data.type === 'error' && !ready) {
                    status(data.message ?? '导航资源加载失败');
                    stopWorker();
                    return;
                }
                if (data.session !== session || !goal) return;
                if (data.invalidRoute) {
                    route = null;
                    drawing.route(null);
                }
                if (data.type === 'region') {
                    regions = data.regions ?? [];
                    drawing.regions(regions);
                    drawing.choices(data.choices ?? []);
                    if (!regions.length) status(data.message ?? '目标地面待确认');
                }
                if (data.type === 'route' && data.route && !arrival.fired) {
                    route = data.route;
                    pending = false;
                    drawing.route(route);
                    status(`前往标点 ${goal.index + 1} · 路线已更新`);
                }
                if (data.type === 'progress' && !arrival.fired) status(data.message ?? '仍在计算，可继续行走或取消');
                if (data.type === 'exhausted' || data.type === 'error') {
                    pending = false;
                    if (!arrival.fired) status(data.message ?? '暂未找到路线；移动后继续寻找');
                }
                events.fire('guidance:diagnostic', { ...data, queryCount });
            };
            worker.onerror = (event) => {
                if (generation !== mine) return;
                pending = false;
                status(`导航运行错误：${event.message || 'Worker 异常'}；可点击目的地重试`);
                stopWorker();
            };
            worker.postMessage({
                type: 'init',
                manifest,
                base: new URL('.', new URL(config.navigationManifestUrl, location.href)).href
            });
        } catch (error) {
            if (generation === mine && !destroyed) status(String(error));
        }
    };
    const select = (index: number) => {
        if (!state.guidanceMode || !state.loaded || !Number.isInteger(index) || !settings.annotations[index]) return;
        if (!config.navigationManifestUrl) {
            status('此场景暂未提供导览');
            return;
        }
        const initial = settings.annotations[index].camera?.initial;
        if (!initial) {
            status('此标点尚未保存观看相机');
            return;
        }
        const same = goal?.index === index;
        session++;
        if (!same) {
            arrival.reset();
            state.selectedAnnotation = null;
        }
        goal = {
            index,
            camera: { x: initial.position[0], y: initial.position[1], z: initial.position[2] },
            radius: state.guidanceRadius
        };
        state.guidanceTarget = index;
        regions = [];
        route = null;
        lastSent = null;
        drawing.route(null);
        drawing.regions([]);
        // Native mode entry owns spawn/ground handling. Guidance never writes a camera pose.
        if (state.walkAllowed && state.cameraMode !== 'walk') state.cameraMode = 'walk';
        if (same && arrival.fired) {
            state.selectedAnnotation = index;
            status('已到达');
            stopWorker();
            return;
        }
        stopWorker();
        void boot();
    };
    const physics = (s: WalkPhysicsState) => {
        actual = s;
        drawing.pose(s);
        if (!goal || !active()) return;
        if (arrival.sample(s, goal, regions)) {
            state.selectedAnnotation = goal.index;
            route = null;
            drawing.route(null);
            pending = false;
            worker?.postMessage({ type: 'arrived', session });
            status(`已到达标点 ${goal.index + 1}`);
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
        drawing.visible(state.guidanceMode && !state.xrMode);
        worker?.postMessage({ type: 'pause', paused });
        if (goal && paused) status(document.hidden ? '导览已暂停' : '返回步行模式后继续导览');
        else if (goal && actual) {
            lastSent = null;
            worker?.postMessage({ type: 'pose', session, actual });
        }
    };
    const radius = () => {
        if (state.guidanceRadius !== 2 && state.guidanceRadius !== 3) {
            state.guidanceRadius = 2;
            return;
        }
        if (goal) {
            goal.radius = state.guidanceRadius;
            session++;
            regions = [];
            arrival.interrupt();
            route = null;
            drawing.route(null);
            if (!arrival.fired) startQuery();
        }
        drawing.preferences();
    };
    const mode = () => {
        drawing.preferences();
        drawing.visible(state.guidanceMode);
        if (!state.guidanceMode) cancel();
        else void boot();
    };
    const timer = window.setInterval(() => {
        if (pending && goal && !arrival.fired && active()) {
            const elapsed = performance.now() - queryStart;
            if (elapsed > 5000) status('仍在计算，可继续行走或取消');
            else if (elapsed > 1000) status('正在寻找路线，可继续行走');
        }
    }, 500);
    const subscriptions = [
        events.on('guidance:select', select),
        events.on('guidance:cancel', cancel),
        events.on('walk:physics', physics),
        events.on('guidanceMode:changed', mode),
        events.on('guidanceRadius:changed', radius),
        events.on('cameraMode:changed', pause),
        events.on('xrMode:changed', pause)
    ];
    document.addEventListener('visibilitychange', pause);
    drawing.onCancel = cancel;
    drawing.onSelect = select;
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
