import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const EVENT_NAMES = new Set([
  'session_started',
  'page_viewed',
  'session_heartbeat',
  'page_hidden',
  'page_restored',
  'session_ended',
  'session_summary',
  'route_resolved',
  'resource_load_started',
  'loading_stage_changed',
  'first_frame_ready',
  'resource_load_failed',
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
  'xr_failed',
  'client_error',
  'replay_started',
  'replay_uploaded',
  'replay_failed',
  'collab_room_created',
  'collab_room_joined',
  'collab_room_left',
  'collab_presence_changed',
  'shared_camera_started',
  'shared_camera_stopped',
  'collab_session_summary'
]);

const MAX_BODY_BYTES = 256 * 1024;
const MAX_EVENTS_PER_BATCH = 100;
const MAX_REPLAY_CHUNKS_PER_BATCH = 20;
const REPLAY_BUCKET = 'analytics-replays';

type JsonRecord = Record<string, unknown>;

const json = (body: unknown, status = 200, headers: HeadersInit = {}) => {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers
    }
  });
};

const parseAllowedOrigins = () => {
  const configured = Deno.env.get('ANALYTICS_ALLOWED_ORIGINS');
  if (!configured) {
    return new Set([
      'https://metaflow.shuang-su.com',
      'http://localhost:3000',
      'http://127.0.0.1:3000'
    ]);
  }
  return new Set(configured.split(',').map((entry) => entry.trim()).filter(Boolean));
};

const corsHeadersFor = (request: Request) => {
  const origin = request.headers.get('origin') ?? '';
  const allowedOrigins = parseAllowedOrigins();
  const allowed = allowedOrigins.has('*') || allowedOrigins.has(origin);
  return {
    allowed,
    headers: {
      'Access-Control-Allow-Origin': allowed ? origin : 'null',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Vary': 'Origin'
    }
  };
};

const getRequiredEnv = (name: string) => {
  const value = Deno.env.get(name);
  if (!value) {
    throw new Error(`Missing required env: ${name}`);
  }
  return value;
};

const isRecord = (value: unknown): value is JsonRecord => {
  return !!value && typeof value === 'object' && !Array.isArray(value);
};

const safeString = (value: unknown, fallback = '') => {
  return typeof value === 'string' ? value.slice(0, 512) : fallback;
};

const safeInt = (value: unknown, fallback = 1) => {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : fallback;
};

const safeJson = (value: unknown): JsonRecord => {
  return isRecord(value) ? value : {};
};

const safeSegment = (value: string) => {
  return value.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 160);
};

const hashAnonymousId = async (anonymousId: string) => {
  const salt = Deno.env.get('ANALYTICS_HASH_SALT') ?? '';
  const data = new TextEncoder().encode(`${salt}:${anonymousId}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
};

const rejectBatch = async (
  supabase: ReturnType<typeof createClient>,
  payload: JsonRecord,
  reason: string
) => {
  await supabase.schema('analytics').from('events_rejected').insert({
    source_app: safeString(payload.source_app, 'unknown'),
    session_id: safeString(payload.session_id, ''),
    reason,
    payload
  });
};

const validateEvent = (event: unknown) => {
  if (!isRecord(event)) return 'event_not_object';
  const name = safeString(event.name);
  if (!EVENT_NAMES.has(name)) return 'unknown_event';
  if (!safeString(event.event_id)) return 'missing_event_id';
  if (!safeString(event.occurred_at)) return 'missing_occurred_at';
  if (Number.isNaN(Date.parse(safeString(event.occurred_at)))) return 'invalid_occurred_at';
  return null;
};

Deno.serve(async (request) => {
  const cors = corsHeadersFor(request);
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: cors.headers });
  }

  if (request.method !== 'POST') {
    return json({ error: 'method_not_allowed' }, 405, cors.headers);
  }

  if (!cors.allowed) {
    return json({ error: 'origin_not_allowed' }, 403, cors.headers);
  }

  const body = await request.text();
  if (new TextEncoder().encode(body).byteLength > MAX_BODY_BYTES) {
    return json({ error: 'payload_too_large' }, 413, cors.headers);
  }

  const supabaseUrl = getRequiredEnv('SUPABASE_URL');
  const serviceRoleKey = getRequiredEnv('SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false
    }
  });

  let payload: JsonRecord;
  try {
    payload = JSON.parse(body);
  } catch (_err) {
    return json({ error: 'invalid_json' }, 400, cors.headers);
  }

  const events = Array.isArray(payload.events) ? payload.events : [];
  const replayChunks = Array.isArray(payload.replay_chunks) ? payload.replay_chunks : [];
  if (events.length > MAX_EVENTS_PER_BATCH || replayChunks.length > MAX_REPLAY_CHUNKS_PER_BATCH) {
    await rejectBatch(supabase, payload, 'batch_limit_exceeded');
    return json({ error: 'batch_limit_exceeded' }, 400, cors.headers);
  }

  const anonymousId = safeString(payload.anonymous_id);
  const sessionId = safeString(payload.session_id);
  if (!anonymousId || !sessionId) {
    await rejectBatch(supabase, payload, 'missing_identity');
    return json({ error: 'missing_identity' }, 400, cors.headers);
  }

  const anonymousUserIdHash = await hashAnonymousId(anonymousId);
  const context = safeJson(payload.context);
  const device = safeJson(context.device);
  const route = safeString(context.route);
  const resourceId = safeString(context.resource_id);
  const validRows = [];
  const rejected = [];

  for (const event of events) {
    const reason = validateEvent(event);
    if (reason || !isRecord(event)) {
      rejected.push({
        source_app: safeString(payload.source_app, 'unknown'),
        session_id: sessionId,
        reason: reason ?? 'invalid_event',
        payload: isRecord(event) ? event : { event }
      });
      continue;
    }

    const properties = safeJson(event.properties);
    validRows.push({
      event_id: safeString(event.event_id),
      event_name: safeString(event.name),
      event_version: safeInt(event.event_version),
      schema_version: safeString(payload.schema_version, 'analytics.v1'),
      source_app: safeString(payload.source_app, 'metaflow-viewer'),
      anonymous_user_id_hash: anonymousUserIdHash,
      session_id: sessionId,
      page_view_id: safeString(payload.page_view_id),
      replay_id: safeString(payload.replay_id),
      route,
      resource_id: resourceId,
      occurred_at: safeString(event.occurred_at),
      app_version: safeString(context.app_version),
      release_display_version: safeString(context.release_display_version),
      git_ref: safeString(context.git_ref),
      context,
      device,
      properties,
      sampling_rate: typeof properties.sample_rate === 'number' ? properties.sample_rate : null
    });
  }

  if (validRows.length) {
    const { error } = await supabase
      .schema('analytics')
      .from('events_raw')
      .upsert(validRows, {
        onConflict: 'event_id,occurred_at',
        ignoreDuplicates: true
      });
    if (error) {
      await rejectBatch(supabase, payload, `insert_failed:${error.code}`);
      return json({ error: 'insert_failed', detail: error.message }, 500, cors.headers);
    }
  }

  let replayChunkCount = 0;
  for (const chunk of replayChunks) {
    if (!isRecord(chunk)) continue;
    const replayId = safeString(chunk.replay_id);
    const chunkId = safeString(chunk.chunk_id);
    const chunkEvents = Array.isArray(chunk.events) ? chunk.events : [];
    if (!replayId || !chunkId || !chunkEvents.length) continue;

    const storagePath = [
      safeSegment(sessionId),
      safeSegment(replayId),
      `${safeSegment(chunkId)}.json`
    ].join('/');
    const chunkBody = JSON.stringify({
      replay_id: replayId,
      chunk_id: chunkId,
      session_id: sessionId,
      page_view_id: safeString(payload.page_view_id),
      occurred_at: safeString(chunk.occurred_at),
      events: chunkEvents
    });

    const upload = await supabase.storage
      .from(REPLAY_BUCKET)
      .upload(storagePath, chunkBody, {
        contentType: 'application/json',
        upsert: true
      });
    if (upload.error) {
      rejected.push({
        source_app: safeString(payload.source_app, 'unknown'),
        session_id: sessionId,
        reason: `replay_upload_failed:${upload.error.message}`,
        payload: { replay_id: replayId, chunk_id: chunkId }
      });
      continue;
    }

    const { error } = await supabase.schema('analytics').from('replay_chunks').upsert({
      replay_id: replayId,
      chunk_id: chunkId,
      session_id: sessionId,
      page_view_id: safeString(payload.page_view_id),
      anonymous_user_id_hash: anonymousUserIdHash,
      storage_bucket: REPLAY_BUCKET,
      storage_path: storagePath,
      event_count: chunkEvents.length,
      occurred_at: safeString(chunk.occurred_at, new Date().toISOString())
    });
    if (!error) replayChunkCount++;
  }

  if (rejected.length) {
    await supabase.schema('analytics').from('events_rejected').insert(rejected);
  }

  return json({
    ok: true,
    accepted_events: validRows.length,
    rejected_events: rejected.length,
    replay_chunks: replayChunkCount
  }, 200, cors.headers);
});
