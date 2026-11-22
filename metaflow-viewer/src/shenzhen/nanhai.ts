import { Asset, BLEND_NORMAL, Color, StandardMaterial } from 'playcanvas';
import type { AppBase } from 'playcanvas';
import { createViewer } from '../index';
import { mountSiteMap, type Registration } from './site-map';
import { isAppleMobileWebKit, selectHostedRenderer } from '../render-compatibility';

const dataRoot = '/data/Shenzhen/nanhai-e-cool-v1/';
const query = new URLSearchParams(location.search);
const status = document.querySelector<HTMLElement>('#load-status');
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
    const mapImage = new Image();
    mapImage.src = dataRoot + 'map.webp?v=5.24.1';
    const response = await fetch(dataRoot + 'map.json');
    if (!response.ok) throw new Error('现场地图载入失败');
    const map: Registration = await response.json();
    const rendererQuery = new URLSearchParams(query);
    if (query.get('renderer') === 'webgl' || query.get('renderer') === 'webgpu') {
        rendererQuery.set(query.get('renderer'), '');
    }
    const renderer = selectHostedRenderer(rendererQuery, isAppleMobileWebKit(navigator));
    const viewer = await createViewer({
        container: document.querySelector<HTMLElement>('#viewer'),
        contentUrl: dataRoot + 'streamed/lod-meta.json',
        environmentUrl: dataRoot + 'environment.sog',
        collisionUrl: dataRoot + (query.get('repairs') === 'off' ? 'collision-survey.glb' : 'collision.glb'),
        settings: dataRoot + 'settings.json',
        displayEuler: [-90, 0, 0],
        renderer, defaultCameraMode: 'walk', syntheticAnimation: 'none', experienceType: 'scene', revealEffect: 'none',
        exposeGlobals: true, noanalytics: query.has('noanalytics'), noanim: true, reticle: false, controlsHintInitiallyClosed: true
    });
    Object.assign(window, { metaflowViewer: viewer });
    const camera = viewer.app.root.findComponents('camera')[0]?.entity;
    if (!camera) throw new Error('场景相机载入失败');
    const unmount = mountSiteMap(viewer, camera, map, mapImage);
    viewer.app.on('update', () => {
        status.hidden = viewer.state.loaded;
        if (viewer.state.loadingStage === 'error') {
            status.hidden = false;
            status.textContent = viewer.state.loadingStatus;
        }
    });
    if (query.has('inspect')) await prepareRepairOverlay(viewer.app);
    window.addEventListener('pagehide', event => { if (!event.persisted) { unmount(); viewer.destroy(); } }, { once: true });
}

openBuilding().catch(error => {
    status.hidden = false;
    status.textContent = '南海意库载入失败 · ' + String(error?.message ?? error);
    console.error(error);
});
