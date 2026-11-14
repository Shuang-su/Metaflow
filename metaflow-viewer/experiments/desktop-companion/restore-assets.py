"""Build the independent static site without adding model binaries to Git.
Uses the user's existing public runtime and an integrity-checked official npm
package for the complete MediaPipe wasm directory. No credentials or uploads.
"""
from pathlib import Path,PurePosixPath
import urllib.request,urllib.parse,json,hashlib,shutil,re,io,tarfile,base64
ROOT=Path(__file__).resolve().parent
OUT=ROOT/'dist';ORIGIN='https://polite-semolina-b478fc.netlify.app/'
records={}
def download(url,limit=60_000_000):
    with urllib.request.urlopen(urllib.request.Request(url,headers={'User-Agent':'MetaFlow-companion-build/1.0'}),timeout=60) as r:
        if r.status!=200:raise ValueError('Download failed')
        b=r.read(limit+1)
        if len(b)>limit:raise ValueError('Download too large')
        return b

def put(name,data,url,expected=None):
    rel=PurePosixPath(name)
    if rel.is_absolute() or '..' in rel.parts:raise ValueError('Unsafe asset path')
    digest=hashlib.sha256(data).hexdigest()
    if expected and digest!=expected:raise ValueError('Integrity mismatch: '+name)
    dest=OUT/name;dest.parent.mkdir(parents=True,exist_ok=True);dest.write_bytes(data)
    records[name]={'url':url,'bytes':len(data),'sha256':digest}

if __name__=='__main__':
    if OUT.exists():shutil.rmtree(OUT)
    OUT.mkdir()
    for p in ROOT.iterdir():
        if p.suffix in ['.js','.mjs','.css','.html'] and not any(x in p.name for x in ['.test.','e2e']):shutil.copy2(p,OUT/p.name)
    shutil.copytree(ROOT/'assets',OUT/'assets',dirs_exist_ok=True)
    queue=['vendor/three.module.js','vendor/three-vrm.module.min.js','vendor/GLTFLoader.js','vendor/fflate/browser.mjs','vendor/mediapipe/vision_bundle.mjs']
    seen=set()
    while queue:
        name=queue.pop(0)
        if name in seen:continue
        if not name.startswith('vendor/') or '..' in PurePosixPath(name).parts:raise ValueError('Unsafe module reference')
        seen.add(name);url=urllib.parse.urljoin(ORIGIN,name);data=download(url,8_000_000)
        if data.lstrip().startswith(b'<'):raise ValueError('HTML instead of JavaScript: '+name)
        put(name,data,url)
        text=data.decode()
        for ref in re.findall(r'(?:from\s*|import\s*\(?)[\"\x27]([^\"\x27]+)[\"\x27]',text):
            if ref.startswith('.') and ref.endswith(('.js','.mjs')):
                absolute=urllib.parse.urljoin(url,ref)
                if urllib.parse.urlparse(absolute).netloc!=urllib.parse.urlparse(ORIGIN).netloc:raise ValueError('Unexpected module origin')
                queue.append(urllib.parse.urlparse(absolute).path.lstrip('/'))
    for name in ['vendor/three.LICENSE.txt','vendor/three-vrm.LICENSE.txt','vendor/fflate/LICENSE.txt']:
        put(name,download(ORIGIN+name,100000),ORIGIN+name)
    package=json.loads(download('https://registry.npmjs.org/@mediapipe%2ftasks-vision/0.10.32',200000))
    dist=package['dist'];url=dist['tarball']
    if urllib.parse.urlparse(url).hostname!='registry.npmjs.org':raise ValueError('Unexpected package registry')
    data=download(url)
    algorithm,expected=dist['integrity'].split('-',1)
    if algorithm!='sha512' or base64.b64encode(hashlib.sha512(data).digest()).decode()!=expected:raise ValueError('MediaPipe registry integrity mismatch')
    with tarfile.open(fileobj=io.BytesIO(data),mode='r:gz') as tar:
        for m in tar:
            if not m.isfile() or m.size>25_000_000:continue
            if m.name.startswith('package/wasm/') or m.name in ['package/LICENSE','package/README.md','package/package.json']:
                rel=m.name.removeprefix('package/')
                if '..' in PurePosixPath(rel).parts:raise ValueError('Unsafe archive member')
                put('vendor/mediapipe/'+rel,tar.extractfile(m).read(),url)
    face='https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
    put('vendor/mediapipe/face_landmarker.task',download(face,15_000_000),face)
    models={
      'assets/milky-green-reconstruction.vrm':'e4e277ebba12f3b07dde4bfcbe5664147e69a787ee2e40c14f6facae9d588ac8',
      'assets/wenjing.vrm.gz':'4e417a506cfe61b8c3fed49668b60c81a4b097ef4351830f774aa74992fcc67c'}
    for name,pin in models.items():put(name,download(ORIGIN+name),ORIGIN+name,pin)
    (OUT/'build-assets.json').write_text(json.dumps(records,ensure_ascii=False,indent=2)+'\n')
    (OUT/'_redirects').write_text('/about /about.html 200\n')
    (OUT/'_headers').write_text('/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(self), microphone=(), geolocation=()\n/assets/*.gz\n  Content-Type: application/gzip\n')
    print('BUILD_READY',len(records),'verified/download-recorded runtime assets',OUT)
