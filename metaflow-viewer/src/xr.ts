import { DEVICETYPE_WEBGL2, math, Quat, Vec3, XrManager } from 'playcanvas';
import type { Entity } from 'playcanvas';
import { XrControllers } from 'playcanvas/scripts/esm/xr/xr-controllers.mjs';
import { XrManipulation } from 'playcanvas/scripts/esm/xr/xr-manipulation.mjs';

import type { Global, XrMode } from './types';
import { XrVrNavigation } from './xr-navigation';

// XR clipping planes optimized for headset navigation in large Metaflow scenes.
const XR_NEAR_CLIP = 0.01;
const XR_FAR_CLIP = 1000;

// Standalone headsets run XR on a mobile gpu, which draws every splat once per eye, but their
// browsers report a desktop platform. Their sessions render with fixed foveation and a 72 Hz
// target, at 0.8x resolution in performance mode, and the viewer lowers the splat budget.
const standaloneHeadset = /OculusBrowser|PicoBrowser/.test(globalThis.navigator?.userAgent ?? '');

// The viewer reconfigures the camera (clear color, post effects) when state.xrMode changes
const initXr = (global: Global) => {
    const { app, events, state, camera, renderer, root, sceneRoot } = global;
    const { xr } = app;
    let destroyed = false;
    let restoreFrame: number | null = null;
    let rejectStart: ((error: Error) => void) | null = null;
    let rejectEnd: ((error: Error) => void) | null = null;
    const gone = () => new Error('the viewer has been destroyed');

    // PlayCanvas availability is backend-aware. Under WebGPU a session is directly
    // available only when the browser can bind XR to the active GPU device. Keep a
    // separate WebGL capability result so the branded UI can offer an explicit
    // renderer reload without preventing native WebGPU/WebXR sessions.
    let webglAR = false;
    let webglVR = false;

    const updateAvailable = () => {
        if (destroyed) return;
        state.canStartAR = xr.isAvailable('immersive-ar');
        state.canStartVR = xr.isAvailable('immersive-vr');
        state.hasAR = state.canStartAR || webglAR;
        state.hasVR = state.canStartVR || webglVR;
    };

    updateAvailable();
    const availability = xr.on('available', updateAvailable);

    if (renderer === 'webgpu') {
        Promise.all([
            XrManager.isDeviceSupported(DEVICETYPE_WEBGL2, 'immersive-ar'),
            XrManager.isDeviceSupported(DEVICETYPE_WEBGL2, 'immersive-vr')
        ])
            .then(([ar, vr]) => {
                if (destroyed) return;
                webglAR = ar;
                webglVR = vr;
                updateAvailable();
            })
            .catch((error) => console.warn('[XR] WebGL fallback probe failed:', error));
    }

    const parent = camera.parent as Entity;

    const parentPosition = new Vec3();
    const parentRotation = new Quat();
    const cameraPosition = new Vec3();
    const cameraRotation = new Quat();

    let savedNearClip = 0;
    let savedFarClip = 0;
    let remembered = false;
    let savedAutoRender = false;
    const scenePosition = new Vec3();
    const sceneRotation = new Quat();
    const sceneScale = new Vec3();

    const remember = () => {
        if (remembered) return;
        remembered = true;
        savedNearClip = camera.camera.nearClip;
        savedFarClip = camera.camera.farClip;
        savedAutoRender = app.autoRender;
        parentPosition.copy(parent.getPosition());
        parentRotation.copy(parent.getRotation());
        cameraPosition.copy(camera.getPosition());
        cameraRotation.copy(camera.getRotation());
        scenePosition.copy(sceneRoot.getLocalPosition());
        sceneRotation.copy(sceneRoot.getLocalRotation());
        sceneScale.copy(sceneRoot.getLocalScale());
    };

    parent.addComponent('script');
    parent.script.create(XrControllers);
    // Metaflow uses custom VR locomotion: dual sticks map to move + smooth yaw,
    // while single-stick headsets still get movement. Upstream XrNavigation only
    // covers the simpler default behavior.
    const navigation = parent.script.create(XrVrNavigation) as XrVrNavigation;

    // Grabbing with both hands drags, turns and scales the scene. Created once the splat entity
    // it moves has loaded, which is before XR can start, and put back when the session ends, as
    // the viewer's camera, collision and annotations assume the authored placement.
    let manipulation: XrManipulation | null = null;

    const manipulationActive = app.on('xr:manipulation:active', (active: boolean) => {
        navigation.setManipulationActive(active && state.xrMode !== null);
    });

    const restore = () => {
        navigation.setManipulationActive(false);
        manipulation?.reset();
        if (remembered) {
            parent.setPosition(parentPosition);
            parent.setRotation(parentRotation);
            camera.setPosition(cameraPosition);
            camera.setRotation(cameraRotation);
            sceneRoot.setLocalPosition(scenePosition);
            sceneRoot.setLocalRotation(sceneRotation);
            sceneRoot.setLocalScale(sceneScale);
            camera.camera.nearClip = savedNearClip;
            camera.camera.farClip = savedFarClip;
            app.autoRender = savedAutoRender;
            remembered = false;
        }
        state.xrMode = null;
        app.renderNextFrame = true;
    };

    const started = xr.on('start', () => {
        if (destroyed) return;
        global.analytics.track('xr_started', { xr_mode: xr.type === 'immersive-ar' ? 'AR' : 'VR' });
        remember();
        app.autoRender = true;

        // cache original camera rig positions and rotations
        parentPosition.copy(parent.getPosition());
        parentRotation.copy(parent.getRotation());
        cameraPosition.copy(camera.getPosition());
        cameraRotation.copy(camera.getRotation());

        // Start the session where the camera is, facing its heading with pitch and roll reset:
        // where it looks across the ground, or where the top of its view points when it looks
        // straight up or down. The yaw of getEulerAngles() only covers -90 to 90 degrees, so a
        // camera facing further round would start the session facing the wrong way.
        const { forward } = camera;
        let x = forward.x;
        let z = forward.z;
        if (x * x + z * z < 1e-6) {
            const { up } = camera;
            const sign = forward.y < 0 ? 1 : -1;
            x = up.x * sign;
            z = up.z * sign;
        }
        parent.setPosition(cameraPosition.x, 0, cameraPosition.z);
        parent.setEulerAngles(0, Math.atan2(-x, -z) * math.RAD_TO_DEG, 0);

        camera.camera.nearClip = XR_NEAR_CLIP;
        camera.camera.farClip = XR_FAR_CLIP;

        if (standaloneHeadset) {
            xr.fixedFoveation = 1;
            if (xr.supportedFrameRates?.includes(72)) xr.updateTargetFrameRate(72);
        }

        // AR scales about the hands, for content brought to a tabletop; VR about the feet, so
        // the user stays standing on the scene
        if (manipulation) manipulation.scalePivot = xr.type === 'immersive-ar' ? 'hands' : 'feet';

        state.xrMode = xr.type === 'immersive-ar' ? 'ar' : 'vr';
    });

    const ended = xr.on('end', () => {
        if (destroyed) return;
        restore();

        // Restore the canvas to the correct position in the DOM after exiting XR. In
        // some browsers (e.g. Chrome on Android) the canvas is moved to a new root
        // during XR, and needs to be moved back on exit.
        if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
        restoreFrame = requestAnimationFrame(() => {
            restoreFrame = null;
            if (destroyed) return;
            root.prepend(app.graphicsDevice.canvas);
            app.renderNextFrame = true;
        });
    });

    const start = async (mode: XrMode) => {
        if (destroyed) throw gone();
        if (mode !== 'ar' && mode !== 'vr') throw new Error('startXR: mode must be ar or vr');
        if (rejectStart || rejectEnd || xr.active) throw new Error('startXR: a session is active or pending');
        global.analytics.track('xr_requested', { xr_mode: mode === 'ar' ? 'AR' : 'VR', renderer });
        const type = mode === 'ar' ? 'immersive-ar' : 'immersive-vr';
        if (!xr.isAvailable(type)) {
            const offered = mode === 'ar' ? state.hasAR : state.hasVR;
            throw new Error(
                offered ? 'startXR: reload with WebGL to start this session' : 'startXR: XR is not available'
            );
        }
        remember();
        camera.camera.nearClip = 0.01;
        camera.camera.farClip = 1000;
        if (mode === 'ar' && xr.domOverlay?.supported) xr.domOverlay.root = root;
        try {
            await new Promise<void>((resolve, reject) => {
                rejectStart = reject;
                xr.start(camera.camera, type, 'local-floor', {
                    optionalFeatures: mode === 'ar' ? ['anchors', 'plane-detection'] : [],
                    framebufferScaleFactor: standaloneHeadset && state.performanceMode ? 0.8 : 1,
                    callback: (error) => {
                        if (destroyed) {
                            // Browser session requests cannot be cancelled. Close a late result.
                            void xr.session?.end().catch(() => {
                                /* already ended */
                            });
                            reject(gone());
                        } else if (error) {
                            reject(error);
                        } else {
                            resolve();
                        }
                    }
                });
            });
            if (destroyed) throw gone();
        } catch (error) {
            global.analytics.track('xr_failed', { xr_mode: mode === 'ar' ? 'AR' : 'VR', reason: String(error) });
            if (!destroyed) restore();
            throw error;
        } finally {
            rejectStart = null;
        }
    };

    const end = async () => {
        if (destroyed) throw gone();
        if (rejectStart) throw new Error('endXR: a session is still starting');
        if (rejectEnd) throw new Error('endXR: a session is already ending');
        const { session } = xr;
        if (!session) return;
        let onEnd!: () => void;
        try {
            await new Promise<void>((resolve, reject) => {
                rejectEnd = reject;
                onEnd = resolve;
                xr.once('end', onEnd);
                // Use the native promise too: XrManager.end's callback does not report a
                // rejected session.end() promise. The engine handles browser-initiated ends.
                session.end().catch(reject);
            });
            if (destroyed) throw gone();
        } finally {
            xr.off('end', onEnd);
            rejectEnd = null;
        }
    };

    const cancel = events.on('inputEvent', (event) => {
        if (event === 'cancel' && xr.active) {
            void end().catch(() => {
                /* the browser may already be ending the session */
            });
        }
    });

    return {
        start,
        end,
        setManipulationTarget: (entity: Entity) => {
            if (manipulation) return;
            manipulation = parent.script.create(XrManipulation, {
                properties: { target: entity }
            }) as unknown as XrManipulation;
        },
        destroy: () => {
            restore();
            destroyed = true;
            manipulationActive.off();
            availability.off();
            started.off();
            ended.off();
            cancel.off();
            parent.script.destroy(XrManipulation);
            parent.script.destroy(XrVrNavigation);
            parent.script.destroy(XrControllers);
            if (restoreFrame !== null) cancelAnimationFrame(restoreFrame);
            rejectStart?.(gone());
            rejectEnd?.(gone());
            state.xrMode = null;
        }
    };
};

export { initXr, standaloneHeadset };
