import type { Global } from '../types';

const XR_NEAR_CLIP = 0.03;
const XR_FAR_CLIP = 1000;

/** Keep XR pixel density independent of the window's DPR and desktop quality settings. */
const ensureNativeXrResolution = (global: Global, pixelRatio: number, onError: (error: Error) => void): void => {
    const { app, camera } = global;
    // Keep culling metadata aligned with the requested stereo projection, without
    // changing the tracked eye transforms or the browser's field of view.
    camera.camera.camera.setXrProperties({ nearClip: XR_NEAR_CLIP, farClip: XR_FAR_CLIP });
    // PlayCanvas 2.21.3 multiplies XR scale by maxPixelRatio / window.devicePixelRatio.
    // PICO changes the latter during entry (observed 1.25 -> 4), after device creation.
    if (Math.abs(app.graphicsDevice.maxPixelRatio / pixelRatio - 1) <= 0.001) return;
    app.xr.xrBridge.attachPresentation(app.xr.session, {
        framebufferScaleFactor: 1,
        // The first XR frame can cache the browser's old projection on the camera.
        // Its getters then return that cache even after setting the component's clip planes.
        depthNear: XR_NEAR_CLIP,
        depthFar: XR_FAR_CLIP,
        onBindingError: onError
    });
};

export { ensureNativeXrResolution, XR_NEAR_CLIP, XR_FAR_CLIP };
