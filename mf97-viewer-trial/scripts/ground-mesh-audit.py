#!/usr/bin/env python3
"""Bounded, read-only triangle audit; surfaces are candidates, never published floors."""
import argparse
import hashlib
import json
import pathlib
import os
import resource
import subprocess
import sys
import numpy as np

parser=argparse.ArgumentParser()
parser.add_argument("mesh")
parser.add_argument("--output", required=True)
parser.add_argument("--stride",type=int,default=32)
parser.add_argument("--cache-root",default=os.environ.get("MF97_CACHE_ROOT","/Volumes/Prism/Metaflow/.codex-work/cache/mf97-navigation/continuation-20261002"))
parser.add_argument("--reserve-gib",type=float,default=float(os.environ.get("MF97_RESERVE_GIB","5")))
parser.add_argument("--max-added-gib",type=float,default=float(os.environ.get("MF97_MAX_ADDED_GIB","8")))
parser.add_argument("--max-rss-gib",type=float,default=float(os.environ.get("MF97_MAX_RSS_GIB","1.5")))
parser.add_argument("--task-output-mib",type=float,default=float(os.environ.get("MF97_TASK_OUTPUT_MIB","256")))
parser.add_argument("--node",default=os.environ.get("MF97_NODE","/Users/shuangsu/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node"))
args=parser.parse_args()
if args.stride<1:raise ValueError("Stride must be positive")
app=pathlib.Path(__file__).resolve().parent.parent
writer=[args.node,str(app/"node_modules/tsx/dist/cli.mjs"),str(app/"src/offline-resources.ts"),
    "--cache-root",args.cache_root,"--reserve-gib",str(args.reserve_gib),"--max-added-gib",str(args.max_added_gib),
    "--max-rss-gib",str(args.max_rss_gib),"--task-output-mib",str(args.task_output_mib)]
subprocess.run(writer+["--check","--check-output",args.output],check=True,capture_output=True,text=True)
def check_memory():
    rss=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss*(1 if sys.platform=="darwin" else 1024)
    if rss>args.max_rss_gib*1024**3:raise RuntimeError("MF97 Python RSS limit exceeded")
check_memory()
path=pathlib.Path(args.mesh)
with path.open("rb") as stream:
    header=b""
    while not header.endswith(b"end_header\n"):
        line=stream.readline()
        if not line or len(header)>16384:raise ValueError("Invalid PLY header")
        header+=line
lines=header.decode().splitlines()
if "format binary_little_endian 1.0" not in lines:raise ValueError("Only binary little endian triangle PLY supported")
vertices=int(next(x.split()[-1] for x in lines if x.startswith("element vertex ")))
faces=int(next(x.split()[-1] for x in lines if x.startswith("element face ")))
vertex_properties=lines[lines.index(f"element vertex {vertices}")+1:lines.index(f"element face {faces}")]
if vertex_properties!=["property float x","property float y","property float z"]:raise ValueError("Unexpected vertex layout")
points=np.memmap(path,dtype="<f4",mode="r",offset=len(header),shape=(vertices,3))
triangles=np.memmap(path,dtype=np.dtype([("n","u1"),("ids","<u4",(3,))]),mode="r",offset=len(header)+vertices*12,shape=(faces,))
sample=triangles[::args.stride]
if not (sample["n"]==3).all():raise ValueError("Nontriangular face layout")
xyz=points[sample["ids"]]
check_memory()
normals=np.cross(xyz[:,1]-xyz[:,0],xyz[:,2]-xyz[:,0]);magnitude=np.linalg.norm(normals,axis=1)
normals/=np.maximum(magnitude,1e-12)[:,None];centers=xyz.mean(axis=1)
axis_areas=[float(np.sum(magnitude[np.abs(normals[:,a])>.94])*args.stride/2) for a in range(3)]
axis=int(np.argmax(axis_areas));horizontal=(np.abs(normals[:,axis])>.97)&(magnitude>.0002)
heights=centers[horizontal,axis];areas=magnitude[horizontal]*args.stride/2;bands=np.floor(heights/.25).astype(int)
hist=sorted([{"heightMin":float(k*.25),"estimatedHorizontalArea":float(areas[bands==k].sum())} for k in np.unique(bands)],key=lambda x:-x["estimatedHorizontalArea"])
axes=[a for a in range(3) if a!=axis];cells=np.floor(centers[horizontal][:,axes]).astype(int);columns={}
for cell,height,area in zip(cells,heights,areas):columns.setdefault(tuple(int(v) for v in cell),[]).append((float(height),float(area)))
overlap=[]
for cell,values in columns.items():
    groups=[]
    for height,area in sorted(values):
        if not groups or height-groups[-1][0]>.5:groups.append([height,area])
        else:groups[-1][1]+=area
    strong=[g for g in groups if g[1]>.15]
    if len(strong)>1 and strong[-1][0]-strong[0][0]>2:overlap.append({"cell":cell,"heightAreaGroups":strong})
digest=hashlib.sha256()
with path.open("rb") as stream:
    for block in iter(lambda:stream.read(1024*1024),b""):digest.update(block)
result={"version":1,"asset":"huafa-p1","sourceFile":str(path),"sourceHash":digest.hexdigest(),"vertexCount":vertices,"faceCount":faces,"faceSampleStride":args.stride,
    "bounds":{"min":points.min(axis=0).tolist(),"max":points.max(axis=0).tolist()},"axisAlignedAreaEstimates":axis_areas,"inferredUpAxis":axis,
    "axisConfirmedByAuthoringMetadata":False,"topHeightBands":hist[:16],"multiSurfaceCellCount":len(overlap),"examples":overlap[:12],
    "confirmedWalkableFloors":0,"collisionAssetAvailable":False,"sourceModified":False,
    "interpretation":"triangle geometry demonstrates stacked surface candidates; ceiling/roof/fixture distinction, registration and stair walkability still require review"}
data=json.dumps(result,separators=(",",":"))
check_memory()
subprocess.run(writer+["--write-json",args.output],input=data,check=True,capture_output=True,text=True)
print(json.dumps({k:v for k,v in result.items() if k not in ["examples","topHeightBands"]}))
