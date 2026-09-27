import type { GSplatHandler } from 'playcanvas';

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
    const delegate = handler.parsers.reverse().find((parser) => parser.canParse(context));
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
                const valid =
                    meta &&
                    typeof meta === 'object' &&
                    ['means', 'quats', 'scales', 'sh0'].every(
                        (key) =>
                            Array.isArray(meta[key]?.files) &&
                            meta[key].files.length >= (key === 'means' ? 2 : 1) &&
                            meta[key].files.every((file: unknown) => typeof file === 'string')
                    ) &&
                    (meta.version === 2 ? Number.isFinite(meta.count) : Array.isArray(meta.means.shape));
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
