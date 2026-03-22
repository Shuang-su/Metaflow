import { EventHandler, Vec3 } from 'playcanvas';

import { Tooltip } from './tooltip';
import { Global } from './types';

const v = new Vec3();

// update the poster image to start blurry and then resolve to sharp during loading
const initPoster = (events: EventHandler) => {
    const poster = document.getElementById('poster');

    events.on('firstFrame', () => {
        poster.style.display = 'none';
        document.documentElement.style.setProperty('--canvas-opacity', '1');
    });

    const blur = (progress: number) => {
        // Skip blur update for indeterminate progress
        if (progress < 0) return;
        poster.style.filter = `blur(${Math.floor((100 - progress) * 0.4)}px)`;
    };

    events.on('progress:changed', blur);
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
        prepare: '渲染准备',
        sort: '高斯排序',
        'stream-schedule': '流式调度',
        'stream-loading': '流式加载',
        'legacy-lod-loading': 'LOD 加载',
        timeout: '超时兜底',
        complete: '完成'
    };

    // Acquire Elements
    const docRoot = document.documentElement;
    const dom = [
        'ui',
        'controlsWrap',
        'arMode', 'vrMode',
        'enterFullscreen', 'exitFullscreen',
        'info', 'infoPanel', 'desktopTab', 'touchTab', 'desktopInfoPanel', 'touchInfoPanel',
        'timelineContainer', 'handle', 'time',
        'buttonContainer',
        'play', 'pause',
        'settings', 'settingsPanel',
        'orbitCamera', 'flyCamera', 'fpsCamera',
        'hqCheck', 'hqOption', 'lqCheck', 'lqOption',
        'retinaDisplayCheck', 'retinaDisplayOption', 'retinaDisplayRow',
        'gamingControlsCheck', 'gamingControlsOption', 'gamingControlsRow',
        'reset', 'frame',
        'loadingText', 'loadingBar', 'loadingStatus',
        'joystickBase', 'joystick',
        'tooltip'
    ].reduce((acc: Record<string, HTMLElement>, id) => {
        acc[id] = document.getElementById(id);
        return acc;
    }, {});

    // Handle loading progress updates
    // progress: 0-100 = determinate, -1 = indeterminate (pulsing bar)
    events.on('progress:changed', (progress: number) => {
        if (progress < 0) {
            // Indeterminate mode: hide percentage, show pulsing animation
            dom.loadingText.textContent = '';
            dom.loadingBar.style.backgroundImage = '';
            dom.loadingBar.classList.add('indeterminate');
        } else {
            dom.loadingBar.classList.remove('indeterminate');
            dom.loadingText.textContent = `${progress}%`;
            if (progress < 100) {
                dom.loadingBar.style.backgroundImage = `linear-gradient(90deg, #50c2ff 0%, #50c2ff ${progress}%, white ${progress}%, white 100%)`;
            } else {
                dom.loadingBar.style.backgroundImage = 'linear-gradient(90deg, #50c2ff 0%, #50c2ff 100%)';
            }
        }
    });

    // Handle loading status text updates
    // During indeterminate phases, append elapsed time to give feedback
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
            if (dom.loadingStatus) {
                dom.loadingStatus.textContent = `${statusBaseText} (${elapsed}s)`;
            }
        }, 100);
    };

    events.on('loadingStatus:changed', (status: string) => {
        const stageLabel = stageLabels[state.loadingStage] || '加载';
        const conflictPrefix = state.loadingConflict ? '[冲突]' : '';
        statusBaseText = `${conflictPrefix}[${stageLabel}] ${status}`;
        if (dom.loadingStatus) {
            dom.loadingStatus.textContent = statusBaseText;
        }
        // Restart timer on status change during indeterminate mode
        if (state.progress < 0) {
            startStatusTimer();
        }
    });

    // Sync timer with progress mode
    events.on('progress:changed', (progress: number) => {
        if (progress >= 0) {
            stopStatusTimer();
            // Restore base text without timer suffix
            if (dom.loadingStatus) {
                dom.loadingStatus.textContent = statusBaseText;
            }
        }
    });

    // Hide loading bar once first frame is rendered
    events.on('firstFrame', () => {
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

    // toggle fullscreen when user switches between landscape portrait
    // orientation
    screen?.orientation?.addEventListener('change', (event) => {
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

    // HQ mode
    dom.hqOption.addEventListener('click', () => {
        state.hqMode = true;
    });
    dom.lqOption.addEventListener('click', () => {
        state.hqMode = false;
    });

    const updateHQ = () => {
        dom.hqCheck.classList[state.hqMode ? 'add' : 'remove']('active');
        dom.lqCheck.classList[state.hqMode ? 'remove' : 'add']('active');
    };
    events.on('hqMode:changed', (value) => {
        updateHQ();
    });
    updateHQ();

    // Retina display mode (pixel density control)
    dom.retinaDisplayRow.addEventListener('click', () => {
        state.retinaDisplay = !state.retinaDisplay;
    });

    const updateRetinaDisplay = () => {
        dom.retinaDisplayCheck.classList[state.retinaDisplay ? 'add' : 'remove']('active');
        localStorage.setItem('retinaDisplay', String(state.retinaDisplay));
    };
    events.on('retinaDisplay:changed', updateRetinaDisplay);
    updateRetinaDisplay();

    // Gaming controls (touch fly joystick persistence)
    dom.gamingControlsRow.addEventListener('click', () => {
        state.gamingControls = !state.gamingControls;

        if (state.cameraMode === 'walk') {
            state.walkInputLocked = true;
            state.walkInputMode = state.gamingControls ?
                (state.inputMode === 'touch' ? 'gamepad' : 'keyboard') :
                (state.inputMode === 'touch' ? 'touchclick' : 'mouseclick');
            if (!state.gamingControls) {
                events.fire('joystickInput', { x: 0, y: 0 });
            }
        }
    });

    const updateGamingControls = () => {
        dom.gamingControlsCheck.classList[state.gamingControls ? 'add' : 'remove']('active');
        localStorage.setItem('gamingControls', String(state.gamingControls));
    };
    events.on('gamingControls:changed', updateGamingControls);
    updateGamingControls();

    // AR/VR
    const arChanged = () => dom.arMode.classList[state.hasAR ? 'remove' : 'add']('hidden');
    const vrChanged = () => dom.vrMode.classList[state.hasVR ? 'remove' : 'add']('hidden');

    dom.arMode.addEventListener('click', () => events.fire('startAR'));
    dom.vrMode.addEventListener('click', () => events.fire('startVR'));

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

    dom.info.addEventListener('click', () => {
        updateInfoTab(state.inputMode);
        dom.infoPanel.classList.toggle('hidden');
    });

    dom.infoPanel.addEventListener('pointerdown', () => {
        dom.infoPanel.classList.add('hidden');
    });

    events.on('inputEvent', (event) => {
        if (event === 'cancel') {
            // close info panel on cancel
            dom.infoPanel.classList.add('hidden');
            dom.settingsPanel.classList.add('hidden');

            // close fullscreen on cancel
            if (state.isFullscreen) {
                exitFullscreen();
            }
        } else if (event === 'interrupt') {
            dom.settingsPanel.classList.add('hidden');
        }
    });

    // fade ui controls after 5 seconds of inactivity
    events.on('controlsHidden:changed', (value) => {
        dom.controlsWrap.className = value ? 'faded-out' : 'faded-in';
    });

    // show the ui and start a timer to hide it again
    let uiTimeout: ReturnType<typeof setTimeout> | null = null;
    const showUI = () => {
        if (uiTimeout) {
            clearTimeout(uiTimeout);
        }
        state.controlsHidden = false;
        uiTimeout = setTimeout(() => {
            uiTimeout = null;
            state.controlsHidden = true;
        }, 4000);
    };
    showUI();

    events.on('inputEvent', showUI);

    // Animation controls - register listeners once, outside hasAnimation:changed
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

    events.on('cameraMode:changed', updatePlayPause);
    events.on('animationPaused:changed', updatePlayPause);

    const updateSlider = () => {
        dom.handle.style.left = `${state.animationTime / state.animationDuration * 100}%`;
        dom.time.style.left = `${state.animationTime / state.animationDuration * 100}%`;
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

    events.on('hasAnimation:changed', () => {
        updatePlayPause();
    });

    // Camera mode UI
    const updateWalkCameraVisibility = () => {
        dom.fpsCamera.classList[state.hasCollision ? 'remove' : 'add']('hidden');
    };

    events.on('cameraMode:changed', () => {
        dom.orbitCamera.classList[state.cameraMode === 'orbit' ? 'add' : 'remove']('active');
        dom.flyCamera.classList[state.cameraMode === 'fly' ? 'add' : 'remove']('active');
        dom.fpsCamera.classList[state.cameraMode === 'walk' ? 'add' : 'remove']('active');
    });
    events.on('hasCollision:changed', updateWalkCameraVisibility);
    updateWalkCameraVisibility();

    dom.settings.addEventListener('click', () => {
        dom.settingsPanel.classList.toggle('hidden');
    });

    dom.orbitCamera.addEventListener('click', () => {
        state.cameraMode = 'orbit';
    });

    dom.flyCamera.addEventListener('click', () => {
        state.cameraMode = 'fly';
    });

    dom.fpsCamera.addEventListener('click', () => {
        if (!state.hasCollision) {
            return;
        }
        events.fire('inputEvent', 'toggleWalk');
    });

    dom.reset.addEventListener('click', (event) => {
        events.fire('inputEvent', 'reset', event);
    });

    dom.frame.addEventListener('click', (event) => {
        events.fire('inputEvent', 'frame', event);
    });

    // touch fly joystick hint behavior:
    // - entering fly on touch devices shows a persistent hint joystick
    // - after user starts touching/moving, releasing touch hides joystick as before
    let hasTouchFlyInteraction = false;

    const showTouchFlyJoystickHint = () => {
        const isTouchFly = state.inputMode === 'touch' && state.cameraMode === 'fly';
        const isWalk = state.cameraMode === 'walk';
        if (!isTouchFly && !isWalk) {
            dom.joystickBase.classList.add('hidden');
            return;
        }

        dom.joystickBase.classList.remove('hidden');
        dom.joystickBase.style.left = '84px';
        dom.joystickBase.style.top = `${window.innerHeight - 120}px`;
        dom.joystick.style.left = '48px';
        dom.joystick.style.top = '48px';
    };

    const lockWalkInputMode = (mode: 'gamepad' | 'touchclick' | 'keyboard' | 'mouseclick') => {
        if (state.cameraMode !== 'walk' || state.walkInputLocked) {
            return;
        }
        state.walkInputMode = mode;
        state.walkInputLocked = true;
        state.gamingControls = mode === 'gamepad' || mode === 'keyboard';
    };

    const resetWalkJoystick = () => {
        dom.joystick.style.left = '48px';
        dom.joystick.style.top = '48px';
        events.fire('joystickInput', { x: 0, y: 0 });
    };

    let walkJoystickPointerId: number | null = null;
    const joystickRadius = 48;

    dom.joystickBase.addEventListener('pointerdown', (event: PointerEvent) => {
        if (state.cameraMode !== 'walk') {
            return;
        }
        lockWalkInputMode('gamepad');
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

        dom.joystick.style.left = `${48 + dx}px`;
        dom.joystick.style.top = `${48 + dy}px`;
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

    const canvas = global.app.graphicsDevice.canvas as HTMLCanvasElement;
    canvas.addEventListener('pointerdown', (event: PointerEvent) => {
        if (state.cameraMode !== 'walk' || state.walkInputLocked) {
            return;
        }
        if (event.pointerType === 'touch') {
            lockWalkInputMode('touchclick');
        } else if (event.button === 0) {
            lockWalkInputMode('mouseclick');
        }
    });

    events.on('cameraMode:changed', () => {
        if (state.cameraMode === 'fly') {
            hasTouchFlyInteraction = false;
            showTouchFlyJoystickHint();
        } else if (state.cameraMode === 'walk') {
            hasTouchFlyInteraction = false;
            state.walkInputMode = 'none';
            state.walkInputLocked = false;
            state.gamingControls = false;
            resetWalkJoystick();
            showTouchFlyJoystickHint();
        } else {
            hasTouchFlyInteraction = false;
            walkJoystickPointerId = null;
            resetWalkJoystick();
            dom.joystickBase.classList.add('hidden');
        }
    });

    events.on('inputMode:changed', () => {
        hasTouchFlyInteraction = false;
        showTouchFlyJoystickHint();
    });

    events.on('gamingControls:changed', () => {
        if (state.cameraMode === 'walk') {
            showTouchFlyJoystickHint();
            return;
        }
        if (!state.gamingControls) {
            hasTouchFlyInteraction = false;
        }
        showTouchFlyJoystickHint();
    });

    window.addEventListener('resize', () => {
        if (state.gamingControls || !hasTouchFlyInteraction) {
            showTouchFlyJoystickHint();
        }
    });

    // update UI based on touch joystick updates
    events.on('touchJoystickUpdate', (base, stick) => {
        if (state.cameraMode === 'walk') {
            return;
        }
        if (base === null) {
            if (state.gamingControls) {
                showTouchFlyJoystickHint();
            } else {
                if (hasTouchFlyInteraction) {
                    dom.joystickBase.classList.add('hidden');
                } else {
                    showTouchFlyJoystickHint();
                }
            }
        } else {
            hasTouchFlyInteraction = true;
            v.set(stick[0], stick[1], 0).mulScalar(1 / 48);
            if (v.length() > 1) {
                v.normalize();
            }
            v.mulScalar(48);

            dom.joystickBase.classList.remove('hidden');
            dom.joystickBase.style.left = `${base[0]}px`;
            dom.joystickBase.style.top = `${base[1]}px`;
            dom.joystick.style.left = `${48 + v.x}px`;
            dom.joystick.style.top = `${48 + v.y}px`;
        }
    });

    // Hide all UI (poster, loading bar, controls)
    if (config.noui) {
        dom.ui.classList.add('hidden');
    }

    // tooltips
    const tooltip = new Tooltip(dom.tooltip);

    tooltip.register(dom.play, 'Play', 'top');
    tooltip.register(dom.pause, 'Pause', 'top');
    tooltip.register(dom.orbitCamera, 'Orbit Camera', 'top');
    tooltip.register(dom.flyCamera, 'Fly Camera', 'top');
    tooltip.register(dom.fpsCamera, 'Walk Mode', 'top');
    tooltip.register(dom.reset, 'Reset Camera', 'bottom');
    tooltip.register(dom.frame, 'Frame Scene', 'bottom');
    tooltip.register(dom.settings, 'Settings', 'top');
    tooltip.register(dom.info, 'Help', 'top');
    tooltip.register(dom.arMode, 'Enter AR', 'top');
    tooltip.register(dom.vrMode, 'Enter VR', 'top');
    tooltip.register(dom.enterFullscreen, 'Fullscreen', 'top');
    tooltip.register(dom.exitFullscreen, 'Fullscreen', 'top');
};

export { initPoster, initUI };
