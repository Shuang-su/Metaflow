import type { EventHandler } from 'playcanvas';

import { version as appVersion } from '../package.json';

import { localize } from './localization';
import type { Annotation } from './settings';
import { Tooltip } from './tooltip';
import type { Global } from './types';

const METAFLOW_ACCENT = '#42d2f6';

const TRACKED_UI_ACTIONS: Record<string, string> = {
    play: 'animation_play',
    pause: 'animation_pause',
    orbitCamera: 'camera_orbit',
    flyCamera: 'camera_fly',
    fpsCamera: 'camera_walk',
    arMode: 'xr_ar',
    vrMode: 'xr_vr',
    showCollision: 'show_collision',
    info: 'help_toggle',
    settings: 'settings_toggle',
    enterFullscreen: 'fullscreen_enter',
    exitFullscreen: 'fullscreen_exit',
    performanceModeRow: 'performance_mode_toggle',
    gamingControlsRow: 'gaming_controls_toggle',
    annotationsRow: 'annotations_toggle',
    frame: 'frame_scene',
    reset: 'reset_camera',
    desktopTab: 'help_desktop_tab',
    touchTab: 'help_touch_tab',
    annotationPrev: 'annotation_previous',
    annotationNext: 'annotation_next',
    logoContainer: 'logo_link',
    viewerTitle: 'viewer_title_link',
    xrModalOk: 'xr_reload_webgl',
    xrModalCancel: 'xr_modal_cancel',
    walkHint: 'walk_hint_dismiss'
};

// Initialize the touch joystick for fly mode camera control
const initJoystick = (
    dom: Record<string, HTMLElement>,
    events: EventHandler,
    state: { cameraMode: string; inputMode: string; gamingControls: boolean }
) => {
    type JoystickMode = '1d' | '2d';

    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

    const getTouchControlLayout = () => {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
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
        const controlsTop = controlsRect.height > 0 ? controlsRect.top : viewportHeight - size(80);
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

    let modalOpen = dom.ui.classList.contains('modal-open');

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
        dom.touchMoveUp.classList.remove('active');
        dom.touchMoveDown.classList.remove('active');
        dom.touchZoomIn.classList.remove('active');
        dom.touchZoomOut.classList.remove('active');
        dom.touchJumpButton.classList.remove('active');
        dom.touchFlyVerticalControls.classList.remove('is-pressed');
        dom.touchZoomControls.classList.remove('is-pressed');
        dom.touchJumpControls.classList.remove('is-pressed');

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
            !modalOpen;
        const layout = getTouchControlLayout();
        const landscapeVisible = visible && layout.isLandscape;
        const leftJoystickMode = layout.isLandscape ? '2d' : joystickMode;
        applyTouchControlLayout(layout);

        if (visible) {
            dom.joystickBase.classList.remove('hidden');
            dom.joystickBase.classList.toggle('mode-2d', leftJoystickMode === '2d');
            centerJoystickStick(dom.joystick, layout, leftJoystickMode);
        } else {
            dom.joystickBase.classList.add('hidden');
        }

        dom.lookJoystickBase.classList.toggle('hidden', !landscapeVisible);
        if (landscapeVisible) {
            dom.lookJoystickBase.classList.add('mode-2d');
            centerJoystickStick(dom.lookJoystick, layout, '2d');
        } else {
            dom.lookJoystickBase.classList.add('hidden');
            releasePointerCapture(dom.lookJoystickBase, lookPointerId);
            lookPointerId = null;
            lookValueX = 0;
            lookValueY = 0;
            centerJoystickStick(dom.lookJoystick, layout, '2d');
            events.fire('touchLookInput', { x: 0, y: 0 });
        }

        dom.touchGameControls.classList.toggle('hidden', !visible);
        dom.touchGameControls.setAttribute('aria-hidden', String(!visible));
        dom.touchActionControls.classList.toggle('hidden', !visible);
        dom.touchZoomControls.classList.toggle('hidden', !landscapeVisible || state.cameraMode !== 'fly');
        dom.touchFlyVerticalControls.classList.toggle('hidden', !visible || state.cameraMode !== 'fly');
        dom.touchJumpControls.classList.toggle('hidden', !visible || state.cameraMode !== 'walk');

        if (!landscapeVisible || state.cameraMode !== 'fly') {
            releasePointerCapture(dom.touchZoomIn, zoomPointerId);
            releasePointerCapture(dom.touchZoomOut, zoomPointerId);
            zoomPointerId = null;
            dom.touchZoomIn.classList.remove('active');
            dom.touchZoomOut.classList.remove('active');
            dom.touchZoomControls.classList.remove('is-pressed');
            events.fire('touchZoomInput', { z: 0 });
        }
        if (!visible || state.cameraMode !== 'fly') {
            releasePointerCapture(dom.touchMoveUp, verticalPointerId);
            releasePointerCapture(dom.touchMoveDown, verticalPointerId);
            verticalPointerId = null;
            dom.touchMoveUp.classList.remove('active');
            dom.touchMoveDown.classList.remove('active');
            dom.touchFlyVerticalControls.classList.remove('is-pressed');
            events.fire('touchVerticalInput', { y: 0 });
        }
        if (!visible || state.cameraMode !== 'walk') {
            releasePointerCapture(dom.touchJumpButton, jumpPointerId);
            jumpPointerId = null;
            dom.touchJumpButton.classList.remove('active');
            dom.touchJumpControls.classList.remove('is-pressed');
        }
        if (!visible) {
            resetTouchControlInputs(layout);
        }
    };

    events.on('cameraMode:changed', updateJoystickVisibility);
    events.on('inputMode:changed', updateJoystickVisibility);
    events.on('gamingControls:changed', updateJoystickVisibility);
    events.on('uiModal:changed', (open: boolean) => {
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
        dom.touchMoveUp.classList.toggle('active', y > 0);
        dom.touchMoveDown.classList.toggle('active', y < 0);
        dom.touchFlyVerticalControls.classList.toggle('is-pressed', y !== 0);
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
        dom.touchZoomIn.classList.toggle('active', z > 0);
        dom.touchZoomOut.classList.toggle('active', z < 0);
        dom.touchZoomControls.classList.toggle('is-pressed', z !== 0);
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
        dom.touchJumpButton.classList.toggle('active', pressed);
        dom.touchJumpControls.classList.toggle('is-pressed', pressed);
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
};

// Initialize the annotation navigator for stepping between annotations
const initAnnotationNav = (
    dom: Record<string, HTMLElement>,
    events: EventHandler,
    state: { loaded: boolean; inputMode: string; controlsHidden: boolean; showAnnotations: boolean },
    annotations: Annotation[]
) => {
    // Only show navigator when there are at least 2 annotations
    if (annotations.length < 2) return;

    let currentIndex = 0;
    const isTopOverlayOpen = () =>
        dom.ui.classList.contains('modal-open') || dom.ui.classList.contains('walk-hint-open');

    const updateDisplay = () => {
        dom.annotationNavTitle.textContent = annotations[currentIndex].title || '';
    };

    const updateMode = () => {
        // Metaflow mobile annotation navigation sits near the screen edge.
        // Hide it while higher-priority overlays are open so it never covers
        // walk instructions, help/settings, or XR prompts.
        if (!state.loaded || !state.showAnnotations || isTopOverlayOpen()) {
            dom.annotationNav.classList.add('hidden');
            return;
        }
        dom.annotationNav.classList.remove('desktop', 'touch', 'hidden');
        dom.annotationNav.classList.add(state.inputMode);
    };

    const updateFade = () => {
        if (!state.loaded || !state.showAnnotations || isTopOverlayOpen()) {
            dom.annotationNav.classList.remove('faded-in');
            dom.annotationNav.classList.add('faded-out');
            return;
        }
        dom.annotationNav.classList.toggle('faded-in', !state.controlsHidden);
        dom.annotationNav.classList.toggle('faded-out', state.controlsHidden);
    };

    const goTo = (index: number) => {
        currentIndex = index;
        updateDisplay();
        events.fire('annotation.navigate', annotations[currentIndex]);
    };

    // Prev / Next
    dom.annotationPrev.addEventListener('click', (e) => {
        e.stopPropagation();
        goTo((currentIndex - 1 + annotations.length) % annotations.length);
    });

    dom.annotationNext.addEventListener('click', (e) => {
        e.stopPropagation();
        goTo((currentIndex + 1) % annotations.length);
    });

    // Sync when an annotation is activated externally (e.g. hotspot click)
    events.on('annotation.activate', (annotation: Annotation) => {
        const idx = annotations.indexOf(annotation);
        if (idx !== -1) {
            currentIndex = idx;
            updateDisplay();
        }
    });

    // React to state changes
    events.on('loaded:changed', () => {
        updateMode();
        updateFade();
    });
    events.on('inputMode:changed', updateMode);
    events.on('controlsHidden:changed', updateFade);
    events.on('showAnnotations:changed', () => {
        updateMode();
        updateFade();
    });
    events.on('uiModal:changed', () => {
        updateMode();
        updateFade();
    });
    events.on('walkHint:changed', () => {
        updateMode();
        updateFade();
    });

    // Initial state
    updateDisplay();
};

// update the poster image to start blurry and then resolve to sharp during loading
const initPoster = (events: EventHandler) => {
    const poster = document.getElementById('poster');

    events.on('loaded:changed', () => {
        poster.style.display = 'none';
        document.documentElement.style.setProperty('--canvas-opacity', '1');
    });

    const blur = (progress: number) => {
        if (progress < 0) return;
        poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`;
    };

    events.on('progress:changed', blur);
};

const initUI = (global: Global) => {
    const { config, events, state } = global;

    const stageLabels: Record<string, string> = {
        init: '初始化',
        renderer: '渲染器',
        index: '资源索引',
        environment: '环境加载',
        detect: '资源识别',
        download: '模型下载',
        parse: '数据解析',
        gpu: 'GPU 构建',
        collision: '碰撞准备',
        'voxel-meta': '单体体素元数据',
        'voxel-bin': '单体体素下载',
        'voxel-build': '单体体素构建',
        'voxel-manifest': 'tiled voxel 清单',
        'voxel-tile': '体素分块加载',
        'voxel-tile-switch': '活动 tile 切换',
        overlay: '调试叠层',
        prepare: '渲染准备',
        sort: '高斯排序',
        'stream-schedule': '流式调度',
        'stream-loading': '流式加载',
        'legacy-lod-loading': 'LOD 加载',
        timeout: '超时兜底',
        error: '加载失败',
        complete: '完成'
    };

    // Acquire Elements
    const docRoot = document.documentElement;
    const dom = [
        'ui',
        'controlsWrap',
        'arMode',
        'vrMode',
        'enterFullscreen',
        'exitFullscreen',
        'info',
        'infoPanel',
        'desktopTab',
        'touchTab',
        'desktopInfoPanel',
        'touchInfoPanel',
        'timelineContainer',
        'handle',
        'time',
        'buttonContainer',
        'play',
        'pause',
        'settings',
        'settingsPanel',
        'annotationsRow',
        'annotationsOption',
        'annotationsCheck',
        'orbitCamera',
        'flyCamera',
        'fpsCamera',
        'performanceModeRow',
        'performanceModeCheck',
        'performanceModeOption',
        'gamingControlsDivider',
        'gamingControlsRow',
        'gamingControlsCheck',
        'gamingControlsOption',
        'desktopFlyClickToFly',
        'desktopFlyGamingControls',
        'desktopClickToWalk',
        'desktopGamingControls',
        'touchFlyClickToWalk',
        'touchFlyGamingControls',
        'touchClickToWalk',
        'touchGamingControls',
        'walkHint',
        'reset',
        'frame',
        'loadingText',
        'loadingBar',
        'loadingStatus',
        'joystickBase',
        'joystick',
        'lookJoystickBase',
        'lookJoystick',
        'touchGameControls',
        'touchZoomControls',
        'touchZoomIn',
        'touchZoomOut',
        'touchActionControls',
        'touchFlyVerticalControls',
        'touchMoveUp',
        'touchMoveDown',
        'touchJumpControls',
        'touchJumpButton',
        'showCollision',
        'desktopShowCollisionHelp',
        'tooltip',
        'annotationNav',
        'annotationPrev',
        'annotationNext',
        'annotationInfo',
        'annotationNavTitle',
        'logoContainer',
        'viewerTitle',
        'appVersionLabel',
        'xrModal',
        'xrModalOk',
        'xrModalCancel'
    ].reduce((acc: Record<string, HTMLElement>, id) => {
        acc[id] = document.getElementById(id);
        return acc;
    }, {});

    // populate the info-panel title with the app version
    dom.appVersionLabel.textContent = appVersion;

    // Remove focus from buttons after click so keyboard input isn't captured by the UI
    dom.ui.addEventListener('click', () => {
        (document.activeElement as HTMLElement)?.blur();
    });

    dom.ui.addEventListener('click', (event: MouseEvent) => {
        const target = (event.target as Element | null)?.closest<HTMLElement>('button,a,.settingsRow,#walkHint');
        if (!target?.id) return;
        const action = TRACKED_UI_ACTIONS[target.id];
        if (!action) return;
        global.analytics.track('ui_clicked', {
            element_id: target.id,
            action,
            element_role: target.tagName.toLowerCase()
        });
    });

    // Forward wheel events from UI overlays to the canvas so the camera zooms
    // instead of the page scrolling (e.g. annotation nav, tooltips, hotspots).
    // The non-standard wheelDelta{X,Y} properties aren't part of WheelEventInit,
    // so they get dropped by `new WheelEvent(type, init)`. We re-attach them so
    // the trackpad-vs-mouse classifier in input-controller.ts behaves the same
    // whether the event originated on the canvas or was forwarded from the UI.
    const canvas = global.app.graphicsDevice.canvas as HTMLCanvasElement;
    dom.ui.addEventListener(
        'wheel',
        (event: WheelEvent) => {
            event.preventDefault();
            const forwarded = new WheelEvent(event.type, event);
            const src = event as WheelEvent & {
                wheelDelta?: number;
                wheelDeltaX?: number;
                wheelDeltaY?: number;
            };
            for (const key of ['wheelDelta', 'wheelDeltaX', 'wheelDeltaY'] as const) {
                if (typeof src[key] === 'number') {
                    Object.defineProperty(forwarded, key, { value: src[key], configurable: true });
                }
            }
            canvas.dispatchEvent(forwarded);
        },
        { passive: false }
    );

    // Handle loading progress updates
    events.on('progress:changed', (progress) => {
        if (progress < 0) {
            dom.loadingText.textContent = '';
            dom.loadingBar.style.backgroundImage = '';
            dom.loadingBar.classList.add('indeterminate');
            return;
        }

        dom.loadingBar.classList.remove('indeterminate');
        dom.loadingText.textContent = `${progress}%`;
        if (progress < 100) {
            dom.loadingBar.style.backgroundImage = `linear-gradient(90deg, ${METAFLOW_ACCENT} 0%, ${METAFLOW_ACCENT} ${progress}%, white ${progress}%, white 100%)`;
        } else {
            dom.loadingBar.style.backgroundImage = `linear-gradient(90deg, ${METAFLOW_ACCENT} 0%, ${METAFLOW_ACCENT} 100%)`;
        }
    });

    let statusTimer: ReturnType<typeof setInterval> | null = null;
    let statusBaseText = '';
    let statusStartTime = 0;

    const stopStatusTimer = () => {
        if (statusTimer) {
            clearInterval(statusTimer);
            statusTimer = null;
        }
    };

    const startStatusTimer = () => {
        stopStatusTimer();
        statusStartTime = performance.now();
        statusTimer = setInterval(() => {
            const elapsed = ((performance.now() - statusStartTime) / 1000).toFixed(1);
            dom.loadingStatus.textContent = `${statusBaseText} (${elapsed}s)`;
        }, 100);
    };

    events.on('loadingStatus:changed', (status: string) => {
        const stageLabel = stageLabels[state.loadingStage] || '加载';
        const conflictPrefix = state.loadingConflict ? '[冲突]' : '';
        statusBaseText = `${conflictPrefix}[${stageLabel}] ${status}`;
        dom.loadingStatus.textContent = statusBaseText;
        if (state.progress < 0) {
            startStatusTimer();
        }
    });

    events.on('progress:changed', (progress: number) => {
        if (progress >= 0) {
            stopStatusTimer();
            dom.loadingStatus.textContent = statusBaseText;
        }
    });

    events.on('loadingStage:changed', (stage: string) => {
        dom.loadingBar.classList.toggle('failed', stage === 'error');
        if (stage === 'error') {
            stopStatusTimer();
            dom.loadingBar.classList.remove('indeterminate');
            dom.loadingBar.style.backgroundImage = '';
            dom.loadingText.textContent = '加载失败';
        }
    });

    // Hide loading bar once loaded
    events.on('loaded:changed', () => {
        stopStatusTimer();
        document.getElementById('loadingWrap').classList.add('hidden');
    });

    // Fullscreen support
    const hasFullscreenAPI = docRoot.requestFullscreen && document.exitFullscreen;

    const requestFullscreen = () => {
        if (hasFullscreenAPI) {
            docRoot.requestFullscreen();
        } else {
            window.parent.postMessage('requestFullscreen', '*');
            state.isFullscreen = true;
        }
    };

    const exitFullscreen = () => {
        if (hasFullscreenAPI) {
            if (document.fullscreenElement) {
                document.exitFullscreen().catch(() => {
                    // A fullscreenchange event remains the source of truth.
                });
            }
        } else {
            window.parent.postMessage('exitFullscreen', '*');
            state.isFullscreen = false;
        }
    };

    if (hasFullscreenAPI) {
        document.addEventListener('fullscreenchange', () => {
            state.isFullscreen = !!document.fullscreenElement;
        });
    }

    dom.enterFullscreen.addEventListener('click', requestFullscreen);
    dom.exitFullscreen.addEventListener('click', exitFullscreen);

    // toggle fullscreen when user switches between landscape portrait
    // orientation
    screen?.orientation?.addEventListener('change', () => {
        if (['landscape-primary', 'landscape-secondary'].includes(screen.orientation.type)) {
            requestFullscreen();
        } else {
            exitFullscreen();
        }
    });

    // update UI when fullscreen state changes
    events.on('isFullscreen:changed', (value) => {
        dom.enterFullscreen.classList[value ? 'add' : 'remove']('hidden');
        dom.exitFullscreen.classList[value ? 'remove' : 'add']('hidden');
    });

    // Performance mode toggle
    dom.performanceModeRow.addEventListener('click', () => {
        state.performanceMode = !state.performanceMode;
    });

    const updatePerformanceMode = () => {
        dom.performanceModeCheck.classList.toggle('active', state.performanceMode);
    };
    events.on('performanceMode:changed', updatePerformanceMode);
    events.on('performanceMode:changed', (value: boolean) => {
        localStorage.setItem('performanceMode', String(value));
    });
    updatePerformanceMode();

    // Gaming mode toggle (settings row visible on mobile only)
    dom.gamingControlsRow.addEventListener('click', () => {
        state.gamingControls = !state.gamingControls;
    });

    const updateGamingSettingsVisibility = () => {
        const isDesktop = state.inputMode === 'desktop';
        dom.gamingControlsDivider.classList.toggle('hidden', isDesktop);
        dom.gamingControlsRow.classList.toggle('hidden', isDesktop);
    };
    events.on('inputMode:changed', updateGamingSettingsVisibility);
    updateGamingSettingsVisibility();

    const updateGamingControls = () => {
        dom.gamingControlsCheck.classList.toggle('active', state.gamingControls);
        dom.desktopFlyClickToFly.classList.toggle('hidden', state.gamingControls);
        dom.desktopFlyGamingControls.classList.toggle('hidden', !state.gamingControls);
        dom.desktopClickToWalk.classList.toggle('hidden', state.gamingControls);
        dom.desktopGamingControls.classList.toggle('hidden', !state.gamingControls);
        dom.touchFlyClickToWalk.classList.toggle('hidden', state.gamingControls);
        dom.touchFlyGamingControls.classList.toggle('hidden', !state.gamingControls);
        dom.touchClickToWalk.classList.toggle('hidden', state.gamingControls);
        dom.touchGamingControls.classList.toggle('hidden', !state.gamingControls);
    };

    events.on('gamingControls:changed', updateGamingControls);
    events.on('gamingControls:changed', (value: boolean) => {
        localStorage.setItem('gamingControls', String(value));
    });
    events.on('inputMode:changed', updateGamingControls);
    updateGamingControls();

    // Annotation visibility toggle. Routes without annotations do not expose
    // an inert setting, while the stored preference survives route changes.
    const updateAnnotationsVisibility = () => {
        dom.annotationsRow.classList.toggle('hidden', global.settings.annotations.length === 0);
        dom.annotationsCheck.classList.toggle('active', state.showAnnotations);
        global.app.renderNextFrame = true;
    };

    dom.annotationsRow.addEventListener('click', () => {
        state.showAnnotations = !state.showAnnotations;
    });

    events.on('showAnnotations:changed', updateAnnotationsVisibility);
    events.on('showAnnotations:changed', (value: boolean) => {
        localStorage.setItem('showAnnotations', String(value));
    });
    updateAnnotationsVisibility();

    // AR/VR
    const arChanged = () => dom.arMode.classList[state.hasAR ? 'remove' : 'add']('hidden');
    const vrChanged = () => dom.vrMode.classList[state.hasVR ? 'remove' : 'add']('hidden');

    // XR sessions require a WebGL device. Under WebGPU, prompt the user to reload
    // the viewer with the WebGL renderer before starting AR/VR. Use replace() so
    // the renderer-switch reload doesn't add a back-button entry — important
    // because the viewer often runs inside an iframe (e.g. superspl.at /scene).
    const reloadWithWebgl = () => {
        const reloadUrl = new URL(location.href);
        reloadUrl.searchParams.set('webgl', '');
        location.replace(reloadUrl.toString());
    };

    const updateModalState = () => {
        const modalOpen =
            !dom.infoPanel.classList.contains('hidden') ||
            !dom.settingsPanel.classList.contains('hidden') ||
            !dom.xrModal.classList.contains('hidden');
        dom.ui.classList.toggle('modal-open', modalOpen);
        events.fire('uiModal:changed', modalOpen);
    };

    const showXrModal = () => {
        dom.xrModal.classList.remove('hidden');
        updateModalState();
    };
    const hideXrModal = () => {
        dom.xrModal.classList.add('hidden');
        updateModalState();
    };

    dom.xrModalOk.addEventListener('click', reloadWithWebgl);
    dom.xrModalCancel.addEventListener('click', hideXrModal);
    dom.xrModal.addEventListener('pointerdown', hideXrModal);

    const handleXrClick = (type: 'AR' | 'VR') => {
        global.analytics.track('xr_requested', {
            xr_mode: type,
            renderer: global.renderer
        });
        if (global.app.xr.isAvailable(type === 'AR' ? 'immersive-ar' : 'immersive-vr')) {
            events.fire(type === 'AR' ? 'startAR' : 'startVR');
        } else if (global.renderer === 'webgpu') {
            global.analytics.track('xr_failed', {
                xr_mode: type,
                reason: 'webgpu_requires_reload'
            });
            showXrModal();
        } else {
            global.analytics.track('xr_failed', {
                xr_mode: type,
                reason: 'current_backend_unavailable'
            });
        }
    };

    dom.arMode.addEventListener('click', () => handleXrClick('AR'));
    dom.vrMode.addEventListener('click', () => handleXrClick('VR'));

    events.on('hasAR:changed', arChanged);
    events.on('hasVR:changed', vrChanged);

    arChanged();
    vrChanged();

    // Info panel
    const updateInfoTab = (tab: 'desktop' | 'touch') => {
        if (tab === 'desktop') {
            dom.desktopTab.classList.add('active');
            dom.touchTab.classList.remove('active');
            dom.desktopInfoPanel.classList.remove('hidden');
            dom.touchInfoPanel.classList.add('hidden');
        } else {
            dom.desktopTab.classList.remove('active');
            dom.touchTab.classList.add('active');
            dom.desktopInfoPanel.classList.add('hidden');
            dom.touchInfoPanel.classList.remove('hidden');
        }
    };

    dom.desktopTab.addEventListener('click', () => {
        updateInfoTab('desktop');
    });

    dom.touchTab.addEventListener('click', () => {
        updateInfoTab('touch');
    });

    const toggleHelp = () => {
        updateInfoTab(state.inputMode);
        dom.infoPanel.classList.toggle('hidden');
        updateModalState();
    };

    dom.info.addEventListener('click', toggleHelp);

    dom.infoPanel.addEventListener('pointerdown', () => {
        dom.infoPanel.classList.add('hidden');
        updateModalState();
    });

    events.on('inputEvent', (event) => {
        if (event === 'toggleHelp') {
            toggleHelp();
        } else if (event === 'cancel') {
            // close info panel on cancel
            dom.infoPanel.classList.add('hidden');
            dom.settingsPanel.classList.add('hidden');
            updateModalState();

            // close fullscreen on cancel
            if (state.isFullscreen) {
                exitFullscreen();
            }
        } else if (event === 'interrupt') {
            dom.settingsPanel.classList.add('hidden');
            updateModalState();
        }
    });

    // fade ui controls after 5 seconds of inactivity
    events.on('controlsHidden:changed', (value) => {
        dom.controlsWrap.classList.toggle('faded-out', value);
        dom.controlsWrap.classList.toggle('faded-in', !value);
    });

    // show the ui and start a timer to hide it again
    let uiTimeout: ReturnType<typeof setTimeout> | null = null;
    let annotationVisible = false;

    const isPointerCapturedMode = () =>
        state.inputMode === 'desktop' &&
        state.gamingControls &&
        (state.cameraMode === 'walk' || state.cameraMode === 'fly');

    let walkHintVisible = false;

    const setWalkHintVisible = (visible: boolean) => {
        if (walkHintVisible === visible) {
            return;
        }
        walkHintVisible = visible;
        dom.walkHint.classList.toggle('hidden', !visible);
        dom.ui.classList.toggle('walk-hint-open', visible);
        events.fire('walkHint:changed', visible);
    };

    const hideUI = () => {
        if (uiTimeout) {
            clearTimeout(uiTimeout);
            uiTimeout = null;
        }
        dom.infoPanel.classList.add('hidden');
        dom.settingsPanel.classList.add('hidden');
        updateModalState();
        setWalkHintVisible(false);
        state.controlsHidden = true;
    };

    const showUI = () => {
        if (isPointerCapturedMode()) {
            hideUI();
            return;
        }
        if (uiTimeout) {
            clearTimeout(uiTimeout);
        }
        state.controlsHidden = false;
        uiTimeout = setTimeout(() => {
            uiTimeout = null;
            if (!annotationVisible) {
                state.controlsHidden = true;
            }
        }, 4000);
    };

    // Show controls once loaded
    events.on('loaded:changed', () => {
        dom.controlsWrap.classList.remove('hidden');
        showUI();
    });

    events.on('inputEvent', showUI);

    const updateCapturedUI = () => {
        if (isPointerCapturedMode()) {
            hideUI();
        } else {
            showUI();
        }
    };

    events.on('cameraMode:changed', updateCapturedUI);
    events.on('inputMode:changed', updateCapturedUI);
    events.on('gamingControls:changed', updateCapturedUI);

    // keep UI visible while an annotation tooltip is shown
    events.on('annotation.activate', () => {
        annotationVisible = true;
        showUI();
    });

    events.on('annotation.deactivate', () => {
        annotationVisible = false;
        showUI();
    });

    // Animation controls
    events.on('hasAnimation:changed', () => {
        // Start and Stop animation
        dom.play.addEventListener('click', () => {
            state.cameraMode = 'anim';
            state.animationPaused = false;
        });

        dom.pause.addEventListener('click', () => {
            state.cameraMode = 'anim';
            state.animationPaused = true;
        });

        const updatePlayPause = () => {
            if (state.cameraMode !== 'anim' || state.animationPaused) {
                dom.play.classList.remove('hidden');
                dom.pause.classList.add('hidden');
            } else {
                dom.play.classList.add('hidden');
                dom.pause.classList.remove('hidden');
            }

            if (state.cameraMode === 'anim') {
                dom.timelineContainer.classList.remove('hidden');
            } else {
                dom.timelineContainer.classList.add('hidden');
            }
        };

        // Update UI on animation changes
        events.on('cameraMode:changed', updatePlayPause);
        events.on('animationPaused:changed', updatePlayPause);

        const updateSlider = () => {
            dom.handle.style.left = `${(state.animationTime / state.animationDuration) * 100}%`;
            dom.time.style.left = `${(state.animationTime / state.animationDuration) * 100}%`;
            dom.time.innerText = `${state.animationTime.toFixed(1)}s`;
        };

        events.on('animationTime:changed', updateSlider);
        events.on('animationLength:changed', updateSlider);

        const handleScrub = (event: PointerEvent) => {
            const rect = dom.timelineContainer.getBoundingClientRect();
            const t = Math.max(0, Math.min(rect.width - 1, event.clientX - rect.left)) / rect.width;
            events.fire('scrubAnim', state.animationDuration * t);
            showUI();
        };

        let paused = false;
        let captured = false;

        dom.timelineContainer.addEventListener('pointerdown', (event: PointerEvent) => {
            if (!captured) {
                handleScrub(event);
                dom.timelineContainer.setPointerCapture(event.pointerId);
                dom.time.classList.remove('hidden');
                paused = state.animationPaused;
                state.animationPaused = true;
                captured = true;
            }
        });

        dom.timelineContainer.addEventListener('pointermove', (event: PointerEvent) => {
            if (captured) {
                handleScrub(event);
            }
        });

        dom.timelineContainer.addEventListener('pointerup', (event) => {
            if (captured) {
                dom.timelineContainer.releasePointerCapture(event.pointerId);
                dom.time.classList.add('hidden');
                state.animationPaused = paused;
                captured = false;
            }
        });
    });

    // Camera mode UI
    const updateCameraModeUI = () => {
        dom.orbitCamera.classList.toggle('active', state.cameraMode === 'orbit');
        dom.flyCamera.classList.toggle('active', state.cameraMode === 'fly');
        dom.fpsCamera.classList.toggle('active', state.cameraMode === 'walk');
    };

    events.on('cameraMode:changed', updateCameraModeUI);

    // Walk mode hint banner (shown once per session on first FPS entry)
    let walkHintShown = false;

    const getWalkHintText = () => {
        if (state.inputMode === 'desktop') {
            return localize('walk-hint.desktop');
        }
        return localize(state.gamingControls ? 'walk-hint.touch-gaming' : 'walk-hint.touch-tap');
    };

    events.on('cameraMode:changed', (value: string) => {
        if (value === 'walk' && !walkHintShown && !isPointerCapturedMode()) {
            walkHintShown = true;
            dom.walkHint.textContent = getWalkHintText();
            setWalkHintVisible(true);
        } else if (value !== 'walk') {
            setWalkHintVisible(false);
        }
    });

    const dismissWalkHint = () => setWalkHintVisible(false);

    dom.walkHint.addEventListener('click', dismissWalkHint);
    events.on('inputEvent', (type: string) => {
        if (type === 'interrupt') dismissWalkHint();
    });

    // Metaflow shows walk mode as soon as the resource declares voxel/collision
    // data. The button remains disabled until the collision is actually ready;
    // for tiled voxel this means the tile under the user's feet has loaded, not
    // the full 3x3 neighborhood or the full 5GB scene.
    const updateWalkButton = () => {
        const hasWalkCapability = state.walkCapability;
        const walkReady = state.walkAllowed;
        dom.fpsCamera.classList.toggle('hidden', !hasWalkCapability);
        dom.fpsCamera.classList.toggle('disabled', hasWalkCapability && !walkReady);
        (dom.fpsCamera as HTMLButtonElement).disabled = hasWalkCapability && !walkReady;
        // adjust fly button shape: middle when FPS is visible, right when hidden
        dom.flyCamera.classList.toggle('middle', hasWalkCapability);
        dom.flyCamera.classList.toggle('right', !hasWalkCapability);
    };
    events.on('walkCapability:changed', updateWalkButton);
    events.on('walkAllowed:changed', updateWalkButton);
    updateWalkButton();

    // Collision overlay toggle + matching help-panel row (only visible when overlay is available)
    events.on('hasCollisionOverlay:changed', (value: boolean) => {
        dom.showCollision.classList.toggle('hidden', !value);
        dom.desktopShowCollisionHelp.classList.toggle('hidden', !value);
    });

    dom.showCollision.addEventListener('click', () => {
        state.collisionOverlayEnabled = !state.collisionOverlayEnabled;
    });

    events.on('collisionOverlayEnabled:changed', (value: boolean) => {
        dom.showCollision.classList.toggle('active', value);
    });

    dom.settings.addEventListener('click', () => {
        dom.settingsPanel.classList.toggle('hidden');
        updateModalState();
    });

    dom.orbitCamera.addEventListener('click', () => {
        state.cameraMode = 'orbit';
    });

    dom.flyCamera.addEventListener('click', () => {
        state.cameraMode = 'fly';
    });

    dom.fpsCamera.addEventListener('click', () => {
        if (state.walkAllowed) {
            events.fire('inputEvent', 'toggleWalk');
        }
    });

    dom.reset.addEventListener('click', (event) => {
        events.fire('inputEvent', 'reset', event);
    });

    dom.frame.addEventListener('click', (event) => {
        events.fire('inputEvent', 'frame', event);
    });

    // Initialize touch joystick for fly mode
    initJoystick(dom, events, state);

    // Initialize annotation navigator
    initAnnotationNav(dom, events, state, global.settings.annotations);

    // Hide all UI (poster, loading bar, controls)
    if (config.noui) {
        dom.ui.classList.add('hidden');
    }

    // tooltips
    const tooltip = new Tooltip(dom.tooltip);

    tooltip.register(dom.play, localize('tooltip.play'), 'top');
    tooltip.register(dom.pause, localize('tooltip.pause'), 'top');
    tooltip.register(dom.orbitCamera, localize('tooltip.orbit-camera'), 'top');
    tooltip.register(dom.flyCamera, localize('tooltip.fly-camera'), 'top');
    tooltip.register(dom.fpsCamera, localize('tooltip.walk-mode'), 'top');
    tooltip.register(dom.reset, localize('tooltip.reset-camera'), 'bottom');
    tooltip.register(dom.frame, localize('tooltip.frame-scene'), 'bottom');
    tooltip.register(dom.showCollision, localize('tooltip.show-collision'), 'top');
    tooltip.register(dom.settings, localize('tooltip.settings'), 'top');
    tooltip.register(dom.info, localize('tooltip.help'), 'top');
    tooltip.register(dom.arMode, localize('tooltip.enter-ar'), 'top');
    tooltip.register(dom.vrMode, localize('tooltip.enter-vr'), 'top');
    tooltip.register(dom.enterFullscreen, localize('tooltip.fullscreen'), 'top');
    tooltip.register(dom.exitFullscreen, localize('tooltip.fullscreen'), 'top');

    // Mobile has no hover state, so the first tap expands the Metaflow wordmark
    // and a later tap follows the link. Desktop keeps the original hover affordance.
    dom.logoContainer.addEventListener('click', (event) => {
        if (window.matchMedia('(hover: none)').matches && !dom.logoContainer.classList.contains('expanded')) {
            event.preventDefault();
            dom.logoContainer.classList.add('expanded');
        }
    });

    const isThirdPartyEmbedded = () => {
        try {
            return window.location.hostname !== window.parent.location.hostname;
        } catch {
            // cross-origin iframe — parent location is inaccessible
            return true;
        }
    };

    if (window.parent !== window && isThirdPartyEmbedded()) {
        const viewUrl = new URL(window.location.href);
        if (viewUrl.pathname === '/s') {
            viewUrl.pathname = '/view';
        }

        (dom.logoContainer as HTMLAnchorElement).href = viewUrl.toString();
        (dom.viewerTitle as HTMLAnchorElement).href = viewUrl.toString();
    }
};

export { initPoster, initUI };
