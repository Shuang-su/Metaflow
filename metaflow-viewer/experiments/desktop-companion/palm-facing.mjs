import * as THREE from 'three';
// Build a semantic hand basis from the actual model, not an assumed local
// wrist axis. VRM0/VRM1 and authored bone-roll differences stay in the loader.
export function createPalmFacing(vrm,side='left'){
  const get=n=>vrm.humanoid.getNormalizedBoneNode(side+n);
  const hand=get('Hand'),index=get('IndexProximal'),little=get('LittleProximal');
  if(!hand||!index||!little)return null;
  vrm.scene.updateMatrixWorld(true);hand.updateWorldMatrix(true,true);
  const local=node=>hand.worldToLocal(node.getWorldPosition(new THREE.Vector3()));
  const i=local(index),l=local(little);
  const along=i.clone().add(l).multiplyScalar(.5).normalize();
  const across=i.clone().sub(l).normalize();
  const palm=new THREE.Vector3().crossVectors(along,across).multiplyScalar(side==='left'?1:-1).normalize();
  if(!Number.isFinite(palm.x)||palm.lengthSq()<.9||along.lengthSq()<.9)return null;
  const rest=hand.quaternion.clone(),parentInverse=new THREE.Quaternion(),aim=new THREE.Quaternion(),twist=new THREE.Quaternion();
  const normal=new THREE.Vector3(),up=new THREE.Vector3(),finger=new THREE.Vector3(),tmp=new THREE.Vector3();
  function apply(weight,phase=0){
    if(!Number.isFinite(weight))return;weight=THREE.MathUtils.clamp(weight,0,1);
    if(weight<=0){hand.quaternion.copy(rest);return;}
    hand.parent.updateWorldMatrix(true,false);hand.parent.getWorldQuaternion(parentInverse).invert();
    // +Z is toward the observer of the physical screen. Fingers remain near
    // screen-up, with a small in-plane wave instead of twisting the forearm.
    normal.set(0,0,1).applyQuaternion(parentInverse).normalize();
    const angle=Math.sin(phase*.65)*.14;
    up.set(Math.sin(angle),Math.cos(angle),0).applyQuaternion(parentInverse).normalize();
    aim.setFromUnitVectors(palm,normal);
    finger.copy(along).applyQuaternion(aim).addScaledVector(normal,-along.clone().applyQuaternion(aim).dot(normal)).normalize();
    up.addScaledVector(normal,-up.dot(normal)).normalize();
    const turn=Math.atan2(normal.dot(tmp.crossVectors(finger,up)),THREE.MathUtils.clamp(finger.dot(up),-1,1));
    twist.setFromAxisAngle(normal,turn);aim.premultiply(twist);
    hand.quaternion.copy(rest).slerp(aim,weight);
  }
  function diagnostics(){
    hand.updateWorldMatrix(true,false);
    const q=hand.getWorldQuaternion(new THREE.Quaternion());
    const p=palm.clone().applyQuaternion(q),f=along.clone().applyQuaternion(q);
    return {palmNormal:p.toArray(),fingerDirection:f.toArray(),screenFacingDot:p.z,screenUpDot:f.y};
  }
  return {apply,diagnostics};
}
