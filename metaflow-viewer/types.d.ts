/* eslint-disable no-unused-vars */
interface Window {
    sse: {
        config: Record<string, unknown>,
        settings: Promise<object>,
        viewer?: object,
    }
    sseReady: Promise<Window['sse']>;

    viewer?: object;
    firstFrame?: () => void;
    scrubTo?: (time: number) => Promise<void>;
    animationDuration?: number;
    getCameraPose?: () => object | null;
    logCameraPose?: () => object | null;
    getCameraState?: () => object;
    setCameraState?: (snapshot: any) => void;
}

declare module 'playcanvas/scripts/esm/xr/xr-controllers.mjs' {
    const XrControllers: any;
    export { XrControllers };
}

declare module 'playcanvas/scripts/esm/xr-navigation.mjs' {
    const XrNavigation: any;
    export { XrNavigation };
}

declare module '*.html' {
    const content: string;
    export default content;
}

declare module '*.css' {
    const content: string;
    export default content;
}

declare module '*.js' {
    const content: string;
    export default content;
}
