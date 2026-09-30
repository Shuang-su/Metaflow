// Local acceptance server. Never serves the workspace or a user's home directory.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const source = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const routes = new Map([
    ['/studio/', path.join(source, 'dist-studio')],
    ['/editor/', path.join(source, 'dist')],
    ['/viewer/', path.resolve(source, '../metaflow-viewer/public')],
    ['/legacy-editor/', path.resolve(source, '../metaflow-editor')]
]);
if (process.env.METAFLOW_TEST_FILES) routes.set('/generated/', path.resolve(process.env.METAFLOW_TEST_FILES));
// Viewer 5.19.1 intentionally resolves its assets at the origin root.
routes.set('/', path.resolve(source, '../metaflow-viewer/public'));
const mime = { '.html': 'text/html', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.webp': 'image/webp', '.jpg': 'image/jpeg', '.wasm': 'application/wasm', '.mp4': 'video/mp4', '.webm': 'video/webm' };

createServer(async (req, res) => {
    try {
        const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (pathname === '/studio/viewer-manifest.json') {
            const root = path.resolve(source, '../metaflow-viewer/public');
            const entries = await readdir(root, { recursive: true, withFileTypes: true });
            const names = entries.filter(e => e.isFile() && !e.name.endsWith('.map')).map(e => path.relative(root, path.join(e.parentPath, e.name)));
            res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(names)); return;
        }
        if (pathname === '/local-files-sw.js') {
            res.writeHead(200, { 'Content-Type': 'application/javascript', 'Cache-Control': 'no-store' });
            createReadStream(path.join(source, 'dist-studio/local-files-sw.js')).pipe(res); return;
        }
        const route = [...routes].find(([prefix]) => pathname.startsWith(prefix));
        if (!route || !['GET', 'HEAD'].includes(req.method)) { res.writeHead(404).end(); return; }
        const [prefix, root] = route;
        const file = path.resolve(root, pathname.slice(prefix.length) || 'index.html');
        if (!file.startsWith(`${root}${path.sep}`)) { res.writeHead(403).end(); return; }
        const info = await stat(file);
        if (!info.isFile()) { res.writeHead(404).end(); return; }
        const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
        const start = range ? Number(range[1]) : 0;
        const end = range && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
        if (start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }).end(); return; }
        res.writeHead(range ? 206 : 200, {
            'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
            'Content-Length': end - start + 1,
            'Cache-Control': 'no-store',
            ...(pathname.endsWith('/local-files-sw.js') ? { 'Service-Worker-Allowed': '/studio-preview/' } : {}),
            'Accept-Ranges': 'bytes',
            ...(range ? { 'Content-Range': `bytes ${start}-${end}/${info.size}` } : {})
        });
        if (req.method === 'HEAD') { res.end(); return; }
        createReadStream(file, { start, end }).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end(); }
}).listen(Number(process.env.STUDIO_PORT || 4368), '127.0.0.1', () => console.log('Metaflow Studio: http://127.0.0.1:' + (process.env.STUDIO_PORT || 4368) + '/studio/'));
