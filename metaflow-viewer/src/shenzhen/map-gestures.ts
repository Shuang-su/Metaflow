import { MapCamera, mapWorld } from './sp-map/map-view';

import { mapCameraPixels } from './sp-map/map-window-layout';

type Point = { x: number; y: number };
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function attachMapGestures(canvas: HTMLCanvasElement, camera: MapCamera, width: number, height: number,
    enterManual: () => void, reduced: MediaQueryList) {
    const abort = new AbortController();
    const options = { signal: abort.signal };
    const active = new Map<number, Point>();
    let wheelEnd = 0;
    let tracking = false;
    let rawSpan = 0;
    let previous: Point;
    let previousDistance = 0;
    let anchor: Point;
    const maxSpan = Math.max(width, height) * 1.10;
    const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(v, max));
    const pose = () => {
        const [a, b] = active.values();
        return { center: b ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : a, gap: b ? distance(a, b) : 0 };
    };
    const normalized = (p: Point): [number, number] => {
        const rect = canvas.getBoundingClientRect();
        const unit = mapCameraPixels(rect.width, rect.height, width / height);
        return [220 + (p.x - rect.left - rect.width / 2) * 440 / unit,
            220 + (p.y - rect.top - rect.height / 2) * 440 / unit];
    };
    function anchored(start: Point, end: Point, span: number) {
        const old = camera.view;
        const [wx, wz] = mapWorld(...normalized(start), old);
        const next = { ...old, span };
        const [nx, nz] = mapWorld(...normalized(end), next);
        next.x = clamp(old.x + wx - nx, 0, width);
        next.z = clamp(old.z + wz - nz, 0, height);
        return next;
    }
    function transform(start: Point, end: Point, factor: number) {
        enterManual();
        if (!rawSpan) rawSpan = camera.view.span;
        rawSpan = clamp(rawSpan * factor, 5, maxSpan * 4);
        const extra = Math.max(0, rawSpan / maxSpan - 1);
        const span = extra ? maxSpan * (1 + .15 * (1 - Math.exp(-extra * 2))) : rawSpan;
        camera.moveTo(anchored(start, end, span), true);
        anchor = end;
    }
    function settle() {
        clearTimeout(wheelEnd);
        wheelEnd = 0;
        rawSpan = 0;
        if (anchor && camera.view.span > maxSpan) camera.moveTo(anchored(anchor, anchor, maxSpan), reduced.matches, true);
        anchor = undefined;
    }
    const reset = () => {
        clearTimeout(wheelEnd);
        wheelEnd = 0;
        for (const id of active.keys()) if (canvas.hasPointerCapture(id)) canvas.releasePointerCapture(id);
        active.clear();
        rawSpan = 0;
        tracking = false;
        anchor = undefined;
    };
    canvas.addEventListener('pointerdown', e => {
        if ((e.pointerType === 'mouse' && e.button !== 0) || active.size >= 2) return;
        e.preventDefault();
        clearTimeout(wheelEnd);
        wheelEnd = 0;
        canvas.setPointerCapture(e.pointerId);
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });
        ({ center: previous, gap: previousDistance } = pose());
    }, options);
    canvas.addEventListener('pointermove', e => {
        if (!active.has(e.pointerId)) return;
        active.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const { center, gap } = pose();
        if (!tracking && distance(previous, center) < 4 && Math.abs(gap - previousDistance) < 4) return;
        e.preventDefault();
        tracking = true;
        transform(previous, center, gap > 1 && previousDistance > 1 ? previousDistance / gap : 1);
        previous = center;
        previousDistance = gap;
    }, options);
    function release(e: PointerEvent) {
        if (!active.delete(e.pointerId)) return;
        if (active.size) ({ center: previous, gap: previousDistance } = pose());
        else { tracking = false; settle(); }
    }
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) canvas.addEventListener(type, release, options);
    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? canvas.clientHeight : 1;
        const p = { x: e.clientX, y: e.clientY };
        transform(p, p, Math.exp(clamp(e.deltaY * unit * .002, -1, 1)));
        clearTimeout(wheelEnd);
        wheelEnd = window.setTimeout(settle, 150);
    }, { ...options, passive: false });
    return { reset, destroy() { reset(); abort.abort(); } };
}
