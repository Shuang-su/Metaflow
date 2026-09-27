#!/usr/bin/env python3
"""MF-89 guarded internal Metabase lifecycle; never removes containers or volumes."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
from snapshot import atomic_json, timestamp, utcnow, validate_server, validate_analytics

STATE = Path('/var/lib/metaflow-dashboard')
PUBLIC = Path('/opt/metaflow-metabase/caddy/data/public-dashboard/api/public/v1')
CONFIG = Path('/etc/metaflow-dashboard')
APP = 'metaflow-metabase'
DB = 'metaflow-metabase-db'


def docker(*args):
    return subprocess.check_output(['docker']+list(args), universal_newlines=True, timeout=150)


def inspect(name):
    return json.loads(docker('inspect',name))[0]


def review():
    path = CONFIG/'security-review.json'
    if path.stat().st_mode & 0o077:
        raise RuntimeError('security review must be private')
    data = json.loads(path.read_text())
    for key in ('host_persistence_reviewed','admins_sessions_keys_reviewed','firewalls_verified',
                'offsite_backup_restore_verified','subscriptions_migrated_or_absent','metabase_patched','external_https_verified'):
        if data.get(key) is not True:
            raise RuntimeError('unresolved prerequisite: '+key)
    if not 0 <= time.time()-timestamp(data['reviewed_at']) <= 30*86400:
        raise RuntimeError('security review expired; recheck versions and configuration')
    for name in (APP,DB):
        image = inspect(name)['Config']['Image']
        if '@sha256:' not in image or image != data['approved_images'][name]:
            raise RuntimeError('unreviewed image; no automatic pull or upgrade')
    return data


def fresh_snapshots():
    now = time.time()
    catalog = json.loads((CONFIG/'public-resources.json').read_text())
    for days in (7,30):
        data = validate_analytics(json.loads((PUBLIC/'analytics'/('{}d.json'.format(days))).read_text()), days, catalog)
        if not 0 <= now-timestamp(data['generated_at']) <= 1800:
            return False
    data = validate_server(json.loads((PUBLIC/'server.json').read_text()))
    return 0 <= now-timestamp(data['generated_at']) <= 180


def observe():
    path = STATE/'observations.json'; rows = json.loads(path.read_text()) if path.exists() else []
    try: ok = fresh_snapshots()
    except Exception: ok = False
    now = time.time()
    rows = [r for r in rows if timestamp(r['at']) >= now-26*3600]
    rows.append({'at':utcnow(),'ok':ok})
    atomic_json(path, rows)
    os.chmod(str(path),0o600)


def continuous(rows, seconds, max_gap, now):
    # Include the sample immediately preceding the window, so no gap is hidden at the boundary.
    selected = [r for r in rows if timestamp(r['at']) >= now-seconds-max_gap]
    if not selected or timestamp(selected[0]['at']) > now-seconds:
        return False
    if not 0 <= now-timestamp(selected[-1]['at']) <= max_gap:
        return False
    previous = None
    for row in selected:
        at = timestamp(row['at'])
        if row.get('ok') is not True or at>now or (previous is not None and not 0<at-previous<=max_gap):
            return False
        previous = at
    return True


def gate(hours=24):
    review()
    if not fresh_snapshots(): raise RuntimeError('public snapshots are not fresh')
    rows = json.loads((STATE/'observations.json').read_text())
    if not continuous(rows,hours*3600,180,time.time()):
        raise RuntimeError('continuous local observation threshold not met')
    # Independent network observations are public, contain no credentials, and include freshness.
    url='https://raw.githubusercontent.com/Shuang-su/metaflow-status/main/history/monitor.json'
    with urllib.request.urlopen(url, timeout=20) as response:
        external=json.loads(response.read(1024*1024))
    if not continuous(external['observations'],hours*3600,1800,time.time()):
        raise RuntimeError('independent HTTPS and freshness observation threshold not met')


def wait_for(check, timeout):
    until=time.monotonic()+timeout
    while time.monotonic()<until:
        if check(): return
        time.sleep(3)
    raise RuntimeError('health check timed out; data remains intact')


def app_healthy():
    try:
        with urllib.request.urlopen('http://127.0.0.1:3000/api/health',timeout=3) as response:
            return response.status==200 and json.loads(response.read(4096)).get('status')=='ok'
    except Exception: return False


def memory():
    values={}
    for line in Path('/proc/meminfo').read_text().splitlines():
        key,value=line.split(':',1)
        if key in ('MemAvailable','SwapTotal','SwapFree'): values[key+'_kib']=int(value.strip().split()[0])
    return dict(values,at=utcnow())


def start():
    review()
    # Existing containers are retained, with pinned inspected images and no automatic restart.
    docker('update','--restart=no',DB,APP)
    docker('start',DB)
    def ready():
        result=subprocess.run(['docker','exec',DB,'pg_isready','-q'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
        return result.returncode==0
    wait_for(ready,90)
    docker('start',APP);wait_for(app_healthy,240)
    print('Metabase healthy. SSH tunnel: ssh -L 18080:127.0.0.1:8080 root@47.107.148.167')


def stop():
    review()
    cutover=STATE/'cutover.json'
    if not cutover.exists(): gate(24)
    before=memory()
    docker('update','--restart=no',APP,DB)
    docker('stop','-t','90',APP)
    docker('stop','-t','60',DB)
    after=memory()
    data={'stopped_at':utcnow(),'before':before,'after':after,
          'available_memory_delta_kib':after['MemAvailable_kib']-before['MemAvailable_kib'],
          'observation_30m_complete':False}
    atomic_json(cutover,data);os.chmod(str(cutover),0o600)
    print(json.dumps(data))


def verify():
    data=json.loads((STATE/'cutover.json').read_text())
    if time.time()-timestamp(data['stopped_at'])<1800:
        raise RuntimeError('30-minute post-stop observation has not elapsed')
    if any(inspect(n)['State']['Running'] for n in (APP,DB)):
        raise RuntimeError('analysis services are still running')
    gate(.5)
    data['observation_30m_complete']=True;data['verified_at']=utcnow()
    data['settled_memory']=memory()
    atomic_json(STATE/'cutover.json',data)
    print('30-minute post-stop observation passed; record the separate on-demand start/stop test.')


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('command',choices=('start','stop','observe','gate','verify'))
    args=parser.parse_args()
    try: globals()[args.command]()
    except Exception as error:
        # Only bounded operational messages; never print Docker inspect/env or connection strings.
        print('Operation incomplete: '+(str(error) if type(error) is RuntimeError else type(error).__name__))
        raise SystemExit(1)
