/** Keep this predicate self-contained: the hosted HTML inlines its source. */
export function isAppleMobileWebKit(client = {}) {
    const userAgent = client.userAgent || '';
    const appleMobile =
        /iPad|iPhone|iPod/.test(userAgent) || (client.platform === 'MacIntel' && client.maxTouchPoints > 1);
    return appleMobile && /AppleWebKit\//.test(userAgent);
}

/** Hosted-site policy only; the SDK and exported HTML retain their renderer defaults. */
export function selectHostedRenderer(params, appleMobileWebKit) {
    // XR recovery appends webgl without removing other flags, so it must win.
    if (params.has('webgl')) return 'webgl';
    if (params.has('webgpu') || params.has('stochastic') || params.has('heatmap')) return 'webgpu';
    return appleMobileWebKit ? 'webgl' : 'webgpu';
}

/** Apply before texture loading, including when device creation fell back from WebGPU. */
export function configureWebglImageDecoding(device, appleMobileWebKit) {
    // Embedded WKWebViews can omit the Safari UA token used by the engine's guard.
    // WebGL supports HTMLImageElement uploads; WebGPU requires a different fix.
    if (device.deviceType === 'webgl2' && appleMobileWebKit) {
        device.supportsImageBitmap = false;
    }
}
