// Metaflow SP f3c2d6114ca0e8c7de0dd633db685dab59f0e18c · navigation/map-window.ts
import { messageText } from './language';
import {
    clamp,
    freeMapRegions,
    mapWindowRect,
    relativeMapPosition,
    resizeDirection,
    resizeAnchor,
    resizedMapWindow,
    mapResizeCorner,
    mapHandleInsets,
    mapEdgePosition,
    mapPositionFromEdge
} from './map-window-layout';
import type { ResizeCorner, Box, WindowRect, WindowPreference } from './map-window-layout';

export const mapHandleLabel = (language: string, kind: 'move' | 'resize', corner: ResizeCorner = 'nw') =>
    messageText(language, kind === 'move' ? 'mapWindowMove' : `mapWindowResize_${corner}`);

type Gesture = {
    kind: 'move' | 'resize';
    id: number;
    handle: HTMLElement;
    startX: number;
    startY: number;
    dx: number;
    dy: number;
    rect: WindowRect;
    preference: WindowPreference;
    finishing?: boolean;
    corner: ResizeCorner;
};

/** Page-lifetime layout only. It never changes map camera, navigation or preferences. */
export class MapWindow {
    private preference: WindowPreference = { width: null, u: 1, v: 1 };
    private rect: WindowRect | null = null;
    private gesture: Gesture | null = null;
    private frame = 0;
    private disposed = false;
    private abort = new AbortController();
    private observer: ResizeObserver;
    private mutation: MutationObserver;
    private observed = new Set<Element>();
    private safe = document.createElement('div');
    private bounds: Box = { left: 56, top: 56, right: 600, bottom: 600 };
    private regions: Box[] = [];
    private corner: ResizeCorner = 'nw';
    private cornerBounds: Box = this.bounds;
    private resizeButton: HTMLButtonElement;
    private moveButton: HTMLButtonElement;
    private collapsed = false;
    private expanded = false;
    private menu: HTMLElement;
    private sizeButton: HTMLButtonElement;
    private dragged = false;

    constructor(
        private root: HTMLElement,
        private panel: HTMLElement,
        private surface: HTMLElement,
        private changed: () => void,
        private minimize: () => void
    ) {
        this.safe.style.cssText =
            'position:absolute;visibility:hidden;pointer-events:none;inset:max(4px,env(safe-area-inset-top)) max(4px,env(safe-area-inset-right)) max(4px,env(safe-area-inset-bottom)) max(4px,env(safe-area-inset-left));';
        root.append(this.safe);
        this.observer = new ResizeObserver(() => this.schedule());
        for (const el of [root, panel, surface]) this.observe(el);
        this.observeContent();
        this.mutation = new MutationObserver(() => {
            if (this.gesture && !panel.getClientRects().length) this.end(true);
            this.observeContent();
            this.schedule();
        });
        this.mutation.observe(root, { attributes: true, attributeFilter: ['class', 'style'] });
        this.mutation.observe(surface, { childList: true });
        this.mutation.observe(panel, { attributes: true, attributeFilter: ['hidden'] });
        const move = (this.moveButton = this.handle('move', mapHandleLabel(root.lang, 'move')));
        const resize = (this.resizeButton = this.handle('resize', mapHandleLabel(root.lang, 'resize', this.corner)));
        panel.append(move, resize);
        const signal = this.abort.signal;
        window.addEventListener('blur', () => this.end(true), { signal });
        window.addEventListener('resize', () => this.schedule(), { signal });
        window.visualViewport?.addEventListener('resize', () => this.schedule(), { signal });
        window.visualViewport?.addEventListener('scroll', () => this.schedule(), { signal });
        document.addEventListener(
            'visibilitychange',
            () => {
                if (document.hidden) this.end(true);
            },
            { signal }
        );
        window.addEventListener(
            'keydown',
            (e) => {
                if (e.key === 'Escape' && this.gesture) {
                    e.preventDefault();
                    e.stopImmediatePropagation();
                    this.end(true);
                }
            },
            { capture: true, signal }
        );
        this.menu = panel.querySelector('#map-window-menu');
        this.sizeButton = panel.querySelector('#map-window-size');
        move.setAttribute('aria-controls', this.menu.id);
        move.setAttribute('aria-expanded', 'false');
        move.addEventListener(
            'click',
            (e) => {
                if (e.detail && this.dragged) return;
                this.showMenu(this.menu.inert);
            },
            { signal }
        );
        this.sizeButton.addEventListener(
            'click',
            () => {
                this.showMenu(false);
                this.setExpanded(!this.expanded);
                move.focus({ preventScroll: true });
            },
            { signal }
        );
        panel.querySelector('#map-minimize').addEventListener('click', () => this.minimize(), { signal });
        document.addEventListener(
            'pointerdown',
            (e) => {
                if (!this.menu.contains(e.target as Node) && !move.contains(e.target as Node)) this.showMenu(false);
            },
            { capture: true, signal }
        );
        document.addEventListener(
            'keydown',
            (e) => {
                if (e.key !== 'Escape' || panel.hidden || panel.inert || (this.menu.inert && !this.expanded)) return;
                e.preventDefault();
                e.stopImmediatePropagation();
                if (!this.menu.inert) this.showMenu(false);
                else this.setExpanded(false);
                move.focus({ preventScroll: true });
            },
            { capture: true, signal }
        );
        this.refreshLabels();
        this.schedule();
    }

    private showMenu(open: boolean) {
        if (this.menu.inert === !open) return;
        this.menu.inert = !open;
        this.menu.setAttribute('aria-hidden', String(!open));
        this.moveButton.setAttribute('aria-expanded', String(open));
        if (open) this.sizeButton.focus({ preventScroll: true });
    }

    private setExpanded(expanded: boolean) {
        this.expanded = expanded;
        this.panel.classList.toggle('map-maximized', expanded);
        this.sizeButton.querySelector('span').textContent = expanded ? '缩小' : '进入全屏幕';
        this.schedule();
    }

    dismiss(resetSize: boolean) {
        this.showMenu(false);
        this.end(true);
        if (resetSize && this.expanded) this.setExpanded(false);
    }

    private overlayLayout() {
        const { left, top, right, bottom } = this.cornerBounds;
        Object.assign(this.panel.style, {
            left: left + 'px',
            top: top + 'px',
            width: right - left + 'px',
            height: bottom - top + 'px',
            right: 'auto',
            bottom: 'auto'
        });
        this.surface.style.maxHeight = '';
        this.surface.querySelector<HTMLElement>('.sse-guidanceMapViewport').style.height = '100%';
        this.changed();
    }

    private observe(el: Element) {
        if (!this.observed.has(el)) {
            this.observed.add(el);
            this.observer.observe(el);
        }
    }

    /** The surface is capped by max-height, so text that wraps onto more lines (a language
     * switch, a longer destination) does not resize it and the actions would stay scrolled
     * out of view until some unrelated relayout. Watch the content rows themselves; the map
     * section is excluded because layout() sizes its viewport. */
    private observeContent() {
        for (const el of Array.from(this.surface.children))
            if (!el.querySelector('.sse-guidanceMapViewport') && !el.classList.contains('sse-guidanceMapViewport'))
                this.observe(el);
    }

    private handle(kind: Gesture['kind'], label: string) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = `sse-mapHandle sse-mapHandle-${kind}`;
        button.setAttribute('aria-label', label);
        button.title = label;
        this.bindDrag(button, kind);
        const signal = this.abort.signal;
        button.addEventListener('blur', () => this.schedule(), { signal });
        button.addEventListener(
            'keydown',
            (e) => {
                e.stopPropagation();
                if (this.expanded || !e.key.startsWith('Arrow') || !this.rect || this.gesture) return;
                e.preventDefault();
                const step = e.shiftKey ? 24 : 8;
                const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
                const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
                let wanted = { ...this.rect };
                if (kind === 'move') {
                    wanted.x += dx;
                    wanted.y += dy;
                } else {
                    const [sx, sy] = resizeDirection(this.corner);
                    wanted = resizedMapWindow(
                        this.rect,
                        clamp(wanted.width + sx * dx + sy * dy, this.minimum(), 480),
                        this.corner
                    );
                }
                if (kind === 'move') {
                    this.setCorner(mapResizeCorner(wanted, this.cornerBounds, this.corner));
                    this.environment();
                }
                const result = mapWindowRect(
                    this.bounds,
                    this.regions,
                    wanted,
                    this.minimum(),
                    kind === 'resize' ? resizeAnchor(this.rect, this.corner) : undefined
                );
                if (kind === 'resize') this.preference.width = result.width;
                Object.assign(this.preference, relativeMapPosition(result, this.bounds));
                this.preference.edge = mapEdgePosition(result, this.cornerBounds);
                this.schedule();
            },
            { signal }
        );
        return button;
    }

    /** Pure status text shares the move gesture; map and controls retain their own input. */
    bindMoveTarget(element: HTMLElement) {
        element.classList.add('sse-mapMoveText');
        this.bindDrag(element, 'move');
    }

    private bindDrag(element: HTMLElement, kind: Gesture['kind']) {
        const signal = this.abort.signal;
        element.addEventListener(
            'pointerdown',
            (e) => {
                this.dragged = false;
                if (this.expanded) return;
                e.stopPropagation();
                e.preventDefault();
                if (e.button !== 0 || this.gesture || !this.rect) return;
                this.gesture = {
                    kind,
                    id: e.pointerId,
                    handle: element,
                    startX: e.clientX,
                    startY: e.clientY,
                    dx: 0,
                    dy: 0,
                    rect: { ...this.rect },
                    preference: { ...this.preference },
                    corner: this.corner
                };
                element.setPointerCapture(e.pointerId);
                element.classList.add('sse-pressed');
                this.panel.classList.add('sse-map-adjusting');
            },
            { signal }
        );
        element.addEventListener(
            'pointermove',
            (e) => {
                e.stopPropagation();
                if (this.gesture?.id !== e.pointerId || this.gesture.finishing) return;
                if (Math.hypot(e.clientX - this.gesture.startX, e.clientY - this.gesture.startY) >= 4) {
                    this.dragged = true;
                    this.showMenu(false);
                }
                if (!this.dragged) return;
                this.gesture.dx = e.clientX - this.gesture.startX;
                this.gesture.dy = e.clientY - this.gesture.startY;
                this.schedule();
            },
            { signal }
        );
        element.addEventListener(
            'pointerup',
            (e) => {
                e.stopPropagation();
                if (this.gesture?.id === e.pointerId) {
                    this.gesture.dx = e.clientX - this.gesture.startX;
                    this.gesture.dy = e.clientY - this.gesture.startY;
                    if (!this.dragged && Math.hypot(this.gesture.dx, this.gesture.dy) >= 4) this.dragged = true;
                    this.end(!this.dragged);
                }
            },
            { signal }
        );
        for (const name of ['pointercancel', 'lostpointercapture'])
            element.addEventListener(
                name,
                (e) => {
                    e.stopPropagation();
                    if (this.gesture?.id === (e as PointerEvent).pointerId && !this.gesture.finishing) this.end(true);
                },
                { signal }
            );
        element.addEventListener(
            'click',
            (e) => {
                e.stopPropagation();
                e.preventDefault();
            },
            { signal }
        );
    }

    private minimum() {
        return this.root.clientHeight <= 500 ? 120 : this.root.clientWidth <= 700 ? 140 : 180;
    }

    private environment() {
        const host = this.root.getBoundingClientRect(),
            safe = this.safe.getBoundingClientRect();
        const vv = window.visualViewport;
        const left = Math.max(safe.left, vv?.offsetLeft ?? 0) - host.left;
        const top = Math.max(safe.top, vv?.offsetTop ?? 0) - host.top;
        const right = Math.min(safe.right, (vv?.offsetLeft ?? 0) + (vv?.width ?? innerWidth)) - host.left;
        let bottom = Math.min(safe.bottom, (vv?.offsetTop ?? 0) + (vv?.height ?? innerHeight)) - host.top;
        for (const bar of Array.from(
            this.root.querySelectorAll<HTMLElement>('.sse-controlsWrap, .sse-timelineContainer, .sse-time')
        )) {
            this.observe(bar);
            const rect = bar.getBoundingClientRect();
            if (rect.height && rect.width) bottom = Math.min(bottom, rect.top - host.top - 10);
        }
        this.cornerBounds = { left, top, right, bottom };
        const inset = mapHandleInsets(this.corner);
        this.bounds = {
            left: left + inset.left,
            top: top + inset.top,
            right: right - inset.right,
            bottom: bottom - inset.bottom
        };
        const obstacles: Box[] = [];
        const occupied = this.root.querySelectorAll<HTMLElement>('.sse-annotationNav, .sse-nextStep');
        for (const element of Array.from(occupied)) {
            const boxes = element.matches('.sse-annotationNav.sse-touch')
                ? Array.from(element.querySelectorAll<HTMLElement>(':scope > *'))
                : [element];
            for (const control of boxes) {
                this.observe(control);
                const r = control.getBoundingClientRect();
                const overlap = Math.min(12, r.width / 4, r.height / 4);
                if (r.width && r.height && !control.hidden)
                    obstacles.push({
                        left: r.left - host.left + overlap,
                        top: r.top - host.top + overlap,
                        right: r.right - host.left - overlap,
                        bottom: r.bottom - host.top - overlap
                    });
            }
        }
        this.regions = freeMapRegions(this.bounds, obstacles);
    }

    private schedule() {
        if (!this.frame && !this.disposed)
            this.frame = requestAnimationFrame(() => {
                this.frame = 0;
                this.layout();
            });
    }

    private layout() {
        if (this.disposed || !this.panel.getClientRects().length) return;
        this.environment();
        if (this.expanded) {
            this.overlayLayout();
            return;
        }
        this.panel.style.height = '';
        const moving = this.gesture;
        if (moving?.kind === 'move') {
            this.setCorner(
                mapResizeCorner(
                    { ...moving.rect, x: moving.rect.x + moving.dx, y: moving.rect.y + moving.dy },
                    this.cornerBounds,
                    this.corner
                )
            );
            this.environment();
        }
        const toolbarHeight = parseFloat(getComputedStyle(this.root).getPropertyValue('--sse-toolbar-height')) || 58;
        const base = this.root.clientWidth <= 700 ? 164 : 240;
        const defaultWidth =
            this.root.clientHeight <= 500 ? clamp(this.root.clientHeight - toolbarHeight - 164, 120, base) : base;
        const g = this.gesture;
        const [sx, sy] = resizeDirection(g?.corner ?? this.corner);
        const requested =
            g?.kind === 'resize'
                ? clamp(g.rect.width + (sx * g.dx + sy * g.dy) / 2, this.minimum(), 480)
                : (g?.rect.width ?? this.preference.width ?? defaultWidth);
        // Measure wrapping at the requested width; a second bounded pass handles a width constrained by the viewport.
        let width = Math.min(requested, this.bounds.right - this.bounds.left);
        this.panel.style.width = `${width}px`;
        this.panel.classList.toggle('sse-map-compact', width <= 150);
        this.surface.style.maxHeight = 'none';
        const viewport = this.surface.querySelector<HTMLElement>('.sse-guidanceMapViewport');
        if (viewport) viewport.style.height = '';
        let extra = this.surface.getBoundingClientRect().height - width;
        let result: WindowRect;
        for (let pass = 0; pass < 6; pass++) {
            const wanted: WindowRect = {
                x: this.bounds.left + Math.max(0, this.bounds.right - this.bounds.left - width) * this.preference.u,
                y:
                    this.bounds.top +
                    Math.max(0, this.bounds.bottom - this.bounds.top - width - extra) * this.preference.v,
                width,
                height: width + extra
            };
            if (this.preference.edge)
                Object.assign(
                    wanted,
                    mapPositionFromEdge(this.preference.edge, this.cornerBounds, width, width + extra)
                );
            if (g) {
                if (g.kind === 'move') {
                    wanted.x = g.rect.x + g.dx;
                    wanted.y = g.rect.y + g.dy;
                } else Object.assign(wanted, resizedMapWindow(g.rect, width, g.corner, extra));
            }
            result = mapWindowRect(
                this.bounds,
                this.regions,
                wanted,
                this.minimum(),
                g?.kind === 'resize' ? resizeAnchor(g.rect, g.corner) : undefined
            );
            if (result.width === 0) break;
            this.panel.style.width = `${result.width}px`;
            this.panel.classList.toggle('sse-map-compact', result.width <= 150);
            const measuredExtra = this.surface.getBoundingClientRect().height - result.width;
            if (Math.abs(measuredExtra - extra) < 0.5) break;
            // Keep shrinking the solved width, rather than restarting from the
            // requested width with stale wrapping/compact-mode measurements.
            width = result.width;
            extra = measuredExtra;
        }
        this.collapsed = result!.width < this.minimum();

        if (this.collapsed) {
            this.setExpanded(true);
            return;
        }

        // The final pass may itself change wrapping. Never crop the actions
        // against a height measured at the previous width.
        const measuredHeight = this.surface.getBoundingClientRect().height;
        if (Math.abs(measuredHeight - result!.height) >= 0.5) {
            result = mapWindowRect(
                this.bounds,
                this.regions,
                { ...result!, height: measuredHeight },
                this.minimum(),
                g?.kind === 'resize' ? resizeAnchor(g.rect, g.corner) : undefined
            );
            if (result.width === 0) {
                this.collapsed = true;

                this.setExpanded(true);
                return;
            }
            this.panel.style.width = `${result.width}px`;
            this.panel.classList.toggle('sse-map-compact', result.width <= 150);
            this.schedule();
        }
        // Measure chrome at the final width. Never hide actions below an overflowing map.
        if (viewport) {
            const chrome = this.surface.getBoundingClientRect().height - viewport.getBoundingClientRect().height;
            const mapSize = Math.max(1, Math.min(viewport.clientWidth, result!.height - chrome));
            viewport.style.height = `${mapSize}px`;
        }
        this.rect = result!;
        this.panel.style.left = `${result!.x}px`;
        this.panel.style.top = `${result!.y}px`;
        this.panel.style.right = 'auto';
        this.panel.style.bottom = 'auto';
        this.surface.style.maxHeight = `${result!.height}px`;
        this.changed();
        if (g?.finishing) this.finish(false);
        this.updateCorner();
    }

    private setCorner(next: ResizeCorner) {
        if (next === this.corner && this.panel.dataset.resizeCorner) return;
        this.corner = next;
        this.panel.dataset.resizeCorner = next;
        this.refreshLabels();
    }

    private updateCorner() {
        if (!this.rect || this.gesture) return;
        // Keyboard resize keeps the focused handle in place until focus leaves it.
        const next =
            document.activeElement === this.resizeButton
                ? this.corner
                : mapResizeCorner(this.rect, this.cornerBounds, this.corner);
        if (next === this.corner && this.panel.dataset.resizeCorner) return;
        const changed = next !== this.corner;
        this.setCorner(next);
        if (changed) {
            // Rebase the relative position to the new handle's safe bounds without moving the window.
            this.environment();
            // Content resizing must not change the saved edge anchor.
            if (!this.preference.edge) Object.assign(this.preference, relativeMapPosition(this.rect, this.bounds));
            this.schedule();
        }
    }

    refreshLabels() {
        for (const [button, kind] of [
            [this.moveButton, 'move'],
            [this.resizeButton, 'resize']
        ] as const) {
            const label =
                kind === 'move' ? '窗口选项，拖动可移动地图' : mapHandleLabel(this.root.lang, kind, this.corner);
            button.setAttribute('aria-label', label);
            button.title = label;
        }
    }

    private end(cancel: boolean) {
        if (!this.gesture) return;
        if (!cancel) {
            // Include the final pointer position in the next frame, without a second
            // synchronous layout on pointerup in a frame already updated by pointermove.
            this.gesture.finishing = true;
            this.schedule();
        } else this.finish(true);
    }

    private finish(cancel: boolean) {
        const g = this.gesture;
        if (!g) return;
        this.gesture = null;
        if (cancel) {
            this.preference = g.preference;
            this.setCorner(g.corner);
        } else if (this.rect) {
            if (g.kind === 'resize') this.preference.width = this.rect.width;
            Object.assign(this.preference, relativeMapPosition(this.rect, this.bounds));
            this.preference.edge = mapEdgePosition(this.rect, this.cornerBounds);
        }
        g.handle.classList.remove('sse-pressed');
        this.panel.classList.remove('sse-map-adjusting');
        if (g.handle.hasPointerCapture(g.id)) g.handle.releasePointerCapture(g.id);
        if (cancel) this.schedule();
    }

    destroy() {
        this.end(true);
        this.disposed = true;
        cancelAnimationFrame(this.frame);
        this.abort.abort();
        this.observer.disconnect();
        this.mutation.disconnect();
        this.safe.remove();
        this.root.classList.remove('sse-map-collapsed', 'sse-map-expanded');
        this.panel.querySelectorAll('.sse-mapHandle').forEach((el) => el.remove());
    }
}
