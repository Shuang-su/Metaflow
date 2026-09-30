import type { VoxelCollision } from '../../../metaflow-viewer/src/collision/voxel-collision';
import type { GroundBounds, GroundSpan } from './types';
export type VoxelSource = { collision: VoxelCollision; min: number[]; max: number[]; flipXY: boolean };

/** Traverse only the two Y children intersecting a column; no dense scene allocation. */
export function solidColumn(source: VoxelSource, ix: number, iz: number): [number,number][] {
    const c=source.collision, runs: [number,number][]=[];
    if(ix<0 || iz<0 || ix>=c.numVoxelsX || iz>=c.numVoxelsZ || !c.nodes.length) return runs;
    const bx=ix>>2, bz=iz>>2, stride=c.nodeStride;
    const visit=(index:number, level:number, yBase:number) => {
        const word=c.nodes[index*stride]>>>0;
        if ((stride===2 && word===0xff) || (stride===1 && word===0xff000000)) {
            runs.push([yBase*4,Math.min(c.numVoxelsY,(yBase+2**level)*4)]); return;
        }
        const mask=stride===2 ? word&255 : word>>>24;
        const base=stride===2 ? c.nodes[index*2+1]>>>0 : word&0xffffff;
        if(!mask || level===0) {
            let start=-1;
            for(let y=0;y<4;y++) {
                const iy=yBase*4+y, solid=iy<c.numVoxelsY && c.isVoxelSolid(ix,iy,iz);
                if(solid && start<0)start=iy;
                if(!solid && start>=0){runs.push([start,iy]);start=-1;}
            }
            if(start>=0)runs.push([start,Math.min(c.numVoxelsY,yBase*4+4)]);
            return;
        }
        const half=2**(level-1), bitX=(bx>>>(level-1))&1, bitZ=(bz>>>(level-1))&1;
        for(let y=0;y<2;y++) {
            const oct=bitX+2*y+4*bitZ;
            if(!(mask&(1<<oct)))continue;
            let n=mask&((1<<oct)-1), offset=0;
            while(n){n&=n-1;offset++;}
            visit(base+offset,level-1,yBase+y*half);
        }
    };
    visit(0,c.treeDepth,0);
    runs.sort((a,b)=>a[0]-b[0]);
    const merged:[number,number][]=[];
    for(const r of runs){ const last=merged[merged.length-1]; if(last && r[0]<=last[1])last[1]=Math.max(last[1],r[1]);else merged.push([...r]); }
    return merged;
}

export function worldBounds(source:VoxelSource):GroundBounds {
    const {min,max,flipXY:f}=source;
    return {min:{x:f?-max[0]:min[0],y:f?-max[1]:min[1],z:min[2]},max:{x:f?-min[0]:max[0],y:f?-min[1]:max[1],z:max[2]}};
}

/** All supporting strata are retained, including floors disconnected from the spawn. */
export function extractSpans(source:VoxelSource,bounds:GroundBounds,stride=1,minClearance=1.7):{spans:GroundSpan[];columns:number} {
    const c=source.collision,r=c.voxelResolution,f=source.flipXY;
    const rawMinX=f?-bounds.max.x:bounds.min.x, rawMaxX=f?-bounds.min.x:bounds.max.x;
    const x0=Math.max(0,Math.floor((rawMinX-source.min[0])/r)),x1=Math.min(c.numVoxelsX,Math.ceil((rawMaxX-source.min[0])/r));
    const z0=Math.max(0,Math.floor((bounds.min.z-source.min[2])/r)),z1=Math.min(c.numVoxelsZ,Math.ceil((bounds.max.z-source.min[2])/r));
    const spans:GroundSpan[]= [];let columns=0;
    for(let ix=x0;ix<x1;ix+=stride)for(let iz=z0;iz<z1;iz+=stride){
        columns++;const runs=solidColumn(source,ix,iz);
        for(let i=0;i<runs.length;i++){
            const [lo,hi]=runs[i];
            // Outside grid bounds is unknown, so an edge cannot supply synthetic headroom.
            const clearance=f ? (lo-(runs[i-1]?.[1]??0))*r : ((runs[i+1]?.[0]??c.numVoxelsY)-hi)*r;
            if(clearance+1e-7<minClearance)continue;
            const rawY=source.min[1]+(f?lo:hi)*r;
            const y=f?-rawY:rawY;
            if(y<bounds.min.y || y>bounds.max.y)continue;
            spans.push({x:(f?-1:1)*(source.min[0]+(ix+.5)*r),y,z:source.min[2]+(iz+.5)*r,
                ix,iy:f?lo:hi-1,iz,thickness:(hi-lo)*r,clearance});
        }
    }
    return {spans,columns};
}
