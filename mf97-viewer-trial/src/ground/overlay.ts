import { VoxelCollision, FlippedVoxelCollision } from '../../../metaflow-viewer/src/collision/voxel-collision';
import type { SparseEdit } from './types';
/** CPU ray/capsule queries and Recast voxel geometry consult the same occupancy.
 * GPU octree consumers require a materialized/repacked accepted asset; original node words
 * remain immutable and must never be advertised as the corrected GPU collision binary.
 */
export function patchedCollision(original:VoxelCollision,metadata:ConstructorParameters<typeof VoxelCollision>[0],edits:SparseEdit[]):VoxelCollision {
    const map=new Map<string,boolean>();
    for(const e of edits){
        if(original.isVoxelSolid(e.ix,e.iy,e.iz)!==e.before)throw Error('Patch before-mask mismatch');
        const key=`${e.ix},${e.iy},${e.iz}`;
        if(map.has(key) && map.get(key)!==e.after)throw Error('Conflicting sparse edits');
        map.set(key,e.after);
    }
    const Base=original.flipXY?FlippedVoxelCollision:VoxelCollision;
    class Patched extends Base {
        isVoxelSolid(ix:number,iy:number,iz:number):boolean {
            return map.get(`${ix},${iy},${iz}`) ?? super.isVoxelSolid(ix,iy,iz);
        }
    }
    return new Patched(metadata,original.nodes,original.leafData);
}
