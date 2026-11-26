import type { Entity } from 'playcanvas';

import type { ViewerHandle } from '../types';

import { attachMapGestures } from './map-gestures';
import { MapCamera, MapHeading, mapPoint } from './sp-map/map-view';
import type { MapView } from './sp-map/map-view';
import { MapWindow } from './sp-map/map-window';
import { mapBackingSize, mapCameraPixels } from './sp-map/map-window-layout';
import { makeMapOverview, stepMapOverview } from './sp-map/overview';

export type Registration = {
    sourceEast: [number, number];
    sourceNorth: [number, number];
    eastMin: number;
    northMax: number;
    metersPerPixel: number;
    groundColor?: string;
    overview?: { x: number; z: number; span: number };
    width: number;
    height: number;
};

type MapRing = readonly [number, number][];
export type SiteMapOptions = {
    storageKey: string;
    floorLabel: () => string;
    overviewFootprints?: { primary: MapRing; adjacent?: MapRing };
};

export function mountSiteMap(
    viewer: ViewerHandle,
    camera: Entity,
    map: Registration,
    image: HTMLImageElement,
    host: HTMLElement,
    options?: SiteMapOptions
) {
    const root = host.querySelector<HTMLElement>('.sse-viewer');
    const panel = host.querySelector<HTMLElement>('#site-map');
    const surface = panel.querySelector<HTMLElement>('.sse-guidanceSurface');
    const canvas = panel.querySelector<HTMLCanvasElement>('#map-canvas');
    const floor = panel.querySelector<HTMLElement>('#current-floor');
    const toggle = panel.querySelector<HTMLButtonElement>('#map-mode');
    const locate = panel.querySelector<HTMLButtonElement>('#map-locate');
    if (map.groundColor && /^#[0-9a-f]{6}$/i.test(map.groundColor))
        panel.style.setProperty('--map-ground', map.groundColor);
    const ground = getComputedStyle(panel).getPropertyValue('--map-ground').trim();
    const template = host.querySelector<HTMLTemplateElement>('#map-control');
    const launcher = template.content.firstElementChild.cloneNode(true) as HTMLButtonElement;
    root.querySelector('.sse-settings').before(launcher);
    root.append(panel);
    const ctx = canvas.getContext('2d');
    const motion = new MapHeading();
    const view = new MapCamera();
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const width = map.width * map.metersPerPixel;
    const height = map.height * map.metersPerPixel;
    const overview: MapView = {
        x: width * 0.49,
        z: height * 0.47,
        span: Math.max(width, height) * 0.88,
        rotation: 0,
        anchorY: 0.5,
        ...map.overview
    };
    const followSpan = 18;
    const [ex, ey] = map.sourceEast;
    const [nx, ny] = map.sourceNorth;
    let mode: 'follow' | 'overview' = 'overview';
    let currentFloor = '';
    let tick = 0;
    let lastSample = '';
    let dirty = true;
    view.moveTo(overview, true);
    const windowLayout = new MapWindow(
        root,
        panel,
        surface,
        () => {
            dirty = true;
        },
        () => launcher.click()
    );

    const project = (x: number, z: number) => ({
        x: x * ex - z * ey - map.eastMin,
        z: map.northMax - x * nx + z * ny
    });
    const localPosition = () => {
        const p = camera.getPosition();
        return { ...project(p.x, p.z), y: p.y };
    };
    const footprints = options?.overviewFootprints;
    const projectRing = (ring: MapRing) => ring.map(([x, z]) => project(x, z));
    const adaptive =
        footprints &&
        makeMapOverview(projectRing(footprints.primary), footprints.adjacent && projectRing(footprints.adjacent));
    let overviewView = overview;
    let cameraBearing = 0;
    const follow = ({ x, z } = localPosition()): MapView => {
        const orbit = viewer.state.cameraMode === 'orbit';
        return {
            x,
            z,
            span: followSpan,
            rotation: orbit ? -cameraBearing : motion.rotation,
            anchorY: orbit ? 0.5 : 0.65
        };
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
        view.moveTo(mode === 'follow' ? follow() : overviewView, reduced.matches, true);
        const next = mode === 'overview' ? 'follow' : 'overview';
        toggle.dataset.next = next;
        toggle.title = next === 'follow' ? '切换到跟随' : '切换到全览';
        toggle.setAttribute('aria-label', toggle.title);
        dirty = true;
    };
    toggle.onclick = () => {
        mode = mode === 'overview' ? 'follow' : 'overview';
        restore();
    };
    locate.onclick = restore;
    restore();
    const listeners = new AbortController();
    for (const name of [
        'pointerdown',
        'pointermove',
        'pointerup',
        'wheel',
        'dblclick',
        'touchstart',
        'touchmove',
        'touchend'
    ]) {
        panel.addEventListener(name, (e) => e.stopPropagation(), { signal: listeners.signal });
    }

    let windowAnimation: Animation | undefined;
    const setVisible = (show: boolean, animate = false) => {
        const wasVisible = !panel.hidden && !panel.inert;
        windowAnimation?.cancel();
        windowAnimation = undefined;
        panel.inert = !show;
        launcher.classList.toggle('sse-active', show);
        launcher.setAttribute('aria-pressed', String(show));
        launcher.setAttribute('aria-expanded', String(show));
        if (!show) windowLayout.dismiss(false);
        if (!animate || wasVisible === show || reduced.matches) {
            panel.hidden = !show;
            if (!show && animate) windowLayout.dismiss(true);
        } else {
            panel.hidden = false;
            const open = { opacity: 1, clipPath: 'inset(-32px round 16px)' };
            const closed = { opacity: 0, clipPath: 'inset(35% 25% 0 round 16px)' };
            windowAnimation = panel.animate(show ? [closed, open] : [open, closed], {
                duration: 180,
                easing: 'ease-out'
            });
            windowAnimation.onfinish = () => {
                panel.hidden = !show;
                if (!show) windowLayout.dismiss(true);
                windowAnimation = undefined;
            };
        }
        dirty = true;
    };
    const portraitPhone = matchMedia('(max-width: 700px) and (orientation: portrait)').matches;
    let visible = !portraitPhone;
    try {
        const saved = localStorage.getItem(options?.storageKey ?? 'metaflow.nanhai.mapVisible');
        if (saved !== null) visible = saved === 'true';
    } catch {
        /* The map also works with storage disabled. */
    }
    let obscured = true;
    let openingFromToolbar = false;
    const syncPanels = () => setVisible(visible && !obscured);
    const subscription = viewer.events.on('ui:mapObscured', (value: boolean) => {
        obscured = value;
        if (value) gestures.reset();
        if (!openingFromToolbar) syncPanels();
    });
    viewer.events.fire('ui:mapMount', true);
    launcher.onclick = () => {
        visible = panel.hidden || panel.inert;
        if (!visible) launcher.focus({ preventScroll: true });
        if (visible) {
            openingFromToolbar = true;
            try {
                viewer.events.fire('ui:requestMap');
            } finally {
                openingFromToolbar = false;
            }
        }
        setVisible(visible && !obscured, true);
        try {
            localStorage.setItem(options?.storageKey ?? 'metaflow.nanhai.mapVisible', String(visible));
        } catch {
            /* optional */
        }
    };

    function update(dt: number) {
        const pos = localPosition();
        const orbit = viewer.state.cameraMode === 'orbit';
        let { x: fx, z: fz } = camera.forward;
        if (orbit && Math.hypot(fx, fz) < 0.001) {
            // The horizontal right axis still defines yaw when looking straight up or down.
            const right = camera.right;
            fx = right.z;
            fz = -right.x;
        }
        const dx = fx * ex - fz * ey;
        const dz = -fx * nx + fz * ny;
        cameraBearing = Math.atan2(dx, -dz);
        const support = viewer.walkSupportHeight;
        if (options) currentFloor = options.floorLabel();
        else if (viewer.state.cameraMode !== 'walk') currentFloor = '自由视角';
        else if (support !== null) {
            if (support < -3.3 || (currentFloor === '1F' && support < -3.12)) currentFloor = '1F';
            else if (support > -0.55 || (currentFloor === '2F' && support > -0.73)) currentFloor = '2F';
            else currentFloor = '楼梯';
        }
        if (currentFloor && floor.textContent !== currentFloor) floor.textContent = currentFloor;
        tick += dt * 60;
        motion.seed(dx, dz);
        motion.sample({
            position: pos,
            tick,
            epoch: 0,
            grounded: support !== null,
            collision: support !== null ? 'active' : 'pending',
            supportHeight: support
        });
        motion.step(dt, reduced.matches);
        const following = !manual && mode === 'follow';
        const orbitFollow = orbit && following;
        if (adaptive) {
            const frameWidth = canvas.clientWidth || 1;
            const frameHeight = canvas.clientHeight || 1;
            const visiblePosition = pos.x >= 0 && pos.x <= width && pos.z >= 0 && pos.z <= height;
            const target =
                viewer.state.cameraMode !== 'anim' && visiblePosition
                    ? adaptive(pos, overview, {
                          width: frameWidth,
                          height: frameHeight,
                          unit: mapCameraPixels(frameWidth, frameHeight, width / height)
                      })
                    : overview;
            overviewView = stepMapOverview(overviewView, target, dt, reduced.matches);
            if (!manual && mode === 'overview') view.track(overviewView);
        }
        if (following) {
            const target = follow(pos);
            if (orbitFollow && view.moving) view.moveTo(target, true);
            else view.track(target);
        }
        const animating = view.step(dt, reduced.matches);
        if (panel.hidden || !viewer.state.loaded || !image.complete || !canvas.clientWidth) return;
        const current = view.view;
        const size = mapBackingSize(canvas.clientWidth, window.devicePixelRatio);
        const h = mapBackingSize(canvas.clientHeight, window.devicePixelRatio);
        const unit = mapCameraPixels(size, h, width / height);
        const nextSample = [
            pos.x,
            pos.z,
            dx,
            dz,
            current.rotation,
            current.span,
            current.x,
            current.z,
            current.anchorY,
            size,
            h
        ]
            .map((n) => n.toFixed(4))
            .join(',');
        if (!dirty && !animating && nextSample === lastSample) return;
        dirty = false;
        lastSample = nextSample;
        if (canvas.width !== size) canvas.width = size;
        if (canvas.height !== h) canvas.height = h;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.fillStyle = ground;
        ctx.fillRect(0, 0, size, h);
        const ratio = unit / 440;
        ctx.setTransform(ratio, 0, 0, ratio, (size - unit) / 2, (h - unit) / 2);
        ctx.save();
        ctx.translate(220, 440 * current.anchorY);
        ctx.rotate(current.rotation);
        const scale = 410 / current.span;
        ctx.scale(scale, scale);
        ctx.drawImage(image, -current.x, -current.z, width, height);
        ctx.restore();
        const [mx, my] = mapPoint(pos.x, pos.z, current);
        const heading = cameraBearing + current.rotation;
        if (orbitFollow || (pos.x >= 0 && pos.x <= width && pos.z >= 0 && pos.z <= height)) {
            ctx.save();
            ctx.translate(mx, my);
            ctx.rotate(heading);
            const pixel = 440 / mapCameraPixels(canvas.clientWidth, canvas.clientHeight, width / height);
            ctx.scale(pixel, pixel);
            const cone = ctx.createRadialGradient(0, 0, 0, 0, 0, 24);
            cone.addColorStop(0, '#199bff80');
            cone.addColorStop(1, '#199bff00');
            ctx.beginPath();
            ctx.moveTo(0, 0);
            ctx.arc(0, 0, 24, -Math.PI / 2 - 0.55, -Math.PI / 2 + 0.55);
            ctx.closePath();
            ctx.fillStyle = cone;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(0, 0, 4.5, 0, Math.PI * 2);
            ctx.shadowColor = '#16334890';
            ctx.shadowBlur = (3 * size) / canvas.clientWidth;
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
        windowAnimation?.cancel();
        gestures.destroy();
        listeners.abort();
        locate.onclick = toggle.onclick = null;
        windowLayout.destroy();
        launcher.remove();
    };
}
