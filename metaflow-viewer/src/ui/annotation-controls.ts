import {
    isNavigationAnnotation,
    navigationAnnotationIndices,
    navigationCapability
} from '../navigation/nav-annotation';
import type { ViewerHandle } from '../types';

let nextMenuId = 0;

const initAnnotationControls = (
    viewer: Pick<ViewerHandle, 'state' | 'events' | 'annotations' | 'selectAnnotation'>,
    root: HTMLElement
) => {
    const { state, events, annotations } = viewer;
    const nav = root.querySelector<HTMLElement>('.sse-annotationNav');
    const info = root.querySelector<HTMLButtonElement>('.sse-annotationInfo');
    const number = root.querySelector<HTMLElement>('.sse-annotationNavNumber');
    const title = root.querySelector<HTMLElement>('.sse-annotationNavTitle');
    const prev = root.querySelector<HTMLButtonElement>('.sse-annotationPrev');
    const next = root.querySelector<HTMLButtonElement>('.sse-annotationNext');
    const menu = root.querySelector<HTMLElement>('.sse-annotationMenu');
    const row = root.querySelector<HTMLElement>('.sse-annotationsRow');
    const check = root.querySelector<HTMLElement>('.sse-annotationsCheck');
    const navIndices = navigationAnnotationIndices(annotations);
    const allIndices = annotations.map((_, index) => index);
    const items: HTMLButtonElement[] = [];
    menu.id = `sse-annotation-menu-${++nextMenuId}`;
    info.setAttribute('aria-controls', menu.id);

    let currentIndex = state.selectedAnnotation ?? 0;
    let open = false;
    const close = (restoreFocus = false) => {
        open = false;
        menu.hidden = true;
        nav.classList.remove('sse-menu-open');
        info.setAttribute('aria-expanded', 'false');
        if (restoreFocus) info.focus({ preventScroll: true });
    };
    annotations.forEach((annotation, index) => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'sse-annotationMenuItem';
        item.setAttribute('role', 'option');
        item.dataset.annotationIndex = String(index);
        const label = document.createElement('span');
        label.className = 'sse-annotationMenuTitle';
        label.textContent = annotation.title || `标记 ${index + 1}`;
        const badge = document.createElement('span');
        badge.className = 'sse-annotationMenuBadge';
        badge.textContent = isNavigationAnnotation(annotation) ? '可导览' : '说明';
        item.append(label, badge);
        item.addEventListener('click', (event) => {
            event.stopPropagation();
            currentIndex = index;
            close();
            viewer.selectAnnotation(index);
            root.focus({ preventScroll: true });
            update();
        });
        items.push(item);
        menu.append(item);
    });
    const update = () => {
        currentIndex = state.selectedAnnotation ?? (state.guidanceMode ? state.guidanceTarget : null) ?? currentIndex;
        number.textContent = !state.guidanceMode && annotations[currentIndex] ? String(currentIndex + 1) : '';
        title.textContent = annotations[currentIndex]?.title || '选择标记';
        nav.classList.toggle('sse-hidden', !state.loaded || !state.showAnnotations || annotations.length === 0);
        nav.classList.toggle('sse-unselected', state.selectedAnnotation === null && state.guidanceTarget === null);
        nav.classList.toggle('sse-guidance-mode', state.guidanceMode);
        nav.classList.toggle('sse-desktop', state.inputMode === 'desktop');
        nav.classList.toggle('sse-touch', state.inputMode === 'touch');
        nav.classList.toggle('sse-faded-in', open || !state.controlsHidden);
        nav.classList.toggle('sse-faded-out', !open && state.controlsHidden);
        const count = state.guidanceMode ? navIndices.length : annotations.length;
        prev.disabled = next.disabled = !state.loaded || count < 2;
        row.classList.toggle('sse-hidden', annotations.length === 0);
        check.classList.toggle('sse-active', state.showAnnotations);
        items.forEach((item, index) => {
            const selected =
                state.selectedAnnotation === index ||
                (state.selectedAnnotation === null && state.guidanceMode && state.guidanceTarget === index);
            item.setAttribute('aria-selected', String(selected));
            item.classList.toggle('sse-active', selected);
            item.classList.toggle('sse-navigation-item', isNavigationAnnotation(annotations[index]));
            const capability = navigationCapability(annotations[index]);
            item.hidden = state.guidanceMode && !capability.declared;
            const disabled = state.guidanceMode && capability.declared && !capability.enabled;
            item.disabled = disabled;
            item.title = disabled ? capability.reason : '';
            const badge = item.querySelector<HTMLElement>('.sse-annotationMenuBadge');
            badge.hidden = !state.guidanceMode;
            badge.textContent = disabled ? capability.reason : capability.enabled ? '可导览' : '说明';
        });
        if (!state.loaded || !state.showAnnotations || state.controlsHidden) close();
    };
    const cycle = (delta: number) => {
        const indices = state.guidanceMode ? navIndices : allIndices;
        if (!state.loaded || !indices.length) return;
        const current = indices.indexOf(state.guidanceMode ? (state.guidanceTarget ?? currentIndex) : currentIndex);
        const offset = current < 0 ? (delta < 0 ? 0 : -1) : current;
        currentIndex = indices[(offset + delta + indices.length) % indices.length];
        close();
        viewer.selectAnnotation(currentIndex);
    };
    const onPrev = (event: MouseEvent) => {
        event.stopPropagation();
        cycle(-1);
        root.focus({ preventScroll: true });
    };
    const onNext = (event: MouseEvent) => {
        event.stopPropagation();
        cycle(1);
        root.focus({ preventScroll: true });
    };
    const onInfo = (event: MouseEvent) => {
        event.stopPropagation();
        if (!state.loaded) return;
        if (open) close();
        else {
            open = true;
            menu.hidden = false;
            nav.classList.add('sse-menu-open');
            info.setAttribute('aria-expanded', 'true');
            state.controlsHidden = false;
            update();
        }
    };
    const stopPointer = (event: Event) => event.stopPropagation();
    const onKey = (event: KeyboardEvent) => {
        event.stopPropagation();
        if (event.key === 'Escape' && open) {
            event.preventDefault();
            close(true);
        } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            if (!open) onInfo(new MouseEvent('click'));
            const focusable = items.filter((item) => !item.disabled && !item.hidden);
            const index = focusable.indexOf(document.activeElement as HTMLButtonElement);
            const direction = event.key === 'ArrowDown' ? 1 : -1;
            focusable[(index + direction + focusable.length) % focusable.length]?.focus({ preventScroll: true });
        } else if (event.key === 'Home' || event.key === 'End') {
            event.preventDefault();
            const focusable = items.filter((item) => !item.disabled && !item.hidden);
            focusable[event.key === 'Home' ? 0 : focusable.length - 1]?.focus({ preventScroll: true });
        }
    };
    const onOutside = (event: Event) => {
        if (!nav.contains(event.target as Node)) close();
    };
    const onVisibility = (event: MouseEvent) => {
        event.stopPropagation();
        state.showAnnotations = !state.showAnnotations;
    };
    prev.addEventListener('click', onPrev);
    next.addEventListener('click', onNext);
    info.addEventListener('click', onInfo);
    nav.addEventListener('pointerdown', stopPointer);
    nav.addEventListener('keydown', onKey);
    menu.addEventListener('wheel', stopPointer);
    root.addEventListener('pointerdown', onOutside);
    row.addEventListener('click', onVisibility);
    const subscriptions = [
        events.on('loaded:changed', update),
        events.on('selectedAnnotation:changed', update),
        events.on('guidanceTarget:changed', update),
        events.on('guidanceMode:changed', update),
        events.on('showAnnotations:changed', update),
        events.on('inputMode:changed', update),
        events.on('controlsHidden:changed', update)
    ];
    update();

    return () => {
        for (const subscription of subscriptions) subscription.off();
        prev.removeEventListener('click', onPrev);
        next.removeEventListener('click', onNext);
        info.removeEventListener('click', onInfo);
        nav.removeEventListener('pointerdown', stopPointer);
        nav.removeEventListener('keydown', onKey);
        menu.removeEventListener('wheel', stopPointer);
        root.removeEventListener('pointerdown', onOutside);
        row.removeEventListener('click', onVisibility);
        menu.replaceChildren();
    };
};

export { initAnnotationControls };
