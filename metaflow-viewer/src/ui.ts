import { EventHandler } from 'playcanvas';

import type { Annotation as AnnotationSettings } from './settings';
import { Tooltip } from './tooltip';
import type { CameraMode, FlyInputMode, Global, WalkInputMode } from './types';

const WALK_HINT_DURATION_MS = 6000;
const WALK_HINT_DISMISS_GRACE_MS = 150;

const initPoster = (events: EventHandler) => {
    const poster = document.getElementById('poster');

    events.on('firstFrame', () => {
        poster.style.display = 'none';
        document.documentElement.style.setProperty('--canvas-opacity', '1');
    });

    const blur = (progress: number) => {
        if (progress < 0) return;
        poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`;
    };

    events.on('progress:changed', blur);
};

const initAnnotationNav = (
    dom: Record<string, HTMLElement>,
    events: EventHandler,
    state: { loaded: boolean; inputMode: string; controlsHidden: boolean },
    annotations: AnnotationSettings[]
) => {
    if (annotations.length < 2 || !dom.annotationNav) {
        return;
    }

    let currentIndex = 0;
    const isTopOverlayOpen = () =>
        dom.ui.classList.contains('modal-open') ||
        dom.ui.classList.contains('walk-hint-open');

    const updateDisplay = () => {
        dom.annotationNavTitle.textContent = annotations[currentIndex].title || '';
    };

    const updateMode = () => {
        if (!state.loaded || isTopOverlayOpen()) {
            dom.annotationNav.classList.add('hidden');
            return;
        }

        dom.annotationNav.classList.remove('desktop', 'touch', 'hidden');
        dom.annotationNav.classList.add(state.inputMode);
    };

    const updateFade = () => {
        if (!state.loaded || isTopOverlayOpen()) {
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

    dom.annotationPrev.addEventListener('click', (event) => {
        event.stopPropagation();
        goTo((currentIndex - 1 + annotations.length) % annotations.length);
    });

    dom.annotationNext.addEventListener('click', (event) => {
        event.stopPropagation();
        goTo((currentIndex + 1) % annotations.length);
    });

    events.on('annotation.activate', (annotation: AnnotationSettings) => {
        const idx = annotations.indexOf(annotation);
        if (idx !== -1) {
            currentIndex = idx;
            updateDisplay();
        }
    });

    events.on('loaded:changed', () => {
        updateMode();
        updateFade();
    });
    events.on('inputMode:changed', updateMode);
    events.on('controlsHidden:changed', updateFade);
    events.on('uiModal:changed', () => {
        updateMode();
        updateFade();
    });
    events.on('walkHint:changed', () => {
        updateMode();
        updateFade();
    });

    updateDisplay();
};

const initUI = (global: Global) => {
    const { config, events, state } = global;

    const stageLabels: Record<string, string> = {
        init: '初始化',
        environment: '环境加载',
        detect: '资源识别',
        download: '模型下载',
        parse: '数据解析',
        gpu: 'GPU 构建',
        'voxel-meta': '碰撞元数据',
        'voxel-bin': '碰撞体素下载',
        'voxel-build': '碰撞体素构建',
        prepare: '渲染准备',
        sort: '高斯排序',
        'stream-schedule': '流式调度',
        'stream-loading': '流式加载',
        'legacy-lod-loading': 'LOD 加载',
        timeout: '超时兜底',
        complete: '完成'
    };

    const domIds = [
        'ui',
        'controlsWrap',
        'arMode', 'vrMode',
        'enterFullscreen', 'exitFullscreen',
        'info', 'infoPanel', 'desktopTab', 'touchTab', 'desktopInfoPanel', 'touchInfoPanel',
        'timelineContainer', 'handle', 'time',
        'buttonsContainer',
        'play', 'pause',
        'settings', 'settingsPanel',
        'cameraModeControls', 'orbitModeGroup', 'flyModeGroup', 'walkModeGroup',
        'orbitCamera', 'flyCamera', 'fpsCamera',
        'flySubmodes', 'walkSubmodes',
        'flyGestureMode', 'flyGamepadMode',
        'walkTouchMode', 'walkGamepadMode',
        'walkClickMode', 'walkKeyboardMode',
        'showVoxels',
        'walkHint',
        'hqRow', 'hqCheck', 'hqOption', 'lqRow', 'lqCheck', 'lqOption',
        'retinaDisplayCheck', 'retinaDisplayOption', 'retinaDisplayRow',
        'reset', 'frame',
        'loadingText', 'loadingBar', 'loadingStatus',
        'joystickZone', 'jumpZone', 'joystickBase', 'joystick', 'walkJump',
        'tooltip',
        'annotationNav', 'annotationPrev', 'annotationNext', 'annotationInfo', 'annotationNavTitle'
    ];

    const dom = domIds.reduce((acc: Record<string, HTMLElement>, id) => {
        acc[id] = document.getElementById(id);
        return acc;
    }, {});

    const docRoot = document.documentElement;
    const canvas = global.app.graphicsDevice.canvas as HTMLCanvasElement;

    const updateInputModeClasses = () => {
        dom.ui.classList.toggle('touch-mode', state.inputMode === 'touch');
        dom.ui.classList.toggle('desktop-mode', state.inputMode === 'desktop');
    };

    events.on('inputMode:changed', updateInputModeClasses);
    updateInputModeClasses();

    dom.ui.addEventListener('click', () => {
        (document.activeElement as HTMLElement | null)?.blur();
    });

    dom.ui.addEventListener('wheel', (event: WheelEvent) => {
        event.preventDefault();
        canvas.dispatchEvent(new WheelEvent(event.type, event));
    }, { passive: false });

    events.on('progress:changed', (progress: number) => {
        if (progress < 0) {
            dom.loadingText.textContent = '';
            dom.loadingBar.style.backgroundImage = '';
            dom.loadingBar.classList.add('indeterminate');
            return;
        }

        dom.loadingBar.classList.remove('indeterminate');
        dom.loadingText.textContent = `${progress}%`;
        dom.loadingBar.style.backgroundImage = progress < 100
            ? `linear-gradient(90deg, #50c2ff 0%, #50c2ff ${progress}%, white ${progress}%, white 100%)`
            : 'linear-gradient(90deg, #50c2ff 0%, #50c2ff 100%)';
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

    events.on('firstFrame', () => {
        document.getElementById('loadingWrap').classList.add('hidden');
    });

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
                document.exitFullscreen().catch(() => {});
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

    screen?.orientation?.addEventListener('change', () => {
        if (['landscape-primary', 'landscape-secondary'].includes(screen.orientation.type)) {
            requestFullscreen();
        } else {
            exitFullscreen();
        }
    });

    events.on('isFullscreen:changed', (value: boolean) => {
        dom.enterFullscreen.classList[value ? 'add' : 'remove']('hidden');
        dom.exitFullscreen.classList[value ? 'remove' : 'add']('hidden');
    });

    const updateHQ = () => {
        dom.hqCheck.classList.toggle('active', state.hqMode);
        dom.lqCheck.classList.toggle('active', !state.hqMode);
    };

    dom.hqRow.addEventListener('click', () => {
        state.hqMode = true;
    });
    dom.lqRow.addEventListener('click', () => {
        state.hqMode = false;
    });
    events.on('hqMode:changed', updateHQ);
    updateHQ();

    dom.retinaDisplayRow.addEventListener('click', () => {
        state.retinaDisplay = !state.retinaDisplay;
    });

    const updateRetinaDisplay = () => {
        dom.retinaDisplayCheck.classList.toggle('active', state.retinaDisplay);
        localStorage.setItem('retinaDisplay', String(state.retinaDisplay));
    };
    events.on('retinaDisplay:changed', updateRetinaDisplay);
    updateRetinaDisplay();

    const arChanged = () => dom.arMode.classList[state.hasAR ? 'remove' : 'add']('hidden');
    const vrChanged = () => dom.vrMode.classList[state.hasVR ? 'remove' : 'add']('hidden');

    dom.arMode.addEventListener('click', () => events.fire('startAR'));
    dom.vrMode.addEventListener('click', () => events.fire('startVR'));

    events.on('hasAR:changed', arChanged);
    events.on('hasVR:changed', vrChanged);
    arChanged();
    vrChanged();

    const updateInfoTab = (tab: 'desktop' | 'touch') => {
        const desktop = tab === 'desktop';
        dom.desktopTab.classList.toggle('active', desktop);
        dom.touchTab.classList.toggle('active', !desktop);
        dom.desktopInfoPanel.classList.toggle('hidden', !desktop);
        dom.touchInfoPanel.classList.toggle('hidden', desktop);
    };

    let activeModal: 'info' | 'settings' | null = null;
    let walkHintVisible = false;
    let walkHintShownAt = 0;
    let walkHintTimeout: ReturnType<typeof setTimeout> | null = null;

    const clearWalkHintTimer = () => {
        if (walkHintTimeout) {
            clearTimeout(walkHintTimeout);
            walkHintTimeout = null;
        }
    };

    const emitWalkHintState = () => {
        events.fire('walkHint:changed', walkHintVisible);
    };

    const hideWalkHint = () => {
        clearWalkHintTimer();
        walkHintVisible = false;
        dom.walkHint.textContent = '';
        dom.walkHint.classList.add('hidden');
        dom.ui.classList.remove('walk-hint-open');
        emitWalkHintState();
    };

    const getModeHintText = (
        cameraMode: CameraMode,
        walkMode: WalkInputMode = state.walkInputMode,
        flyMode: FlyInputMode = state.flyInputMode
    ) => {
        switch (cameraMode) {
            case 'orbit':
                return state.inputMode === 'touch'
                    ? '单指旋转，双指平移，双指缩放。'
                    : '左键旋转，右键平移，滚轮缩放。';
            case 'fly':
                if (state.inputMode === 'touch') {
                    switch (flyMode) {
                        case 'gesture':
                            return '拖动画面观察，双指拖动与捏合移动。';
                        case 'gamepad':
                            return '拖动摇杆移动，拖动画面观察，双点摇杆可切 1D / 2D。';
                        case 'none':
                        default:
                            return '拖动画面观察；先用摇杆进入 Gamepad，先用手势进入 Gesture。';
                    }
                }
                return '拖动画面观察，WASD 移动。';
            case 'walk':
                switch (walkMode) {
                    case 'keyboard':
                        return 'WASD 移动，鼠标观察，Esc 返回点击行走。';
                    case 'mouseclick':
                        return '点击地面行走，拖动画面观察。';
                    case 'touchclick':
                        return '点按地面行走，拖动画面观察。';
                    case 'gamepad':
                        return '拖动摇杆移动，拖动画面观察，轻点可跳跃。';
                    case 'none':
                    default:
                        return state.inputMode === 'touch'
                            ? '点按地面行走，或使用左下摇杆自由移动。'
                            : '点击地面行走，或按 WASD 进入自由行走。';
                }
            case 'anim':
            default:
                return '';
        }
    };

    const showWalkHint = (text: string) => {
        if (activeModal || !text) {
            return;
        }

        clearWalkHintTimer();
        walkHintVisible = true;
        walkHintShownAt = performance.now();
        dom.walkHint.textContent = text;
        dom.walkHint.classList.remove('hidden');
        dom.ui.classList.add('walk-hint-open');
        emitWalkHintState();

        walkHintTimeout = setTimeout(() => {
            hideWalkHint();
        }, WALK_HINT_DURATION_MS);
    };

    const showCurrentModeHint = (
        cameraMode: CameraMode = state.cameraMode,
        walkMode: WalkInputMode = state.walkInputMode,
        flyMode: FlyInputMode = state.flyInputMode
    ) => {
        const text = getModeHintText(cameraMode, walkMode, flyMode);
        if (!text) {
            hideWalkHint();
            return;
        }
        showWalkHint(text);
    };

    const setModal = (modal: 'info' | 'settings' | null) => {
        activeModal = modal;
        dom.infoPanel.classList.toggle('hidden', modal !== 'info');
        dom.settingsPanel.classList.toggle('hidden', modal !== 'settings');
        dom.ui.classList.toggle('modal-open', modal !== null);
        dom.tooltip.style.display = 'none';

        if (modal) {
            state.controlsHidden = false;
            hideWalkHint();
        }

        events.fire('uiModal:changed', modal);
    };

    dom.desktopTab.addEventListener('click', () => updateInfoTab('desktop'));
    dom.touchTab.addEventListener('click', () => updateInfoTab('touch'));

    dom.info.addEventListener('click', () => {
        updateInfoTab(state.inputMode === 'touch' ? 'touch' : 'desktop');
        setModal(activeModal === 'info' ? null : 'info');
    });

    dom.settings.addEventListener('click', () => {
        setModal(activeModal === 'settings' ? null : 'settings');
    });

    dom.infoPanel.addEventListener('pointerdown', (event) => {
        if (event.target === dom.infoPanel) {
            setModal(null);
        }
    });

    dom.settingsPanel.addEventListener('pointerdown', (event) => {
        event.stopPropagation();
    });

    events.on('inputEvent', (eventName: string) => {
        if (eventName === 'cancel') {
            setModal(null);
            if (state.isFullscreen) {
                exitFullscreen();
            }
        } else if (eventName === 'interrupt') {
            if (activeModal === 'settings') {
                setModal(null);
            } else if (walkHintVisible && performance.now() - walkHintShownAt > WALK_HINT_DISMISS_GRACE_MS) {
                hideWalkHint();
            }
        } else if (eventName === 'interact') {
            if (walkHintVisible && performance.now() - walkHintShownAt > WALK_HINT_DISMISS_GRACE_MS) {
                hideWalkHint();
            }
        } else if (eventName === 'toggleHelp') {
            updateInfoTab(state.inputMode === 'touch' ? 'touch' : 'desktop');
            setModal(activeModal === 'info' ? null : 'info');
        }
    });

    dom.walkHint.addEventListener('click', () => {
        hideWalkHint();
    });

    events.on('cameraMode:changed', (value: CameraMode) => {
        if (value === 'orbit' || value === 'fly' || value === 'walk') {
            showCurrentModeHint(value, value === 'walk' ? 'none' : state.walkInputMode, value === 'fly' ? 'none' : state.flyInputMode);
        } else {
            hideWalkHint();
        }
    });

    events.on('walkInputMode:changed', (value: WalkInputMode) => {
        if (state.cameraMode === 'walk' && value !== 'none') {
            showCurrentModeHint('walk', value);
        }
    });

    events.on('flyInputMode:changed', (value: FlyInputMode) => {
        if (state.cameraMode === 'fly' && value !== 'none') {
            showCurrentModeHint('fly', state.walkInputMode, value);
        }
    });

    events.on('inputMode:changed', () => {
        if (walkHintVisible) {
            if (state.cameraMode === 'walk') {
                showCurrentModeHint('walk', state.walkInputMode);
            } else if (state.cameraMode === 'fly') {
                showCurrentModeHint('fly', state.walkInputMode, state.flyInputMode);
            } else {
                showCurrentModeHint(state.cameraMode);
            }
        }
    });

    events.on('controlsHidden:changed', (value: boolean) => {
        dom.controlsWrap.className = value ? 'faded-out' : 'faded-in';
    });

    let uiTimeout: ReturnType<typeof setTimeout> | null = null;
    let annotationVisible = false;

    const showUI = () => {
        if (uiTimeout) {
            clearTimeout(uiTimeout);
        }

        state.controlsHidden = false;

        if (activeModal || walkHintVisible) {
            return;
        }

        uiTimeout = setTimeout(() => {
            uiTimeout = null;
            if (!annotationVisible && !activeModal && !walkHintVisible) {
                state.controlsHidden = true;
            }
        }, 4000);
    };

    showUI();

    events.on('inputEvent', showUI);
    events.on('annotation.activate', () => {
        annotationVisible = true;
        showUI();
    });
    events.on('annotation.deactivate', () => {
        annotationVisible = false;
        showUI();
    });

    dom.play.addEventListener('click', () => {
        state.cameraMode = 'anim';
        state.animationPaused = false;
    });

    dom.pause.addEventListener('click', () => {
        state.cameraMode = 'anim';
        state.animationPaused = true;
    });

    const updatePlayPause = () => {
        dom.play.classList.toggle('hidden', state.cameraMode === 'anim' && !state.animationPaused);
        dom.pause.classList.toggle('hidden', state.cameraMode !== 'anim' || state.animationPaused);
        dom.timelineContainer.classList.toggle('hidden', state.cameraMode !== 'anim');
        dom.ui.classList.toggle('timeline-active', state.cameraMode === 'anim');
    };

    events.on('cameraMode:changed', updatePlayPause);
    events.on('animationPaused:changed', updatePlayPause);
    events.on('hasAnimation:changed', updatePlayPause);
    updatePlayPause();

    const updateSlider = () => {
        const duration = Math.max(state.animationDuration, 0.0001);
        const t = state.animationTime / duration * 100;
        dom.handle.style.left = `${t}%`;
        dom.time.style.left = `${t}%`;
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

    dom.timelineContainer.addEventListener('pointerup', (event: PointerEvent) => {
        if (captured) {
            dom.timelineContainer.releasePointerCapture(event.pointerId);
            dom.time.classList.add('hidden');
            state.animationPaused = paused;
            captured = false;
        }
    });

    const setWalkMode = (mode: WalkInputMode) => {
        state.walkInputMode = mode;
        state.walkInputLocked = mode !== 'none';
        if (mode !== 'gamepad') {
            events.fire('joystickSession:reset');
        }
        if (mode !== 'none') {
            events.fire('walkCancel');
        }
    };

    const setFlyMode = (mode: FlyInputMode) => {
        state.flyInputMode = mode;
        if (mode !== 'gamepad') {
            events.fire('joystickSession:reset');
        }
    };

    const updateCameraModeUI = () => {
        dom.orbitModeGroup.classList.toggle('active', state.cameraMode === 'orbit');
        dom.flyModeGroup.classList.toggle('active', state.cameraMode === 'fly');
        dom.walkModeGroup.classList.toggle('active', state.cameraMode === 'walk');
    };

    const updateWalkCameraVisibility = () => {
        const hasWalkCapability = !!config.voxelUrl;
        const walkReady = state.hasCollision;

        dom.walkModeGroup.classList.toggle('hidden', !hasWalkCapability);
        dom.fpsCamera.classList.toggle('disabled', hasWalkCapability && !walkReady);
        dom.walkModeGroup.classList.toggle('disabled', hasWalkCapability && !walkReady);
        (dom.fpsCamera as HTMLButtonElement).disabled = hasWalkCapability && !walkReady;
    };

    const updateFirstPersonSubmodes = () => {
        const showTouchFly = state.inputMode === 'touch' && state.cameraMode === 'fly';
        const showTouchWalk = state.inputMode === 'touch' && state.cameraMode === 'walk' && !!config.voxelUrl && state.hasCollision;
        const showDesktopWalk = state.inputMode === 'desktop' && state.cameraMode === 'walk' && !!config.voxelUrl;
        const showWalkSubmodes = showTouchWalk || showDesktopWalk;

        dom.flyModeGroup.classList.toggle('touch-expanded', showTouchFly);
        dom.walkModeGroup.classList.toggle('touch-expanded', showTouchWalk);
        dom.walkModeGroup.classList.toggle('desktop-expanded', showDesktopWalk);

        dom.flyCamera.classList.toggle('hidden', showTouchFly);
        dom.fpsCamera.classList.toggle('hidden', showTouchWalk);

        dom.flySubmodes.classList.toggle('hidden', !showTouchFly);
        dom.flySubmodes.classList.toggle('touch-inline', showTouchFly);
        dom.flySubmodes.classList.toggle('desktop-inline', false);
        dom.walkSubmodes.classList.toggle('hidden', !showWalkSubmodes || !state.hasCollision);
        dom.walkSubmodes.classList.toggle('touch-inline', showTouchWalk);
        dom.walkSubmodes.classList.toggle('desktop-inline', showDesktopWalk);

        dom.flyGestureMode.classList.toggle('hidden', !showTouchFly);
        dom.flyGamepadMode.classList.toggle('hidden', !showTouchFly);
        dom.walkTouchMode.classList.toggle('hidden', !showTouchWalk);
        dom.walkGamepadMode.classList.toggle('hidden', !showTouchWalk);
        dom.walkClickMode.classList.toggle('hidden', !showDesktopWalk);
        dom.walkKeyboardMode.classList.toggle('hidden', !showDesktopWalk);

        dom.flyGestureMode.classList.toggle('active', showTouchFly && state.flyInputMode === 'gesture');
        dom.flyGamepadMode.classList.toggle('active', showTouchFly && state.flyInputMode === 'gamepad');
        dom.walkTouchMode.classList.toggle('active', showTouchWalk && state.walkInputMode === 'touchclick');
        dom.walkGamepadMode.classList.toggle('active', showTouchWalk && state.walkInputMode === 'gamepad');
        dom.walkClickMode.classList.toggle('active', showDesktopWalk && state.walkInputMode === 'mouseclick');
        dom.walkKeyboardMode.classList.toggle('active', showDesktopWalk && state.walkInputMode === 'keyboard');
    };

    const updateVoxelOverlayUI = () => {
        dom.showVoxels.classList.toggle('hidden', !state.hasVoxelOverlay);
        dom.showVoxels.classList.toggle('active', state.voxelOverlayEnabled);
    };

    events.on('cameraMode:changed', updateCameraModeUI);
    events.on('cameraMode:changed', updateFirstPersonSubmodes);
    events.on('inputMode:changed', updateFirstPersonSubmodes);
    events.on('walkInputMode:changed', updateFirstPersonSubmodes);
    events.on('flyInputMode:changed', updateFirstPersonSubmodes);
    events.on('hasCollision:changed', updateWalkCameraVisibility);
    events.on('hasCollision:changed', updateFirstPersonSubmodes);
    events.on('hasVoxelOverlay:changed', updateVoxelOverlayUI);
    events.on('voxelOverlayEnabled:changed', updateVoxelOverlayUI);
    updateCameraModeUI();
    updateWalkCameraVisibility();
    updateFirstPersonSubmodes();
    updateVoxelOverlayUI();

    dom.orbitCamera.addEventListener('click', () => {
        state.cameraMode = 'orbit';
    });

    dom.flyCamera.addEventListener('click', () => {
        state.cameraMode = 'fly';
    });

    dom.fpsCamera.addEventListener('click', () => {
        if (!state.hasCollision) return;
        events.fire('inputEvent', 'toggleWalk');
    });

    dom.flyGestureMode.addEventListener('click', () => {
        if (state.cameraMode === 'fly') {
            setFlyMode('gesture');
        }
    });

    dom.flyGamepadMode.addEventListener('click', () => {
        if (state.cameraMode === 'fly') {
            setFlyMode('gamepad');
        }
    });

    dom.walkTouchMode.addEventListener('click', () => {
        if (state.cameraMode === 'walk') {
            setWalkMode('touchclick');
        }
    });

    dom.walkGamepadMode.addEventListener('click', () => {
        if (state.cameraMode === 'walk') {
            setWalkMode('gamepad');
            events.fire('walkCancel');
        }
    });

    dom.walkClickMode.addEventListener('click', () => {
        if (state.cameraMode === 'walk') {
            setWalkMode('mouseclick');
        }
    });

    dom.walkKeyboardMode.addEventListener('click', () => {
        if (state.cameraMode === 'walk') {
            setWalkMode('keyboard');
        }
    });

    dom.showVoxels.addEventListener('click', () => {
        if (!state.hasVoxelOverlay) return;
        state.voxelOverlayEnabled = !state.voxelOverlayEnabled;
    });

    dom.reset.addEventListener('click', (event) => {
        events.fire('inputEvent', 'reset', event);
    });

    dom.frame.addEventListener('click', (event) => {
        events.fire('inputEvent', 'frame', event);
    });

    const joystickRadius = 30;
    let joystickPointerId: number | null = null;
    let joystickMode: '1d' | '2d' = '2d';
    let lastJoystickTap = 0;
    let lastJoystickTapX = 0;
    let lastJoystickTapY = 0;
    let joystickAnchorX = 0;
    let joystickAnchorY = 0;
    let walkJumpPointerId: number | null = null;
    let walkJumpAnchorX = 0;
    let walkJumpAnchorY = 0;

    const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

    const getJoystickMetrics = () => joystickMode === '1d'
        ? {
            width: 68,
            height: 104,
            centerX: 34,
            centerY: 52,
            halfWidth: 34,
            halfHeight: 52
        }
        : {
            width: 104,
            height: 104,
            centerX: 52,
            centerY: 52,
            halfWidth: 52,
            halfHeight: 52
        };

    const isTouchFirstPerson = () =>
        state.inputMode === 'touch' &&
        (state.cameraMode === 'fly' || (state.cameraMode === 'walk' && !!config.voxelUrl && state.hasCollision));

    const isJoystickActive = () =>
        state.inputMode === 'touch' &&
        ((state.cameraMode === 'fly' && state.flyInputMode === 'gamepad') ||
            (state.cameraMode === 'walk' && state.walkInputMode === 'gamepad'));

    const resetJoystickVisual = () => {
        const metrics = getJoystickMetrics();
        dom.joystick.style.left = `${metrics.centerX}px`;
        dom.joystick.style.top = `${metrics.centerY}px`;
        events.fire('joystickInput', { x: 0, y: 0 });
    };

    const updateJoystickModeVisual = () => {
        dom.joystickBase.classList.toggle('mode-1d', joystickMode === '1d');
        dom.joystickBase.classList.toggle('mode-2d', joystickMode === '2d');
    };

    const hideJoystick = () => {
        dom.joystickBase.classList.remove('visible');
        dom.joystickBase.classList.add('hidden');
        resetJoystickVisual();
    };

    const hideWalkJump = () => {
        dom.walkJump.classList.remove('visible');
        dom.walkJump.classList.remove('active');
    };

    const positionJoystickBase = (clientX: number, clientY: number) => {
        const metrics = getJoystickMetrics();
        const rect = dom.joystickZone.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
            joystickAnchorX = clamp(clientX, rect.left + metrics.halfWidth, rect.right - metrics.halfWidth);
            joystickAnchorY = clamp(clientY, rect.top + metrics.halfHeight, rect.bottom - metrics.halfHeight);
        } else {
            joystickAnchorX = clientX;
            joystickAnchorY = clientY;
        }

        dom.joystickBase.style.left = `${joystickAnchorX}px`;
        dom.joystickBase.style.top = `${joystickAnchorY}px`;
    };

    const updateJoystickStick = (clientX: number, clientY: number) => {
        const metrics = getJoystickMetrics();
        let dx = clientX - joystickAnchorX;
        let dy = clientY - joystickAnchorY;

        if (joystickMode === '1d') {
            dx = 0;
        }

        const length = Math.hypot(dx, dy);
        if (length > joystickRadius && length > 0) {
            const scale = joystickRadius / length;
            dx *= scale;
            dy *= scale;
        }

        dom.joystick.style.left = `${metrics.centerX + dx}px`;
        dom.joystick.style.top = `${metrics.centerY + dy}px`;
        events.fire('joystickInput', { x: dx / joystickRadius, y: dy / joystickRadius });
    };

    const positionWalkJump = (clientX: number, clientY: number) => {
        const rect = dom.jumpZone.getBoundingClientRect();
        const radius = 24;
        if (rect.width > 0 && rect.height > 0) {
            walkJumpAnchorX = clamp(clientX, rect.left + radius, rect.right - radius);
            walkJumpAnchorY = clamp(clientY, rect.top + radius, rect.bottom - radius);
        } else {
            walkJumpAnchorX = clientX;
            walkJumpAnchorY = clientY;
        }

        dom.walkJump.style.left = `${walkJumpAnchorX}px`;
        dom.walkJump.style.top = `${walkJumpAnchorY}px`;
    };

    const releaseWalkJump = () => {
        if (walkJumpPointerId !== null && dom.jumpZone.hasPointerCapture(walkJumpPointerId)) {
            dom.jumpZone.releasePointerCapture(walkJumpPointerId);
        }
        walkJumpPointerId = null;
        hideWalkJump();
        events.fire('jumpButton:changed', false);
    };

    const updateTouchControlsVisibility = () => {
        const showJoystickZone = isTouchFirstPerson();
        const showJumpButton =
            state.inputMode === 'touch' &&
            state.cameraMode === 'walk' &&
            !!config.voxelUrl &&
            state.hasCollision;

        dom.joystickZone.classList.toggle('hidden', !showJoystickZone);
        dom.jumpZone.classList.toggle('hidden', !showJumpButton);
        dom.walkJump.classList.toggle('hidden', !showJumpButton);
        updateJoystickModeVisual();

        if (!isJoystickActive() || joystickPointerId === null) {
            hideJoystick();
        }

        if (!showJumpButton) {
            releaseWalkJump();
        } else if (walkJumpPointerId === null) {
            hideWalkJump();
        }
    };

    const endJoystickSession = (event?: PointerEvent) => {
        if (event && joystickPointerId !== event.pointerId) {
            return;
        }
        const pointerId = event?.pointerId ?? joystickPointerId;
        if (pointerId !== null && dom.joystickZone.hasPointerCapture(pointerId)) {
            dom.joystickZone.releasePointerCapture(pointerId);
        }
        joystickPointerId = null;
        updateTouchControlsVisibility();
    };

    dom.joystickZone.addEventListener('pointerdown', (event: PointerEvent) => {
        if (event.pointerType !== 'touch' || !isTouchFirstPerson()) {
            return;
        }

        const now = Date.now();
        const isDoubleTap =
            now - lastJoystickTap < 320 &&
            Math.hypot(event.clientX - lastJoystickTapX, event.clientY - lastJoystickTapY) < 36;

        if (isDoubleTap) {
            joystickMode = joystickMode === '1d' ? '2d' : '1d';
            lastJoystickTap = 0;
        } else {
            lastJoystickTap = now;
            lastJoystickTapX = event.clientX;
            lastJoystickTapY = event.clientY;
        }

        if (state.cameraMode === 'fly' && state.flyInputMode !== 'gamepad') {
            setFlyMode('gamepad');
        }
        if (state.cameraMode === 'walk' && state.walkInputMode !== 'gamepad') {
            setWalkMode('gamepad');
            events.fire('walkCancel');
        }

        joystickPointerId = event.pointerId;
        dom.joystickZone.setPointerCapture(event.pointerId);
        positionJoystickBase(event.clientX, event.clientY);
        updateJoystickModeVisual();
        dom.joystickBase.classList.remove('hidden');
        dom.joystickBase.classList.add('visible');
        updateJoystickStick(event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    });

    dom.joystickZone.addEventListener('pointermove', (event: PointerEvent) => {
        if (joystickPointerId !== event.pointerId || !isJoystickActive()) {
            return;
        }
        updateJoystickStick(event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    });

    dom.joystickZone.addEventListener('pointerup', endJoystickSession);
    dom.joystickZone.addEventListener('pointercancel', endJoystickSession);
    dom.joystickZone.addEventListener('lostpointercapture', () => {
        if (joystickPointerId !== null) {
            endJoystickSession();
        }
    });

    dom.jumpZone.addEventListener('pointerdown', (event: PointerEvent) => {
        if (event.pointerType !== 'touch' || state.cameraMode !== 'walk' || state.inputMode !== 'touch') {
            return;
        }

        walkJumpPointerId = event.pointerId;
        dom.jumpZone.setPointerCapture(event.pointerId);
        positionWalkJump(event.clientX, event.clientY);
        dom.walkJump.classList.remove('hidden');
        dom.walkJump.classList.add('visible');
        dom.walkJump.classList.add('active');
        events.fire('jumpButton:changed', true);
        event.preventDefault();
        event.stopPropagation();
    });

    dom.jumpZone.addEventListener('pointermove', (event: PointerEvent) => {
        if (walkJumpPointerId !== event.pointerId) {
            return;
        }
        positionWalkJump(event.clientX, event.clientY);
        event.preventDefault();
        event.stopPropagation();
    });

    dom.jumpZone.addEventListener('pointerup', (event: PointerEvent) => {
        if (walkJumpPointerId !== event.pointerId) {
            return;
        }
        releaseWalkJump();
        event.preventDefault();
        event.stopPropagation();
    });
    dom.jumpZone.addEventListener('pointercancel', releaseWalkJump);
    dom.jumpZone.addEventListener('lostpointercapture', () => {
        if (walkJumpPointerId !== null) {
            releaseWalkJump();
        }
    });

    events.on('joystickSession:reset', () => {
        endJoystickSession();
    });
    events.on('cameraMode:changed', updateTouchControlsVisibility);
    events.on('inputMode:changed', updateTouchControlsVisibility);
    events.on('walkInputMode:changed', updateTouchControlsVisibility);
    events.on('flyInputMode:changed', updateTouchControlsVisibility);
    events.on('hasCollision:changed', updateTouchControlsVisibility);
    window.addEventListener('resize', updateTouchControlsVisibility);
    updateTouchControlsVisibility();

    if (config.noui) {
        dom.ui.classList.add('hidden');
    }

    const tooltip = new Tooltip(dom.tooltip);

    tooltip.register(dom.play, 'Play', 'top');
    tooltip.register(dom.pause, 'Pause', 'top');
    tooltip.register(dom.orbitCamera, 'Orbit Camera', 'top');
    tooltip.register(dom.flyCamera, 'Fly Camera', 'top');
    tooltip.register(dom.fpsCamera, 'Walk Mode', 'top');
    tooltip.register(dom.flyGestureMode, 'Fly Gesture Mode', 'top');
    tooltip.register(dom.flyGamepadMode, 'Fly Gamepad Mode', 'top');
    tooltip.register(dom.walkTouchMode, 'Walk TouchClick Mode', 'top');
    tooltip.register(dom.walkGamepadMode, 'Walk Gamepad Mode', 'top');
    tooltip.register(dom.walkClickMode, 'Walk Click Mode', 'top');
    tooltip.register(dom.walkKeyboardMode, 'Walk Keyboard Mode', 'top');
    tooltip.register(dom.walkJump, 'Jump', 'left');
    tooltip.register(dom.showVoxels, 'Show Voxels', 'top');
    tooltip.register(dom.reset, 'Reset Camera', 'bottom');
    tooltip.register(dom.frame, 'Frame Scene', 'bottom');
    tooltip.register(dom.settings, 'Settings', 'top');
    tooltip.register(dom.info, 'Help', 'top');
    tooltip.register(dom.arMode, 'Enter AR', 'top');
    tooltip.register(dom.vrMode, 'Enter VR', 'top');
    tooltip.register(dom.enterFullscreen, 'Fullscreen', 'top');
    tooltip.register(dom.exitFullscreen, 'Fullscreen', 'top');

    initAnnotationNav(dom, events, state, global.settings.annotations);
};

export { initPoster, initUI };
