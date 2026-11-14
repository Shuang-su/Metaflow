"""Publish only the approved static companion artifact; preserve main-site isolation."""
from pathlib import Path
import hashlib, json, os, sys, time, urllib.error, urllib.parse, urllib.request

TARGET='polite-semolina-b478fc.netlify.app'
ORIGIN='https://'+TARGET
TOKEN=os.environ.get('NETLIFY_AUTH_TOKEN','')
EXPECTED_REF=os.environ.get('EXPECTED_SOURCE_REF','')
ROOT=Path(os.environ.get('SITE_DIR','site')).resolve()
BASELINE_APP='2b88b15cc555f5082c482e9d56e1ab65474a5dbe5a691ed9d933dfbc0b05b79d'

def api(path,data=None,method=None):
    payload=json.dumps(data).encode() if isinstance(data,dict) else data
    req=urllib.request.Request('https://api.netlify.com/api/v1/'+path,data=payload,method=method,
        headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json' if isinstance(data,dict) else 'application/octet-stream','User-Agent':'MetaFlow-approved-companion-release/1.0'})
    with urllib.request.urlopen(req,timeout=60) as response:
        raw=response.read(4_000_000)
        return json.loads(raw) if raw else {}

def read_public(root,path):
    url=root.rstrip('/')+'/'+path+'?release='+EXPECTED_REF
    with urllib.request.urlopen(urllib.request.Request(url,headers={'Cache-Control':'no-cache'}),timeout=30) as response:
        if response.status!=200:raise RuntimeError('Public smoke returned non-200')
        return response.read(2_000_000)

def smoke(root):
    for name in ['release.json','index.html','app.js','renderer.js','head-estimator.mjs','palm-facing.mjs','tracking.mjs','tracking-preview.mjs','mobile.mjs']:
        actual=read_public(root,name)
        if hashlib.sha256(actual).digest()!=hashlib.sha256((ROOT/name).read_bytes()).digest():
            raise RuntimeError('Public source mismatch: '+name)

def main():
    if not TOKEN:raise RuntimeError('PUBLISH_BLOCKED: protected NETLIFY_AUTH_TOKEN unavailable; no deployment attempted')
    if not EXPECTED_REF or len(EXPECTED_REF)!=40:raise RuntimeError('Expected source SHA is required')
    release=json.loads((ROOT/'release.json').read_text())
    if release.get('gitRef')!=EXPECTED_REF or release.get('release')!='companion-2026-11-14.2':raise RuntimeError('Unapproved artifact source')
    site=api('sites/'+TARGET)
    if site.get('name')!='polite-semolina-b478fc' or not any(urllib.parse.urlparse(site.get(k,'') or '').hostname==TARGET for k in ['url','ssl_url']):raise RuntimeError('Exact companion target mismatch')
    sid=site['id'];old=site.get('published_deploy') or {};old_id=old.get('id')
    if not old_id or old.get('locked'):raise RuntimeError('Missing baseline or locked deployment; protection not modified')
    if hashlib.sha256(read_public(ORIGIN,'app.js')).hexdigest()!=BASELINE_APP:raise RuntimeError('Production source changed since approved baseline; no overwrite')
    files={};by_hash={}
    for file in sorted(ROOT.rglob('*')):
        if file.is_symlink():raise RuntimeError('Artifact symlinks are not supported')
        if not file.is_file():continue
        name='/'+file.relative_to(ROOT).as_posix();data=file.read_bytes()
        digest=hashlib.sha1(data).hexdigest();files[name]=digest;by_hash.setdefault(digest,(name,data))
    if not 25<=len(files)<=100:raise RuntimeError('Unexpected static artifact file count')
    draft=api('sites/'+sid+'/deploys',{'files':files,'draft':True,'title':'Approved companion Air / quiet head tracking / palm fix '+EXPECTED_REF[:10]},'POST')
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
    smoke(preview)
    if (api('sites/'+sid).get('published_deploy') or {}).get('id')!=old_id:raise RuntimeError('Concurrent production change; draft not promoted')
    api('sites/'+sid+'/deploys/'+did+'/restore',{},'POST')
    try:
        last=None
        for _ in range(6):
            try:smoke(ORIGIN);last=None;break
            except Exception as error:last=error;time.sleep(2)
        if last:raise last
    except Exception:
        if (api('sites/'+sid).get('published_deploy') or {}).get('id')==did:
            api('sites/'+sid+'/deploys/'+old_id+'/restore',{},'POST')
            print('ROLLED_BACK',old_id,flush=True)
        raise
    record={'status':'published-and-http-verified','url':ORIGIN,'preview':preview,'deployId':did,'previousDeployId':old_id,'sourceRef':EXPECTED_REF,'release':release['release'],'files':len(files)}
    Path('publication-result.json').write_text(json.dumps(record,indent=2)+'\n')
    print('PUBLISHED_AND_VERIFIED',json.dumps(record),flush=True)

if __name__=='__main__':
    try:main()
    except urllib.error.HTTPError as error:
        print('PUBLISH_FAILED_HTTP',error.code,'No response body or credential logged.',file=sys.stderr);sys.exit(1)
    except Exception as error:
        print('PUBLISH_FAILED',str(error),file=sys.stderr);sys.exit(1)
