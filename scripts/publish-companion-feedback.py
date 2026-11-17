#!/usr/bin/env python3
"""Pinned browser-runtime delta using the existing protected publisher, not credentials migration."""
from pathlib import Path
import argparse,base64,lzma,hashlib,importlib.util,json,os,subprocess,sys,urllib.error
ROOT=Path(__file__).resolve().parents[1]
PREVIOUS=ROOT/'scripts/publish-companion-startup.py'
b=PREVIOUS.read_bytes()
if hashlib.sha1(b'blob '+str(len(b)).encode()+b'\0'+b).hexdigest()!='6c07dd3c50dcf53c85d2dc3200c3e4c62ff77747':raise RuntimeError('Prior validated publisher changed')
spec=importlib.util.spec_from_file_location('previous_startup_publisher',PREVIOUS)
prior=importlib.util.module_from_spec(spec);spec.loader.exec_module(prior)
engine=prior.engine
EXPECTED_PACKED='0c0060b5223805b76f6dd6365a20385401348bedbef4326e525da281624df359'
EXPECTED_JSON='3bcf498094749c84b4540c3912051fb0f04a02388c95a52e6525e61b79611267'
def manifest():
    packed=base64.b64decode((ROOT/'releases/companion/2026-11-17-motion-feedback/delta.xz.b64').read_text().strip(),validate=True)
    if engine.sha(packed)!=EXPECTED_PACKED:raise ValueError('Feedback payload changed')
    raw=lzma.decompress(packed,memlimit=32*1024*1024)
    if engine.sha(raw)!=EXPECTED_JSON:raise ValueError('Feedback manifest changed')
    delta=json.loads(raw);old=prior.release_manifest()
    if old['sourceRef']!='61da2ae3984c2b20a99c417cbc9e4d50df5ecfaa' or delta['sourceRef']!='8886f8c707d244469763949814f19a5f09a2a039':raise ValueError('Unexpected source')
    if delta['release']!='companion-2026-11-17-motion-feedback':raise ValueError('Unexpected release')
    if set(delta['changed'])!={'motion-controls.mjs','motion-presentation.mjs','motion-library.css','release.json'}:raise ValueError('Unexpected runtime scope')
    if set(delta['inline'])!={'motion-presentation.mjs','release.json'} or set(delta['patches'])!={'motion-controls.mjs','motion-library.css'}:raise ValueError('Unexpected delta paths')
    rows={r['path']:r for r in old['files']}
    for name,row in delta['changed'].items():
        if row['path']!=name:raise ValueError('Path mismatch')
        rows[name]=row
    m={**delta,'baseOrigin':'https://6afc5a95cfa5fd32b207590e--'+engine.TARGET,
       'baseSourceRef':old['sourceRef'],'baseRelease':old['release'],
       'baseAppSha256':rows['app.js']['sha256'],'headers':old['headers'],'files':list(rows.values()),
       'inline':{**{k:old['inline'][k] for k in ['_headers','_redirects']},**delta['inline']}}
    if len(m['files'])!=70:raise ValueError('Expected exactly 70 browser files')
    for row in m['files']:engine.path_ok(row['path'])
    return m

def browser(root,label):
    keep={'PATH','HOME','TMPDIR','RUNNER_TEMP','BROWSER_MODULE_DIR','EVIDENCE_DIR','PLAYWRIGHT_BROWSERS_PATH','LANG'}
    subprocess.run(['node','scripts/verify-companion-feedback.mjs',root,label],env={k:v for k,v in os.environ.items() if k in keep},check=True,timeout=420)

def record(data):
    if data['status'] in ['published-http-and-browser-verified','already-published-and-verified']:data.update(outputFilesVerified=70,servedFilesVerified=68,routingConfigurationsVerified=2)
    data['checkedAtUtc']=engine.datetime.datetime.now(engine.datetime.timezone.utc).isoformat()
    (ROOT/'companion-feedback-publication.json').write_text(json.dumps(data,indent=2)+'\n');print('PUBLICATION_RESULT',json.dumps(data),flush=True)

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('action',choices=['build','verify','publish']);a=p.parse_args()
    try:
        m=manifest();engine.BASE=m['baseOrigin'];engine.SITE=ROOT/'companion-feedback-site';engine.browser=browser;engine.record=record
        if a.action=='build':engine.build(m)
        elif a.action=='verify':engine.verify_site(m);print('EXACT_FEEDBACK_RUNTIME_VERIFIED')
        else:engine.publish(m)
    except urllib.error.HTTPError as e:print('RELEASE_FAILED_HTTP',e.code,'No response body or credentials logged.',file=sys.stderr);sys.exit(1)
    except Exception as e:print('RELEASE_FAILED',str(e),file=sys.stderr);sys.exit(1)
