// Run against an explicitly supplied, isolated safaridriver session. This does
// not enable automation or modify the user's normal Safari session/settings.
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { installVideoAudit, setupCalibrationScene, standardVideo, probeVideo } from '../tests/e2e/video-helpers.mjs';

const session = process.env.METAFLOW_SAFARI_SESSION;
const directory = process.env.METAFLOW_TEST_OUTPUT;
if (!session || !directory) throw new Error('Set METAFLOW_SAFARI_SESSION and METAFLOW_TEST_OUTPUT to the isolated QA session and artifact directory.');
const endpoint = `http://127.0.0.1:4358/session/${encodeURIComponent(session)}`;
const command = async (route, body, method = 'POST') => {
    const response = await fetch(endpoint + route, { method, headers: { 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const json = await response.json();
    if (!response.ok || json.value?.error) throw new Error(JSON.stringify(json.value));
    return json.value;
};
const sync = (script, args = []) => command('/execute/sync', { script, args });
const asyncScript = (script, args = []) => command('/execute/async', { script, args });
await mkdir(directory, { recursive: true });
await command('/timeouts', { script: 120000, pageLoad: 60000, implicit: 0 });
// Let a waiting SW activate by closing this automation session's old Editor
// client. Never clear the user's caches or reload an open editing document.
await command('/url', { url: 'about:blank' });
await command('/url', { url: 'http://127.0.0.1:4356/editor/' });
await asyncScript(`const done = arguments[arguments.length - 1];
const wait = () => window.scene?.events?.functions.has('doc.load') ? done(true) : setTimeout(wait, 50); wait();`);
assert.equal(await sync('return typeof window.scene.camera.captureMode;'), 'boolean', 'A stale Editor bundle is still active');
await sync(`window.safariNativeFilePicker = typeof window.showSaveFilePicker; (${installVideoAudit.toString()})(); window.showSaveFilePicker = undefined;`);
const setup = await asyncScript(`const done = arguments[arguments.length - 1]; (${setupCalibrationScene.toString()})().then(() => done({ ok: true }), error => done({ error: error.message }));`);
assert.equal(setup.ok, true, JSON.stringify(setup));
const capability = await asyncScript(`const done = arguments[arguments.length - 1];
VideoEncoder.isConfigSupported({ codec: 'avc1.640033', width: 1920, height: 1080, framerate: 30, bitrate: 10000000 }).then(result => done({ ...result, userAgent: navigator.userAgent, filePicker: window.safariNativeFilePicker }));`);
assert.equal(capability.supported, true);
console.log('Safari loaded the static Gaussian scene; native H.264 1080p30 is available.');

await sync(`window.safariDownloads = []; const originalClick = HTMLAnchorElement.prototype.click;
HTMLAnchorElement.prototype.click = function () {
    if (this.download && this.href.startsWith('blob:')) {
        const filename = this.download;
        window.safariDownloads.push(fetch(this.href).then(response => response.blob()).then(blob => ({ filename, blob })));
    } else originalClick.call(this);
};`);
const settings = { ...standardVideo, width: 1920, height: 1080, bitrate: 10000000 };
const codecMatrix = await asyncScript(`const settings = arguments[0], done = arguments[arguments.length - 1];
(async () => {
    const rows = [];
    for (const [codec, format] of [['h264', 'mp4'], ['h265', 'mp4'], ['vp9', 'webm'], ['av1', 'webm']]) {
        try {
            await window.scene.events.invoke('render.videoPreflight', { ...settings, codec, format, reveal: 'none' });
            rows.push({ codec, format, supported: true });
        } catch (error) {
            rows.push({ codec, format, supported: false, message: error.message });
        }
    }
    done(rows);
})().catch(error => done({ error: error.message }));`, [settings]);
assert.ok(Array.isArray(codecMatrix));
for (const row of codecMatrix.filter(row => !row.supported)) assert.match(row.message, /Unsupported|unavailable/i);
const outcome = await asyncScript(`const settings = arguments[0], done = arguments[arguments.length - 1];
const e = window.scene.events;
const popup = e.functions.get('showPopup'); const errors = [];
e.functions.set('showPopup', async options => { errors.push(options); return { action: 'ok' }; });
e.invoke('render.video', settings).then(async ok => {
    e.functions.set('showPopup', popup);
    const downloads = await Promise.all(window.safariDownloads);
    if (!downloads.length) return done({ ok, errors });
    const blob = downloads[0].blob;
    window.safariVideoBlob = blob;
    const reader = new FileReader();
    reader.onload = () => done({ ok, errors, filename: downloads[0].filename, data: reader.result,
        frames: window.videoAudit.frames, samples: window.videoAudit.samples,
        encoders: window.videoAudit.encoders.map(enc => enc.state), capture: window.scene.camera.captureMode,
        locked: window.scene.lockedRenderMode });
    reader.readAsDataURL(blob);
}, error => done({ error: error.message }));`, [settings]);
assert.equal(outcome.ok, true, JSON.stringify(outcome.errors ?? outcome));
assert.equal(outcome.frames.length, 151);
assert.equal(outcome.samples.length, 151);
assert.deepEqual(outcome.encoders, ['closed']);
assert.equal(outcome.capture, false);
assert.equal(outcome.locked, false);
const videoPath = path.join(directory, 'safari-1080p30.mp4');
await writeFile(videoPath, Buffer.from(outcome.data.split(',')[1], 'base64'));
delete outcome.data;
const probe = probeVideo(videoPath);
assert.equal(probe.streams[0].nb_read_frames, '151');
console.log('Safari rendered 151 frames and a complete H.264 MP4; validating playback.');
const playback = await asyncScript(`const done = arguments[arguments.length - 1];
const video = document.createElement('video'); video.id = 'safari-decoded-video'; video.muted = true; video.controls = true;
video.style.cssText = 'position:fixed;inset:20px auto auto 20px;width:800px;z-index:10000;background:black';
video.src = URL.createObjectURL(window.safariVideoBlob); document.body.append(video);
video.onerror = () => done({ error: video.error?.message });
video.onloadeddata = async () => { try { await video.play();
    video.ontimeupdate = () => { if (video.currentTime > 0.1) { video.pause(); video.ontimeupdate = null;
        done({ width: video.videoWidth, height: video.videoHeight, duration: video.duration, currentTime: video.currentTime }); } };
} catch (error) { done({ error: error.message }); } };`);
assert.equal(playback.width, 1920);
assert.ok(playback.currentTime > 0);
await asyncScript(`const done = arguments[arguments.length - 1]; const video = document.querySelector('#safari-decoded-video'); video.onseeked = () => done(true); video.currentTime = 3;`);
const screenshot = await command('/screenshot', undefined, 'GET');
await writeFile(path.join(directory, 'safari-playback.png'), Buffer.from(screenshot, 'base64'));
await writeFile(path.join(directory, 'safari-evidence.json'), JSON.stringify({ capability, codecMatrix, outcome, probe, playback }, null, 2));
console.log(JSON.stringify({ pass: true, videoPath, frames: outcome.frames.length, codecMatrix, playback }));
