import { VoxelCollision } from '../../../metaflow-viewer/src/collision/voxel-collision';
import type { SparseEdit } from './types';
type Meta=ConstructorParameters<typeof VoxelCollision>[0];
type Node={kind:'source';index:number;level:number}|{kind:'solid'}|{kind:'leaf';lo:number;hi:number}|{kind:'branch';children:(Node|null)[]};

/** Copy-on-write edited octree spines, then repack v1.1. Never allocates a dense voxel grid. */
export function materializeVoxel(metadata:Meta,original:VoxelCollision,edits:SparseEdit[]){
    const unique=new Map<string,SparseEdit>(),blocks=new Set<string>();
    for(const e of edits){
        if(![e.ix,e.iy,e.iz].every(Number.isInteger) || e.ix<0 || e.iy<0 || e.iz<0 ||
            e.ix>=original.numVoxelsX || e.iy>=original.numVoxelsY || e.iz>=original.numVoxelsZ)throw Error('Patch outside source grid');
        if(original.isVoxelSolid(e.ix,e.iy,e.iz)!==e.before || e.before===e.after)throw Error('Patch before-mask mismatch');
        const k=`${e.ix},${e.iy},${e.iz}`,old=unique.get(k);
        if(old && old.after!==e.after)throw Error('Conflicting edits');unique.set(k,e);blocks.add(`${e.ix>>2},${e.iy>>2},${e.iz>>2}`);
    }
    const children=(node:Node|null,level:number):(Node|null)[]=>{
        if(!node)return Array(8).fill(null);
        if(node.kind==='branch')return node.children;
        if(node.kind==='solid')return Array.from({length:8},()=>({kind:'solid'} as Node));
        if(node.kind!=='source')throw Error('Unexpected leaf above block level');
        const word=original.nodes[node.index*original.nodeStride]>>>0,mask=original.nodeStride===2?word&255:word>>>24;
        const solid=original.nodeStride===2?word===255:word===0xff000000;
        if(solid)return Array.from({length:8},()=>({kind:'solid'} as Node));
        if(!mask)throw Error('Mixed leaf above block level');
        const base=original.nodeStride===2?original.nodes[node.index*2+1]>>>0:word&0xffffff;
        let offset=0;return Array.from({length:8},(_,oct)=>mask&(1<<oct)?{kind:'source',index:base+offset++,level:level-1}:null);
    };
    function leaf(node:Node|null):[number,number]{
        if(!node)return[0,0];if(node.kind==='solid')return[0xffffffff,0xffffffff];
        if(node.kind==='leaf')return[node.lo,node.hi];if(node.kind==='branch')throw Error('Unexpected branch at block level');
        const word=original.nodes[node.index*original.nodeStride]>>>0;
        if(original.nodeStride===2?word===255:word===0xff000000)return[0xffffffff,0xffffffff];
        const base=original.nodeStride===2?original.nodes[node.index*2+1]>>>0:word&0xffffff;
        return[original.leafData[base*2]>>>0,original.leafData[base*2+1]>>>0];
    }
    function edit(node:Node|null,level:number,e:SparseEdit):Node|null{
        if(level===0){let[lo,hi]=leaf(node);const bit=(e.iz&3)*16+(e.iy&3)*4+(e.ix&3),mask=1<<(bit&31);
            if(bit<32)lo=(e.after?lo|mask:lo&~mask)>>>0;else hi=(e.after?hi|mask:hi&~mask)>>>0;
            if(!lo&&!hi)return null;if(lo===0xffffffff&&hi===0xffffffff)return{kind:'solid'};return{kind:'leaf',lo,hi};}
        const ch=children(node,level),oct=(((e.ix>>2)>>>(level-1))&1)+2*(((e.iy>>2)>>>(level-1))&1)+4*(((e.iz>>2)>>>(level-1))&1);
        ch[oct]=edit(ch[oct],level-1,e);if(ch.every(c=>!c))return null;return{kind:'branch',children:ch};
    }
    let root:Node|null=original.nodes.length?{kind:'source',index:0,level:original.treeDepth}:null;
    for(const e of unique.values())root=edit(root,original.treeDepth,e);
    const nodes:number[]=root?[0]:[],leafWords:number[]=[],queue:{node:Node;index:number;level:number}[]=root?[{node:root,index:0,level:original.treeDepth}]:[];
    let interiors=0,mixed=0;
    for(let cursor=0;cursor<queue.length;cursor++){
        const {node,index,level}=queue[cursor];
        const word=node.kind==='source'?original.nodes[node.index*original.nodeStride]>>>0:0;
        const isSolid=node.kind==='solid' || node.kind==='source' && (original.nodeStride===2?word===255:word===0xff000000);
        if(isSolid){nodes[index]=0xff000000;continue;}
        if(level===0 || node.kind==='leaf'){
            const [lo,hi]=leaf(node),offset=leafWords.length/2;if(offset>0xffffff)throw Error('v1.1 mixed-leaf capacity');
            nodes[index]=offset;leafWords.push(lo,hi);mixed++;continue;
        }
        const ch=children(node,level),present=ch.map((n,oct)=>({n,oct})).filter(v=>v.n),base=nodes.length;
        if(base+present.length>0xffffff)throw Error('v1.1 node capacity');
        let mask=0;for(const {n,oct}of present){mask|=1<<oct;const next=nodes.length;nodes.push(0);queue.push({node:n!,index:next,level:level-1});}
        nodes[index]=((mask<<24)|base)>>>0;interiors++;
    }
    const packed=new Uint32Array(nodes.length+leafWords.length);packed.set(nodes);packed.set(leafWords,nodes.length);
    const meta={...metadata,version:'1.1',nodeCount:nodes.length,leafDataCount:leafWords.length,numInteriorNodes:interiors,numMixedLeaves:mixed};
    delete (meta as any).nodeStride;delete (meta as any).nodeWordCount;
    const collision=new VoxelCollision(meta,packed.subarray(0,nodes.length),packed.subarray(nodes.length));
    let changed=0;
    for(const block of blocks){const [bx,by,bz]=block.split(',').map(Number);
        for(let z=bz*4;z<bz*4+4;z++)for(let y=by*4;y<by*4+4;y++)for(let x=bx*4;x<bx*4+4;x++){
            const before=original.isVoxelSolid(x,y,z),after=collision.isVoxelSolid(x,y,z),e=unique.get(`${x},${y},${z}`);
            if(before!==after){if(!e || e.before!==before || e.after!==after)throw Error('Structural difference outside accepted voxel edits');changed++;}
            else if(e)throw Error('Accepted voxel edit missing after materialization');
        }
    }
    if(changed!==unique.size)throw Error('Accepted edit count mismatch');
    return{metadata:meta,binary:new Uint8Array(packed.buffer),collision,validation:{changedVoxelCount:changed,changedBlockCount:blocks.size,
        unchangedSourceSubtreesReused:true,allChangedBlockBitsChecked:true,gridBoundsPreserved:true,sourceVersion:metadata.version,outputVersion:'1.1',nativeValidation:'pending'}};
}
