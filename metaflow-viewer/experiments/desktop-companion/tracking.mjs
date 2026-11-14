// MF165_HEAD_PALM_AIR_V1
import {measureHead as measureEyes,meanMeasurement,calibrationIsStable,estimateHeadEye,boundedHeadEye} from './head-estimator.mjs';
// Camera frames stay in this page. This is a calibrated monocular estimate,
// not a biometric identity system or a measurement of the viewer's true IPD.
export const FACE_MODEL_URL =
    new URL('./vendor/mediapipe/face_landmarker.task', import.meta.url).href;

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
const CALIBRATION_FRAMES = 9;
const INFERENCE_INTERVAL = 1000 / 24;
const FILTER_MS = 45;
const radiansToDegrees = 180 / Math.PI;

function baselineEye(value) {
    if (!value || !['x', 'y', 'z'].every((key) => Number.isFinite(value[key]))) {
        throw new Error('观看位置无效，请先填写眼睛到屏幕平面的距离。');
    }
    return { x: clamp(value.x, -0.3, 0.3), y: clamp(value.y, -0.4, 0.4), z: clamp(value.z, 0.2, 1.5) };
}

function calibrationOptions(value, assumedIpd) {
    const options = value ?? {};
    const ipd = options.ipd ?? assumedIpd;
    if (!Number.isFinite(ipd) || ipd < 0.04 || ipd > 0.085) {
        throw new Error('瞳距应为 40–85 毫米；不知道实际值时可使用 63 毫米估计值。');
    }
    const estimateOrigin = options.estimateOrigin === true;
    const cameraX = options.cameraX ?? 0;
    const cameraY = options.cameraY ?? 0;
    if (!Number.isFinite(cameraX) || !Number.isFinite(cameraY)) {
        throw new Error('镜头相对屏幕的位置无效，请重新选择镜头位置。');
    }
    return { ipd, cameraX, cameraY, estimateOrigin };
}

function namedError(name, message, code) {
    return Object.assign(new Error(message), { name, code });
}

function abortError() {
    return namedError('AbortError', 'Tracking start cancelled');
}

async function waitForVideo(video, signal) {
    if (signal.aborted) throw abortError();
    await new Promise((resolve, reject) => {
        const abort = () => finish(abortError());
        const check = () => {
            if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) finish();
        };
        const fail = () => finish(namedError('VideoError', '摄像头已授权，但视频无法播放；请重试或更换浏览器。', 'video-playback'));
        const timer = setTimeout(() => finish(namedError('VideoError', '摄像头视频启动超时，请重试。', 'video-timeout')), 12000);
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
        getUserMedia(constraints) {
            if (globalThis.isSecureContext === false) {
                throw namedError('SecurityError', '摄像头需要安全连接，请在独立的 HTTPS 页面打开。', 'insecure-context');
            }
            const policy = document.permissionsPolicy ?? document.featurePolicy;
            if (policy?.allowsFeature && !policy.allowsFeature('camera')) {
                throw namedError('SecurityError', '当前嵌入页面禁止访问摄像头，请在浏览器独立标签页打开网站。', 'camera-policy-blocked');
            }
            if (!navigator.mediaDevices?.getUserMedia) {
                throw namedError('NotSupportedError', '当前浏览器没有开放摄像头接口，请在 Safari 或 Chrome 的独立页面打开。', 'camera-api-unavailable');
            }
            // Do not put an await before this request: start() is a user action.
            return navigator.mediaDevices.getUserMedia(constraints);
        },
        createVideo({ visible = false } = {}) {
            const video = document.createElement('video');
            video.muted = true;
            video.playsInline = true;
            video.autoplay = true;
            video.tabIndex = -1;
            video.setAttribute('playsinline', '');
            video.setAttribute('aria-label', '仅在此设备处理的摄像头实时取景');
            if (!visible) {
                video.setAttribute('aria-hidden', 'true');
                // iPad needs an attached element for dependable video decoding.
                video.style.cssText = 'position:fixed;left:-2px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
            }
            document.body.append(video);
            return video;
        },
        readyVideo: waitForVideo,
        async loadDetector() {
            const { FilesetResolver, FaceLandmarker } = await import(
                './vendor/mediapipe/vision_bundle.mjs'
            );
            const files = await FilesetResolver.forVisionTasks(
                new URL('./vendor/mediapipe/wasm', import.meta.url).href
            );
            return FaceLandmarker.createFromOptions(files, {
                baseOptions: { modelAssetPath: FACE_MODEL_URL, delegate: 'CPU' },
                runningMode: 'VIDEO',
                // Detect a second observer instead of silently following one.
                // MediaPipe's single-face temporal smoothing is disabled at 2;
                // the only tracking filter is FILTER_MS below.
                numFaces: 2,
                minFaceDetectionConfidence: 0.45,
                minFacePresenceConfidence: 0.5,
                minTrackingConfidence: 0.5,
                outputFaceBlendshapes: false,
                outputFacialTransformationMatrixes: true
            });
        }
    };
}

function startupFailure(error, stage) {
    if (error?.code && ['insecure-context', 'camera-policy-blocked', 'camera-api-unavailable',
        'front-camera-required', 'camera-no-track', 'video-playback', 'video-timeout'].includes(error.code)) {
        return { code: error.code, message: error.message };
    }
    if (stage === 'model') return { code: 'model-load-failed', message: '摄像头跟踪模型未能加载，摄像头已关闭；请检查网络后重试。' };
    const name = error?.name;
    if (['NotAllowedError', 'PermissionDeniedError'].includes(name)) {
        return { code: 'permission-denied', message: '摄像头权限未获准。请在浏览器的网站设置中允许相机；若系统禁用了相机，也需在系统设置中开启，然后重试。' };
    }
    if (['NotFoundError', 'DevicesNotFoundError'].includes(name)) {
        return { code: 'camera-not-found', message: '没有找到可用摄像头。请连接或启用前置摄像头后重试。' };
    }
    if (['NotReadableError', 'TrackStartError'].includes(name)) {
        return { code: 'camera-not-readable', message: '摄像头无法读取，可能正被其他应用占用或被系统限制。请关闭其他相机应用后重试。' };
    }
    if (['OverconstrainedError', 'ConstraintNotSatisfiedError'].includes(name)) {
        return { code: 'camera-constraints', message: '所选摄像头或拍摄参数不可用。请重新选择摄像头后重试。' };
    }
    if (name === 'SecurityError') return { code: 'camera-security', message: '浏览器或系统禁止此页面使用摄像头。请用 HTTPS 独立页面打开，并检查网站与系统相机权限。' };
    if (name === 'InvalidStateError') return { code: 'page-inactive', message: '页面当前未处于活动状态。请回到此页面后重试。' };
    if (name === 'AbortError') return { code: 'camera-interrupted', message: '摄像头启动被中断，请重试。' };
    return { code: stage === 'video' ? 'video-start-failed' : 'camera-start-failed',
        message: stage === 'video' ? '摄像头已授权，但视频未能启动；请重试或更换浏览器。' : '摄像头未能启动，请检查设备与网站相机权限后重试。' };
}

/**
 * start({ deviceId, allowEnvironmentCamera = false }?) is a user action. It requests the camera
 * immediately, while loading the local detector in parallel. Stop also settles
 * a pending start; late streams/detectors are released without replacing a retry.
 * allowEnvironmentCamera only applies to an explicit, nonempty deviceId whose
 * camera the user has confirmed faces them (for example an external Mac camera).
 * Automatic/default selection retains the tablet's rear-camera rejection.
 *
 * getBaseline() -> { x, y, z } in screen metres, z is measured normal distance.
 * getCalibration()? -> { cameraX, cameraY, ipd, estimateOrigin } in screen metres.
 * With estimateOrigin, the camera location and image midpoint estimate initial
 * x/y. Otherwise the supplied manual x/y anchor relative movement. Calibration
 * values are sampled only at start/recenter; outputs never feed their own input.
 *
 * onVideo(video|null) owns placement of a real attached video element. Mirror it
 * with CSS if desired; the detector and onSample.eyes always use raw video pixels.
 * Without onVideo, the video remains attached but hidden.
 * onSample receives { phase, faceCount, progress:0..1, eye, fps, quality,
 *                    video:{width,height}, eyes, pose, errorCode }.
 * quality is good/hold-still/turned/multiple/lost/unavailable, NOT a probability.
 *
 * CPU inference is capped at 24 Hz (usually 20 Hz on a 60 Hz animation loop).
 * fps reports observed inference frequency. The sole output filter has a 45 ms
 * time constant. This does not promise a measured frame rate on a particular iPad.
 * environment is an injectable test seam, never a camera replacement in the UI.
 */
export function createHeadTracker({
    onEye = () => {},
    onStatus = () => {},
    onVideo,
    onSample = () => {},
    getBaseline,
    getCalibration,
    environment,
    assumedIpd = 0.063
} = {}) {
    if (typeof getBaseline !== 'function') throw new TypeError('getBaseline is required');
    if (!Number.isFinite(assumedIpd) || assumedIpd < 0.04 || assumedIpd > 0.085) {
        throw new RangeError('assumedIpd must be between 0.04 and 0.085 metres');
    }
    const env = environment ?? browserEnvironment();
    const setTimer = env.setTimer ?? setTimeout;
    const clearTimer = env.clearTimer ?? clearTimeout;
    let current = null;
    let lastStatus = '';

    function status(session, phase, message, quality = session.quality, code = null) {
        session.phase = phase;
        session.quality = quality;
        session.errorCode = code;
        const key = `${phase}:${message}:${code}`;
        if (key !== lastStatus) {
            lastStatus = key;
            onStatus({ state: phase, message, ...(code ? { code } : {}) });
        }
    }

    function sample(session) {
        const measurement = session.measurement;
        const times = session.inferenceTimes;
        const elapsed = times.length > 1 ? times.at(-1) - times[0] : 0;
        onSample({
            phase: session.phase,
            faceCount: session.faceCount,
            progress: session.needsRecenter ? 0 : session.reference ? 1 : Math.min(1, session.samples.length / CALIBRATION_FRAMES),
            eye: session.filtered ? { ...session.filtered } : { ...session.manualBaseline },
            fps: elapsed > 0 ? Math.round((times.length - 1) * 10000 / elapsed) / 10 : 0,
            quality: session.quality,
            video: { width: session.video?.videoWidth ?? 0, height: session.video?.videoHeight ?? 0 },
            eyes: measurement ? structuredClone(measurement.eyes) : null,
            pose: measurement?.pose ? { ...measurement.pose } : null,
            errorCode: session.errorCode ?? null
        });
    }

    function stopTracks(stream) {
        for (const track of stream?.getTracks() ?? []) {
            try { track.stop(); } catch { /* Release every track even if one fails. */ }
        }
    }

    function closeDetector(detector) {
        try { detector?.close(); } catch { /* Other resources must still be released. */ }
    }

    function finish(session, phase = 'idle', message = '已关闭摄像头，使用手动观看位置。', code = null) {
        if (!session || session.stopped) return;
        session.stopped = true;
        session.resolveStart(false);
        session.abort.abort();
        if (session.frame !== null) env.cancelFrame(session.frame);
        clearTimer(session.detectorTimer);
        env.document?.removeEventListener('visibilitychange', session.onVisibility);
        env.window?.removeEventListener('pagehide', session.onPageHide);
        for (const track of session.stream?.getTracks() ?? []) {
            track.removeEventListener?.('ended', session.onTrackEnded);
        }
        stopTracks(session.stream);
        session.stream = null;
        if (session.video) {
            try { session.video.pause(); } catch { /* Continue closing the feed. */ }
            session.video.srcObject = null;
            session.video.remove();
            session.video = null;
        }
        closeDetector(session.detector);
        session.detector = null;
        if (current === session) {
            current = null;
            if (session.videoNotified) onVideo?.(null);
            session.faceCount = 0;
            session.measurement = null;
            session.samples = [];
            session.reference = null;
            session.filtered = { ...session.manualBaseline };
            session.inferenceTimes = [];
            onEye({ ...session.manualBaseline });
            status(session, phase, message, 'unavailable', code);
            sample(session);
        }
    }

    function resetReference(session) {
        // Read first, then commit: a bad input cannot partially reset a session.
        const manualBaseline = baselineEye(getBaseline());
        const calibration = calibrationOptions(getCalibration?.(), assumedIpd);
        session.manualBaseline = manualBaseline;
        session.calibration = calibration;
        session.baseline = { ...manualBaseline };
        session.reference = null;
        session.samples = [];
        session.needsRecenter = false;session.recoverySamples=[];session.recoveryReason=null;session.recoveryBlocked=false;
        session.target = { ...manualBaseline };
        session.filtered = { ...manualBaseline };
        session.previousRaw = null;
        session.lastSeen = null;
        session.measurement = null;
        session.faceCount = 0;
        status(session, 'calibrating', '保持自然坐姿片刻；正在用整张脸标定头部位置，无需盯住镜头。', 'hold-still');
        sample(session);
    }

    function requireRecenter(session,message,quality='lost',reason='lost') {
        if(!session.needsRecenter){session.recoverySamples=[];session.recoveryReason=reason;}
        session.needsRecenter=true;
        session.samples=[];
        // A stationary ornament should freeze, not jump back to the old centre.
        session.target={...(session.filtered||session.baseline)};
        status(session,quality==='multiple'?'multiple':'lost',message,quality);
    }

    function acceptMeasurement(session,measurement,time) {
        const pose=measurement.pose;
        if(!pose||!measurement.headAnchor)return;
        if(session.reference&&(measurement.width!==session.reference.width||measurement.height!==session.reference.height)){
            session.recoveryBlocked=true;
            requireRecenter(session,'相机画面尺寸已改变，请重新确认屏幕与镜头位置并校准。','lost','geometry');return;
        }
        if(session.recoveryBlocked)return;
        session.lastSeen=time;
        if(session.needsRecenter){
            const samples=session.recoverySamples||(session.recoverySamples=[]),last=samples.at(-1);
            if(last&&time-last.time>250)samples.length=0;
            samples.push({...measurement,time});if(samples.length>7)samples.shift();
            if(!calibrationIsStable(samples))session.recoverySamples=[{...measurement,time}];
            if(session.recoverySamples.length<7||time-session.recoverySamples[0].time<200)return;
            // Preserve the original geometric reference for ordinary short loss.
            // A stable jump/multi-face recovery re-anchors to the held position,
            // so switching observers never teleports the room. No identity test.
            if(session.recoveryReason==='jump'||session.recoveryReason==='multiple'){
                session.reference=meanMeasurement(session.recoverySamples);
                session.baseline={...session.filtered};
            }
            session.needsRecenter=false;session.previousRaw=null;session.recoverySamples=[];
        }
        if(!session.reference){
            const last=session.samples.at(-1);
            if(last&&(time-last.time>250||last.width!==measurement.width||last.height!==measurement.height))session.samples=[];
            session.samples.push({...measurement,time});if(session.samples.length>CALIBRATION_FRAMES)session.samples.shift();
            if(!calibrationIsStable(session.samples))session.samples=[{...measurement,time}];
            status(session,'calibrating','保持自然坐姿片刻；允许侧向坐姿，不需要盯住镜头。','hold-still');
            if(session.samples.length<CALIBRATION_FRAMES||time-session.samples[0].time<280)return;
            const reference=meanMeasurement(session.samples);session.reference=reference;session.samples=[];
            if(session.calibration.estimateOrigin){
                const scale=session.calibration.ipd/reference.correctedSpan;
                session.baseline=baselineEye({x:session.calibration.cameraX-(reference.x-reference.width/2)*scale,
                    y:session.calibration.cameraY-(reference.y-reference.height/2)*scale,z:session.manualBaseline.z});
            }
        }
        const raw=boundedHeadEye(estimateHeadEye(session.reference,measurement,session.baseline),session.baseline);
        if(!raw)return;
        if(session.previousRaw&&(Math.abs(raw.x-session.previousRaw.x)>.18||Math.abs(raw.y-session.previousRaw.y)>.18||Math.abs(raw.z-session.previousRaw.z)>.35)){
            requireRecenter(session,'检测变化较大，暂时保位；稳定单人入镜后自动恢复。','lost','jump');return;
        }
        session.previousRaw=raw;session.target=baselineEye(raw);
        status(session,'tracking',measurement.eyes?'整脸与头部姿态追踪 · 不依赖瞳孔方向':'头部姿态追踪 · 双眼不可见时的近似位置','good');
    }

    function tick(session, time) {
        if (session.stopped || current !== session) return;
        session.frame = null;
        const video = session.video;
        let newSample = false;
        if (time - session.lastInference >= INFERENCE_INTERVAL && video.readyState >= 2 && video.currentTime !== session.lastVideoTime) {
            session.lastInference = time;
            session.lastVideoTime = video.currentTime;
            session.inferenceTimes.push(time);
            while (session.inferenceTimes.length > 2 && time - session.inferenceTimes[0] > 1000) session.inferenceTimes.shift();
            newSample = true;
            try {
                const result = session.detector.detectForVideo(video, time);
                session.errors = 0;
                session.faceCount = result?.faceLandmarks?.length ?? 0;
                session.measurement = session.faceCount === 1 ? measureEyes(result, video) : null;
                if (session.faceCount > 1) {
                    session.samples = [];
                    if (session.reference) requireRecenter(session,'检测到多人，已暂停；稳定单人入镜后自动恢复。','multiple','multiple');
                    else status(session, 'multiple', '检测到多人，请只保留一人入镜后开始校准。', 'multiple');
                } else if (session.measurement) {
                    acceptMeasurement(session, session.measurement, time);
                } else if (!session.needsRecenter) {
                    session.samples = [];
                    status(session, session.reference ? 'lost' : 'calibrating', '暂时没有可靠面部位置；画面保持不动，重新进入镜头后自动恢复。', 'lost');
                }
            } catch {
                session.errors += 1;
                session.measurement = null;
                session.faceCount = 0;
                session.samples = [];
                if (session.errors >= 3) {
                    finish(session, 'error', '眼位检测连续失败，摄像头已关闭；请重试或切换手动模式。', 'inference-failed');
                    return;
                }
                status(session, 'lost', '本帧眼位检测失败，正在重试。', 'unavailable');
            }
        }
        if (session.reference && !session.needsRecenter && time - session.lastSeen > 1200) {
            requireRecenter(session, '暂时保留最后观看位置；稳定单人入镜后自动恢复。');
            session.measurement = null;
            session.faceCount = 0;
            newSample = true;
        }
        if (session.stopped || current !== session) return;
        const dt = Math.min(100, Math.max(0, time - session.lastFrame));
        session.lastFrame = time;
        const blend = 1 - Math.exp(-dt / FILTER_MS);
        let changed = false;
        for (const key of ['x', 'y', 'z']) {
            const next = session.filtered[key] + (session.target[key] - session.filtered[key]) * blend;
            if (Math.abs(next - session.filtered[key]) > 1e-7) changed = true;
            session.filtered[key] = next;
        }
        if (changed) onEye({ ...session.filtered });
        if (newSample && !session.stopped) sample(session);
        if (!session.stopped && current === session) session.frame = env.requestFrame((nextTime) => tick(session, nextTime));
    }

    async function begin(session) {
        if (session.stopped || current !== session) return;
        // This invocation is synchronous until the browser's permission call.
        let cameraRequest;
        try {
            cameraRequest = env.getUserMedia({
                audio: false,
                video: {
                    ...(session.deviceId ? { deviceId: { exact: session.deviceId } } : { facingMode: { ideal: 'user' } }),
                    width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30, max: 30 }
                }
            });
        } catch (error) {
            const failure = startupFailure(error, 'camera');
            finish(session, 'error', failure.message, failure.code);
            return;
        }
        const cameraTask = Promise.resolve(cameraRequest).then(async (stream) => {
            if (session.stopped) { stopTracks(stream); return; }
            session.stream = stream;
            const track = stream.getVideoTracks?.()[0];
            if (!track) throw namedError('NotFoundError', '没有获得可用的视频轨道，请重新选择摄像头。', 'camera-no-track');
            if (track.getSettings?.().facingMode === 'environment' && !session.allowEnvironmentCamera) {
                throw namedError('CameraFacingError', '当前是后置摄像头，请选择朝向观看者的前置摄像头。', 'front-camera-required');
            }
            session.onTrackEnded = () => finish(session, 'error', '摄像头已断开或权限被撤回，请重新开启。', 'camera-ended');
            for (const item of stream.getTracks()) item.addEventListener?.('ended', session.onTrackEnded, { once: true });
            session.video = env.createVideo({ visible: typeof onVideo === 'function' });
            session.video.srcObject = stream;
            if (onVideo) {
                session.videoNotified = true;
                onVideo(session.video);
            }
            if (session.stopped) return;
            status(session, 'loading', '摄像头已开启；正在准备本地眼位跟踪。', 'unavailable');
            sample(session);
            try { await env.readyVideo(session.video, session.abort.signal); }
            catch (error) { throw { cause: error, stage: 'video' }; }
        }).catch((error) => { throw error?.stage ? error : { cause: error, stage: 'camera' }; });
        const detectorTask = (async () => {
            try {
                const detector = await env.loadDetector();
                clearTimer(session.detectorTimer);
                if (session.stopped) { closeDetector(detector); return; }
                session.detector = detector;
            } catch (error) { throw { cause: error, stage: 'model' }; }
        })();
        session.detectorTimer = setTimer(() => {
            if (!session.detector) finish(session, 'error', '眼位模型加载超时，摄像头已关闭；请检查网络后重试。', 'model-timeout');
        }, 45000);
        try {
            await Promise.all([cameraTask, detectorTask]);
            if (session.stopped) return;
            resetReference(session);
            if (session.stopped) return;
            session.starting = false;
            session.lastFrame = env.now();
            session.frame = env.requestFrame((time) => tick(session, time));
            session.resolveStart(true);
        } catch (failure) {
            if (session.stopped) return;
            const error = startupFailure(failure?.cause ?? failure, failure?.stage ?? 'camera');
            finish(session, 'error', error.message, error.code);
        }
    }

    return {
        start({ deviceId, allowEnvironmentCamera = false } = {}) {
            const explicitlySelected = typeof deviceId === 'string' && deviceId.trim().length > 0;
            const allowEnvironment = explicitlySelected && allowEnvironmentCamera === true;
            if (current && deviceId === current.deviceId && allowEnvironment === current.allowEnvironmentCamera) return current.promise;
            if (current) finish(current);
            let manualBaseline;
            let calibration;
            try {
                manualBaseline = baselineEye(getBaseline());
                calibration = calibrationOptions(getCalibration?.(), assumedIpd);
                if (deviceId !== undefined && (typeof deviceId !== 'string' || !deviceId.trim())) throw new Error('请选择有效的摄像头设备。');
            } catch (error) {
                onStatus({ state: 'error', code: 'invalid-calibration', message: error.message });
                return Promise.resolve(false);
            }
            if (env.document?.hidden) {
                onStatus({ state: 'idle', message: '请回到当前页面后开启摄像头。' });
                return Promise.resolve(false);
            }
            const session = {
                manualBaseline, baseline: { ...manualBaseline }, calibration, deviceId,
                allowEnvironmentCamera: allowEnvironment,
                abort: new AbortController(), stopped: false, starting: true,
                detector: null, detectorTimer: null, stream: null, video: null, videoNotified: false,
                frame: null, lastInference: -Infinity, lastVideoTime: -1, errors: 0,
                phase: 'permission', quality: 'unavailable', errorCode: null,
                reference: null, samples: [], inferenceTimes: [], faceCount: 0, measurement: null,
                onVisibility: null, onPageHide: null, onTrackEnded: null
            };
            session.promise = new Promise((resolve) => { session.resolveStart = resolve; });
            current = session;
            session.onVisibility = () => {
                if (env.document.hidden) finish(session, 'idle', '页面已隐藏，摄像头已关闭；返回后可重新开启。');
            };
            session.onPageHide = () => finish(session);
            env.document?.addEventListener('visibilitychange', session.onVisibility);
            env.window?.addEventListener('pagehide', session.onPageHide);
            status(session, 'permission', '正在请求摄像头权限，请在浏览器提示中选择允许。', 'unavailable');
            if (!session.stopped) {
                sample(session);
                void begin(session);
            }
            return session.promise;
        },
        stop() {
            if (current) finish(current);
        },
        recenter() {
            if (!current || current.starting) return false;
            const session = current;
            try {
                resetReference(session);
                if (!session.stopped) onEye({ ...session.manualBaseline });
                return !session.stopped;
            } catch (error) {
                finish(session, 'error', error.message, 'invalid-calibration');
                return false;
            }
        },
        get running() { return Boolean(current && !current.starting); },
        get starting() { return Boolean(current?.starting); }
    };
}
