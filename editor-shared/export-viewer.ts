// This lazy export chunk contains the entire, fingerprinted Metaflow runtime.
// It is produced by the Viewer build first; no platform runtime is fetched by exported files.
import { renderViewerHtml, css, js } from '../metaflow-viewer/dist/index.js';
export { css, js };
export const viewerHtml = (contentUrl: string, contentFilename: string, settings: unknown, bundled: boolean) =>
    renderViewerHtml({
        standalone: true,
        baseHref: './',
        inlineCss: bundled,
        inlineJs: bundled,
        bootstrap: { contentUrl, contentFilename, settings }
    });
export const modelDataUrl = (bytes: Uint8Array) => {
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += 32768) chunks.push(String.fromCharCode(...bytes.subarray(i, i + 32768)));
    return `data:application/octet-stream;base64,${btoa(chunks.join(''))}`;
};
