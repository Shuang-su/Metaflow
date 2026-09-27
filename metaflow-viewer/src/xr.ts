import { Color, DEVICETYPE_WEBGL2, XrManager } from 'playcanvas';
import type { Entity } from 'playcanvas';
import { XrControllers } from 'playcanvas/scripts/esm/xr/xr-controllers.mjs';

import { localize } from './localization';
import type { Global } from './types';
import { headYaw } from './xr/locomotion';
import { ensureNativeXrResolution, XR_NEAR_CLIP, XR_FAR_CLIP } from './xr/presentation';
import { captureSessionState } from './xr/session-state';
import { XrVrNavigation } from './xr-navigation';

const initXr = (global: Global) => {
    const { app, events, state, camera, renderer, config } = global;
    let webglAR = false;
    let webglVR = false;
    const updateAvailable = () => {
        state.hasAR = app.xr.isAvailable('immersive-ar') || webglAR;
        state.hasVR = app.xr.isAvailable('immersive-vr') || webglVR;
    };
    updateAvailable();
    app.xr.on('available', updateAvailable);
    if (renderer === 'webgpu') {
        Promise.all([
            XrManager.isDeviceSupported(DEVICETYPE_WEBGL2, 'immersive-ar'),
            XrManager.isDeviceSupported(DEVICETYPE_WEBGL2, 'immersive-vr')
        ])
            .then(([ar, vr]) => {
                webglAR = ar;
                webglVR = vr;
                updateAvailable();
            })
            .catch((err: unknown) => console.warn('[XR] Unable to probe the WebGL fallback:', err));
    }
    global.collisionStatus =
        config.voxelUrl || config.voxelManifestUrl || config.collisionUrl ? 'loading' : 'unavailable';
    const parent = camera.parent as Entity;
    if (!parent.script) parent.addComponent('script');
    parent.script.create(XrControllers);
    const navigation = parent.script.create(XrVrNavigation) as unknown as XrVrNavigation;
    navigation.configure(global);

    let restore: (() => void) | null = null;
    let requestedMode: 'immersive-ar' | 'immersive-vr' = 'immersive-vr';
    let entryPosition = camera.getPosition().clone();
    let entryYaw = 0;
    let generation = 0;
    let savedCanvasParent: ParentNode | null = null;
    let savedCanvasNext: ChildNode | null = null;

    const finish = () => {
        navigation.endSession();
        restore?.();
        restore = null;
        const canvas = app.graphicsDevice.canvas;
        if (savedCanvasParent && canvas.parentNode !== savedCanvasParent) {
            savedCanvasParent.insertBefore(
                canvas,
                savedCanvasNext?.parentNode === savedCanvasParent ? savedCanvasNext : null
            );
        }
        state.xrStatus = 'idle';
        app.renderNextFrame = true;
    };
    const end = () => {
        if (state.xrStatus !== 'active') return;
        state.xrStatus = 'ending';
        navigation.endSession();
        app.xr.end((err?: Error) => {
            if (err) {
                state.xrError = localize('xr.failed');
                queueMicrotask(finish);
            }
        });
    };
    const fail = (err: Error) => {
        if (state.xrStatus === 'idle' || state.xrStatus === 'ending') return;
        console.warn('[XR] Session error:', err.message);
        const canceled = err.name === 'NotAllowedError' || err.name === 'AbortError';
        state.xrError = localize(
            canceled ? 'xr.canceled' : requestedMode === 'immersive-ar' ? 'xr.ar-failed' : 'xr.failed'
        );
        global.analytics.track('xr_failed', {
            xr_mode: requestedMode === 'immersive-ar' ? 'AR' : 'VR',
            reason: err.name || 'session_error'
        });
        const current = generation;
        const done = () =>
            queueMicrotask(() => {
                if (current === generation) finish();
            });
        state.xrStatus = 'ending';
        if (app.xr.session) app.xr.session.end().then(done, done);
        else done();
    };

    app.xr.on('start', () => {
        if (!restore || state.xrStatus !== 'starting') {
            app.xr.end();
            return;
        }
        state.xrStatus = 'active';
        state.xrError = '';
        app.autoRender = true;
        camera.camera.nearClip = XR_NEAR_CLIP;
        camera.camera.farClip = XR_FAR_CLIP;
        try {
            ensureNativeXrResolution(global, window.devicePixelRatio, fail);
        } catch (err) {
            fail(err as Error);
        }
        if (state.xrStatus !== 'active') return;
        if (requestedMode === 'immersive-ar') camera.camera.clearColor = new Color(0, 0, 0, 0);
        // The desktop preference is untouched. A URL budget remains an explicit session override.
        app.scene.gsplat.splatBudget = config.budget && config.budget > 0 ? config.budget * 1e6 : 1e6;
        app.scene.gsplat.colorUpdateAngle = 1;
        app.scene.gsplat.lodUpdateAngle = 15;
        app.scene.gsplat.lodBehindPenalty = 2;
        navigation.startSession(entryPosition, entryYaw, requestedMode === 'immersive-vr');
        global.analytics.track('xr_started', { xr_mode: requestedMode === 'immersive-ar' ? 'AR' : 'VR' });
    });
    app.xr.on('end', () => {
        navigation.endSession();
        state.xrStatus = 'ending';
        // XrManager clears active/type only after its end listeners have returned.
        queueMicrotask(finish);
    });
    app.xr.on('error', fail);

    const start = (type: 'immersive-ar' | 'immersive-vr') => {
        if (state.xrStatus !== 'idle' || app.xr.active) return;
        if (!state.loaded) {
            state.xrError = localize('xr.loading');
            return;
        }
        state.xrError = '';
        state.xrStatus = 'starting';
        requestedMode = type;
        generation++;
        entryPosition = camera.getPosition().clone();
        entryYaw = headYaw(camera);
        restore = captureSessionState(global);
        savedCanvasParent = app.graphicsDevice.canvas.parentNode;
        savedCanvasNext = app.graphicsDevice.canvas.nextSibling;
        camera.camera.nearClip = XR_NEAR_CLIP;
        camera.camera.farClip = XR_FAR_CLIP;
        if (type === 'immersive-ar' && app.xr.domOverlay?.supported)
            app.xr.domOverlay.root = document.getElementById('ui');
        try {
            app.xr.start(camera.camera, type, 'local-floor', {
                framebufferScaleFactor: 1,
                optionalFeatures: type === 'immersive-ar' ? ['anchors', 'plane-detection'] : [],
                callback: (err?: Error) => {
                    if (err) fail(err);
                }
            });
        } catch (err) {
            fail(err as Error);
        }
    };
    events.on('startAR', () => start('immersive-ar'));
    events.on('startVR', () => start('immersive-vr'));
    events.on('endXR', end);
    events.on('inputEvent', (event) => {
        if (event === 'cancel') end();
    });
};

export { initXr };
