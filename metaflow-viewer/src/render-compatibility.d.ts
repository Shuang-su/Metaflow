type ClientPlatform = {
    userAgent?: string;
    platform?: string;
    maxTouchPoints?: number;
};

declare function isAppleMobileWebKit(client?: ClientPlatform): boolean;
declare function selectHostedRenderer(params: URLSearchParams, appleMobileWebKit: boolean): 'webgl' | 'webgpu';
declare function configureWebglImageDecoding(
    device: { deviceType: string; supportsImageBitmap?: boolean },
    appleMobileWebKit: boolean
): void;

export { isAppleMobileWebKit, selectHostedRenderer, configureWebglImageDecoding };
