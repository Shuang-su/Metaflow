import { Button, SelectInput, TextInput } from '@playcanvas/pcui';

import { HSV, hsvToRgb, rgbToHsv, scrubSpeed, scrubValue } from './background-picker-math';
import { BackgroundEvents } from './background-state';
import {
    BackgroundFill, GradientStop, RGB, backgroundCss, cssColor,
    defaultGradient, normalizeGradient, clamp, sampleRamp
} from '../metaflow-viewer/src/background';

type NumberField = {
    root: HTMLDivElement;
    input: HTMLInputElement;
    read: () => number;
    write: (v: number) => void;
    refresh: () => void;
};
type Gesture = { finish: (cancel: boolean) => void };

export function createBackgroundPicker(events: BackgroundEvents, language: () => string): HTMLButtonElement {
    const t = (en: string, zh: string) => (language().startsWith('zh') ? zh : en);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'mf-fill-button pcui-color-input';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    button.setAttribute('aria-label', 'Background fill');
    let value: BackgroundFill = { color: [0, 0, 0] };
    let selected: GradientStop;
    let hsv: HSV = [0, 0, 0];
    let solidHsv: HSV = [0, 0, 0];
    const stopHsv = new WeakMap<GradientStop, HSV>();
    let popup: HTMLDivElement;
    let update: () => void = () => {};
    let position: () => void = () => {};
    let dispose: () => void = () => {};
    let gesture: Gesture;
    let textEdit: HTMLInputElement;
    let syncing = false;
    let format = 'hex';
    const swatch = () => {
        button.style.background = backgroundCss(value);
    };
    const currentStop = () => {
        const stops = value.gradient?.stops;
        if (stops && !stops.includes(selected)) selected = stops[0];
        return stops ? selected : undefined;
    };
    const color = () => currentStop()?.color ?? value.color;
    const refreshHsv = () => {
        const stop = currentStop();
        hsv = rgbToHsv(color(), stop ? stopHsv.get(stop) ?? hsv : solidHsv);
        if (stop) stopHsv.set(stop, hsv);
        else solidHsv = hsv;
    };
    const preview = () => {
        events.fire('background.preview', value);
        update();
    };
    const finishText = (cancel = false) => {
        if (!textEdit) return;
        const input = textEdit;
        textEdit = undefined;
        input.removeAttribute('aria-invalid');
        events.fire(cancel ? 'background.cancel' : 'background.commit');
        update();
    };
    const beginText = (input: HTMLInputElement) => {
        if (textEdit === input) return;
        finishText();
        textEdit = input;
        events.fire('background.begin');
    };
    const action = (fn: () => void) => {
        finishText();
        events.fire('background.begin');
        fn();
        preview();
        events.fire('background.commit');
    };
    const close = () => {
        if (!popup) return;
        gesture?.finish(true);
        finishText();
        dispose();
        popup.remove();
        popup = undefined;
        update = () => {};
        position = () => {};
        button.setAttribute('aria-expanded', 'false');
        button.focus();
    };

    const open = () => {
        if (popup) {
            close(); return;
        }
        value = events.invoke('background.value');
        refreshHsv();
        popup = document.createElement('div');
        popup.className = 'mf-fill-popover pcui-element font-regular';
        popup.setAttribute('role', 'dialog');
        popup.setAttribute('aria-label', t('Background fill', '背景填充'));
        const components: { destroy: () => void }[] = [];
        const fields: NumberField[] = [];
        const element = (tag: string, cls: string, parent: HTMLElement = popup) => {
            const e = document.createElement(tag);
            e.className = cls;
            parent.append(e);
            return e;
        };
        const pcButton = (text: string, title: string, fn: () => void, parent: HTMLElement) => {
            const b = new Button({ text });
            components.push(b);
            b.dom.title = title;
            b.dom.setAttribute('aria-label', title);
            b.on('click', fn);
            parent.append(b.dom);
            return b;
        };
        const header = element('header', 'mf-fill-header');
        element('span', '', header).textContent = t('Background fill', '背景填充');
        pcButton('×', t('Close', '关闭'), close, header);
        const body = element('div', 'mf-fill-body');
        const mode = new SelectInput({ options: [
            { v: 'solid', t: t('Solid', '纯色') }, { v: 'linear', t: t('Linear', '线性') }, { v: 'radial', t: t('Radial', '径向') }
        ] });
        components.push(mode);
        mode.dom.setAttribute('aria-label', 'Fill type');
        body.append(mode.dom);
        mode.on('change', (type: string) => {
            if (syncing) return;
            action(() => {
                if (type === 'solid') {
                    value.rememberedGradient = value.gradient;
                    delete value.gradient;
                } else {
                    value.gradient = normalizeGradient(value.gradient ?? value.rememberedGradient ?? defaultGradient(value.color));
                    value.gradient.type = type as 'linear' | 'radial';
                }
                refreshHsv();
            });
        });
        const gradientSection = element('div', 'mf-fill-gradient', body);
        const strip = element('div', 'mf-fill-strip', gradientSection);
        strip.setAttribute('aria-label', 'Gradient stops');
        const stopRow = element('div', 'mf-fill-row', gradientSection);
        const linearRow = element('div', 'mf-fill-row', gradientSection);
        const radialRow = element('div', 'mf-fill-geometry', gradientSection);
        const dragHint = element('output', 'mf-fill-drag-hint');
        dragHint.hidden = true;

        // One gesture owns preview, pointer capture/lock, cancellation and the undo transaction.
        const startDrag = (e: PointerEvent, target: HTMLElement,
            move: (x: number, y: number, dx: number, dy: number) => void,
            end: () => void = () => {}, scrub = false) => {
            if (e.button !== 0 || gesture) return;
            e.preventDefault();
            e.stopPropagation();
            finishText();
            if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
            events.fire('background.begin');
            const pointerId = e.pointerId;
            const g = {} as Gesture;
            let x = e.clientX, y = e.clientY, ended = false, wasLocked = false, lockRequested = false;
            const originY = y;
            target.setPointerCapture(pointerId);
            const advance = (nextX: number, nextY: number) => {
                const dx = nextX - x;
                x = nextX; y = nextY;
                move(x, y, dx, y - originY);
            };
            // Keep absolute capture for ordinary scrubs. Lock only at the viewport edge,
            // avoiding cursor-warp deltas between rapid independent gestures.
            const extendAtEdge = () => {
                if (!scrub || lockRequested || (x > 24 && x < innerWidth - 24 && y > 24 && y < innerHeight - 24)) return;
                if (typeof target.requestPointerLock !== 'function') return;
                lockRequested = true;
                try {
                    Promise.resolve(target.requestPointerLock()).then(() => {
                        if (ended && document.pointerLockElement === target) document.exitPointerLock();
                    }).catch(() => {});
                } catch { /* Pointer capture remains active. */ }
            };
            const onMove = (event: PointerEvent) => {
                if (event.pointerId !== pointerId || document.pointerLockElement === target) return;
                event.stopPropagation();
                advance(event.clientX, event.clientY);
                extendAtEdge();
            };
            const onLockedMove = (event: MouseEvent) => {
                if (document.pointerLockElement !== target || !wasLocked) return;
                event.stopPropagation();
                advance(x + event.movementX, y + event.movementY);
            };
            const onUp = (event: PointerEvent) => {
                if (event.pointerId === pointerId) {
                    event.stopPropagation(); g.finish(false);
                }
            };
            const onMouseUp = (event: MouseEvent) => {
                if (document.pointerLockElement === target) {
                    event.stopPropagation(); g.finish(false);
                }
            };
            const onCancel = () => g.finish(true);
            const onLockChange = () => {
                if (document.pointerLockElement === target) wasLocked = true;
                else if (wasLocked) g.finish(true);
            };
            g.finish = (cancel) => {
                if (ended) return;
                ended = true;
                gesture = undefined;
                document.removeEventListener('pointermove', onMove, true);
                document.removeEventListener('mousemove', onLockedMove, true);
                document.removeEventListener('pointerup', onUp, true);
                document.removeEventListener('mouseup', onMouseUp, true);
                document.removeEventListener('pointercancel', onCancel, true);
                document.removeEventListener('pointerlockchange', onLockChange);
                if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId);
                if (document.pointerLockElement === target) document.exitPointerLock();
                dragHint.hidden = true;
                if (cancel) events.fire('background.cancel');
                else {
                    end(); events.fire('background.commit');
                }
                update();
            };
            gesture = g;
            document.addEventListener('pointermove', onMove, true);
            document.addEventListener('mousemove', onLockedMove, true);
            document.addEventListener('pointerup', onUp, true);
            document.addEventListener('mouseup', onMouseUp, true);
            document.addEventListener('pointercancel', onCancel, true);
            document.addEventListener('pointerlockchange', onLockChange);
            if (!scrub) move(x, y, 0, 0);
        };
        const number = (name: string, caption: string, read: () => number, write: (n: number) => void,
            min: number, max: number, parent: HTMLElement, integer = false) => {
            const root = element('div', 'mf-fill-number', parent) as HTMLDivElement;
            const dragLabel = element('span', 'mf-fill-number-label', root);
            dragLabel.textContent = caption;
            dragLabel.title = t('Drag to adjust; move up/down to change speed', '左右拖动调整，上下移动变速');
            const control = new TextInput({ blurOnEnter: false, blurOnEscape: false });
            components.push(control);
            root.append(control.dom);
            const input = control.input;
            input.inputMode = 'decimal';
            input.setAttribute('aria-label', name);
            input.setAttribute('role', 'spinbutton');
            input.setAttribute('aria-valuemin', String(min));
            input.setAttribute('aria-valuemax', String(max));
            const apply = (n: number) => {
                write(integer ? Math.round(n) : Math.round(n * 100) / 100); preview();
            };
            const field: NumberField = { root,
                input,
                read,
                write,
                refresh: () => {
                    const n = Math.round(read() * (integer ? 1 : 100)) / (integer ? 1 : 100);
                    if (textEdit !== input) input.value = String(n);
                    input.setAttribute('aria-valuenow', String(n));
                } };
            fields.push(field);
            input.addEventListener('input', () => {
                beginText(input);
                const valid = input.value.trim() !== '' && Number.isFinite(Number(input.value));
                input.setAttribute('aria-invalid', String(!valid));
                if (valid) apply(clamp(Number(input.value), min, max));
            });
            input.addEventListener('blur', () => {
                if (textEdit === input) finishText();
            });
            input.addEventListener('keydown', (event) => {
                if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
                event.preventDefault();
                beginText(input);
                apply(clamp(read() + (event.key === 'ArrowUp' ? 1 : -1) * (event.shiftKey && !integer ? 0.1 : 1), min, max));
                input.value = String(Math.round(read() * 100) / 100);
            });
            const scrub = (event: PointerEvent) => {
                if (event.button !== 0) return;
                let accumulated = read();
                const left = clamp(event.clientX - 40, 8, innerWidth - 148);
                const top = clamp(event.clientY - 34, 8, innerHeight - 36);
                startDrag(event, root, (_x, _y, dx, dy) => {
                    accumulated = scrubValue(accumulated, dx, dy, min, max);
                    apply(accumulated);
                    dragHint.textContent = `${Math.round(read() * 100) / 100} · ${scrubSpeed(dy)}×`;
                    dragHint.style.left = `${left}px`; dragHint.style.top = `${top}px`;
                    dragHint.hidden = false;
                }, () => {
                    if (name === 'Position') value.gradient.stops.sort((a, b) => a.position - b.position);
                }, true);
            };
            dragLabel.addEventListener('pointerdown', scrub);
            input.addEventListener('pointerdown', (e) => {
                if (e.altKey) scrub(e);
            });
            return field;
        };
        number('Position', t('Position %', '位置 %'), () => (currentStop()?.position ?? 0) * 100,
            (n) => {
                currentStop().position = n / 100;
            }, 0, 100, stopRow);
        const remove = pcButton('−', t('Remove stop', '删除色标'), () => action(() => {
            const stops = value.gradient.stops;
            if (stops.length <= 2) return;
            const i = stops.indexOf(selected);
            stops.splice(i, 1); selected = stops[Math.min(i, stops.length - 1)]; refreshHsv();
        }), stopRow);
        number('Angle', t('Angle °', '角度 °'), () => value.gradient?.angle ?? 180,
            (n) => {
                value.gradient.angle = n;
            }, -360, 360, linearRow);
        pcButton('↔', t('Reverse', '反转'), () => action(() => {
            value.gradient.stops.forEach((s) => {
                s.position = 1 - s.position;
            });
            value.gradient.stops.reverse();
        }), linearRow);
        ([
            ['Center X', t('Center X %', '中心 X %'), 'center', 0, 0, 100],
            ['Center Y', t('Center Y %', '中心 Y %'), 'center', 1, 0, 100],
            ['Radius X', t('Width %', '横向 %'), 'radius', 0, 0.1, 400],
            ['Radius Y', t('Height %', '纵向 %'), 'radius', 1, 0.1, 400]
        ] as const).forEach(([name, caption, key, index, min, max]) => {
            number(name, caption, () => (value.gradient?.[key][index] ?? 0) * 100,
                (n) => {
                    value.gradient[key][index] = n / 100;
                }, min, max, radialRow);
        });
        const sv = element('div', 'mf-fill-sv', body);
        sv.tabIndex = 0; sv.setAttribute('role', 'slider');
        sv.setAttribute('aria-label', 'Saturation and brightness');
        const svHandle = element('span', 'mf-fill-sv-handle', sv);
        const hue = element('div', 'mf-fill-hue mf-fill-slider', body);
        hue.tabIndex = 0; hue.setAttribute('role', 'slider'); hue.setAttribute('aria-label', 'Hue');
        const hueHandle = element('span', 'mf-fill-slider-handle', hue);
        const alpha = element('div', 'mf-fill-alpha mf-fill-slider', body);
        alpha.tabIndex = 0; alpha.setAttribute('role', 'slider'); alpha.setAttribute('aria-label', 'Opacity slider');
        const alphaTint = element('div', 'mf-fill-alpha-tint', alpha);
        const alphaHandle = element('span', 'mf-fill-slider-handle', alpha);
        const writeColor = (rgb: RGB) => {
            const stop = currentStop();
            if (stop) {
                stop.color = rgb; stopHsv.set(stop, hsv);
            } else {
                value.color = rgb; solidHsv = hsv;
            }
            preview();
        };
        const pick = (target: HTMLElement, fn: (x: number, y: number) => void) => {
            target.addEventListener('pointerdown', (e) => {
                const r = target.getBoundingClientRect();
                startDrag(e, target, (x, y) => fn(clamp((x - r.left) / r.width), clamp((y - r.top) / r.height)));
            });
        };
        pick(sv, (x, y) => {
            hsv = [hsv[0], x, 1 - y]; writeColor(hsvToRgb(hsv));
        });
        pick(hue, (x) => {
            hsv = [x, hsv[1], hsv[2]]; writeColor(hsvToRgb(hsv));
        });
        pick(alpha, (x) => {
            if (currentStop()) {
                currentStop().opacity = x; preview();
            }
        });
        [sv, hue, alpha].forEach((target) => {
            target.addEventListener('keydown', (e) => {
                if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
                e.preventDefault();
                action(() => {
                    const d = (e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : 1) * (e.shiftKey ? 0.1 : 0.01);
                    if (target === sv) hsv[e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? 1 : 2] = clamp(hsv[e.key === 'ArrowLeft' || e.key === 'ArrowRight' ? 1 : 2] + d);
                    else if (target === hue) hsv[0] = clamp(hsv[0] + d);
                    else {
                        currentStop().opacity = clamp((currentStop().opacity ?? 1) + d); return;
                    }
                    const stop = currentStop();
                    if (stop) {
                        stop.color = hsvToRgb(hsv); stopHsv.set(stop, hsv);
                    } else {
                        value.color = hsvToRgb(hsv); solidHsv = hsv;
                    }
                });
            });
        });
        const notation = element('div', 'mf-fill-notation', body);
        const formatInput = new SelectInput({ options: [{ v: 'hex', t: 'HEX' }, { v: 'rgb', t: 'RGB' }] });
        components.push(formatInput); notation.append(formatInput.dom);
        formatInput.dom.setAttribute('aria-label', 'Color format');
        formatInput.on('change', (next: string) => {
            if (!syncing) {
                finishText(); format = next; update();
            }
        });
        const hex = new TextInput({ blurOnEnter: false, blurOnEscape: false });
        components.push(hex); notation.append(hex.dom);
        hex.input.setAttribute('aria-label', 'HEX'); hex.input.spellcheck = false;
        hex.input.addEventListener('input', () => {
            beginText(hex.input);
            const valid = /^#?[\da-f]{6}$/i.test(hex.input.value);
            hex.input.setAttribute('aria-invalid', String(!valid));
            if (valid) {
                const h = hex.input.value.replace('#', '');
                const rgb = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255) as RGB;
                hsv = rgbToHsv(rgb, hsv); writeColor(rgb);
            }
        });
        hex.input.addEventListener('blur', () => {
            if (textEdit === hex.input) finishText();
        });
        const rgbRow = element('div', 'mf-fill-rgb', body);
        ['R', 'G', 'B'].forEach((channel, i) => number(channel, channel, () => color()[i] * 255,
            (n) => {
                color()[i] = n / 255; refreshHsv();
            }, 0, 255, rgbRow, true));
        const opacity = number('Opacity', '%', () => (currentStop()?.opacity ?? 1) * 100,
            (n) => {
                currentStop().opacity = n / 100;
            }, 0, 100, notation);
        const handles = new Map<GradientStop, HTMLButtonElement>();
        const syncHandles = () => {
            const stops = value.gradient?.stops ?? [];
            for (const [s, handle] of handles) {
                if (!stops.includes(s)) {
                    handle.remove(); handles.delete(s);
                }
            }
            stops.forEach((s, index) => {
                let handle = handles.get(s);
                if (!handle) {
                    handle = document.createElement('button');
                    handle.type = 'button'; handle.className = 'mf-fill-stop';
                    strip.append(handle); handles.set(s, handle);
                    handle.addEventListener('pointerdown', (e) => {
                        if (e.button !== 0) return;
                        finishText(); selected = s; refreshHsv(); update();
                        const r = strip.getBoundingClientRect();
                        const offset = e.clientX - (r.left + s.position * r.width);
                        startDrag(e, handle, (x) => {
                            const p = clamp((x - offset - r.left) / r.width);
                            if (Math.abs(p - s.position) > 1e-9) {
                                s.position = p; preview();
                            }
                        }, () => value.gradient.stops.sort((a, b) => a.position - b.position));
                    });
                    handle.addEventListener('keydown', (e) => {
                        selected = s;
                        if (e.key === 'Delete' || e.key === 'Backspace') {
                            e.preventDefault();
                            if (value.gradient.stops.length > 2) {
                                action(() => {
                                    value.gradient.stops.splice(value.gradient.stops.indexOf(s), 1); currentStop(); refreshHsv();
                                });
                            }
                        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                            e.preventDefault(); action(() => {
                                s.position = clamp(s.position + (e.key === 'ArrowRight' ? 0.01 : -0.01));
                                value.gradient.stops.sort((a, b) => a.position - b.position);
                            });
                        } else if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault(); refreshHsv(); update();
                        }
                    });
                }
                handle.style.left = `${s.position * 100}%`;
                handle.style.setProperty('--stop-color', cssColor(s.color));
                handle.style.setProperty('--stop-alpha', String(s.opacity ?? 1));
                handle.setAttribute('aria-label', `Stop ${index + 1}`);
                handle.setAttribute('aria-pressed', String(s === selected));
                handle.title = `${Math.round(s.position * 100)}%`;
            });
        };
        strip.addEventListener('pointerdown', (e) => {
            if (e.target !== strip || e.button !== 0) return;
            e.preventDefault(); e.stopPropagation();
            action(() => {
                const r = strip.getBoundingClientRect(), p = clamp((e.clientX - r.left) / r.width);
                selected = { position: p, color: sampleRamp(normalizeGradient(value.gradient), value.color, p), opacity: 1 };
                value.gradient.stops.push(selected);
                value.gradient.stops.sort((a, b) => a.position - b.position);
                refreshHsv();
            });
        });
        position = () => {
            const r = button.getBoundingClientRect();
            // The viewport can change before the browser dispatches its resize event.
            // Bound the existing position in CSS immediately, then realign to the anchor.
            const width = popup.offsetWidth;
            const height = popup.offsetHeight;
            popup.style.left = `clamp(8px, ${r.right - width}px, calc(100vw - ${width + 8}px))`;
            popup.style.top = `clamp(8px, ${r.bottom + 8}px, calc(100vh - ${height + 8}px))`;
        };
        update = () => {
            syncing = true;
            try {
                const g = value.gradient;
                currentStop(); refreshHsv(); swatch();
                mode.value = g?.type ?? 'solid'; formatInput.value = format;
                gradientSection.hidden = !g;
                linearRow.hidden = g?.type !== 'linear'; radialRow.hidden = g?.type !== 'radial';
                alpha.hidden = !g; opacity.root.hidden = !g;
                remove.enabled = !!g && g.stops.length > 2;
                if (g) strip.style.background = backgroundCss({ ...value, gradient: { ...g, type: 'linear', angle: 90 } });
                syncHandles();
                sv.style.backgroundColor = cssColor(hsvToRgb([hsv[0], 1, 1]));
                svHandle.style.left = `${hsv[1] * 100}%`; svHandle.style.top = `${(1 - hsv[2]) * 100}%`;
                svHandle.style.backgroundColor = cssColor(color());
                sv.setAttribute('aria-valuetext', `${Math.round(hsv[1] * 100)}% saturation, ${Math.round(hsv[2] * 100)}% brightness`);
                hueHandle.style.left = `${hsv[0] * 100}%`;
                hue.setAttribute('aria-valuenow', String(Math.round(hsv[0] * 360)));
                hue.setAttribute('aria-valuemin', '0'); hue.setAttribute('aria-valuemax', '360');
                alphaTint.style.background = `linear-gradient(90deg, transparent, ${cssColor(color())})`;
                alphaHandle.style.left = `${(currentStop()?.opacity ?? 1) * 100}%`;
                alpha.setAttribute('aria-valuenow', String(Math.round((currentStop()?.opacity ?? 1) * 100)));
                alpha.setAttribute('aria-valuemin', '0'); alpha.setAttribute('aria-valuemax', '100');
                hex.hidden = format !== 'hex'; rgbRow.hidden = format !== 'rgb';
                if (textEdit !== hex.input) hex.input.value = color().map(c => Math.round(c * 255).toString(16).padStart(2, '0')).join('').toUpperCase();
                fields.forEach(f => f.refresh());
                position();
            } finally {
                syncing = false;
            }
        };
        const onOutside = (e: PointerEvent) => {
            if (!gesture && !popup.contains(e.target as Node) && !button.contains(e.target as Node)) close();
        };
        const onKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault(); e.stopImmediatePropagation();
                if (gesture) gesture.finish(true);
                else if (textEdit) finishText(true);
                else if (mode.dom.classList.contains('pcui-open')) mode.close();
                else if (formatInput.dom.classList.contains('pcui-open')) formatInput.close();
                else close();
            } else if (popup.contains(e.target as Node)) {
                if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
                    e.preventDefault(); e.stopImmediatePropagation(); finishText(); events.fire(e.shiftKey ? 'edit.redo' : 'edit.undo');
                } else if (e.key === 'Enter' && textEdit) {
                    e.preventDefault(); finishText();
                }
            }
        };
        const onBlur = () => {
            gesture?.finish(true); finishText(true);
        };
        const onHidden = () => {
            if (document.hidden) onBlur();
        };
        document.addEventListener('pointerdown', onOutside, true);
        document.addEventListener('keydown', onKey, true);
        document.addEventListener('visibilitychange', onHidden);
        window.addEventListener('blur', onBlur);
        window.addEventListener('resize', position);
        const preventCanvas = (e: Event) => e.stopPropagation();
        popup.addEventListener('pointerdown', preventCanvas);
        popup.addEventListener('wheel', preventCanvas);

        dispose = () => {
            document.removeEventListener('pointerdown', onOutside, true);
            document.removeEventListener('keydown', onKey, true);
            document.removeEventListener('visibilitychange', onHidden);
            window.removeEventListener('blur', onBlur);
            window.removeEventListener('resize', position);
            components.forEach(c => c.destroy());
        };
        document.body.append(popup);
        button.setAttribute('aria-expanded', 'true');
        update();
        mode.focus();
    };
    button.addEventListener('click', open);
    events.on('background.changed', (next: BackgroundFill) => {
        if (!popup) value = next;
        button.style.background = backgroundCss(next);
    });
    events.on('background.refresh', () => {
        value = events.invoke('background.value');
        refreshHsv(); update(); swatch();
    });
    swatch();
    return button;
}
