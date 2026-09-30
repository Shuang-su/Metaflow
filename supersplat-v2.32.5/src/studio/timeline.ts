/* eslint no-use-before-define: ["error", { "functions": false }] */
import type { AnimTrack } from '../anim-track';
import { AnimTrackEditOp } from '../edit-ops';
import type { Events } from '../events';
import { element, icon, StudioControls } from './controls';

/** Studio owns its input regions; Editor's scrub/individual-drag handlers stay in Editor. */
export function studioTimeline(events: Events, controls: StudioControls, toggle: () => void) {
    const selected = new Set<number>();
    const panel = document.getElementById('timeline-panel');
    panel.classList.add('studio-timeline');
    const row = element('div', '', 'studio-timeline-controls'); panel.prepend(row);
    const warning = element('div', '', 'studio-timeline-warning'); row.append(warning);
    warning.append(element('span', 'Viewer 尚未启用此动画'));
    controls.button(warning, '打开时播放', () => events.invoke('studio.enableAnimation'), 'ghost');
    const center = element('div', '', 'studio-timeline-center'); row.append(center);
    const playGroup = element('div', '', 'studio-timeline-play'); center.append(playGroup);
    const previous = controls.button(playGroup, '上一关键帧', () => seekKey(-1), 'ghost', 'previous', true);
    controls.button(playGroup, '上一帧', () => events.fire('timeline.prevFrame'), 'ghost', 'left', true);
    const play = controls.button(playGroup, '播放', () => events.fire('timeline.setPlaying', !events.invoke('timeline.playing')), 'ghost', 'play', true);
    controls.button(playGroup, '下一帧', () => events.fire('timeline.nextFrame'), 'ghost', 'right', true);
    const next = controls.button(playGroup, '下一关键帧', () => seekKey(1), 'ghost', 'next', true);
    controls.button(playGroup, '在播放头添加关键帧', () => events.invoke('studio.addKey'), 'ghost', 'key', true);
    const remove = controls.button(playGroup, '删除所选关键帧', () => removeKeys([...selected]), 'ghost', 'trash', true);
    const selectionCount = element('span', '', 'studio-key-selection'); center.append(selectionCount);
    const right = element('div', '', 'studio-timeline-right'); row.append(right);
    const position = element('span', '', 'studio-frame-position'); right.append(position);
    const settings = element('div', '', 'studio-timeline-settings'); right.append(settings);
    controls.number(settings, '时长（秒）', (events.invoke('timeline.frames') - 1) / events.invoke('timeline.frameRate'), 0.1, 600,
        value => events.invoke('studio.changeTimeline', 'frames', Math.max(2, Math.round(value * events.invoke('timeline.frameRate')) + 1)), 0.1);
    controls.number(settings, 'FPS', events.invoke('timeline.frameRate'), 1, 120, value => events.invoke('studio.changeTimeline', 'frameRate', value), 1);
    const loop = controls.select(settings, '循环', events.invoke('timeline.loopMode'), [['none', '单次'], ['repeat', '循环'], ['pingpong', '乒乓']], value => events.invoke('studio.changeTimeline', 'loopMode', value));
    loop.dom.parentElement.classList.add('studio-loop-field');
    controls.number(settings, '平滑度', events.invoke('timeline.smoothness'), 0, 1, value => events.invoke('studio.changeTimeline', 'smoothness', value), 0.05, true);
    controls.button(right, '收起时间线', toggle, 'ghost', 'close', true);
    const stage = element('div', '', 'studio-timeline-stage'); panel.append(stage);
    const channel = element('div', '', 'studio-track-channel'); stage.append(channel);
    const trackLabel = element('div', '', 'studio-track-label'); trackLabel.append(icon('video'), element('span', '相机')); channel.append(trackLabel);
    controls.button(trackLabel, '删除相机动画', () => events.invoke('studio.clearAnimation'), 'ghost', 'trash', true);
    const trackArea = element('div', '', 'studio-track-area'); trackArea.tabIndex = 0; trackArea.setAttribute('aria-label', '相机关键帧轨道'); stage.append(trackArea);
    const grid = element('div', '', 'studio-track-grid'), ruler = element('div', '', 'studio-track-ruler'), lane = element('div', '', 'studio-track-lane');
    const cursor = element('div', '', 'studio-track-cursor'), frameLabel = element('span'); cursor.append(frameLabel);
    trackArea.append(grid, ruler, lane, cursor);
    let scale = 1;
    let drag: { pointer: number; kind: 'keys' | 'marquee' | 'seek'; start: number; current: number; frames: number[]; base: number[]; copy: boolean; toggle: boolean; moved: boolean; frame?: number; wasSelected?: boolean } = null;
    const keys = () => (events.invoke('track.keys') as number[] ?? []).slice().sort((a, b) => a - b);
    const end = () => Math.max(1, events.invoke('timeline.frames') - 1);
    const offset = (frame: number) => 20 + frame * scale;
    const relative = (event: PointerEvent) => event.clientX - trackArea.getBoundingClientRect().left;
    const fromPointer = (event: PointerEvent) => Math.max(0, Math.round((relative(event) - 20) / scale));
    const delta = () => Math.max(-Math.min(...drag.frames), Math.round((drag.current - drag.start) / scale));
    function seekKey(direction: number) {
        const all = keys(), frame = events.invoke('timeline.frame');
        if (!all.length) return;
        const target = direction > 0 ? all.find(f => f > frame) ?? all[0] : all.slice().reverse().find(f => f < frame) ?? all[all.length - 1];
        events.fire('timeline.setFrame', Math.min(end(), target));
    }
    function removeKeys(frames: number[]) {
        if (panel.inert || !frames.length) return;
        const track = events.invoke('camera.animTrack') as AnimTrack;
        if (!track) return;
        const before = track.snapshot() as { frame: number }[];
        const set = new Set(frames);
        const after = before.filter(pose => !set.has(pose.frame));
        track.restore(after);
        events.fire('edit.add', new AnimTrackEditOp('删除相机关键帧', track, before, after), true);
        selected.clear(); update();
    }
    function moveKeys(frames: number[], amount: number, copy: boolean) {
        if (!amount) return;
        const track = events.invoke('camera.animTrack') as AnimTrack;
        const before = track.snapshot() as { frame: number }[];
        const source = new Set(frames), targets = new Set(frames.map(frame => frame + amount));
        // Copying onto its own source set would silently erase one of the originals.
        if (copy && [...targets].some(frame => source.has(frame))) return;
        const moving = before.filter(pose => source.has(pose.frame)).map(pose => ({ ...pose, frame: pose.frame + amount }));
        const after = [...before.filter(pose => (copy || !source.has(pose.frame)) && !targets.has(pose.frame)), ...moving].sort((a, b) => a.frame - b.frame);
        track.restore(after);
        events.fire('edit.add', new AnimTrackEditOp(copy ? '复制相机关键帧' : '移动相机关键帧', track, before, after), true);
        selected.clear(); targets.forEach(frame => selected.add(frame)); update();
    }
    function paint() {
        lane.querySelectorAll('.studio-key-ghost,.studio-marquee').forEach(node => node.remove());
        const amount = drag?.kind === 'keys' && drag.moved ? delta() : 0;
        const moving = new Set(amount ? drag.frames : []), targets = new Set(amount ? drag.frames.map(frame => frame + amount) : []);
        lane.querySelectorAll<HTMLElement>('.key').forEach((key) => {
            const frame = Number(key.dataset.frame);
            key.classList.toggle('studio-key-selected', selected.has(frame));
            key.classList.toggle('studio-key-source', moving.has(frame) && !drag.copy);
            key.classList.toggle('studio-key-collision', !moving.has(frame) && targets.has(frame));
            key.setAttribute('aria-pressed', String(selected.has(frame)));
        });
        if (amount) {
            for (const frame of targets) {
                const ghost = element('div', '', 'studio-key-ghost'); ghost.style.left = `${offset(frame)}px`; lane.append(ghost);
            }
        }
        if (drag?.kind === 'marquee' && Math.abs(drag.current - drag.start) >= 3) {
            const box = element('div', '', 'studio-marquee'); box.style.left = `${Math.min(drag.start, drag.current)}px`; box.style.width = `${Math.abs(drag.current - drag.start)}px`; lane.append(box);
        }
        selectionCount.textContent = `${selected.size} 已选择`; remove.disabled = !selected.size || events.invoke('studio.cameraEditing');
    }
    function rebuild() {
        if (drag) {
            paint(); return;
        }
        const all = keys(), maximum = Math.max(end(), ...all);
        scale = Math.max(1, trackArea.getBoundingClientRect().width - 40) / maximum;
        grid.replaceChildren(); ruler.replaceChildren(); lane.replaceChildren();
        if (maximum > end()) {
            const stranded = element('div', '', 'studio-track-stranded'); stranded.style.left = `${offset(end())}px`; grid.append(stranded);
        }
        const min = maximum / Math.max(1, Math.floor((trackArea.clientWidth - 40) / 50));
        const magnitude = 10 ** Math.floor(Math.log10(Math.max(1, min)));
        const step = [1, 2, 5, 10].map(n => n * magnitude).find(n => n >= min) ?? magnitude * 10;
        for (let frame = 0; frame < maximum; frame += step) {
            const line = element('div', '', 'studio-grid-line'); line.style.left = `${offset(frame)}px`; grid.append(line);
            const label = element('span', String(frame)); label.style.left = `${offset(frame)}px`; ruler.append(label);
        }
        const boundary = element('div', '', 'studio-track-end'); boundary.style.left = `${offset(end())}px`; ruler.append(boundary);
        for (const frame of all) {
            const key = element('div', '', 'time-label key'); key.dataset.frame = String(frame); key.style.left = `${offset(frame)}px`;
            key.classList.toggle('out-of-range', frame > end()); key.tabIndex = 0; key.setAttribute('role', 'button'); key.setAttribute('aria-label', `关键帧 ${frame}`); lane.append(key);
        }
        paint(); updateCursor();
    }
    function updateCursor() {
        const frame = events.invoke('timeline.frame');
        cursor.style.left = `${offset(frame)}px`; frameLabel.textContent = String(frame);
        position.replaceChildren(element('span', `${frame} /`), element('span', String(end())));
    }
    trackArea.addEventListener('pointerdown', (event) => {
        if (panel.inert || !event.isPrimary || event.button !== 0 || events.invoke('studio.cameraEditing')) return;
        const key = (event.target as HTMLElement).closest<HTMLElement>('.key');
        const kind = key ? 'keys' : ruler.contains(event.target as Node) ? 'seek' : 'marquee';
        const frame = key ? Number(key.dataset.frame) : undefined, additive = event.ctrlKey || event.metaKey;
        const wasSelected = key && selected.has(frame);
        const frames = key ? wasSelected ? [...selected] : additive ? [...selected, frame] : [frame] : [];
        drag = { pointer: event.pointerId, kind, start: relative(event), current: relative(event), frames, base: additive ? [...selected] : [], copy: event.shiftKey, toggle: additive, moved: false, frame, wasSelected };
        if (key && !wasSelected) {
            selected.clear(); frames.forEach(f => selected.add(f));
        }
        if (kind === 'seek') events.fire('timeline.setFrame', Math.min(end(), fromPointer(event)));
        trackArea.focus({ preventScroll: true }); trackArea.setPointerCapture(event.pointerId); event.preventDefault(); event.stopPropagation(); paint();
    });
    trackArea.addEventListener('pointermove', (event) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        drag.current = relative(event); drag.moved ||= Math.abs(drag.current - drag.start) > 3;
        if (drag.kind === 'seek') events.fire('timeline.setFrame', Math.min(end(), fromPointer(event)));
        if (drag.kind === 'marquee') {
            const lo = Math.min(drag.start, drag.current), hi = Math.max(drag.start, drag.current);
            selected.clear(); drag.base.forEach(frame => selected.add(frame)); keys().filter(frame => offset(frame) >= lo && offset(frame) <= hi).forEach(frame => selected.add(frame));
        }
        paint(); event.stopPropagation();
    });
    const finish = (event: PointerEvent, cancel = false) => {
        if (!drag || drag.pointer !== event.pointerId) return;
        const action = drag, amount = action.kind === 'keys' ? delta() : 0; drag = null;
        if (trackArea.hasPointerCapture(event.pointerId)) trackArea.releasePointerCapture(event.pointerId);
        if (!cancel) {
            if (action.kind === 'keys' && action.moved) moveKeys(action.frames, amount, action.copy);
            else if (action.kind === 'keys' && action.wasSelected) {
                if (action.toggle) selected.delete(action.frame); else {
                    selected.clear(); selected.add(action.frame);
                }
            } else if (action.kind === 'marquee' && !action.moved) {
                selected.clear(); action.base.forEach(frame => selected.add(frame));
            }
        }
        rebuild(); event.stopPropagation();
    };
    trackArea.addEventListener('pointerup', event => finish(event));
    trackArea.addEventListener('pointercancel', event => finish(event, true));
    trackArea.addEventListener('lostpointercapture', event => finish(event, true));
    window.addEventListener('keydown', (event) => {
        const target = event.target as HTMLElement;
        if (target.closest('input,textarea,select,[role="combobox"],dialog,.blocks-shortcuts') || panel.inert) return;
        if (event.key === 'Escape' && drag) {
            const id = drag.pointer; drag = null; if (trackArea.hasPointerCapture(id)) trackArea.releasePointerCapture(id); rebuild(); event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        if (event.key.toLowerCase() === 't' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
            toggle(); event.preventDefault(); event.stopImmediatePropagation(); return;
        }
        if (['Enter', ' '].includes(event.key) && target.closest('button,a,[role="button"],[role="tab"]') && !target.closest('.key')) return;
        const timelineKey = ['Enter', ' ', 'Delete', 'Backspace', ',', '.', '<', '>'].includes(event.key);
        if (!timelineKey || event.metaKey || event.ctrlKey || event.altKey) return;
        // Do not let Editor's model-delete shortcuts consume Studio timeline keys.
        event.preventDefault(); event.stopImmediatePropagation();
        if (panel.classList.contains('studio-collapsed') || events.invoke('studio.cameraEditing')) return;
        if (event.key === 'Enter') events.invoke('studio.addKey');
        if (event.key === ' ') events.fire('timeline.setPlaying', !events.invoke('timeline.playing'));
        if (event.key === ',') events.fire('timeline.prevFrame');
        if (event.key === '.') events.fire('timeline.nextFrame');
        if (event.key === '<') seekKey(-1);
        if (event.key === '>') seekKey(1);
        if (event.key === 'Delete' || event.key === 'Backspace') removeKeys([...selected]);
    }, true);
    new ResizeObserver(rebuild).observe(trackArea);
    function update() {
        const all = keys(); for (const key of selected) if (!all.includes(key)) selected.delete(key);
        const editingCamera = events.invoke('studio.cameraEditing');
        previous.disabled = next.disabled = !all.length || editingCamera;
        playGroup.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
            button.disabled = editingCamera;
        });
        previous.disabled = next.disabled = !all.length || editingCamera;
        controls.sync({ '时长（秒）': end() / events.invoke('timeline.frameRate'), FPS: events.invoke('timeline.frameRate'), '循环': events.invoke('timeline.loopMode'), '平滑度': events.invoke('timeline.smoothness') });
        const playing = events.invoke('timeline.playing'); play.replaceChildren(icon(playing ? 'pause' : 'play')); play.setAttribute('aria-label', playing ? '暂停' : '播放'); play.dataset.tooltip = playing ? '暂停' : '播放'; play.classList.toggle('active', playing);
        warning.hidden = !all.length || events.invoke('studio.experience').startMode === 'animTrack';
        rebuild();
    }
    events.on('timeline.frame', updateCursor);
    for (const name of ['timeline.frames', 'timeline.frameRate', 'timeline.smoothness', 'timeline.loop', 'timeline.loopMode', 'timeline.playing', 'track.keyAdded', 'track.keyRemoved', 'track.keysLoaded', 'track.keyMoved', 'track.keysCleared', 'studio.documentChanged', 'studio.cameraEditMode']) events.on(name, update);
    update();
}
