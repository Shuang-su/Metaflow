"""Publish one approved companion artifact, with draft verification and rollback."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, os, subprocess, sys, time, urllib.error, urllib.parse, urllib.request

TARGET='polite-semolina-b478fc.netlify.app'
ORIGIN='https://'+TARGET
TOKEN=os.environ.get('NETLIFY_AUTH_TOKEN','')
EXPECTED_REF=os.environ.get('EXPECTED_SOURCE_REF','')
ROOT=Path(os.environ.get('SITE_DIR','site')).resolve()
BASELINE_APP='1f0762b8b7e74520c405b6c1ba1b524dba199c8d23ffc2c0cae87a97a6ab6c5f'
BASELINE_REF='ff5204c8dff1e43d7c426575425231b9621657f7'
RELEASE='companion-2026-11-15.1'
SMOKE_FILES=['release.json','index.html','about.html','app.js','renderer.js','styles.css','experience.css','experience.mjs','device-detection.mjs','room-details.mjs','head-estimator.mjs','palm-facing.mjs','tracking.mjs','tracking-preview.mjs','mobile.mjs','companion-controls.mjs','assets/terrace-kit.glb','assets/terrace-provenance.json']

def api(path,data=None,method=None):
    payload=json.dumps(data).encode() if isinstance(data,dict) else data
    req=urllib.request.Request('https://api.netlify.com/api/v1/'+path,data=payload,method=method,
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json' if isinstance(data,dict) else 'application/octet-stream','User-Agent':'MetaFlow-approved-companion-release/1.1'})
    with urllib.request.urlopen(req,timeout=60) as response:
        raw=response.read(4_000_000)
        return json.loads(raw) if raw else {}

def read_public(root,path):
    url=root.rstrip('/')+'/'+path+'?release='+EXPECTED_REF
    with urllib.request.urlopen(urllib.request.Request(url,headers={'Cache-Control':'no-cache'}),timeout=40) as response:
        if response.status!=200:raise RuntimeError('Public smoke returned non-200')
        raw=response.read(3_000_001)
        if len(raw)>3_000_000:raise RuntimeError('Public smoke resource exceeds verification budget')
        return raw

def smoke(root):
    def verify(name):
        actual=read_public(root,name)
        if hashlib.sha256(actual).digest()!=hashlib.sha256((ROOT/name).read_bytes()).digest():
            raise RuntimeError('Public source mismatch: '+name)
    with ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(verify,SMOKE_FILES))

def browser_smoke(root,label):
    # The browser process receives no deployment, GitHub or other credentials.
    keep={'PATH','HOME','TMPDIR','RUNNER_TEMP','BROWSER_MODULE_DIR','EVIDENCE_DIR','PLAYWRIGHT_BROWSERS_PATH','LANG','LC_ALL'}
    env={key:value for key,value in os.environ.items() if key in keep}
    if not env.get('BROWSER_MODULE_DIR'):raise RuntimeError('Remote browser verification is required')
    subprocess.run(['node','scripts/verify-desktop-companion.mjs',root,label],env=env,check=True,timeout=240)

def record(value):
    Path('publication-result.json').write_text(json.dumps(value,indent=2)+'\n')
    print('PUBLISHED_AND_VERIFIED',json.dumps(value),flush=True)

def main():
    if not TOKEN:raise RuntimeError('PUBLISH_BLOCKED: protected NETLIFY_AUTH_TOKEN unavailable; no deployment attempted')
    if not EXPECTED_REF or len(EXPECTED_REF)!=40:raise RuntimeError('Expected source SHA is required')
    release=json.loads((ROOT/'release.json').read_text())
    if release.get('gitRef')!=EXPECTED_REF or release.get('release')!=RELEASE:raise RuntimeError('Unapproved artifact source')
    site=api('sites/'+TARGET)
    if site.get('name')!='polite-semolina-b478fc' or not any(urllib.parse.urlparse(site.get(k,'') or '').hostname==TARGET for k in ['url','ssl_url']):raise RuntimeError('Exact companion target mismatch')
    sid=site['id'];old=site.get('published_deploy') or {};old_id=old.get('id')
    if not old_id or old.get('locked'):raise RuntimeError('Missing baseline or locked deployment; protection not modified')
    previous=json.loads(read_public(ORIGIN,'release.json'))
    if previous.get('gitRef')==EXPECTED_REF:
        smoke(ORIGIN);browser_smoke(ORIGIN,'production')
        record({'status':'already-published-and-browser-verified','url':ORIGIN,'deployId':old_id,'sourceRef':EXPECTED_REF,'release':RELEASE});return
    if previous.get('gitRef')!=BASELINE_REF or hashlib.sha256(read_public(ORIGIN,'app.js')).hexdigest()!=BASELINE_APP:raise RuntimeError('Production changed from approved baseline; no overwrite')
    files={};by_hash={}
    for file in sorted(ROOT.rglob('*')):
        if file.is_symlink():raise RuntimeError('Artifact symlinks are not supported')
        if not file.is_file():continue
        name='/'+file.relative_to(ROOT).as_posix();data=file.read_bytes()
        digest=hashlib.sha1(data).hexdigest();files[name]=digest;by_hash.setdefault(digest,(name,data))
    if not 25<=len(files)<=100:raise RuntimeError('Unexpected static artifact file count')
    draft=api('sites/'+sid+'/deploys',{'files':files,'draft':True,'title':'Approved companion settings / device matching / detailed scenes '+EXPECTED_REF[:10]},'POST')
    did=draft['id'];print('DRAFT_CREATED',did,'BASELINE',old_id,flush=True)
    for digest in draft.get('required',[]):
        if digest not in by_hash:raise RuntimeError('Unexpected required asset digest')
        name,data=by_hash[digest]
        api('deploys/'+did+'/files/'+urllib.parse.quote(name.lstrip('/'),safe='/'),data,'PUT')
    for _ in range(45):
        draft=api('deploys/'+did)
        if draft.get('state')=='ready':break
        if draft.get('state')=='error':raise RuntimeError('Netlify draft processing failed')
        time.sleep(2)
    else:raise RuntimeError('Netlify draft did not become ready; production unchanged')
    preview=draft.get('deploy_ssl_url') or draft.get('deploy_url')
    if not preview or urllib.parse.urlparse(preview).hostname!=did+'--'+TARGET:raise RuntimeError('Unexpected deployment preview hostname')
    smoke(preview);browser_smoke(preview,'preview')
    if (api('sites/'+sid).get('published_deploy') or {}).get('id')!=old_id:raise RuntimeError('Concurrent production change; draft not promoted')
    api('sites/'+sid+'/deploys/'+did+'/restore',{},'POST')
    try:
        last=None
        for _ in range(6):
            try:smoke(ORIGIN);last=None;break
            except Exception as error:last=error;time.sleep(2)
        if last:raise last
        browser_smoke(ORIGIN,'production')
    except Exception:
        if (api('sites/'+sid).get('published_deploy') or {}).get('id')==did:
            api('sites/'+sid+'/deploys/'+old_id+'/restore',{},'POST')
            Path('publication-result.json').write_text(json.dumps({'status':'rolled-back','failedDeployId':did,'restoredDeployId':old_id,'sourceRef':EXPECTED_REF})+'\n')
            print('ROLLED_BACK',old_id,flush=True)
        raise
    record({'status':'published-http-and-browser-verified','url':ORIGIN,'preview':preview,'deployId':did,'previousDeployId':old_id,'sourceRef':EXPECTED_REF,'release':RELEASE,'files':len(files),'verifiedResources':SMOKE_FILES})

if __name__=='__main__':
    try:main()
    except urllib.error.HTTPError as error:
        print('PUBLISH_FAILED_HTTP',error.code,'No response body or credential logged.',file=sys.stderr);sys.exit(1)
    except Exception as error:
        print('PUBLISH_FAILED',str(error),file=sys.stderr);sys.exit(1)
