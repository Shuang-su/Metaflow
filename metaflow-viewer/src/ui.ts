import { EventHandler, Vec3 } from 'playcanvas';

import type { Annotation as AnnotationSettings } from './settings';
import { Tooltip } from './tooltip';
import type { Global, WalkInputMode } from './types';

const v = new Vec3();

const WALK_HINT_DURATION_MS = 3000;
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
        'orbitCamera', 'flyCamera', 'fpsCamera',
        'showVoxels',
        'walkHint',
        'hqRow', 'hqCheck', 'hqOption', 'lqRow', 'lqCheck', 'lqOption',
        'retinaDisplayCheck', 'retinaDisplayOption', 'retinaDisplayRow',
        'gamingControlsDivider', 'gamingControlsCheck', 'gamingControlsOption', 'gamingControlsRow',
        'desktopClickToWalk', 'desktopGamingControls',
        'touchFlyClickToWalk', 'touchFlyGamingControls',
        'touchClickToWalk', 'touchGamingControls',
        'reset', 'frame',
        'loadingText', 'loadingBar', 'loadingStatus',
        'joystickBase', 'joystick',
        'tooltip',
        'annotationNav', 'annotationPrev', 'annotationNext', 'annotationInfo', 'annotationNavTitle'
    ];

    const dom = domIds.reduce((acc: Record<string, HTMLElement>, id) => {
        acc[id] = document.getElementById(id);
        return acc;
    }, {});

    const docRoot = document.documentElement;
    const canvas = global.app.graphicsDevice.canvas as HTMLCanvasElement;

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

    const resetWalkJoystick = () => {
        dom.joystick.style.left = '50px';
        dom.joystick.style.top = '50px';
        events.fire('joystickInput', { x: 0, y: 0 });
    };

    const applyWalkGamingControls = (enabled: boolean) => {
        state.gamingControls = enabled;

        if (state.cameraMode !== 'walk') {
            return;
        }

        state.walkInputLocked = true;
        state.walkInputMode = enabled
            ? (state.inputMode === 'touch' ? 'gamepad' : 'keyboard')
            : (state.inputMode === 'touch' ? 'touchclick' : 'mouseclick');

        if (!enabled) {
            events.fire('walkCancel');
            resetWalkJoystick();
        }
    };

    dom.gamingControlsRow.addEventListener('click', () => {
        if (state.cameraMode === 'walk') {
            const walkGamingActive = state.walkInputMode === 'keyboard' || state.walkInputMode === 'gamepad';
            applyWalkGamingControls(!walkGamingActive);
            return;
        }

        state.gamingControls = !state.gamingControls;
    });

    const updateGamingHelpState = () => {
        const desktopGaming = state.walkInputMode === 'keyboard';
        const touchGaming = state.walkInputMode === 'gamepad';
        const flyTouchGaming = state.gamingControls && state.inputMode === 'touch';

        dom.desktopClickToWalk.classList.toggle('hidden', desktopGaming);
        dom.desktopGamingControls.classList.toggle('hidden', !desktopGaming);
        dom.touchFlyClickToWalk.classList.toggle('hidden', flyTouchGaming);
        dom.touchFlyGamingControls.classList.toggle('hidden', !flyTouchGaming);
        dom.touchClickToWalk.classList.toggle('hidden', touchGaming);
        dom.touchGamingControls.classList.toggle('hidden', !touchGaming);

        const walkGamingActive = desktopGaming || touchGaming;
        dom.gamingControlsCheck.classList.toggle('active', state.cameraMode === 'walk' ? walkGamingActive : state.gamingControls);
        localStorage.setItem('gamingControls', String(state.cameraMode === 'walk' ? walkGamingActive : state.gamingControls));
    };

    events.on('gamingControls:changed', updateGamingHelpState);
    events.on('walkInputMode:changed', updateGamingHelpState);
    events.on('cameraMode:changed', updateGamingHelpState);
    events.on('inputMode:changed', updateGamingHelpState);
    updateGamingHelpState();

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

    const getWalkHintText = (mode: WalkInputMode) => {
        switch (mode) {
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

    events.on('cameraMode:changed', (value: string) => {
        if (value === 'walk') {
            showWalkHint(getWalkHintText('none'));
        } else {
            hideWalkHint();
        }
    });

    events.on('walkInputMode:changed', (value: WalkInputMode) => {
        if (state.cameraMode === 'walk' && value !== 'none') {
            showWalkHint(getWalkHintText(value));
        }
    });

    events.on('inputMode:changed', () => {
        if (walkHintVisible && state.cameraMode === 'walk') {
            showWalkHint(getWalkHintText(state.walkInputMode));
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

    const updateCameraModeUI = () => {
        dom.orbitCamera.classList.toggle('active', state.cameraMode === 'orbit');
        dom.flyCamera.classList.toggle('active', state.cameraMode === 'fly');
        dom.fpsCamera.classList.toggle('active', state.cameraMode === 'walk');
    };

    const updateWalkCameraVisibility = () => {
        dom.fpsCamera.classList.toggle('hidden', !state.hasCollision);
        dom.flyCamera.classList.toggle('middle', state.hasCollision);
        dom.flyCamera.classList.toggle('right', !state.hasCollision);
    };

    const updateVoxelOverlayUI = () => {
        dom.showVoxels.classList.toggle('hidden', !state.hasVoxelOverlay);
        dom.showVoxels.classList.toggle('active', state.voxelOverlayEnabled);
    };

    events.on('cameraMode:changed', updateCameraModeUI);
    events.on('hasCollision:changed', updateWalkCameraVisibility);
    events.on('hasVoxelOverlay:changed', updateVoxelOverlayUI);
    events.on('voxelOverlayEnabled:changed', updateVoxelOverlayUI);
    updateCameraModeUI();
    updateWalkCameraVisibility();
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

    const joystickBaseX = 84;
    const joystickBaseY = () => window.innerHeight - 120;
    const joystickCenter = 50;
    const joystickRadius = 30;
    let walkJoystickPointerId: number | null = null;

    const updateWalkJoystickVisibility = () => {
        const showWalkJoystick = state.cameraMode === 'walk' &&
            state.inputMode === 'touch' &&
            (!state.walkInputLocked || state.walkInputMode === 'gamepad');

        if (showWalkJoystick) {
            dom.joystickBase.classList.remove('hidden');
            dom.joystickBase.style.left = `${joystickBaseX}px`;
            dom.joystickBase.style.top = `${joystickBaseY()}px`;
            if (state.walkInputMode !== 'gamepad') {
                resetWalkJoystick();
            }
            return;
        }

        if (state.cameraMode === 'fly' && state.inputMode === 'touch' && state.gamingControls) {
            dom.joystickBase.classList.remove('hidden');
            dom.joystickBase.style.left = `${joystickBaseX}px`;
            dom.joystickBase.style.top = `${joystickBaseY()}px`;
            dom.joystick.style.left = `${joystickCenter}px`;
            dom.joystick.style.top = `${joystickCenter}px`;
            return;
        }

        dom.joystickBase.classList.add('hidden');
    };

    dom.joystickBase.addEventListener('pointerdown', (event: PointerEvent) => {
        if (state.cameraMode !== 'walk' || state.inputMode !== 'touch') {
            return;
        }

        state.walkInputMode = 'gamepad';
        state.walkInputLocked = true;
        state.gamingControls = true;
        events.fire('walkCancel');

        walkJoystickPointerId = event.pointerId;
        dom.joystickBase.setPointerCapture(event.pointerId);
        event.preventDefault();
        event.stopPropagation();
    });

    dom.joystickBase.addEventListener('pointermove', (event: PointerEvent) => {
        if (state.cameraMode !== 'walk' || walkJoystickPointerId !== event.pointerId || state.walkInputMode !== 'gamepad') {
            return;
        }

        const rect = dom.joystickBase.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        let dx = event.clientX - cx;
        let dy = event.clientY - cy;
        const len = Math.hypot(dx, dy);
        if (len > joystickRadius) {
            dx = dx / len * joystickRadius;
            dy = dy / len * joystickRadius;
        }

        dom.joystick.style.left = `${joystickCenter + dx}px`;
        dom.joystick.style.top = `${joystickCenter + dy}px`;
        events.fire('joystickInput', { x: dx / joystickRadius, y: dy / joystickRadius });
        event.preventDefault();
    });

    const endWalkJoystick = (event: PointerEvent) => {
        if (walkJoystickPointerId !== event.pointerId) {
            return;
        }
        walkJoystickPointerId = null;
        resetWalkJoystick();
        dom.joystickBase.releasePointerCapture(event.pointerId);
    };

    dom.joystickBase.addEventListener('pointerup', endWalkJoystick);
    dom.joystickBase.addEventListener('pointercancel', endWalkJoystick);

    canvas.addEventListener('pointerdown', (event: PointerEvent) => {
        if (state.cameraMode !== 'walk' || state.walkInputLocked) {
            return;
        }

        if (event.pointerType === 'touch') {
            state.walkInputMode = 'touchclick';
            state.walkInputLocked = true;
            state.gamingControls = false;
            resetWalkJoystick();
            updateWalkJoystickVisibility();
        } else if (event.button === 0) {
            state.walkInputMode = 'mouseclick';
            state.walkInputLocked = true;
            state.gamingControls = false;
        }
    });

    events.on('cameraMode:changed', () => {
        if (state.cameraMode === 'walk') {
            state.walkInputMode = 'none';
            state.walkInputLocked = false;
            state.gamingControls = false;
            walkJoystickPointerId = null;
            resetWalkJoystick();
        } else {
            walkJoystickPointerId = null;
            resetWalkJoystick();
        }
        updateWalkJoystickVisibility();
    });

    events.on('inputMode:changed', updateWalkJoystickVisibility);
    events.on('gamingControls:changed', updateWalkJoystickVisibility);
    events.on('walkInputMode:changed', updateWalkJoystickVisibility);
    window.addEventListener('resize', updateWalkJoystickVisibility);

    events.on('touchJoystickUpdate', (base: [number, number] | null, stick: [number, number] | null) => {
        if (state.cameraMode !== 'fly' || state.inputMode !== 'touch') {
            return;
        }

        if (base === null || stick === null) {
            updateWalkJoystickVisibility();
            return;
        }

        v.set(stick[0], stick[1], 0).mulScalar(1 / 48);
        if (v.length() > 1) {
            v.normalize();
        }
        v.mulScalar(30);

        dom.joystickBase.classList.remove('hidden');
        dom.joystickBase.style.left = `${base[0]}px`;
        dom.joystickBase.style.top = `${base[1]}px`;
        dom.joystick.style.left = `${joystickCenter + v.x}px`;
        dom.joystick.style.top = `${joystickCenter + v.y}px`;
    });

    if (config.noui) {
        dom.ui.classList.add('hidden');
    }

    const tooltip = new Tooltip(dom.tooltip);

    tooltip.register(dom.play, 'Play', 'top');
    tooltip.register(dom.pause, 'Pause', 'top');
    tooltip.register(dom.orbitCamera, 'Orbit Camera', 'top');
    tooltip.register(dom.flyCamera, 'Fly Camera', 'top');
    tooltip.register(dom.fpsCamera, 'Walk Mode', 'top');
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
