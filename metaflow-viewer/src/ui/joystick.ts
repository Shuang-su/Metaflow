import type { EventHandle } from 'playcanvas';

import type { ViewerHandle } from '../types';

const initJoystick = (viewer: ViewerHandle, root: HTMLElement) => {
    const { state, events } = viewer;
    const subscriptions: EventHandle[] = [];
    const on = (name: string, fn: (...args: unknown[]) => void) => subscriptions.push(events.on(name, fn));
    const dom: Record<string, HTMLElement> = Object.fromEntries(
        [
            'controlsWrap',
            'joystick',
            'joystickBase',
            'lookJoystick',
            'lookJoystickBase',
            'touchActionControls',
            'touchFlyVerticalControls',
            'touchGameControls',
            'touchJumpButton',
            'touchJumpControls',
            'touchMoveDown',
            'touchMoveUp',
            'touchZoomControls',
            'touchZoomIn',
            'touchZoomOut',
            'ui'
        ].map((name) => [name, root.querySelector<HTMLElement>('.sse-' + name)])
    );
    type JoystickMode = '1d' | '2d';

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const getTouchControlLayout = () => {
        const viewportWidth = root.clientWidth;
        const viewportHeight = root.clientHeight;
        const isLandscape = viewportWidth > viewportHeight;
        const shortSide = Math.min(viewportWidth, viewportHeight);
        const scale = isLandscape ? clamp(shortSide / 390, 0.86, 1.12) : clamp(viewportWidth / 390, 0.92, 1.12);
        const size = (value: number) => Math.round(value * scale);
        const joystickSize = size(isLandscape ? 150 : 130);
        const stickSize = size(isLandscape ? 65 : 56);
        const joystickBorderSize = 2;
        const maxStickTravel = (joystickSize - stickSize) / 2;
        const stickOffset = maxStickTravel - joystickBorderSize;
        const railWidth = stickSize + size(16);
        const railStickOffset = (railWidth - stickSize) / 2 - joystickBorderSize;
        const actionStackWidth = size(46);
        const actionStackHeight = size(100);
        const actionButtonSize = size(38);
        const actionPadding = size(4);
        const actionGap = Math.max(0, actionStackHeight - actionButtonSize * 2 - actionPadding * 2);
        const jumpWrapperSize = actionStackWidth;
        const accessoryGap = size(12);
        const centerInsetX = Math.max(joystickSize / 2 + size(20), Math.min(size(157), viewportWidth * 0.186));
        const leftJoystickEdge = centerInsetX - joystickSize / 2;
        const leftControlCenterX = Math.max(
            actionStackWidth / 2 + size(16),
            centerInsetX - joystickSize / 2 - accessoryGap - actionStackWidth / 2
        );
        const controlsRect = dom.controlsWrap.getBoundingClientRect();
        const controlsTop =
            controlsRect.height > 0 ? controlsRect.top - root.getBoundingClientRect().top : viewportHeight - size(80);
        const bottomLimit = Math.min(viewportHeight - size(24), controlsTop - size(isLandscape ? 18 : 24));
        const centerY = Math.max(joystickSize / 2 + size(18), bottomLimit - joystickSize / 2);
        const controlBottomY = centerY + joystickSize / 2;
        const stackCenterY = isLandscape ? controlBottomY - actionStackHeight / 2 : centerY;
        const jumpCenterY = isLandscape ? controlBottomY - jumpWrapperSize / 2 : centerY;

        return {
            actionButtonSize,
            actionGap,
            actionPadding,
            actionStackHeight,
            actionStackWidth,
            centerInsetX,
            centerY,
            isLandscape,
            jumpWrapperSize,
            joystickSize,
            leftControlCenterX,
            leftJoystickCenterX: centerInsetX,
            maxStickTravel,
            railStickOffset,
            railWidth,
            rightFlyControlCenterX: isLandscape
                ? viewportWidth - leftControlCenterX
                : viewportWidth - leftJoystickEdge - actionStackWidth / 2,
            rightJumpControlCenterX: isLandscape ? viewportWidth - leftControlCenterX : viewportWidth - centerInsetX,
            rightJoystickCenterX: viewportWidth - centerInsetX,
            stackCenterY,
            stickOffset,
            stickSize,
            jumpCenterY
        };
    };

    const applyJoystickSize = (base: HTMLElement, layout = getTouchControlLayout()) => {
        base.style.setProperty('--joystick-size', `${layout.joystickSize}px`);
        base.style.setProperty('--joystick-stick-size', `${layout.stickSize}px`);
        base.style.setProperty('--joystick-stick-offset', `${layout.stickOffset}px`);
        base.style.setProperty('--joystick-rail-width', `${layout.railWidth}px`);
        base.style.setProperty('--joystick-rail-stick-offset', `${layout.railStickOffset}px`);
    };

    const applyTouchActionSize = (layout = getTouchControlLayout()) => {
        dom.touchGameControls.style.setProperty('--touch-action-width', `${layout.actionStackWidth}px`);
        dom.touchGameControls.style.setProperty('--touch-action-height', `${layout.actionStackHeight}px`);
        dom.touchGameControls.style.setProperty('--touch-action-padding', `${layout.actionPadding}px`);
        dom.touchGameControls.style.setProperty('--touch-action-gap', `${layout.actionGap}px`);
        dom.touchGameControls.style.setProperty('--touch-action-button-size', `${layout.actionButtonSize}px`);
        dom.touchGameControls.style.setProperty('--touch-jump-wrapper-size', `${layout.jumpWrapperSize}px`);
        dom.touchGameControls.style.setProperty(
            '--touch-arrow-icon-size',
            `${Math.round(15 * (layout.actionButtonSize / 38))}px`
        );
        dom.touchGameControls.style.setProperty(
            '--touch-zoom-icon-size',
            `${Math.round(20 * (layout.actionButtonSize / 38))}px`
        );
    };

    const centerJoystickStick = (stick: HTMLElement, layout = getTouchControlLayout(), mode: JoystickMode = '2d') => {
        stick.style.top = `${layout.stickOffset}px`;
        stick.style.left = mode === '2d' ? `${layout.stickOffset}px` : `${layout.railStickOffset}px`;
    };

    const applyTouchControlLayout = (layout = getTouchControlLayout()) => {
        applyJoystickSize(dom.joystickBase, layout);
        applyJoystickSize(dom.lookJoystickBase, layout);
        applyTouchActionSize(layout);
        dom.joystickBase.style.left = `${layout.leftJoystickCenterX}px`;
        dom.joystickBase.style.top = `${layout.centerY}px`;
        dom.lookJoystickBase.style.left = `${layout.rightJoystickCenterX}px`;
        dom.lookJoystickBase.style.top = `${layout.centerY}px`;
        dom.touchZoomControls.style.left = `${layout.leftControlCenterX}px`;
        dom.touchZoomControls.style.top = `${layout.stackCenterY}px`;
        dom.touchActionControls.style.left = `${state.cameraMode === 'walk' ? layout.rightJumpControlCenterX : layout.rightFlyControlCenterX}px`;
        dom.touchActionControls.style.top = `${state.cameraMode === 'walk' ? layout.jumpCenterY : layout.stackCenterY}px`;
    };

    // Joystick touch state
    let joystickPointerId: number | null = null;
    let joystickValueX = 0; // -1 to 1, negative = left, positive = right
    let joystickValueY = 0; // -1 to 1, negative = forward, positive = backward
    let lookPointerId: number | null = null;
    let lookValueX = 0;
    let lookValueY = 0;
    let verticalPointerId: number | null = null;
    let zoomPointerId: number | null = null;
    let jumpPointerId: number | null = null;

    // Joystick mode: '1d' for vertical only, '2d' for full directional
    let joystickMode: JoystickMode = '2d';

    // Double-tap detection for mode toggle
    let lastTapTime = 0;

    let modalOpen = dom.ui.classList.contains('sse-modal-open');

    const releasePointerCapture = (element: HTMLElement, pointerId: number | null) => {
        if (pointerId !== null && element.hasPointerCapture(pointerId)) {
            element.releasePointerCapture(pointerId);
        }
    };

    const resetTouchControlInputs = (layout = getTouchControlLayout()) => {
        releasePointerCapture(dom.joystickBase, joystickPointerId);
        releasePointerCapture(dom.lookJoystickBase, lookPointerId);
        releasePointerCapture(dom.touchMoveUp, verticalPointerId);
        releasePointerCapture(dom.touchMoveDown, verticalPointerId);
        releasePointerCapture(dom.touchZoomIn, zoomPointerId);
        releasePointerCapture(dom.touchZoomOut, zoomPointerId);
        releasePointerCapture(dom.touchJumpButton, jumpPointerId);

        joystickPointerId = null;
        joystickValueX = 0;
        joystickValueY = 0;
        lookPointerId = null;
        lookValueX = 0;
        lookValueY = 0;
        verticalPointerId = null;
        zoomPointerId = null;
        jumpPointerId = null;

        centerJoystickStick(dom.joystick, layout, layout.isLandscape ? '2d' : joystickMode);
        centerJoystickStick(dom.lookJoystick, layout, '2d');
        dom.touchMoveUp.classList.remove('sse-active');
        dom.touchMoveDown.classList.remove('sse-active');
        dom.touchZoomIn.classList.remove('sse-active');
        dom.touchZoomOut.classList.remove('sse-active');
        dom.touchJumpButton.classList.remove('sse-active');
        dom.touchFlyVerticalControls.classList.remove('sse-is-pressed');
        dom.touchZoomControls.classList.remove('sse-is-pressed');
        dom.touchJumpControls.classList.remove('sse-is-pressed');

        events.fire('joystickInput', { x: 0, y: 0 });
        events.fire('touchLookInput', { x: 0, y: 0 });
        events.fire('touchZoomInput', { z: 0 });
        events.fire('touchVerticalInput', { y: 0 });
    };

    // Update joystick visibility based on camera mode and input mode
    const updateJoystickVisibility = () => {
        const visible =
            (state.cameraMode === 'fly' || state.cameraMode === 'walk') &&
            state.inputMode === 'touch' &&
            state.gamingControls &&
            !modalOpen &&
            state.loaded &&
            state.xrMode === null;
        const layout = getTouchControlLayout();
        const landscapeVisible = visible && layout.isLandscape;
        const leftJoystickMode = layout.isLandscape ? '2d' : joystickMode;
        applyTouchControlLayout(layout);

        if (visible) {
            dom.joystickBase.classList.remove('sse-hidden');
            dom.joystickBase.classList.toggle('sse-mode-2d', leftJoystickMode === '2d');
            centerJoystickStick(dom.joystick, layout, leftJoystickMode);
        } else {
            dom.joystickBase.classList.add('sse-hidden');
        }

        dom.lookJoystickBase.classList.toggle('sse-hidden', !landscapeVisible);
        if (landscapeVisible) {
            dom.lookJoystickBase.classList.add('sse-mode-2d');
            centerJoystickStick(dom.lookJoystick, layout, '2d');
        } else {
            dom.lookJoystickBase.classList.add('sse-hidden');
            releasePointerCapture(dom.lookJoystickBase, lookPointerId);
            lookPointerId = null;
            lookValueX = 0;
            lookValueY = 0;
            centerJoystickStick(dom.lookJoystick, layout, '2d');
            events.fire('touchLookInput', { x: 0, y: 0 });
        }

        dom.touchGameControls.classList.toggle('sse-hidden', !visible);
        dom.touchGameControls.setAttribute('aria-hidden', String(!visible));
        dom.touchActionControls.classList.toggle('sse-hidden', !visible);
        dom.touchZoomControls.classList.toggle('sse-hidden', !landscapeVisible || state.cameraMode !== 'fly');
        dom.touchFlyVerticalControls.classList.toggle('sse-hidden', !visible || state.cameraMode !== 'fly');
        dom.touchJumpControls.classList.toggle('sse-hidden', !visible || state.cameraMode !== 'walk');

        if (!landscapeVisible || state.cameraMode !== 'fly') {
            releasePointerCapture(dom.touchZoomIn, zoomPointerId);
            releasePointerCapture(dom.touchZoomOut, zoomPointerId);
            zoomPointerId = null;
            dom.touchZoomIn.classList.remove('sse-active');
            dom.touchZoomOut.classList.remove('sse-active');
            dom.touchZoomControls.classList.remove('sse-is-pressed');
            events.fire('touchZoomInput', { z: 0 });
        }
        if (!visible || state.cameraMode !== 'fly') {
            releasePointerCapture(dom.touchMoveUp, verticalPointerId);
            releasePointerCapture(dom.touchMoveDown, verticalPointerId);
            verticalPointerId = null;
            dom.touchMoveUp.classList.remove('sse-active');
            dom.touchMoveDown.classList.remove('sse-active');
            dom.touchFlyVerticalControls.classList.remove('sse-is-pressed');
            events.fire('touchVerticalInput', { y: 0 });
        }
        if (!visible || state.cameraMode !== 'walk') {
            releasePointerCapture(dom.touchJumpButton, jumpPointerId);
            jumpPointerId = null;
            dom.touchJumpButton.classList.remove('sse-active');
            dom.touchJumpControls.classList.remove('sse-is-pressed');
        }
        if (!visible) {
            resetTouchControlInputs(layout);
        }
    };

    on('loaded:changed', updateJoystickVisibility);
    on('xrMode:changed', updateJoystickVisibility);
    on('cameraMode:changed', updateJoystickVisibility);
    on('inputMode:changed', updateJoystickVisibility);
    on('gamingControls:changed', updateJoystickVisibility);
    on('uiModal:changed', (open: boolean) => {
        modalOpen = open;
        updateJoystickVisibility();
    });
    window.addEventListener('resize', updateJoystickVisibility);

    const blockTouchControlMove = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
    };

    [
        dom.touchZoomControls,
        dom.touchActionControls,
        dom.touchFlyVerticalControls,
        dom.touchMoveUp,
        dom.touchMoveDown,
        dom.touchZoomIn,
        dom.touchZoomOut,
        dom.touchJumpControls,
        dom.touchJumpButton
    ].forEach((element) => {
        element.addEventListener('pointermove', blockTouchControlMove);
    });

    // Handle joystick touch input directly on the joystick element
    const updateJoystickStick = (clientX: number, clientY: number) => {
        clientX -= root.getBoundingClientRect().left;
        clientY -= root.getBoundingClientRect().top;
        const layout = getTouchControlLayout();
        const mode = layout.isLandscape ? '2d' : joystickMode;
        applyTouchControlLayout(layout);
        const baseY = layout.centerY;
        // Calculate Y offset from joystick center (positive = down/backward)
        const offsetY = clientY - baseY;
        // Clamp to max travel and normalize to -1 to 1
        const clampedOffsetY = Math.max(-layout.maxStickTravel, Math.min(layout.maxStickTravel, offsetY));
        joystickValueY = clampedOffsetY / layout.maxStickTravel;

        // Update stick visual Y position
        dom.joystick.style.top = `${layout.stickOffset + clampedOffsetY}px`;

        // Handle X axis in 2D mode
        if (mode === '2d') {
            const baseX = layout.leftJoystickCenterX;
            const offsetX = clientX - baseX;
            const clampedOffsetX = Math.max(-layout.maxStickTravel, Math.min(layout.maxStickTravel, offsetX));
            joystickValueX = clampedOffsetX / layout.maxStickTravel;

            // Update stick visual X position
            dom.joystick.style.left = `${layout.stickOffset + clampedOffsetX}px`;
        } else {
            joystickValueX = 0;
            dom.joystick.style.left = `${layout.railStickOffset}px`;
        }

        // Fire input event for the input controller
        events.fire('joystickInput', { x: joystickValueX, y: joystickValueY });
    };

    const updateLookJoystickStick = (clientX: number, clientY: number) => {
        clientX -= root.getBoundingClientRect().left;
        clientY -= root.getBoundingClientRect().top;
        const layout = getTouchControlLayout();
        if (!layout.isLandscape) return;

        applyTouchControlLayout(layout);
        const offsetX = clientX - layout.rightJoystickCenterX;
        const offsetY = clientY - layout.centerY;
        const clampedOffsetX = Math.max(-layout.maxStickTravel, Math.min(layout.maxStickTravel, offsetX));
        const clampedOffsetY = Math.max(-layout.maxStickTravel, Math.min(layout.maxStickTravel, offsetY));
        lookValueX = clampedOffsetX / layout.maxStickTravel;
        lookValueY = clampedOffsetY / layout.maxStickTravel;
        dom.lookJoystick.style.left = `${layout.stickOffset + clampedOffsetX}px`;
        dom.lookJoystick.style.top = `${layout.stickOffset + clampedOffsetY}px`;
        events.fire('touchLookInput', { x: lookValueX, y: lookValueY });
    };

    dom.joystickBase.addEventListener('pointerdown', (event: PointerEvent) => {
        const layout = getTouchControlLayout();
        // Double-tap detection for mode toggle
        const now = Date.now();
        if (!layout.isLandscape && now - lastTapTime < 300) {
            joystickMode = joystickMode === '1d' ? '2d' : '1d';
            updateJoystickVisibility();
            lastTapTime = 0;
        } else {
            lastTapTime = now;
        }

        if (joystickPointerId !== null) return; // Already tracking a touch

        joystickPointerId = event.pointerId;
        dom.joystickBase.setPointerCapture(event.pointerId);

        updateJoystickStick(event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    });

    dom.joystickBase.addEventListener('pointermove', (event: PointerEvent) => {
        if (event.pointerId !== joystickPointerId) return;

        updateJoystickStick(event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    });

    const endJoystickTouch = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.pointerId !== joystickPointerId) return;

        joystickPointerId = null;
        joystickValueX = 0;
        joystickValueY = 0;

        // Reset stick to center
        const layout = getTouchControlLayout();
        const mode = layout.isLandscape ? '2d' : joystickMode;
        applyTouchControlLayout(layout);
        centerJoystickStick(dom.joystick, layout, mode);

        // Fire input event with zero values
        events.fire('joystickInput', { x: 0, y: 0 });

        if (dom.joystickBase.hasPointerCapture(event.pointerId)) {
            dom.joystickBase.releasePointerCapture(event.pointerId);
        }
    };

    dom.joystickBase.addEventListener('pointerup', endJoystickTouch);
    dom.joystickBase.addEventListener('pointercancel', endJoystickTouch);

    dom.lookJoystickBase.addEventListener('pointerdown', (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (lookPointerId !== null) return;

        lookPointerId = event.pointerId;
        dom.lookJoystickBase.setPointerCapture(event.pointerId);
        updateLookJoystickStick(event.clientX, event.clientY);
    });

    dom.lookJoystickBase.addEventListener('pointermove', (event: PointerEvent) => {
        if (event.pointerId !== lookPointerId) return;

        updateLookJoystickStick(event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    });

    const endLookJoystickTouch = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.pointerId !== lookPointerId) return;

        lookPointerId = null;
        lookValueX = 0;
        lookValueY = 0;
        const layout = getTouchControlLayout();
        applyTouchControlLayout(layout);
        centerJoystickStick(dom.lookJoystick, layout, '2d');
        events.fire('touchLookInput', { x: 0, y: 0 });
        if (dom.lookJoystickBase.hasPointerCapture(event.pointerId)) {
            dom.lookJoystickBase.releasePointerCapture(event.pointerId);
        }
    };

    dom.lookJoystickBase.addEventListener('pointerup', endLookJoystickTouch);
    dom.lookJoystickBase.addEventListener('pointercancel', endLookJoystickTouch);

    const setVerticalInput = (y: number) => {
        dom.touchMoveUp.classList.toggle('sse-active', y > 0);
        dom.touchMoveDown.classList.toggle('sse-active', y < 0);
        dom.touchFlyVerticalControls.classList.toggle('sse-is-pressed', y !== 0);
        events.fire('touchVerticalInput', { y });
    };

    const startVerticalInput = (y: number) => (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (verticalPointerId !== null) return;

        verticalPointerId = event.pointerId;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        setVerticalInput(y);
    };

    const endVerticalInput = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.pointerId !== verticalPointerId) return;

        verticalPointerId = null;
        setVerticalInput(0);
        const target = event.currentTarget as HTMLElement;
        if (target.hasPointerCapture(event.pointerId)) {
            target.releasePointerCapture(event.pointerId);
        }
    };

    dom.touchMoveUp.addEventListener('pointerdown', startVerticalInput(1));
    dom.touchMoveDown.addEventListener('pointerdown', startVerticalInput(-1));
    dom.touchMoveUp.addEventListener('pointerup', endVerticalInput);
    dom.touchMoveDown.addEventListener('pointerup', endVerticalInput);
    dom.touchMoveUp.addEventListener('pointercancel', endVerticalInput);
    dom.touchMoveDown.addEventListener('pointercancel', endVerticalInput);
    [dom.touchMoveUp, dom.touchMoveDown].forEach((element) => {
        element.addEventListener('lostpointercapture', (event: PointerEvent) => {
            if (event.pointerId !== verticalPointerId) return;
            verticalPointerId = null;
            setVerticalInput(0);
        });
    });

    const setZoomInput = (z: number) => {
        dom.touchZoomIn.classList.toggle('sse-active', z > 0);
        dom.touchZoomOut.classList.toggle('sse-active', z < 0);
        dom.touchZoomControls.classList.toggle('sse-is-pressed', z !== 0);
        events.fire('touchZoomInput', { z });
    };

    const startZoomInput = (z: number) => (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (zoomPointerId !== null) return;

        zoomPointerId = event.pointerId;
        (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
        setZoomInput(z);
    };

    const endZoomInput = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.pointerId !== zoomPointerId) return;

        zoomPointerId = null;
        setZoomInput(0);
        const target = event.currentTarget as HTMLElement;
        if (target.hasPointerCapture(event.pointerId)) {
            target.releasePointerCapture(event.pointerId);
        }
    };

    dom.touchZoomIn.addEventListener('pointerdown', startZoomInput(1));
    dom.touchZoomOut.addEventListener('pointerdown', startZoomInput(-1));
    dom.touchZoomIn.addEventListener('pointerup', endZoomInput);
    dom.touchZoomOut.addEventListener('pointerup', endZoomInput);
    dom.touchZoomIn.addEventListener('pointercancel', endZoomInput);
    dom.touchZoomOut.addEventListener('pointercancel', endZoomInput);
    [dom.touchZoomIn, dom.touchZoomOut].forEach((element) => {
        element.addEventListener('lostpointercapture', (event: PointerEvent) => {
            if (event.pointerId !== zoomPointerId) return;
            zoomPointerId = null;
            setZoomInput(0);
        });
    });

    const setJumpPressed = (pressed: boolean) => {
        dom.touchJumpButton.classList.toggle('sse-active', pressed);
        dom.touchJumpControls.classList.toggle('sse-is-pressed', pressed);
    };

    const endJumpInput = (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.pointerId !== jumpPointerId) return;

        jumpPointerId = null;
        setJumpPressed(false);
        if (dom.touchJumpButton.hasPointerCapture(event.pointerId)) {
            dom.touchJumpButton.releasePointerCapture(event.pointerId);
        }
    };

    dom.touchJumpButton.addEventListener('pointerdown', (event: PointerEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (jumpPointerId !== null) return;

        jumpPointerId = event.pointerId;
        dom.touchJumpButton.setPointerCapture(event.pointerId);
        setJumpPressed(true);
        events.fire('touchJumpInput');
    });
    dom.touchJumpButton.addEventListener('pointerup', endJumpInput);
    dom.touchJumpButton.addEventListener('pointercancel', endJumpInput);
    dom.touchJumpButton.addEventListener('lostpointercapture', (event: PointerEvent) => {
        if (event.pointerId !== jumpPointerId) return;
        jumpPointerId = null;
        setJumpPressed(false);
    });

    updateJoystickVisibility();

    const onBlur = () => resetTouchControlInputs();
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onBlur);
    const observer = new ResizeObserver(updateJoystickVisibility);
    observer.observe(root);
    const modals = Array.from(root.querySelectorAll('.sse-infoPanel, .sse-settingsPanel, .sse-xrModal'));
    const modalObserver = new MutationObserver(() => {
        modalOpen = modals.some((element) => !element.classList.contains('sse-hidden'));
        updateJoystickVisibility();
    });
    for (const modal of modals) modalObserver.observe(modal, { attributes: true, attributeFilter: ['class'] });
    return () => {
        resetTouchControlInputs();
        observer.disconnect();
        modalObserver.disconnect();
        window.removeEventListener('resize', updateJoystickVisibility);
        window.removeEventListener('blur', onBlur);
        document.removeEventListener('visibilitychange', onBlur);
        for (const handle of subscriptions) handle.off();
    };
};
export { initJoystick };
