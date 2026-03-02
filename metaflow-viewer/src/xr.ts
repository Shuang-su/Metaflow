import {
    Color,
    Entity,
    Quat,
    Vec3,
    type CameraComponent
} from 'playcanvas';
import { XrControllers } from 'playcanvas/scripts/esm/xr-controllers.mjs';
import { XrNavigation } from 'playcanvas/scripts/esm/xr-navigation.mjs';

import { Global } from './types';

// XR clipping planes optimized for VR/AR headsets (meters)
const XR_NEAR_CLIP = 0.01;   // 1cm - close enough for hand interaction
const XR_FAR_CLIP = 1000;    // 1km - covers large outdoor scenes

const initXr = (global: Global) => {
    const { app, events, state, camera } = global;

    state.hasAR = app.xr.isAvailable('immersive-ar');
    state.hasVR = app.xr.isAvailable('immersive-vr');

    // dynamically update XR availability (e.g. headset connected/disconnected)
    app.xr.on('available:immersive-ar', (available) => {
        state.hasAR = available;
    });
    app.xr.on('available:immersive-vr', (available) => {
        state.hasVR = available;
    });

    const parent = camera.parent as Entity;
    const clearColor = new Color();

    const parentPosition = new Vec3();
    const parentRotation = new Quat();
    const cameraPosition = new Vec3();
    const cameraRotation = new Quat();
    const angles = new Vec3();

    // cache pre-XR clipping planes for restoration
    let savedNearClip = 0;
    let savedFarClip = 0;

    parent.addComponent('script');
    parent.script.create(XrControllers);
    parent.script.create(XrNavigation);

    app.xr.on('start', () => {
        // enable continuous rendering for XR (headset requires every-frame updates)
        app.autoRender = true;

        // cache original camera rig positions and rotations
        parentPosition.copy(parent.getPosition());
        parentRotation.copy(parent.getRotation());
        cameraPosition.copy(camera.getPosition());
        cameraRotation.copy(camera.getRotation());

        cameraRotation.getEulerAngles(angles);

        // copy transform to parent so XR mode starts in the right place
        parent.setPosition(cameraPosition.x, 0, cameraPosition.z);
        parent.setEulerAngles(0, angles.y, 0);

        // set VR/AR-appropriate clipping planes
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

        // restore clipping planes
        camera.camera.nearClip = savedNearClip;
        camera.camera.farClip = savedFarClip;

        if (app.xr.type === 'immersive-ar') {
            camera.camera.clearColor = clearColor;
        }
    });

    // log XR session errors for debugging on headset browsers
    app.xr.on('error', (err: Error) => {
        console.warn('[XR] Session error:', err.message);
    });

    events.on('startAR', () => {
        // set up DOM overlay for AR mode (allows HTML UI over camera passthrough)
        if (app.xr.domOverlay?.supported) {
            app.xr.domOverlay.root = document.getElementById('ui');
        }

        // pre-set XR clipping before session start (engine copies at start time)
        camera.camera.nearClip = XR_NEAR_CLIP;
        camera.camera.farClip = XR_FAR_CLIP;

        app.xr.start(app.root.findComponent('camera') as CameraComponent, 'immersive-ar', 'local-floor', {
            optionalFeatures: ['anchors', 'plane-detection']
        });
    });

    events.on('startVR', () => {
        // pre-set XR clipping before session start (engine copies at start time)
        camera.camera.nearClip = XR_NEAR_CLIP;
        camera.camera.farClip = XR_FAR_CLIP;

        app.xr.start(app.root.findComponent('camera') as CameraComponent, 'immersive-vr', 'local-floor');
    });

    events.on('inputEvent', (event) => {
        if (event === 'cancel' && app.xr.active) {
            app.xr.end();
        }
    });
};

export { initXr };
