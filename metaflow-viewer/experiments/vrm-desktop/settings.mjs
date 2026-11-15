/**
 * Local settings + honest device capability hints for vrm-desktop.
 * Browser cannot know exact physical mm size or device model — never pretend.
 */

const STORAGE_KEY = 'metaflow.vrm-desktop.settings.v1';

export const DEFAULT_SETTINGS = {
    widthM: 0.25,
    heightM: 0.20,
    tiltDeg: 15,
    eyeX: -0.03,
    eyeY: 0,
    eyeZ: 0.48,
    quality: 'balanced', // battery | balanced | quality
    panelCollapsed: {
        basic: false,
        viewpoint: false,
        advanced: true,
        device: true
    }
};

export function loadSettings() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_SETTINGS, panelCollapsed: { ...DEFAULT_SETTINGS.panelCollapsed } };
        const parsed = JSON.parse(raw);
        return {
            ...DEFAULT_SETTINGS,
            ...parsed,
            panelCollapsed: {
                ...DEFAULT_SETTINGS.panelCollapsed,
                ...(parsed.panelCollapsed || {})
            }
        };
    } catch {
        return { ...DEFAULT_SETTINGS, panelCollapsed: { ...DEFAULT_SETTINGS.panelCollapsed } };
    }
}

export function saveSettings(settings) {
    const payload = {
        widthM: clamp(settings.widthM, 0.08, 0.8),
        heightM: clamp(settings.heightM, 0.04, 1),
        tiltDeg: clamp(settings.tiltDeg, 0, 90),
        eyeX: clamp(settings.eyeX, -0.3, 0.3),
        eyeY: clamp(settings.eyeY, -0.4, 0.4),
        eyeZ: clamp(settings.eyeZ, 0.2, 1.5),
        quality: ['battery', 'balanced', 'quality'].includes(settings.quality)
            ? settings.quality
            : 'balanced',
        panelCollapsed: settings.panelCollapsed || DEFAULT_SETTINGS.panelCollapsed
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
}

export function resetSettings() {
    localStorage.removeItem(STORAGE_KEY);
    return { ...DEFAULT_SETTINGS, panelCollapsed: { ...DEFAULT_SETTINGS.panelCollapsed } };
}

function clamp(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

/** Friendly display helpers */
export function mToCm(m) {
    return `${(m * 100).toFixed(1)} cm`;
}

export function degLabel(d) {
    return `${Number(d).toFixed(0)}°`;
}

/**
 * Honest capability snapshot. Suggested profile is a hint only.
 */
export function detectCapabilities() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || 'unknown';
    const maxTouch = navigator.maxTouchPoints || 0;
    const dpr = window.devicePixelRatio || 1;
    const w = window.screen?.width || 0;
    const h = window.screen?.height || 0;
    const cores = navigator.hardwareConcurrency || null;
    const mem = navigator.deviceMemory || null; // Chrome-only GiB hint
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches ?? false;
    const saveData = navigator.connection?.saveData ?? false;
    const webgl2 = (() => {
        try {
            const c = document.createElement('canvas');
            return !!c.getContext('webgl2');
        } catch {
            return false;
        }
    })();

    let formFactor = 'desktop';
    if (maxTouch > 0 && Math.min(w, h) <= 520) formFactor = 'phone';
    else if (maxTouch > 0 && Math.min(w, h) <= 900) formFactor = 'tablet';

    let suggestedQuality = 'balanced';
    if (saveData || reducedMotion || (mem != null && mem <= 4)) suggestedQuality = 'battery';
    else if (webgl2 && dpr >= 2 && (mem == null || mem >= 8)) suggestedQuality = 'quality';

    return {
        formFactor,
        platform,
        uaSummary: summarizeUA(ua),
        screenCssPx: `${w}×${h}`,
        devicePixelRatio: dpr,
        cores,
        deviceMemoryGiB: mem,
        webgl2,
        reducedMotion,
        saveData,
        suggestedQuality,
        disclaimer:
            '浏览器无法可靠识别具体机型或物理屏幕厘米尺寸；以上仅为能力提示，请手动覆盖。'
    };
}

function summarizeUA(ua) {
    if (/Edg\//.test(ua)) return 'Microsoft Edge';
    if (/Chrome\//.test(ua) && !/Edg\//.test(ua)) return 'Chrome';
    if (/Safari\//.test(ua) && !/Chrome\//.test(ua)) return 'Safari';
    if (/Firefox\//.test(ua)) return 'Firefox';
    return '未知浏览器';
}

export function qualityToPixelRatio(quality, deviceDpr) {
    const dpr = deviceDpr || 1;
    if (quality === 'battery') return Math.min(1, dpr);
    if (quality === 'quality') return Math.min(2, dpr);
    return Math.min(1.5, dpr);
}
