/* global self, URL, Response, MessageChannel, setTimeout, clearTimeout */
// Read-only, ephemeral file relay. Model bytes remain in the Studio tab, with no
// persistent Cache Storage / IndexedDB copy. Scope is this local preview route.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);
    const match = url.pathname.match(/^\/studio-preview\/([^/]+)\/(.+)$/);
    if (!match || url.origin !== self.location.origin) return;
    event.respondWith((async () => {
        if (!['GET', 'HEAD'].includes(event.request.method)) return new Response('Read only', { status: 405 });
        const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const replies = clients.filter(client => new URL(client.url).pathname.startsWith('/studio/')).map(client => new Promise((resolve) => {
            const channel = new MessageChannel();
            const timer = setTimeout(() => {
                channel.port1.close(); resolve(null);
            }, 5000);
            channel.port1.onmessage = (message) => {
                clearTimeout(timer); channel.port1.close(); resolve(message.data.file);
            };
            client.postMessage({ type: 'mf-studio-file', session: match[1], name: decodeURIComponent(match[2]) }, [channel.port2]);
        }));
        const file = (await Promise.all(replies)).find(Boolean);
        if (!file) return new Response('资产不可用。请保持 Studio 页面打开并重新预览。', { status: 404 });
        const range = event.request.headers.get('range');
        let start = 0, end = file.size - 1;
        if (range) {
            const parts = /^bytes=(\d+)-(\d*)$/.exec(range);
            if (!parts) return new Response(null, { status: 416 });
            start = Number(parts[1]); if (parts[2]) end = Math.min(Number(parts[2]), end);
            if (start > end || start >= file.size) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${file.size}` } });
        }
        const headers = { 'Content-Type': file.type || 'application/octet-stream', 'Content-Length': String(end - start + 1), 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store' };
        if (range) headers['Content-Range'] = `bytes ${start}-${end}/${file.size}`;
        return new Response(event.request.method === 'HEAD' ? null : file.slice(start, end + 1), { status: range ? 206 : 200, headers });
    })());
});
