#!/usr/bin/env python3
"""Small, pinned adapter to the existing protected Companion publisher.
Preserves target, lock/baseline/concurrency guards, all-byte smoke and rollback.
Only the approved three-file browser delta is added to the previous manifest.
"""
from pathlib import Path
import argparse, base64, lzma, hashlib, importlib.util, json, os, subprocess, sys, urllib.error
ROOT=Path(__file__).resolve().parents[1]
ENGINE=ROOT/'scripts/companion-reliability-release.py'
engine_bytes=ENGINE.read_bytes()
if hashlib.sha1(b'blob '+str(len(engine_bytes)).encode()+b'\0'+engine_bytes).hexdigest()!='f6b3bdf653f771752639d4deb7fd23681091bd02':
    raise RuntimeError('Approved publisher changed; review before reuse')
spec=importlib.util.spec_from_file_location('approved_companion_publisher',ENGINE)
engine=importlib.util.module_from_spec(spec);spec.loader.exec_module(engine)
RELEASE_ROOT=ROOT/'releases/companion/2026-11-17-wenjing-default'
EXPECTED_DELTA_SHA='d6473e13e63272e56e97967dd5666518a5ed5d9606d93b0bf70be4dce8aa90e8'

def release_manifest():
    packed=base64.b64decode((RELEASE_ROOT/'delta.xz.b64').read_text().strip(),validate=True)
    if engine.sha(packed)!='df0f105df7766a247a90414fef2736ee7bacaf139324be4e9f146b212658dc96':raise ValueError('Startup payload changed')
    raw=lzma.decompress(packed,memlimit=32*1024*1024)
    if engine.sha(raw)!=EXPECTED_DELTA_SHA:raise ValueError('Startup delta changed')
    delta=json.loads(raw)
    if delta['sourceRef']!='61da2ae3984c2b20a99c417cbc9e4d50df5ecfaa' or delta['release']!='companion-2026-11-17-wenjing-default':raise ValueError('Unexpected candidate')
    old=engine.manifest()
    rows={r['path']:r for r in old['files']}
    if old['sourceRef']!='8555630aa63e31e6339d0b5dbef3a5917385feb9':raise ValueError('Wrong prior runtime')
    if set(delta['changed'])!={'experience.mjs','startup-model.mjs','release.json'}:raise ValueError('Unexpected scope')
    for name,row in delta['changed'].items():
        if row['path']!=name:raise ValueError('Changed path mismatch')
        rows[name]=row
    inline={k:old['inline'][k] for k in ['_headers','_redirects']}
    inline.update(delta['inline'])
    if set(inline)!={'_headers','_redirects','startup-model.mjs','release.json'}:raise ValueError('Unexpected inline assets')
    if set(delta['patches'])!={'experience.mjs'}:raise ValueError('Unexpected patches')
    m={**delta,'baseOrigin':'https://6afc413f205730f12c2e8e7a--'+engine.TARGET,
       'baseSourceRef':old['sourceRef'],'baseRelease':old['release'],
       'baseAppSha256':next(r['sha256'] for r in old['files'] if r['path']=='app.js'),
       'headers':old['headers'],'files':list(rows.values()),'inline':inline}
    if len(m['files'])!=69:raise ValueError('Expected exact 69-file runtime')
    for row in m['files']:engine.path_ok(row['path'])
    return m

def browser(root,label):
    keep={'PATH','HOME','TMPDIR','RUNNER_TEMP','BROWSER_MODULE_DIR','EVIDENCE_DIR','PLAYWRIGHT_BROWSERS_PATH','LANG'}
    env={k:v for k,v in os.environ.items() if k in keep}
    subprocess.run(['node','scripts/verify-companion-startup.mjs',root,label],env=env,check=True,timeout=480)

def record(data):
    if data['status'] in ['published-http-and-browser-verified','already-published-and-verified']:
        data.update(outputFilesVerified=69,servedFilesVerified=67,routingConfigurationsVerified=2)
    data['checkedAtUtc']=engine.datetime.datetime.now(engine.datetime.timezone.utc).isoformat()
    (ROOT/'companion-startup-publication.json').write_text(json.dumps(data,indent=2)+'\n')
    print('PUBLICATION_RESULT',json.dumps(data),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['build','verify','publish']);args=parser.parse_args()
    try:
        m=release_manifest();engine.BASE=m['baseOrigin'];engine.SITE=ROOT/'companion-startup-site'
        engine.browser=browser;engine.record=record
        if args.action=='build':engine.build(m)
        elif args.action=='verify':engine.verify_site(m);print('STARTUP_CANDIDATE_VERIFIED')
        else:engine.publish(m)
    except urllib.error.HTTPError as error:print('PUBLISH_FAILED_HTTP',error.code,'No credentials or response bodies logged.',file=sys.stderr);sys.exit(1)
    except Exception as error:print('PUBLISH_FAILED',str(error),file=sys.stderr);sys.exit(1)
