/**
 * Fullscreen-first calibration helpers.
 *
 * - Fullscreen target = scene container (not whole page with settings).
 * - Only enter fullscreen on explicit user gesture.
 * - Physical mapping uses CSS/logical pixels only — never × devicePixelRatio.
 * - Fullscreen removes chrome ambiguity; it does NOT reveal physical cm.
 */

export function featureDetectFullscreen(el) {
    const node = el || (typeof document !== 'undefined' ? document.documentElement : null);
    const req =
        node &&
        (node.requestFullscreen ||
            node.webkitRequestFullscreen ||
            node.webkitRequestFullScreen ||
            node.msRequestFullscreen);
    const exit =
        typeof document !== 'undefined' &&
        (document.exitFullscreen ||
            document.webkitExitFullscreen ||
            document.webkitCancelFullScreen ||
            document.msExitFullscreen);
    const safari = isSafari();
    return {
        supported: !!(req && exit),
        safariLikely: safari,
        explanation: req
            ? '可用 Fullscreen API。请点击按钮进入场景全屏（非整页设置栏）。全屏不能测出物理厘米。'
            : '当前浏览器无法 requestFullscreen。请用手动预设 + 比例尺在尽可能大的窗口校准；不会自动弹出全屏。'
    };
}

function isSafari() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/Edg\//.test(ua);
}

export function getFullscreenElement() {
    if (typeof document === 'undefined') return null;
    return (
        document.fullscreenElement ||
        document.webkitFullscreenElement ||
        document.msFullscreenElement ||
        null
    );
}

export function isElementFullscreen(el) {
    const cur = getFullscreenElement();
    return !!(cur && el && (cur === el || cur.contains?.(el) || el.contains?.(cur)));
}

/** Explicit gesture only — never call from timers/load. */
export async function enterSceneFullscreen(container) {
    const feat = featureDetectFullscreen(container);
    if (!feat.supported) {
        return { ok: false, reason: 'unsupported', message: feat.explanation };
    }
    try {
        const req =
            container.requestFullscreen ||
            container.webkitRequestFullscreen ||
            container.webkitRequestFullScreen ||
            container.msRequestFullscreen;
        const opts = { navigationUI: 'hide' };
        try {
            await req.call(container, opts);
        } catch {
            await req.call(container);
        }
        return { ok: true, reason: 'entered', message: '已进入场景全屏。像素≠物理尺寸，请继续确认厘米。' };
    } catch (err) {
        return {
            ok: false,
            reason: 'denied-or-error',
            message: `无法进入全屏：${err?.message || err}。请检查浏览器权限，或改用大窗口手动校准。`
        };
    }
}

export async function exitSceneFullscreen() {
    if (!getFullscreenElement()) {
        return { ok: true, reason: 'already-exited' };
    }
    try {
        const exit =
            document.exitFullscreen ||
            document.webkitExitFullscreen ||
            document.webkitCancelFullScreen ||
            document.msExitFullscreen;
        await exit.call(document);
        return { ok: true, reason: 'exited' };
    } catch (err) {
        return { ok: false, reason: 'error', message: String(err?.message || err) };
    }
}

export function onFullscreenChange(handler) {
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'MSFullscreenChange'];
    for (const e of events) document.addEventListener(e, handler);
    return () => {
        for (const e of events) document.removeEventListener(e, handler);
    };
}

/**
 * Map calibrated FULL SCREEN physical size → current canvas CSS box physical size.
 * Uses CSS/logical px only. DPR is for rendering sharpness, not meters.
 */
export function mapCanvasPhysicalFromScreen(screenPhysical, canvasCss, screenLogicalCss) {
    const sw = Math.max(1, screenLogicalCss?.w || 1);
    const sh = Math.max(1, screenLogicalCss?.h || 1);
    const cw = Math.max(1, canvasCss?.w || 1);
    const ch = Math.max(1, canvasCss?.h || 1);
    const screenW = screenPhysical?.widthM;
    const screenH = screenPhysical?.heightM;
    if (!(screenW > 0) || !(screenH > 0)) return null;

    const mPerCssPxX = screenW / sw;
    const mPerCssPxY = screenH / sh;

    return {
        widthM: cw * mPerCssPxX,
        heightM: ch * mPerCssPxY,
        mPerCssPxX,
        mPerCssPxY,
        // Intentionally unused in math — documented so callers don't × DPR
        devicePixelRatioIgnored: true,
        note: '物理映射仅用 CSS/逻辑像素；未乘 DPR（避免双重计数）'
    };
}

/** Canvas CSS bounds — the actual rendered layout box. */
export function readCanvasCssBounds(canvas) {
    if (!canvas) return { w: 0, h: 0 };
    return {
        w: canvas.clientWidth || 0,
        h: canvas.clientHeight || 0
    };
}

/**
 * Screen logical CSS size for mapping.
 * Prefer fullscreen element client size when scene is fullscreen (chrome gone).
 */
export function readMappingScreenCss(container) {
    if (container && isElementFullscreen(container)) {
        return {
            w: container.clientWidth || window.screen?.width || 1,
            h: container.clientHeight || window.screen?.height || 1,
            source: 'fullscreen-element-css'
        };
    }
    return {
        w: window.screen?.width || window.innerWidth || 1,
        h: window.screen?.height || window.innerHeight || 1,
        source: 'window.screen-logical'
    };
}

export const FS_WIZARD_STEPS = [
    {
        id: 'fullscreen',
        title: '① 进入场景全屏',
        body: '点击下方按钮，对场景容器全屏（设置栏不进入全屏）。全屏消除窗口边框/尺寸歧义，但无法测出物理厘米——下一步需手动或比例尺确认。外接屏请先把窗口拖到目标显示器再点全屏。'
    },
    {
        id: 'display',
        title: '② 当前显示器与物理尺寸',
        body: '选择档案/预设，或用信用卡比例尺 / 手动宽高/对角确认整屏物理尺寸。像素数量≠物理大小。'
    },
    {
        id: 'tilt',
        title: '③ 支架倾角',
        body: '调节支架相对竖直的倾角，使桌面与人物站姿自然。'
    },
    {
        id: 'eye',
        title: '④ 观察点（眼睛）',
        body: '调节眼睛相对屏幕中心的 X/Y/Z。Z 为观看距离。'
    },
    {
        id: 'save',
        title: '⑤ 确认并保存',
        body: '保存本屏全屏校准档案。退出全屏后进入「预览模式」——投影按画布 CSS 比例映射，不再假装整屏。'
    }
];
