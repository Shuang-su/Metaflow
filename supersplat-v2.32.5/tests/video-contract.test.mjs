import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { EventHandler, BoundingBox, Vec3 } from 'playcanvas';
import { BufferTarget, Output, Mp4OutputFormat, EncodedVideoPacketSource } from 'mediabunny';
import { videoFrameCount, videoFrameSample } from '../src/video-frame-clock.ts';
import { VideoOutputTransaction } from '../src/video-output-transaction.ts';
import * as videoConfig from '../src/video-config.ts';

// Exercise the authoritative source with the Editor's engine identity, just as
// Rollup does. A sparse Editor CI checkout does not install Viewer dependencies.
const revealSource = await readFile(new URL('../../metaflow-viewer/src/gsplat-reveal-radial.ts', import.meta.url), 'utf8');
const revealModule = ts.transpileModule(revealSource, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace("from 'playcanvas'", `from ${JSON.stringify(import.meta.resolve('playcanvas'))}`);
const { GsplatRevealRadial } = await import(`data:text/javascript;base64,${Buffer.from(revealModule).toString('base64')}`);

test('MF-57 integer output frames synchronize a nonzero timeline start at 30 and 60 fps', () => {
    for (const fps of [30, 60, 24, 120]) {
        const count = videoFrameCount(120, 420, 60, fps);
        assert.equal(count, 5 * fps + 1);
        const samples = Array.from({ length: count }, (_, n) => videoFrameSample(n, 120, 60, fps));
        assert.equal(samples[0].seconds, 0);
        assert.equal(samples[0].timelineFrame, 120);
        assert.equal(samples.at(-1).seconds, 5);
        assert.equal(samples.at(-1).timelineFrame, 420);
        samples.forEach((sample, n) => {
            assert.equal(sample.timestamp, Math.round(n * 1e6 / fps));
            assert.equal(sample.duration, Math.round((n + 1) * 1e6 / fps) - sample.timestamp);
        });
        assert.deepEqual(samples, Array.from({ length: count }, (_, n) => videoFrameSample(n, 120, 60, fps)));
    }
    assert.equal(videoFrameCount(3, 3, 60, 30), 1);
    for (const args of [[-1, 4, 60, 30], [4, 1, 60, 30], [0, 4, 0, 30], [0, 4, 60, NaN]]) {
        assert.throws(() => videoFrameCount(...args), RangeError);
    }
});

const destination = () => {
    const events = [];
    let existing = 'user-existing-file';
    return { events, get existing() { return existing; },
        async write(chunk) { events.push(['write', chunk.position, chunk.data.byteLength]); },
        async truncate(size) { events.push(['truncate', size]); },
        async close() { events.push(['close']); existing = 'complete-video'; },
        async abort() { events.push(['abort']); }
    };
};

test('MF-57 proxy close/cancel cannot commit or delete an existing selected file', async () => {
    const file = destination();
    const transaction = new VideoOutputTransaction(file);
    const writer = transaction.writable.getWriter();
    await writer.write({ type: 'write', position: 12, data: new Uint8Array(10) });
    await writer.close();
    writer.releaseLock();
    assert.equal(file.existing, 'user-existing-file');
    await transaction.abort();
    await transaction.abort();
    assert.deepEqual(file.events, [['write', 12, 10], ['abort']]);
    assert.equal(file.existing, 'user-existing-file');
});

test('MF-57 successful output truncates to its own size and commits exactly once', async () => {
    const file = destination();
    const transaction = new VideoOutputTransaction(file);
    const writer = transaction.writable.getWriter();
    await writer.write({ type: 'write', position: 16, data: new Uint8Array(8) });
    await writer.write({ type: 'write', position: 0, data: new Uint8Array(4) });
    await writer.close();
    writer.releaseLock();
    await transaction.commit();
    await transaction.abort();
    assert.deepEqual(file.events.slice(-2), [['truncate', 24], ['close']]);
    assert.equal(file.existing, 'complete-video');
    await assert.rejects(transaction.commit(), /closed/);
});

test('MF-57 real Mediabunny cancel does not publish a partial video', async () => {
    const { StreamTarget } = await import('mediabunny');
    const file = destination();
    const transaction = new VideoOutputTransaction(file);
    const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new StreamTarget(transaction.writable) });
    output.addVideoTrack(new EncodedVideoPacketSource('avc'));
    await output.start();
    await output.cancel();
    await transaction.abort();
    assert.equal(file.existing, 'user-existing-file');
    assert.equal(file.events.filter(e => e[0] === 'close').length, 0);
    // Buffer output still supports upstream's non-streaming path.
    assert.ok(new BufferTarget());
});

const effectFixture = (dotProfile) => {
    const app = new EventHandler();
    app.graphicsDevice = { isWebGPU: false };
    app.systems = { gsplat: new EventHandler() };
    app.renderer = {};
    const parameters = new Map();
    const chunks = new Map();
    const material = { getShaderChunks: () => chunks, update() {}, setParameter: (n, v) => parameters.set(n, v) };
    const effect = new GsplatRevealRadial(app, { gsplat: { instance: { material } } }, new BoundingBox(new Vec3(), new Vec3(1, 2, 1)), new Vec3(), { dotProfile });
    return { effect, app, parameters, chunks };
};

test('MF-57 explicit reveal profiles preserve the no-context fallback and reject unknown values', () => {
    assert.equal(videoConfig.getVideoRevealDotProfile({}), 'streamingScene');
    for (const revealDotProfile of ['characterSog', 'streamingScene', 'megaVoxel']) {
        assert.equal(videoConfig.getVideoRevealDotProfile({ revealDotProfile }), revealDotProfile);
    }
    for (const revealDotProfile of ['character', 'auto', '', null, 3, {}]) {
        assert.throws(() => videoConfig.getVideoRevealDotProfile({ revealDotProfile }), /Unknown Viewer particle profile/);
    }
});

test('MF-57 character export uses the canonical smaller dots without changing the wave clock', () => {
    const character = effectFixture(videoConfig.getVideoRevealDotProfile({ revealDotProfile: 'characterSog' }));
    const scene = effectFixture(videoConfig.getVideoRevealDotProfile({}));
    try {
        character.effect.setCaptureTime(2);
        scene.effect.setCaptureTime(2);
        assert.equal(character.effect.captureTiming.dotProfile, 'characterSog');
        assert.equal(character.effect.captureTiming.duration, scene.effect.captureTiming.duration);
        assert.ok(Math.abs(character.parameters.get('uRevealDotSize') - 0.00063) < 1e-12);
        assert.ok(character.parameters.get('uRevealDotSize') < scene.parameters.get('uRevealDotSize'));
        for (const name of ['Time', 'Center', 'Radius', 'Speed', 'Acceleration', 'Delay', 'Oscillation', 'Active']) {
            assert.deepEqual(character.parameters.get(`uReveal${name}`), scene.parameters.get(`uReveal${name}`));
        }
    } finally {
        character.effect.destroy();
        scene.effect.destroy();
    }
});

test('MF-57 capture clock is seekable, resettable, and not driven by realtime updates', () => {
    const { effect, app, parameters, chunks } = effectFixture();
    assert.ok(effect.captureTiming.duration >= 5);
    for (const t of [0, 0.5, 2, 0.5]) {
        assert.equal(effect.setCaptureTime(t), true);
        assert.equal(parameters.get('uRevealTime'), t);
        app.fire('update', 10);
        assert.equal(parameters.get('uRevealTime'), t);
        assert.equal(parameters.get('uRevealActive'), 1);
        assert.equal(app.hasEvent('update'), false);
    }
    assert.equal(effect.setCaptureTime(effect.captureTiming.duration), false);
    assert.equal(chunks.has('gsplatModifyVS'), false);
    assert.equal(effect.setCaptureTime(0), true);
    for (const t of [-1, Infinity, NaN]) assert.throws(() => effect.setCaptureTime(t), RangeError);
    effect.destroy();
    assert.equal(app.systems.gsplat.hasEvent('material:created'), false);
});

test('MF-57 Viewer visible playback retains its existing realtime delta clamp', () => {
    const { effect, app, parameters } = effectFixture();
    effect.arm();
    assert.equal(parameters.get('uRevealActive'), 0);
    effect.beginVisiblePlayback();
    app.fire('update', 10);
    assert.equal(parameters.get('uRevealTime'), 1 / 30);
    effect.destroy();
    assert.equal(app.hasEvent('update'), false);
});
