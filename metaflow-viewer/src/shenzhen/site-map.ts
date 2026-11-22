import type { Entity } from 'playcanvas';
import type { ViewerHandle } from '../types';
import { MapCamera, MapHeading, mapPoint, type MapView } from './sp-map/map-view';
import { attachMapGestures } from './map-gestures';
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
    const toggle = panel.querySelector<HTMLButtonElement>('#map-mode');
    const locate = panel.querySelector<HTMLButtonElement>('#map-locate');
    const ground = getComputedStyle(panel).getPropertyValue('--map-ground').trim();
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
    const overview: MapView = { x: width * .49, z: height * .47, span: Math.max(width, height) * .88, rotation: 0, anchorY: .5 };
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
    let manual = false;
    const setManual = (value: boolean) => {
        if (manual === value) return;
        manual = value;
        if (value) view.freeze();
        else if (document.activeElement === locate) toggle.focus({ preventScroll: true });
        locate.inert = !value;
        locate.tabIndex = value ? 0 : -1;
        locate.setAttribute('aria-hidden', String(!value));
        dirty = true;
    };
    const gestures = attachMapGestures(canvas, view, width, height, () => setManual(true), reduced);
    const restore = () => {
        gestures.reset();
        setManual(false);
        view.moveTo(mode === 'follow' ? follow() : overview, reduced.matches, true);
        const next = mode === 'overview' ? 'follow' : 'overview';
        toggle.dataset.next = next;
        toggle.title = next === 'follow' ? '切换到跟随' : '切换到全览';
        toggle.setAttribute('aria-label', toggle.title);
        dirty = true;
    };
    toggle.onclick = () => { mode = mode === 'overview' ? 'follow' : 'overview'; restore(); };
    locate.onclick = restore;
    restore();
    const listeners = new AbortController();
    for (const name of ['pointerdown', 'pointermove', 'pointerup', 'wheel', 'dblclick', 'touchstart', 'touchmove', 'touchend']) {
        panel.addEventListener(name, e => e.stopPropagation(), { signal: listeners.signal });
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
    let obscured = true;
    const syncPanels = () => setVisible(visible && !obscured);
    const subscription = viewer.events.on('ui:mapObscured', (value: boolean) => {
        obscured = value;
        if (value) gestures.reset();
        syncPanels();
    });
    viewer.events.fire('ui:mapMount', true);
    launcher.onclick = () => {
        visible = panel.hidden;
        if (visible) viewer.events.fire('ui:requestMap');
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
        if (!manual && mode === 'follow') view.track(follow());
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
        ctx.fillStyle = ground;
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
            const pixel = 440 / canvas.clientWidth;
            ctx.scale(pixel, pixel);
            const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
            cone.addColorStop(0, '#199bff80');
            cone.addColorStop(1, '#199bff00');
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, 24, -Math.PI / 2 - .55, -Math.PI / 2 + .55);
            ctx.closePath();
            ctx.fillStyle = cone;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
            ctx.shadowColor = '#16334890';
            ctx.shadowBlur = 3 * size / canvas.clientWidth;
            ctx.fillStyle = '#159dff';
            ctx.fill();
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#f7fcff';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
        canvas.dataset.view = manual ? 'manual' : mode;
        canvas.dataset.rotation = String(current.rotation);
        canvas.dataset.marker = [mx, my, heading].join(',');
        canvas.dataset.center = [current.x, current.z, current.span, current.anchorY].join(',');
    }
    viewer.app.on('update', update);
    return () => {
        viewer.app.off('update', update);
        subscription.off();
        viewer.events.fire('ui:mapMount', false);
        gestures.destroy();
        listeners.abort();
        locate.onclick = toggle.onclick = null;
        windowLayout.destroy();
        launcher.remove();
    };
}
