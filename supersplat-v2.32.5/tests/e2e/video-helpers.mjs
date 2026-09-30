import { expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { boot } from './helpers.mjs';

export const standardVideo = {
    startFrame: 60, endFrame: 210, frameRate: 30, width: 640, height: 360, bitrate: 4_000_000,
    transparentBg: false, showDebug: false, format: 'mp4', codec: 'h264', projection: 'standard',
    reveal: 'viewer', revealShortClipConfirmed: true
};

export async function videoFixture(page, url) {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    await page.addInitScript(installVideoAudit);
    await boot(page, url);
    await page.evaluate(setupCalibrationScene);
    await expect.poll(() => page.evaluate(() => window.scene.events.invoke('scene.splats')[0]?.numSplats)).toBe(600);
    return errors;
}

export function installVideoAudit() {
        window.videoAudit = { frames: [], packets: [], samples: [], hashes: [], encoders: [], popups: [] };
        const NativeEncoder = window.VideoEncoder;
        if (NativeEncoder) window.VideoEncoder = class extends NativeEncoder {
            constructor(options) {
                super({ ...options, output(chunk, meta) {
                    window.videoAudit.packets.push({ timestamp: chunk.timestamp, duration: chunk.duration, type: chunk.type });
                    options.output(chunk, meta);
                } });
                this.reportError = options.error;
                window.videoAudit.encoders.push(this);
            }
            configure(config) {
                if (window.failEncoderInit) throw new Error('Injected encoder initialization failure');
                return super.configure(config);
            }
            encode(frame, options) {
                window.videoAudit.frames.push({ timestamp: frame.timestamp, duration: frame.duration });
                if (window.failEncoderReclaim) {
                    this.close();
                    this.reportError(new DOMException('Injected encoder reclaim', 'QuotaExceededError'));
                    return;
                }
                if (window.recordVideoPixels) {
                    const clone = frame.clone();
                    window.videoAudit.hashes.push((async () => {
                        try {
                            const data = new Uint8Array(clone.allocationSize());
                            await clone.copyTo(data);
                            const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', data))).map(x => x.toString(16).padStart(2, '0')).join('');
                            return hash;
                        } finally { clone.close(); }
                    })());
                }
                return super.encode(frame, options);
            }
        };
}

export async function setupCalibrationScene() {
        // Reproducible static 3DGS calibration scene, not a fake rendering path.
        const points = [];
        for (let y = 0; y < 20; ++y) for (let x = 0; x < 30; ++x) {
            const px = (x - 14.5) * 0.1;
            const py = (y - 9.5) * 0.1;
            const z = Math.sin(x * 0.3) * Math.cos(y * 0.3) * 0.3;
            points.push([px, py, z, x < 10 ? 1 : -0.8, x >= 10 && x < 20 ? 1 : -0.8, x >= 20 ? 1 : -0.8, 4, -3.2, -3.2, -3.2, 1, 0, 0, 0]);
        }
        const props = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity', 'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
        const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${points.length}\n${props.map(p => `property float ${p}`).join('\n')}\nend_header\n`;
        const data = new DataView(new ArrayBuffer(points.length * props.length * 4));
        points.flat().forEach((value, i) => data.setFloat32(i * 4, value, true));
        const e = window.scene.events;
        const file = new File([header, data], 'video-calibration.ply');
        window.calibrationFile = file;
        await e.invoke('import', [{ filename: file.name, contents: file }]);
        e.invoke('camera.animTrack').clear();
        e.fire('timeline.setFrameRate', 30);
        e.fire('timeline.setFrames', 301);
        e.fire('camera.setPose', { position: { x: 0, y: 0, z: 5 }, target: { x: 0, y: 0, z: 0 }, fov: 60 }, 0);
        window.scene.camera.onUpdate(0);
        e.fire('select.none');
        e.on('render.videoSample', sample => window.videoAudit.samples.push(sample));
        window.scene.forceRender = true;
}

export async function renderVideo(page, settings, filename) {
    const download = page.waitForEvent('download', { timeout: 240000 });
    const result = page.evaluate(settings => window.scene.events.invoke('render.video', settings), settings);
    result.catch(() => {});
    const failed = page.locator('#popup').waitFor({ state: 'visible', timeout: 240000 }).then(async () => {
        const message = await page.locator('#popup-text').innerText();
        throw new Error(`Video render failed: ${message}`);
    });
    const file = await Promise.race([download, failed]);
    await file.saveAs(filename);
    expect(await result).toBe(true);
    const audit = await page.evaluate(async () => ({
        frames: window.videoAudit.frames, packets: window.videoAudit.packets, samples: window.videoAudit.samples,
        hashes: await Promise.all(window.videoAudit.hashes), encoderStates: window.videoAudit.encoders.map(e => e.state),
        locked: window.scene.lockedRenderMode, capturing: window.scene.camera.captureMode,
        overlays: window.scene.camera.renderOverlays, target: window.scene.camera.targetSizeOverride,
        progressHidden: document.querySelector('#progress-container')?.classList.contains('pcui-hidden')
    }));
    return audit;
}

export const probeVideo = filename => JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries',
    'stream=codec_name,width,height,r_frame_rate,nb_read_frames,duration:frame=pts_time,duration_time', '-show_frames', '-of', 'json', filename], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));

export async function clearAudit(page) {
    await page.evaluate(() => {
        Object.assign(window.videoAudit, { frames: [], packets: [], samples: [], hashes: [], encoders: [] });
    });
}
