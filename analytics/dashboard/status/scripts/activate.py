#!/usr/bin/env python3
"""Run ONLY after the static dashboard and all public snapshots pass deployment checks."""
import json
from pathlib import Path
from monitor import CHECKS,check

results=[check(item,True) for item in CHECKS]
if not all(r['http_ok'] and r['fresh'] is not False for r in results):
    raise SystemExit('Activation refused: independent HTTPS / snapshot freshness checks failed')
config=Path('.upptimerc.yml');text=config.read_text()
if '# MF89_LIVE_ENDPOINTS' not in text:
    marker='assignees: []'
    additions='# MF89_LIVE_ENDPOINTS\n'
    for key,name,url,method,age in CHECKS:
        if key in ('main','collector'):continue
        additions+='  - name: '+name+'\n    slug: '+key+'\n    url: '+url+'\n    expectedStatusCodes: [200]\n    maxResponseTime: 15000\n'
    text=text.replace(marker,additions+marker)
    config.write_text(text)
Path('deployment-state.json').write_text('{"dashboard_live":true}\n')
print('Public dashboard endpoints activated; commit and push this reviewed change.')
