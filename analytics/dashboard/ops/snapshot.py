#!/usr/bin/env python3
"""MF-89: bounded public snapshots. Python 3.6+, no third-party host packages."""
import argparse
import datetime as dt
import fcntl
import json
import math
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import tempfile
import time

UTC = dt.timezone.utc
POSTGRES_IMAGE = 'postgres:16.14-alpine@sha256:d845e7f0ac8517b9d9868b6d20379f9688ba3676595e50ca7c0b664964b2a760'
METRICS = ('cpu_pct', 'memory_pct', 'disk_pct')


def utcnow():
    return dt.datetime.now(UTC).isoformat().replace('+00:00', 'Z')


def timestamp(value):
    if not isinstance(value, str) or not re.fullmatch(r'\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})', value):
        raise ValueError('invalid timestamp')
    offset = 0
    if value.endswith('Z'):
        base = value[:-1]
    else:
        base, zone = value[:-6], value[-6:]
        offset = (int(zone[1:3])*60 + int(zone[4:6]))*60*(1 if zone[0]=='+' else -1)
    parsed = dt.datetime.strptime(base, '%Y-%m-%dT%H:%M:%S.%f' if '.' in base else '%Y-%m-%dT%H:%M:%S')
    return parsed.replace(tzinfo=UTC).timestamp()-offset


def fields(obj, names):
    if not isinstance(obj, dict) or set(obj) != set(names.split()):
        raise ValueError('unexpected or missing fields')


def count(value):
    if type(value) is not int or value < 0 or value > 2**53-1:
        raise ValueError('invalid count')


def numeric(value, maximum, nullable=False):
    if value is None and nullable:
        return
    if type(value) not in (int, float) or not math.isfinite(value) or not 0 <= value <= maximum:
        raise ValueError('invalid numeric value')


def stats(row):
    for name in ('pv', 'uv', 'attempts', 'successes', 'p95_samples'):
        count(row[name])
    if row['uv'] > row['pv'] or row['successes'] > row['attempts'] or row['p95_samples'] != row['successes']:
        raise ValueError('inconsistent counts')
    expected = row['successes']/row['attempts'] if row['attempts'] else None
    numeric(row['success_rate'], 1, True)
    if (expected is None) != (row['success_rate'] is None) or (expected is not None and abs(expected-row['success_rate']) > 1e-8):
        raise ValueError('inconsistent success rate')
    numeric(row['p95_ms'], 86400000, True)
    if (row['p95_samples']==0) != (row['p95_ms'] is None):
        raise ValueError('inconsistent percentile')


def validate_analytics(data, days, catalog):
    fields(data, 'schema_version kind timezone period source_cutoff_at generated_at latest_event_at kpis daily resources devices errors')
    if data['schema_version'] != 1 or data['kind'] != 'analytics' or data['timezone'] != 'Asia/Shanghai':
        raise ValueError('unsupported analytics contract')
    fields(data['period'], 'days start end')
    if data['period']['days'] != days or days not in (7,30):
        raise ValueError('wrong period')
    start, end = timestamp(data['period']['start']), timestamp(data['period']['end'])
    cutoff, generated = timestamp(data['source_cutoff_at']), timestamp(data['generated_at'])
    if not start <= end == cutoff <= generated or generated > time.time()+60:
        raise ValueError('inconsistent time range')
    local_start = dt.datetime.fromtimestamp(start, UTC)+dt.timedelta(hours=8)
    local_end = dt.datetime.fromtimestamp(end, UTC)+dt.timedelta(hours=8)
    if local_start.time() != dt.time(0) or (local_end.date()-local_start.date()).days != days-1:
        raise ValueError('wrong Beijing date boundary')
    if data['latest_event_at'] is not None and not start <= timestamp(data['latest_event_at']) <= cutoff:
        raise ValueError('invalid source timestamp')
    fields(data['kpis'], 'pv uv uv_missing_pv attempts successes success_rate p95_ms p95_samples')
    stats(data['kpis'])
    count(data['kpis']['uv_missing_pv'])
    if data['kpis']['uv_missing_pv'] > data['kpis']['pv']:
        raise ValueError('invalid missing UV count')
    if not isinstance(data['daily'], list) or len(data['daily']) != days:
        raise ValueError('missing dates')
    for i, row in enumerate(data['daily']):
        fields(row, 'date pv uv')
        if row['date'] != (local_start.date()+dt.timedelta(days=i)).isoformat():
            raise ValueError('unsorted or missing day')
        count(row['pv']); count(row['uv'])
        if row['uv'] > row['pv']:
            raise ValueError('invalid daily UV')
    if sum(r['pv'] for r in data['daily']) != data['kpis']['pv']:
        raise ValueError('inconsistent daily total')
    if not isinstance(data['resources'], list) or len(data['resources']) > len(catalog):
        raise ValueError('invalid resources')
    seen = set()
    for row in data['resources']:
        fields(row, 'id title pv uv attempts successes success_rate p95_ms p95_samples')
        if row['id'] not in catalog or row['title'] != catalog[row['id']] or row['id'] in seen:
            raise ValueError('resource outside public catalog')
        seen.add(row['id']); stats(row)
    if any(sum(r[k] for r in data['resources']) > data['kpis'][k] for k in ('pv','attempts','successes')):
        raise ValueError('resource totals exceed overall totals')
    for name, allowed in [('devices', {'mobile','desktop','tablet','unknown'}), ('errors', {'network','renderer','resource','other'})]:
        if not isinstance(data[name], list) or len(data[name]) > len(allowed):
            raise ValueError('invalid categories')
        seen = set()
        for row in data[name]:
            fields(row, 'category count'); count(row['count'])
            if row['category'] not in allowed or row['category'] in seen:
                raise ValueError('unsafe category')
            seen.add(row['category'])
    if sum(r['count'] for r in data['devices']) != data['kpis']['pv']:
        raise ValueError('device counts do not match PV')
    return data


def validate_server(data):
    fields(data, 'schema_version kind generated_at history_window_hours sample_interval_seconds current history')
    if data['schema_version'] != 1 or data['kind'] != 'server' or data['history_window_hours'] != 24 or data['sample_interval_seconds'] != 60:
        raise ValueError('unsupported server contract')
    generated = timestamp(data['generated_at'])
    if generated > time.time()+60:
        raise ValueError('future sample')
    fields(data['current'], 'cpu_pct memory_pct disk_pct')
    if not isinstance(data['history'], list) or not 1 <= len(data['history']) <= 1441:
        raise ValueError('invalid history length')
    previous = generated-86401
    for row in data['history']:
        fields(row, 'at cpu_pct memory_pct disk_pct')
        sampled = timestamp(row['at'])
        if not previous < sampled <= generated:
            raise ValueError('invalid history timestamp')
        previous = sampled
        for key in METRICS:
            numeric(row[key], 100, key=='cpu_pct')
    if previous != generated or data['current'] != {k:data['history'][-1][k] for k in METRICS}:
        raise ValueError('current sample differs from history')
    return data


def atomic_json(path, data, previous_dir=None):
    path = Path(path); path.parent.mkdir(parents=True, exist_ok=True)
    payload = (json.dumps(data, ensure_ascii=False, allow_nan=False, separators=(',',':'))+'\n').encode('utf-8')
    if previous_dir is not None and path.exists():
        previous = Path(previous_dir)/path.name
        previous.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(str(path), str(previous))
        os.chmod(str(previous), 0o600)
    fd, temporary = tempfile.mkstemp(prefix='.'+path.name+'.', dir=str(path.parent))
    try:
        with os.fdopen(fd, 'wb') as stream:
            stream.write(payload); stream.flush(); os.fsync(stream.fileno())
            os.fchmod(stream.fileno(), 0o644)
        os.replace(temporary, str(path))
        directory_fd = os.open(str(path.parent), os.O_RDONLY)
        try: os.fsync(directory_fd)
        finally: os.close(directory_fd)
    finally:
        if os.path.exists(temporary): os.unlink(temporary)


def business(public, private, catalog_path, service_file):
    # The one-shot SQL client has no dependency on either Metabase container.
    service_file = Path(service_file).resolve()
    if service_file.stat().st_mode & 0o077:
        raise ValueError('database service file must be private (0600)')
    command = ['docker','run','--rm','--read-only','--cap-drop=ALL','--security-opt=no-new-privileges',
        '--memory=128m','--cpus=0.5','--pids-limit=32','--network=bridge','--user=0:0',
        '-e','PGSERVICE=dashboard','-e','PGSERVICEFILE=/run/db-service.conf',
        '-v',str(service_file)+':/run/db-service.conf:ro','--entrypoint=psql',POSTGRES_IMAGE,
        '-X','-A','-t','-v','ON_ERROR_STOP=1','-c',
        "select jsonb_build_object('7d',dashboard_private.analytics_snapshot(7),'30d',dashboard_private.analytics_snapshot(30));"]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=55, check=False)
    if result.returncode:
        # Database/transport diagnostics may include DSNs: never forward stderr to journal/public.
        raise RuntimeError('aggregate query failed (see restricted DB diagnostics)')
    if len(result.stdout)>4*1024*1024:
        raise ValueError('snapshot too large')
    snapshots = json.loads(result.stdout.decode('utf-8'))
    fields(snapshots, '7d 30d')
    catalog = json.loads(Path(catalog_path).read_text(encoding='utf-8'))
    for days in (7,30): validate_analytics(snapshots[str(days)+'d'], days, catalog)
    for days in (7,30):
        name = str(days)+'d.json'
        atomic_json(Path(public)/'analytics'/name, snapshots[str(days)+'d'], Path(private)/'previous/analytics')


def server(public, private, proc=Path('/proc')):
    private = Path(private); sample_time = utcnow()
    cpu = [int(x) for x in (proc/'stat').read_text().splitlines()[0].split()[1:9]]
    total, idle = sum(cpu), cpu[3]+cpu[4]
    state_path = private/'cpu.json'; cpu_pct = None
    try:
        prior = json.loads(state_path.read_text())
        delta = total-prior['total']; elapsed = timestamp(sample_time)-timestamp(prior['at'])
        if delta>0 and 0<elapsed<=180:
            cpu_pct = round(100*(1-(idle-prior['idle'])/delta),1)
    except (FileNotFoundError, ValueError, KeyError): pass
    memory = {}
    for line in (proc/'meminfo').read_text().splitlines():
        key,value = line.split(':',1); memory[key] = int(value.strip().split()[0])
    disk = os.statvfs('/')
    current = {'cpu_pct':cpu_pct,'memory_pct':round(100*(1-memory['MemAvailable']/memory['MemTotal']),1),
        'disk_pct':round(100*(1-disk.f_bfree/disk.f_blocks),1)}
    path = Path(public)/'server.json'; history = []
    if path.exists():
        # Corruption is a failed refresh, never silently replace history with a fresh green sample.
        previous = validate_server(json.loads(path.read_text()))
        history = [r for r in previous['history'] if timestamp(r['at']) > timestamp(sample_time)-86400]
    row = dict(current, at=sample_time)
    history.append(row)
    data = {'schema_version':1,'kind':'server','generated_at':sample_time,'history_window_hours':24,
        'sample_interval_seconds':60,'current':current,'history':history[-1441:]}
    validate_server(data)
    atomic_json(path, data, private/'previous')
    atomic_json(state_path, {'at':sample_time,'total':total,'idle':idle})
    os.chmod(str(state_path),0o600)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=('analytics','server'))
    parser.add_argument('--public', default='/var/lib/metaflow-dashboard/snapshots')
    parser.add_argument('--private', default='/var/lib/metaflow-dashboard')
    parser.add_argument('--catalog', default='/etc/metaflow-dashboard/public-resources.json')
    parser.add_argument('--service-file', default='/etc/metaflow-dashboard/db-service.conf')
    args = parser.parse_args()
    private = Path(args.private); private.mkdir(parents=True, exist_ok=True); os.chmod(str(private),0o700)
    # Independent locks: a slow query must not delay server sampling.
    with (private/(args.mode+'.lock')).open('w') as lock:
        try: fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError: return 0
        try:
            if args.mode=='analytics': business(args.public,args.private,args.catalog,args.service_file)
            else: server(args.public,args.private)
        except Exception as error:
            print('snapshot refresh failed: '+type(error).__name__+'; previous valid snapshot retained',file=sys.stderr)
            return 1
    return 0


if __name__=='__main__':
    sys.exit(main())
