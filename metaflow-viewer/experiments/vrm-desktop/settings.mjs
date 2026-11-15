/**
 * Local settings + honest device capability hints for vrm-desktop.
 * Browser cannot know exact physical mm size or device model — never pretend.
 */

const STORAGE_KEY = 'metaflow.vrm-desktop.settings.v3';
const LEGACY_STORAGE_KEYS = [
    'metaflow.vrm-desktop.settings.v2',
    'metaflow.vrm-desktop.settings.v1'
];

export const DEFAULT_SETTINGS = {
    // Canvas projection size (metres) — derived from screenPhysical when calibrated.
    widthM: 0.24,
    heightM: 0.18,
    tiltDeg: 12,
    eyeX: -0.02,
    eyeY: 0.02,
    eyeZ: 0.36,
    quality: 'balanced', // battery | balanced | quality
    springsEnabled: true, // may be overridden per-model on load
    // Full-screen physical size of the display (metres). Null = preview-only defaults.
    screenPhysical: null, // { widthM, heightM, source, labeled }
    projectionMode: 'preview', // preview | calibrated
    panelCollapsed: {
        basic: false,
        viewpoint: false,
        calibrate: true,
        advanced: true,
        device: true
    }
};

export function loadSettings() {
    try {
        let raw = localStorage.getItem(STORAGE_KEY);
        let fromLegacy = false;
        if (!raw) {
            for (const key of LEGACY_STORAGE_KEYS) {
                const legacy = localStorage.getItem(key);
                if (legacy) {
                    raw = legacy;
                    fromLegacy = true;
                    break;
                }
            }
        }
        if (!raw) {
            return cloneDefaults();
        }
        const parsed = JSON.parse(raw);
        const merged = {
            ...DEFAULT_SETTINGS,
            ...parsed,
            panelCollapsed: {
                ...DEFAULT_SETTINGS.panelCollapsed,
                ...(parsed.panelCollapsed || {})
            }
        };
        // One-shot migrate so prior schema does not strand users on preview defaults forever
        if (fromLegacy) {
            try {
                saveSettings(merged);
            } catch {
                /* ignore quota */
            }
        }
        return merged;
    } catch {
        return cloneDefaults();
    }
}

export function saveSettings(settings) {
    const sp = settings.screenPhysical;
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
        springsEnabled: settings.springsEnabled !== false,
        screenPhysical: sp && sp.widthM > 0 && sp.heightM > 0
            ? {
                widthM: clamp(sp.widthM, 0.15, 2.5),
                heightM: clamp(sp.heightM, 0.1, 1.5),
                source: String(sp.source || '').slice(0, 160),
                labeled: String(sp.labeled || '').slice(0, 200)
            }
            : null,
        projectionMode: settings.projectionMode === 'calibrated' && sp ? 'calibrated' : 'preview',
        panelCollapsed: settings.panelCollapsed || DEFAULT_SETTINGS.panelCollapsed
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return payload;
}

export function resetSettings() {
    localStorage.removeItem(STORAGE_KEY);
    return cloneDefaults();
}

function cloneDefaults() {
    return {
        ...DEFAULT_SETTINGS,
        panelCollapsed: { ...DEFAULT_SETTINGS.panelCollapsed }
    };
}

function clamp(n, min, max) {
    const v = Number(n);
    if (!Number.isFinite(v)) return min;
    return Math.max(min, Math.min(max, v));
}

export function mToCm(m) {
    return `${(m * 100).toFixed(1)} cm`;
}

export function degLabel(d) {
    return `${Number(d).toFixed(0)}°`;
}

export function detectCapabilities() {
    const ua = navigator.userAgent || '';
    const platform = navigator.platform || 'unknown';
    const maxTouch = navigator.maxTouchPoints || 0;
    const dpr = window.devicePixelRatio || 1;
    const w = window.screen?.width || 0;
    const h = window.screen?.height || 0;
    const cores = navigator.hardwareConcurrency || null;
    const mem = navigator.deviceMemory || null;
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

/** Full quality profile that actually drives the renderer. */
export function qualityProfile(quality, deviceDpr, reducedMotion = false) {
    const dpr = deviceDpr || 1;
    if (quality === 'battery' || reducedMotion) {
        return {
            id: 'battery',
            pixelRatio: Math.min(1, dpr),
            antialias: false,
            shadows: false,
            lights: 'minimal',
            springs: false,
            toneExposure: 1.0,
            maxFps: 30,
            label: '省电：低 DPR、无阴影、弹簧骨骼关闭'
        };
    }
    if (quality === 'quality') {
        return {
            id: 'quality',
            pixelRatio: Math.min(2, dpr),
            antialias: true,
            shadows: true,
            lights: 'full',
            springs: true,
            toneExposure: 1.08,
            maxFps: 60,
            label: '高画质：高 DPR、接触阴影、完整灯光与弹簧'
        };
    }
    return {
        id: 'balanced',
        pixelRatio: Math.min(1.5, dpr),
        antialias: true,
        shadows: true,
        lights: 'standard',
        springs: true,
        toneExposure: 1.05,
        maxFps: 60,
        label: '均衡：中等 DPR、接触阴影、弹簧开启'
    };
}
