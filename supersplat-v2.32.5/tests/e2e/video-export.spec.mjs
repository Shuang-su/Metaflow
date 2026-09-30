import { test, expect } from '@playwright/test';
import { videoFixture, standardVideo, renderVideo, probeVideo, clearAudit } from './video-helpers.mjs';

test('MF-57 1080p30 H264 particle opening renders and plays as a complete local video', async ({ page }) => {
    const errors = await videoFixture(page);
    const before = await page.evaluate(() => ({ pose: window.scene.events.invoke('camera.getPose'), frame: window.scene.events.invoke('timeline.frame') }));
    const file = test.info().outputPath('particle-1080p30.mp4');
    const audit = await renderVideo(page, { ...standardVideo, width: 1920, height: 1080, bitrate: 10_000_000 }, file);
    expect(audit.frames).toHaveLength(151);
    expect(audit.samples[0]).toEqual({ seconds: 0, timelineFrame: 60 });
    expect(audit.samples.at(-1)).toEqual({ seconds: 5, timelineFrame: 210 });
    expect(audit.encoderStates).toEqual(['closed']);
    expect(audit.locked).toBe(false);
    expect(audit.capturing).toBe(false);
    expect(await page.evaluate(() => ({ pose: window.scene.events.invoke('camera.getPose'), frame: window.scene.events.invoke('timeline.frame') }))).toEqual(before);
    const probe = probeVideo(file);
    expect(probe.streams[0]).toMatchObject({ codec_name: 'h264', width: 1920, height: 1080, nb_read_frames: '151', r_frame_rate: '30/1' });
    await test.info().attach('encoded-timing', { body: JSON.stringify({ audit, probe }), contentType: 'application/json' });
    await page.screenshot({ path: test.info().outputPath('editor-after-video.png') });
    await page.evaluate(() => {
        const input = document.createElement('input');
        input.id = 'video-playback-file';
        input.type = 'file';
        input.onchange = () => {
            const video = document.createElement('video');
            video.id = 'decoded-video';
            video.muted = true;
            video.controls = true;
            video.style.cssText = 'position:fixed;top:12px;right:12px;width:640px;z-index:10000;background:black';
            video.src = URL.createObjectURL(input.files[0]);
            document.body.append(video);
        };
        document.body.append(input);
    });
    await page.locator('#video-playback-file').setInputFiles(file);
    await page.waitForFunction(() => document.querySelector('#decoded-video')?.readyState >= 2);
    await page.evaluate(() => document.querySelector('#decoded-video').play());
    await page.waitForFunction(() => document.querySelector('#decoded-video').currentTime > 0.1);
    await page.evaluate(() => document.querySelector('#decoded-video').pause());
    for (const time of [0, 1.5, 3, 5]) {
        await page.evaluate(time => new Promise(resolve => {
            const video = document.querySelector('#decoded-video');
            video.onseeked = () => resolve();
            video.currentTime = time;
        }), time);
        await page.locator('#decoded-video').screenshot({ path: test.info().outputPath(`decoded-${time}s.png`) });
    }
    expect(errors).toEqual([]);
});

test('MF-57 repeated exports keep identical input frames and timestamps, including a slower render', async ({ page }) => {
    const errors = await videoFixture(page);
    await page.evaluate(() => { window.recordVideoPixels = true; });
    const first = await renderVideo(page, standardVideo, test.info().outputPath('first.mp4'));
    await clearAudit(page);
    await page.evaluate(() => {
        const texture = window.scene.camera.workTarget.colorBuffer;
        const proto = Object.getPrototypeOf(texture);
        const read = proto.read;
        proto.read = async function (...args) {
            await new Promise(resolve => setTimeout(resolve, 10));
            return read.apply(this, args);
        };
    });
    const second = await renderVideo(page, standardVideo, test.info().outputPath('slower-repeat.mp4'));
    expect(first.frames).toEqual(second.frames);
    expect(first.samples).toEqual(second.samples);
    expect(first.hashes).toHaveLength(151);
    expect(first.hashes).toEqual(second.hashes);
    expect(new Set(first.hashes).size).toBeGreaterThan(20);
    expect(errors).toEqual([]);
});

test('MF-57 60fps portrait and ordinary 360 video retain working exports', async ({ page }) => {
    const errors = await videoFixture(page);
    const portrait = test.info().outputPath('portrait60.mp4');
    await renderVideo(page, { ...standardVideo, endFrame: 90, width: 360, height: 640, frameRate: 60 }, portrait);
    expect(probeVideo(portrait).streams[0]).toMatchObject({ width: 360, height: 640, nb_read_frames: '61', r_frame_rate: '60/1' });
    await clearAudit(page);
    const panorama = test.info().outputPath('ordinary360.mp4');
    await renderVideo(page, { ...standardVideo, endFrame: 62, width: 512, height: 256, projection: 'equirect', reveal: 'none' }, panorama);
    expect(probeVideo(panorama).streams[0]).toMatchObject({ width: 512, height: 256, nb_read_frames: '3' });
    expect(errors).toEqual([]);
});

test('MF-57 animated camera, transformed multiple elements and hidden/deleted/locked splats are stable', async ({ page }) => {
    const errors = await videoFixture(page);
    await page.evaluate(async () => {
        const s = window.scene;
        const e = s.events;
        for (const name of ['second.ply', 'hidden.ply']) await e.invoke('import', [{ filename: name, contents: window.calibrationFile }]);
        const [first, second, hidden] = e.invoke('scene.splats');
        second.move(s.camera.position.clone().set(2.4, 0, -0.3), undefined, s.camera.position.clone().set(0.7, 1.2, 1));
        hidden.move(s.camera.position.clone().set(100, 100, 100));
        hidden.visible = false;
        first.state.setBits({ forEach: fn => fn(0) }, 4);
        first.state.setBits({ forEach: fn => fn(1) }, 2);
        first.state.setBits({ forEach: fn => fn(2) }, 1);
        await first.updateState(7);
        const track = e.invoke('camera.animTrack');
        e.fire('camera.setPose', { position: { x: 0, y: 0, z: 7 }, target: { x: 0, y: 0, z: 0 }, fov: 60 }, 0);
        s.camera.onUpdate(0);
        track.addKey(60);
        e.fire('camera.setPose', { position: { x: 2, y: 0.5, z: 6 }, target: { x: 1, y: 0, z: 0 }, fov: 70 }, 0);
        s.camera.onUpdate(0);
        track.addKey(120);
        e.fire('timeline.setFrame', 75);
        e.fire('timeline.time', 75);
        s.camera.onUpdate(0);
        window.recordVideoPixels = true;
        window.cameraSamples = [];
        e.on('render.videoSample', sample => window.cameraSamples.push({ ...sample, pose: e.invoke('camera.getPose') }));
    });
    const settings = { ...standardVideo, endFrame: 120 };
    const first = await renderVideo(page, settings, test.info().outputPath('transforms-first.mp4'));
    const cameras = await page.evaluate(() => window.cameraSamples);
    expect(cameras[0].pose.fov).toBe(60);
    expect(cameras.at(-1).pose.fov).toBe(70);
    expect(cameras[0].pose.position).not.toEqual(cameras.at(-1).pose.position);
    await clearAudit(page);
    const second = await renderVideo(page, settings, test.info().outputPath('transforms-repeat.mp4'));
    expect(first.hashes).toEqual(second.hashes);
    expect(await page.evaluate(() => window.scene.events.invoke('scene.allSplats').map(p => [p.numDeleted, p.numLocked, p.visible]))).toEqual([[1, 1, true], [0, 0, true], [0, 0, false]]);
    expect(errors).toEqual([]);
});
