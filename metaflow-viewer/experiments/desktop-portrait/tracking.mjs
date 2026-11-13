// A deliberately local, single-observer experiment. It estimates relative eye
// position; it neither identifies a person nor measures the user's true IPD.
export const FACE_MODEL_URL =
    'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

function baselineEye(value) {
    if (!value || !['x', 'y', 'z'].every((key) => Number.isFinite(value[key]))) {
        throw new Error('观看位置无效，请先完成手动校准。');
    }
    return { x: clamp(value.x, -0.3, 0.3), y: clamp(value.y, -0.4, 0.4), z: clamp(value.z, 0.2, 1.5) };
}

function abortError() {
    const error = new Error('Tracking start cancelled');
    error.name = 'AbortError';
    return error;
}

async function waitForVideo(video, signal) {
    if (signal.aborted) throw abortError();
    await new Promise((resolve, reject) => {
        const abort = () => finish(abortError());
        const check = () => {
            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) finish();
        };
        const fail = () => finish(new Error('摄像头视频无法播放，请改用手动模式。'));
        const timer = setTimeout(() => finish(new Error('摄像头视频启动超时，请重试。')), 12000);
        let finished = false;
        function finish(error) {
            if (finished) return;
            finished = true;
            clearTimeout(timer);
            signal.removeEventListener('abort', abort);
            for (const name of ['loadedmetadata', 'loadeddata', 'canplay']) video.removeEventListener(name, check);
            video.removeEventListener('error', fail);
            if (error) reject(error);
            else resolve();
        }
        signal.addEventListener('abort', abort, { once: true });
        for (const name of ['loadedmetadata', 'loadeddata', 'canplay']) video.addEventListener(name, check);
        video.addEventListener('error', fail, { once: true });
        Promise.resolve().then(() => video.play()).then(check, fail);
        check();
    });
}

function browserEnvironment() {
    return {
        document,
        window,
        requestFrame: (callback) => requestAnimationFrame(callback),
        cancelFrame: (id) => cancelAnimationFrame(id),
        now: () => performance.now(),
        async getUserMedia(constraints) {
            if (!navigator.mediaDevices?.getUserMedia) {
                throw new Error('当前页面无法使用摄像头；请在 HTTPS 或 localhost 中打开，或使用手动模式。');
            }
            return navigator.mediaDevices.getUserMedia(constraints);
        },
        createVideo() {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.setAttribute('aria-hidden', 'true');
            video.tabIndex = -1;
            // Keep it attached for iPad video decoding, but never display the feed.
            video.style.cssText = 'position:fixed;left:-2px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
            document.body.append(video);
            return video;
        },
        readyVideo: waitForVideo,
        async loadDetector() {
            const { FilesetResolver, FaceLandmarker } = await import(
                './node_modules/@mediapipe/tasks-vision/vision_bundle.mjs'
            );
            const files = await FilesetResolver.forVisionTasks(
                new URL('./node_modules/@mediapipe/tasks-vision/wasm', import.meta.url).href
            );
            return FaceLandmarker.createFromOptions(files, {
                baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' },
                runningMode: 'VIDEO',
                numFaces: 1,
                minFaceDetectionConfidence: 0.6,
                minFacePresenceConfidence: 0.6,
                minTrackingConfidence: 0.6,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: false
            });
        }
    };
}

function measureEyes(result, video) {
    const points = result?.faceLandmarks?.[0];
    if (!points || !video.videoWidth || !video.videoHeight) return null;
    // Eye centres from corner pairs, not landmark z or head yaw/pitch.
    const left = [33, 133].map((i) => points[i]);
    const right = [362, 263].map((i) => points[i]);
    if (![...left, ...right].every((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y))) return null;
    const width = video.videoWidth;
    const height = video.videoHeight;
    const lx = (left[0].x + left[1].x) * width / 2;
    const ly = (left[0].y + left[1].y) * height / 2;
    const rx = (right[0].x + right[1].x) * width / 2;
    const ry = (right[0].y + right[1].y) * height / 2;
    const span = Math.hypot(rx - lx, ry - ly);
    if (span < 8) return null;
    return { x: (lx + rx) / 2, y: (ly + ry) / 2, span, width, height };
}

/**
 * Call start() from a user action. onStatus receives { state, message }.
 * getBaseline is sampled only when starting/recentering, so onEye cannot feed
 * its own output back into the calibration. environment is a test seam.
 *
 * The CPU detector runs synchronously at <=15 Hz on the main thread in this
 * prototype; this is not a worker implementation or a measured iPad budget.
 */
export function createHeadTracker({
    onEye = () => {},
    onStatus = () => {},
    getBaseline,
    environment,
    assumedIpd = 0.063
} = {}) {
    if (typeof getBaseline !== 'function') throw new TypeError('getBaseline is required');
    if (!Number.isFinite(assumedIpd) || assumedIpd < 0.04 || assumedIpd > 0.085) {
        throw new RangeError('assumedIpd must be between 0.04 and 0.085 metres');
    }
    const env = environment ?? browserEnvironment();
    let current = null;
    let lastStatus = '';

    function status(state, message) {
        const key = `${state}:${message}`;
        if (key !== lastStatus) {
            lastStatus = key;
            onStatus({ state, message });
        }
    }

    function stopTracks(stream) {
        for (const track of stream?.getTracks() ?? []) track.stop();
    }

    function finish(session, state = 'idle', message = '已关闭摄像头，使用手动观看位置。') {
        if (!session || session.stopped) return;
        session.stopped = true;
        session.abort.abort();
        if (session.frame !== null) env.cancelFrame(session.frame);
        env.document?.removeEventListener('visibilitychange', session.onVisibility);
        env.window?.removeEventListener('pagehide', session.onPageHide);
        for (const track of session.stream?.getTracks() ?? []) {
            track.removeEventListener?.('ended', session.onTrackEnded);
        }
        stopTracks(session.stream);
        session.stream = null;
        if (session.video) {
            session.video.pause();
            session.video.srcObject = null;
            session.video.remove();
            session.video = null;
        }
        session.detector?.close();
        session.detector = null;
        if (current === session) {
            current = null;
            onEye({ ...session.baseline });
            status(state, message);
        }
    }

    function resetReference(session) {
        session.baseline = baselineEye(getBaseline());
        session.reference = null;
        session.samples = [];
        session.needsRecenter = false;
        session.target = { ...session.baseline };
        session.filtered = { ...session.baseline };
        session.previousRaw = null;
        session.lastSeen = null;
        status('calibrating', '请一人正对前摄、保持片刻；当前手动位置将作为中心。');
    }

    function requireRecenter(session, message) {
        session.needsRecenter = true;
        session.target = { ...session.baseline };
        status('lost', message);
    }

    function acceptMeasurement(session, measurement, time) {
        session.lastSeen = time;
        if (session.needsRecenter) return;
        if (!session.reference) {
            session.samples.push(measurement);
            if (session.samples.length < 3) return;
            const samples = session.samples;
            session.reference = {
                ...measurement,
                x: samples.reduce((sum, item) => sum + item.x, 0) / samples.length,
                y: samples.reduce((sum, item) => sum + item.y, 0) / samples.length,
                span: samples.reduce((sum, item) => sum + item.span, 0) / samples.length
            };
            session.samples = [];
        }
        const reference = session.reference;
        if (measurement.width !== reference.width || measurement.height !== reference.height) {
            requireRecenter(session, '摄像头画面尺寸已变化，请重新居中校准。');
            return;
        }

        // Browser front-camera video is not mirrored. Screen-right movement
        // therefore moves the face left in that image. Physical lateral scale
        // uses an explicit average-IPD assumption; depth uses the calibrated span.
        const metresPerPixel = assumedIpd / measurement.span;
        const referenceMetresPerPixel = assumedIpd / reference.span;
        const xChange = (measurement.x - measurement.width / 2) * metresPerPixel -
            (reference.x - reference.width / 2) * referenceMetresPerPixel;
        const yChange = (measurement.y - measurement.height / 2) * metresPerPixel -
            (reference.y - reference.height / 2) * referenceMetresPerPixel;
        const raw = {
            x: session.baseline.x - xChange,
            y: session.baseline.y - yChange,
            z: session.baseline.z * reference.span / measurement.span
        };
        if (session.previousRaw && (
            Math.abs(raw.x - session.previousRaw.x) > 0.14 ||
            Math.abs(raw.y - session.previousRaw.y) > 0.14 ||
            Math.abs(raw.z - session.previousRaw.z) > 0.3
        )) {
            requireRecenter(session, '跟踪位置变化过大，请保持单人入镜并重新居中。');
            return;
        }
        session.previousRaw = raw;
        session.target = baselineEye({
            x: raw.x,
            y: raw.y,
            z: clamp(raw.z, session.baseline.z * 0.65, session.baseline.z * 1.5)
        });
        status('tracking', '正在跟随相对眼位 · 单人模式 · 小范围移动');
    }

    function tick(session, time) {
        if (session.stopped || current !== session) return;
        const video = session.video;
        if (time - session.lastInference >= 1000 / 15 && video.readyState >= 2 &&
            video.currentTime !== session.lastVideoTime) {
            session.lastInference = time;
            session.lastVideoTime = video.currentTime;
            try {
                const result = session.detector.detectForVideo(video, time);
                session.errors = 0;
                if (result?.faceLandmarks?.length > 1) {
                    requireRecenter(session, '检测到多人，请只保留一人入镜后重新居中。');
                } else {
                    const measurement = measureEyes(result, video);
                    if (measurement) acceptMeasurement(session, measurement, time);
                    else if (!session.reference && !session.needsRecenter) session.samples = [];
                }
            } catch {
                session.errors += 1;
                if (session.errors >= 3) {
                    finish(session, 'error', '眼位跟踪连续失败，已关闭摄像头；可使用手动模式或重新开启。');
                    return;
                }
            }
        }
        if (session.reference && !session.needsRecenter && time - session.lastSeen > 850) {
            requireRecenter(session, '暂时没有稳定眼位，已回到校准位置；请点击重新居中继续。');
        }
        const dt = Math.min(100, Math.max(0, time - session.lastFrame));
        session.lastFrame = time;
        const blend = 1 - Math.exp(-dt / 90);
        let changed = false;
        for (const key of ['x', 'y', 'z']) {
            const next = session.filtered[key] + (session.target[key] - session.filtered[key]) * blend;
            if (Math.abs(next - session.filtered[key]) > 1e-7) changed = true;
            session.filtered[key] = next;
        }
        if (changed) onEye({ ...session.filtered });
        session.frame = env.requestFrame((nextTime) => tick(session, nextTime));
    }

    async function begin(session) {
        try {
            const detector = await env.loadDetector();
            if (session.stopped) {
                detector.close();
                return false;
            }
            session.detector = detector;
            const stream = await env.getUserMedia({
                audio: false,
                video: { facingMode: { ideal: 'user' }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 } }
            });
            if (session.stopped) {
                stopTracks(stream);
                return false;
            }
            session.stream = stream;
            if (stream.getVideoTracks?.()[0]?.getSettings?.().facingMode === 'environment') {
                throw new Error('A front camera is required');
            }
            session.onTrackEnded = () => finish(session, 'error', '摄像头已停止，已回到手动模式；可重新开启。');
            for (const track of stream.getTracks()) track.addEventListener?.('ended', session.onTrackEnded, { once: true });
            session.video = env.createVideo();
            session.video.srcObject = stream;
            await env.readyVideo(session.video, session.abort.signal);
            if (session.stopped) return false;
            session.starting = false;
            session.lastFrame = env.now();
            resetReference(session);
            session.frame = env.requestFrame((time) => tick(session, time));
            return true;
        } catch (error) {
            if (session.stopped) return false;
            const denied = ['NotAllowedError', 'PermissionDeniedError'].includes(error?.name);
            finish(session, 'error', denied ?
                '摄像头权限未开启，已保留手动模式；你可以调整权限后重试。' :
                '摄像头或跟踪模型未能启动，已回到手动模式；请检查网络和摄像头后重试。');
            return false;
        }
    }

    return {
        start() {
            if (current) return current.promise;
            let baseline;
            try {
                baseline = baselineEye(getBaseline());
            } catch (error) {
                status('error', error.message);
                return Promise.resolve(false);
            }
            if (env.document?.hidden) {
                status('idle', '请回到当前页面后开启摄像头。');
                return Promise.resolve(false);
            }
            const session = {
                baseline,
                abort: new AbortController(),
                stopped: false,
                starting: true,
                detector: null,
                stream: null,
                video: null,
                frame: null,
                lastInference: -Infinity,
                lastVideoTime: -1,
                errors: 0,
                onVisibility: null,
                onPageHide: null,
                onTrackEnded: null
            };
            current = session;
            session.onVisibility = () => {
                if (env.document.hidden) finish(session, 'idle', '页面已隐藏，摄像头已关闭；返回后可手动重新开启。');
            };
            session.onPageHide = () => finish(session);
            env.document?.addEventListener('visibilitychange', session.onVisibility);
            env.window?.addEventListener('pagehide', session.onPageHide);
            status('loading', '正在加载本地跟踪器与模型，稍后请求前摄权限…');
            session.promise = begin(session);
            return session.promise;
        },
        stop() {
            if (current) finish(current);
        },
        recenter() {
            if (!current || current.starting) return false;
            try {
                resetReference(current);
                onEye({ ...current.baseline });
                return true;
            } catch (error) {
                status('error', error.message);
                return false;
            }
        },
        get running() { return Boolean(current && !current.starting); },
        get starting() { return Boolean(current?.starting); }
    };
}
