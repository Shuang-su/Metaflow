import type { Entity } from 'playcanvas';
import type { ViewerHandle } from '../types';
import { MapCamera, MapHeading, mapPoint, type MapView } from './sp-map/map-view';
import { MapWindow } from './sp-map/map-window';
import { mapBackingSize } from './sp-map/map-window-layout';

export type Registration = {
    sourceEast: [number, number];
    sourceNorth: [number, number];
    eastMin: number;
    northMax: number;
    metersPerPixel: number;
    width: number;
    height: number;
};

export function mountSiteMap(viewer: ViewerHandle, camera: Entity, map: Registration, image: HTMLImageElement) {
    const root = document.querySelector<HTMLElement>('#viewer .sse-viewer');
    const panel = document.querySelector<HTMLElement>('#site-map');
    const surface = panel.querySelector<HTMLElement>('.sse-guidanceSurface');
    const canvas = panel.querySelector<HTMLCanvasElement>('#map-canvas');
    const floor = panel.querySelector<HTMLElement>('#current-floor');
    const actions = Array.from(panel.querySelectorAll<HTMLButtonElement>('[data-mode]'));
    const template = document.querySelector<HTMLTemplateElement>('#map-control');
    const launcher = template.content.firstElementChild.cloneNode(true) as HTMLButtonElement;
    root.querySelector('.sse-settings').before(launcher);
    root.append(panel);
    const ctx = canvas.getContext('2d');
    const motion = new MapHeading();
    const view = new MapCamera();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const width = map.width * map.metersPerPixel;
    const height = map.height * map.metersPerPixel;
    const overview: MapView = { x: width / 2, z: height / 2, span: Math.max(width, height), rotation: 0, anchorY: .5 };
    const followSpan = 18;
    const [ex, ey] = map.sourceEast;
    const [nx, ny] = map.sourceNorth;
    let mode: 'follow' | 'overview' = 'overview';
    let currentFloor = '';
    let tick = 0;
    let lastSample = '';
    let dirty = true;
    view.moveTo(overview, true);
    const windowLayout = new MapWindow(root, panel, surface, () => { dirty = true; });

    const localPosition = () => {
        const p = camera.getPosition();
        return { x: p.x * ex - p.z * ey - map.eastMin, y: p.y, z: map.northMax - p.x * nx + p.z * ny };
    };
    const follow = (): MapView => {
        const { x, z } = localPosition();
        return { x, z, span: followSpan, rotation: motion.rotation, anchorY: .65 };
    };
    for (const action of actions) {
        action.classList.toggle('sse-active', action.dataset.mode === mode);
        action.onclick = () => {
            mode = action.dataset.mode === 'follow' ? 'follow' : 'overview';
            view.moveTo(mode === 'follow' ? follow() : overview, reduced.matches, true);
            for (const button of actions) {
                const active = button.dataset.mode === mode;
                button.classList.toggle('sse-active', active);
                button.setAttribute('aria-pressed', String(active));
            }
            dirty = true;
        };
    }

    const setVisible = (visible: boolean) => {
        panel.hidden = !visible;
        launcher.classList.toggle('sse-active', visible);
        launcher.setAttribute('aria-pressed', String(visible));
        launcher.setAttribute('aria-expanded', String(visible));
        dirty = true;
    };
    const portraitPhone = matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
    let visible = !portraitPhone;
    try {
        const saved = localStorage.getItem('metaflow.nanhai.mapVisible');
        if (saved !== null) visible = saved === 'true';
    } catch { /* The map also works with storage disabled. */ }
    const nativePanels = [
        ['.sse-controlsHint', '.sse-controlsHintClose'],
        ['.sse-settingsPanel', '.sse-settings'],
        ['.sse-infoPanel', '.sse-infoClose']
    ].map(([panelSelector, closeSelector]) => ({
        panel: root.querySelector<HTMLElement>(panelSelector),
        close: root.querySelector<HTMLElement>(closeSelector)
    }));
    const isOpen = (element: HTMLElement) => !element.classList.contains('sse-hidden');
    const syncPanels = () => setVisible(visible && !nativePanels.some(item => isOpen(item.panel)));
    const panelObserver = new MutationObserver(syncPanels);
    for (const item of nativePanels) panelObserver.observe(item.panel, { attributes: true, attributeFilter: ['class'] });
    syncPanels();
    launcher.onclick = () => {
        visible = panel.hidden;
        if (visible) {
            for (const item of nativePanels) if (isOpen(item.panel)) item.close.click();
        }
        syncPanels();
        try { localStorage.setItem('metaflow.nanhai.mapVisible', String(visible)); } catch { /* optional */ }
    };

    function update(dt: number) {
        const pos = localPosition();
        const forward = camera.forward;
        const dx = forward.x * ex - forward.z * ey;
        const dz = -forward.x * nx + forward.z * ny;
        const support = viewer.walkSupportHeight;
        if (viewer.state.cameraMode !== 'walk') currentFloor = '自由视角';
        else if (support !== null) {
            if (support < -3.3 || (currentFloor === '1F' && support < -3.12)) currentFloor = '1F';
            else if (support > -.55 || (currentFloor === '2F' && support > -.73)) currentFloor = '2F';
            else currentFloor = '楼梯';
        }
        if (currentFloor && floor.textContent !== currentFloor) floor.textContent = currentFloor;
        tick += dt * 60;
        motion.seed(dx, dz);
        motion.sample({ position: pos, tick, epoch: 0, grounded: support !== null, collision: support !== null ? 'active' : 'pending', supportHeight: support });
        motion.step(dt, reduced.matches);
        if (mode === 'follow') view.track(follow());
        const animating = view.step(dt, reduced.matches);
        if (panel.hidden || !viewer.state.loaded || !image.complete || !canvas.clientWidth) return;
        const current = view.view;
        const size = mapBackingSize(canvas.clientWidth, window.devicePixelRatio);
        const nextSample = [pos.x, pos.z, dx, dz, current.rotation, current.span, current.x, current.z, current.anchorY, size].map(n => n.toFixed(4)).join(',');
        if (!dirty && !animating && nextSample === lastSample) return;
        dirty = false;
        lastSample = nextSample;
        if (canvas.width !== size) { canvas.width = size; canvas.height = size; }
        const ratio = size / 440;
        ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
        ctx.fillStyle = '#f4f5f1';
        ctx.fillRect(0, 0, 440, 440);
        ctx.save();
        ctx.translate(220, 440 * current.anchorY);
        ctx.rotate(current.rotation);
        const scale = 410 / current.span;
        ctx.scale(scale, scale);
        ctx.drawImage(image, -current.x, -current.z, width, height);
        ctx.restore();
        const [mx, my] = mapPoint(pos.x, pos.z, current);
        const heading = Math.atan2(dx, -dz) + current.rotation;
        if (pos.x >= 0 && pos.x <= width && pos.z >= 0 && pos.z <= height) {
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(heading);
            ctx.beginPath();
            ctx.moveTo(0, -10); ctx.lineTo(7, 8); ctx.lineTo(0, 5); ctx.lineTo(-7, 8); ctx.closePath();
            ctx.fillStyle = '#1482b3'; ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
            ctx.fill(); ctx.stroke(); ctx.restore();
        }
        canvas.dataset.view = mode;
        canvas.dataset.marker = [mx, my, heading].join(',');
        canvas.dataset.center = [current.x, current.z, current.span, current.anchorY].join(',');
    }
    viewer.app.on('update', update);
    return () => {
        viewer.app.off('update', update);
        panelObserver.disconnect();
        windowLayout.destroy();
        launcher.remove();
    };
}
