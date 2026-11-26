import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const [baseline, viewer, editor, fixtures] = process.argv.slice(2).map(directory => path.resolve(directory));
if (!fixtures) throw new Error('Usage: node preview-server.mjs <baseline-site> <viewer-public> <editor-dist> <fixture-root>');

const mime = {
    '.bin': 'application/octet-stream', '.css': 'text/css', '.html': 'text/html',
    '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg', '.js': 'text/javascript',
    '.json': 'application/json', '.mjs': 'text/javascript', '.png': 'image/png',
    '.svg': 'image/svg+xml', '.wasm': 'application/wasm', '.webp': 'image/webp'
};

function inside(root, relative) {
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) throw new Error('Path outside served directory');
    return file;
}

function selectFile(url, edition) {
    const pathname = decodeURIComponent(url.pathname);
    const segments = pathname.split('/').filter(Boolean);
    if (segments.some(part => part === '..' || part.startsWith('.') || part.includes('\\'))) {
        throw new Error('Invalid resource path');
    }
    const relative = segments.join('/');
    if (segments[0] === 'sog-preview') return inside(fixtures, segments.slice(1).join('/'));
    if (segments[0] === 'editor') {
        const root = edition === 'editor' ? editor : path.join(baseline, 'editor');
        return inside(root, segments.slice(1).join('/') || 'index.html');
    }
    if (['data', 'director', 'editor-legacy'].includes(segments[0])) {
        return inside(baseline, relative + (pathname.endsWith('/') ? '/index.html' : ''));
    }
    const root = edition === 'viewer' ? viewer : baseline;
    return inside(root, path.extname(relative) ? relative : 'index.html');
}

function serve(edition, port) {
    createServer(async (req, res) => {
        try {
            if (!['GET', 'HEAD'].includes(req.method)) return res.writeHead(405).end();
            const url = new URL(req.url, 'http://127.0.0.1');
            const file = selectFile(url, edition);
            const info = await stat(file);
            if (!info.isFile()) return res.writeHead(404).end();
            const immutable = /^\/sog-preview\/[a-f0-9]{64}\//.test(url.pathname);
            res.writeHead(200, {
                'Content-Type': mime[path.extname(file)] ?? 'application/octet-stream',
                'Content-Length': info.size,
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache'
            });
            if (req.method === 'HEAD') return res.end();
            createReadStream(file).on('error', () => res.destroy()).pipe(res);
        } catch {
            res.writeHead(404).end();
        }
    }).listen(port, '127.0.0.1', () => console.log(`${edition} preview http://127.0.0.1:${port}`));
}

serve('viewer', 4391);
serve('editor', 4392);
