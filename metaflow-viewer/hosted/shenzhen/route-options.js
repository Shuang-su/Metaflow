// Accept the hosted Viewer's renderer switches alongside the SP query format.
const url = new URL(window.location.href);
if (!url.searchParams.has('renderer') && (url.searchParams.has('webgl') || url.searchParams.has('webgpu'))) {
    url.searchParams.set('renderer', url.searchParams.has('webgl') ? 'webgl' : 'webgpu');
    window.history.replaceState(window.history.state, '', url);
}

// SP uses the selected animation name as its tab title on the campus scene.
// Keep the public scene name in the tab while the original controls show the track.
const root = document.documentElement;
const title = document.querySelector('title');
function syncSceneTitle() {
    const name = root.lang.startsWith('en') ? root.dataset.titleEn : root.dataset.titleZh;
    if (name && document.title !== name) document.title = name;
}
const titleObserver = new MutationObserver(syncSceneTitle);
titleObserver.observe(title, { childList: true, subtree: true, characterData: true });
titleObserver.observe(root, { attributes: true, attributeFilter: ['lang'] });
syncSceneTitle();
