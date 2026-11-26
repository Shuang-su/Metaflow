// Identity of the locally staged release build.
const metaflowEditorVersion = {
    productName: 'Metaflow Editor',
    edition: 'default',
    displayVersion: '1.4.0',
    appSemver: '1.4.0',
    development: false,
    sourcePath: 'supersplat-v3.5.2',
    upstreamName: 'SuperSplat Editor',
    upstreamVersion: '3.9.2',
    upstreamTag: 'v3.9.2',
    upstreamGitRef: '7912e1d78b7a98cff26f7c8c2820a784b537819e',
    historyUrl: '/data/editor-version-history.json',
    runtimeUrl: './version.json'
} as const;

const metaflowEditorLabel = `${metaflowEditorVersion.productName} v${metaflowEditorVersion.displayVersion}${metaflowEditorVersion.development ? ' (development)' : ''}`;
const upstreamEditorLabel = `${metaflowEditorVersion.upstreamName} v${metaflowEditorVersion.upstreamVersion}`;
const serviceWorkerCacheName = `metaflow-editor-v${metaflowEditorVersion.appSemver}-ss${metaflowEditorVersion.upstreamVersion}`;

export { metaflowEditorVersion, metaflowEditorLabel, upstreamEditorLabel, serviceWorkerCacheName };
