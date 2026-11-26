import type { Annotation } from '../settings';

type Name = { zh: string; en: string };
type DirectoryItem = { group: string; groupName: Name; code: string; name: Name };
const directoryItem = (annotation?: Readonly<Annotation>): DirectoryItem | undefined =>
    annotation?.extras?.metaflow?.annotationDirectory;
const localized = (name: Name, language: string) => (language.startsWith('zh') ? name.zh : name.en) || name.zh;
let nextId = 0;

/** Use SP's authored groups and codes while retaining the viewer's original annotation indices. */
function attachDirectory(
    root: HTMLElement,
    nav: HTMLElement,
    info: HTMLElement,
    annotations: readonly Readonly<Annotation>[],
    select: (index: number) => void
) {
    const entries = annotations.flatMap((mark, index) => {
        const item = directoryItem(mark);
        return item?.code && item.group && item.groupName && item.name ? [{ index, item }] : [];
    });
    if (!entries.length) return;
    entries.sort(
        (a, b) =>
            a.item.group.localeCompare(b.item.group) ||
            a.item.code.localeCompare(b.item.code, 'en', { numeric: true }) ||
            a.index - b.index
    );
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = info.className;
    trigger.append(...Array.from(info.childNodes));
    const chevron = document.createElement('span');
    chevron.className = 'sse-annotationMenuChevron';
    chevron.setAttribute('aria-hidden', 'true');
    trigger.append(chevron);
    info.replaceWith(trigger);
    const menu = document.createElement('div');
    menu.className = 'sse-annotationMenu sse-settingsSurface';
    menu.id = 'sse-annotation-menu-' + ++nextId;
    menu.hidden = true;
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', root.lang.startsWith('zh') ? '场景标记' : 'Scene markers');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-controls', menu.id);
    nav.classList.add('sse-directory-mode');
    const barSurface = document.createElement('span');
    barSurface.className = 'sse-annotationBarSurface sse-settingsSurface';
    barSurface.setAttribute('aria-hidden', 'true');
    nav.prepend(barSurface);
    nav.append(menu);
    const backdrop = document.createElement('div');
    backdrop.className = 'sse-annotationMenuBackdrop';
    backdrop.hidden = true;
    nav.before(backdrop);
    const groups = new Map<string, HTMLElement>();
    const options = new Map<number, HTMLButtonElement>();
    for (const { index, item } of entries) {
        let group = groups.get(item.group);
        if (!group) {
            group = document.createElement('div');
            group.className = 'sse-annotationMenuGroup sse-settingsGroup';
            group.setAttribute('role', 'group');
            const heading = document.createElement('div');
            heading.className = 'sse-annotationMenuGroupHeading';
            heading.id = menu.id + '-' + item.group;
            heading.textContent = item.group + '  ' + localized(item.groupName, root.lang);
            group.setAttribute('aria-labelledby', heading.id);
            group.append(heading);
            groups.set(item.group, group);
            menu.append(group);
        }
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'sse-annotationMenuItem';
        button.dataset.annotationIndex = String(index);
        button.setAttribute('role', 'option');
        button.tabIndex = -1;
        const code = document.createElement('span');
        code.className = 'sse-annotationMenuCode sse-key';
        code.textContent = item.code;
        const name = document.createElement('span');
        name.textContent = localized(item.name, root.lang);
        button.append(code, name);
        const row = document.createElement('div');
        row.className = 'sse-settingsRow';
        row.append(button);
        group.append(row);
        options.set(index, button);
    }
    const ordered = [...options.keys()];
    const buttons = [...options.values()];
    const controls = root.querySelector<HTMLElement>('.sse-controlsWrap');
    function size() {
        if (menu.hidden) return;
        const viewport = window.visualViewport;
        const menuTop = menu.getBoundingClientRect().top;
        const toolbar = controls?.getBoundingClientRect();
        let bottom = Math.min(
            root.getBoundingClientRect().bottom,
            viewport ? viewport.offsetTop + viewport.height : innerHeight
        );
        if (
            toolbar &&
            toolbar.height &&
            toolbar.top > menuTop &&
            !controls.classList.contains('sse-faded-out') &&
            !controls.classList.contains('sse-hidden')
        )
            bottom = Math.min(bottom, toolbar.top);
        menu.style.maxHeight = Math.max(0, Math.min(bottom - menuTop - 12, root.clientHeight * 0.56, 440)) + 'px';
    }
    function toggle(open: boolean, restoreFocus = false) {
        menu.hidden = !open;
        backdrop.hidden = !open;
        nav.classList.toggle('sse-menu-open', open);
        trigger.setAttribute('aria-expanded', String(open));
        if (open) size();
        if (restoreFocus) trigger.focus({ preventScroll: true });
    }
    const onKey = (event: KeyboardEvent) => {
        const key = event.key;
        event.stopPropagation();
        if (key === 'Tab') {
            toggle(false);
            return;
        }
        if (key === 'Escape') {
            event.preventDefault();
            toggle(false, true);
            return;
        }
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) return;
        event.preventDefault();
        toggle(true);
        const focused = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next =
            key === 'Home'
                ? 0
                : key === 'End'
                  ? buttons.length - 1
                  : key === 'ArrowDown'
                    ? (focused + 1) % buttons.length
                    : focused < 0
                      ? buttons.length - 1
                      : (focused + buttons.length - 1) % buttons.length;
        buttons[next].focus({ preventScroll: true });
        buttons[next].scrollIntoView({ block: 'nearest' });
    };
    const onOutside = (event: Event) => {
        if (event.target !== backdrop && !nav.contains(event.target as Node)) toggle(false);
    };
    const stop = (event: Event) => event.stopPropagation();
    const onItem = (event: MouseEvent) => {
        event.stopPropagation();
        const item = (event.target as HTMLElement).closest<HTMLButtonElement>('button[data-annotation-index]');
        if (!item || menu.hidden) return;
        toggle(false);
        select(Number(item.dataset.annotationIndex));
        root.focus({ preventScroll: true });
    };
    nav.addEventListener('keydown', onKey);
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'])
        nav.addEventListener(event, stop);
    menu.addEventListener('click', onItem);
    backdrop.addEventListener('click', (event) => {
        event.stopPropagation();
        toggle(false, true);
    });
    for (const event of ['pointerdown', 'pointermove', 'pointerup', 'wheel']) backdrop.addEventListener(event, stop);
    root.ownerDocument.addEventListener('pointerdown', onOutside, true);
    const observer = new ResizeObserver(size);
    observer.observe(root);
    observer.observe(nav);
    if (controls) observer.observe(controls);
    window.visualViewport?.addEventListener('resize', size);
    return {
        trigger,
        ordered,
        toggle,
        isOpen: () => !menu.hidden,
        update(index: number | null, visible: boolean) {
            if (!visible && !menu.hidden) toggle(false);
            for (const [key, button] of options) button.setAttribute('aria-selected', String(key === index));
        },
        destroy() {
            observer.disconnect();
            window.visualViewport?.removeEventListener('resize', size);
            root.ownerDocument.removeEventListener('pointerdown', onOutside, true);
            nav.removeEventListener('keydown', onKey);
            for (const event of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'wheel'])
                nav.removeEventListener(event, stop);
            menu.removeEventListener('click', onItem);
            menu.remove();
            barSurface.remove();
            backdrop.remove();
            chevron.remove();
            info.append(...Array.from(trigger.childNodes));
            trigger.replaceWith(info);
            nav.classList.remove('sse-directory-mode', 'sse-menu-open');
        }
    };
}

export { attachDirectory, directoryItem, localized };
