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

const HEARTBEAT_INTERVAL_MS = trackingPlan.heartbeat_interval_ms;
const SESSION_TIMEOUT_MS = trackingPlan.session_timeout_ms;
const MAX_PROPERTY_DEPTH = 4;
const MAX_STRING_LENGTH = 512;
const MAX_BATCH_EVENTS = 20;
const MAX_POSTHOG_PENDING_EVENTS = 50;
const FLUSH_INTERVAL_MS = 5000;
const STORAGE_PREFIX = 'metaflow.analytics';
const POSTHOG_DEFAULT_HOST = 'https://us.i.posthog.com';

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

const getDeviceContext = () => {
    const connection = (navigator as Navigator & {
        connection?: { effectiveType?: string; downlink?: number; rtt?: number; saveData?: boolean };
        deviceMemory?: number;
    }).connection;
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
        network: connection ? {
            effective_type: connection.effectiveType,
            downlink: connection.downlink,
            rtt: connection.rtt,
            save_data: connection.saveData
        } : undefined
    };
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
    }

    track(name: AnalyticsEventName, properties: AnalyticsProperties = {}, options: FlushOptions = {}) {
        if (!this.enabled) return;

        if (INTERACTION_EVENTS.has(name)) {
            this.interactions++;
            this.interactionsSinceLastHeartbeat++;
            this.lastInteractionAt = Date.now();
            this.lastInteractionType = name;
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
        const snapshot = this.stateProvider?.();
        const metrics = this.buildSessionMetrics(snapshot);

        this.track(name, {
            ...metrics,
            interactions_since_last: this.interactionsSinceLastHeartbeat,
            last_interaction_type: this.lastInteractionType
        }, options);
        this.interactionsSinceLastHeartbeat = 0;
    }

    private trackSessionSummary(options: FlushOptions = {}) {
        if (this.sessionSummarySent) return;
        this.sessionSummarySent = true;
        this.updateVisibleMs();
        const snapshot = this.stateProvider?.();
        const metrics = this.buildSessionMetrics(snapshot);

        this.track('session_summary', {
            ...metrics,
            session_duration_ms: Math.max(0, Date.now() - this.startedAt),
            heartbeat_interval_ms: HEARTBEAT_INTERVAL_MS,
            first_frame_ready: !!this.firstFrameAt,
            replay_sampled: !!this.replayId,
            active_sinks: this.activeSinks
        }, options);
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
            device: getDeviceContext()
        });
    }

    private buildPostHogContext() {
        const snapshot = this.stateProvider?.();
        const device = getDeviceContext();
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
            network_effective_type: device.network?.effective_type
        });
    }

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
        this.track('client_error', {
            error_name: event.error?.name ?? 'Error',
            error_message: event.message,
            source: event.filename ? new URL(event.filename, location.href).pathname : undefined,
            line: event.lineno,
            column: event.colno
        }, { beacon: true });
    };

    private handleRejection = (event: PromiseRejectionEvent) => {
        const reason = event.reason;
        this.track('client_error', {
            error_name: reason?.name ?? 'UnhandledRejection',
            error_message: reason?.message ?? String(reason)
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
