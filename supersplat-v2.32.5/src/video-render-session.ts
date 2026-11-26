import { Mat4, Vec3, type GraphicsDevice } from 'playcanvas';

import type { Scene } from './scene';
import type { Splat } from './splat';
import type { TweenValue } from './tween-value';

const waitForVideoEvent = (
    subscribe: (done: () => void) => { off(): void },
    signal: AbortSignal,
    start: () => void,
    label: string,
    timeoutMs = 30000
) => new Promise<void>((resolve, reject) => {
    signal.throwIfAborted();
    const resources: { handle?: { off(): void }; timer?: ReturnType<typeof setInterval>; abort?: () => void } = {};
    let elapsed = 0;
    let last = performance.now();
    let finished = false;
    const finish = (error?: unknown) => {
        if (finished) return;
        finished = true;
        resources.handle?.off();
        clearInterval(resources.timer);
        signal.removeEventListener('abort', resources.abort);
        if (error) reject(error);
        else resolve();
    };
    resources.abort = () => finish(signal.reason);
    resources.handle = subscribe(() => finish());
    if (finished) {
        resources.handle.off(); return;
    }
    signal.addEventListener('abort', resources.abort, { once: true });
    resources.timer = setInterval(() => {
        const now = performance.now();
        // A background tab can pause RAF. Waiting is allowed; skipping output
        // frames is not. Cancellation remains responsive while hidden.
        if (!document.hidden) elapsed += now - last;
        last = now;
        if (elapsed >= timeoutMs) finish(new Error(`${label} timed out`));
    }, 250);
    try {
        start();
    } catch (error) {
        finish(error);
    }
});

const awaitVideoTask = <T>(task: Promise<T>, signal: AbortSignal): Promise<T> => new Promise((resolve, reject) => {
    let elapsed = 0;
    let last = performance.now();
    const timer = setInterval(() => {
        const now = performance.now();
        if (typeof document === 'undefined' || !document.hidden) elapsed += now - last;
        last = now;
        if (elapsed >= 30000) {
            clearInterval(timer);
            reject(new Error('Video rendering/encoding operation timed out; retry the whole video'));
        }
    }, 250);
    const abort = () => {
        clearInterval(timer); reject(signal.reason);
    };
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
    // Always consume the task, including a late rejection after cancellation.
    task.then(resolve, reject).finally(() => {
        clearInterval(timer);
        signal.removeEventListener('abort', abort);
    });
});

const waitForVideoEncoder = (encoder: VideoEncoder, signal: AbortSignal) => waitForVideoEvent((done) => {
    encoder.addEventListener('dequeue', done, { once: true });
    return { off: () => encoder.removeEventListener('dequeue', done) };
}, signal, () => {}, 'Video encoder backpressure');

// Browser I/O can stop responding. Restore the Editor even then, while still
// consuming the late settlement of the already-aborted destination transaction.
const finishVideoCleanup = async (task: Promise<unknown>) => {
    let timer: ReturnType<typeof setTimeout>;
    try {
        await Promise.race([task, new Promise((resolve, reject) => {
            timer = setTimeout(() => reject(new Error('The browser did not finish cancelling the video file write')), 5000);
        })]);
    } finally {
        clearTimeout(timer);
    }
};

type Sorter = Splat['entity']['gsplat']['instance']['sorter'];
type Instance = Splat['entity']['gsplat']['instance'];
type SortRecord = { splat: Splat; original: Sorter; temporary: Sorter };
const sortSessions = new WeakMap<Scene, Map<Instance, SortRecord>>();

// A dedicated upstream sorter avoids accepting a late realtime-sort event as
// this output frame's result. Each capture request sends centers AND camera in
// one worker message; recycling the order buffer cannot start an older sort.
// This adapter is pinned to the PlayCanvas 2.21.4 worker protocol.
const beginVideoSortSession = (scene: Scene) => {
    if (sortSessions.has(scene)) throw new Error('Video sorting is already active');
    const originals = new Map<Instance, SortRecord>();
    sortSessions.set(scene, originals);
    const replaced = scene.events.on('splat.replaced', (splat: Splat) => {
        // A PLY sequence keeps its Splat but replaces its underlying instance.
        // That entity's teardown owns the temporary sorter; retire our detached
        // original instead of restoring an earlier frame's data into a new one.
        for (const [instance, record] of originals) {
            if (record.splat === splat && instance !== splat.entity.gsplat.instance) {
                record.original.destroy();
                originals.delete(instance);
            }
        }
    });
    return () => {
        sortSessions.delete(scene);
        replaced.off();
        for (const [instance, { splat, original, temporary }] of originals) {
            if (splat.entity?.gsplat?.instance === instance && instance.sorter === temporary) {
                temporary.destroy();
                instance.sorter = original;
                instance.lastCameraPosition.set(NaN, NaN, NaN);
                instance.sort(scene.camera.mainCamera);
            } else {
                original.destroy();
            }
        }
        originals.clear();
        scene.forceRender = true;
    };
};

const videoSorter = (scene: Scene, splat: Splat) => {
    const originals = sortSessions.get(scene);
    if (!originals) throw new Error('Video sorting session is not active');
    const instance = splat.entity.gsplat.instance;
    if (!originals.has(instance)) {
        const original = instance.sorter;
        const Constructor = original.constructor as new (device: GraphicsDevice) => Sorter;
        const sorter = new Constructor(scene.graphicsDevice);
        sorter.init(original.target, original.orderData.byteLength / 4, original.centers.slice(), undefined);
        originals.set(instance, { splat, original, temporary: sorter });
        instance.sorter = sorter;
    }
    return instance.sorter;
};

const sortVideoSplats = (scene: Scene, splats: Splat[], signal: AbortSignal) => Promise.all(splats.filter(s => s.numSplats > 0).map((splat) => {
    const { instance } = splat.entity.gsplat;
    const sorter = videoSorter(scene, splat);
    const state = splat.splatData.getProp('state') as Uint8Array;
    const mapping = splat.numDeleted ? Uint32Array.from(state.keys()).filter(i => (state[i] & 4) === 0) : null;
    const centers = mapping ? new Float32Array(mapping.length * 3) : sorter.centers.slice();
    if (mapping) for (let i = 0; i < mapping.length; ++i) centers.set(sorter.centers.subarray(mapping[i] * 3, mapping[i] * 3 + 3), i * 3);
    const inverse = new Mat4().invert(instance.meshInstance.node.getWorldTransform());
    const camera = scene.camera.mainCamera.getWorldTransform();
    const position = inverse.transformPoint(camera.getTranslation(new Vec3()));
    const direction = inverse.transformVector(camera.getZ(new Vec3()));
    instance.lastCameraPosition.copy(position);
    instance.lastCameraDirection.copy(direction);
    return waitForVideoEvent(done => sorter.once('updated', done), signal, () => {
        sorter.worker.postMessage({
            centers: centers.buffer,
            mapping: mapping?.buffer ?? null,
            cameraPosition: { x: position.x, y: position.y, z: position.z },
            cameraDirection: { x: direction.x, y: direction.y, z: direction.z }
        }, mapping ? [centers.buffer, mapping.buffer] : [centers.buffer]);
    }, 'Gaussian sorting');
}));

const nextVideoFrame = (scene: Scene, signal: AbortSignal) => waitForVideoEvent(
    done => scene.events.once('postrender', done), signal, () => {
        scene.lockedRender = true;
    }, 'Scene rendering'
);

// Capture every field export touches, including current tween values rather
// than only the document's target pose. Selection/state textures are not edited.
const freezeEditorForVideo = (scene: Scene) => {
    const { camera, events } = scene;
    const tweenState = (tween: TweenValue) => ({
        value: { ...tween.value },
        source: { ...tween.source },
        target: { ...tween.target },
        timer: tween.timer,
        transitionTime: tween.transitionTime
    });
    const saved = {
        frame: events.invoke('timeline.frame'),
        playing: events.invoke('timeline.playing'),
        selection: events.invoke('selection'),
        tweens: [camera.focalPointTween, camera.azimElevTween, camera.distanceTween].map(tweenState),
        fov: camera.fov,
        ortho: camera.ortho,
        look: camera.lookCameraPos?.clone() ?? null,
        pose: camera.poseOverride,
        display: camera.displayTransform.clone(),
        target: camera.targetSizeOverride,
        final: camera.finalPass.enabled,
        captureMode: camera.captureMode,
        overlays: camera.renderOverlays,
        gizmo: scene.gizmoLayer.enabled,
        clearValue: camera.clearPass.colorOps.clearValue.clone(),
        clear: camera.clearPass.colorOps.clear,
        lockedMode: scene.lockedRenderMode,
        locked: scene.lockedRender,
        force: scene.forceRender
    };
    events.fire('timeline.setPlaying', false);
    camera.captureMode = true;
    let restored = false;
    return (forceRender = true) => {
        if (restored) return;
        restored = true;
        events.fire('timeline.setFrame', saved.frame);
        events.fire('timeline.time', saved.frame);
        [camera.focalPointTween, camera.azimElevTween, camera.distanceTween].forEach((tween, i) => {
            const state = saved.tweens[i];
            Object.assign(tween.value, state.value);
            Object.assign(tween.source, state.source);
            Object.assign(tween.target, state.target);
            tween.timer = state.timer;
            tween.transitionTime = state.transitionTime;
        });
        camera.poseOverride = saved.pose;
        camera.fov = saved.fov;
        camera.ortho = saved.ortho;
        camera.lookCameraPos = saved.look;
        camera.targetSizeOverride = saved.target;
        camera.finalPass.enabled = saved.final;
        try {
            camera.rebuildRenderTargets();
            camera.onUpdate(0);
        } finally {
            // Restore interaction flags even if the GPU is unavailable while
            // rebuilding targets. Normal rendering resumes after device recovery.
            camera.lookCameraPos = saved.look;
            camera.displayTransform.copy(saved.display);
            camera.renderOverlays = saved.overlays;
            scene.gizmoLayer.enabled = saved.gizmo;
            camera.clearPass.colorOps.clearValue.copy(saved.clearValue);
            camera.clearPass.colorOps.clear = saved.clear;
            camera.captureMode = saved.captureMode;
            scene.lockedRenderMode = saved.lockedMode;
            scene.lockedRender = saved.locked;
            scene.forceRender = forceRender || saved.force;
            if (events.invoke('selection') !== saved.selection) events.fire('selection', saved.selection);
            events.fire('timeline.setPlaying', saved.playing);
        }
    };
};

export { awaitVideoTask, beginVideoSortSession, finishVideoCleanup, freezeEditorForVideo, nextVideoFrame, sortVideoSplats, videoSorter, waitForVideoEncoder };
