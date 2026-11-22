import { Asset, BLEND_NORMAL, Color, StandardMaterial } from 'playcanvas';
import type { AppBase } from 'playcanvas';
import { createViewer } from '../index';
import { isAppleMobileWebKit, selectHostedRenderer } from '../render-compatibility';

const dataRoot = '/data/Shenzhen/nanhai-e-cool-v1/';
const query = new URLSearchParams(location.search);
const status = document.querySelector<HTMLElement>('#load-status');
const mapImage = document.querySelector<HTMLImageElement>('#map-image img');
const panel = document.querySelector<HTMLElement>('#map-image');
const toggle = document.querySelector<HTMLButtonElement>('#map-toggle');
const floor = document.querySelector<HTMLElement>('#current-floor');
const marker = document.querySelector<HTMLElement>('#you');
const reviewButton = document.querySelector<HTMLButtonElement>('#repairs');

type Registration = {
    sourceEast: [number, number];
    sourceNorth: [number, number];
    eastMin: number;
    northMax: number;
    metersPerPixel: number;
    width: number;
    height: number;
};

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
    mapImage.src = dataRoot + 'map.webp';
    const response = await fetch(dataRoot + 'map.json');
    if (!response.ok) throw new Error('现场地图载入失败');
    const map: Registration = await response.json();
    toggle.onclick = () => {
        panel.hidden = !panel.hidden;
        toggle.setAttribute('aria-expanded', String(!panel.hidden));
    };
    const sizeButton = document.querySelector<HTMLButtonElement>('#map-size');
    sizeButton.onclick = () => {
        const expanded = document.querySelector('#site-map').classList.toggle('expanded');
        sizeButton.setAttribute('aria-pressed', String(expanded));
        sizeButton.setAttribute('aria-label', expanded ? '缩小地图' : '展开地图');
    };
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
        exposeGlobals: true, noanalytics: query.has('noanalytics'), noanim: true, reticle: false
    });
    Object.assign(window, { metaflowViewer: viewer });
    const mapWindow = document.querySelector<HTMLElement>('#site-map');
    const template = document.querySelector<HTMLTemplateElement>('#map-control');
    const launcher = template.content.firstElementChild.cloneNode(true) as HTMLButtonElement;
    const settingsButton = document.querySelector<HTMLButtonElement>('#viewer .sse-settings');
    settingsButton.parentElement.insertBefore(launcher, settingsButton);
    const setVisible = (visible: boolean) => {
        mapWindow.hidden = !visible;
        launcher.classList.toggle('sse-active', visible);
        launcher.setAttribute('aria-pressed', String(visible));
        launcher.setAttribute('aria-expanded', String(visible));
        if (visible) {
            panel.hidden = false;
            toggle.setAttribute('aria-expanded', 'true');
        }
    };
    setVisible(true);
    launcher.onclick = () => setVisible(mapWindow.hidden);
    const camera = viewer.app.root.findComponents('camera')[0]?.entity;
    if (!camera) throw new Error('场景相机载入失败');
    const [ex, ey] = map.sourceEast;
    const [nx, ny] = map.sourceNorth;
    let currentFloor = '';
    let heading = 0;
    viewer.app.on('postrender', () => {
        if (viewer.state.loaded) status.hidden = true;
        if (viewer.state.loadingStage === 'error') {
            status.hidden = false;
            status.textContent = viewer.state.loadingStatus;
        }
        const p = camera.getPosition();
        const x = (p.x * ex - p.z * ey - map.eastMin) / (map.metersPerPixel * map.width);
        const y = (map.northMax - p.x * nx + p.z * ny) / (map.metersPerPixel * map.height);
        const forward = camera.forward;
        if (Math.hypot(forward.x, forward.z) > 0.005) {
            heading = Math.atan2(forward.x * ex - forward.z * ey, forward.x * nx - forward.z * ny) * 180 / Math.PI;
        }
        marker.hidden = !viewer.state.loaded || x < 0 || x > 1 || y < 0 || y > 1;
        marker.style.left = (x * 100) + '%';
        marker.style.top = (y * 100) + '%';
        marker.style.setProperty('--heading', heading + 'deg');
        const support = viewer.walkSupportHeight;
        if (viewer.state.cameraMode !== 'walk') currentFloor = '自由视角';
        else if (support !== null) {
            if (support < -3.3 || (currentFloor === '1F' && support < -3.12)) currentFloor = '1F';
            else if (support > -0.55 || (currentFloor === '2F' && support > -0.73)) currentFloor = '2F';
            else currentFloor = '楼梯';
        }
        floor.textContent = currentFloor || '定位中';
    });
    if (query.has('inspect')) await prepareRepairOverlay(viewer.app);
    window.addEventListener('pagehide', event => { if (!event.persisted) viewer.destroy(); }, { once: true });
}

openBuilding().catch(error => {
    status.hidden = false;
    status.textContent = '南海意库载入失败 · ' + String(error?.message ?? error);
    console.error(error);
});
