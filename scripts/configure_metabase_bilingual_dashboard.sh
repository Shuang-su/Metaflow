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
            "native": {"query": spec["sql"], "template-tags": {}},
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
    return sql


VIZ_LINE_USAGE = {
    "graph.dimensions": ["metric_date"],
    "graph.metrics": ["page_views", "sessions", "active_users", "new_users", "returning_users"],
}
VIZ_ROUTE_BAR = {"graph.dimensions": ["route"], "graph.metrics": ["page_views"]}
VIZ_DEVICE_BAR = {"graph.dimensions": ["device_class"], "graph.metrics": ["page_views", "sessions", "unique_users"]}
VIZ_INTERACTION_BAR = {"graph.dimensions": ["target"], "graph.metrics": ["interactions"]}
VIZ_QUALITY_LINE = {
    "graph.dimensions": ["metric_date"],
    "graph.metrics": ["raw_events", "rejected_events", "heartbeat_coverage_pct", "first_frame_pct", "rejected_pct"],
}

COMMON_SQL = {
    "pv": q("select count(*) as pv_30d from analytics.fact_page_views where page_viewed_at >= now() - interval '30 days'"),
    "uv": q("select count(distinct anonymous_user_id_hash) as uv_30d from analytics.fact_page_views where page_viewed_at >= now() - interval '30 days'"),
    "sessions": q("select count(*) as sessions_30d from analytics.fact_sessions where session_started_at >= now() - interval '30 days'"),
    "engaged": q("select count(*) as engaged_sessions_30d from analytics.fact_sessions where session_started_at >= now() - interval '30 days' and engaged_session"),
    "avg_duration": q("select round(avg(duration_seconds)::numeric, 1) as avg_duration_seconds from analytics.fact_sessions where session_started_at >= now() - interval '30 days'"),
    "bounce": q("select round(100.0 * count(*) filter (where bounce) / nullif(count(*),0), 1) as bounce_rate_percent from analytics.fact_sessions where session_started_at >= now() - interval '30 days'"),
    "daily_usage": q("select metric_date, page_views, sessions, active_users, new_users, returning_users from analytics.daily_user_metrics where metric_date >= current_date - interval '30 days' order by metric_date"),
    "route": q("select route, sum(page_views) as page_views, sum(unique_users) as unique_users, sum(sessions) as sessions from analytics.daily_route_metrics where metric_date >= current_date - interval '30 days' group by route order by page_views desc limit 12"),
    "resource": q("select coalesce(resource_id, '(unknown)') as resource_id, route, sum(load_attempts) as load_attempts, sum(loaded_count) as loaded, sum(failed_count) as failed, sum(abandoned_count) as abandoned, round(avg(p50_ttf_ms)::numeric, 0) as avg_p50_ttf_ms, round(avg(p95_ttf_ms)::numeric, 0) as avg_p95_ttf_ms from analytics.daily_resource_metrics where metric_date >= current_date - interval '30 days' group by resource_id, route order by load_attempts desc limit 20"),
    "performance": q("select metric_date, route, coalesce(resource_id, '(unknown)') as resource_id, load_attempts, p50_ttf_ms, p95_ttf_ms, p50_lcp_ms, p95_lcp_ms, p50_inp_ms, p95_inp_ms, p50_cls, p95_cls from analytics.daily_performance_metrics where metric_date >= current_date - interval '30 days' order by metric_date desc, load_attempts desc nulls last limit 40"),
    "device": q("select coalesce(device_class, '(unknown)') as device_class, sum(page_views) as page_views, sum(unique_users) as unique_users, sum(sessions) as sessions from analytics.daily_device_metrics where metric_date >= current_date - interval '30 days' group by device_class order by page_views desc limit 12"),
    "device_detail": q("select browser, os, device_class, renderer, sum(page_views) as page_views, sum(unique_users) as unique_users, sum(sessions) as sessions from analytics.daily_device_metrics where metric_date >= current_date - interval '30 days' group by browser, os, device_class, renderer order by page_views desc limit 30"),
    "acquisition": q("select coalesce(referrer_domain, '(direct)') as referrer_domain, coalesce(utm_source, '(none)') as utm_source, coalesce(utm_medium, '(none)') as utm_medium, count(*) as page_views, count(distinct anonymous_user_id_hash) as unique_users, count(distinct session_id) as sessions from analytics.fact_page_views where page_viewed_at >= now() - interval '30 days' group by referrer_domain, utm_source, utm_medium order by page_views desc limit 20"),
    "errors": q("with errors as (select metric_date, route, coalesce(error_name, '(unknown)') as error_name, error_count, affected_sessions from analytics.daily_error_metrics where metric_date >= current_date - interval '30 days' order by metric_date desc, error_count desc limit 30) select * from errors union all select current_date as metric_date, '(all routes)' as route, 'No errors in selected window' as error_name, 0 as error_count, 0 as affected_sessions where not exists (select 1 from errors)"),
    "quality": q("select metric_date, raw_events, rejected_events, page_view_events, heartbeat_events, round(heartbeat_coverage_rate * 100, 1) as heartbeat_coverage_pct, round(first_frame_rate * 100, 1) as first_frame_pct, round(rejected_rate * 100, 2) as rejected_pct from analytics.daily_data_quality_metrics where metric_date >= current_date - interval '30 days' order by metric_date"),
    "interactions": q("select event_name, coalesce(element_id, action, setting, camera_mode, '(unknown)') as target, count(*) as interactions, count(distinct session_id) as sessions from analytics.fact_interactions where occurred_at >= now() - interval '30 days' group by event_name, target order by interactions desc limit 20"),
    "sessions_review": q("select session_id, anonymous_user_id_hash, session_started_at, last_seen_at, duration_seconds, event_count, heartbeat_count, first_frame_ready, had_interaction, engaged_session, bounce, entry_route, exit_route from analytics.fact_sessions where session_started_at >= now() - interval '30 days' and (bounce or not first_frame_ready or heartbeat_count = 0 or duration_seconds >= 60) order by session_started_at desc limit 30"),
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
    spec("Metaflow PV - 30d", "Page views in the last 30 days.", "scalar", "pv", 0, 0, 3, 2),
    spec("Metaflow UV - 30d", "Unique anonymous users in the last 30 days.", "scalar", "uv", 3, 0, 3, 2),
    spec("Metaflow Sessions - 30d", "Sessions started in the last 30 days.", "scalar", "sessions", 6, 0, 3, 2),
    spec("Metaflow Engaged - 30d", "Engaged sessions in the last 30 days.", "scalar", "engaged", 9, 0, 3, 2),
    spec("Metaflow Avg Duration - 30d", "Average session duration in seconds.", "scalar", "avg_duration", 12, 0, 3, 2),
    spec("Metaflow Bounce Rate - 30d", "Bounce sessions divided by all sessions.", "scalar", "bounce", 15, 0, 3, 2),
    spec("Metaflow Daily Usage Trend", "Daily page views, sessions, active users, new users, returning users.", "line", "daily_usage", 0, 2, 12, 4, VIZ_LINE_USAGE),
    spec("Metaflow Route Performance", "Top routes by page views in the last 30 days.", "bar", "route", 12, 2, 6, 4, VIZ_ROUTE_BAR),
    spec("Metaflow Resource Load Quality", "Resource load attempts, success, failures, abandonment, and first frame p95.", "table", "resource", 0, 6, 9, 5),
    spec("Metaflow Web Vitals And First Frame", "Performance rollup by route and resource.", "table", "performance", 9, 6, 9, 5),
    spec("Metaflow Device Mix", "Device class mix with page views, sessions, and users.", "bar", "device", 0, 11, 9, 5, VIZ_DEVICE_BAR),
    spec("Metaflow Device Detail", "Browser, OS, device class, renderer mix.", "table", "device_detail", 9, 11, 9, 5),
    spec("Metaflow Acquisition Mix", "Referrer and UTM source mix.", "table", "acquisition", 0, 16, 9, 4),
    spec("Metaflow Error Top N", "Client/load/XR/replay errors by route and error.", "table", "errors", 9, 16, 9, 4),
    spec("Metaflow Data Quality", "Raw events, rejection, heartbeat coverage, first-frame rate.", "line", "quality", 0, 20, 9, 4, VIZ_QUALITY_LINE),
    spec("Metaflow Interaction Top N", "Whitelisted interaction volume.", "bar", "interactions", 9, 20, 9, 4, VIZ_INTERACTION_BAR),
    spec("Metaflow Recent Sessions Needing Review", "Long, failed, or unengaged sessions for diagnostics.", "table", "sessions_review", 0, 24, 18, 5),
]

ZH_SPECS = [
    spec("访问量 PV - 30天", "最近 30 天页面浏览量。", "scalar", "pv", 0, 0, 3, 2),
    spec("访客 UV - 30天", "最近 30 天匿名访客数。", "scalar", "uv", 3, 0, 3, 2),
    spec("会话 Sessions - 30天", "最近 30 天会话数。", "scalar", "sessions", 6, 0, 3, 2),
    spec("有效会话 - 30天", "最近 30 天有效会话数。", "scalar", "engaged", 9, 0, 3, 2),
    spec("平均停留 - 30天", "最近 30 天平均会话时长，单位秒。", "scalar", "avg_duration", 12, 0, 3, 2),
    spec("跳出率 - 30天", "跳出会话占全部会话比例。", "scalar", "bounce", 15, 0, 3, 2),
    spec("每日访问趋势", "每日访问量、会话、活跃用户、新用户和回访用户。", "line", "daily_usage", 0, 2, 12, 4, VIZ_LINE_USAGE),
    spec("路由表现", "最近 30 天访问量最高的路由。", "bar", "route", 12, 2, 6, 4, VIZ_ROUTE_BAR),
    spec("资源加载质量", "资源加载尝试、成功、失败、流失和首帧耗时。", "table", "resource", 0, 6, 9, 5),
    spec("Web Vitals 与首帧", "按路由和资源汇总的性能指标。", "table", "performance", 9, 6, 9, 5),
    spec("设备分布", "按设备类别统计访问量、会话和用户。", "bar", "device", 0, 11, 9, 5, VIZ_DEVICE_BAR),
    spec("设备明细", "浏览器、OS、设备类别和 renderer 分布。", "table", "device_detail", 9, 11, 9, 5),
    spec("来源渠道", "Referrer 和 UTM 来源分布。", "table", "acquisition", 0, 16, 9, 4),
    spec("错误 Top N", "前端、加载、XR、回放错误。", "table", "errors", 9, 16, 9, 4),
    spec("数据质量", "事件量、拒收、心跳覆盖率、首帧转化率。", "line", "quality", 0, 20, 9, 4, VIZ_QUALITY_LINE),
    spec("交互 Top N", "白名单交互事件量。", "bar", "interactions", 9, 20, 9, 4, VIZ_INTERACTION_BAR),
    spec("需排查会话", "慢加载、错误、无首帧、心跳异常或跳出的会话。", "table", "sessions_review", 0, 24, 18, 5),
]


def ensure_dashboard(name, description, specs):
    card_layout = []
    for card_spec in specs:
        try:
            cid = make_card(card_spec)
            if cid:
                card_layout.append((cid, card_spec["col"], card_spec["row"], card_spec["sx"], card_spec["sy"]))
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
    for cid, col, row, sx, sy in card_layout:
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
            "parameter_mappings": existing.get("parameter_mappings", []) if existing else [],
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
            {"name": name, "description": description, "collection_id": collection_id},
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
        reverse_proxy 127.0.0.1:3000
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
