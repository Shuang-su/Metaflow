#!/usr/bin/env python3
"""Publish only validated coarse server metrics; no DB or hosting-admin credentials."""
import hashlib
import hmac
import json
from pathlib import Path
import re
import sys
import time
import urllib.request
from snapshot import atomic_json, timestamp, utcnow, validate_server

STATE = Path('/var/lib/metaflow-dashboard')
CONFIG = Path('/etc/metaflow-dashboard/publisher.json')
ENDPOINT = 'https://dashboard.metaflow.shuang-su.com/api/internal/v1/server-snapshot'


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def publish():
    if CONFIG.stat().st_mode & 0o077:
        raise RuntimeError('publisher configuration must be private')
    config=json.loads(CONFIG.read_text())
    if set(config)!=set(['secret']) or not re.fullmatch('[a-f0-9]{64}',config['secret']):
        raise RuntimeError('invalid publisher configuration')
    data=validate_server(json.loads((STATE/'snapshots/server.json').read_text()))
    if not -60<=time.time()-timestamp(data['generated_at'])<=180:
        raise RuntimeError('sample is stale')
    body=json.dumps(data,ensure_ascii=False,allow_nan=False,separators=(',',':')).encode('utf-8')
    stamp=str(int(time.time()))
    signature=hmac.new(config['secret'].encode('ascii'),stamp.encode('ascii')+b'\n'+body,hashlib.sha256).hexdigest()
    request=urllib.request.Request(ENDPOINT,data=body,method='POST',headers={
        'Content-Type':'application/json','X-Metaflow-Time':stamp,'X-Metaflow-Signature':signature})
    with urllib.request.build_opener(NoRedirect).open(request,timeout=12) as response:
        receipt=json.loads(response.read(4096))
        if response.status!=200 or receipt.get('accepted') is not True or receipt.get('generated_at')!=data['generated_at']:
            raise RuntimeError('publication not confirmed')
    atomic_json(STATE/'publish-receipt.json',{'generated_at':data['generated_at'],'accepted_at':utcnow()})


if __name__=='__main__':
    try:publish()
    except Exception as error:
        print('Server snapshot not published: '+type(error).__name__+'; previous remote snapshot retained',file=sys.stderr)
        sys.exit(1)
