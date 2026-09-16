import type { Global } from '../types';

/** Capture before requesting XR: engines may alter the camera before emitting start. */
const captureSessionState = ({ app, camera }: Global) => {
    const rig = camera.parent;
    const saved = {
        rigPosition: rig.getLocalPosition().clone(),
        rigRotation: rig.getLocalRotation().clone(),
        cameraPosition: camera.getLocalPosition().clone(),
        cameraRotation: camera.getLocalRotation().clone(),
        near: camera.camera.nearClip,
        far: camera.camera.farClip,
        clearColor: camera.camera.clearColor.clone(),
        autoRender: app.autoRender,
        fov: camera.camera.fov,
        horizontalFov: camera.camera.horizontalFov,
        aspectRatio: camera.camera.aspectRatio,
        splatBudget: app.scene.gsplat.splatBudget,
        colorUpdateAngle: app.scene.gsplat.colorUpdateAngle,
        lodUpdateAngle: app.scene.gsplat.lodUpdateAngle,
        lodBehindPenalty: app.scene.gsplat.lodBehindPenalty
    };
    let restored = false;
    return () => {
        if (restored) return;
        restored = true;
        rig.setLocalPosition(saved.rigPosition);
        rig.setLocalRotation(saved.rigRotation);
        camera.setLocalPosition(saved.cameraPosition);
        camera.setLocalRotation(saved.cameraRotation);
        camera.camera.nearClip = saved.near;
        camera.camera.farClip = saved.far;
        camera.camera.clearColor = saved.clearColor;
        camera.camera.fov = saved.fov;
        camera.camera.horizontalFov = saved.horizontalFov;
        camera.camera.aspectRatio = saved.aspectRatio;
        app.scene.gsplat.splatBudget = saved.splatBudget;
        app.scene.gsplat.colorUpdateAngle = saved.colorUpdateAngle;
        app.scene.gsplat.lodUpdateAngle = saved.lodUpdateAngle;
        app.scene.gsplat.lodBehindPenalty = saved.lodBehindPenalty;
        app.autoRender = saved.autoRender;
        app.renderNextFrame = true;
    };
};

export { captureSessionState };
