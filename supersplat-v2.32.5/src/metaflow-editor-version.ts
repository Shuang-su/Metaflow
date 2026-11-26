// Identity of the locally staged release build.
const metaflowEditorVersion = {
    productName: 'Metaflow Editor',
    edition: 'compatibility',
    displayVersion: '1.4.0',
    appSemver: '1.4.0',
    development: false,
    sourcePath: 'supersplat-v2.32.5',
    upstreamName: 'SuperSplat Editor',
    upstreamVersion: '2.32.5',
    upstreamTag: 'v2.32.5',
    upstreamGitRef: 'e060989b202548848eb440a5005cd41a8b26f7db',
    historyUrl: '/data/editor-version-history.json',
    runtimeUrl: './version.json'
} as const;

const metaflowEditorLabel = `${metaflowEditorVersion.productName} v${metaflowEditorVersion.displayVersion} (WebGL2 compatibility)${metaflowEditorVersion.development ? ' (development)' : ''}`;
const upstreamEditorLabel = `${metaflowEditorVersion.upstreamName} v${metaflowEditorVersion.upstreamVersion}`;
const serviceWorkerCacheName = `metaflow-editor-v${metaflowEditorVersion.appSemver}-ss${metaflowEditorVersion.upstreamVersion}`;

export { metaflowEditorVersion, metaflowEditorLabel, upstreamEditorLabel, serviceWorkerCacheName };
