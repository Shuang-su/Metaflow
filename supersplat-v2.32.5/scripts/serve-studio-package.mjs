// QA only: ordinary static serving, no workspace routes, generated manifests or SW headers.
import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import path from 'node:path';
if (!process.env.STUDIO_SITE_ROOT) throw new Error('Set STUDIO_SITE_ROOT to an extracted site directory');
const root = path.resolve(process.env.STUDIO_SITE_ROOT);
const types = { '.html': 'text/html', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.ttf': 'font/ttf', '.png': 'image/png', '.jpg': 'image/jpeg' };
createServer(async (req, res) => {
    try {
        if (!['GET', 'HEAD'].includes(req.method)) { res.writeHead(405).end(); return; }
        let url = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        if (url.endsWith('/')) url += 'index.html';
        const file = path.resolve(root, `.${url}`);
        if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
        const info = await stat(file);
        if (!info.isFile()) { res.writeHead(404).end(); return; }
        res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Content-Length': info.size, 'Cache-Control': 'no-cache' });
        if (req.method === 'HEAD') res.end(); else createReadStream(file).on('error', () => res.destroy()).pipe(res);
    } catch { res.writeHead(404).end(); }
}).listen(Number(process.env.STUDIO_SITE_PORT || 4369), '127.0.0.1');
