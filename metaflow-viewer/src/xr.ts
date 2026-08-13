import { Color, Quat, Vec3 } from 'playcanvas';
import type { Entity, CameraComponent } from 'playcanvas';
import { XrControllers } from 'playcanvas/scripts/esm/xr/xr-controllers.mjs';

import type { Global } from './types';
import { XrVrNavigation } from './xr-navigation';

// XR clipping planes optimized for headset navigation in large Metaflow scenes.
const XR_NEAR_CLIP = 0.01;
const XR_FAR_CLIP = 1000;

const initXr = (global: Global) => {
    const { app, events, state, camera, renderer } = global;

    state.hasAR = app.xr.isAvailable('immersive-ar');
    state.hasVR = app.xr.isAvailable('immersive-vr');

    // Dynamically update XR availability as headsets connect/disconnect.
    app.xr.on('available:immersive-ar', (available) => {
        state.hasAR = available;
    });
    app.xr.on('available:immersive-vr', (available) => {
        state.hasVR = available;
    });

    // XR sessions require a WebGL device; under WebGPU we only expose availability so
    // the UI can offer to reload the viewer in WebGL mode.
    if (renderer !== 'webgl') {
        return;
    }

    const parent = camera.parent as Entity;
    const clearColor = new Color();

    const parentPosition = new Vec3();
    const parentRotation = new Quat();
    const cameraPosition = new Vec3();
    const cameraRotation = new Quat();
    const angles = new Vec3();

    let savedNearClip = 0;
    let savedFarClip = 0;

    parent.addComponent('script');
    parent.script.create(XrControllers);
    // Metaflow uses custom VR locomotion: dual sticks map to move + smooth yaw,
    // while single-stick headsets still get movement. Upstream XrNavigation only
    // covers the simpler default behavior.
    parent.script.create(XrVrNavigation);

    app.xr.on('start', () => {
        global.analytics.track('xr_started', {
            xr_mode: app.xr.type === 'immersive-ar' ? 'AR' : 'VR'
        });
        app.autoRender = true;

        // cache original camera rig positions and rotations
        parentPosition.copy(parent.getPosition());
        parentRotation.copy(parent.getRotation());
        cameraPosition.copy(camera.getPosition());
        cameraRotation.copy(camera.getRotation());

        cameraRotation.getEulerAngles(angles);

        // copy transform to parent so XR/VR mode starts in the right place
        parent.setPosition(cameraPosition.x, 0, cameraPosition.z);
        parent.setEulerAngles(0, angles.y, 0);

        savedNearClip = camera.camera.nearClip;
        savedFarClip = camera.camera.farClip;
        camera.camera.nearClip = XR_NEAR_CLIP;
        camera.camera.farClip = XR_FAR_CLIP;

        if (app.xr.type === 'immersive-ar') {
            clearColor.copy(camera.camera.clearColor);
            camera.camera.clearColor = new Color(0, 0, 0, 0);
        }
    });

    app.xr.on('end', () => {
        app.autoRender = false;

        // restore camera to pre-XR state
        parent.setPosition(parentPosition);
        parent.setRotation(parentRotation);
        camera.setPosition(cameraPosition);
        camera.setRotation(cameraRotation);

        camera.camera.nearClip = savedNearClip;
        camera.camera.farClip = savedFarClip;

        if (app.xr.type === 'immersive-ar') {
            camera.camera.clearColor = clearColor;
        }

        // Restore the canvas to the correct position in the DOM after exiting XR. In
        // some browsers (e.g. Chrome on Android) the canvas is moved to a new root
        // during XR, and needs to be moved back on exit.
        requestAnimationFrame(() => {
            document.body.prepend(app.graphicsDevice.canvas);
            app.renderNextFrame = true;
        });
    });

    app.xr.on('error', (err: Error) => {
        console.warn('[XR] Session error:', err.message);
        global.analytics.track('xr_failed', {
            xr_mode: app.xr.type === 'immersive-ar' ? 'AR' : 'VR',
            reason: err.message
        });
    });

    const start = (type: 'immersive-ar' | 'immersive-vr') => {
        // Pre-set clipping before session start because some browsers copy
        // the camera parameters as the XR session is created.
        camera.camera.nearClip = XR_NEAR_CLIP;
        camera.camera.farClip = XR_FAR_CLIP;

        if (type === 'immersive-ar') {
            // AR passthrough still needs HTML controls overlaid for Metaflow.
            if (app.xr.domOverlay?.supported) {
                app.xr.domOverlay.root = document.getElementById('ui');
            }
            app.xr.start(app.root.findComponent('camera') as CameraComponent, type, 'local-floor', {
                optionalFeatures: ['anchors', 'plane-detection']
            });
        } else {
            app.xr.start(app.root.findComponent('camera') as CameraComponent, type, 'local-floor');
        }
    };

    events.on('startAR', () => start('immersive-ar'));
    events.on('startVR', () => start('immersive-vr'));

    events.on('inputEvent', (event) => {
        if (event === 'cancel' && app.xr.active) {
            app.xr.end();
        }
    });
};

export { initXr };
