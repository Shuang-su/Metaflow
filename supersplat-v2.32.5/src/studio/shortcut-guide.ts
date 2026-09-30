import { element, StudioControls } from './controls';

/** Native top-layer modal: never clipped by the canvas, inspector or timeline. */
export function shortcutGuide(parent: HTMLElement, controls: StudioControls) {
    const hint = element('aside', '', 'studio-viewport-hint'); hint.setAttribute('aria-label', '快捷键指南'); parent.append(hint);
    for (const type of ['pointerdown', 'pointerup', 'pointermove', 'wheel', 'dblclick']) hint.addEventListener(type, event => event.stopPropagation());
    const keys = element('div', '', 'studio-navigation-keys');
    for (const key of ['W', 'A', 'S', 'D']) keys.append(element('kbd', key));
    const label = element('span', '飞行'); hint.append(keys, label);
    const dialog = element('dialog', '', 'studio-shortcut-dialog blocks-shortcuts');
    dialog.setAttribute('aria-labelledby', 'studio-shortcut-title'); dialog.setAttribute('aria-describedby', 'studio-shortcut-description');
    const title = element('h2', '键盘快捷键'); title.id = 'studio-shortcut-title';
    const description = element('p', 'Studio 常用操作速查。'); description.id = 'studio-shortcut-description'; dialog.append(title, description);
    const grid = element('div', '', 'studio-shortcut-grid'); dialog.append(grid);
    const modifier = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
    for (const [heading, rows] of [
        ['飞行模式', [['移动', ['W', 'A', 'S', 'D']], ['下降／上升', ['Q', 'E']], ['加速', ['Shift']], ['减速', ['Ctrl']]]],
        ['相机', [['设置旋转中心', ['双击']], ['取景', ['F']], ['重置相机', ['Shift', '+', 'F']], ['切换 Orbit／Fly', ['V']]]],
        ['编辑', [['撤销', [modifier, '+', 'Z']], ['重做', [modifier, '+', 'Shift', '+', 'Z']]]],
        ['标记', [['添加标记', ['C']], ['取消／取消选择', ['Esc']]]]
    ] as [string, [string, string[]][]][]) {
        const section = element('section'); section.append(element('h3', heading)); grid.append(section);
        for (const [text, shortcuts] of rows) {
            const row = element('div', '', 'studio-shortcut-row'), group = element('span'); row.append(element('span', text), group);
            for (const key of shortcuts) group.append(element(key === '+' ? 'span' : 'kbd', key)); section.append(row);
        }
    }
    controls.button(dialog, '关闭快捷键指南', () => dialog.close(), 'ghost studio-shortcut-close', 'close', true);
    const open = controls.button(hint, '打开快捷键指南', () => dialog.showModal(), 'ghost', 'help', true);
    dialog.addEventListener('click', (event) => {
        if (event.target === dialog) {
            const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) dialog.close();
        }
    });
    dialog.addEventListener('close', () => open.focus()); document.body.append(dialog);
    return (fly: boolean, placing: boolean) => {
        keys.hidden = placing; label.textContent = placing ? '单击模型放置标记' : '飞行';
        hint.classList.toggle('fly-active', fly);
    };
}
