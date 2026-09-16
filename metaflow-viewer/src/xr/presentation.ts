import type { Global } from '../types';

/** Keep XR pixel density independent of the window's DPR and desktop quality settings. */
const ensureNativeXrResolution = (global: Global, pixelRatio: number, onError: (error: Error) => void): void => {
    const { app, camera } = global;
    // PlayCanvas 2.21.3 multiplies XR scale by maxPixelRatio / window.devicePixelRatio.
    // PICO changes the latter during entry (observed 1.25 -> 4), after device creation.
    if (Math.abs(app.graphicsDevice.maxPixelRatio / pixelRatio - 1) <= 0.001) return;
    app.xr.xrBridge.attachPresentation(app.xr.session, {
        framebufferScaleFactor: 1,
        depthNear: camera.camera.nearClip,
        depthFar: camera.camera.farClip,
        onBindingError: onError
    });
};

export { ensureNativeXrResolution };
