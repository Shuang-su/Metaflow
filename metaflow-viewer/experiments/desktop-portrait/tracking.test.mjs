import test from 'node:test';
import assert from 'node:assert/strict';
import { createHeadTracker } from './tracking.mjs';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
    return { promise, resolve, reject };
}

function eventTarget() {
    const listeners = new Map();
    return {
        hidden: false,
        addEventListener(name, fn) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
        },
        removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },
        fire(name) { for (const fn of [...(listeners.get(name) ?? [])]) fn(); },
        count() { return [...listeners.values()].reduce((n, list) => n + list.size, 0); }
    };
}

function face({ x = 0.5, y = 0.5, span = 0.16 } = {}) {
    const points = Array.from({ length: 478 }, () => ({ x, y, z: 999 }));
    for (const index of [33, 133]) points[index] = { x: x - span / 2, y, z: -500 };
    for (const index of [362, 263]) points[index] = { x: x + span / 2, y, z: 500 };
    return { faceLandmarks: [points] };
}

function fixture(overrides = {}) {
    const frames = new Map();
    let serial = 0;
    let clock = 0;
    const streams = [];
    const detectors = [];
    const videos = [];
    const statuses = [];
    const eyes = [];
    const calls = { camera: 0, detector: 0, infer: 0, constraints: [] };
    const doc = eventTarget();
    const win = eventTarget();
    let detection = face();
    const makeStream = () => {
        const track = { ...eventTarget(), stopped: 0, stop() { this.stopped += 1; }, getSettings: () => ({ facingMode: 'user' }) };
        const stream = { track, getTracks: () => [track], getVideoTracks: () => [track] };
        streams.push(stream);
        return stream;
    };
    const makeDetector = () => {
        const detector = {
            closed: 0,
            close() { this.closed += 1; },
            detectForVideo() {
                calls.infer += 1;
                if (detection instanceof Error) throw detection;
                return detection;
            }
        };
        detectors.push(detector);
        return detector;
    };
    const env = {
        document: doc,
        window: win,
        now: () => clock,
        requestFrame: (fn) => { frames.set(++serial, fn); return serial; },
        cancelFrame: (id) => frames.delete(id),
        async loadDetector() { calls.detector += 1; return makeDetector(); },
        async getUserMedia(constraints) {
            calls.camera += 1;
            calls.constraints.push(constraints);
            return makeStream();
        },
        createVideo() {
            const video = {
                readyState: 2, videoWidth: 640, videoHeight: 480, currentTime: 0,
                paused: false, removed: false, srcObject: null,
                pause() { this.paused = true; },
                remove() { this.removed = true; }
            };
            videos.push(video);
            return video;
        },
        async readyVideo() {},
        ...overrides
    };
    let baseline = { x: 0, y: 0.1, z: 0.6 };
    const tracker = createHeadTracker({
        onStatus: (status) => statuses.push(status),
        onEye: (eye) => eyes.push(eye),
        getBaseline: () => baseline,
        environment: env
    });
    return {
        tracker, streams, detectors, videos, statuses, eyes, calls, doc, win, frames,
        makeStream, makeDetector,
        setBaseline(value) { baseline = value; },
        detect(value) { detection = value; },
        step(milliseconds = 80, advanceVideo = true) {
            clock += milliseconds;
            if (advanceVideo) for (const video of videos) video.currentTime += milliseconds / 1000;
            const callbacks = [...frames.values()];
            frames.clear();
            for (const callback of callbacks) callback(clock);
        }
    };
}

test('construction never requests a camera; explicit start is deduplicated and stop releases all resources', async () => {
    const f = fixture();
    assert.equal(f.calls.camera, 0);
    assert.equal(f.calls.detector, 0);
    const first = f.tracker.start();
    assert.equal(f.tracker.start(), first);
    assert.equal(f.tracker.starting, true);
    assert.equal(await first, true);
    assert.equal(f.calls.camera, 1);
    assert.equal(f.calls.constraints[0].audio, false);
    assert.equal(f.tracker.running, true);
    f.tracker.stop();
    f.tracker.stop();
    assert.equal(f.streams[0].track.stopped, 1);
    assert.equal(f.detectors[0].closed, 1);
    assert.equal(f.videos[0].srcObject, null);
    assert.equal(f.videos[0].paused, true);
    assert.equal(f.videos[0].removed, true);
    assert.equal(f.frames.size + f.doc.count() + f.win.count(), 0);
    assert.equal(f.tracker.running, false);
});

test('permission rejection closes the detector, leaves manual mode usable, and allows retry', async () => {
    let attempt = 0;
    const f = fixture({
        async getUserMedia() {
            if (attempt++ === 0) throw Object.assign(new Error('denied'), { name: 'NotAllowedError' });
            return f.makeStream();
        }
    });
    assert.equal(await f.tracker.start(), false);
    assert.equal(f.detectors[0].closed, 1);
    assert.equal(f.doc.count() + f.win.count(), 0);
    assert.match(f.statuses.at(-1).message, /权限/);
    assert.equal(await f.tracker.start(), true);
    f.tracker.stop();
    assert.equal(f.detectors[1].closed, 1);
    assert.equal(f.streams[0].track.stopped, 1);
});

test('stop while model is loading closes a late detector without ever requesting the camera', async () => {
    const loading = deferred();
    const f = fixture({ loadDetector: () => loading.promise });
    const start = f.tracker.start();
    f.tracker.stop();
    const detector = f.makeDetector();
    loading.resolve(detector);
    assert.equal(await start, false);
    assert.equal(detector.closed, 1);
    assert.equal(f.calls.camera, 0);
    assert.equal(f.doc.count() + f.win.count(), 0);
});

test('late camera permission after stop is released and cannot replace a newer session', async () => {
    const permission = deferred();
    let attempt = 0;
    const f = fixture({ getUserMedia: () => attempt++ === 0 ? permission.promise : Promise.resolve(f.makeStream()) });
    const oldStart = f.tracker.start();
    await Promise.resolve();
    f.tracker.stop();
    assert.equal(await f.tracker.start(), true);
    const lateStream = f.makeStream();
    permission.resolve(lateStream);
    assert.equal(await oldStart, false);
    assert.equal(lateStream.track.stopped, 1);
    assert.equal(f.streams[0].track.stopped, 0);
    assert.equal(f.tracker.running, true);
    f.tracker.stop();
    assert.equal(f.detectors[0].closed, 1);
    assert.equal(f.detectors[1].closed, 1);
});

test('video startup failure releases a stream that was already granted', async () => {
    const f = fixture({ readyVideo: async () => { throw new Error('play failed'); } });
    assert.equal(await f.tracker.start(), false);
    assert.equal(f.streams[0].track.stopped, 1);
    assert.equal(f.detectors[0].closed, 1);
    assert.equal(f.videos[0].removed, true);
    assert.equal(f.statuses.at(-1).state, 'error');
});

test('an explicitly rear-facing camera is rejected and released', async () => {
    const f = fixture({
        async getUserMedia() {
            const stream = f.makeStream();
            stream.track.getSettings = () => ({ facingMode: 'environment' });
            return stream;
        }
    });
    assert.equal(await f.tracker.start(), false);
    assert.equal(f.streams[0].track.stopped, 1);
    assert.equal(f.detectors[0].closed, 1);
    assert.equal(f.videos.length, 0);
});

test('camera disconnection or permission revocation releases all remaining tracking resources', async () => {
    const f = fixture();
    await f.tracker.start();
    f.streams[0].track.fire('ended');
    assert.equal(f.tracker.running, false);
    assert.equal(f.detectors[0].closed, 1);
    assert.equal(f.frames.size, 0);
    assert.equal(f.streams[0].track.count(), 0);
    assert.equal(f.statuses.at(-1).state, 'error');
});

test('hiding the page cancels pending camera startup and releases a subsequently granted stream', async () => {
    const permission = deferred();
    const f = fixture({ getUserMedia: () => permission.promise });
    const starting = f.tracker.start();
    await Promise.resolve();
    f.doc.hidden = true;
    f.doc.fire('visibilitychange');
    const stream = f.makeStream();
    permission.resolve(stream);
    assert.equal(await starting, false);
    assert.equal(stream.track.stopped, 1);
    assert.equal(f.detectors[0].closed, 1);
    assert.equal(await f.tracker.start(), false);
});

for (const event of ['visibilitychange', 'pagehide']) {
    test(`${event} stops an active session and does not restart it automatically`, async () => {
        const f = fixture();
        await f.tracker.start();
        if (event === 'visibilitychange') { f.doc.hidden = true; f.doc.fire(event); }
        else f.win.fire(event);
        assert.equal(f.streams[0].track.stopped, 1);
        assert.equal(f.detectors[0].closed, 1);
        assert.equal(f.frames.size, 0);
        f.doc.hidden = false;
        f.doc.fire('visibilitychange');
        assert.equal(f.tracker.running, false);
        assert.equal(f.calls.camera, 1);
    });
}

test('raw front-camera left/up movement produces screen-right/up eye motion, independent of landmark z', async () => {
    const f = fixture();
    await f.tracker.start();
    f.step(); f.step(); f.step();
    assert.equal(f.statuses.at(-1).state, 'tracking');
    f.detect(face({ x: 0.44, y: 0.46 }));
    for (let i = 0; i < 5; i++) f.step();
    const eye = f.eyes.at(-1);
    assert.ok(eye.x > 0.015 && eye.x < 0.03);
    assert.ok(eye.y > 0.105 && eye.y < 0.12);
    assert.ok(Math.abs(eye.z - 0.6) < 1e-10);
    f.detect(face({ x: 0.44, y: 0.46, span: 0.2 }));
    for (let i = 0; i < 5; i++) f.step();
    assert.ok(f.eyes.at(-1).z < 0.52 && f.eyes.at(-1).z > 0.45);
    f.tracker.stop();
});

test('lost face returns to the calibrated eye and stays locked until explicit recenter', async () => {
    const f = fixture();
    await f.tracker.start();
    f.step(); f.step(); f.step();
    f.detect(face({ x: 0.43 }));
    f.step(); f.step();
    assert.ok(f.eyes.at(-1).x > 0);
    f.detect({ faceLandmarks: [] });
    for (let i = 0; i < 25; i++) f.step();
    assert.equal(f.statuses.at(-1).state, 'lost');
    assert.ok(Math.abs(f.eyes.at(-1).x) < 0.00001);
    f.detect(face({ x: 0.63 }));
    f.step(); f.step(); f.step();
    assert.equal(f.statuses.at(-1).state, 'lost');
    assert.equal(f.tracker.recenter(), true);
    f.step(); f.step(); f.step();
    assert.equal(f.statuses.at(-1).state, 'tracking');
    assert.equal(f.eyes.at(-1).x, 0);
    f.tracker.stop();
});

test('three consecutive inference failures stop capture and release the detector', async () => {
    const f = fixture();
    await f.tracker.start();
    f.detect(new Error('inference failure'));
    f.step(); f.step(); f.step();
    assert.equal(f.tracker.running, false);
    assert.equal(f.statuses.at(-1).state, 'error');
    assert.equal(f.streams[0].track.stopped, 1);
    assert.equal(f.detectors[0].closed, 1);
    assert.equal(f.frames.size, 0);
});

test('unchanged video frames are not reinferred and camera aspect changes require recalibration', async () => {
    const f = fixture();
    await f.tracker.start();
    f.step();
    for (let i = 0; i < 5; i++) f.step(80, false);
    assert.equal(f.calls.infer, 1);
    f.step(); f.step();
    f.videos[0].videoWidth = 480;
    f.videos[0].videoHeight = 640;
    f.step();
    assert.equal(f.statuses.at(-1).state, 'lost');
    assert.match(f.statuses.at(-1).message, /尺寸/);
    f.tracker.stop();
});
