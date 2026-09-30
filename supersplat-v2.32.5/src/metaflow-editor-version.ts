// Product version stays at the last release until a separately authorized release.
const metaflowEditorVersion = {
    productName: 'Metaflow Editor',
    displayVersion: '1.1',
    appSemver: '1.1.0',
    development: true,
    sourcePath: 'supersplat-v2.32.5',
    upstreamName: 'SuperSplat Editor',
    upstreamVersion: '2.32.5',
    upstreamTag: 'v2.32.5',
    upstreamGitRef: 'e060989b202548848eb440a5005cd41a8b26f7db',
    historyUrl: '/data/editor-version-history.json',
    runtimeUrl: './version.json'
} as const;

const metaflowEditorLabel = `${metaflowEditorVersion.productName} v${metaflowEditorVersion.displayVersion}${metaflowEditorVersion.development ? ' (development)' : ''}`;
const upstreamEditorLabel = `${metaflowEditorVersion.upstreamName} v${metaflowEditorVersion.upstreamVersion}`;
const serviceWorkerCacheName = `metaflow-editor-v${metaflowEditorVersion.appSemver}-ss${metaflowEditorVersion.upstreamVersion}`;

export { metaflowEditorVersion, metaflowEditorLabel, upstreamEditorLabel, serviceWorkerCacheName };
