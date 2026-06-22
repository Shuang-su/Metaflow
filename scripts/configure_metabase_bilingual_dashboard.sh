#!/usr/bin/env bash
set -euo pipefail

export LC_ALL=C.UTF-8
export LANG=C.UTF-8

BASE_DIR=${METAFLOW_METABASE_DIR:-/opt/metaflow-metabase}
ADMIN_ENV="$BASE_DIR/metabase-admin.env"
PAGE_DIR="$BASE_DIR/dashboard-shell"
IDS_ENV="$BASE_DIR/dashboard-shell/dashboard-ids.env"
SITE_URL=${METAFLOW_DASHBOARD_SITE_URL:-https://dashboard.metaflow.shuang-su.com}
DOMAIN=${METAFLOW_DASHBOARD_DOMAIN:-dashboard.metaflow.shuang-su.com}
METABASE_LOCAL_URL=${METABASE_LOCAL_URL:-http://127.0.0.1:3000}
CADDY_CONF=${METAFLOW_CADDYFILE:-$BASE_DIR/caddy/Caddyfile}
CADDY_DATA_DIR=${METAFLOW_CADDY_DATA_DIR:-$BASE_DIR/caddy/data}
CADDY_CONTAINER=${METAFLOW_CADDY_CONTAINER:-metaflow-metabase-caddy}
CADDY_PAGE_DIR="$CADDY_DATA_DIR/dashboard-shell"
CADDY_CONTAINER_PAGE_DIR=${METAFLOW_CADDY_CONTAINER_PAGE_DIR:-/data/dashboard-shell}

if [ -f "$ADMIN_ENV" ]; then
  set -a
  set +u
  # shellcheck disable=SC1090
  . "$ADMIN_ENV"
  set -u
  set +a
else
  echo "__MB_ADMIN_ENV_MISSING__ $ADMIN_ENV"
  exit 2
fi

mkdir -p "$PAGE_DIR"

python3 - <<'PY'
from __future__ import print_function
import json
import os
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("METABASE_LOCAL_URL", "http://127.0.0.1:3000")
SITE_URL = os.environ.get("METAFLOW_DASHBOARD_SITE_URL", "https://dashboard.metaflow.shuang-su.com")
COLLECTION_NAME = "Metaflow Analytics"
EN_DASHBOARD_NAME = "Metaflow Usage Overview"
ZH_DASHBOARD_NAME = "Metaflow 使用总览"
IDS_ENV = os.path.join(os.environ.get("METAFLOW_METABASE_DIR", "/opt/metaflow-metabase"), "dashboard-shell", "dashboard-ids.env")

CRED_PAIRS = [
    ("MB_ADMIN_EMAIL", "MB_ADMIN_PASSWORD"),
    ("METABASE_ADMIN_EMAIL", "METABASE_ADMIN_PASSWORD"),
    ("METABASE_EMAIL", "METABASE_PASSWORD"),
    ("ADMIN_EMAIL", "ADMIN_PASSWORD"),
    ("MB_EMAIL", "MB_PASSWORD"),
]

email = None
password = None
for ekey, pkey in CRED_PAIRS:
    if os.environ.get(ekey) and os.environ.get(pkey):
        email = os.environ.get(ekey)
        password = os.environ.get(pkey)
        break

if not email or not password:
    print("__MB_ADMIN_ENV_MISSING__ checked=" + ",".join(a + "/" + b for a, b in CRED_PAIRS))
    sys.exit(2)

session_id = None


def headers():
    result = {"Content-Type": "application/json"}
    if session_id:
        result["X-Metabase-Session"] = session_id
    return result


def api(method, path, payload=None, ok=(200, 201, 202, 204)):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    req = urllib.request.Request(BASE + path, data=data, headers=headers(), method=method)
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            body = resp.read().decode("utf-8", "replace")
            if resp.status not in ok:
                raise RuntimeError("HTTP %s %s %s" % (resp.status, path, body[:500]))
            if not body:
                return None
            try:
                return json.loads(body)
            except Exception:
                return body
    except urllib.error.HTTPError as exc:
        body = exc.read().decode("utf-8", "replace")
        raise RuntimeError("HTTP %s %s %s" % (exc.code, path, body[:1000]))


login = api("POST", "/api/session", {"username": email, "password": password})
session_id = login.get("id") if isinstance(login, dict) else None
if not session_id:
    print("__MB_LOGIN_FAILED__")
    sys.exit(3)
print("__MB_LOGIN_OK__")

try:
    api("PUT", "/api/setting/site-url", {"value": SITE_URL})
except Exception as exc:
    print("__SITE_URL_WARN__ " + str(exc)[:220])

try:
    props = api("GET", "/api/session/properties")
    locales = props.get("available-locales") if isinstance(props, dict) else []
    candidates = ["zh_CN", "zh", "zh-Hans", "zh_Hans", "zh-CN"]
    selected_locale = None
    for locale in candidates:
        if locales and locale not in locales:
            continue
        try:
            api("PUT", "/api/setting/site-locale", {"value": locale})
            selected_locale = locale
            break
        except Exception:
            pass
    if selected_locale:
        print("__SITE_LOCALE__ " + selected_locale)
    else:
        print("__SITE_LOCALE_WARN__ no accepted zh locale")
except Exception as exc:
    print("__SITE_LOCALE_WARN__ " + str(exc)[:220])


def database_id():
    dbs = api("GET", "/api/database")
    if isinstance(dbs, dict):
        items = dbs.get("data") or dbs.get("items") or []
    elif isinstance(dbs, list):
        items = dbs
    else:
        items = []
    for needle in ("metaflow analytics supabase", "supabase", "metaflow"):
        for db in items:
            if needle in (db.get("name") or "").lower():
                print("__DATABASE__ id=%s name=%s" % (db.get("id"), db.get("name")))
                return db["id"]
    if items:
        print("__DATABASE__ id=%s name=%s" % (items[0].get("id"), items[0].get("name")))
        return items[0]["id"]
    print("__NO_DATABASE_FOUND__")
    sys.exit(4)


db_id = database_id()

COMMON_TEMPLATE_TAGS = {
    "start_date": {"name": "start_date", "display-name": "Start date", "type": "date", "required": False},
    "end_date": {"name": "end_date", "display-name": "End date", "type": "date", "required": False},
    "route": {"name": "route", "display-name": "Route", "type": "text", "required": False},
    "device_class": {"name": "device_class", "display-name": "Device class", "type": "text", "required": False},
    "renderer": {"name": "renderer", "display-name": "Renderer", "type": "text", "required": False},
    "source": {"name": "source", "display-name": "Source", "type": "text", "required": False},
}

DASHBOARD_PARAMETERS = [
    {"id": "start_date", "name": "Start date", "slug": "start_date", "type": "date/single", "sectionId": "date"},
    {"id": "end_date", "name": "End date", "slug": "end_date", "type": "date/single", "sectionId": "date"},
    {"id": "route", "name": "Route", "slug": "route", "type": "category", "sectionId": "location"},
    {"id": "device_class", "name": "Device class", "slug": "device_class", "type": "category", "sectionId": "location"},
    {"id": "renderer", "name": "Renderer", "slug": "renderer", "type": "category", "sectionId": "location"},
    {"id": "source", "name": "Source", "slug": "source", "type": "category", "sectionId": "location"},
]


def template_tags_for_sql(sql):
    return {
        key: dict(value, id=key)
        for key, value in COMMON_TEMPLATE_TAGS.items()
        if "{{%s}}" % key in sql
    }


def parameter_mappings_for_card(card_id, sql):
    mappings = []
    for key in template_tags_for_sql(sql):
        mappings.append(
            {
                "parameter_id": key,
                "card_id": card_id,
                "target": ["variable", ["template-tag", key]],
            }
        )
    return mappings


def dataset(sql):
    return api(
        "POST",
        "/api/dataset",
        {
            "database": db_id,
            "type": "native",
            "native": {"query": sql, "template-tags": {}},
        },
    )


try:
    dataset("select analytics.refresh_rollups();")
    print("__ROLLUPS_REFRESHED__")
except Exception as exc:
    print("__ROLLUPS_REFRESH_WARN__ " + str(exc)[:220])

try:
    smoke = dataset(
        "select "
        "(select count(*) from analytics.events_raw) as raw_events, "
        "(select count(*) from analytics.fact_page_views) as page_views, "
        "(select count(*) from analytics.fact_sessions) as sessions"
    )
    rows = (((smoke or {}).get("data") or {}).get("rows") or [])
    print("__DATA_SMOKE__ " + json.dumps(rows[:1], ensure_ascii=False))
except Exception as exc:
    print("__DATA_SMOKE_WARN__ " + str(exc)[:220])


def list_collections():
    data = api("GET", "/api/collection")
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        return data.get("data") or data.get("items") or []
    return []


collection_id = None
for collection in list_collections():
    if collection.get("name") == COLLECTION_NAME:
        collection_id = collection.get("id")
        break
if collection_id is None:
    created_collection = api(
        "POST",
        "/api/collection",
        {
            "name": COLLECTION_NAME,
            "description": "Metaflow analytics dashboards and saved questions",
            "color": "#509EE3",
        },
    )
    collection_id = created_collection.get("id")
print("__COLLECTION__ id=%s name=%s" % (collection_id, COLLECTION_NAME))


def search(q):
    try:
        result = api("GET", "/api/search?q=" + urllib.parse.quote(q))
    except Exception:
        return []
    if isinstance(result, dict):
        return result.get("data") or []
    if isinstance(result, list):
        return result
    return []


def find_entity(q, model):
    for item in search(q):
        name = item.get("name") or item.get("model_name") or ""
        item_model = item.get("model") or item.get("type") or ""
        if name == q and (not model or item_model == model or model in item_model):
            return item.get("id")
    return None


def make_card(spec):
    name = spec["name"]
    payload = {
        "name": name,
        "description": spec.get("description", ""),
        "collection_id": collection_id,
        "display": spec["display"],
        "dataset_query": {
            "database": db_id,
            "type": "native",
            "native": {"query": spec["sql"], "template-tags": template_tags_for_sql(spec["sql"])},
        },
        "visualization_settings": spec.get("viz") or {},
        "parameters": [],
    }
    existing = find_entity(name, "card")
    if existing:
        try:
            api("PUT", "/api/card/%s" % existing, payload)
            print("__CARD_UPDATED__ id=%s name=%s" % (existing, name))
        except Exception as exc:
            print("__CARD_UPDATE_WARN__ id=%s name=%s error=%s" % (existing, name, str(exc)[:220]))
        return existing
    created = api("POST", "/api/card", payload)
    cid = created.get("id")
    print("__CARD_CREATED__ id=%s name=%s" % (cid, name))
    return cid


def q(sql):
    return " ".join(line.strip() for line in sql.strip().splitlines() if line.strip())


VIZ_DAILY_USAGE = {
    "graph.dimensions": ["metric_date"],
    "graph.metrics": ["page_views", "active_users", "new_users", "returning_users", "engaged_sessions"],
}
VIZ_HOURLY_USAGE = {
    "graph.dimensions": ["hour_of_day"],
    "graph.metrics": ["today_page_views", "yesterday_page_views", "today_cumulative", "yesterday_cumulative"],
}
VIZ_HOURLY_PROFILE = {
    "graph.dimensions": ["hour_of_day"],
    "graph.metrics": ["page_views", "unique_users", "engaged_sessions"],
}
VIZ_DURATION_BAR = {"graph.dimensions": ["duration_bucket"], "graph.metrics": ["sessions", "unique_users"]}
VIZ_SOURCE_BAR = {"graph.dimensions": ["source"], "graph.metrics": ["unique_users"]}
VIZ_SOURCE_TREND = {
    "graph.dimensions": ["metric_date"],
    "graph.metrics": ["direct_users", "internal_users", "referral_users", "utm_users"],
}
VIZ_DEVICE_BAR = {"graph.dimensions": ["device_class"], "graph.metrics": ["page_views", "sessions", "unique_users"]}
VIZ_OS_BAR = {"graph.dimensions": ["os"], "graph.metrics": ["unique_users"]}
VIZ_DEVICE_COVERAGE = {"graph.dimensions": ["coverage_status"], "graph.metrics": ["unique_users", "page_views"]}
VIZ_DEVICE_QUALITY = {"graph.dimensions": ["device_model_display"], "graph.metrics": ["load_failure_pct", "avg_p95_ttf_ms", "errors"]}
VIZ_GOAL_BAR = {"graph.dimensions": ["goal_name"], "graph.metrics": ["goal_sessions", "session_conversion_pct"]}
VIZ_INTERACTION_BAR = {"graph.dimensions": ["target"], "graph.metrics": ["interactions"]}
VIZ_QUALITY_LINE = {
    "graph.dimensions": ["metric_date"],
    "graph.metrics": ["raw_events", "rejected_events", "heartbeat_coverage_pct", "first_frame_pct", "rejected_pct"],
}

COMMON_SQL = {
    "focus_metrics": q("""
        with periods as (
            select 'current' as period, current_date - interval '30 days' as start_date, current_date as end_date
            union all
            select 'previous', current_date - interval '60 days', current_date - interval '30 days'
        ),
        wide as (
            select
                p.period,
                coalesce(sum(k.page_views), 0) as page_views,
                coalesce(sum(k.active_users), 0) as unique_users,
                coalesce(sum(k.new_users), 0) as new_users,
                coalesce(sum(k.returning_users), 0) as returning_users,
                coalesce(sum(k.sessions), 0) as sessions,
                coalesce(sum(k.engaged_sessions), 0) as engaged_sessions,
                coalesce(sum(k.bounces), 0) as bounces,
                round(avg(k.avg_duration_seconds) filter (where k.avg_duration_seconds is not null), 1) as avg_duration_seconds,
                coalesce(sum(k.load_attempts), 0) as load_attempts,
                coalesce(sum(k.first_frame_ready), 0) as first_frame_ready,
                round(avg(k.p95_ttf_ms) filter (where k.p95_ttf_ms is not null), 0) as p95_ttf_ms,
                coalesce(sum(k.errors), 0) as errors,
                coalesce(sum(k.error_sessions), 0) as error_sessions,
                case when coalesce(sum(k.sessions), 0) > 0
                    then sum(k.engaged_sessions)::numeric / sum(k.sessions)
                end as engaged_rate,
                case when coalesce(sum(k.sessions), 0) > 0
                    then sum(k.bounces)::numeric / sum(k.sessions)
                end as bounce_rate,
                case when coalesce(sum(k.load_attempts), 0) > 0
                    then sum(k.first_frame_ready)::numeric / sum(k.load_attempts)
                end as first_frame_rate
            from periods p
            left join analytics.daily_kpi_metrics k
                on k.metric_date >= p.start_date::date
                and k.metric_date < p.end_date::date
            group by p.period
        ),
        metric_rows as (
            select 'PV' as metric, page_views::numeric as current_value from wide where period = 'current'
            union all select 'UV', unique_users::numeric from wide where period = 'current'
            union all select 'Sessions', sessions::numeric from wide where period = 'current'
            union all select 'New users', new_users::numeric from wide where period = 'current'
            union all select 'Returning users', returning_users::numeric from wide where period = 'current'
            union all select 'Engaged rate %', round(engaged_rate * 100, 1) from wide where period = 'current'
            union all select 'Avg duration s', avg_duration_seconds from wide where period = 'current'
            union all select 'Bounce rate %', round(bounce_rate * 100, 1) from wide where period = 'current'
            union all select 'First-frame rate %', round(first_frame_rate * 100, 1) from wide where period = 'current'
            union all select 'P95 first-frame ms', round(p95_ttf_ms::numeric, 0) from wide where period = 'current'
            union all select 'Error sessions', error_sessions::numeric from wide where period = 'current'
        ),
        previous_rows as (
            select 'PV' as metric, page_views::numeric as previous_value from wide where period = 'previous'
            union all select 'UV', unique_users::numeric from wide where period = 'previous'
            union all select 'Sessions', sessions::numeric from wide where period = 'previous'
            union all select 'New users', new_users::numeric from wide where period = 'previous'
            union all select 'Returning users', returning_users::numeric from wide where period = 'previous'
            union all select 'Engaged rate %', round(engaged_rate * 100, 1) from wide where period = 'previous'
            union all select 'Avg duration s', avg_duration_seconds from wide where period = 'previous'
            union all select 'Bounce rate %', round(bounce_rate * 100, 1) from wide where period = 'previous'
            union all select 'First-frame rate %', round(first_frame_rate * 100, 1) from wide where period = 'previous'
            union all select 'P95 first-frame ms', round(p95_ttf_ms::numeric, 0) from wide where period = 'previous'
            union all select 'Error sessions', error_sessions::numeric from wide where period = 'previous'
        )
        select
            m.metric,
            m.current_value,
            p.previous_value,
            case when p.previous_value is not null and p.previous_value <> 0
                then round((m.current_value - p.previous_value) * 100 / p.previous_value, 1)
                else null
            end as change_pct
        from metric_rows m
        left join previous_rows p using (metric)
    """),
    "hourly_usage": q("""
        with hours as (
            select generate_series(0, 23) as hour_of_day
        ),
        by_hour as (
            select
                hour_of_day,
                sum(page_views) filter (where metric_date = current_date) as today_page_views,
                sum(page_views) filter (where metric_date = current_date - interval '1 day') as yesterday_page_views
            from analytics.hourly_usage_metrics
            where metric_date in (current_date, current_date - interval '1 day')
            group by hour_of_day
        )
        select
            h.hour_of_day,
            coalesce(b.today_page_views, 0) as today_page_views,
            coalesce(b.yesterday_page_views, 0) as yesterday_page_views,
            sum(coalesce(b.today_page_views, 0)) over (order by h.hour_of_day) as today_cumulative,
            sum(coalesce(b.yesterday_page_views, 0)) over (order by h.hour_of_day) as yesterday_cumulative
        from hours h
        left join by_hour b using (hour_of_day)
        order by h.hour_of_day
    """),
    "data_freshness": q("""
        select
            metric_date,
            latest_event_received_at,
            latest_event_occurred_at,
            latest_page_view_received_at,
            raw_events_24h,
            page_views_24h,
            round(extract(epoch from (now() - latest_event_received_at)) / 60, 1) as event_lag_minutes
        from analytics.daily_dashboard_freshness_metrics
        order by metric_date desc
        limit 1
    """),
    "metric_definitions": q("""
        select
            metric,
            title,
            definition,
            calculation,
            unit
        from analytics.metric_definitions
        order by metric
    """),
    "retention_summary": q("""
        select
            concat('D', day_number) as retention_day,
            sum(cohort_users) as cohort_users,
            sum(retained_users) as retained_users,
            round(sum(retained_users)::numeric * 100 / nullif(sum(cohort_users), 0), 1) as retention_pct
        from analytics.daily_retention_cohorts
        where cohort_date >= current_date - interval '60 days'
            and day_number in (1, 7, 30)
        [[and cohort_date >= {{start_date}}]]
        [[and cohort_date <= {{end_date}}]]
        group by day_number
        order by day_number
    """),
    "duration_distribution": q("""
        select
            duration_bucket,
            bucket_sort,
            sum(sessions) as sessions,
            sum(unique_users) as unique_users,
            round(sum(sessions)::numeric * 100 / nullif(sum(sum(sessions)) over (), 0), 1) as session_share_pct,
            round(sum(engaged_sessions)::numeric * 100 / nullif(sum(sessions), 0), 1) as engaged_pct
        from analytics.daily_session_duration_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        group by duration_bucket, bucket_sort
        order by bucket_sort
    """),
    "hourly_profile": q("""
        select
            hour_of_day,
            sum(page_views) as page_views,
            sum(unique_users) as unique_users,
            sum(sessions) as sessions,
            sum(engaged_sessions) as engaged_sessions,
            sum(load_failures) as load_failures,
            sum(client_errors) as client_errors,
            round(sum(page_views)::numeric * 100 / nullif(sum(sum(page_views)) over (), 0), 1) as page_view_share_pct
        from analytics.daily_hourly_profile_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        group by hour_of_day
        order by hour_of_day
    """),
    "daily_usage": q("""
        with sessions as (
            select
                session_started_at::date as metric_date,
                count(*) filter (where engaged_session) as engaged_sessions
            from analytics.fact_sessions
            where session_started_at >= current_date - interval '30 days'
            group by 1
        )
        select
            u.metric_date,
            u.page_views,
            u.sessions,
            u.active_users,
            u.new_users,
            u.returning_users,
            coalesce(s.engaged_sessions, 0) as engaged_sessions
        from analytics.daily_user_metrics u
        left join sessions s using (metric_date)
        where u.metric_date >= current_date - interval '30 days'
        [[and u.metric_date >= {{start_date}}]]
        [[and u.metric_date <= {{end_date}}]]
        order by u.metric_date
    """),
    "route_detail": q("""
        with routes as (
            select
                route,
                sum(page_views) as page_views,
                sum(unique_users) as unique_users,
                sum(sessions) as sessions
            from analytics.daily_route_metrics
            where metric_date >= current_date - interval '30 days'
            [[and metric_date >= {{start_date}}]]
            [[and metric_date <= {{end_date}}]]
            [[and route = {{route}}]]
            group by route
        ),
        resources as (
            select
                route,
                sum(load_attempts) as load_attempts,
                sum(loaded_count) as loaded,
                sum(failed_count) as failed,
                round(avg(p95_ttf_ms)::numeric, 0) as p95_ttf_ms
            from analytics.daily_resource_metrics
            where metric_date >= current_date - interval '30 days'
            [[and metric_date >= {{start_date}}]]
            [[and metric_date <= {{end_date}}]]
            [[and route = {{route}}]]
            group by route
        ),
        errors as (
            select route, sum(error_count) as errors
            from analytics.daily_error_metrics
            where metric_date >= current_date - interval '30 days'
            [[and metric_date >= {{start_date}}]]
            [[and metric_date <= {{end_date}}]]
            [[and route = {{route}}]]
            group by route
        ),
        sessions as (
            select
                entry_route as route,
                count(*) filter (where bounce) as bounces,
                count(*) as started_sessions
            from analytics.fact_sessions
            where session_started_at >= now() - interval '30 days'
            [[and session_started_at::date >= {{start_date}}]]
            [[and session_started_at::date <= {{end_date}}]]
            [[and entry_route = {{route}}]]
            group by entry_route
        )
        select
            r.route,
            r.page_views,
            r.unique_users,
            r.sessions,
            coalesce(res.load_attempts, 0) as load_attempts,
            coalesce(res.loaded, 0) as loaded,
            coalesce(res.failed, 0) as failed,
            case when coalesce(res.load_attempts, 0) > 0
                then round(res.loaded * 100.0 / res.load_attempts, 1)
            end as first_frame_pct,
            res.p95_ttf_ms,
            coalesce(e.errors, 0) as errors,
            case when coalesce(s.started_sessions, 0) > 0
                then round(s.bounces * 100.0 / s.started_sessions, 1)
            end as bounce_pct
        from routes r
        left join resources res using (route)
        left join errors e using (route)
        left join sessions s using (route)
        order by r.page_views desc
        limit 30
    """),
    "resource_quality": q("""
        select
            coalesce(resource_id, '(unknown)') as resource_id,
            route,
            sum(load_attempts) as load_attempts,
            sum(loaded_count) as loaded,
            sum(failed_count) as failed,
            sum(abandoned_count) as abandoned,
            round(avg(p50_ttf_ms)::numeric, 0) as avg_p50_ttf_ms,
            round(avg(p95_ttf_ms)::numeric, 0) as avg_p95_ttf_ms
        from analytics.daily_resource_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and route = {{route}}]]
        group by resource_id, route
        order by load_attempts desc
        limit 20
    """),
    "retention_matrix": q("""
        select
            cohort_date,
            max(cohort_users) as cohort_users,
            round(max(retention_rate) filter (where day_number = 0) * 100, 1) as d0_pct,
            round(max(retention_rate) filter (where day_number = 1) * 100, 1) as d1_pct,
            round(max(retention_rate) filter (where day_number = 2) * 100, 1) as d2_pct,
            round(max(retention_rate) filter (where day_number = 3) * 100, 1) as d3_pct,
            round(max(retention_rate) filter (where day_number = 4) * 100, 1) as d4_pct,
            round(max(retention_rate) filter (where day_number = 5) * 100, 1) as d5_pct,
            round(max(retention_rate) filter (where day_number = 6) * 100, 1) as d6_pct,
            round(max(retention_rate) filter (where day_number = 7) * 100, 1) as d7_pct
        from analytics.daily_retention_cohorts
        where cohort_date >= current_date - interval '14 days'
        [[and cohort_date >= {{start_date}}]]
        [[and cohort_date <= {{end_date}}]]
        group by cohort_date
        order by cohort_date desc
    """),
    "source_top": q("""
        select
            case
                when channel_group = 'utm' then concat('utm:', utm_source, '/', utm_medium)
                when channel_group = 'direct' then '(direct)'
                when channel_group = 'internal' then 'internal'
                else referrer_domain
            end as source,
            sum(unique_users) as unique_users,
            sum(page_views) as page_views,
            round(sum(unique_users * unique_user_share)::numeric / nullif(sum(unique_users), 0) * 100, 1) as avg_share_pct
        from analytics.daily_acquisition_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and (channel_group = {{source}} or referrer_domain = {{source}} or utm_source = {{source}})]]
        group by 1
        order by unique_users desc
        limit 8
    """),
    "source_trend": q("""
        select
            metric_date,
            sum(unique_users) filter (where channel_group = 'direct') as direct_users,
            sum(unique_users) filter (where channel_group = 'internal') as internal_users,
            sum(unique_users) filter (where channel_group = 'referral') as referral_users,
            sum(unique_users) filter (where channel_group = 'utm') as utm_users
        from analytics.daily_acquisition_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and (channel_group = {{source}} or referrer_domain = {{source}} or utm_source = {{source}})]]
        group by metric_date
        order by metric_date
    """),
    "source_detail": q("""
        select
            channel_group,
            referrer_domain,
            utm_source,
            utm_medium,
            sum(unique_users) as unique_users,
            sum(page_views) as page_views,
            sum(sessions) as sessions,
            sum(new_users) as new_users,
            sum(returning_users) as returning_users,
            round(sum(unique_users * unique_user_share)::numeric / nullif(sum(unique_users), 0) * 100, 1) as avg_share_pct,
            round(sum(returning_users)::numeric * 100 / nullif(sum(unique_users), 0), 1) as returning_user_pct,
            round(sum(first_frame_ready)::numeric * 100 / nullif(sum(page_views), 0), 1) as first_frame_pct
        from analytics.daily_acquisition_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and (channel_group = {{source}} or referrer_domain = {{source}} or utm_source = {{source}})]]
        group by channel_group, referrer_domain, utm_source, utm_medium
        order by unique_users desc
        limit 30
    """),
    "device_class": q("""
        select
            coalesce(device_class, '(unknown)') as device_class,
            sum(page_views) as page_views,
            sum(unique_users) as unique_users,
            sum(sessions) as sessions
        from analytics.daily_device_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and device_class = {{device_class}}]]
        [[and renderer = {{renderer}}]]
        group by device_class
        order by page_views desc
    """),
    "device_os": q("""
        select
            os,
            browser,
            device_class,
            sum(unique_users) as unique_users,
            sum(page_views) as page_views,
            sum(sessions) as sessions
        from analytics.daily_device_model_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and device_class = {{device_class}}]]
        [[and renderer = {{renderer}}]]
        group by os, browser, device_class
        order by unique_users desc
        limit 20
    """),
    "device_models": q("""
        select
            device_model_display,
            coalesce(device_model_raw, '') as raw_model_code,
            coalesce(marketing_name, '') as marketing_name,
            coalesce(device_model_source, 'none') as model_source,
            coalesce(device_model_confidence, '') as model_confidence,
            os,
            browser,
            device_class,
            renderer,
            viewport_bucket,
            device_pixel_ratio,
            bool_or(exact_model_available) as exact_model_available,
            sum(unique_users) as unique_users,
            sum(page_views) as page_views,
            round(sum(unique_users)::numeric * 100 / nullif(sum(sum(unique_users)) over (), 0), 1) as user_share_pct,
            round(sum(first_frame_ready)::numeric * 100 / nullif(sum(page_views), 0), 1) as first_frame_pct,
            round(avg(p95_ttf_ms)::numeric, 0) as avg_p95_ttf_ms,
            sum(errors) as errors
        from analytics.daily_device_model_metrics
        where metric_date >= current_date - interval '30 days'
            and device_class in ('mobile', 'tablet')
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and device_class = {{device_class}}]]
        [[and renderer = {{renderer}}]]
        group by
            device_model_display,
            device_model_raw,
            marketing_name,
            device_model_source,
            device_model_confidence,
            os,
            browser,
            device_class,
            renderer,
            viewport_bucket,
            device_pixel_ratio
        order by unique_users desc
        limit 30
    """),
    "device_model_coverage": q("""
        select
            case when exact_model_available then 'exact model' else 'unknown / family only' end as coverage_status,
            coalesce(device_model_source, 'none') as model_source,
            sum(unique_users) as unique_users,
            sum(page_views) as page_views,
            round(sum(unique_users)::numeric * 100 / nullif(sum(sum(unique_users)) over (), 0), 1) as user_share_pct,
            round(sum(page_views)::numeric * 100 / nullif(sum(sum(page_views)) over (), 0), 1) as page_view_share_pct
        from analytics.daily_device_model_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and device_class = {{device_class}}]]
        [[and renderer = {{renderer}}]]
        group by coverage_status, model_source
        order by unique_users desc
    """),
    "device_quality_ranking": q("""
        select
            device_model_display,
            coalesce(device_model_raw, '') as raw_model_code,
            os,
            browser,
            device_class,
            renderer,
            sum(unique_users) as unique_users,
            sum(page_views) as page_views,
            round(sum(first_frame_ready)::numeric * 100 / nullif(sum(page_views), 0), 1) as first_frame_pct,
            round(sum(load_failures)::numeric * 100 / nullif(sum(page_views), 0), 1) as load_failure_pct,
            round(avg(p95_ttf_ms)::numeric, 0) as avg_p95_ttf_ms,
            sum(errors) as errors
        from analytics.daily_device_model_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and device_class = {{device_class}}]]
        [[and renderer = {{renderer}}]]
        group by device_model_display, device_model_raw, os, browser, device_class, renderer
        order by load_failure_pct desc nulls last, avg_p95_ttf_ms desc nulls last, errors desc
        limit 30
    """),
    "device_renderer_matrix": q("""
        select
            device_model_display,
            coalesce(device_model_raw, '') as raw_model_code,
            renderer,
            os,
            browser,
            sum(unique_users) as unique_users,
            sum(page_views) as page_views,
            round(sum(first_frame_ready)::numeric * 100 / nullif(sum(page_views), 0), 1) as first_frame_pct,
            round(avg(p95_ttf_ms)::numeric, 0) as avg_p95_ttf_ms,
            sum(load_failures) as load_failures,
            sum(errors) as errors
        from analytics.daily_device_model_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and device_class = {{device_class}}]]
        [[and renderer = {{renderer}}]]
        group by device_model_display, device_model_raw, renderer, os, browser
        order by device_model_display, renderer
        limit 50
    """),
    "renderer_quality": q("""
        select
            renderer,
            os,
            browser,
            sum(page_views) as page_views,
            sum(unique_users) as unique_users,
            round(sum(first_frame_ready)::numeric * 100 / nullif(sum(page_views), 0), 1) as first_frame_pct,
            sum(load_failures) as load_failures,
            sum(errors) as errors,
            round(avg(p95_ttf_ms)::numeric, 0) as avg_p95_ttf_ms
        from analytics.daily_device_model_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and device_class = {{device_class}}]]
        [[and renderer = {{renderer}}]]
        group by renderer, os, browser
        order by page_views desc
        limit 30
    """),
    "goal_conversion": q("""
        select
            goal_name,
            channel_group,
            route,
            sum(goal_events) as goal_events,
            sum(goal_sessions) as goal_sessions,
            sum(goal_users) as goal_users,
            sum(total_sessions) as total_sessions,
            round(sum(goal_sessions)::numeric * 100 / nullif(sum(total_sessions), 0), 1) as session_conversion_pct,
            round(sum(goal_users)::numeric * 100 / nullif(sum(total_users), 0), 1) as user_conversion_pct
        from analytics.daily_goal_conversion_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        [[and route = {{route}}]]
        [[and channel_group = {{source}}]]
        group by goal_name, channel_group, route
        order by goal_sessions desc, goal_events desc
        limit 30
    """),
    "errors": q("""
        with errors as (
            select
                metric_date,
                route,
                coalesce(error_name, '(unknown)') as error_name,
                error_count,
                affected_sessions
            from analytics.daily_error_metrics
            where metric_date >= current_date - interval '30 days'
            [[and metric_date >= {{start_date}}]]
            [[and metric_date <= {{end_date}}]]
            [[and route = {{route}}]]
            order by metric_date desc, error_count desc
            limit 30
        )
        select * from errors
        union all
        select current_date as metric_date, '(all routes)' as route, 'No errors in selected window' as error_name, 0, 0
        where not exists (select 1 from errors)
    """),
    "quality": q("""
        select
            metric_date,
            raw_events,
            rejected_events,
            page_view_events,
            heartbeat_events,
            round(heartbeat_coverage_rate * 100, 1) as heartbeat_coverage_pct,
            round(first_frame_rate * 100, 1) as first_frame_pct,
            round(rejected_rate * 100, 2) as rejected_pct
        from analytics.daily_data_quality_metrics
        where metric_date >= current_date - interval '30 days'
        [[and metric_date >= {{start_date}}]]
        [[and metric_date <= {{end_date}}]]
        order by metric_date
    """),
    "interactions": q("""
        select
            event_name,
            coalesce(element_id, action, setting, camera_mode, '(unknown)') as target,
            count(*) as interactions,
            count(distinct session_id) as sessions
        from analytics.fact_interactions
        where occurred_at >= now() - interval '30 days'
        [[and occurred_at::date >= {{start_date}}]]
        [[and occurred_at::date <= {{end_date}}]]
        [[and route = {{route}}]]
        group by event_name, target
        order by interactions desc
        limit 20
    """),
    "sessions_review": q("""
        select
            session_id,
            anonymous_user_id_hash,
            session_started_at,
            last_seen_at,
            duration_seconds,
            event_count,
            heartbeat_count,
            first_frame_ready,
            had_interaction,
            engaged_session,
            bounce,
            entry_route,
            exit_route
        from analytics.fact_sessions
        where session_started_at >= now() - interval '30 days'
            [[and session_started_at::date >= {{start_date}}]]
            [[and session_started_at::date <= {{end_date}}]]
            [[and (entry_route = {{route}} or exit_route = {{route}})]]
            and (bounce or not first_frame_ready or heartbeat_count = 0 or duration_seconds >= 60)
        order by session_started_at desc
        limit 30
    """),
}


def spec(name, desc, display, sql_key, col, row, sx, sy, viz=None):
    return {
        "name": name,
        "description": desc,
        "display": display,
        "sql": COMMON_SQL[sql_key],
        "col": col,
        "row": row,
        "sx": sx,
        "sy": sy,
        "viz": viz,
    }


EN_SPECS = [
    spec("Metaflow Focus Metrics", "Current 30-day focus metrics with previous-period comparison.", "table", "focus_metrics", 0, 0, 12, 4),
    spec("Metaflow Data Freshness", "Latest event arrival and 24-hour raw/page-view volume.", "table", "data_freshness", 12, 0, 6, 4),
    spec("Metaflow Today vs Yesterday By Hour", "Hourly and cumulative page views for today compared with yesterday.", "bar", "hourly_usage", 0, 4, 12, 5, VIZ_HOURLY_USAGE),
    spec("Metaflow Visit Hour Profile", "Typical visit volume by hour of day.", "bar", "hourly_profile", 12, 4, 6, 5, VIZ_HOURLY_PROFILE),
    spec("Metaflow Daily Usage Trend", "Daily page views, active users, new users, returning users, and engaged sessions.", "line", "daily_usage", 0, 9, 12, 5, VIZ_DAILY_USAGE),
    spec("Metaflow Route Visit Detail", "Route-level visits, load success, p95 first frame, errors, and bounce.", "table", "route_detail", 12, 9, 6, 5),
    spec("Metaflow Retention Cohorts", "D0-D7 anonymous-user retention cohorts.", "table", "retention_matrix", 0, 14, 12, 5),
    spec("Metaflow Retention Summary", "D1, D7, and D30 retention summary.", "table", "retention_summary", 12, 14, 6, 5),
    spec("Metaflow Source Top", "Top acquisition sources by unique users.", "bar", "source_top", 0, 19, 6, 4, VIZ_SOURCE_BAR),
    spec("Metaflow Source Trend", "Daily acquisition source trend.", "line", "source_trend", 6, 19, 6, 4, VIZ_SOURCE_TREND),
    spec("Metaflow Source Detail", "Acquisition source share, new/returning users, and first-frame quality.", "table", "source_detail", 12, 19, 6, 4),
    spec("Metaflow Device Class Mix", "Device class mix with page views, sessions, and users.", "bar", "device_class", 0, 23, 6, 4, VIZ_DEVICE_BAR),
    spec("Metaflow OS And Browser", "OS, browser, and device class mix.", "bar", "device_os", 6, 23, 6, 4, VIZ_OS_BAR),
    spec("Metaflow Device Model Detail", "Trusted raw model code, readable family, OS, browser, renderer, visit share, quality, and errors.", "table", "device_models", 12, 23, 6, 4),
    spec("Metaflow Device Model Coverage", "Exact model coverage and unknown/family-only share by source.", "bar", "device_model_coverage", 0, 27, 6, 4, VIZ_DEVICE_COVERAGE),
    spec("Metaflow Device Quality Ranking", "Devices ranked by first-frame failures, p95 first frame, and errors.", "table", "device_quality_ranking", 6, 27, 6, 4),
    spec("Metaflow Device Renderer Matrix", "Device model by renderer quality comparison.", "table", "device_renderer_matrix", 12, 27, 6, 4),
    spec("Metaflow Renderer Quality", "Renderer, browser, OS, load quality, errors, and p95 first frame.", "table", "renderer_quality", 0, 31, 9, 5),
    spec("Metaflow Resource Load Quality", "Resource load attempts, success, failures, abandonment, and first frame p95.", "table", "resource_quality", 9, 31, 9, 5),
    spec("Metaflow Duration Distribution", "Session duration buckets and engaged share.", "bar", "duration_distribution", 0, 36, 9, 4, VIZ_DURATION_BAR),
    spec("Metaflow Conversion Goals", "Metaflow goal conversion by channel and route.", "bar", "goal_conversion", 9, 36, 9, 4, VIZ_GOAL_BAR),
    spec("Metaflow Data Quality", "Raw events, rejection, heartbeat coverage, first-frame rate.", "line", "quality", 0, 40, 9, 4, VIZ_QUALITY_LINE),
    spec("Metaflow Interaction Top N", "Whitelisted interaction volume.", "bar", "interactions", 9, 40, 9, 4, VIZ_INTERACTION_BAR),
    spec("Metaflow Error Top N", "Client/load/XR/replay errors by route and error.", "table", "errors", 0, 44, 9, 4),
    spec("Metaflow Recent Sessions Needing Review", "Long, failed, or unengaged sessions for diagnostics.", "table", "sessions_review", 9, 44, 9, 5),
    spec("Metaflow Metric Definitions", "KPI definitions, calculations, and units.", "table", "metric_definitions", 0, 49, 18, 4),
]

ZH_SPECS = [
    spec("我关注的数据", "最近 30 天核心指标及较前 30 天变化。", "table", "focus_metrics", 0, 0, 12, 4),
    spec("数据新鲜度", "最新事件时间和近 24 小时原始事件/访问量。", "table", "data_freshness", 12, 0, 6, 4),
    spec("今日小时数据", "今日与昨日的小时访问量和累计访问量。", "bar", "hourly_usage", 0, 4, 12, 5, VIZ_HOURLY_USAGE),
    spec("访问时段画像", "按小时查看典型访问、访客和有效会话分布。", "bar", "hourly_profile", 12, 4, 6, 5, VIZ_HOURLY_PROFILE),
    spec("每日访问趋势", "每日 PV、活跃用户、新用户、回访用户和有效会话。", "line", "daily_usage", 0, 9, 12, 5, VIZ_DAILY_USAGE),
    spec("访问详情", "按 route 查看访问、首帧成功、p95 首帧、错误和跳出。", "table", "route_detail", 12, 9, 6, 5),
    spec("留存热力表", "匿名访问用户 D0-D7 留存 cohort。", "table", "retention_matrix", 0, 14, 12, 5),
    spec("留存摘要 D1/D7/D30", "访问用户 D1、D7、D30 留存摘要。", "table", "retention_summary", 12, 14, 6, 5),
    spec("来源 Top", "按访客数排序的来源 Top。", "bar", "source_top", 0, 19, 6, 4, VIZ_SOURCE_BAR),
    spec("来源趋势", "不同来源渠道的每日访客趋势。", "line", "source_trend", 6, 19, 6, 4, VIZ_SOURCE_TREND),
    spec("来源明细", "来源占比、新访、回访、复访率和首帧成功率。", "table", "source_detail", 12, 19, 6, 4),
    spec("设备类别", "按设备类别统计访问量、会话和用户。", "bar", "device_class", 0, 23, 6, 4, VIZ_DEVICE_BAR),
    spec("OS 与浏览器", "OS、浏览器和设备类别分布。", "bar", "device_os", 6, 23, 6, 4, VIZ_OS_BAR),
    spec("机型明细", "可信 raw code、可读名称、OS、浏览器、renderer、访问占比、首帧质量和错误。", "table", "device_models", 12, 23, 6, 4),
    spec("精确机型覆盖率", "按来源查看 exact model 和 unknown/family-only 占比。", "bar", "device_model_coverage", 0, 27, 6, 4, VIZ_DEVICE_COVERAGE),
    spec("机型质量排行", "按首帧失败率、p95 首帧和错误数排序。", "table", "device_quality_ranking", 6, 27, 6, 4),
    spec("机型 × Renderer", "查看不同机型在不同 renderer 下的质量差异。", "table", "device_renderer_matrix", 12, 27, 6, 4),
    spec("Renderer 质量", "按 renderer、浏览器和 OS 查看加载质量与错误。", "table", "renderer_quality", 0, 31, 9, 5),
    spec("资源加载质量", "资源加载尝试、成功、失败、流失和首帧耗时。", "table", "resource_quality", 9, 31, 9, 5),
    spec("访问时长分布", "按 session 时长分桶查看访问深度和有效会话占比。", "bar", "duration_distribution", 0, 36, 9, 4, VIZ_DURATION_BAR),
    spec("转化目标", "Metaflow 目标转化：首帧、有效会话、注释、全屏、XR 和导航完成。", "bar", "goal_conversion", 9, 36, 9, 4, VIZ_GOAL_BAR),
    spec("数据质量", "事件量、拒收、心跳覆盖率、首帧转化率。", "line", "quality", 0, 40, 9, 4, VIZ_QUALITY_LINE),
    spec("交互 Top N", "白名单交互事件量。", "bar", "interactions", 9, 40, 9, 4, VIZ_INTERACTION_BAR),
    spec("错误 Top N", "前端、加载、XR、回放错误。", "table", "errors", 0, 44, 9, 4),
    spec("需排查会话", "慢加载、错误、无首帧、心跳异常或跳出的会话。", "table", "sessions_review", 9, 44, 9, 5),
    spec("指标口径", "核心 KPI 的定义、计算口径和单位。", "table", "metric_definitions", 0, 49, 18, 4),
]


def ensure_dashboard(name, description, specs):
    card_layout = []
    for card_spec in specs:
        try:
            cid = make_card(card_spec)
            if cid:
                card_layout.append((cid, card_spec["col"], card_spec["row"], card_spec["sx"], card_spec["sy"], card_spec["sql"]))
        except Exception as exc:
            print("__CARD_FAILED__ name=%s error=%s" % (card_spec["name"], str(exc)[:300]))

    dash_id = find_entity(name, "dashboard")
    if not dash_id:
        created = api(
            "POST",
            "/api/dashboard",
            {"name": name, "description": description, "collection_id": collection_id},
        )
        dash_id = created.get("id")
        print("__DASHBOARD_CREATED__ id=%s name=%s" % (dash_id, name))
    else:
        print("__DASHBOARD_EXISTS__ id=%s name=%s" % (dash_id, name))

    existing_cards = []
    try:
        current = api("GET", "/api/dashboard/%s" % dash_id)
        existing_cards = current.get("dashcards") or current.get("ordered_cards") or []
    except Exception as exc:
        print("__DASHBOARD_CURRENT_WARN__ id=%s error=%s" % (dash_id, str(exc)[:220]))

    existing_by_card = {}
    for dashcard in existing_cards:
        card = dashcard.get("card") if isinstance(dashcard.get("card"), dict) else {}
        card_id = dashcard.get("card_id") or dashcard.get("cardId") or card.get("id")
        if card_id:
            existing_by_card[int(card_id)] = dashcard

    cards_payload = []
    temp_id = -1
    for cid, col, row, sx, sy, sql in card_layout:
        existing = existing_by_card.get(int(cid))
        card_item = {
            "id": existing.get("id") if existing else temp_id,
            "card_id": cid,
            "row": row,
            "col": col,
            "size_x": sx,
            "size_y": sy,
            "dashboard_tab_id": existing.get("dashboard_tab_id") if existing else None,
            "action_id": existing.get("action_id") if existing else None,
            "series": existing.get("series", []) if existing else [],
            "parameter_mappings": parameter_mappings_for_card(cid, sql),
            "visualization_settings": existing.get("visualization_settings", {}) if existing else {},
        }
        cards_payload.append(card_item)
        temp_id -= 1

    try:
        api("PUT", "/api/dashboard/%s/cards" % dash_id, {"ordered_tabs": [], "cards": cards_payload})
        print("__DASHBOARD_CARDS_SET__ endpoint=cards id=%s count=%s" % (dash_id, len(cards_payload)))
    except Exception as exc:
        print("__DASHBOARD_PUT_CARDS_WARN__ id=%s error=%s" % (dash_id, str(exc)[:350]))
        try:
            api(
                "PUT",
                "/api/dashboard/%s" % dash_id,
                {
                    "name": name,
                    "description": description,
                    "collection_id": collection_id,
                    "ordered_tabs": [],
                    "dashcards": cards_payload,
                },
            )
            print("__DASHBOARD_CARDS_SET__ endpoint=dashboard id=%s count=%s" % (dash_id, len(cards_payload)))
        except Exception as put_exc:
            print("__DASHBOARD_PUT_DASHBOARD_WARN__ id=%s error=%s" % (dash_id, str(put_exc)[:350]))

    try:
        api(
            "PUT",
            "/api/dashboard/%s" % dash_id,
            {"name": name, "description": description, "collection_id": collection_id, "parameters": DASHBOARD_PARAMETERS},
        )
    except Exception as exc:
        print("__DASHBOARD_UPDATE_WARN__ id=%s error=%s" % (dash_id, str(exc)[:220]))

    try:
        check = api("GET", "/api/dashboard/%s" % dash_id)
        dashcards = check.get("dashcards") or check.get("ordered_cards") or []
        print("__DASHBOARD_READY__ id=%s cards=%s url=%s/dashboard/%s name=%s" % (dash_id, len(dashcards), SITE_URL, dash_id, name))
    except Exception as exc:
        print("__DASHBOARD_CHECK_WARN__ id=%s error=%s" % (dash_id, str(exc)[:220]))
    return dash_id


en_dash_id = ensure_dashboard(
    EN_DASHBOARD_NAME,
    "Metaflow analytics dashboard: usage, content, devices, performance, errors, and data quality.",
    EN_SPECS,
)
zh_dash_id = ensure_dashboard(
    ZH_DASHBOARD_NAME,
    "Metaflow 用户行为分析看板：访问、内容、设备、加载质量、错误和数据质量。",
    ZH_SPECS,
)

with open(IDS_ENV, "w") as fh:
    fh.write("EN_DASH_ID=%s\n" % en_dash_id)
    fh.write("ZH_DASH_ID=%s\n" % zh_dash_id)

print("__BILINGUAL_DASHBOARDS__ zh=%s en=%s" % (zh_dash_id, en_dash_id))
PY

# shellcheck disable=SC1090
. "$IDS_ENV"

cat > "$PAGE_DIR/index.html" <<HTML
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Metaflow Analytics Dashboard</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #111316;
      --panel: #191d22;
      --line: #2b3138;
      --text: #f2f5f7;
      --muted: #98a2ad;
      --accent: #4f8cff;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      background: var(--bg);
      color: var(--text);
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", sans-serif;
    }
    header {
      min-height: 64px;
      padding: 14px 20px;
      border-bottom: 1px solid var(--line);
      background: rgba(17, 19, 22, 0.96);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 16px;
      position: sticky;
      top: 0;
      z-index: 2;
    }
    .brand { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .brand strong { font-size: 17px; font-weight: 650; line-height: 1.2; }
    .brand span { color: var(--muted); font-size: 12px; }
    .actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; justify-content: flex-end; }
    .segmented {
      display: inline-grid;
      grid-template-columns: 1fr 1fr;
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 3px;
    }
    button, a.open-native {
      border: 0;
      border-radius: 6px;
      min-height: 34px;
      padding: 0 12px;
      color: var(--text);
      background: transparent;
      font: inherit;
      font-size: 13px;
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      white-space: nowrap;
    }
    button[aria-pressed="true"] { background: var(--accent); color: white; }
    a.open-native { border: 1px solid var(--line); background: var(--panel); }
    main { height: calc(100vh - 64px); }
    iframe {
      width: 100%;
      height: 100%;
      border: 0;
      background: #111316;
      display: block;
    }
    @media (max-width: 720px) {
      header { align-items: flex-start; flex-direction: column; }
      .actions { width: 100%; justify-content: space-between; }
      main { height: calc(100vh - 112px); }
    }
  </style>
</head>
<body>
  <header>
    <div class="brand">
      <strong id="title">Metaflow 使用总览</strong>
      <span id="subtitle">访问、内容、设备、加载质量、错误与数据质量</span>
    </div>
    <div class="actions">
      <div class="segmented" role="group" aria-label="Language">
        <button id="lang-zh" type="button" aria-pressed="true">中文</button>
        <button id="lang-en" type="button" aria-pressed="false">English</button>
      </div>
      <a id="open-native" class="open-native" href="/dashboard/${ZH_DASH_ID}" target="_blank" rel="noopener">打开原生 Metabase</a>
    </div>
  </header>
  <main>
    <iframe id="dashboard-frame" title="Metaflow Analytics Dashboard" src="/dashboard/${ZH_DASH_ID}"></iframe>
  </main>
  <script>
    const dashboards = {
      zh: {
        url: "/dashboard/${ZH_DASH_ID}",
        title: "Metaflow 使用总览",
        subtitle: "访问、内容、设备、加载质量、错误与数据质量",
        open: "打开原生 Metabase",
        htmlLang: "zh-CN"
      },
      en: {
        url: "/dashboard/${EN_DASH_ID}",
        title: "Metaflow Usage Overview",
        subtitle: "Usage, content, devices, loading quality, errors, and data quality",
        open: "Open in Metabase",
        htmlLang: "en"
      }
    };
    const storageKey = "metaflow.dashboard.language";
    const frame = document.getElementById("dashboard-frame");
    const title = document.getElementById("title");
    const subtitle = document.getElementById("subtitle");
    const openNative = document.getElementById("open-native");
    const buttons = {
      zh: document.getElementById("lang-zh"),
      en: document.getElementById("lang-en")
    };
    function setLanguage(lang) {
      const next = dashboards[lang] ? lang : "zh";
      const config = dashboards[next];
      document.documentElement.lang = config.htmlLang;
      title.textContent = config.title;
      subtitle.textContent = config.subtitle;
      openNative.textContent = config.open;
      openNative.href = config.url;
      frame.src = config.url;
      buttons.zh.setAttribute("aria-pressed", String(next === "zh"));
      buttons.en.setAttribute("aria-pressed", String(next === "en"));
      localStorage.setItem(storageKey, next);
    }
    buttons.zh.addEventListener("click", () => setLanguage("zh"));
    buttons.en.addEventListener("click", () => setLanguage("en"));
    const savedLanguage = localStorage.getItem(storageKey);
    const browserLanguage = (navigator.language || "").toLowerCase().startsWith("zh") ? "zh" : "en";
    setLanguage(savedLanguage || browserLanguage);
  </script>
</body>
</html>
HTML

echo "__DASHBOARD_SHELL_WRITTEN__ $PAGE_DIR/index.html"

if [ -f "$CADDY_CONF" ] && command -v docker >/dev/null 2>&1; then
  mkdir -p "$CADDY_PAGE_DIR"
  cp -a "$PAGE_DIR"/. "$CADDY_PAGE_DIR"/
  chmod -R a+rX "$CADDY_PAGE_DIR"

  export CADDY_CONF DOMAIN CADDY_CONTAINER_PAGE_DIR
  python3 - <<'PY'
from __future__ import print_function
from datetime import datetime
import os
import shutil

path = os.environ["CADDY_CONF"]
domain = os.environ["DOMAIN"]
container_page_dir = os.environ["CADDY_CONTAINER_PAGE_DIR"].rstrip("/")

with open(path, "r") as fh:
    text = fh.read()

block = """{domain} {{
    encode gzip zstd

    header {{
        X-Content-Type-Options "nosniff"
        X-Frame-Options "SAMEORIGIN"
        Referrer-Policy "strict-origin-when-cross-origin"
    }}

    redir /metaflow /metaflow/ 308

    handle_path /metaflow/* {{
        root * {container_page_dir}
        try_files {{path}} {{path}}/ /index.html
        file_server
    }}

    handle {{
        reverse_proxy 127.0.0.1:3000 {{
            header_down -Content-Security-Policy
            header_down -X-Frame-Options
        }}
    }}
}}
""".format(domain=domain, container_page_dir=container_page_dir)

lines = text.splitlines(True)
start = None
for i, line in enumerate(lines):
    stripped = line.strip()
    if stripped.startswith(domain) and stripped.endswith("{"):
        start = i
        break

if start is None:
    if text and not text.endswith("\n"):
        text += "\n"
    new_text = text + "\n" + block
else:
    depth = 0
    end = None
    for i in range(start, len(lines)):
        depth += lines[i].count("{")
        depth -= lines[i].count("}")
        if i > start and depth <= 0:
            end = i
            break
    if end is None:
        raise RuntimeError("cannot find Caddy site block end in " + path)
    new_text = "".join(lines[:start]) + block + "".join(lines[end + 1:])

if new_text == text:
    print("__CADDY_CONFIG_UNCHANGED__ " + path)
else:
    backup = path + ".bak-metaflow-dashboard-" + datetime.utcnow().strftime("%Y%m%d%H%M%S")
    shutil.copy2(path, backup)
    # Write in place so a running Docker single-file bind mount keeps the same inode.
    with open(path, "w") as fh:
        fh.write(new_text)
    print("__CADDY_CONFIG_UPDATED__ " + path)
    print("__CADDY_BACKUP__ " + backup)
PY

  validate_cmd=(docker exec "$CADDY_CONTAINER" caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile)
  reload_cmd=(docker exec "$CADDY_CONTAINER" caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile)

  host_stat=$(stat -c '%i:%s' "$CADDY_CONF" 2>/dev/null || true)
  container_stat=$(docker exec "$CADDY_CONTAINER" stat -c '%i:%s' /etc/caddy/Caddyfile 2>/dev/null || true)
  if [ -n "$host_stat" ] && [ -n "$container_stat" ] && [ "$host_stat" != "$container_stat" ]; then
    echo "__CADDY_BIND_INODE_CHANGED__ restarting_container=$CADDY_CONTAINER"
    docker run --rm \
      -v "$CADDY_CONF:/etc/caddy/Caddyfile:ro" \
      -v "$CADDY_DATA_DIR:/data:ro" \
      caddy:2 caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
    docker restart "$CADDY_CONTAINER"
  else
    "${validate_cmd[@]}"
    "${reload_cmd[@]}" || docker restart "$CADDY_CONTAINER"
  fi

  echo "__CADDY_CONFIGURED__ $CADDY_CONF"
  echo "__METAFLOW_DASHBOARD_ENTRY__ ${SITE_URL}/metaflow/"
  echo "__DONE__"
  exit 0
fi

NGINX_CONF=""
for dir in \
  /www/server/panel/vhost/nginx \
  /www/server/nginx/conf/vhost \
  /www/server/nginx/conf/conf.d \
  /www/server/nginx/conf \
  /etc/nginx/conf.d \
  /etc/nginx/sites-enabled \
  /etc/nginx/sites-available; do
  if [ -d "$dir" ]; then
    found=$(grep -Rsl "server_name.*${DOMAIN}" "$dir" 2>/dev/null | head -n 1 || true)
    if [ -n "$found" ]; then
      NGINX_CONF="$found"
      break
    fi
  fi
done

if [ -z "$NGINX_CONF" ]; then
  found=$(grep -Rsl "server_name.*${DOMAIN}" /www/server /etc/nginx 2>/dev/null | head -n 1 || true)
  if [ -n "$found" ]; then
    NGINX_CONF="$found"
  fi
fi

if [ -n "$NGINX_CONF" ]; then
  export NGINX_CONF PAGE_DIR DOMAIN
  python3 - <<'PY'
from __future__ import print_function
import os
import shutil

path = os.environ["NGINX_CONF"]
page_dir = os.environ["PAGE_DIR"]
domain = os.environ["DOMAIN"]

with open(path, "r") as fh:
    text = fh.read()

marker = "location ^~ /metaflow/"
if marker in text:
    print("__NGINX_LOCATION_EXISTS__ " + path)
    raise SystemExit(0)

block = """
    location = /metaflow {
        return 301 /metaflow/;
    }

    location ^~ /metaflow/ {
        alias PAGE_DIR_PLACEHOLDER/;
        index index.html;
        try_files $uri $uri/ /metaflow/index.html;
    }
""".replace("PAGE_DIR_PLACEHOLDER", page_dir.rstrip("/"))

lines = text.splitlines(True)
insert_at = None
for i, line in enumerate(lines):
    if "server_name" in line and domain in line:
        insert_at = i + 1
        break
if insert_at is None:
    for i, line in enumerate(lines):
        if line.strip() == "{":
            insert_at = i + 1
            break
if insert_at is None:
    raise RuntimeError("cannot find insertion point in " + path)

backup = path + ".bak-metaflow-dashboard"
shutil.copy2(path, backup)
lines.insert(insert_at, block + "\n")
with open(path, "w") as fh:
    fh.write("".join(lines))
print("__NGINX_LOCATION_ADDED__ " + path)
print("__NGINX_BACKUP__ " + backup)
PY

  if nginx -t; then
    nginx -s reload
    echo "__NGINX_RELOADED__"
  else
    echo "__NGINX_TEST_FAILED__ restoring backup"
    if [ -f "$NGINX_CONF.bak-metaflow-dashboard" ]; then
      cp "$NGINX_CONF.bak-metaflow-dashboard" "$NGINX_CONF"
      nginx -t && nginx -s reload || true
    fi
    exit 5
  fi
else
  echo "__NGINX_CONF_NOT_FOUND__ domain=$DOMAIN"
  exit 6
fi

echo "__METAFLOW_DASHBOARD_ENTRY__ ${SITE_URL}/metaflow/"
echo "__DONE__"
