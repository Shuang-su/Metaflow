import type { GSplatHandler } from 'playcanvas';

const earlyV3Help =
    'SOG v3 files from SplatTransform 3.11.0 or 3.11.1 require Engine 2.24.0 or re-export from the original with 3.11.2.';

// Some historical LOD exports contain non-JSON bytes at a meta.json URL. The
// engine's JSON XHR returns null for these, then its async parser never calls
// the loader callback. Report a failed chunk so the LOD loader can fall back.
const installSogMetadataGuard = (handler: GSplatHandler) => {
    const context: Parameters<GSplatHandler['parsers'][number]['canParse']>[0] = {
        url: 'meta.json',
        ext: 'json',
        basename: 'meta.json',
        asset: undefined,
        app: handler.app
    };
    const bundleContext = { ...context, url: 'scene.sog', ext: 'sog', basename: 'scene.sog' };
    const bundle = [...handler.parsers].reverse().find((parser) => parser.canParse(bundleContext));
    if (bundle) {
        handler.addParser({
            canParse: (ctx) => ctx.ext === 'sog' && bundle.canParse(ctx),
            load: (url, callback, asset) => {
                bundle.load(
                    url,
                    (error, resource) => {
                        // Engine 2.24.1 expects quats.files on both bundle layouts it supports.
                        // Its parser reports a TypeError for early v3 bundles without quats.
                        const message = String(error);
                        callback(
                            error &&
                                (message.includes("Cannot read properties of undefined (reading 'files')") ||
                                    message.includes('meta.quats.files'))
                                ? `${message}. ${earlyV3Help}`
                                : error,
                            resource
                        );
                    },
                    asset
                );
            }
        });
    }
    const delegate = [...handler.parsers].reverse().find((parser) => parser.canParse(context));
    if (!delegate) return;
    const parser: GSplatHandler['parsers'][number] = {
        canParse: (ctx) => ctx.ext === 'json' && ctx.basename !== 'lod-meta.json' && delegate.canParse(ctx),
        load: (url, callback, asset) => {
            const location = typeof url === 'string' ? { load: url, original: url } : url;
            const accept = (error: string | null, value?: unknown) => {
                if (!asset || !handler.app.graphicsDevice || !handler.app.assets?.get(asset.id)) {
                    callback(null, null);
                    return;
                }
                const meta = value as Record<string, { files?: unknown; shape?: unknown }> & {
                    version?: number;
                    count?: number;
                };
                if (!error && meta?.version === 3 && !Array.isArray(meta.quats?.files)) {
                    callback(`Invalid SOG metadata: ${location.original} [missing rotation texture]. ${earlyV3Help}`);
                    return;
                }
                const valid =
                    meta &&
                    typeof meta === 'object' &&
                    ['means', 'quats', 'scales', 'sh0'].every(
                        (key) =>
                            Array.isArray(meta[key]?.files) &&
                            meta[key].files.length >= (key === 'means' ? 2 : 1) &&
                            meta[key].files.every((file: unknown) => typeof file === 'string')
                    ) &&
                    (meta.version === 2 || meta.version === 3
                        ? Number.isSafeInteger(meta.count) && Number(meta.count) > 0
                        : (meta.version === undefined || meta.version === 1) && Array.isArray(meta.means.shape));
                if (error || !valid) {
                    callback(`Invalid SOG metadata: ${location.original} [${error ?? 'missing texture metadata'}]`);
                    return;
                }
                asset.data = { ...asset.data, ...meta };
                delegate.load(location, callback, asset);
            };
            if ((asset?.data as { means?: unknown })?.means) accept(null, asset.data);
            else handler.fetch(location, 'json', accept, asset);
        }
    };
    handler.addParser(parser);
};

export { installSogMetadataGuard };
