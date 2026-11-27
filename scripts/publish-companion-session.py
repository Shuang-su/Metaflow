#!/usr/bin/env python3
"""Fixed accepted browser runtime; reuse existing protected publication controls."""
from pathlib import Path
import argparse,base64,lzma,hashlib,importlib.util,json,os,subprocess,sys,urllib.error
ROOT=Path(__file__).resolve().parents[1]
PREVIOUS=ROOT/'scripts/publish-companion-feedback.py'
b=PREVIOUS.read_bytes()
if hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()!='6013750f48fff9701271bf833d485e54073c6afa':raise RuntimeError('Prior validated publisher changed')
spec=importlib.util.spec_from_file_location('previous_feedback_publisher',PREVIOUS)
prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
engine=prior.engine
EXPECTED_PACKED='a161b1d5bffaef126e1a62ec472ad4b1fad9ebe7c257f49ff4396376870d440a'
EXPECTED_JSON='4e09f2d9b1b0494af092fa510bee8e16ea15f48acccc0d36865a84a906837de7'
def manifest():
    packed=base64.b64decode((ROOT/'releases/companion/2026-11-18-display-session/delta.xz.b64').read_text().strip(),validate=True)
    if engine.sha(packed)!=EXPECTED_PACKED:raise ValueError('Session payload changed')
    raw=lzma.decompress(packed,memlimit=32*1024*1024)
    if engine.sha(raw)!=EXPECTED_JSON:raise ValueError('Session manifest changed')
    delta=json.loads(raw);old=prior.manifest()
    if old['sourceRef']!='8886f8c707d244469763949814f19a5f09a2a039' or delta['sourceRef']!='6e70455fcf87046f67fdf1d98145ebdcaa09ee77':raise ValueError('Unexpected source')
    if delta['release']!='companion-2026-11-18-display-session':raise ValueError('Unexpected release')
    if set(delta['changed'])!={'app.js','experience.css','display-session.mjs','screen-awake.mjs','release.json'}:raise ValueError('Unexpected runtime scope')
    if set(delta['inline'])!={'display-session.mjs','screen-awake.mjs','release.json'} or set(delta['patches'])!={'app.js','experience.css'}:raise ValueError('Unexpected delta paths')
    rows={r['path']:r for r in old['files']}
    baseline_app_sha=rows['app.js']['sha256']
    for name,row in delta['changed'].items():
        if row['path']!=name:raise ValueError('Path mismatch')
        rows[name]=row
    m={**delta,'baseOrigin':'https://6afc6be90e78b612de2a968d--'+engine.TARGET,
       'baseSourceRef':old['sourceRef'],'baseRelease':old['release'],
       'baseAppSha256':baseline_app_sha,'headers':old['headers'],'files':list(rows.values()),
       'inline':{**{k:old['inline'][k] for k in ['_headers','_redirects']},**delta['inline']}}
    if len(m['files'])!=72:raise ValueError('Expected exactly 72 browser files')
    for row in m['files']:engine.path_ok(row['path'])
    return m

def browser(root,label):
    keep={'PATH','HOME','TMPDIR','RUNNER_TEMP','BROWSER_MODULE_DIR','EVIDENCE_DIR','PLAYWRIGHT_BROWSERS_PATH','LANG'}
    subprocess.run(['node','scripts/verify-companion-session.mjs',root,label],env={k:v for k,v in os.environ.items() if k in keep},check=True,timeout=480)

def record(data):
    if data['status'] in ['published-http-and-browser-verified','already-published-and-verified']:data.update(outputFilesVerified=72,servedFilesVerified=70,routingConfigurationsVerified=2)
    data['checkedAtUtc']=engine.datetime.datetime.now(engine.datetime.timezone.utc).isoformat()
    (ROOT/'companion-session-publication.json').write_text(json.dumps(data,indent=2)+'\n');print('PUBLICATION_RESULT',json.dumps(data),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['build','verify','publish']);a=p.parse_args()
    try:
        m=manifest();engine.BASE=m['baseOrigin'];engine.SITE=ROOT/'companion-session-site';engine.browser=browser;engine.record=record
        if a.action=='build':engine.build(m)
        elif a.action=='verify':engine.verify_site(m);print('EXACT_DISPLAY_SESSION_RUNTIME_VERIFIED')
        else:engine.publish(m)
    except urllib.error.HTTPError as e:print('RELEASE_FAILED_HTTP',e.code,'No response body or credentials logged.',file=sys.stderr);sys.exit(1)
    except Exception as e:print('RELEASE_FAILED',str(e),file=sys.stderr);sys.exit(1)
