import { surfaceIdentity } from '../../../metaflow-viewer/src/navigation/layers';
import type { GroundSpan, PlanePatch, GroundCandidate, GroundReview, GroundDecisions, SparseEdit } from './types';
import type { VoxelSource } from './spans';

const key=(x:number,z:number)=>`${x},${z}`;
const horizontalNeighbors=[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
export function proposeGround(source:VoxelSource,spans:GroundSpan[],patches:PlanePatch[],namespace:string):{protectionVersion:2;candidates:GroundCandidate[];unknownSpanCount:number} {
    const r=source.collision.voxelResolution, columns=new Map<string,GroundSpan[]>();
    for(const s of spans){const k=key(s.ix,s.iz);if(!columns.has(k))columns.set(k,[]);columns.get(k)!.push(s);}
    const used=new Set<number>(), candidates:GroundCandidate[]=[];
    for(const [patchIndex,p] of patches.entries()){
        const [nx,ny,nz,d]=p.plane;if(Math.abs(ny)<Math.cos(Math.PI/9))continue;
        const support=p.pointIndices.map(i=>spans[i]).filter(Boolean);if(support.length<20)continue;
        const target=(x:number,z:number)=>-(nx*x+nz*z+d)/ny;
        const footprint=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([a,b])=>{
            const x=p.center[0]+a*p.rotation[0][0]*p.extent[0]/2+b*p.rotation[0][1]*p.extent[1]/2;
            const z=p.center[2]+a*p.rotation[2][0]*p.extent[0]/2+b*p.rotation[2][1]*p.extent[1]/2;
            return{x,y:target(x,z),z};
        });
        const surface=surfaceIdentity(namespace,p.center[1],footprint,p.plane),id=`${surface.id}:patch:${patchIndex}`;
        // Small isolated tops can be tables/exhibits; no geometry-only rule certifies them as ground.
        if(p.extent[0]*p.extent[1]<4){
            for(const idx of p.pointIndices)used.add(idx);
            candidates.push({id,surface,status:'protected',reasons:['small-platform-or-fixture'],pointCount:support.length,edits:[],residualBefore:0,residualAfter:0});continue;
        }
        const reasons=new Set<string>(),edits:SparseEdit[]=[];let before=0,after=0;
        for(const idx of p.pointIndices){
            const s=spans[idx];if(!s)continue;used.add(idx);
            const wanted=target(s.x,s.z),delta=wanted-s.y;before+=Math.abs(delta);
            const closest=(x:number,z:number)=>columns.get(key(x,z))?.find(v=>Math.abs(v.y-s.y)<r*2.1);
            const neighbors=[closest(s.ix-1,s.iz),closest(s.ix+1,s.iz),closest(s.ix,s.iz-1),closest(s.ix,s.iz+1)];
            if(neighbors.some(v=>!v)){reasons.add('footprint-edge-or-hole');after+=Math.abs(delta);continue;}
            // A sustained plateau transition is a curb/tread, even when its height is one voxel.
            // Even a narrow strip endpoint has one same-height neighbor. Geometry cannot
            // certify a connected low structure as noise; only isolated differences qualify.
            const surrounding=horizontalNeighbors.map(([dx,dz])=>closest(s.ix+dx,s.iz+dz)).filter((v):v is GroundSpan=>!!v);
            const currentPlateau=surrounding.some(v=>Math.abs(v.y-s.y)<r*.2);
            const steppedNeighborhood=surrounding.length>1 && Math.max(...surrounding.map(v=>v.y))-Math.min(...surrounding.map(v=>v.y))>=r*.9;
            const stair=currentPlateau && neighbors.some(v=>v && Math.abs(v.y-s.y)>=r*.9 &&
                [closest(v.ix-1,v.iz),closest(v.ix+1,v.iz),closest(v.ix,v.iz-1),closest(v.ix,v.iz+1)]
                    .filter(n=>n && Math.abs(n.y-v.y)<r*.2).length>=2);
            if(stair||steppedNeighborhood){reasons.add('step-or-curb');after+=Math.abs(delta);continue;}
            if(s.thickness<r*2 || s.clearance<1.7+r){reasons.add('thin-slab-or-headroom');after+=Math.abs(delta);continue;}
            const vox=Math.round(delta/r);
            if(!vox){after+=Math.abs(delta);continue;}
            if(currentPlateau){reasons.add('coherent-platform-or-step');after+=Math.abs(delta);continue;}
            if(Math.abs(vox)>1){reasons.add('exceeds-one-source-voxel');after+=Math.abs(delta);continue;}
            // Wall/table feet: solid occupancy above the supporting surface in nearby columns.
            const rawAbove=s.iy+(source.flipXY?-1:1)*2;
            if([-2,2].some(dx=>source.collision.isVoxelSolid(s.ix+dx,rawAbove,s.iz)) ||
                [-2,2].some(dz=>source.collision.isVoxelSolid(s.ix,rawAbove,s.iz+dz))){
                reasons.add('vertical-structure');after+=Math.abs(delta);continue;
            }
            const iy=source.flipXY ? s.iy-(vox>0?1:0) : s.iy+(vox>0?1:0);
            const expected=vox<0;
            if(source.collision.isVoxelSolid(s.ix,iy,s.iz)!==expected){reasons.add('occupancy-conflict');after+=Math.abs(delta);continue;}
            edits.push({ix:s.ix,iy,iz:s.iz,before:expected,after:!expected,candidateId:id});
            after+=Math.abs(delta-vox*r);
        }
        candidates.push({id,surface,status:edits.length?'proposed':reasons.size?'protected':'unknown',
            reasons:[...reasons].sort(),pointCount:support.length,edits,residualBefore:before/support.length,residualAfter:after/support.length});
    }
    return{protectionVersion:2,candidates,unknownSpanCount:spans.length-used.size};
}

/** Legacy reports remain viewable, but cannot approve a patch under an obsolete policy. */
export function isCurrentGroundReview(review:GroundReview):boolean{
    return review.protectionVersion===2 && typeof review.analysisHash==='string' && review.analysisHash.trim().length>0;
}

/** Decisions are a separate human-reviewed artifact; absence means no voxel changes. */
export function acceptedEdits(review:GroundReview,decisions:GroundDecisions):SparseEdit[]{
    if(!isCurrentGroundReview(review))throw Error('Obsolete protection policy or missing algorithm fingerprint; rescreen report');
    if(review.sourceHash!==decisions.sourceHash || decisions.version!==1)throw Error('Review/source fingerprint mismatch');
    if(decisions.analysisHash!==review.analysisHash)throw Error('Review/algorithm fingerprint mismatch');
    const accept=new Set(decisions.acceptedCandidateIds),reject=new Set(decisions.rejectedCandidateIds);
    const available=new Set(review.candidates.map(c=>c.id));
    for(const id of [...accept,...reject])if(!available.has(id))throw Error(`Unknown candidate ${id}`);
    const edits=new Map<string,SparseEdit>();
    for(const c of review.candidates)if(accept.has(c.id)){
        if(reject.has(c.id) || c.status!=='proposed')throw Error('Invalid or contradictory acceptance');
        for(const e of c.edits){const k=`${e.ix},${e.iy},${e.iz}`,existing=edits.get(k);
            if(existing && (existing.before!==e.before || existing.after!==e.after))throw Error('Conflicting voxel candidates');
            edits.set(k,e);
        }
    }
    return [...edits.values()];
}
