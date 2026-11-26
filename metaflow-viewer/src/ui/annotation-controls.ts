import type { ViewerHandle } from '../types';

import { attachDirectory, directoryItem, localized } from './annotation-directory';

const initAnnotationControls = (
    viewer: Pick<ViewerHandle, 'state' | 'events' | 'annotations' | 'selectAnnotation'>,
    root: HTMLElement
) => {
    const { state, events, annotations } = viewer;
    const nav = root.querySelector<HTMLElement>('.sse-annotationNav');
    const info = root.querySelector<HTMLElement>('.sse-annotationInfo');
    const number = root.querySelector<HTMLElement>('.sse-annotationNavNumber');
    const title = root.querySelector<HTMLElement>('.sse-annotationNavTitle');
    const prev = root.querySelector<HTMLButtonElement>('.sse-annotationPrev');
    const next = root.querySelector<HTMLButtonElement>('.sse-annotationNext');
    const row = root.querySelector<HTMLElement>('.sse-annotationsRow');
    const check = root.querySelector<HTMLElement>('.sse-annotationsCheck');

    // Retain the last title and navigation position when the panel is dismissed, greyed out
    // while nothing is selected so it does not read as the selection; clicking it selects it.
    let currentIndex = state.selectedAnnotation ?? 0;
    let locationLabel: { title: string; index: number | null } | undefined;
    let followsPosition = false;
    let showingSavedPose = state.selectedAnnotation !== null && state.cameraMode === 'orbit';
    const visibleLocation = () => (showingSavedPose ? undefined : locationLabel);
    const directory = attachDirectory(root, nav, info, annotations, (index) => selectPose(index));
    const trigger = directory?.trigger ?? info;
    const order = directory?.ordered ?? annotations.map((_, i) => i);
    const update = () => {
        currentIndex = state.selectedAnnotation ?? locationLabel?.index ?? currentIndex;
        const location = visibleLocation();
        const displayIndex = location ? location.index : currentIndex;
        // the number its hotspot shows in the scene
        const mark = displayIndex !== null ? annotations[displayIndex] : undefined;
        const item = directoryItem(mark);
        number.textContent = mark ? (item?.code ?? String(displayIndex + 1)) : '';
        const roomHasCatalogCode = location && item && /^[A-F]\d/.test(location.title);
        title.textContent =
            location && !roomHasCatalogCode
                ? location.title
                : item
                  ? localized(item.name, root.lang)
                  : (mark?.title ?? '');
        directory?.update(location ? location.index : state.selectedAnnotation, state.loaded && state.showAnnotations);
        nav.classList.toggle('sse-hidden', !state.loaded || !state.showAnnotations || annotations.length < 2);
        nav.classList.toggle('sse-unselected', state.selectedAnnotation === null);
        nav.classList.toggle('sse-desktop', state.inputMode === 'desktop');
        nav.classList.toggle('sse-touch', state.inputMode === 'touch');
        nav.classList.toggle('sse-faded-in', followsPosition || !state.controlsHidden);
        nav.classList.toggle('sse-faded-out', !followsPosition && state.controlsHidden);
        prev.disabled = next.disabled = !state.loaded || annotations.length < 2;
        row.classList.toggle('sse-hidden', annotations.length === 0);
        check.classList.toggle('sse-active', state.showAnnotations);
    };
    const selectPose = (index: number) => {
        showingSavedPose = true;
        viewer.selectAnnotation(index);
        update();
    };
    const cycle = (dir: number) => {
        const index = order.indexOf(visibleLocation()?.index ?? currentIndex);
        directory?.toggle(false);
        selectPose(order[(index + dir + order.length) % order.length]);
    };
    const onPrev = (event: MouseEvent) => {
        event.stopPropagation();
        cycle(-1);
    };
    const onNext = (event: MouseEvent) => {
        event.stopPropagation();
        cycle(1);
    };
    const onInfo = (event: MouseEvent) => {
        event.stopPropagation();
        if (directory) {
            if (state.loaded) directory.toggle(!directory.isOpen());
            return;
        }
        const location = visibleLocation();
        const index = location ? location.index : currentIndex;
        if (state.loaded && index !== null && (location || state.selectedAnnotation === null) && annotations[index]) {
            selectPose(index);
        }
    };
    const onVisibility = (event: MouseEvent) => {
        event.stopPropagation();
        state.showAnnotations = !state.showAnnotations;
    };
    prev.addEventListener('click', onPrev);
    next.addEventListener('click', onNext);
    trigger.addEventListener('click', onInfo);
    row.addEventListener('click', onVisibility);
    const subscriptions = [
        events.on('loaded:changed', update),
        events.on('selectedAnnotation:changed', (index: number | null) => {
            showingSavedPose = index !== null;
            update();
        }),
        events.on('cameraMode:changed', () => {
            // A saved view controls the title until the visitor resumes movement.
            if (state.cameraMode !== 'orbit') showingSavedPose = false;
            update();
        }),
        events.on('ui:locationLabel', (label: { title: string; index: number | null }) => {
            followsPosition = true;
            locationLabel = label;
            update();
        }),
        events.on('showAnnotations:changed', update),
        events.on('inputMode:changed', update),
        events.on('controlsHidden:changed', update)
    ];
    update();

    return () => {
        for (const subscription of subscriptions) subscription.off();
        prev.removeEventListener('click', onPrev);
        next.removeEventListener('click', onNext);
        trigger.removeEventListener('click', onInfo);
        directory?.destroy();
        row.removeEventListener('click', onVisibility);
    };
};

export { initAnnotationControls };
