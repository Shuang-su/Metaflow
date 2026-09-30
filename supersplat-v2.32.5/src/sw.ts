import { metaflowEditorLabel, serviceWorkerCacheName } from './metaflow-editor-version';

// export default null
declare let self: ServiceWorkerGlobalScope;

// The build replaces this token with the application bundle's content hash.
// A source change must not keep serving the previous bundle at the same version.
const cacheName = `${serviceWorkerCacheName}-__METAFLOW_EDITOR_BUILD_ID__`;

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
    event.waitUntil(
        caches.open(cacheName)
        .then((cache) => {
            return cache.addAll(cacheUrls);
        })
    );
});

self.addEventListener('activate', (event) => {
    console.log(`activating ${metaflowEditorLabel} cache ${cacheName}`);

    // delete the old caches once this one is activated
    event.waitUntil(caches.keys().then(names => Promise.all(names
    .filter(name => name !== cacheName && (name.startsWith('metaflow-editor-') || name.startsWith('superSplat-v')))
    .map(name => caches.delete(name)))));
});

self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    event.respondWith(
        caches.open(cacheName).then(cache => cache.match(event.request))
        .then(response => response ?? fetch(event.request))
    );
});
