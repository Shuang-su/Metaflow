"""Transitional runtime-only release executor. No private repository credentials."""
from pathlib import Path, PurePosixPath
from concurrent.futures import ThreadPoolExecutor
import base64,gzip,hashlib,io,json,os,subprocess,sys,tarfile,time,urllib.parse,urllib.request,urllib.error,zipfile
TARGET='polite-semolina-b478fc.netlify.app';ORIGIN='https://'+TARGET
BASELINE_DEPLOY='6af9bce566091757a2aea7c8'
BASELINE_REF='d5785c9b87079f6c4b9a2c16978e0d5cdd2f418a'
BASELINE_APP='4045a3ebcbbe651612d57cf43d7aa25a04c97b07e3b2f0a77ca721028a23995f'
ROOT=Path('companion-site')

def digest(data):return hashlib.sha256(data).hexdigest()
def manifest():
    raw=Path('scripts/companion-release-20261116.json.gz').read_bytes()
    if digest(raw)!=os.environ['PAYLOAD_SHA256']:raise RuntimeError('Release payload identity mismatch')
    with gzip.GzipFile(fileobj=io.BytesIO(raw)) as f:data=f.read(3000001)
    if len(data)>3000000:raise RuntimeError('Release metadata exceeds budget')
    m=json.loads(data)
    if m['sourceRef']!=os.environ['EXPECTED_SOURCE_REF'] or m['release']!='companion-2026-11-16-motion-library':raise RuntimeError('Unapproved source')
    if not 30<=len(m['files'])<=100:raise RuntimeError('Unexpected file count')
    names=set()
    for row in m['files']:
        p=PurePosixPath(row['path'])
        if p.is_absolute() or '..' in p.parts or '\\' in row['path'] or row['path'] in names:raise RuntimeError('Unsafe release path')
        names.add(row['path'])
        if not 0<row['bytes']<60000000:raise RuntimeError('Invalid file budget')
    return m

def download(url,limit):
    u=urllib.parse.urlsplit(url)
    allowed={BASELINE_DEPLOY+'--'+TARGET,'downloads.vrp.moe','registry.npmjs.org'}
    if u.scheme!='https' or u.hostname not in allowed or u.username or u.password:raise RuntimeError('Unapproved public asset source')
    class Redirect(urllib.request.HTTPRedirectHandler):
        def redirect_request(self,req,fp,code,msg,headers,newurl):
            v=urllib.parse.urlsplit(newurl)
            if v.scheme!='https' or v.hostname not in allowed:raise RuntimeError('Cross-origin redirect refused')
            return super().redirect_request(req,fp,code,msg,headers,newurl)
    req=urllib.request.Request(url,headers={'User-Agent':'MetaFlow-public-motion-inspection/1.0'})
    with urllib.request.build_opener(Redirect()).open(req,timeout=60) as r:data=r.read(limit+1)
    if len(data)>limit:raise RuntimeError('Asset exceeds size limit')
    return data

def verify(row,data):
    if len(data)!=row['bytes'] or digest(data)!=row['sha256']:raise RuntimeError('Artifact mismatch: '+row['path'])

def build(m):
    if ROOT.exists():raise RuntimeError('Output already exists; refusing to overwrite')
    ROOT.mkdir();rows={r['path']:r for r in m['files']}
    def put(name,data):
        row=rows[name];verify(row,data);p=ROOT/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes(data)
    for row in m['files']:
        if 'text' in row:put(row['path'],row['text'].encode())
    def remote(row):
        if 'url' in row:put(row['path'],download(row['url'],row['bytes']))
    with ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(remote,m['files']))
    for package in m['archives']:
        data=download(package['url'],package.get('bytes',5000000))
        if 'sha256' in package and digest(data)!=package['sha256']:raise RuntimeError('Archive digest mismatch')
        if 'integrity' in package:
            kind,expected=package['integrity'].split('-',1)
            if kind!='sha512' or base64.b64encode(hashlib.sha512(data).digest()).decode()!=expected:raise RuntimeError('npm integrity mismatch')
        if package['format']=='zip':
            with zipfile.ZipFile(io.BytesIO(data)) as z:
                for member,dest in package['members'].items():
                    if z.getinfo(member).file_size!=rows[dest]['bytes']:raise RuntimeError('Archive member size mismatch')
                    put(dest,z.read(member))
        else:
            with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as t:
                for member,dest in package['members'].items():
                    obj=t.getmember(member)
                    if not obj.isfile() or obj.size!=rows[dest]['bytes']:raise RuntimeError('Unsafe npm archive member')
                    put(dest,t.extractfile(obj).read())
    for row in m['files']:verify(row,(ROOT/row['path']).read_bytes())
    if list(ROOT.glob('assets/motions/VRMA_*.vrma')) or (ROOT/'assets/motions/Idle_Waiting.vrma').exists():raise RuntimeError('Restricted motion leaked into public artifact')
    print('EXACT_TESTED_RUNTIME_RECONSTRUCTED',m['sourceRef'],len(rows),flush=True)

def api(path,data=None,method=None):
    token=os.environ.get('NETLIFY_AUTH_TOKEN','')
    if not token:raise RuntimeError('Protected deployment credential unavailable')
    body=json.dumps(data).encode() if isinstance(data,dict) else data
    req=urllib.request.Request('https://api.netlify.com/api/v1/'+path,data=body,method=method,headers={'Authorization':'Bearer '+token,'Content-Type':'application/json' if isinstance(data,dict) else 'application/octet-stream'})
    with urllib.request.urlopen(req,timeout=60) as r:raw=r.read(4000000)
    return json.loads(raw) if raw else {}

def public(root,path,limit=5000000):
    req=urllib.request.Request(root.rstrip('/')+'/'+path+'?v='+os.environ['EXPECTED_SOURCE_REF'],headers={'Cache-Control':'no-cache'})
    with urllib.request.urlopen(req,timeout=40) as r:data=r.read(limit+1)
    if len(data)>limit:raise RuntimeError('Public verification limit exceeded')
    return data

def smoke(m,root):
    def check(row):
        if row['path'].startswith('_') or row['bytes']>5000000:return
        verify(row,public(root,row['path']))
    with ThreadPoolExecutor(max_workers=5) as pool:list(pool.map(check,m['files']))

def browser(root,label):
    keep={'PATH','HOME','TMPDIR','RUNNER_TEMP','BROWSER_MODULE_DIR','EVIDENCE_DIR','PLAYWRIGHT_BROWSERS_PATH','LANG','LC_ALL'}
    env={k:v for k,v in os.environ.items() if k in keep}
    subprocess.run(['node','scripts/verify-companion-motion-release.mjs',root,label],env=env,check=True,timeout=300)

def publish(m):
    site=api('sites/'+TARGET)
    if site.get('name')!='polite-semolina-b478fc' or not any(urllib.parse.urlparse(site.get(k,'') or '').hostname==TARGET for k in ['url','ssl_url']):raise RuntimeError('Wrong site')
    sid=site['id'];previous=site.get('published_deploy') or {};old=previous.get('id')
    if not old or previous.get('locked'):raise RuntimeError('Locked or unidentified baseline')
    current=json.loads(public(ORIGIN,'release.json'))
    if current.get('gitRef')==m['sourceRef']:
        smoke(m,ORIGIN);browser(ORIGIN,'production');result={'status':'already-published-verified','deployId':old,'sourceRef':m['sourceRef'],'url':ORIGIN}
    else:
        if old!=BASELINE_DEPLOY or current.get('gitRef')!=BASELINE_REF or digest(public(ORIGIN,'app.js'))!=BASELINE_APP:raise RuntimeError('Production baseline changed; no overwrite')
        files={};by_hash={}
        for row in m['files']:
            b=(ROOT/row['path']).read_bytes();verify(row,b);h=hashlib.sha1(b).hexdigest();files['/'+row['path']]=h;by_hash[h]=(row['path'],b)
        deploy=api('sites/'+sid+'/deploys',{'files':files,'draft':True,'title':'Complete companion motion library '+m['sourceRef'][:10]},'POST');did=deploy['id'];print('DRAFT',did,flush=True)
        for h in deploy.get('required',[]):
            name,data=by_hash[h];api('deploys/'+did+'/files/'+urllib.parse.quote(name,safe='/'),data,'PUT')
        for _ in range(60):
            deploy=api('deploys/'+did)
            if deploy.get('state')=='ready':break
            if deploy.get('state')=='error':raise RuntimeError('Draft failed')
            time.sleep(2)
        else:raise RuntimeError('Draft readiness timeout')
        preview=deploy.get('deploy_ssl_url') or deploy.get('deploy_url')
        if urllib.parse.urlsplit(preview).hostname!=did+'--'+TARGET:raise RuntimeError('Unexpected preview hostname')
        smoke(m,preview);browser(preview,'preview')
        if (api('sites/'+sid).get('published_deploy') or {}).get('id')!=old:raise RuntimeError('Concurrent publication; no promotion')
        api('sites/'+sid+'/deploys/'+did+'/restore',{},'POST')
        try:
            time.sleep(2);smoke(m,ORIGIN);browser(ORIGIN,'production')
        except Exception:
            if (api('sites/'+sid).get('published_deploy') or {}).get('id')==did:api('sites/'+sid+'/deploys/'+old+'/restore',{},'POST')
            Path('publication-result.json').write_text(json.dumps({'status':'rolled-back','failedDeployId':did,'restoredDeployId':old})+'\n');raise
        result={'status':'published-http-and-browser-verified','url':ORIGIN,'preview':preview,'deployId':did,'previousDeployId':old,'sourceRef':m['sourceRef'],'release':m['release'],'catalogue':{'total':16,'bundled':7,'localImport':8,'originalSourceRequired':1},'files':len(m['files'])}
    Path('publication-result.json').write_text(json.dumps(result,indent=2)+'\n');print('PUBLISHED_AND_VERIFIED',json.dumps(result),flush=True)

if __name__=='__main__':
    try:
        m=manifest()
        if sys.argv[1]=='build':build(m)
        elif sys.argv[1]=='publish':publish(m)
        else:raise ValueError('Unknown command')
    except urllib.error.HTTPError as e:print('HTTP_FAILURE',e.code,'response and credentials not logged',file=sys.stderr);sys.exit(1)
    except Exception as e:print('RELEASE_FAILURE',str(e),file=sys.stderr);sys.exit(1)
