/* global HTMLElementTagNameMap */
import { BooleanInput, Button, ColorPicker, Element, NumericInput, SelectInput, SliderInput, TextInput } from '@playcanvas/pcui';

export const element = <K extends keyof HTMLElementTagNameMap>(tag: K, text = '', className = '') => {
    const node = document.createElement(tag); node.textContent = text; node.className = className; return node;
};

import frameSvg from '../ui/svg/camera-frame-selection.svg';
import resetSvg from '../ui/svg/camera-reset.svg';
import flySvg from '../ui/svg/fly-camera.svg';
import orbitSvg from '../ui/svg/orbit-camera.svg';

// Small line icons use the same 24-unit grid and stroke treatment throughout the workspace.
const paths: Record<string, string> = {
    file: 'M3 7h6l2-3h10v16H3Z',
    save: 'M15.2 3a2 2 0 0 1 1.4.6l3.8 3.8a2 2 0 0 1 .6 1.4V19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM17 21v-7a1 1 0 0 0-1-1H8a1 1 0 0 0-1 1v7M7 3v4a1 1 0 0 0 1 1h7',
    import: 'M12 3v12m5-7-5-5-5 5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
    export: 'M12 15V3m-5 7 5 5 5-5M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4',
    timeline: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM7 3v18M3 7.5h4M3 12h18M3 16.5h4M17 3v18M17 7.5h4M17 16.5h4',
    upload: 'M12 13v8M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242M8 17l4-4 4 4',
    external: 'M15 3h6v6M10 14 21 3M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h6',
    eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12m7 0a3 3 0 1 0 6 0 3 3 0 1 0-6 0',
    video: 'M16 13l5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5M4 6h10a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z',
    scene: 'M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2ZM11 9a2 2 0 1 1-4 0 2 2 0 0 1 4 0M21 15l-3.086-3.086a2 2 0 0 0-2.828 0L6 21',
    pin: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0M15 10a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    locate: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0 M22 12h-4 M6 12H2 M12 6V2 M12 22v-4',
    camera: 'M13.997 4a2 2 0 0 1 1.76 1.05l.486.9A2 2 0 0 0 18.003 7H20a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h1.997a2 2 0 0 0 1.759-1.048l.489-.904A2 2 0 0 1 10.004 4Z M15 13a3 3 0 1 1-6 0 3 3 0 0 1 6 0',
    tune: 'M4 5h16M4 12h16M4 19h16M8 2v6m8 1v6m-6 1v6',
    palette: 'M12 22a1 1 0 0 1 0-20 10 9 0 0 1 10 9 5 5 0 0 1-5 5h-2.25a1.75 1.75 0 0 0-1.4 2.8l.3.4a1.75 1.75 0 0 1-1.4 2.8ZM13.5 6.5h.01M17.5 10.5h.01M6.5 12.5h.01M8.5 7.5h.01',
    cube: 'M2.97 12.92A2 2 0 0 0 2 14.63v3.24a2 2 0 0 0 .97 1.71l3 1.8a2 2 0 0 0 2.06 0L12 19v-5.5l-5-3-4.03 2.42ZM7 16.5l-4.74-2.85M7 16.5l5-3M7 16.5v5.17M12 13.5V19l3.97 2.38a2 2 0 0 0 2.06 0l3-1.8a2 2 0 0 0 .97-1.71v-3.24a2 2 0 0 0-.97-1.71L17 10.5l-5 3ZM17 16.5l-5-3M17 16.5l4.74-2.85M17 16.5v5.17M7.97 4.42A2 2 0 0 0 7 6.13v4.37l5 3 5-3V6.13a2 2 0 0 0-.97-1.71l-3-1.8a2 2 0 0 0-2.06 0l-3 1.8ZM12 8 7.26 5.15M12 8l4.74-2.85M12 13.5V8',
    sparkle: 'M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594ZM20 2v4M22 4h-4M6 20a2 2 0 1 1-4 0 2 2 0 0 1 4 0',
    plus: 'M12 5v14M5 12h14',
    minus: 'M5 12h14',
    close: 'm6 6 12 12M6 18 18 6',
    check: 'm20 6-11 11-5-5',
    left: 'm15 18-6-6 6-6',
    right: 'm9 18 6-6-6-6',
    down: 'm6 9 6 6 6-6',
    up: 'm6 15 6-6 6 6',
    undo: 'M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11',
    redo: 'm15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13',
    move: 'M4.037 4.688a.495.495 0 0 1 .651-.651l16 6.5a.5.5 0 0 1-.063.947l-6.124 1.58a2 2 0 0 0-1.438 1.435l-1.579 6.126a.5.5 0 0 1-.947.063Z',
    annotation: 'M2.992 16.342a2 2 0 0 1 .094 1.167l-1.065 3.29a1 1 0 0 0 1.236 1.168l3.413-.998a2 2 0 0 1 1.099.092 10 10 0 1 0-4.777-4.719',
    key: 'M2.7 10.3a2.41 2.41 0 0 0 0 3.41l7.59 7.59a2.41 2.41 0 0 0 3.41 0l7.59-7.59a2.41 2.41 0 0 0 0-3.41l-7.59-7.59a2.41 2.41 0 0 0-3.41 0Z',
    orbit: 'M3 12a9 4 0 1 0 18 0 9 4 0 1 0-18 0M12 3a4 9 0 1 0 0 18 4 9 0 1 0 0-18',
    fly: 'm3 11 18-8-8 18-2-8-8-2Zm8 2L21 3',
    frame: 'M8 3H3v5m13-5h5v5M3 16v5h5m8 0h5v-5M8 8h8v8H8Z',
    reset: 'M3 10a9 9 0 1 1 1 7M3 3v7h7',
    edit: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497Z',
    trash: 'M10 11v6M14 11v6M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2',
    grip: 'M9 5h.01M15 5h.01M9 12h.01M15 12h.01M9 19h.01M15 19h.01',
    menu: 'M4 6h16M4 12h16M4 18h16',
    help: 'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3M12 17h.01',
    play: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19Z',
    pause: 'M7 4v16M17 4v16',
    previous: 'M17.971 4.285A2 2 0 0 1 21 6v12a2 2 0 0 1-3.029 1.715l-9.997-5.998a2 2 0 0 1-.003-3.432Z M3 20V4',
    next: 'M21 4v16 M6.029 4.285A2 2 0 0 0 3 6v12a2 2 0 0 0 3.029 1.715l9.997-5.998a2 2 0 0 0 .003-3.432Z'
};
export function icon(name: string) {
    const asset = ({ orbit: orbitSvg, fly: flySvg, frame: frameSvg, reset: resetSvg } as Record<string, string>)[name];
    if (asset) {
        const svg = new DOMParser().parseFromString(decodeURIComponent(asset.slice('data:image/svg+xml,'.length)), 'image/svg+xml').documentElement;
        svg.classList.add('studio-icon', 'studio-camera-icon'); svg.setAttribute('aria-hidden', 'true'); return svg;
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('data-icon', name); svg.classList.add('studio-icon');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', paths[name] ?? paths.tune); svg.append(path);
    if (name === 'grip') {
        path.remove();
        for (const x of [9, 15]) {
            for (const y of [5, 12, 19]) {
                const dot = document.createElementNS(svg.namespaceURI, 'circle');
                dot.setAttribute('cx', String(x)); dot.setAttribute('cy', String(y)); dot.setAttribute('r', '1'); svg.append(dot);
            }
        }
    }
    if (name === 'key') {
        const plus = document.createElementNS(svg.namespaceURI, 'path'); plus.setAttribute('d', 'M20 0v10 M15 5h10'); plus.setAttribute('stroke-width', '2'); svg.append(plus); svg.classList.add('studio-key-icon');
    }
    return svg;
}

// Tooltip content is shared across control families, including disabled triggers.
const tooltipDetails: Record<string, { description?: string; shortcut?: string }> = {
    '撤销': { shortcut: 'Cmd+Z / Ctrl+Z' },
    '重做': { shortcut: 'Shift+Cmd+Z / Ctrl+Y' },
    '移动': { description: '在场景中移动和观察。' },
    '放置标记': { description: '单击场景表面放置标记。', shortcut: 'C' },
    'Orbit 模式': { description: '围绕目标旋转。' },
    'Fly 模式': { description: '自由飞行浏览。' },
    '取景': { shortcut: 'F' },
    '重置相机': { shortcut: 'Shift+F' },
    '播放': { shortcut: 'Space' },
    '暂停': { shortcut: 'Space' },
    '在播放头添加关键帧': { shortcut: 'Enter' },
    '收起时间线': { shortcut: 'T' }
};
let tooltip: HTMLElement;
let tooltipTimer: ReturnType<typeof setTimeout>;
let tooltipOwner: HTMLButtonElement;
let tooltipSequence = 0;
const tooltipObserver = new MutationObserver(() => {
    if (tooltipOwner && !tooltipOwner.isConnected) hideTooltip();
});
function hideTooltip() {
    clearTimeout(tooltipTimer); tooltipObserver.disconnect();
    tooltipOwner?.removeAttribute('aria-describedby'); tooltip?.remove(); tooltip = null; tooltipOwner = null;
}
window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') hideTooltip();
}, true);
window.addEventListener('blur', hideTooltip);
window.addEventListener('resize', hideTooltip);
document.addEventListener('scroll', hideTooltip, true);
function attachTooltip(button: HTMLButtonElement, initialText: string) {
    const trigger = element('span', '', 'studio-tooltip-trigger'); trigger.append(button);
    const hide = () => {
        if (tooltipOwner === button) hideTooltip();
    };
    const show = () => {
        hideTooltip(); tooltipOwner = button;
        tooltipTimer = setTimeout(() => {
            if (!button.isConnected) {
                hideTooltip(); return;
            }
            const text = button.dataset.tooltip ?? initialText;
            const detail = tooltipDetails[text] ?? {};
            tooltip = element('div', '', 'studio-tooltip'); tooltip.id = `studio-tooltip-${++tooltipSequence}`; tooltip.setAttribute('role', 'tooltip');
            tooltip.append(element('div', text, 'studio-tooltip-title'));
            if (detail.description) tooltip.append(element('div', detail.description, 'studio-tooltip-detail'));
            if (detail.shortcut) tooltip.append(element('div', `快捷键：${detail.shortcut}`, 'studio-tooltip-detail'));
            // Match the reference's body portal. Only modal dialogs need the
            // native top layer; ordinary tooltips must remain in page composition.
            const modal = button.closest('dialog[open]');
            if (modal) tooltip.setAttribute('popover', 'manual');
            document.body.append(tooltip);
            if (modal) tooltip.showPopover?.();
            const rect = button.getBoundingClientRect(), size = tooltip.getBoundingClientRect();
            const left = Math.max(8, Math.min(innerWidth - size.width - 8, rect.x + (rect.width - size.width) / 2));
            const above = rect.top > size.height + 12;
            tooltip.dataset.side = above ? 'top' : 'bottom';
            tooltip.style.left = `${left}px`;
            tooltip.style.top = `${above ? rect.top - size.height - 8 : rect.bottom + 8}px`;
            tooltip.style.setProperty('--arrow-x', `${Math.max(8, Math.min(size.width - 8, rect.x + rect.width / 2 - left))}px`);
            button.setAttribute('aria-describedby', tooltip.id);
            tooltipObserver.observe(document.body, { childList: true, subtree: true });
        }, 150);
    };
    trigger.addEventListener('mouseenter', show); trigger.addEventListener('mouseleave', hide);
    button.addEventListener('focus', () => {
        if (button.matches(':focus-visible')) show();
    });
    button.addEventListener('blur', hide); trigger.addEventListener('pointerdown', hide);
    return trigger;
}

/** Keep dropdowns outside inspector/timeline clipping, retaining PCUI keyboard selection. */
export class StudioSelect extends SelectInput {
    constructor(args: ConstructorParameters<typeof SelectInput>[0]) {
        super(args);
        const chevron = icon('down'); chevron.classList.add('studio-select-chevron'); this.dom.append(chevron);
    }
    private menuKeyDown = (event: KeyboardEvent) => {
        if (!['Escape', 'Enter', 'ArrowDown', 'ArrowUp', 'Tab'].includes(event.key)) return;
        this._onKeyDown(event); event.stopImmediatePropagation();
    };
    private reposition = () => {
        if (this._containerOptions.hidden) return;
        const anchor = this.dom.getBoundingClientRect(), list = this._containerOptions.dom;
        const width = Math.max(128, anchor.width), available = Math.max(anchor.top - 12, innerHeight - anchor.bottom - 12);
        Object.assign(list.style, { width: `${width}px`, maxHeight: `${available}px`, left: `${Math.max(8, Math.min(innerWidth - width - 8, anchor.left))}px` });
        const height = list.getBoundingClientRect().height;
        list.style.top = `${anchor.bottom + height + 8 > innerHeight ? Math.max(8, anchor.top - height - 4) : anchor.bottom + 4}px`;
    };
    open() {
        if (!this._containerOptions.hidden) return;
        this._onDocumentPointerDown = (event) => {
            const target = event.composedPath()[0] as Node;
            if (!this.dom.contains(target) && !this._containerOptions.dom.contains(target)) this.close();
        };
        super.open();
        if (this._containerOptions.hidden) return;
        const list = this._containerOptions.dom;
        list.classList.add('studio-select-portal'); list.setAttribute('role', 'listbox');
        // The DOM moves, while PCUI ownership stays with the select for disposal and bindings.
        document.body.append(list); this.reposition(); this.dom.setAttribute('aria-expanded', 'true');
        window.addEventListener('keydown', this.menuKeyDown, true); window.addEventListener('resize', this.reposition); document.addEventListener('scroll', this.reposition, true);
    }
    close() {
        super.close();
        if (!this._containerOptions) return;
        this._containerValue.dom.append(this._containerOptions.dom);
        this.dom.setAttribute('aria-expanded', 'false');
        window.removeEventListener('keydown', this.menuKeyDown, true); window.removeEventListener('resize', this.reposition); document.removeEventListener('scroll', this.reposition, true);
    }
    destroy() {
        this.close(); super.destroy();
    }
}

export class StudioSlider extends SliderInput {
    protected _onSlideStart(x: number) {
        this.emit('gesture:start'); super._onSlideStart(x);
    }
    protected _onSlideEnd(x: number) {
        super._onSlideEnd(x); this.emit('gesture:end');
    }
}

/** Keep PCUI picking synchronous so pointer-up commits the final color in one undo. */
class StudioColor extends ColorPicker {
    constructor(args: ConstructorParameters<typeof ColorPicker>[0]) {
        super(args);
        this.on('picker:color:start', () => this.emit('gesture:start'));
        this.on('picker:color:end', () => this.emit('gesture:end'));
        this.dom.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && !this._overlay.hidden) {
                this._overlay.hidden = true; this.dom.focus(); event.stopPropagation();
            } else if (event.target === this.dom && ['Enter', ' '].includes(event.key) && this._overlay.hidden && this.enabled) {
                this._openColorPicker(); event.preventDefault(); event.stopPropagation();
            }
        });
        this._pickerChannels.slice(0, 3).forEach((channel, index) => {
            const input = channel.dom.querySelector('input'); input.setAttribute('aria-label', ['红色通道', '绿色通道', '蓝色通道'][index]);
            channel.keyChange = false;
            let committed = channel.value; channel.on('change', (value: number) => {
                committed = value;
            });
            const validate = (event: Event) => {
                if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
                const value = Number(input.value);
                if (!input.value.trim() || !Number.isFinite(value) || value < 0 || value > 255) input.value = String(committed);
            };
            for (const type of ['change', 'blur', 'keydown']) input.addEventListener(type, validate, true);
        });
        this._fieldHex.keyChange = false;
        const hex = this._fieldHex.dom.querySelector('input'); hex.setAttribute('aria-label', '十六进制颜色');
        for (const type of ['change', 'blur', 'keydown']) {
            hex.addEventListener(type, (event) => {
                if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
                if (!/^[0-9a-f]{6}$/i.test(hex.value.trim())) hex.value = this._getHex();
            }, true);
        }
    }
    callCallback() {
        this.callbackHandle();
    }
}

/** A keyed control registry: update values without replacing the focused/dragged DOM. */
export class StudioControls {
    private entries = new Map<string, { control: Element; value: unknown }>();
    private syncing = false;
    constructor(private run: (action: () => unknown) => void, private begin: () => void, private end: () => void) {}
    clear() {
        this.entries.forEach(({ control }) => control.destroy()); this.entries.clear();
    }
    button(parent: HTMLElement, text: string, action: (event: MouseEvent) => unknown, className = '', glyph?: string, iconOnly = false) {
        const control = new Button({ text: iconOnly ? '' : text, class: ['studio-button', ...className.split(' ').filter(Boolean)] });
        const dom = control.dom as HTMLButtonElement; dom.type = 'button'; dom.setAttribute('role', 'button'); dom.setAttribute('aria-label', text);
        if (glyph) dom.prepend(icon(glyph));
        if (iconOnly) {
            dom.classList.add('icon-only'); dom.dataset.tooltip = text;
        }
        control.on('click', (event: MouseEvent) => this.run(() => action(event))); parent.append(iconOnly ? attachTooltip(dom, text) : dom); return dom;
    }
    private field(parent: HTMLElement, label: string) {
        const row = element('div', '', 'studio-field'); row.append(element('span', label, 'studio-field-label')); parent.append(row); return row;
    }
    private bind(key: string, control: Element, value: unknown, change: (value: any) => void) {
        const entry = { control, value }; this.entries.set(key, entry);
        control.on('change', (next: unknown) => {
            if (!this.syncing) this.run(() => change(next));
        });
        return control;
    }
    sync(values: Record<string, unknown>) {
        this.syncing = true;
        try {
            for (const [key, entry] of this.entries) {
                if (key in values) {
                    const value = values[key];
                    if (JSON.stringify((entry.control as any).value) !== JSON.stringify(value)) (entry.control as any).value = value;
                    entry.value = value;
                    if (entry.control instanceof BooleanInput) entry.control.dom.setAttribute('aria-checked', String(value));
                }
            }
        } finally {
            this.syncing = false;
        }
    }
    text(parent: HTMLElement, label: string, value: string, change: (v: string) => void, key = label) {
        const c = new TextInput({ value, class: 'studio-input', keyChange: false });
        c.dom.querySelector('input').setAttribute('aria-label', label); this.field(parent, label).append(c.dom); this.bind(key, c, value, change); return c;
    }
    number(parent: HTMLElement, label: string, value: number, min: number, max: number, change: (v: number) => void, step = 0.1, slider = false, key = label) {
        const outsideReference = value < min || value > max;
        const controlMin = Math.min(min, value), controlMax = Math.max(max, value);
        const args = { value, min: controlMin, max: controlMax, step, precision: step >= 1 && label !== '色散强度' ? 0 : 3, keyChange: false, class: 'studio-input' };
        const c = slider ? new StudioSlider(args) : new NumericInput(args);
        const input = c.dom.querySelector('input'); input.setAttribute('aria-label', label); input.setAttribute('role', 'spinbutton');
        let committed = value; c.on('change', (next: number) => {
            committed = next;
        });
        const validateInput = (event: Event) => {
            if (event instanceof KeyboardEvent && event.key !== 'Enter') return;
            const next = Number(input.value);
            if (!input.value.trim() || !Number.isFinite(next) || next < min || next > max) input.value = String(committed);
        };
        // Reject an invalid typed value before PCUI clamps it, preserving the last
        // committed value as the reference Studio does. Slider limits still clamp.
        for (const type of ['change', 'blur', 'keydown']) input.addEventListener(type, validateInput, true);
        const progress = (v: number) => c.dom.style.setProperty('--slider-progress', `${(v - controlMin) / (controlMax - controlMin) * 100}%`); progress(value); c.on('change', progress);
        const handle = c.dom.querySelector('.pcui-slider-handle');
        if (handle) {
            handle.setAttribute('role', 'slider'); handle.setAttribute('aria-label', label); handle.setAttribute('aria-valuemin', String(controlMin)); handle.setAttribute('aria-valuemax', String(controlMax)); handle.setAttribute('aria-valuenow', String(value));
            c.on('change', (v: number) => handle.setAttribute('aria-valuenow', String(v)));
        }
        c.on('gesture:start', this.begin); c.on('gesture:end', this.end);
        const row = this.field(parent, label); row.classList.toggle('with-slider', slider); row.append(c.dom);
        if (outsideReference) {
            row.title = `原有值 ${value} 超出线上参考范围 ${min}–${max}，已保留；本控件范围包含原有值。`; row.classList.add('studio-legacy-value');
        }
        this.bind(key, c, value, change); return c;
    }
    toggle(parent: HTMLElement, label: string, value: boolean, change: (v: boolean) => void, key = label) {
        const c = new BooleanInput({ type: 'toggle', value, class: 'studio-switch' });
        c.dom.setAttribute('role', 'switch'); c.dom.setAttribute('aria-label', label); c.dom.setAttribute('aria-checked', String(value));
        c.on('change', (v: boolean) => c.dom.setAttribute('aria-checked', String(v)));
        this.field(parent, label).append(c.dom); this.bind(key, c, value, change); return c;
    }
    select(parent: HTMLElement, label: string, value: string, options: [string, string][], change: (v: string) => void, key = label) {
        const c = new StudioSelect({ value, options: options.map(([v, t]) => ({ v, t })), type: 'string', class: 'studio-input' });
        c.dom.setAttribute('role', 'combobox'); c.dom.setAttribute('aria-label', label); c.dom.setAttribute('aria-expanded', 'false');
        c.on('open', () => c.dom.setAttribute('aria-expanded', 'true')); c.on('close', () => c.dom.setAttribute('aria-expanded', 'false'));
        this.field(parent, label).append(c.dom); this.bind(key, c, value, change); return c;
    }
    color(parent: HTMLElement, label: string, value: number[], change: (v: [number, number, number]) => void, key = label) {
        const c = new StudioColor({ value, channels: 3, class: ['studio-color', 'blocks-shortcuts'] });
        c.dom.setAttribute('role', 'button'); c.dom.setAttribute('aria-label', label); c.dom.tabIndex = 0;
        const hex = element('span', '', 'studio-color-hex');
        const update = (v: number[]) => {
            hex.textContent = `#${v.slice(0, 3).map(n => Math.round(n * 255).toString(16).padStart(2, '0')).join('')}`;
        };
        update(value); c.on('change', update); c.dom.append(hex);
        c.on('gesture:start', this.begin); c.on('gesture:end', this.end);
        this.field(parent, label).append(c.dom); this.bind(key, c, value, change); return c;
    }
}
