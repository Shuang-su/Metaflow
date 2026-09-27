#!/usr/bin/env python3
"""Activate only independently verified endpoints; full server gates remain separate."""
import argparse
import json
from pathlib import Path
from monitor import CHECKS,check

parser=argparse.ArgumentParser()
parser.add_argument('--business-only',action='store_true')
args=parser.parse_args()
selected=[item for item in CHECKS if not args.business_only or item[0]!='server']
results=[check(item,True) for item in selected]
if not all(r['http_ok'] and r['fresh'] is not False for r in results):
    raise SystemExit('Activation refused: independent HTTPS / snapshot freshness checks failed')
config=Path('.upptimerc.yml');text=config.read_text()
additions=''
for key,name,url,method,age in selected:
    if key in ('main','collector') or '    slug: '+key+'\n' in text:continue
    additions+='  - name: '+name+'\n    slug: '+key+'\n    url: '+url+'\n    expectedStatusCodes: [200]\n    maxResponseTime: 15000\n'
if additions:
    marker='assignees: []'
    if marker not in text:raise SystemExit('Activation refused: config anchor missing')
    config.write_text(text.replace(marker,additions+marker))
state_path=Path('deployment-state.json')
old=json.loads(state_path.read_text())
active=set(old.get('active_checks',['main','collector']))|set(item[0] for item in selected)
live=all(item[0] in active for item in CHECKS)
state_path.write_text(json.dumps({'dashboard_live':live,'active_checks':sorted(active)})+'\n')
print('Public dashboard endpoints activated; commit and push this reviewed change.')
