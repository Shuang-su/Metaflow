import { readFileSync, existsSync, statSync, openSync, readSync, closeSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { FlippedVoxelCollision } from '../../metaflow-viewer/src/collision/voxel-collision';
import { solidColumn, type VoxelSource } from '../src/ground/spans';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
const args=process.argv.slice(2),outputIndex=args.indexOf('--output'),resources=createOfflineResources(offlineResourceOptions(args));
const base='/Volumes/Prism/Metaflow/data/Shenzhen/250917 Dayun',output=resources.resolveOutput(outputIndex<0?'ground-audits':args[outputIndex+1]);
const hash=(v:Uint8Array|string)=>createHash('sha256').update(v).digest('hex');
function save(name:string,v:unknown){resources.writeJsonAtomic(resolve(output,name),v,{replace:false});}

function visualInventory(){
    const bytes=readFileSync(resolve(base,'lod-meta.json')),model=JSON.parse(bytes.toString()),missingMeta:any[]=[],invalidMetadata:any[]=[],missingAssets:string[]=[],lfsPointers:string[]=[];
    let referencedAssets=0,assetBytes=0,presentMetadata=0;const seen=new Set<string>();
    for(const [index,relative]of model.filenames.entries()){
        const file=resolve(base,relative);if(!existsSync(file)){missingMeta.push({index,path:relative});continue;}
        const raw=readFileSync(file);let metadata:any;
        try{metadata=JSON.parse(raw.toString());}catch{
            invalidMetadata.push({index,path:relative,bytes:raw.length,format:raw[0]===255&&raw[1]===216?'jpeg-in-json-path':raw.toString('utf8',0,64).startsWith('version https://git-lfs')?'lfs-pointer':'unparseable-json'});continue;
        }presentMetadata++;
        for(const value of Object.values(metadata))if(value && typeof value==='object' && Array.isArray((value as any).files))
            for(const name of (value as any).files){const f=resolve(dirname(file),name),rel=f.slice(base.length+1);if(seen.has(f))continue;seen.add(f);referencedAssets++;
                if(!existsSync(f)){missingAssets.push(rel);continue;}assetBytes+=statSync(f).size;
                const fd=openSync(f,'r'),prefix=Buffer.alloc(64);readSync(fd,prefix,0,64,0);closeSync(fd);
                if(prefix.toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1'))lfsPointers.push(rel);
            }
    }
    const missingIds=new Set([...missingMeta,...invalidMetadata].map(m=>m.index)),missingUsage=new Map<number,{references:number;splats:number;levels:Set<string>}>();
    const visit=(node:any)=>{if(node.lods)for(const [level,lod]of Object.entries(node.lods) as any){if(!missingIds.has(lod.file))continue;
        const used=missingUsage.get(lod.file)??{references:0,splats:0,levels:new Set<string>()};used.references++;used.splats+=lod.count;used.levels.add(level);missingUsage.set(lod.file,used);}
        for(const c of node.children??[])visit(c);};visit(model.tree);
    for(const m of [...missingMeta,...invalidMetadata]){const used=missingUsage.get(m.index);Object.assign(m,{treeReferences:used?.references??0,referencedSplatsAcrossLods:used?.splats??0,levels:[...(used?.levels??[])]});}
    const result={version:1,asset:'dayun',modelManifestHash:hash(bytes),metadataCount:model.filenames.length,presentMetadata,referencedAssets,presentAssetBytes:assetBytes,
        missingMetadata:missingMeta,invalidMetadata,missingAssets,lfsPointers,completeStreamCoverage:!missingMeta.length&&!invalidMetadata.length&&!missingAssets.length&&!lfsPointers.length,
        collisionCoverageIsSeparate:true,sourceModified:false,validation:'manifest references, JSON readability, file presence/size and LFS pointer exclusion; no Gaussian image decoding'};
    save('dayun-model-inventory.json',result);console.log(JSON.stringify({...result,missingAssets:missingAssets.slice(0,12),lfsPointers:lfsPointers.slice(0,12)}));
}

function stairSamples(){
    const samples:any[]=[];
    for(const id of ['x13_z8','x13_z9','x13_z7','x10_z20']){
        const file=resolve(base,`tiled-voxel/tiles/${id}/walk.voxel.json`),json=readFileSync(file),meta=JSON.parse(json.toString()),bin=readFileSync(file.replace(/\.json$/,'.bin')),
            words=new Uint32Array(bin.buffer,bin.byteOffset,bin.byteLength/4),n=meta.nodeWordCount??meta.nodeCount;
        const collision=new FlippedVoxelCollision(meta,words.subarray(0,n),words.subarray(n)),source:VoxelSource={collision,min:meta.gridBounds.min,max:meta.gridBounds.max,flipXY:true},r=collision.voxelResolution;
        const heights=(ix:number,iz:number)=>{const runs=solidColumn(source,ix,iz);return runs.filter((v,i)=>(v[0]-(runs[i-1]?.[1]??0))*r>=1.7)
            .map(([lo])=>Math.round(-(meta.gridBounds.min[1]+lo*r)/r)).filter(y=>y*r>-10&&y*r<12);};
        const found:any[]=[];
        for(let iz=10;iz<collision.numVoxelsZ-10 && found.length<8;iz+=25){
            let last:number|undefined;const profile:{ix:number;y:number}[]=[];
            for(let ix=10;ix<collision.numVoxelsX-10;ix++){
                const levels=heights(ix,iz).sort((a,b)=>Math.abs(a-(last??0))-Math.abs(b-(last??0))),y=levels[0];
                if(y===undefined || last!==undefined&&Math.abs(y-last)>3){last=undefined;profile.push({ix,y:NaN});continue;}
                profile.push({ix,y});last=y;
            }
            const plateaus:{start:number;end:number;y:number}[]=[];
            for(const p of profile){const last=plateaus[plateaus.length-1];if(last && p.y===last.y)last.end=p.ix+1;else plateaus.push({start:p.ix,end:p.ix+1,y:p.y});}
            for(let i=0;i+3<plateaus.length && found.length<8;i++){
                const chain=plateaus.slice(i,i+4),diff=chain.slice(1).map((p,j)=>p.y-chain[j].y),sign=Math.sign(diff[0]);
                if(!sign || !diff.every(d=>Math.sign(d)===sign&&Math.abs(d)>=2&&Math.abs(d)<=3) || !chain.every(p=>p.end-p.start>=3&&p.end-p.start<=15))continue;
                // Require matching support at 0.24m to either side; retain as a geometric candidate only.
                const widthOk=chain.every(p=>[-3,3].every(dz=>heights(Math.floor((p.start+p.end)/2),iz+dz).some(h=>Math.abs(h-p.y)<=1)));
                if(!widthOk)continue;
                found.push({axis:'rawX',worldStart:{x:-(meta.gridBounds.min[0]+chain[0].start*r),y:chain[0].y*r,z:meta.gridBounds.min[2]+iz*r},
                    worldEnd:{x:-(meta.gridBounds.min[0]+chain[3].end*r),y:chain[3].y*r,z:meta.gridBounds.min[2]+iz*r},
                    treadLengths:chain.map(p=>(p.end-p.start)*r),riserHeights:diff.map(d=>d*r),neighborSupportWidth:.48,rawProfile:chain});
            }
        }
        samples.push({id,sourceHash:hash(json)+':'+hash(bin),stairCandidates:found,
            interpretation:'repeated 16/24cm rises with 24..120cm treads and neighboring support; geometry only, no native stair-route proof'});
    }
    const result={version:1,asset:'dayun',samples,sourceModified:false,confirmedStairConnections:0};save('dayun-stair-samples.json',result);
    console.log(JSON.stringify({...result,samples:samples.map(s=>({...s,stairCandidateCount:s.stairCandidates.length,stairCandidates:s.stairCandidates.slice(0,1)}))}));
}
resources.assertCapacity(0,'ground asset audit');visualInventory();stairSamples();
