/**
 * Mac / external display calibration helpers for vrm-desktop.
 *
 * Honesty rules:
 * - Never claim a Mac model was "detected" from CSS resolution alone.
 * - Distinguish viewport CSS px, screen logical px, DPR/backing pixels, physical cm.
 * - Window Management / getScreenDetails only after explicit user action.
 * - Safari/macOS without the API: manual presets + current screen.* only — never fake externals.
 * - Privacy: localStorage keys use coarse geometry + optional user label; no UA fingerprint dump.
 */

const SCREEN_PROFILES_KEY = 'metaflow.vrm-desktop.screen-profiles.v1';
const ACTIVE_SCREEN_KEY = 'metaflow.vrm-desktop.active-screen.v1';

/** Credit card ISO/IEC 7810 ID-1 — for visual ruler (mm). */
export const CREDIT_CARD_MM = { width: 85.6, height: 53.98 };

/**
 * Small curated MacBook built-in list. Dimensions are diagonal (Apple-published inches)
 * + native aspect from common Liquid Retina native pixel grids. Physical cm are
 * **derived estimates** (labeled), not micrometer measurements.
 *
 * Sources: Apple MacBook Air / Pro tech specs (diagonal inches + native resolution).
 */
export const MACBOOK_PRESETS = [
    {
        id: 'mba-13-6',
        label: 'MacBook Air 13.6″（手动选择）',
        kind: 'builtin',
        family: 'MacBook Air',
        diagonalIn: 13.6,
        nativePx: { w: 2560, h: 1664 },
        source: 'Apple MacBook Air 13″ tech specs — 13.6″ Liquid Retina; native 2560×1664'
    },
    {
        id: 'mba-15-3',
        label: 'MacBook Air 15.3″（手动选择）',
        kind: 'builtin',
        family: 'MacBook Air',
        diagonalIn: 15.3,
        nativePx: { w: 2880, h: 1864 },
        source: 'Apple MacBook Air 15″ tech specs — 15.3″ Liquid Retina; native 2880×1864'
    },
    {
        id: 'mbp-14-2',
        label: 'MacBook Pro 14.2″（手动选择）',
        kind: 'builtin',
        family: 'MacBook Pro',
        diagonalIn: 14.2,
        nativePx: { w: 3024, h: 1964 },
        source: 'Apple MacBook Pro 14″ tech specs — 14.2″ Liquid Retina XDR; native 3024×1964'
    },
    {
        id: 'mbp-16-2',
        label: 'MacBook Pro 16.2″（手动选择）',
        kind: 'builtin',
        family: 'MacBook Pro',
        diagonalIn: 16.2,
        nativePx: { w: 3456, h: 2234 },
        source: 'Apple MacBook Pro 16″ tech specs — 16.2″ Liquid Retina XDR; native 3456×2234'
    }
];

/**
 * External monitor shape presets — diagonal + aspect only.
 * Physical cm derived; labeled as estimates. Not a product database.
 */
export const EXTERNAL_PRESETS = [
    {
        id: 'ext-24-16x9',
        label: '外接 24″ · 16:9（手动）',
        kind: 'external',
        diagonalIn: 24,
        aspect: 16 / 9,
        source: 'Common 24″ 16:9 monitor shape; cm derived from diagonal×aspect'
    },
    {
        id: 'ext-27-16x9',
        label: '外接 27″ · 16:9（手动）',
        kind: 'external',
        diagonalIn: 27,
        aspect: 16 / 9,
        source: 'Common 27″ 16:9 monitor shape; cm derived from diagonal×aspect'
    },
    {
        id: 'ext-27-16x10',
        label: '外接 27″ · 16:10（手动）',
        kind: 'external',
        diagonalIn: 27,
        aspect: 16 / 10,
        source: 'Common 27″ 16:10 monitor shape; cm derived from diagonal×aspect'
    },
    {
        id: 'ext-32-16x9',
        label: '外接 32″ · 16:9（手动）',
        kind: 'external',
        diagonalIn: 32,
        aspect: 16 / 9,
        source: 'Common 32″ 16:9 monitor shape; cm derived from diagonal×aspect'
    },
    {
        id: 'ext-34-21x9',
        label: '外接 34″ · 21:9 超宽（手动）',
        kind: 'external',
        diagonalIn: 34,
        aspect: 21 / 9,
        source: 'Common 34″ ultrawide 21:9 shape; cm derived from diagonal×aspect'
    },
    {
        id: 'ext-custom',
        label: '外接自定义（对角 / 宽高）',
        kind: 'external',
        diagonalIn: null,
        aspect: null,
        source: 'User-entered diagonal or width×height'
    }
];

const INCH_TO_CM = 2.54;

export function sizeFromDiagonalAspect(diagonalIn, aspect) {
    if (!(diagonalIn > 0) || !(aspect > 0)) return null;
    // diagonal² = w² + h², h = w/aspect → w = d / sqrt(1 + 1/aspect²)
    const widthIn = diagonalIn / Math.sqrt(1 + 1 / (aspect * aspect));
    const heightIn = widthIn / aspect;
    return {
        widthM: (widthIn * INCH_TO_CM) / 100,
        heightM: (heightIn * INCH_TO_CM) / 100,
        widthCm: widthIn * INCH_TO_CM,
        heightCm: heightIn * INCH_TO_CM,
        derived: true
    };
}

export function enrichPreset(preset) {
    let aspect = preset.aspect;
    if (!aspect && preset.nativePx?.w && preset.nativePx?.h) {
        aspect = preset.nativePx.w / preset.nativePx.h;
    }
    const size = preset.diagonalIn && aspect
        ? sizeFromDiagonalAspect(preset.diagonalIn, aspect)
        : null;
    return {
        ...preset,
        aspect: aspect || null,
        physical: size,
        physicalLabel: size
            ? `约 ${size.widthCm.toFixed(1)}×${size.heightCm.toFixed(1)} cm（由对角×比例推算，非实测）`
            : '需手动输入物理尺寸'
    };
}

export function listDisplayPresets() {
    return [...MACBOOK_PRESETS, ...EXTERNAL_PRESETS].map(enrichPreset);
}

/** Snapshot of layers the browser can actually see — never physical cm. */
export function readBrowserDisplayLayers() {
    const dpr = window.devicePixelRatio || 1;
    const screenW = window.screen?.width || 0;
    const screenH = window.screen?.height || 0;
    const availW = window.screen?.availWidth || 0;
    const availH = window.screen?.availHeight || 0;
    const viewportW = window.innerWidth || 0;
    const viewportH = window.innerHeight || 0;
    const backingW = Math.round(viewportW * dpr);
    const backingH = Math.round(viewportH * dpr);

    return {
        viewportCssPx: { w: viewportW, h: viewportH },
        screenLogicalPx: { w: screenW, h: screenH },
        screenAvailLogicalPx: { w: availW, h: availH },
        devicePixelRatio: dpr,
        backingApproxPx: { w: backingW, h: backingH },
        orientation: screen?.orientation?.type || null,
        note:
            'CSS 视口 ≠ screen 逻辑像素 ≠ 背板像素；浏览器不提供物理厘米。'
    };
}

export function featureDetectWindowManagement() {
    if (typeof window === 'undefined') {
        return {
            getScreenDetails: false,
            permissionQueryable: false,
            supported: false,
            safariLikely: false,
            explanation: '非浏览器环境'
        };
    }
    const hasGetScreenDetails = typeof window.getScreenDetails === 'function';
    const hasScreenDetailsPermission = !!(navigator.permissions?.query);
    return {
        getScreenDetails: hasGetScreenDetails,
        permissionQueryable: hasScreenDetailsPermission,
        supported: hasGetScreenDetails,
        safariLikely: isSafari(),
        explanation: hasGetScreenDetails
            ? '可用 Window Management（getScreenDetails）。仅在你点击「识别显示器」后请求权限。'
            : '当前浏览器无 getScreenDetails（Safari / 多数 macOS 浏览器如此）。不会伪造外接屏识别；请用手动预设与卡尺校准。'
    };
}

function isSafari() {
    if (typeof navigator === 'undefined') return false;
    const ua = navigator.userAgent || '';
    return /Safari\//.test(ua) && !/Chrome\//.test(ua) && !/Chromium\//.test(ua) && !/Edg\//.test(ua);
}

/**
 * Privacy-conscious profile key from coarse geometry.
 * Prefer ScreenDetailed fields when present; never store full UA.
 */
export function screenProfileKey(screenLike = {}) {
    const w = screenLike.width ?? screenLike.screenLogicalPx?.w ?? window.screen?.width ?? 0;
    const h = screenLike.height ?? screenLike.screenLogicalPx?.h ?? window.screen?.height ?? 0;
    const dpr = screenLike.devicePixelRatio ?? window.devicePixelRatio ?? 1;
    const isInternal = screenLike.isInternal;
    const label = (screenLike.label || '').trim().slice(0, 48);
    const parts = [
        's',
        `${Math.round(w)}x${Math.round(h)}`,
        `d${Number(dpr).toFixed(2)}`,
        isInternal === true ? 'int' : isInternal === false ? 'ext' : 'unk'
    ];
    if (label) parts.push(`L${simpleHash(label)}`);
    return parts.join('_');
}

function simpleHash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0).toString(36).slice(0, 6);
}

export function loadScreenProfiles() {
    try {
        const raw = localStorage.getItem(SCREEN_PROFILES_KEY);
        if (!raw) return {};
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
        return {};
    }
}

export function saveScreenProfiles(map) {
    localStorage.setItem(SCREEN_PROFILES_KEY, JSON.stringify(map));
    return map;
}

export function loadActiveScreenKey() {
    try {
        return localStorage.getItem(ACTIVE_SCREEN_KEY) || null;
    } catch {
        return null;
    }
}

export function saveActiveScreenKey(key) {
    if (!key) localStorage.removeItem(ACTIVE_SCREEN_KEY);
    else localStorage.setItem(ACTIVE_SCREEN_KEY, key);
}

/**
 * Upsert a profile. Does not overwrite user calibration fields unless `overwriteCalibration`.
 */
export function upsertScreenProfile(key, patch, { overwriteCalibration = false } = {}) {
    const all = loadScreenProfiles();
    const prev = all[key] || {};
    const next = {
        ...prev,
        ...patch,
        key,
        updatedAt: Date.now()
    };
    if (!overwriteCalibration && prev.calibration) {
        next.calibration = prev.calibration;
    } else if (patch.calibration) {
        next.calibration = patch.calibration;
    }
    if (!overwriteCalibration && prev.userLabel) {
        next.userLabel = prev.userLabel;
    } else if (patch.userLabel != null) {
        next.userLabel = patch.userLabel;
    }
    all[key] = next;
    saveScreenProfiles(all);
    return next;
}

export function setProfileCalibration(key, calibration) {
    return upsertScreenProfile(key, { calibration }, { overwriteCalibration: true });
}

export function renameScreenProfile(key, userLabel) {
    return upsertScreenProfile(key, { userLabel: String(userLabel || '').slice(0, 64) }, { overwriteCalibration: false });
}

/**
 * Explicit user-triggered display recognition.
 * Never call on page load.
 */
export async function requestScreenDetails() {
    const feat = featureDetectWindowManagement();
    if (!feat.supported) {
        return {
            ok: false,
            reason: 'unsupported',
            message: feat.explanation,
            layers: readBrowserDisplayLayers(),
            screens: [],
            current: null
        };
    }
    try {
        const details = await window.getScreenDetails();
        const screens = [...(details.screens || [])].map((s) => summarizeScreenDetailed(s));
        const current = details.currentScreen
            ? summarizeScreenDetailed(details.currentScreen)
            : screens[0] || null;
        return {
            ok: true,
            reason: 'granted',
            message: `已读取 ${screens.length} 块显示器（Window Management）。标签来自系统/浏览器，非机型识别。`,
            layers: readBrowserDisplayLayers(),
            screens,
            current,
            details
        };
    } catch (err) {
        return {
            ok: false,
            reason: 'denied-or-error',
            message: `未能获取多显示器信息：${err?.message || err}。可继续用手动预设。`,
            layers: readBrowserDisplayLayers(),
            screens: [],
            current: null
        };
    }
}

function summarizeScreenDetailed(s) {
    return {
        label: s.label || '',
        width: s.width,
        height: s.height,
        availWidth: s.availWidth,
        availHeight: s.availHeight,
        left: s.left,
        top: s.top,
        devicePixelRatio: s.devicePixelRatio ?? window.devicePixelRatio,
        isInternal: typeof s.isInternal === 'boolean' ? s.isInternal : null,
        isPrimary: !!s.isPrimary,
        key: screenProfileKey({
            width: s.width,
            height: s.height,
            devicePixelRatio: s.devicePixelRatio ?? window.devicePixelRatio,
            isInternal: s.isInternal,
            label: s.label
        })
    };
}

/**
 * Attach change listeners when ScreenDetails is available.
 * Calls onChange with a fresh summary; never auto-applies calibration.
 */
export function observeScreenDetails(details, onChange) {
    if (!details) return () => {};
    const handler = () => {
        const screens = [...(details.screens || [])].map((s) => summarizeScreenDetailed(s));
        const current = details.currentScreen
            ? summarizeScreenDetailed(details.currentScreen)
            : null;
        onChange({ screens, current, layers: readBrowserDisplayLayers() });
    };
    details.addEventListener?.('currentscreenchange', handler);
    details.addEventListener?.('screenschange', handler);
    return () => {
        details.removeEventListener?.('currentscreenchange', handler);
        details.removeEventListener?.('screenschange', handler);
    };
}

/** Fallback observers without Window Management (resize / DPR). */
export function observeBasicDisplayChanges(onChange) {
    const fire = () => onChange({ layers: readBrowserDisplayLayers(), screens: [], current: null });
    window.addEventListener('resize', fire);
    const mql = window.matchMedia?.(`(resolution: ${window.devicePixelRatio}dppx)`);
    // DPR changes: listen to a broad media query if possible
    const dprHandler = () => fire();
    try {
        mql?.addEventListener?.('change', dprHandler);
    } catch {
        mql?.addListener?.(dprHandler);
    }
    return () => {
        window.removeEventListener('resize', fire);
        try {
            mql?.removeEventListener?.('change', dprHandler);
        } catch {
            mql?.removeListener?.(dprHandler);
        }
    };
}

/**
 * Suggest projection width/height from a full-screen physical estimate,
 * scaled to the current CSS viewport fraction of the screen.
 * Suggestion only — caller must not overwrite saved settings silently.
 */
export function suggestViewportPhysicalMeters(screenWidthM, screenHeightM, layers = readBrowserDisplayLayers()) {
    const sw = layers.screenLogicalPx.w || 1;
    const sh = layers.screenLogicalPx.h || 1;
    const vw = layers.viewportCssPx.w || sw;
    const vh = layers.viewportCssPx.h || sh;
    const widthM = screenWidthM * (vw / sw);
    const heightM = screenHeightM * (vh / sh);
    return {
        widthM: clamp(widthM, 0.08, 0.8),
        heightM: clamp(heightM, 0.04, 1),
        basis: 'viewport-fraction-of-screen-physical-estimate',
        labeled: '建议值 = 整屏物理估计 × (视口/屏幕逻辑像素比)；未自动写入已保存设置'
    };
}

/**
 * From ruler: user sets how wide (CSS px) a known physical card appears.
 * Returns pxPerCm and suggested full-screen physical size for current screen logical px.
 */
export function calibrateFromRuler(cardWidthCssPx, cardWidthMm = CREDIT_CARD_MM.width, layers = readBrowserDisplayLayers()) {
    if (!(cardWidthCssPx > 0)) return null;
    const pxPerMm = cardWidthCssPx / cardWidthMm;
    const pxPerCm = pxPerMm * 10;
    const screenW = layers.screenLogicalPx.w || layers.viewportCssPx.w;
    const screenH = layers.screenLogicalPx.h || layers.viewportCssPx.h;
    const widthCm = screenW / pxPerCm;
    const heightCm = screenH / pxPerCm;
    return {
        pxPerCm,
        screenWidthM: widthCm / 100,
        screenHeightM: heightCm / 100,
        widthCm,
        heightCm,
        labeled: '由信用卡比例尺推算整屏逻辑像素对应的物理尺寸（受缩放/系统显示设置影响）'
    };
}

export function applyCustomExternal({ diagonalIn, widthCm, heightCm, aspect }) {
    if (widthCm > 0 && heightCm > 0) {
        return {
            widthM: widthCm / 100,
            heightM: heightCm / 100,
            derived: false,
            source: 'user width×height cm'
        };
    }
    const a = aspect || 16 / 9;
    if (diagonalIn > 0) {
        const size = sizeFromDiagonalAspect(diagonalIn, a);
        return { ...size, source: 'user diagonal + aspect (derived cm)' };
    }
    return null;
}

function clamp(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

/** Capabilities vs limitations blurb for UI. */
export function capabilitiesVsLimitations() {
    const feat = featureDetectWindowManagement();
    return {
        can: [
            '手动选择 MacBook Air/Pro 内建屏预设（对角来自 Apple 规格，厘米为推算）',
            '手动选择外接 16:9 / 16:10 / 超宽 或自定义对角/宽高',
            '区分 CSS 视口、screen 逻辑像素、DPR/背板近似像素',
            '信用卡比例尺推算 px/cm（可选）',
            '本地按屏保存校准档案（粗粒度 key + 可选自定义名称）',
            feat.supported
                ? '在用户点击后使用 getScreenDetails 列出显示器并监听切换'
                : '在无 Window Management 时仍可用手动流程（不阻断）'
        ],
        cannot: [
            '不能仅凭分辨率断言具体 Mac 机型或英寸对角',
            'Safari 等无 API 时不能「识别」外接显示器',
            '不能读取真实物理 DPI / 毫米（除非用户用比例尺或厂商规格）',
            '不会在后台请求屏幕权限或收集指纹'
        ]
    };
}
