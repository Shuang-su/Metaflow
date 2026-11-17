#!/usr/bin/env python3
"""Hash-locked maintenance release for the existing standalone Companion only."""
from pathlib import Path,PurePosixPath
from concurrent.futures import ThreadPoolExecutor
import argparse,base64,datetime,hashlib,json,lzma,os,shutil,subprocess,sys,time,urllib.request,urllib.error,urllib.parse
ROOT=Path(__file__).resolve().parents[1]
TARGET='polite-semolina-b478fc.netlify.app'
ORIGIN='https://'+TARGET
BASE='https://6afc2ff6bf40939437cf963a--'+TARGET
MANIFEST=ROOT/'releases/companion/2026-11-17-reliability/runtime.xz.b64'
EXPECTED_MANIFEST_SHA='714ce261d1699eab8aec35c15462bc50c6f894d2b62c9a855dbc8f23e098b6e3'
SITE=ROOT/'companion-reliability-site'
TOKEN=os.environ.get('NETLIFY_AUTH_TOKEN','')
def sha(b):return hashlib.sha256(b).hexdigest()
def path_ok(name):
    p=PurePosixPath(name)
    if not name or p.is_absolute() or '..' in p.parts or '\\' in name:raise ValueError('Unsafe release path')
    return name

def manifest():
    packed=base64.b64decode(MANIFEST.read_text().strip(),validate=True)
    if sha(packed)!='18b063af59d92efa541639346839d2bc871742856bb6d79ac05cd7472db874de':raise ValueError('Release payload changed')
    b=lzma.decompress(packed,memlimit=64*1024*1024)
    if len(b)!=24267 or sha(b)!=EXPECTED_MANIFEST_SHA:raise ValueError('Unapproved manifest digest')
    m=json.loads(b)
    if m['baseOrigin']!=BASE or len(m['files'])!=68:raise ValueError('Unexpected release scope')
    names=[path_ok(r['path']) for r in m['files']]
    if len(set(names))!=68 or any(n.startswith(('.git/','docs/','tests/')) or n.endswith(('.py','.zip','.tar')) for n in names):raise ValueError('Unexpected private or build files')
    if sum(n.endswith('.vrma') for n in names)!=7:raise ValueError('Animation redistribution scope changed')
    return m
class SameHost(urllib.request.HTTPRedirectHandler):
    def redirect_request(self,req,fp,code,msg,headers,url):
        a,b=urllib.parse.urlsplit(req.full_url),urllib.parse.urlsplit(url)
        if b.scheme!='https' or a.hostname!=b.hostname:raise ValueError('Cross-origin redirect rejected')
        return super().redirect_request(req,fp,code,msg,headers,url)
def read(url,limit):
    if urllib.parse.urlsplit(url).scheme!='https':raise ValueError('HTTPS required')
    for attempt in range(3):
        try:
            req=urllib.request.Request(url,headers={'Cache-Control':'no-cache','User-Agent':'MetaFlow-companion-release/3.0'})
            with urllib.request.build_opener(SameHost()).open(req,timeout=60) as r:b=r.read(limit+1)
            if len(b)>limit:raise ValueError('Resource over budget: '+urllib.parse.urlsplit(url).path)
            return b
        except (urllib.error.URLError,TimeoutError):
            if attempt==2:raise
            time.sleep(attempt+1)
def verify_bytes(b,row):
    if len(b)!=row['bytes'] or sha(b)!=row['sha256']:raise ValueError('Candidate mismatch: '+row['path'])
def verify_site(m):
    names={p.relative_to(SITE).as_posix() for p in SITE.rglob('*') if p.is_file()}
    if names!={r['path'] for r in m['files']}:raise ValueError('Candidate file set changed')
    for r in m['files']:
        p=SITE/r['path']
        if p.is_symlink():raise ValueError('Candidate contains symlink')
        verify_bytes(p.read_bytes(),r)
    v=json.loads((SITE/'release.json').read_text())
    if v['gitRef']!=m['sourceRef'] or v['release']!=m['release']:raise ValueError('Candidate identity mismatch')
def build(m):
    stage=ROOT/'companion-reliability-site.staging';shutil.rmtree(stage,ignore_errors=True);stage.mkdir()
    def restore(row):
        name=row['path']
        if name in m['inline']:b=m['inline'][name].encode()
        else:
            patch=m['patches'].get(name)
            b=read(BASE+'/'+urllib.parse.quote(name,safe='/'),max(row['bytes'],patch['baseBytes'] if patch else 0))
            if patch:
                if sha(b)!=patch['baseSha256']:raise ValueError('Pinned baseline changed: '+name)
                lines=b.decode().splitlines(keepends=True);last=0
                for start,stop,text in patch['ops']:
                    if not 0<=last<=start<=stop<=len(lines) or not isinstance(text,str):raise ValueError('Invalid delta')
                    last=stop
                for start,stop,text in reversed(patch['ops']):lines[start:stop]=[text]
                b=''.join(lines).encode()
        verify_bytes(b,row);dest=stage/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(b)
    with ThreadPoolExecutor(max_workers=6) as ex:list(ex.map(restore,m['files']))
    shutil.rmtree(SITE,ignore_errors=True);stage.rename(SITE);verify_site(m)
    print('EXACT_CANDIDATE_READY',m['sourceRef'],len(m['files']),flush=True)
def api(path,data=None,method=None):
    payload=json.dumps(data).encode() if isinstance(data,dict) else data
    req=urllib.request.Request('https://api.netlify.com/api/v1/'+path,data=payload,method=method,headers={'Authorization':'Bearer '+TOKEN,'Content-Type':'application/json' if isinstance(data,dict) else 'application/octet-stream'})
    with urllib.request.urlopen(req,timeout=60) as r:b=r.read(4_000_000)
    return json.loads(b) if b else {}
def remote(root,name,limit,m):return read(root.rstrip('/')+'/'+urllib.parse.quote(name,safe='/')+'?release='+m['sourceRef'],limit)
def smoke(root,m):
    def check(row):verify_bytes(remote(root,row['path'],row['bytes'],m),row)
    with ThreadPoolExecutor(max_workers=6) as ex:list(ex.map(check,[r for r in m['files'] if r['path'] not in ('_headers','_redirects')]))
    with urllib.request.urlopen(root+'/?release='+m['sourceRef'],timeout=30) as r:
        for key,value in m['headers'].items():
            if r.headers.get(key)!=value:raise ValueError('Routing header mismatch: '+key)
    about=next(r for r in m['files'] if r['path']=='about.html');verify_bytes(remote(root,'about',about['bytes'],m),about)
    print('LIVE_FILES_AND_ROUTING_VERIFIED',root,flush=True)
def browser(root,label):
    env={k:v for k,v in os.environ.items() if k in ['PATH','HOME','TMPDIR','RUNNER_TEMP','BROWSER_MODULE_DIR','EVIDENCE_DIR','PLAYWRIGHT_BROWSERS_PATH','LANG']}
    subprocess.run(['node','scripts/verify-companion-reliability.mjs',root,label],env=env,check=True,timeout=360)
def record(data):
    data['checkedAtUtc']=datetime.datetime.now(datetime.timezone.utc).isoformat();(ROOT/'companion-reliability-publication.json').write_text(json.dumps(data,indent=2)+'\n');print('PUBLICATION_RESULT',json.dumps(data),flush=True)
def publish(m):
    verify_site(m)
    if not TOKEN:raise ValueError('Protected deployment credential unavailable')
    site=api('sites/'+TARGET);sid=site['id'];old=site.get('published_deploy') or {};previous=old.get('id')
    if site.get('name')!='polite-semolina-b478fc' or not any(urllib.parse.urlsplit(site.get(k,'') or '').hostname==TARGET for k in ['url','ssl_url']) or not previous or old.get('locked'):raise ValueError('Wrong site or locked deployment')
    live=json.loads(remote(ORIGIN,'release.json',20000,m))
    if live.get('gitRef')==m['sourceRef']:
        smoke(ORIGIN,m);browser(ORIGIN,'production');record({'status':'already-published-and-verified','deployId':previous,'sourceRef':m['sourceRef'],'release':m['release'],'url':ORIGIN});return
    if live.get('gitRef')!=m['baseSourceRef'] or live.get('release')!=m['baseRelease'] or sha(remote(ORIGIN,'app.js',200000,m))!=m['baseAppSha256']:raise ValueError('Live baseline changed; no overwrite')
    files={};blobs={}
    for row in m['files']:
        b=(SITE/row['path']).read_bytes();digest=hashlib.sha1(b).hexdigest();files['/'+row['path']]=digest;blobs.setdefault(digest,(row['path'],b))
    draft=api('sites/'+sid+'/deploys',{'files':files,'draft':True,'title':'Approved Companion reliability '+m['sourceRef'][:10]},'POST');did=draft['id'];print('DRAFT_CREATED',did,flush=True)
    for digest in draft.get('required',[]):
        name,b=blobs[digest];api('deploys/'+did+'/files/'+urllib.parse.quote(name,safe='/'),b,'PUT')
    for _ in range(60):
        draft=api('deploys/'+did)
        if draft.get('state')=='ready':break
        if draft.get('state')=='error':raise ValueError('Draft rejected')
        time.sleep(2)
    else:raise ValueError('Draft timeout')
    url=draft.get('deploy_ssl_url') or draft.get('deploy_url')
    if urllib.parse.urlsplit(url).hostname!=did+'--'+TARGET:raise ValueError('Wrong draft host')
    smoke(url,m);browser(url,'preview')
    if (api('sites/'+sid).get('published_deploy') or {}).get('id')!=previous:raise ValueError('Concurrent publish; no promotion')
    api('sites/'+sid+'/deploys/'+did+'/restore',{},'POST')
    try:
        for attempt in range(4):
            try:smoke(ORIGIN,m);break
            except Exception:
                if attempt==3:raise
                time.sleep(3)
        browser(ORIGIN,'production')
    except Exception:
        rollback=(api('sites/'+sid).get('published_deploy') or {}).get('id')==did
        if rollback:api('sites/'+sid+'/deploys/'+previous+'/restore',{},'POST')
        record({'status':'verification-failed','rollbackPerformed':rollback,'failedDeployId':did,'previousDeployId':previous});raise
    record({'status':'published-http-and-browser-verified','url':ORIGIN,'preview':url,'deployId':did,'previousDeployId':previous,'sourceRef':m['sourceRef'],'release':m['release'],'candidateArtifact':m['candidateArtifact'],'candidateArtifactSha256':m['candidateArtifactSha256'],'outputFilesVerified':68,'servedFilesVerified':66,'routingConfigurationsVerified':2,'rollbackPerformed':False})
if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('action',choices=['build','verify','publish']);a=parser.parse_args()
    try:
        m=manifest()
        if a.action=='build':build(m)
        elif a.action=='verify':verify_site(m);print('CANDIDATE_VERIFIED')
        else:publish(m)
    except urllib.error.HTTPError as e:print('RELEASE_FAILED_HTTP',e.code,'No body or credential logged.',file=sys.stderr);sys.exit(1)
    except Exception as e:print('RELEASE_FAILED',str(e),file=sys.stderr);sys.exit(1)
