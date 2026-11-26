import { WebPCodec } from '@playcanvas/splat-transform';
import {
    BufferTarget,
    EncodedPacket,
    EncodedVideoPacketSource,
    MkvOutputFormat,
    MovOutputFormat,
    Mp4OutputFormat,
    Output,
    StreamTarget,
    WebMOutputFormat
} from 'mediabunny';
import { Color, path, Quat, Vec3 } from 'playcanvas';

import { ElementType } from './element';
import { EquirectRenderer } from './equirect-renderer';
import type { Events } from './events';
import { encodePng } from './png-writer';
import type { Scene } from './scene';
import { injectSphericalMetadata } from './spherical-metadata';
import type { Splat } from './splat';
import { i18n } from './ui/localization';
import type { VideoSettings } from './video-config';
import { buildVideoEncoderConfig, getVideoCodecType, getVideoRevealDotProfile } from './video-config';
import { videoFrameCount, videoFrameSample } from './video-frame-clock';
import { VideoOutputTransaction } from './video-output-transaction';
import { awaitVideoTask, finishVideoCleanup, freezeEditorForVideo, nextVideoFrame, waitForVideoEncoder } from './video-render-session';
import { createVideoRevealEffect, VideoReveal, visibleRevealSplats } from './video-reveal';

const nullClr = new Color(0, 0, 0, 0);

// Lookup maps for video output format and codec configuration
const FORMAT_CONFIG: Record<
    string,
    {
        create: (streaming: boolean) => Mp4OutputFormat | MovOutputFormat | MkvOutputFormat | WebMOutputFormat;
        extension: string;
    }
> = {
    mp4: {
        create: (streaming) => new Mp4OutputFormat({ fastStart: streaming ? false : 'in-memory' }),
        extension: 'mp4'
    },
    webm: { create: () => new WebMOutputFormat(), extension: 'webm' },
    mov: {
        create: (streaming) => new MovOutputFormat({ fastStart: streaming ? false : 'in-memory' }),
        extension: 'mov'
    },
    mkv: { create: () => new MkvOutputFormat(), extension: 'mkv' }
};

// backpressure high-water mark for the encoder queue and pending muxer writes
const MAX_QUEUE_SIZE = 5;

type ImageSettings = {
    width: number;
    height: number;
    transparentBg: boolean;
    showDebug: boolean;
    format: 'png' | 'jpeg' | 'webp';
    quality?: number; // 0..1, jpeg only
    projection?: 'standard' | 'equirect';
    levelHorizon?: boolean;
};

const removeExtension = (filename: string) => {
    return filename.substring(0, filename.length - path.getExtension(filename).length);
};

const isInvalidFilenameChar = (char: string) => {
    return /[<>:"/\\|?*]/.test(char) || char.charCodeAt(0) < 32;
};

const sanitizeFilename = (filename: string) => {
    const sanitized = Array.from(filename, (char) => (isInvalidFilenameChar(char) ? '_' : char))
        .join('')
        .trim();
    return sanitized.length > 0 ? sanitized : 'supersplat';
};

// extract a plain filename from url-style names (e.g. splats imported via ?load=)
const getImportedFilename = (filename: string) => {
    const trimmed = filename.split(/[?#]/)[0];

    if (trimmed.includes('://') || trimmed.startsWith('blob:')) {
        try {
            return path.getBasename(new URL(trimmed).pathname);
        } catch {
            // fall through to the raw filename below
        }
    }

    return path.getBasename(trimmed);
};

// sorting is submitted on the GPU immediately before each render
const sortSplatsAndWait = (_scene: Scene, _splats: Splat[]) => Promise.resolve();

const downloadFile = (
    data: ArrayBuffer | Uint8Array<ArrayBuffer>,
    filename: string,
    type = 'application/octet-stream'
) => {
    const blob = new Blob([data], { type });
    const url = window.URL.createObjectURL(blob);
    const el = document.createElement('a');
    el.download = filename;
    el.href = url;
    el.click();
    window.URL.revokeObjectURL(url);
};

const registerRenderEvents = (scene: Scene, events: Events) => {
    const readBackground = (source: typeof scene.camera.workTarget, data: Uint8Array, background: boolean) => {
        const target = background ? scene.backgroundRenderer.compose(source) : source;
        return target.colorBuffer.read(0, 0, target.width, target.height, { renderTarget: target, data, immediate: true });
    };

    let webpCodec: WebPCodec;
    let videoActive = false;

    const videoPreflight = async (settings: VideoSettings) => {
        const timelineFps = events.invoke('timeline.frameRate');
        const totalFrames = videoFrameCount(settings.startFrame, settings.endFrame, timelineFps, settings.frameRate);
        const splats = visibleRevealSplats(scene);
        if (!splats.length) throw new Error(i18n.t('video.reveal.empty'));
        if (!['none', 'viewer', undefined].includes(settings.reveal)) throw new Error('Unknown reveal setting');
        if (settings.reveal === 'viewer' && settings.projection === 'equirect') throw new Error(i18n.t('video.reveal.no360'));
        if (settings.reveal === 'viewer' && events.invoke('sequence.active')) throw new Error(i18n.t('video.reveal.staticOnly'));
        const revealDotProfile = settings.reveal === 'viewer' ? getVideoRevealDotProfile(settings) : undefined;
        if (![settings.width, settings.height].every(v => Number.isInteger(v) && v > 0 && v <= scene.graphicsDevice.maxTextureSize)) {
            throw new Error(i18n.t('video.reveal.dimensions'));
        }
        const codecs = { mp4: ['h264', 'h265'], mov: ['h264', 'h265'], webm: ['vp9', 'av1'], mkv: ['h264', 'h265', 'vp9', 'av1'] };
        if (!codecs[settings.format]?.includes(settings.codec)) throw new Error('Unsupported video container/codec combination');
        if (typeof VideoEncoder === 'undefined') throw new Error(i18n.t('popup.render-video.compatibility.unavailable'));
        const support = await VideoEncoder.isConfigSupported(buildVideoEncoderConfig(settings));
        if (!support.supported) throw new Error(`Unsupported video configuration (${settings.codec} @ ${settings.width}x${settings.height})`);
        let revealDuration = 0;
        if (settings.reveal === 'viewer') {
            const restore = freezeEditorForVideo(scene);
            try {
                events.fire('timeline.time', settings.startFrame);
                scene.camera.onUpdate(0);
                revealDuration = createVideoRevealEffect(scene, splats, revealDotProfile).captureTiming.duration;
            } finally {
                restore(false);
            }
        }
        return { totalFrames, timelineFps, duration: (settings.endFrame - settings.startFrame) / timelineFps, revealDuration, revealDotProfile };
    };
    events.function('render.videoPreflight', videoPreflight);

    // default base filename for rendered output: the project document name if
    // set, otherwise the first visible splat's name
    const baseFilename = () => {
        const docName = events.invoke('doc.name');
        const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter((splat) => splat.visible);
        const source = docName || (splats[0]?.name ?? 'supersplat');
        return sanitizeFilename(removeExtension(getImportedFilename(source)));
    };

    events.function('render.baseFilename', baseFilename);

    // largest render target dimension the device supports; used by the render
    // dialogs to disable resolutions the gpu cannot produce
    events.function('render.maxTextureSize', () => scene.graphicsDevice.maxTextureSize);

    // wait for postrender to fire
    const postRender = () => {
        return new Promise<boolean>((resolve, reject) => {
            const handle = scene.events.on('postrender', () => {
                handle.off();
                try {
                    resolve(true);
                } catch (error) {
                    reject(error);
                }
            });
        });
    };

    // wait for postrender, giving up on abort or after timeout ms (a hidden
    // tab stops rendering, so the frame may never come)
    const postRenderWithin = (signal: AbortSignal | undefined, timeout: number) => {
        return new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout> = null;
            const done = (error?: Error) => {
                handle.off();
                clearTimeout(timer);
                signal?.removeEventListener('abort', onAbort);
                if (error) reject(error);
                else resolve();
            };
            const onAbort = () => done(new DOMException('The render was cancelled.', 'AbortError'));
            const handle = scene.events.on('postrender', () => done());
            if (Number.isFinite(timeout)) timer = setTimeout(() => done(new Error('render_timeout')), timeout);
            if (signal?.aborted) onAbort();
            else signal?.addEventListener('abort', onAbort);
        });
    };

    // options.signal and options.timeout bound the wait for the frame; without
    // them it waits for the next frame however long that takes
    events.function(
        'render.offscreen',
        async (
            width: number,
            height: number,
            options?: { signal?: AbortSignal; timeout?: number }
        ): Promise<Uint8Array> => {
            try {
                // start rendering to offscreen buffer only
                scene.camera.startOffscreenMode(width, height);
                scene.camera.renderOverlays = false;
                scene.gizmoLayer.enabled = false;
                scene.centersLayer.enabled = false;

                // render the next frame
                scene.forceRender = true;

                // for render to finish
                if (options) await postRenderWithin(options.signal, options.timeout ?? Infinity);
                else await postRender();

                // cpu-side buffer to read pixels into
                const data = new Uint8Array(width * height * 4);

                const { mainTarget, workTarget } = scene.camera;

                scene.dataProcessor.copyRt(mainTarget, workTarget);

                // read the rendered frame. the read must be immediate: nothing
                // submits the shared command encoder outside the frame, so a
                // deferred read maps the staging buffer before the copy above has
                // run and returns zeros.
                await workTarget.colorBuffer.read(0, 0, width, height, {
                    renderTarget: workTarget,
                    data,
                    immediate: true
                });

                // rows are read back top-down (0,0 at the top)
                return data;
            } finally {
                scene.camera.endOffscreenMode();
                scene.camera.renderOverlays = true;
                scene.gizmoLayer.enabled = true;
                scene.centersLayer.enabled = true;
                scene.camera.camera.clearColor.set(0, 0, 0, 0);
                scene.forceRender = true; // repaint the viewport with normal rendering
            }
        }
    );

    events.function('render.image', async (imageSettings: ImageSettings, fileStream?: FileSystemWritableFileStream) => {
        events.fire('startSpinner');

        let equirect: EquirectRenderer | null = null;
        let savedFov = 0;
        let savedOrtho = false;

        try {
            const { width, height, transparentBg, showDebug, format, quality, projection, levelHorizon } =
                imageSettings;
            const is360 = projection === 'equirect';

            // in 360 mode the offscreen target is a square cube face; the
            // equirect target holds the output-sized frame
            const faceSize = Math.min(height, scene.graphicsDevice.maxTextureSize);

            // start rendering to offscreen buffer only
            scene.camera.startOffscreenMode(is360 ? faceSize : width, is360 ? faceSize : height);
            scene.camera.renderOverlays = is360 ? false : showDebug;
            scene.gizmoLayer.enabled = false;
            scene.centersLayer.enabled = false;
            if (!transparentBg && !scene.backgroundRenderer.enabled) {
                scene.camera.clearPass.setClearColor(events.invoke('bgClr'));
            }

            // cpu-side buffer to read pixels into
            const data = new Uint8Array(width * height * 4);

            if (is360) {
                savedFov = scene.camera.fov;
                savedOrtho = scene.camera.ortho;
                equirect = new EquirectRenderer(scene.graphicsDevice, faceSize, width, height);
                scene.camera.ortho = false;

                // snapshot the current camera pose. supersplat cameras never
                // roll, so with level horizon the capture frame is the
                // camera yaw, otherwise yaw and pitch
                const camPos = new Vec3().copy(scene.camera.position);
                const qCapture = new Quat();
                if (levelHorizon ?? true) {
                    qCapture.setFromEulerAngles(0, scene.camera.azim, 0);
                } else {
                    qCapture.copy(scene.camera.mainCamera.getRotation());
                }

                // all faces share direction-independent clipping planes so
                // near-plane culling cannot differ across a face boundary
                const boundRadius = scene.bound.halfExtents.length();
                const dist = new Vec3().sub2(scene.bound.center, camPos).length();
                const far = dist + boundRadius;
                const near = Math.max(1e-6, dist < boundRadius ? far / (1024 * 16) : dist - boundRadius);

                const splats = (scene.getElementsByType(ElementType.splat) as Splat[]).filter((splat) => splat.visible);
                const qWorld = new Quat();

                for (let face = 0; face < 6; face++) {
                    qWorld.mul2(qCapture, EquirectRenderer.faceRotations[face]);
                    scene.camera.setPoseOverride({
                        position: camPos,
                        rotation: qWorld,
                        fov: EquirectRenderer.faceFov,
                        near,
                        far
                    });

                    // faces view different directions, so each render must
                    // wait for its own sort
                    await sortSplatsAndWait(scene, splats);

                    // render a frame and wait for it to finish
                    scene.forceRender = true;
                    await postRender();

                    scene.dataProcessor.copyRt(scene.camera.mainTarget, equirect.faceTargets[face]);
                }

                // project the faces to the equirect target and read back
                equirect.project();
                await readBackground(equirect.equirectTarget, data, !transparentBg);
            } else {
                // render the next frame
                scene.forceRender = true;

                // for render to finish
                await postRender();

                const { mainTarget, workTarget } = scene.camera;

                scene.dataProcessor.copyRt(mainTarget, workTarget, scene.overdrawRender);

                // read the rendered frame (immediate: see render.offscreen)
                await readBackground(workTarget, data, !transparentBg);
            }

            let bytes: Uint8Array<ArrayBuffer>;
            let extension: string;
            let mimeType: string;

            if (format === 'png') {
                bytes = await encodePng(data, width, height);
                extension = 'png';
                mimeType = 'image/png';
            } else if (format === 'jpeg') {
                // jpeg has no alpha channel and canvas encoding flattens
                // transparent pixels toward black, so force full opacity
                for (let i = 3; i < data.length; i += 4) {
                    data[i] = 255;
                }

                const imageData = new ImageData(
                    new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
                    width,
                    height
                );
                let blob: Blob;
                if (typeof OffscreenCanvas !== 'undefined') {
                    const canvas = new OffscreenCanvas(width, height);
                    const context = canvas.getContext('2d');
                    if (!context) {
                        throw new Error('failed to create 2d context');
                    }
                    context.putImageData(imageData, 0, 0);
                    blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: quality ?? 0.9 });
                } else {
                    // fallback for browsers without OffscreenCanvas
                    const canvas = document.createElement('canvas');
                    canvas.width = width;
                    canvas.height = height;
                    const context = canvas.getContext('2d');
                    if (!context) {
                        throw new Error('failed to create 2d context');
                    }
                    context.putImageData(imageData, 0, 0);
                    blob = await new Promise<Blob>((resolve, reject) => {
                        canvas.toBlob(
                            (b) => (b ? resolve(b) : reject(new Error('failed to encode jpeg'))),
                            'image/jpeg',
                            quality ?? 0.9
                        );
                    });
                }
                bytes = new Uint8Array(await blob.arrayBuffer());
                extension = 'jpg';
                mimeType = 'image/jpeg';
            } else {
                // construct the webp codec
                if (!webpCodec) {
                    webpCodec = await WebPCodec.create();
                }

                bytes = webpCodec.encodeLosslessRGBA(data, width, height);
                extension = 'webp';
                mimeType = 'image/webp';
            }

            if (fileStream) {
                await fileStream.write(bytes);
                await fileStream.close();
            } else {
                downloadFile(bytes, `${baseFilename()}.${extension}`, mimeType);
            }

            return true;
        } catch (error) {
            // close the stream even on failure so the caller can remove the
            // empty file
            if (fileStream) {
                try {
                    await fileStream.close();
                } catch {
                    // stream already closed or errored
                }
            }

            await events.invoke('showPopup', {
                type: 'error',
                header: i18n.t('panel.render.failed'),
                message: `'${error.message ?? error}'`
            });

            return false;
        } finally {
            if (equirect) {
                scene.camera.setPoseOverride(null);
                scene.camera.fov = savedFov;
                scene.camera.ortho = savedOrtho;
                equirect.destroy();
                equirect = null;
            }

            scene.camera.endOffscreenMode();
            scene.camera.renderOverlays = true;
            scene.gizmoLayer.enabled = true;
            scene.centersLayer.enabled = true;
            scene.camera.clearPass.setClearColor(nullClr);
            scene.forceRender = true; // repaint the viewport with normal rendering

            events.fire('stopSpinner');
        }
    });

    events.function('render.video', async (videoSettings: VideoSettings, fileStream?: FileSystemWritableFileStream) => {
        if (videoActive) {
            await fileStream?.abort();
            throw new Error(i18n.t('video.reveal.busy'));
        }
        videoActive = true;
        const renderImpl = async () => {
            let cancelled = false;
            let committing = false;
            let progressStarted = false;
            let completed = false;
            let failure: unknown;
            let restoreState: ReturnType<typeof freezeEditorForVideo>;
            let reveal: VideoReveal;
            const job = new AbortController();
            const transaction = fileStream ? new VideoOutputTransaction(fileStream) : null;
            const cancelHandler = events.on('progressCancel', () => {
                if (committing) return;
                cancelled = true;
                job.abort(new DOMException('Video rendering cancelled', 'AbortError'));
            });
            const lostHandler = scene.graphicsDevice.on('devicelost', () => job.abort(new Error('Graphics device lost; retry the whole video')));

            let encoder: VideoEncoder | null = null;
            let equirect: EquirectRenderer | null = null;
            let savedFov = 0;
            let savedOrtho = false;
            let output: Output | null = null;
            let muxerWrites = Promise.resolve();

            // keep playback from swapping a sequence frame in between preparing and capturing one
            events.invoke('sequence.suspendPlayback');

            try {
                const { totalFrames, timelineFps: animFrameRate, duration, revealDuration, revealDotProfile } = await videoPreflight(videoSettings);
                if (revealDuration > duration && !videoSettings.revealShortClipConfirmed) {
                    const answer = await events.invoke('showPopup', {
                        type: 'okcancel',
                        header: i18n.t('video.reveal.shortTitle'),
                        message: i18n.t('video.reveal.shortMessage', { duration: duration.toFixed(2), reveal: revealDuration.toFixed(2) }),
                        okText: i18n.t('video.reveal.continue'),
                        cancelText: i18n.t('video.reveal.adjust')
                    });
                    if (answer.action !== 'ok') {
                        cancelled = true;
                        throw new DOMException('Video rendering cancelled', 'AbortError');
                    }
                }
                job.signal.throwIfAborted();
                events.fire('progressStart', i18n.t('panel.render.render-video'), true);
                progressStarted = true;
                restoreState = freezeEditorForVideo(scene);
                const { startFrame, frameRate, width, height, transparentBg, showDebug, format, codec: codecChoice, projection, levelHorizon } = videoSettings;

                const is360 = projection === 'equirect';

                // 360 mp4/mov exports have spherical metadata patched into the
                // finished buffer, so they render to memory with moov written
                // last (fastStart false) instead of streaming to disk
                const taggable = is360 && (format === 'mp4' || format === 'mov');

                const target = (transaction && !taggable) ? new StreamTarget(transaction.writable) : new BufferTarget();

                // Configure output format and codec from lookup maps (default to mp4/h264)
                const formatConfig = FORMAT_CONFIG[format] ?? FORMAT_CONFIG.mp4;
                const outputFormat = formatConfig.create(taggable || !!fileStream);
                const fileExtension = formatConfig.extension;

                const encoderConfig = buildVideoEncoderConfig(videoSettings);
                const codecType = getVideoCodecType(codecChoice);

                output = new Output({
                    format: outputFormat,
                    target
                });

                const videoSource = new EncodedVideoPacketSource(codecType);
                output.addVideoTrack(videoSource, {
                    rotation: 0,
                    frameRate
                });

                await awaitVideoTask(output.start(), job.signal);

                let encoderError: Error | null = null;
                let muxerError: Error | null = null;
                let muxerQueueSize = 0;

                // helper to create and configure a VideoEncoder instance
                const createEncoder = () => {
                    encoderError = null;
                    const enc = new VideoEncoder({
                        output: (chunk, meta) => {
                            const encodedPacket = EncodedPacket.fromEncodedChunk(chunk);
                            muxerQueueSize++;

                            // WebCodecs ignores a Promise returned by its output
                            // callback: awaiting the muxer here provides no
                            // backpressure, and a rejected write becomes an
                            // unhandled rejection that silently drops packets
                            // from the finished file. Chain the writes instead
                            // so failures surface via muxerError, muxerQueueSize
                            // drives backpressure in the encode loop, and every
                            // write has settled before output.finalize().
                            muxerWrites = muxerWrites
                            .then(async () => {
                                if (!muxerError && !job.signal.aborted) {
                                    await videoSource.add(encodedPacket, meta);
                                }
                            })
                            .catch((error) => {
                                muxerError = error instanceof Error ? error : new Error(String(error));
                                job.abort(muxerError);
                            })
                            .finally(() => {
                                muxerQueueSize--;
                            });
                        },
                        error: (error) => {
                            encoderError = error;
                            job.abort(error);
                        }
                    });
                    try {
                        enc.configure(encoderConfig);
                    } catch (error) {
                        enc.close();
                        throw error;
                    }
                    return enc;
                };

                // fail fast on unsupported configurations (e.g. encoder
                // dimension limits) instead of erroring mid-render
                const support = await VideoEncoder.isConfigSupported(encoderConfig);
                if (!support.supported) {
                    throw new Error(`Unsupported video configuration (${codecChoice} @ ${width}x${height})`);
                }

                encoder = createEncoder();

                // in 360 mode the offscreen target is a square cube face; the
                // equirect target holds the output-sized frame
                const faceSize = Math.min(height, scene.graphicsDevice.maxTextureSize);

                // start rendering to offscreen buffer only
                scene.camera.startOffscreenMode(is360 ? faceSize : width, is360 ? faceSize : height);
                scene.camera.renderOverlays = is360 ? false : showDebug;
                scene.gizmoLayer.enabled = false;
                scene.centersLayer.enabled = false;
                if (!transparentBg && !scene.backgroundRenderer.enabled) {
                    scene.camera.clearPass.setClearColor(events.invoke('bgClr'));
                }
                scene.lockedRenderMode = true;

                if (is360) {
                    savedFov = scene.camera.fov;
                    savedOrtho = scene.camera.ortho;
                    equirect = new EquirectRenderer(scene.graphicsDevice, faceSize, width, height);
                    scene.camera.ortho = false;
                }

                // cpu-side buffer to read pixels into
                const data = new Uint8Array(width * height * 4);

                // prepare the frame for rendering, returns the newly loaded splat if any
                const prepareFrame = async (timelineFrame: number, outputTime: number) => {
                    job.signal.throwIfAborted();
                    events.fire('timeline.time', timelineFrame);
                    await awaitVideoTask(events.invoke<Promise<unknown>>('plysequence.setFrameAsync', Math.floor(timelineFrame)), job.signal);
                    scene.camera.onUpdate(0);
                    if (videoSettings.reveal === 'viewer') {
                        reveal ??= new VideoReveal(scene, visibleRevealSplats(scene), revealDotProfile);
                        await reveal.prepare(outputTime, job.signal);
                    }
                    events.fire('render.videoSample', { seconds: outputTime, timelineFrame });
                    // Every render projects and sorts this exact camera/effect sample on the GPU.
                };

                // wrap and submit the pixels currently in the data buffer
                const encodeFrame = async (frameTime: number) => {
                    job.signal.throwIfAborted();
                    // wait for encoder queue to drain if necessary (backpressure handling)
                    while (encoder.encodeQueueSize > MAX_QUEUE_SIZE) {
                        job.signal.throwIfAborted();
                        await waitForVideoEncoder(encoder, job.signal);
                    }
                    // muxerQueueSize is decremented by the write chain settling
                    // during the await

                    while (muxerQueueSize > MAX_QUEUE_SIZE) {
                        await awaitVideoTask(muxerWrites, job.signal);
                    }

                    // A reclaimed encoder cannot safely resume this muxed file.
                    if (encoder.state === 'closed') throw encoderError ?? new Error('Video encoder closed; retry the whole video');

                    // check for non-recoverable encoder errors
                    if (encoderError || muxerError) {
                        throw encoderError ?? muxerError;
                    }
                    const index = Math.round(frameTime * frameRate);
                    const sample = videoFrameSample(index, startFrame, animFrameRate, frameRate);
                    const videoFrame = new VideoFrame(data, {
                        format: 'RGBA',
                        codedWidth: width,
                        codedHeight: height,
                        timestamp: sample.timestamp,
                        duration: sample.duration
                    });
                    try {
                        job.signal.throwIfAborted();
                        encoder.encode(videoFrame, { keyFrame: index === 0 });
                    } finally {
                        videoFrame.close();
                    }
                };

                // capture the current video frame
                const captureFrame = async (frameTime: number) => {
                    const { mainTarget, workTarget } = scene.camera;

                    scene.dataProcessor.copyRt(mainTarget, workTarget, scene.overdrawRender);

                    // read the rendered frame (immediate: see render.offscreen)
                    await awaitVideoTask(readBackground(workTarget, data, !transparentBg), job.signal);

                    await encodeFrame(frameTime);
                };


                // work objects for 360 capture
                const camPos = new Vec3();
                const vec = new Vec3();
                const qCapture = new Quat();
                const qWorld = new Quat();

                // capture a 360 frame: render the six cube faces from the
                // animated camera position, re-sorting splats per face
                // direction, then project to equirect and encode
                const capture360 = async (frameTime: number) => {
                    // snapshot the animated camera pose. supersplat cameras
                    // never roll, so with level horizon the capture frame is
                    // the camera yaw, otherwise yaw and pitch
                    camPos.copy(scene.camera.position);
                    if (levelHorizon ?? true) {
                        qCapture.setFromEulerAngles(0, scene.camera.azim, 0);
                    } else {
                        qCapture.copy(scene.camera.mainCamera.getRotation());
                    }

                    // all faces share direction-independent clipping planes so
                    // near-plane culling cannot differ across a face boundary
                    const boundRadius = scene.bound.halfExtents.length();
                    const dist = vec.sub2(scene.bound.center, camPos).length();
                    const far = dist + boundRadius;
                    const near = Math.max(1e-6, dist < boundRadius ? far / (1024 * 16) : dist - boundRadius);

                    for (let face = 0; face < 6; face++) {
                        // check for cancellation
                        job.signal.throwIfAborted();

                        qWorld.mul2(qCapture, EquirectRenderer.faceRotations[face]);
                        scene.camera.setPoseOverride({
                            position: camPos,
                            rotation: qWorld,
                            fov: EquirectRenderer.faceFov,
                            near,
                            far
                        });


                        // render a frame
                        await nextVideoFrame(scene, job.signal);

                        scene.dataProcessor.copyRt(scene.camera.mainTarget, equirect.faceTargets[face]);

                        const frameIndex = Math.round(frameTime * frameRate);
                        events.fire('progressUpdate', {
                            text: i18n.t('panel.render.rendering', { ellipsis: true }),
                            progress: (100 * (frameIndex + (face + 1) / 6)) / totalFrames
                        });
                    }

                    // project the faces to the equirect target and encode
                    equirect.project();
                    await awaitVideoTask(readBackground(equirect.equirectTarget, data, !transparentBg), job.signal);
                    await encodeFrame(frameTime);
                };

                for (let frameIndex = 0; frameIndex < totalFrames; frameIndex++) {
                    job.signal.throwIfAborted();
                    const sample = videoFrameSample(frameIndex, startFrame, animFrameRate, frameRate);
                    const frameTime = sample.seconds;

                    if (is360) {
                        // restore animated-pose evaluation before the timeline
                        // advances (fov feeds the tween-to-position mapping)
                        scene.camera.setPoseOverride(null);
                        scene.camera.fov = savedFov;

                        // prepare the frame (loads PLY if needed, updates camera)
                        await prepareFrame(sample.timelineFrame, frameTime);

                        await capture360(frameTime);
                    } else {
                        // prepare the frame (loads PLY if needed, updates camera, sorts)
                        await prepareFrame(sample.timelineFrame, frameTime);

                        // render a frame
                        await nextVideoFrame(scene, job.signal);

                        // wait for capture
                        await captureFrame(frameTime);

                        events.fire('progressUpdate', {
                            text: i18n.t('panel.render.rendering', { ellipsis: true }),
                            progress: 100 * (frameIndex + 1) / totalFrames
                        });
                    }
                }

                // Flush and finalize output
                await awaitVideoTask(encoder.flush(), job.signal);
                await awaitVideoTask(muxerWrites, job.signal);
                if (muxerError) {
                    throw muxerError;
                }
                await awaitVideoTask(output.finalize(), job.signal);
                job.signal.throwIfAborted();

                const filename = () => `${baseFilename()}.${fileExtension}`;

                if (taggable) {
                    // patch spherical metadata into the finished buffer so
                    // players auto-detect the equirectangular projection
                    if (!cancelled) {
                        let buffer = (target as BufferTarget).buffer;
                        try {
                            buffer = injectSphericalMetadata(buffer);
                        } catch (error) {
                            console.warn(`failed to inject spherical metadata: ${error.message ?? error}`);
                        }

                        if (transaction) {
                            await awaitVideoTask(transaction.writeBuffer(buffer), job.signal);
                        } else {
                            downloadFile(buffer, filename());
                        }
                    }

                } else if (!cancelled && !fileStream) {
                    // Only a completely finalized buffer is offered for download.
                    downloadFile((target as BufferTarget).buffer, filename());
                }

                job.signal.throwIfAborted();
                if (transaction) {
                    // Once the atomic close begins, cancellation can no longer
                    // truthfully promise the old file was preserved.
                    committing = true;
                    events.fire('progressUpdate', { text: i18n.t('video.reveal.saving'), progress: 100 });
                    await awaitVideoTask(transaction.commit(), job.signal);
                }

                completed = !cancelled;
            } catch (error) {
                failure = error;
                job.abort(error);
                // stop the encoder so no further packets are queued while
                // cleaning up
                if (encoder && encoder.state !== 'closed') {
                    encoder.close();
                }

                // Abort the uncommitted destination before draining the proxy.
                // Never close a failed write or remove a user's existing file.
                if (transaction) {
                    try {
                        await finishVideoCleanup(transaction.abort());
                    } catch (cleanupError) {
                        failure = cleanupError;
                        cancelled = false;
                    }
                }
                if (output) {
                    try {
                        await finishVideoCleanup(muxerWrites.then(() => output.cancel()));
                    } catch {
                        // output already finalized or its target already closed
                    }
                }

            } finally {
                events.invoke('sequence.resumePlayback');
                // A failed GPU cleanup must not prevent the remaining state,
                // worker, event, UI and Web Lock cleanup from running.
                const clean = (task: () => void) => {
                    try {
                        task();
                    } catch (error) {
                        failure ??= error;
                        cancelled = false;
                    }
                };
                clean(() => {
                    if (encoder && encoder.state !== 'closed') encoder.close();
                });
                clean(() => cancelHandler.off());
                clean(() => lostHandler.off());
                clean(() => reveal?.destroy());
                clean(() => {
                    if (equirect) {
                        scene.camera.setPoseOverride(null);
                        scene.camera.fov = savedFov;
                        scene.camera.ortho = savedOrtho;
                        equirect.destroy();
                        equirect = null;
                    }
                });
                clean(() => restoreState?.());
                clean(() => {
                    if (progressStarted) events.fire('progressEnd');
                });
                if (failure && !cancelled) {
                    await events.invoke('showPopup', {
                        type: 'error',
                        header: i18n.t('panel.render.failed'),
                        message: `${(failure as Error).message ?? failure}`
                    });
                }
            }
            return completed && !failure && !cancelled;
        };

        // Acquire a Web Lock during encoding to signal the browser that this tab is
        // actively working, which helps prevent aggressive background throttling and
        // codec reclamation.
        try {
            if (navigator.locks) {
                return await navigator.locks.request('supersplat-video-render', { ifAvailable: true }, async (lock) => {
                    if (!lock) {
                        await fileStream?.abort();
                        throw new Error(i18n.t('video.reveal.busy'));
                    }
                    return renderImpl();
                });
            }
            return await renderImpl();
        } finally {
            videoActive = false;
        }
    });
};

export { ImageSettings, registerRenderEvents };
export type { VideoSettings } from './video-config';
