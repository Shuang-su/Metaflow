import { Asset, BLEND_NORMAL, Color, StandardMaterial } from 'playcanvas';
import type { AppBase } from 'playcanvas';
import { createViewer } from '../index';
import { mountSiteMap, type Registration } from './site-map';
import { isAppleMobileWebKit, selectHostedRenderer } from '../render-compatibility';

const dataRoot = '/data/Shenzhen/nanhai-e-cool-v1/';
const query = new URLSearchParams(location.search);
const host = document.querySelector<HTMLElement>('#viewer');
const reviewButton = document.querySelector<HTMLButtonElement>('#repairs');

async function prepareRepairOverlay(app: AppBase) {
    const asset = new Asset('Nanhai surveyed repairs', 'container', { url: dataRoot + 'repairs.glb' });
    app.assets.add(asset);
    const loaded = new Promise<void>((resolve, reject) => {
        asset.once('load', resolve);
        asset.once('error', reject);
    });
    app.assets.load(asset);
    await loaded;
    const entity = asset.resource.instantiateRenderEntity();
    const material = new StandardMaterial();
    material.diffuse = new Color(0, 0.85, 0.85);
    material.emissive = new Color(0, 0.52, 0.45);
    material.opacity = 0.78;
    material.blendType = BLEND_NORMAL;
    material.depthWrite = false;
    material.update();
    for (const component of entity.findComponents('render')) {
        for (const instance of component.meshInstances) instance.material = material;
    }
    entity.setLocalPosition(0, 0.018, 0);
    entity.enabled = false;
    app.root.addChild(entity);
    reviewButton.hidden = false;
    reviewButton.onclick = () => {
        entity.enabled = !entity.enabled;
        reviewButton.setAttribute('aria-pressed', String(entity.enabled));
        reviewButton.textContent = entity.enabled ? '隐藏补面' : '显示补面';
        app.renderNextFrame = true;
    };
}

async function openBuilding() {
    const rendererQuery = new URLSearchParams(query);
    if (query.get('renderer') === 'webgl' || query.get('renderer') === 'webgpu') {
        rendererQuery.set(query.get('renderer'), '');
    }
    const renderer = selectHostedRenderer(rendererQuery, isAppleMobileWebKit(navigator));
    const viewer = await createViewer({
        container: host,
        posterUrl: dataRoot + 'opening-cover.jpg',
        contentUrl: dataRoot + 'streamed/lod-meta.json',
        environmentUrl: dataRoot + 'environment.sog',
        collisionUrl: dataRoot + (query.get('repairs') === 'off' ? 'collision-survey.glb' : 'collision.glb'),
        settings: dataRoot + 'opening-settings.json',
        displayEuler: [-90, 0, 0],
        renderer, defaultCameraMode: 'anim', syntheticAnimation: 'figure8', animationFirstExitMode: 'orbit',
        orbitMovementMode: 'fly', initialViewPreload: true, experienceType: 'scene', revealEffect: 'radial',
        exposeGlobals: true, noanalytics: query.has('noanalytics'), reticle: false, controlsHintInitiallyClosed: true
    });
    Object.assign(window, { metaflowViewer: viewer });
    const camera = viewer.app.root.findComponents('camera')[0]?.entity;
    if (!camera) throw new Error('场景相机载入失败');
    let unmount: (() => void) | undefined;
    let disposed = false;
    window.addEventListener('pagehide', event => {
        if (event.persisted) return;
        disposed = true;
        unmount?.();
        viewer.destroy();
    }, { once: true });
    const image = new Image();
    image.src = dataRoot + 'map.webp?v=5.24.1';
    const registration = fetch(dataRoot + 'map.json').then(async response => {
        if (!response.ok) throw new Error('现场地图载入失败');
        return await response.json() as Registration;
    });
    const presented = viewer.state.loaded ? Promise.resolve() : new Promise<void>(resolve => {
        viewer.events.once('firstFrame', () => resolve());
    });
    Promise.all([registration, image.decode(), presented]).then(([map]) => {
        if (!disposed) unmount = mountSiteMap(viewer, camera, map, image);
    }).catch(error => console.error('现场地图载入失败', error));
    if (query.has('inspect')) await prepareRepairOverlay(viewer.app);
}

openBuilding().catch(error => {
    const message = host.querySelector<HTMLElement>('.sse-loadingStatus') ?? document.createElement('p');
    message.setAttribute('role', 'alert');
    message.textContent = '南海意库载入失败 · ' + String(error?.message ?? error);
    if (!message.isConnected) host.append(message);
    console.error(error);
});
