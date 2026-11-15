"""Deterministic material-batched subset of the user's metaxingtong terrace.
Retains original mesh geometry; strips textures and unrelated scene nodes.
Source archive is never changed. No credentials or third-party upload.
"""
from pathlib import Path
import json,struct,math,hashlib,urllib.request,urllib.parse,os
ROOT=Path(__file__).resolve().parent
SOURCE_PATH='scenes/terrace/05-retain-glb-material-portability-fix/files/Terrace_CompleteSpace_GLB_LZMA需兼容解压器--d2e5b9128a38/Terrace_CompleteSpace_WithoutCity.glb'
SOURCE_REF='116fe64f72afbb1e1613d39fb75980868145cae3'
SHA256='9c4551b99e20b02a8c0a29f2115f2c83bbf28ae18c5628228263d6cd8b12435d'
URL='https://raw.githubusercontent.com/Shuang-su/metaxingtong/'+SOURCE_REF+'/'+urllib.parse.quote(SOURCE_PATH,safe='/')
IDENTITY=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]
def multiply(a,b):return [sum(a[k*4+r]*b[c*4+k] for k in range(4)) for c in range(4) for r in range(4)]
def matrix(node):
    if 'matrix' in node:return node['matrix']
    x,y,z,w=node.get('rotation',[0,0,0,1]);sx,sy,sz=node.get('scale',[1,1,1]);tx,ty,tz=node.get('translation',[0,0,0])
    return [(1-2*y*y-2*z*z)*sx,(2*x*y+2*z*w)*sx,(2*x*z-2*y*w)*sx,0,(2*x*y-2*z*w)*sy,(1-2*x*x-2*z*z)*sy,(2*y*z+2*x*w)*sy,0,(2*x*z+2*y*w)*sz,(2*y*z-2*x*w)*sz,(1-2*x*x-2*y*y)*sz,0,tx,ty,tz,1]
def transform(m,p):return [sum(m[k*4+r]*p[k] for k in range(3))+m[12+r] for r in range(3)]
def normal(m,p):
    # inverse-transpose of the affine 3x3, by cofactor columns.
    a,b,c=[m[i:i+3] for i in [0,4,8]]
    cross=lambda u,v:[u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]]
    cols=[cross(b,c),cross(c,a),cross(a,b)];det=sum(a[i]*cols[0][i] for i in range(3))
    if abs(det)<1e-12:raise ValueError('Degenerate source transform')
    v=[sum(cols[k][r]*p[k] for k in range(3))/det for r in range(3)];length=math.sqrt(sum(x*x for x in v))
    return [x/(length or 1) for x in v]
def build(raw):
    if hashlib.sha256(raw).hexdigest()!=SHA256:raise ValueError('Source integrity mismatch')
    if raw[:4]!=b'glTF':raise ValueError('Not GLB')
    n=struct.unpack_from('<I',raw,12)[0];g=json.loads(raw[20:20+n]);offset=20+n;length,kind=struct.unpack_from('<II',raw,offset)
    if kind!=0x004e4942:raise ValueError('Missing BIN chunk')
    data=raw[offset+8:offset+8+length]
    def accessor(index):
        a=g['accessors'][index];v=g['bufferViews'][a['bufferView']]
        types={5126:('f',4),5125:('I',4),5123:('H',2),5121:('B',1)};code,size=types[a['componentType']]
        width={'SCALAR':1,'VEC2':2,'VEC3':3,'VEC4':4}[a['type']];stride=v.get('byteStride',width*size);start=v.get('byteOffset',0)+a.get('byteOffset',0)
        return [struct.unpack_from('<'+code*width,data,start+i*stride) for i in range(a['count'])]
    worlds={}
    def visit(i,parent):
        worlds[i]=multiply(parent,matrix(g['nodes'][i]))
        for child in g['nodes'][i].get('children',[]):visit(child,worlds[i])
    for i in g['scenes'][g.get('scene',0)]['nodes']:visit(i,IDENTITY)
    groups={name:{} for name in ['chair','table','lattice']};counts={k:0 for k in groups}
    for i,node in enumerate(g['nodes']):
        name=node.get('name','');group='chair' if name.startswith('Egg_chair') else 'table' if name.startswith('Side_table') or name=='Table_small_cup' else 'lattice' if name.startswith('CentralGrid_') else None
        if not group or 'mesh' not in node:continue
        counts[group]+=1;m=worlds.get(i,matrix(node))
        for pr in g['meshes'][node['mesh']]['primitives']:
            if pr.get('mode',4)!=4:raise ValueError('Unexpected source primitive')
            target=groups[group].setdefault(pr.get('material',0),{'p':[],'n':[],'i':[]});base=len(target['p'])
            positions=accessor(pr['attributes']['POSITION']);normals=accessor(pr['attributes']['NORMAL'])
            target['p'].extend(transform(m,p) for p in positions);target['n'].extend(normal(m,p) for p in normals)
            indices=[x[0] for x in accessor(pr['indices'])] if 'indices' in pr else list(range(len(positions)))
            target['i'].extend(x+base for x in indices)
    out={'asset':{'version':'2.0','generator':'MetaFlow metaxingtong material-batched terrace subset'},'scene':0,'scenes':[{'nodes':[]}],'nodes':[],'meshes':[],'materials':[],'bufferViews':[],'accessors':[],'buffers':[]}
    binary=bytearray();materials={};stats={}
    def buffer(values,code,ctype,typ,target):
        while len(binary)%4:binary.append(0)
        start=len(binary);flat=[v for row in values for v in row] if typ=='VEC3' else values
        binary.extend(struct.pack('<'+code*len(flat),*flat));view=len(out['bufferViews']);out['bufferViews'].append({'buffer':0,'byteOffset':start,'byteLength':len(binary)-start,'target':target})
        a={'bufferView':view,'componentType':ctype,'count':len(values),'type':typ}
        if typ=='VEC3':a.update(min=[min(v[j] for v in values) for j in range(3)],max=[max(v[j] for v in values) for j in range(3)])
        out['accessors'].append(a);return len(out['accessors'])-1
    for name,batches in groups.items():
        allp=[p for batch in batches.values() for p in batch['p']]
        if not allp:raise ValueError('Source group missing: '+name)
        low=[min(p[j] for p in allp) for j in range(3)];high=[max(p[j] for p in allp) for j in range(3)];center=[(low[0]+high[0])/2,low[1],(low[2]+high[2])/2]
        primitives=[];triangles=0
        for mid,batch in sorted(batches.items()):
            if mid not in materials:
                source=g['materials'][mid];pbr=source.get('pbrMetallicRoughness',{});color=pbr.get('baseColorFactor',[.65,.61,.53,1]);
                materials[mid]=len(out['materials']);out['materials'].append({'name':source.get('name','source material')+' / companion untextured','pbrMetallicRoughness':{'baseColorFactor':color,'roughnessFactor':max(.48,pbr.get('roughnessFactor',.8)),'metallicFactor':min(.2,pbr.get('metallicFactor',0))},'doubleSided':False})
            positions=[[p[j]-center[j] for j in range(3)] for p in batch['p']]
            pa=buffer(positions,'f',5126,'VEC3',34962);na=buffer(batch['n'],'f',5126,'VEC3',34962)
            code,ctype=('H',5123) if len(positions)<65536 else ('I',5125)
            ia=buffer(batch['i'],code,ctype,'SCALAR',34963);triangles+=len(batch['i'])//3
            primitives.append({'attributes':{'POSITION':pa,'NORMAL':na},'indices':ia,'material':materials[mid]})
        out['meshes'].append({'name':'metax-'+name,'primitives':primitives});out['nodes'].append({'name':'metax-'+name,'mesh':len(out['meshes'])-1});out['scenes'][0]['nodes'].append(len(out['nodes'])-1)
        stats[name]={'sourceNodes':counts[name],'triangles':triangles,'batches':len(batches),'dimensions':[high[j]-low[j] for j in range(3)]}
    while len(binary)%4:binary.append(0)
    out['buffers']=[{'byteLength':len(binary)}];text=json.dumps(out,separators=(',',':')).encode();text+=b' '*((-len(text))%4)
    glb=struct.pack('<III',0x46546c67,2,12+8+len(text)+8+len(binary))+struct.pack('<II',len(text),0x4e4f534a)+text+struct.pack('<II',len(binary),0x004e4942)+binary
    return glb,stats
if __name__=='__main__':
    local=os.environ.get('TERRACE_SOURCE_FILE')
    if local:raw=Path(local).read_bytes()
    else:
        with urllib.request.urlopen(URL,timeout=60) as r:raw=r.read(40_000_001)
    glb,stats=build(raw);out=ROOT/'dist/assets';out.mkdir(parents=True,exist_ok=True)
    (out/'terrace-kit.glb').write_bytes(glb)
    manifest={'sourceRepository':'Shuang-su/metaxingtong','sourceRef':SOURCE_REF,'sourcePath':SOURCE_PATH,'sourceSha256':SHA256,'sourceBytes':len(raw),'derivedBytes':len(glb),'derivedSha256':hashlib.sha256(glb).hexdigest(),'groups':stats,'adaptations':['Selected original chair, side-table and grid meshes only','Baked source transforms and centred each group at floor level','Merged primitives per material and removed texture references','Re-arranged at runtime as a mobile miniature, not the complete source room'],'sourceStatus':'Reconstruction candidate; source fidelity not accepted','authorization':'User explicitly requested reuse from their metaxingtong project'}
    (out/'terrace-provenance.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
    print('TERRACE_KIT_BUILT',json.dumps(manifest,ensure_ascii=False))
