const metaflowEditorVersion = {
    productName: 'Metaflow Editor',
    displayVersion: '1.1',
    appSemver: '1.1.0',
    upstreamVersion: '2.28.0'};
const metaflowEditorLabel = `${metaflowEditorVersion.productName} v${metaflowEditorVersion.displayVersion}`;
const serviceWorkerCacheName = `metaflow-editor-v${metaflowEditorVersion.appSemver}-ss${metaflowEditorVersion.upstreamVersion}`;

const cacheName = serviceWorkerCacheName;
const cacheUrls = [
    './',
    './index.css',
    './index.html',
    './index.js',
    './index.js.map',
    './manifest.json',
    './version.json',
    './static/icons/logo-192.png',
    './static/icons/logo-512.png',
    './static/images/screenshot-narrow.jpg',
    './static/images/screenshot-wide.jpg',
    './static/lib/lodepng/lodepng.js',
    './static/lib/lodepng/lodepng.wasm',
    './static/lib/webp/webp.mjs',
    './static/lib/webp/webp.wasm',
    './static/locales/de.json',
    './static/locales/en.json',
    './static/locales/es.json',
    './static/locales/fr.json',
    './static/locales/ja.json',
    './static/locales/ko.json',
    './static/locales/pt-BR.json',
    './static/locales/ru.json',
    './static/locales/zh-CN.json'
];
self.addEventListener('install', (event) => {
    console.log(`installing ${metaflowEditorLabel} cache ${cacheName}`);
    // create cache for current version
    event.waitUntil(caches.open(cacheName)
        .then((cache) => {
        cache.addAll(cacheUrls);
    }));
});
self.addEventListener('activate', () => {
    console.log(`activating ${metaflowEditorLabel} cache ${cacheName}`);
    // delete the old caches once this one is activated
    caches.keys().then((names) => {
        for (const name of names) {
            if (name !== cacheName) {
                caches.delete(name);
            }
        }
    });
});
self.addEventListener('fetch', (event) => {
    event.respondWith(caches.match(event.request)
        .then(response => response ?? fetch(event.request)));
});
//# sourceMappingURL=sw.js.map
