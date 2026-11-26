// Compatibility endpoint for pre-1.2 Editor installations. It retires only
// this Editor's offline cache; other apps and user documents are untouched.
self.addEventListener('install', (event) => {
    event.waitUntil(self.skipWaiting());
});
self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const names = await caches.keys();
        await Promise.all(names.filter(name => name.startsWith('metaflow-editor-v'))
        .map(name => caches.delete(name)));
        await self.registration.unregister();
        // Never reload existing clients: they may contain unsaved projects.
    })());
});
