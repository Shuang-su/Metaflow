const metaflowEditorVersion = {
    productName: 'Metaflow Editor',
    displayVersion: '1.1',
    appSemver: '1.1.0',
    upstreamName: 'SuperSplat Editor',
    upstreamVersion: '2.28.0',
    upstreamTag: 'v2.28.0',
    upstreamGitRef: '9f4dfe1',
    releaseDate: '2026-06-25',
    historyUrl: '/data/editor-version-history.json',
    runtimeUrl: './version.json'
} as const;

const metaflowEditorLabel = `${metaflowEditorVersion.productName} v${metaflowEditorVersion.displayVersion}`;
const upstreamEditorLabel = `${metaflowEditorVersion.upstreamName} v${metaflowEditorVersion.upstreamVersion}`;
const serviceWorkerCacheName = `metaflow-editor-v${metaflowEditorVersion.appSemver}-ss${metaflowEditorVersion.upstreamVersion}`;

export {
    metaflowEditorVersion,
    metaflowEditorLabel,
    upstreamEditorLabel,
    serviceWorkerCacheName
};
