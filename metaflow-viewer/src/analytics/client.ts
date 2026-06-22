import trackingPlan from '../../../analytics/tracking-plan.json';

import type { CameraMode, InputMode, LoadingStage } from '../types';

type AnalyticsEventName = keyof typeof trackingPlan.events;

type AnalyticsSink = 'supabase' | 'posthog' | 'dual';

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

type AnalyticsProperties = Record<string, JsonValue | undefined>;

type AnalyticsResourceContext = {
    id?: string;
    route?: string;
    title?: string;
    category?: string[];
    experienceType?: string;
    fileSize?: {
        model?: number;
        environment?: number;
        thumbnail?: number;
        voxel?: number;
        total?: number;
    };
    viewer?: Record<string, JsonValue | undefined>;
    version?: {
        addedIn?: string;
        updatedIn?: string;
    };
};

type AnalyticsResourceUrls = {
    index?: string;
    content?: string;
    settings?: string;
    poster?: string;
    environment?: string;
};

type AnalyticsOptions = {
    endpoint?: string;
    enabled: boolean;
    sink?: AnalyticsSink;
    replaySampleRate?: number;
    posthogKey?: string;
    posthogHost?: string;
    posthogReplay?: boolean;
    sourceApp: string;
    appVersion: string;
    releaseDisplayVersion: string;
    gitRef: string;
    route: string;
    contentUrl?: string;
    resource?: AnalyticsResourceContext;
    resourceUrls?: AnalyticsResourceUrls;
    renderer: string;
};

type AnalyticsStateSnapshot = {
    loaded: boolean;
    loadingStage: LoadingStage;
    inputMode: InputMode;
    cameraMode: CameraMode;
};

type QueuedEvent = {
    event_id: string;
    name: AnalyticsEventName;
    event_version: number;
    occurred_at: string;
    properties: Record<string, JsonValue>;
};

type ReplayChunk = {
    replay_id: string;
    chunk_id: string;
    occurred_at: string;
    events: JsonValue[];
};

type FlushOptions = {
    beacon?: boolean;
};

type InteractionDepthCounters = {
    wheel_count: number;
    pointer_down_count: number;
    pointer_drag_count: number;
    touch_interaction_count: number;
    joystick_touch_ms: number;
    keyboard_event_count: number;
    keyboard_move_ms: number;
    annotation_viewed_count: number;
};

const HEARTBEAT_INTERVAL_MS = trackingPlan.heartbeat_interval_ms;
const SESSION_TIMEOUT_MS = trackingPlan.session_timeout_ms;
const MAX_PROPERTY_DEPTH = 4;
const MAX_STRING_LENGTH = 512;
const MAX_BATCH_EVENTS = 20;
const MAX_POSTHOG_PENDING_EVENTS = 50;
const FLUSH_INTERVAL_MS = 5000;
const STORAGE_PREFIX = 'metaflow.analytics';
const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com';
const CLIENT_HINT_HIGH_ENTROPY_KEYS = [
    'architecture',
    'bitness',
    'model',
    'platformVersion',
    'uaFullVersion'
] as const;
const UTM_KEYS = [
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_content',
    'utm_term'
] as const;
const HOST_DEVICE_MODEL_SOURCES = new Set([
    'alipay_mini_program',
    'wechat_mini_program',
    'native_webview',
    'manual_test'
]);
const RESOURCE_TIMING_EXTENSIONS = /\.(json|sog|ply|png|jpe?g|webp|wasm)$/i;
const KEYBOARD_INTERACTION_KEYS = new Set([
    'ArrowUp',
    'ArrowDown',
    'ArrowLeft',
    'ArrowRight',
    'KeyW',
    'KeyA',
    'KeyS',
    'KeyD',
    'KeyQ',
    'KeyE',
    'Space',
    'ShiftLeft',
    'ShiftRight'
]);

const INTERACTION_EVENTS = new Set<AnalyticsEventName>([
    'ui_clicked',
    'settings_changed',
    'camera_mode_changed',
    'navigation_requested',
    'navigation_completed',
    'navigation_cancelled',
    'annotation_opened',
    'fullscreen_changed',
    'xr_requested',
    'xr_started',
    'xr_failed'
]);

const POSTHOG_ALLOWED_EVENTS = new Set<AnalyticsEventName>(
    trackingPlan.sinks.posthog_allowlist as AnalyticsEventName[]
);

const ANALYTICS_SINKS = new Set<AnalyticsSink>(['supabase', 'posthog', 'dual']);

const SENSITIVE_PROPERTY_KEYS = new Set([
    'value',
    'values',
    'text',
    'input',
    'input_text',
    'query',
    'search',
    'password',
    'token',
    'secret',
    'email',
    'phone',
    'address'
]);

const eventVersions = Object.fromEntries(
    Object.entries(trackingPlan.events).map(([name, config]) => [name, config.version])
) as Record<AnalyticsEventName, number>;

const nowIso = () => new Date().toISOString();

const randomId = (prefix: string) => {
    if (globalThis.crypto?.randomUUID) {
        return `${prefix}_${globalThis.crypto.randomUUID()}`;
    }
    return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
};

const clampRate = (value: number | undefined, fallback: number) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
    return Math.max(0, Math.min(1, value));
};

const truncate = (value: string) => value.length > MAX_STRING_LENGTH ?
    `${value.slice(0, MAX_STRING_LENGTH)}...` :
    value;

const hashString = (value: string) => {
    let hash = 2166136261;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16).padStart(8, '0');
};

const sanitizeValue = (value: unknown, depth = 0): JsonValue | undefined => {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol') return undefined;
    if (value === null) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return Number.isFinite(value) ? value : null;
    if (typeof value === 'string') return truncate(value);
    if (depth >= MAX_PROPERTY_DEPTH) return '[truncated]';

    if (Array.isArray(value)) {
        return value.slice(0, 50).map((item) => sanitizeValue(item, depth + 1) ?? null);
    }

    if (typeof value === 'object') {
        const output: Record<string, JsonValue> = {};
        for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
            const normalizedKey = key.trim().toLowerCase();
            if (SENSITIVE_PROPERTY_KEYS.has(normalizedKey)) {
                output[key] = '[redacted]';
                continue;
            }
            const sanitized = sanitizeValue(child, depth + 1);
            if (sanitized !== undefined) {
                output[key] = sanitized;
            }
        }
        return output;
    }

    return String(value);
};

const sanitizeProperties = (properties: AnalyticsProperties = {}) => {
    const output: Record<string, JsonValue> = {};
    for (const [key, value] of Object.entries(properties)) {
        const sanitized = sanitizeValue(value);
        if (sanitized !== undefined) {
            output[key] = sanitized;
        }
    }
    return output;
};

const readNumberFromMeta = (name: string) => {
    const content = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content;
    if (!content) return undefined;
    const parsed = Number(content);
    return Number.isFinite(parsed) ? parsed : undefined;
};

const readStringFromMeta = (name: string) => {
    const content = document.querySelector<HTMLMetaElement>(`meta[name="${name}"]`)?.content?.trim();
    return content || undefined;
};

const readBooleanFlag = (value: string | null | undefined) => {
    if (value === null || value === undefined) return undefined;
    const normalized = value.trim().toLowerCase();
    if (['1', 'true', 'yes', 'on', 'enable', 'enabled'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'off', 'disable', 'disabled'].includes(normalized)) return false;
    return undefined;
};

const resolveEndpoint = (explicit?: string) => {
    const url = new URL(location.href);
    const queryEndpoint = url.searchParams.get('analyticsEndpoint');
    const storedEndpoint = localStorage.getItem(`${STORAGE_PREFIX}.endpoint`);
    const metaEndpoint = readStringFromMeta('metaflow-analytics-endpoint');
    return explicit || queryEndpoint || storedEndpoint || metaEndpoint || '';
};

const resolveAnalyticsSink = (explicit?: AnalyticsSink): AnalyticsSink => {
    const url = new URL(location.href);
    const raw = explicit ??
        url.searchParams.get('analyticsSink') ??
        url.searchParams.get('analytics_sink') ??
        localStorage.getItem(`${STORAGE_PREFIX}.sink`) ??
        readStringFromMeta('metaflow-analytics-sink') ??
        trackingPlan.sinks.default;
    const normalized = String(raw).trim().toLowerCase() as AnalyticsSink;
    return ANALYTICS_SINKS.has(normalized) ? normalized : 'supabase';
};

const resolvePostHogKey = (explicit?: string) => {
    const url = new URL(location.href);
    return explicit ||
        url.searchParams.get('posthogKey') ||
        url.searchParams.get('posthog_key') ||
        localStorage.getItem(`${STORAGE_PREFIX}.posthogKey`) ||
        readStringFromMeta('metaflow-posthog-key') ||
        '';
};

const resolvePostHogHost = (explicit?: string) => {
    const url = new URL(location.href);
    return explicit ||
        url.searchParams.get('posthogHost') ||
        url.searchParams.get('posthog_host') ||
        localStorage.getItem(`${STORAGE_PREFIX}.posthogHost`) ||
        readStringFromMeta('metaflow-posthog-host') ||
        POSTHOG_DEFAULT_HOST;
};

const resolvePostHogReplay = (explicit?: boolean) => {
    const url = new URL(location.href);
    return explicit ??
        readBooleanFlag(url.searchParams.get('posthogReplay')) ??
        readBooleanFlag(url.searchParams.get('posthog_replay')) ??
        readBooleanFlag(localStorage.getItem(`${STORAGE_PREFIX}.posthogReplay`)) ??
        readBooleanFlag(readStringFromMeta('metaflow-posthog-replay')) ??
        false;
};

const resolveReplaySampleRate = (explicit?: number) => {
    const url = new URL(location.href);
    const queryRate = url.searchParams.get('analyticsReplayRate');
    if (queryRate !== null) {
        const parsed = Number(queryRate);
        if (Number.isFinite(parsed)) return clampRate(parsed, trackingPlan.privacy.replay_sample_rate);
    }
    return clampRate(
        explicit ?? readNumberFromMeta('metaflow-analytics-replay-rate'),
        trackingPlan.privacy.replay_sample_rate
    );
};

const getAnonymousId = () => {
    const key = `${STORAGE_PREFIX}.anonymousId`;
    const existing = localStorage.getItem(key);
    if (existing) return existing;
    const next = randomId('anon');
    localStorage.setItem(key, next);
    return next;
};

const getSessionState = () => {
    const key = `${STORAGE_PREFIX}.session`;
    const now = Date.now();
    const raw = sessionStorage.getItem(key);
    if (raw) {
        try {
            const parsed = JSON.parse(raw) as { id?: string; lastSeen?: number };
            if (parsed.id && parsed.lastSeen && now - parsed.lastSeen < SESSION_TIMEOUT_MS) {
                const next = { id: parsed.id, lastSeen: now };
                sessionStorage.setItem(key, JSON.stringify(next));
                return next;
            }
        } catch (e) {
            // Ignore malformed stored state and start a fresh session.
        }
    }
    const next = { id: randomId('sess'), lastSeen: now };
    sessionStorage.setItem(key, JSON.stringify(next));
    return next;
};

type UserAgentDataBrand = {
    brand: string;
    version: string;
};

type UserAgentDataLike = {
    brands?: UserAgentDataBrand[];
    mobile?: boolean;
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
};

type HostDeviceInfo = {
    source?: string;
    model?: string;
    brand?: string;
    confidence?: string;
};

let highEntropyClientHints: Record<string, JsonValue> | null = null;
let highEntropyClientHintsStarted = false;

const readClientHints = () => {
    const userAgentData = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
    if (!userAgentData) return undefined;
    return {
        brands: userAgentData.brands?.slice(0, 5).map((brand) => ({
            brand: truncate(brand.brand),
            version: truncate(brand.version)
        })),
        mobile: userAgentData.mobile,
        platform: userAgentData.platform ? truncate(userAgentData.platform) : undefined,
        high_entropy: highEntropyClientHints ?? undefined
    };
};

const warmClientHints = () => {
    if (highEntropyClientHintsStarted) return;
    highEntropyClientHintsStarted = true;
    const userAgentData = (navigator as Navigator & { userAgentData?: UserAgentDataLike }).userAgentData;
    if (!userAgentData?.getHighEntropyValues) return;

    void userAgentData.getHighEntropyValues([...CLIENT_HINT_HIGH_ENTROPY_KEYS]).then((values) => {
        highEntropyClientHints = sanitizeProperties({
            architecture: values.architecture as JsonValue,
            bitness: values.bitness as JsonValue,
            model: values.model as JsonValue,
            platform_version: values.platformVersion as JsonValue,
            ua_full_version: values.uaFullVersion as JsonValue
        });
    }).catch(() => {
        highEntropyClientHints = {};
    });
};

const readHostDeviceInfo = (): HostDeviceInfo | undefined => {
    const info = (globalThis as typeof globalThis & {
        MetaflowDeviceInfo?: unknown;
    }).MetaflowDeviceInfo;
    if (!info || typeof info !== 'object' || Array.isArray(info)) return undefined;

    const record = info as Record<string, unknown>;
    const source = typeof record.source === 'string' ? record.source.trim() : '';
    if (!HOST_DEVICE_MODEL_SOURCES.has(source)) return undefined;

    const model = typeof record.model === 'string' ? record.model.trim() :
        typeof record.device_model_raw === 'string' ? record.device_model_raw.trim() :
        typeof record.deviceModel === 'string' ? record.deviceModel.trim() :
        '';
    const brand = typeof record.brand === 'string' ? record.brand.trim() :
        typeof record.device_brand_raw === 'string' ? record.device_brand_raw.trim() :
        typeof record.deviceBrand === 'string' ? record.deviceBrand.trim() :
        '';
    const confidence = typeof record.confidence === 'string' ? record.confidence.trim() : 'host';

    if (!model && !brand) return undefined;
    return {
        source,
        model: model ? truncate(model) : undefined,
        brand: brand ? truncate(brand) : undefined,
        confidence: confidence ? truncate(confidence) : 'host'
    };
};

const getDeviceContext = () => {
    const connection = (navigator as Navigator & {
        connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
        deviceMemory?: number;
    }).connection;
    const hostDevice = readHostDeviceInfo();
    return {
        language: navigator.language,
        languages: navigator.languages?.slice(0, 5) ?? [],
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        viewport: {
            width: window.innerWidth,
            height: window.innerHeight
        },
        screen: {
            width: window.screen.width,
            height: window.screen.height
        },
        device_pixel_ratio: window.devicePixelRatio,
        max_touch_points: navigator.maxTouchPoints,
        hardware_concurrency: navigator.hardwareConcurrency,
        device_memory_gb: (navigator as Navigator & { deviceMemory?: number }).deviceMemory,
        user_agent: navigator.userAgent,
        client_hints: readClientHints(),
        host_device: hostDevice,
        device_model_raw: hostDevice?.model,
        device_brand_raw: hostDevice?.brand,
        device_model_source: hostDevice?.source,
        device_model_confidence: hostDevice?.confidence,
        network: connection ? {
            effective_type: connection.effectiveType,
            downlink: connection.downlink,
            rtt: connection.rtt,
            save_data: connection.saveData
        } : undefined
    };
};

const sanitizeReferrer = (value: string) => {
    if (!value) return undefined;
    try {
        const parsed = new URL(value);
        return {
            referrer: `${parsed.origin}${parsed.pathname}`,
            referrer_domain: parsed.hostname.replace(/^www\./, '')
        };
    } catch (_e) {
        return {
            referrer: truncate(value),
            referrer_domain: undefined
        };
    }
};

const getAcquisitionContext = () => {
    const url = new URL(location.href);
    const referrer = sanitizeReferrer(document.referrer);
    const utm: Record<string, string> = {};
    for (const key of UTM_KEYS) {
        const value = url.searchParams.get(key);
        if (value) {
            utm[key] = truncate(value);
        }
    }

    return sanitizeProperties({
        ...referrer,
        entry_path: url.pathname,
        entry_has_query: url.search.length > 0,
        utm_source: utm.utm_source,
        utm_medium: utm.utm_medium,
        utm_campaign: utm.utm_campaign,
        utm_content: utm.utm_content,
        utm_term: utm.utm_term
    });
};

const pathWithoutQuery = (value: string | undefined) => {
    if (!value) return undefined;
    try {
        const parsed = new URL(value, location.href);
        return parsed.pathname;
    } catch (_e) {
        return value.split('?')[0] || undefined;
    }
};

class AnalyticsClient {
    private endpoint: string;

    private enabled: boolean;

    private sink: AnalyticsSink;

    private supabaseEnabled: boolean;

    private posthogEnabled: boolean;

    private posthogKey: string;

    private posthogHost: string;

    private posthogReplay: boolean;

    private posthog: Awaited<typeof import('posthog-js')>['default'] | null = null;

    private posthogInit: Promise<void> | null = null;

    private posthogPendingEvents: QueuedEvent[] = [];

    private anonymousId: string;

    private sessionId: string;

    private pageViewId = randomId('pv');

    private queue: QueuedEvent[] = [];

    private replayQueue: ReplayChunk[] = [];

    private flushTimer: ReturnType<typeof setTimeout> | null = null;

    private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

    private stateProvider: (() => AnalyticsStateSnapshot) | null = null;

    private startedAt = Date.now();

    private pageVisibleSince = document.visibilityState === 'visible' ? Date.now() : null;

    private visibleMs = 0;

    private interactions = 0;

    private interactionsSinceLastHeartbeat = 0;

    private lastInteractionAt: number | null = null;

    private lastInteractionType: string | null = null;

    private firstFrameAt: number | null = null;

    private replayId: string | null = null;

    private replayStop: (() => void) | undefined;

    private sessionSummarySent = false;

    private pageEndSent = false;

    private webVitals: Record<string, number> = {};

    private performanceObservers: PerformanceObserver[] = [];

    private resourceTimingKeys = new Set<string>();

    private pointerDownAt: number | null = null;

    private pointerDragRecorded = false;

    private joystickStartedAt: number | null = null;

    private activeKeyboardStarts = new Map<string, number>();

    private interactionDepthTotal: InteractionDepthCounters = {
        wheel_count: 0,
        pointer_down_count: 0,
        pointer_drag_count: 0,
        touch_interaction_count: 0,
        joystick_touch_ms: 0,
        keyboard_event_count: 0,
        keyboard_move_ms: 0,
        annotation_viewed_count: 0
    };

    private interactionDepthSinceLast: InteractionDepthCounters = {
        wheel_count: 0,
        pointer_down_count: 0,
        pointer_drag_count: 0,
        touch_interaction_count: 0,
        joystick_touch_ms: 0,
        keyboard_event_count: 0,
        keyboard_move_ms: 0,
        annotation_viewed_count: 0
    };

    constructor(private options: AnalyticsOptions) {
        this.endpoint = resolveEndpoint(options.endpoint);
        this.sink = resolveAnalyticsSink(options.sink);
        this.posthogKey = resolvePostHogKey(options.posthogKey);
        this.posthogHost = resolvePostHogHost(options.posthogHost);
        this.posthogReplay = resolvePostHogReplay(options.posthogReplay);
        const allowed = options.enabled && !this.isDisabledByUser();
        this.supabaseEnabled = allowed && (this.sink === 'supabase' || this.sink === 'dual') && !!this.endpoint;
        this.posthogEnabled = allowed && (this.sink === 'posthog' || this.sink === 'dual') && !!this.posthogKey;
        this.enabled = this.supabaseEnabled || this.posthogEnabled;
        this.anonymousId = this.enabled ? getAnonymousId() : '';
        this.sessionId = this.enabled ? getSessionState().id : '';
    }

    get ids() {
        return {
            anonymousId: this.anonymousId,
            sessionId: this.sessionId,
            pageViewId: this.pageViewId,
            replayId: this.replayId
        };
    }

    get isEnabled() {
        return this.enabled;
    }

    get activeSinks() {
        return {
            supabase: this.supabaseEnabled,
            posthog: this.posthogEnabled
        };
    }

    setStateProvider(provider: () => AnalyticsStateSnapshot) {
        this.stateProvider = provider;
    }

    start() {
        if (!this.enabled) return;

        warmClientHints();
        this.observePerformance();

        if (this.posthogEnabled) {
            void this.ensurePostHog();
        }

        this.track('session_started', {
            session_timeout_ms: SESSION_TIMEOUT_MS
        });
        this.track('route_resolved', {
            matched: !!this.options.resource?.id,
            route: this.options.resource?.route ?? this.options.route,
            resource_id: this.options.resource?.id ?? null
        });
        this.track('page_viewed', {
            route: this.options.resource?.route ?? this.options.route,
            content_url: this.options.contentUrl ?? this.options.resource?.route ?? this.options.route
        });

        this.heartbeatTimer = setInterval(() => {
            if (document.visibilityState === 'visible') {
                this.trackHeartbeat('session_heartbeat');
            }
        }, HEARTBEAT_INTERVAL_MS);

        document.addEventListener('visibilitychange', this.handleVisibilityChange);
        window.addEventListener('pagehide', this.handlePageHide);
        window.addEventListener('beforeunload', this.handlePageHide);
        window.addEventListener('error', this.handleError);
        window.addEventListener('unhandledrejection', this.handleRejection);
        window.addEventListener('resize', this.handleResize, { passive: true });
        window.addEventListener('wheel', this.handleWheel, { passive: true });
        window.addEventListener('pointerdown', this.handlePointerDown, { passive: true });
        window.addEventListener('pointermove', this.handlePointerMove, { passive: true });
        window.addEventListener('pointerup', this.handlePointerUp, { passive: true });
        window.addEventListener('pointercancel', this.handlePointerUp, { passive: true });
        window.addEventListener('keydown', this.handleKeyDown);
        window.addEventListener('keyup', this.handleKeyUp);

        void this.maybeStartReplay();
    }

    stop() {
        if (this.enabled && !this.sessionSummarySent) {
            this.trackSessionSummary({ beacon: true });
            void this.flush({ beacon: true });
        }
        if (this.heartbeatTimer) {
            clearInterval(this.heartbeatTimer);
            this.heartbeatTimer = null;
        }
        if (this.flushTimer) {
            clearTimeout(this.flushTimer);
            this.flushTimer = null;
        }
        this.replayStop?.();
        this.posthog?.stopSessionRecording?.();
        document.removeEventListener('visibilitychange', this.handleVisibilityChange);
        window.removeEventListener('pagehide', this.handlePageHide);
        window.removeEventListener('beforeunload', this.handlePageHide);
        window.removeEventListener('error', this.handleError);
        window.removeEventListener('unhandledrejection', this.handleRejection);
        window.removeEventListener('resize', this.handleResize);
        window.removeEventListener('wheel', this.handleWheel);
        window.removeEventListener('pointerdown', this.handlePointerDown);
        window.removeEventListener('pointermove', this.handlePointerMove);
        window.removeEventListener('pointerup', this.handlePointerUp);
        window.removeEventListener('pointercancel', this.handlePointerUp);
        window.removeEventListener('keydown', this.handleKeyDown);
        window.removeEventListener('keyup', this.handleKeyUp);
        for (const observer of this.performanceObservers) {
            observer.disconnect();
        }
        this.performanceObservers = [];
    }

    track(name: AnalyticsEventName, properties: AnalyticsProperties = {}, options: FlushOptions = {}) {
        if (!this.enabled) return;

        if (INTERACTION_EVENTS.has(name)) {
            this.interactions++;
            this.interactionsSinceLastHeartbeat++;
            this.lastInteractionAt = Date.now();
            this.lastInteractionType = name;
            if (name === 'annotation_opened') {
                this.addInteractionDepth('annotation_viewed_count', 1);
            }
        }

        if (name === 'first_frame_ready') {
            this.firstFrameAt = Date.now();
        }

        const event = {
            event_id: randomId('evt'),
            name,
            event_version: eventVersions[name],
            occurred_at: nowIso(),
            properties: sanitizeProperties(properties)
        };

        if (this.supabaseEnabled) {
            this.queue.push(event);
            if (options.beacon || this.queue.length >= MAX_BATCH_EVENTS) {
                void this.flush(options);
            } else {
                this.scheduleFlush();
            }
        }

        if (this.posthogEnabled && POSTHOG_ALLOWED_EVENTS.has(name)) {
            this.capturePostHog(event);
        }
    }

    markFirstFrame() {
        const elapsed = Math.max(0, Date.now() - this.startedAt);
        this.track('first_frame_ready', {
            time_to_first_frame_ms: elapsed
        });
        this.trackWebVitals('first_frame');
        this.trackResourceTimings('first_frame');
    }

    flush(options: FlushOptions = {}) {
        if (!this.supabaseEnabled || (!this.queue.length && !this.replayQueue.length)) {
            return Promise.resolve(false);
        }

        const events = this.queue.splice(0, this.queue.length);
        const replayChunks = this.replayQueue.splice(0, this.replayQueue.length);
        const payload = {
            schema_version: trackingPlan.schema_version,
            batch_id: randomId('batch'),
            sent_at: nowIso(),
            source_app: this.options.sourceApp,
            anonymous_id: this.anonymousId,
            session_id: this.sessionId,
            page_view_id: this.pageViewId,
            replay_id: this.replayId,
            context: this.buildContext(),
            events,
            replay_chunks: replayChunks
        };
        const body = JSON.stringify(payload);

        if (options.beacon && navigator.sendBeacon) {
            const sent = navigator.sendBeacon(this.endpoint, new Blob([body], { type: 'application/json' }));
            return Promise.resolve(sent);
        }

        return fetch(this.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body,
            keepalive: options.beacon,
            credentials: 'omit'
        }).then((response) => response.ok).catch(() => false);
    }

    private trackHeartbeat(name: 'session_heartbeat' | 'page_hidden' | 'page_restored' | 'session_ended', options: FlushOptions = {}) {
        this.updateVisibleMs();
        this.finalizeKeyboardDurations();
        const snapshot = this.stateProvider?.();
        const metrics = this.buildSessionMetrics(snapshot);

        this.track(name, {
            ...metrics,
            interactions_since_last: this.interactionsSinceLastHeartbeat,
            last_interaction_type: this.lastInteractionType
        }, options);
        this.interactionsSinceLastHeartbeat = 0;
        this.resetInteractionDepthSinceLast();
    }

    private trackSessionSummary(options: FlushOptions = {}) {
        if (this.sessionSummarySent) return;
        this.sessionSummarySent = true;
        this.updateVisibleMs();
        this.finalizeKeyboardDurations();
        const snapshot = this.stateProvider?.();
        const metrics = this.buildSessionMetrics(snapshot);

        this.track('session_summary', {
            ...metrics,
            session_duration_ms: Math.max(0, Date.now() - this.startedAt),
            heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
            first_frame_ready: !!this.firstFrameAt,
            replay_sampled: !!this.replayId,
            active_sinks: this.activeSinks,
            web_vitals: this.webVitals,
            interaction_depth_total: this.interactionDepthTotal
        }, options);
        this.trackWebVitals('session_summary', options);
        this.trackResourceTimings('session_summary', options);
    }

    private buildSessionMetrics(snapshot?: AnalyticsStateSnapshot) {
        const elapsed = Math.max(0, Date.now() - this.startedAt);
        const idleMs = this.lastInteractionAt ? Math.max(0, Date.now() - this.lastInteractionAt) : elapsed;
        const engagedMs = this.firstFrameAt || this.interactions > 0 || elapsed >= 10000 ?
            Math.max(0, elapsed - idleMs) + Math.min(idleMs, HEARTBEAT_INTERVAL_MS) :
            0;

        return {
            visible: document.visibilityState === 'visible',
            loaded: snapshot?.loaded ?? false,
            loading_stage: snapshot?.loadingStage ?? 'init',
            active_ms: this.visibleMs,
            engaged_ms: Math.max(0, engagedMs),
            idle_ms: idleMs,
            interactions_total: this.interactions,
            interaction_depth_since_last: { ...this.interactionDepthSinceLast },
            interaction_depth_total: { ...this.interactionDepthTotal },
            camera_mode: snapshot?.cameraMode ?? 'orbit',
            input_mode: snapshot?.inputMode ?? 'desktop'
        };
    }

    private buildContext() {
        const snapshot = this.stateProvider?.();
        return sanitizeProperties({
            app_version: this.options.appVersion,
            release_display_version: this.options.releaseDisplayVersion,
            git_ref: this.options.gitRef,
            analytics_sink: this.sink,
            active_sinks: this.activeSinks,
            route: this.options.resource?.route ?? this.options.route,
            resource_id: this.options.resource?.id,
            resource_title: this.options.resource?.title,
            category: this.options.resource?.category,
            experience_type: this.options.resource?.experienceType,
            resource_file_size: this.options.resource?.fileSize,
            resource_viewer: this.options.resource?.viewer,
            resource_version: this.options.resource?.version,
            renderer: this.options.renderer,
            input_mode: snapshot?.inputMode,
            camera_mode: snapshot?.cameraMode,
            loading_stage: snapshot?.loadingStage,
            loaded: snapshot?.loaded,
            device: getDeviceContext(),
            acquisition: getAcquisitionContext()
        });
    }

    private buildPostHogContext() {
        const snapshot = this.stateProvider?.();
        const device = getDeviceContext();
        const acquisition = getAcquisitionContext();
        return sanitizeProperties({
            source_app: this.options.sourceApp,
            app_version: this.options.appVersion,
            release_display_version: this.options.releaseDisplayVersion,
            git_ref: this.options.gitRef,
            analytics_sink: this.sink,
            session_id: this.sessionId,
            page_view_id: this.pageViewId,
            replay_sampled: !!this.replayId,
            route: this.options.resource?.route ?? this.options.route,
            resource_id: this.options.resource?.id,
            resource_title: this.options.resource?.title,
            category: this.options.resource?.category,
            experience_type: this.options.resource?.experienceType,
            renderer: this.options.renderer,
            input_mode: snapshot?.inputMode,
            camera_mode: snapshot?.cameraMode,
            loading_stage: snapshot?.loadingStage,
            loaded: snapshot?.loaded,
            viewport_width: device.viewport.width,
            viewport_height: device.viewport.height,
            device_pixel_ratio: device.device_pixel_ratio,
            language: device.language,
            network_effective_type: device.network?.effective_type,
            referrer_domain: acquisition.referrer_domain,
            utm_source: acquisition.utm_source,
            utm_medium: acquisition.utm_medium,
            utm_campaign: acquisition.utm_campaign
        });
    }

    private observePerformance() {
        const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
        if (navigation) {
            this.webVitals.ttfb_ms = Math.max(0, Math.round(navigation.responseStart - navigation.requestStart));
            this.webVitals.dom_content_loaded_ms = Math.max(0, Math.round(navigation.domContentLoadedEventEnd - navigation.startTime));
            this.webVitals.load_event_ms = Math.max(0, Math.round(navigation.loadEventEnd - navigation.startTime));
        }

        this.observePerformanceEntry('largest-contentful-paint', (entry) => {
            this.webVitals.lcp_ms = Math.max(0, Math.round(entry.startTime));
        });
        this.observePerformanceEntry('layout-shift', (entry: PerformanceEntry & { value?: number; hadRecentInput?: boolean }) => {
            if (!entry.hadRecentInput && typeof entry.value === 'number') {
                this.webVitals.cls = Number(((this.webVitals.cls ?? 0) + entry.value).toFixed(4));
            }
        });
        this.observePerformanceEntry('first-input', (entry: PerformanceEntry & { processingStart?: number }) => {
            if (typeof entry.processingStart === 'number') {
                this.webVitals.fid_ms = Math.max(0, Math.round(entry.processingStart - entry.startTime));
            }
        });
        this.observePerformanceEntry('event', (entry: PerformanceEntry & { duration?: number; interactionId?: number }) => {
            if (entry.interactionId && typeof entry.duration === 'number') {
                this.webVitals.inp_ms = Math.max(this.webVitals.inp_ms ?? 0, Math.round(entry.duration));
            }
        });
    }

    private observePerformanceEntry(type: string, callback: (entry: PerformanceEntry) => void) {
        if (!('PerformanceObserver' in window) || !PerformanceObserver.supportedEntryTypes?.includes(type)) return;
        try {
            const observer = new PerformanceObserver((list) => {
                for (const entry of list.getEntries()) {
                    callback(entry);
                }
            });
            observer.observe({ type, buffered: true } as PerformanceObserverInit);
            this.performanceObservers.push(observer);
        } catch (_e) {
            // Some browsers expose a type in supportedEntryTypes but still reject buffered observation.
        }
    }

    private trackWebVitals(source: string, options: FlushOptions = {}) {
        if (!Object.keys(this.webVitals).length) return;
        this.track('web_vitals_observed', {
            source,
            ...this.webVitals
        }, options);
    }

    private classifyResourceTiming(entryUrl: URL) {
        const urls = this.options.resourceUrls ?? {};
        const path = entryUrl.pathname;
        const matches = (value: string | undefined) => pathWithoutQuery(value) === path;

        if (matches(urls.index) || path === '/data/index.json') return 'index';
        if (matches(urls.content) || pathWithoutQuery(this.options.contentUrl) === path) return 'model';
        if (matches(urls.settings)) return 'settings';
        if (matches(urls.poster)) return 'poster';
        if (matches(urls.environment)) return 'environment';
        if (path.startsWith('/data/') && RESOURCE_TIMING_EXTENSIONS.test(path)) return 'data_asset';
        return null;
    }

    private trackResourceTimings(source: string, options: FlushOptions = {}) {
        const entries = performance.getEntriesByType('resource') as PerformanceResourceTiming[];
        const timings = [];

        for (const entry of entries) {
            let url: URL;
            try {
                url = new URL(entry.name, location.href);
            } catch (_e) {
                continue;
            }
            const resource_role = this.classifyResourceTiming(url);
            if (!resource_role) continue;
            const key = `${url.pathname}:${Math.round(entry.startTime)}`;
            if (this.resourceTimingKeys.has(key)) continue;
            this.resourceTimingKeys.add(key);
            timings.push({
                resource_role,
                path: url.pathname,
                initiator_type: entry.initiatorType,
                start_time_ms: Math.round(entry.startTime),
                duration_ms: Math.round(entry.duration),
                transfer_size_bytes: entry.transferSize,
                encoded_body_size_bytes: entry.encodedBodySize,
                decoded_body_size_bytes: entry.decodedBodySize,
                cache_result: entry.transferSize === 0 && entry.encodedBodySize > 0 ? 'cache_or_cross_origin' : 'network'
            });
        }

        if (!timings.length) return;
        this.track('resource_timing_collected', {
            source,
            entry_count: timings.length,
            transfer_size_bytes_total: timings.reduce((sum, entry) => sum + (entry.transfer_size_bytes || 0), 0),
            entries: timings.slice(0, 50)
        }, options);
    }

    private addInteractionDepth(key: keyof InteractionDepthCounters, value: number) {
        this.interactionDepthTotal[key] += value;
        this.interactionDepthSinceLast[key] += value;
    }

    private resetInteractionDepthSinceLast() {
        for (const key of Object.keys(this.interactionDepthSinceLast) as Array<keyof InteractionDepthCounters>) {
            this.interactionDepthSinceLast[key] = 0;
        }
    }

    private finalizeKeyboardDurations() {
        const now = Date.now();
        for (const [code, startedAt] of this.activeKeyboardStarts.entries()) {
            if (KEYBOARD_INTERACTION_KEYS.has(code)) {
                this.addInteractionDepth('keyboard_move_ms', Math.max(0, now - startedAt));
            }
        }
        this.activeKeyboardStarts.clear();
    }

    private handleWheel = () => {
        this.addInteractionDepth('wheel_count', 1);
    };

    private handlePointerDown = (event: PointerEvent) => {
        this.pointerDownAt = Date.now();
        this.pointerDragRecorded = false;
        this.addInteractionDepth('pointer_down_count', 1);
        if (event.pointerType === 'touch') {
            this.addInteractionDepth('touch_interaction_count', 1);
        }
        const target = event.target as Element | null;
        if (target?.closest?.('#joystickBase,#joystick')) {
            this.joystickStartedAt = Date.now();
        }
    };

    private handlePointerMove = (event: PointerEvent) => {
        if (this.pointerDownAt === null || this.pointerDragRecorded) return;
        if (event.buttons === 0) return;
        if (Date.now() - this.pointerDownAt < 120) return;
        this.pointerDragRecorded = true;
        this.addInteractionDepth('pointer_drag_count', 1);
    };

    private handlePointerUp = () => {
        if (this.joystickStartedAt !== null) {
            this.addInteractionDepth('joystick_touch_ms', Math.max(0, Date.now() - this.joystickStartedAt));
            this.joystickStartedAt = null;
        }
        this.pointerDownAt = null;
        this.pointerDragRecorded = false;
    };

    private handleKeyDown = (event: KeyboardEvent) => {
        if (event.repeat) return;
        if (!KEYBOARD_INTERACTION_KEYS.has(event.code)) return;
        this.addInteractionDepth('keyboard_event_count', 1);
        this.activeKeyboardStarts.set(event.code, Date.now());
    };

    private handleKeyUp = (event: KeyboardEvent) => {
        const startedAt = this.activeKeyboardStarts.get(event.code);
        if (startedAt === undefined) return;
        this.activeKeyboardStarts.delete(event.code);
        this.addInteractionDepth('keyboard_move_ms', Math.max(0, Date.now() - startedAt));
    };

    private async ensurePostHog() {
        if (!this.posthogEnabled || this.posthog) return;
        if (this.posthogInit) return this.posthogInit;

        this.posthogInit = import('posthog-js').then((module) => {
            const posthog = module.default;
            posthog.init(this.posthogKey, {
                api_host: this.posthogHost,
                defaults: '2026-01-30',
                autocapture: false,
                capture_pageview: false,
                capture_pageleave: false,
                disable_session_recording: !this.posthogReplay,
                respect_dnt: true,
                ip: false,
                session_recording: {
                    maskAllInputs: true,
                    maskTextSelector: '*',
                    blockSelector: '.rr-block',
                    ignoreClass: 'rr-ignore',
                    maskTextClass: 'rr-mask',
                    recordCanvas: false
                }
            } as Parameters<typeof posthog.init>[1]);
            this.posthog = posthog;
            this.drainPostHogPendingEvents();
        }).catch((error) => {
            console.warn('[Analytics] Failed to initialize PostHog:', error);
            this.posthogEnabled = false;
        });

        return this.posthogInit;
    }

    private capturePostHog(event: QueuedEvent) {
        if (!this.posthogEnabled) return;
        if (!this.posthog) {
            if (this.posthogPendingEvents.length < MAX_POSTHOG_PENDING_EVENTS) {
                this.posthogPendingEvents.push(event);
            }
            void this.ensurePostHog();
            return;
        }

        this.posthog.capture(event.name, {
            ...this.buildPostHogContext(),
            ...event.properties,
            event_id: event.event_id,
            event_version: event.event_version,
            occurred_at: event.occurred_at
        });
    }

    private drainPostHogPendingEvents() {
        if (!this.posthog) return;
        const pending = this.posthogPendingEvents.splice(0, this.posthogPendingEvents.length);
        for (const event of pending) {
            this.capturePostHog(event);
        }
    }

    private scheduleFlush() {
        if (this.flushTimer) return;
        this.flushTimer = setTimeout(() => {
            this.flushTimer = null;
            void this.flush();
        }, FLUSH_INTERVAL_MS);
    }

    private updateVisibleMs() {
        if (this.pageVisibleSince !== null) {
            this.visibleMs += Math.max(0, Date.now() - this.pageVisibleSince);
            this.pageVisibleSince = Date.now();
        }
        sessionStorage.setItem(`${STORAGE_PREFIX}.session`, JSON.stringify({
            id: this.sessionId,
            lastSeen: Date.now()
        }));
    }

    private handleVisibilityChange = () => {
        if (document.visibilityState === 'hidden') {
            this.updateVisibleMs();
            this.pageVisibleSince = null;
            this.trackHeartbeat('page_hidden', { beacon: true });
            void this.flush({ beacon: true });
        } else {
            this.pageVisibleSince = Date.now();
            this.trackHeartbeat('page_restored');
        }
    };

    private handlePageHide = () => {
        if (this.pageEndSent) return;
        this.pageEndSent = true;
        this.trackSessionSummary({ beacon: true });
        this.trackHeartbeat('session_ended', { beacon: true });
        void this.flush({ beacon: true });
    };

    private handleResize = () => {
        this.scheduleFlush();
    };

    private handleError = (event: ErrorEvent) => {
        const snapshot = this.stateProvider?.();
        const stack = event.error?.stack ?? event.message;
        this.track('client_error', {
            error_name: event.error?.name ?? 'Error',
            error_message: event.message,
            error_stack_hash: stack ? hashString(String(stack)) : undefined,
            severity: 'error',
            source: event.filename ? new URL(event.filename, location.href).pathname : undefined,
            line: event.lineno,
            column: event.colno,
            renderer: this.options.renderer,
            input_mode: snapshot?.inputMode,
            camera_mode: snapshot?.cameraMode,
            loading_stage: snapshot?.loadingStage
        }, { beacon: true });
    };

    private handleRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        const snapshot = this.stateProvider?.();
        const stack = reason?.stack ?? reason?.message ?? String(reason);
        this.track('client_error', {
            error_name: reason?.name ?? 'UnhandledRejection',
            error_message: reason?.message ?? String(reason),
            error_stack_hash: stack ? hashString(String(stack)) : undefined,
            severity: 'error',
            renderer: this.options.renderer,
            input_mode: snapshot?.inputMode,
            camera_mode: snapshot?.cameraMode,
            loading_stage: snapshot?.loadingStage
        }, { beacon: true });
    };

    private isDisabledByUser() {
        const url = new URL(location.href);
        return url.searchParams.has('noanalytics') ||
            url.searchParams.get('analytics') === '0' ||
            localStorage.getItem(`${STORAGE_PREFIX}.disabled`) === 'true' ||
            navigator.doNotTrack === '1';
    }

    private async maybeStartReplay() {
        const rate = resolveReplaySampleRate(this.options.replaySampleRate);
        if (!this.supabaseEnabled || rate <= 0 || Math.random() >= rate || new URL(location.href).searchParams.has('noreplay')) {
            return;
        }

        this.replayId = randomId('replay');
        try {
            const rrweb = await import('rrweb');
            const replayEvents: JsonValue[] = [];
            let chunkSeq = 0;
            const flushReplay = () => {
                if (!replayEvents.length || !this.replayId) return;
                const events = replayEvents.splice(0, replayEvents.length);
                const chunkId = `${this.replayId}_${String(++chunkSeq).padStart(4, '0')}`;
                this.replayQueue.push({
                    replay_id: this.replayId,
                    chunk_id: chunkId,
                    occurred_at: nowIso(),
                    events
                });
                this.track('replay_uploaded', {
                    chunk_id: chunkId,
                    event_count: events.length
                });
            };

            this.replayStop = rrweb.record({
                emit: (event: unknown) => {
                    const sanitized = sanitizeValue(event);
                    if (sanitized !== undefined) {
                        replayEvents.push(sanitized);
                    }
                    if (replayEvents.length >= 100) {
                        flushReplay();
                    }
                },
                maskAllInputs: true,
                recordCanvas: false,
                blockClass: 'rr-block',
                ignoreClass: 'rr-ignore',
                maskTextClass: 'rr-mask'
            } as Parameters<typeof rrweb.record>[0]);

            setInterval(flushReplay, 10000);
            this.track('replay_started', {
                sample_rate: rate
            });
        } catch (e) {
            this.track('replay_failed', {
                reason: e instanceof Error ? e.message : String(e)
            });
        }
    }
}

const createAnalyticsClient = (options: AnalyticsOptions) => new AnalyticsClient(options);

export {
    AnalyticsClient,
    AnalyticsEventName,
    AnalyticsOptions,
    AnalyticsProperties,
    AnalyticsResourceContext,
    AnalyticsSink,
    AnalyticsStateSnapshot,
    createAnalyticsClient
};
