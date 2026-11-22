// Metaflow SP f3c2d6114ca0e8c7de0dd633db685dab59f0e18c · navigation/map-window.ts
import { clamp, freeMapRegions, mapWindowRect, relativeMapPosition, resizeDirection, resizeAnchor, resizedMapWindow, mapResizeCorner, mapHandleInsets, mapEdgePosition, mapPositionFromEdge, type ResizeCorner, type Box, type WindowRect, type WindowPreference } from './map-window-layout';
import { messageText } from './language';

export const mapHandleLabel = (language: string, kind: 'move' | 'resize', corner: ResizeCorner = 'nw') =>
    messageText(language, kind === 'move' ? 'mapWindowMove' : `mapWindowResize_${corner}`);

type Gesture = {
    kind: 'move' | 'resize'; id: number; handle: HTMLElement;
    startX: number; startY: number; dx: number; dy: number;
    rect: WindowRect; preference: WindowPreference;
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
    private closeButton: HTMLButtonElement;
    private backdrop: HTMLButtonElement;

    constructor(private root: HTMLElement, private panel: HTMLElement, private surface: HTMLElement,
        private changed: () => void) {
        this.safe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none;inset:max(4px,env(safe-area-inset-top)) max(4px,env(safe-area-inset-right)) max(4px,env(safe-area-inset-bottom)) max(4px,env(safe-area-inset-left));';
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
        const move = this.moveButton = this.handle('move', mapHandleLabel(root.lang, 'move'));
        const resize = this.resizeButton = this.handle('resize', mapHandleLabel(root.lang, 'resize', this.corner));
        panel.append(move, resize);
        const signal = this.abort.signal;
        window.addEventListener('blur', () => this.end(true), { signal });
        window.addEventListener('resize', () => this.schedule(), { signal });
        window.visualViewport?.addEventListener('resize', () => this.schedule(), { signal });
        window.visualViewport?.addEventListener('scroll', () => this.schedule(), { signal });
        document.addEventListener('visibilitychange', () => { if (document.hidden) this.end(true); }, { signal });
        window.addEventListener('keydown', e => {
            if (e.key === 'Escape' && this.gesture) { e.preventDefault(); e.stopImmediatePropagation(); this.end(true); }
        }, { capture: true, signal });
        this.closeButton = document.createElement('button');
        this.closeButton.type = 'button';
        this.closeButton.className = 'sse-mapClose';
        this.closeButton.textContent = '×';
        panel.append(this.closeButton);
        this.backdrop = document.createElement('button');
        this.backdrop.type = 'button';
        this.backdrop.className = 'sse-mapBackdrop';
        this.backdrop.tabIndex = -1;
        this.backdrop.setAttribute('aria-hidden', 'true');
        root.append(this.backdrop);
        const close = () => this.setExpanded(false);
        this.closeButton.addEventListener('click', close, { signal });
        this.backdrop.addEventListener('click', close, { signal });
        root.querySelector('.sse-mapButton')?.addEventListener('click', e => {
            if (!this.collapsed) return;
            e.preventDefault(); e.stopImmediatePropagation();
            this.setExpanded(!this.expanded);
        }, { capture: true, signal });
        window.addEventListener('keydown', e => {
            if (!this.expanded) return;
            if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(); }
            if (e.key === 'Tab') {
                const buttons = Array.from(panel.querySelectorAll<HTMLElement>('button, select, [tabindex="0"]'))
                    .filter(el => el.getClientRects().length && !el.hasAttribute('disabled'));
                const first = buttons[0], last = buttons.at(-1);
                if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
                else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
            }
        }, { capture: true, signal });
        this.refreshLabels();
        this.schedule();
    }

    private setExpanded(expanded: boolean) {
        this.expanded = expanded;
        this.root.classList.toggle('sse-map-expanded', expanded);
        this.panel.setAttribute('role', expanded ? 'dialog' : 'region');
        if (expanded) this.panel.setAttribute('aria-modal', 'true');
        else this.panel.removeAttribute('aria-modal');
        this.root.querySelector('.sse-mapButton')?.setAttribute('aria-expanded', String(expanded));
        this.schedule();
        if (expanded) this.closeButton.focus();
        else this.root.querySelector<HTMLElement>('.sse-mapButton')?.focus();
    }

    private overlayLayout() {
        const width = Math.min(320, this.root.clientWidth - 32);
        const height = Math.max(1, this.root.clientHeight - 32);
        this.panel.style.width = `${width}px`;
        this.panel.style.left = `${(this.root.clientWidth - width) / 2}px`;
        this.panel.style.top = '16px';
        this.panel.style.right = this.panel.style.bottom = 'auto';
        this.surface.style.maxHeight = `${height}px`;
        const viewport = this.surface.querySelector<HTMLElement>('.sse-guidanceMapViewport');
        if (viewport) {
            const chrome = this.surface.scrollHeight - viewport.getBoundingClientRect().height;
            viewport.style.height = `${Math.max(120, Math.min(viewport.clientWidth, height - chrome))}px`;
        }
        this.changed();
    }

    private observe(el: Element) {
        if (!this.observed.has(el)) { this.observed.add(el); this.observer.observe(el); }
    }

    /** The surface is capped by max-height, so text that wraps onto more lines (a language
     * switch, a longer destination) does not resize it and the actions would stay scrolled
     * out of view until some unrelated relayout. Watch the content rows themselves; the map
     * section is excluded because layout() sizes its viewport. */
    private observeContent() {
        for (const el of Array.from(this.surface.children))
            if (!el.querySelector('.sse-guidanceMapViewport') && !el.classList.contains('sse-guidanceMapViewport')) this.observe(el);
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
        button.addEventListener('keydown', e => {
            e.stopPropagation();
            if (!e.key.startsWith('Arrow') || !this.rect || this.gesture) return;
            e.preventDefault();
            const step = e.shiftKey ? 24 : 8;
            const dx = e.key === 'ArrowLeft' ? -step : e.key === 'ArrowRight' ? step : 0;
            const dy = e.key === 'ArrowUp' ? -step : e.key === 'ArrowDown' ? step : 0;
            let wanted = { ...this.rect };
            if (kind === 'move') { wanted.x += dx; wanted.y += dy; }
            else {
                const [sx, sy] = resizeDirection(this.corner);
                wanted = resizedMapWindow(this.rect, clamp(wanted.width + sx * dx + sy * dy, this.minimum(), 480), this.corner);
            }
            if (kind === 'move') { this.setCorner(mapResizeCorner(wanted, this.cornerBounds, this.corner)); this.environment(); }
            const result = mapWindowRect(this.bounds, this.regions, wanted, this.minimum(), kind === 'resize' ? resizeAnchor(this.rect, this.corner) : undefined);
            if (kind === 'resize') this.preference.width = result.width;
            Object.assign(this.preference, relativeMapPosition(result, this.bounds));
            this.preference.edge = mapEdgePosition(result, this.cornerBounds);
            this.schedule();
        }, { signal });
        return button;
    }

    /** Pure status text shares the move gesture; map and controls retain their own input. */
    bindMoveTarget(element: HTMLElement) {
        element.classList.add('sse-mapMoveText');
        this.bindDrag(element, 'move');
    }

    private bindDrag(element: HTMLElement, kind: Gesture['kind']) {
        const signal = this.abort.signal;
        element.addEventListener('pointerdown', e => {
            if (this.expanded) return;
            e.stopPropagation(); e.preventDefault();
            if (e.button !== 0 || this.gesture || !this.rect) return;
            this.gesture = { kind, id: e.pointerId, handle: element, startX: e.clientX, startY: e.clientY, dx: 0, dy: 0,
                rect: { ...this.rect }, preference: { ...this.preference }, corner: this.corner };
            element.setPointerCapture(e.pointerId);
            element.classList.add('sse-pressed');
            this.panel.classList.add('sse-map-adjusting');
        }, { signal });
        element.addEventListener('pointermove', e => {
            e.stopPropagation();
            if (this.gesture?.id !== e.pointerId || this.gesture.finishing) return;
            this.gesture.dx = e.clientX - this.gesture.startX;
            this.gesture.dy = e.clientY - this.gesture.startY;
            this.schedule();
        }, { signal });
        element.addEventListener('pointerup', e => {
            e.stopPropagation();
            if (this.gesture?.id === e.pointerId) {
                this.gesture.dx = e.clientX - this.gesture.startX;
                this.gesture.dy = e.clientY - this.gesture.startY;
                this.end(false);
            }
        }, { signal });
        for (const name of ['pointercancel', 'lostpointercapture']) element.addEventListener(name, e => {
            e.stopPropagation();
            if (this.gesture?.id === (e as PointerEvent).pointerId && !this.gesture.finishing) this.end(true);
        }, { signal });
        element.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); }, { signal });
    }

    private minimum() { return this.root.clientHeight <= 500 ? 120 : this.root.clientWidth <= 700 ? 140 : 180; }

    private environment() {
        const host = this.root.getBoundingClientRect(), safe = this.safe.getBoundingClientRect();
        const vv = window.visualViewport;
        const left = Math.max(safe.left, vv?.offsetLeft ?? 0) - host.left;
        const top = Math.max(safe.top, vv?.offsetTop ?? 0) - host.top;
        const right = Math.min(safe.right, (vv?.offsetLeft ?? 0) + (vv?.width ?? innerWidth)) - host.left;
        let bottom = Math.min(safe.bottom, (vv?.offsetTop ?? 0) + (vv?.height ?? innerHeight)) - host.top;
        const toolbar = this.root.querySelector<HTMLElement>('.sse-controlsWrap');
        if (toolbar) {
            this.observe(toolbar);
            const r = toolbar.getBoundingClientRect();
            // Allow 12px of overlap, while leaving the controls' central tap area exposed.
            if (r.height) bottom = Math.min(bottom, r.top - host.top + Math.min(12, r.height / 4));
        }
        this.cornerBounds = { left, top, right, bottom };
        const inset = mapHandleInsets(this.corner);
        this.bounds = { left: left + inset.left, top: top + inset.top, right: right - inset.right, bottom: bottom - inset.bottom };
        const obstacles: Box[] = [];
        for (const el of Array.from(this.root.querySelectorAll<HTMLElement>('.sse-annotationNav, .sse-nextStep'))) {
            this.observe(el);
            const r = el.getBoundingClientRect();
            const overlap = Math.min(12, r.width / 4, r.height / 4);
            if (r.width && r.height && !el.hidden) obstacles.push({ left: r.left - host.left + overlap, top: r.top - host.top + overlap,
                right: r.right - host.left - overlap, bottom: r.bottom - host.top - overlap });
        }
        this.regions = freeMapRegions(this.bounds, obstacles);
    }

    private schedule() {
        if (!this.frame && !this.disposed) this.frame = requestAnimationFrame(() => { this.frame = 0; this.layout(); });
    }

    private layout() {
        if (this.disposed || !this.panel.getClientRects().length) return;
        if (this.expanded) { this.overlayLayout(); return; }
        this.environment();
        const moving = this.gesture;
        if (moving?.kind === 'move') {
            this.setCorner(mapResizeCorner({ ...moving.rect, x: moving.rect.x + moving.dx, y: moving.rect.y + moving.dy }, this.cornerBounds, this.corner));
            this.environment();
        }
        const toolbarHeight = parseFloat(getComputedStyle(this.root).getPropertyValue('--sse-toolbar-height')) || 58;
        const base = this.root.clientWidth <= 700 ? 164 : 240;
        const defaultWidth = this.root.clientHeight <= 500 ? clamp(this.root.clientHeight - toolbarHeight - 164, 120, base) : base;
        const g = this.gesture;
        const [sx, sy] = resizeDirection(g?.corner ?? this.corner);
        const requested = g?.kind === 'resize' ? clamp(g.rect.width + (sx * g.dx + sy * g.dy) / 2, this.minimum(), 480) : g?.rect.width ?? this.preference.width ?? defaultWidth;
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
                y: this.bounds.top + Math.max(0, this.bounds.bottom - this.bounds.top - width - extra) * this.preference.v,
                width, height: width + extra
            };
            if (this.preference.edge) Object.assign(wanted, mapPositionFromEdge(this.preference.edge, this.cornerBounds, width, width + extra));
            if (g) {
                if (g.kind === 'move') { wanted.x = g.rect.x + g.dx; wanted.y = g.rect.y + g.dy; }
                else Object.assign(wanted, resizedMapWindow(g.rect, width, g.corner, extra));
            }
            result = mapWindowRect(this.bounds, this.regions, wanted, this.minimum(), g?.kind === 'resize' ? resizeAnchor(g.rect, g.corner) : undefined);
            if (result.width === 0) break;
            this.panel.style.width = `${result.width}px`;
            this.panel.classList.toggle('sse-map-compact', result.width <= 150);
            const measuredExtra = this.surface.getBoundingClientRect().height - result.width;
            if (Math.abs(measuredExtra - extra) < .5) break;
            // Keep shrinking the solved width, rather than restarting from the
            // requested width with stale wrapping/compact-mode measurements.
            width = result.width;
            extra = measuredExtra;
        }
        this.collapsed = result!.width < this.minimum();
        this.root.classList.toggle('sse-map-collapsed', this.collapsed);
        if (this.collapsed) {
            if (this.expanded) this.overlayLayout();
            return;
        }
        if (this.expanded) this.setExpanded(false);
        // The final pass may itself change wrapping. Never crop the actions
        // against a height measured at the previous width.
        const measuredHeight = this.surface.getBoundingClientRect().height;
        if (Math.abs(measuredHeight-result!.height) >= .5) {
            result = mapWindowRect(this.bounds, this.regions,
                {...result!, height:measuredHeight}, this.minimum(),
                g?.kind === 'resize' ? resizeAnchor(g.rect,g.corner) : undefined);
            if (result.width === 0) {
                this.collapsed = true;
                this.root.classList.add('sse-map-collapsed');
                if (this.expanded) this.overlayLayout();
                return;
            }
            this.panel.style.width = `${result.width}px`;
            this.panel.classList.toggle('sse-map-compact',result.width<=150);
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
        const next = document.activeElement === this.resizeButton ? this.corner : mapResizeCorner(this.rect, this.cornerBounds, this.corner);
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
        const close = messageText(this.root.lang, 'closeMapPanel');
        this.closeButton?.setAttribute('aria-label', close);
        this.backdrop?.setAttribute('aria-label', close);
        for (const [button, kind] of [[this.moveButton, 'move'], [this.resizeButton, 'resize']] as const) {
            const label = mapHandleLabel(this.root.lang, kind, this.corner);
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
        if (cancel) { this.preference = g.preference; this.setCorner(g.corner); }
        else if (this.rect) {
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
        this.abort.abort(); this.observer.disconnect(); this.mutation.disconnect();
        this.safe.remove();
        this.closeButton.remove(); this.backdrop.remove();
        this.root.classList.remove('sse-map-collapsed', 'sse-map-expanded');
        this.panel.querySelectorAll('.sse-mapHandle').forEach(el => el.remove());
    }
}
