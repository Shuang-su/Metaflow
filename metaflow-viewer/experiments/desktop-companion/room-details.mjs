// MF165_VISUAL_POLISH
import * as THREE from 'three';
import {GLTFLoader} from './vendor/GLTFLoader.js';
// All detail lives under the calibrated desk. No CSS perspective, camera
// movement, external image service, model recolouring or animated floor fit.
export function createRoomDetails(desk){
  const root=new THREE.Group();root.name='Companion room details';desk.add(root);
  const studio=new THREE.Group(),terrace=new THREE.Group(),trim=new THREE.Group();root.add(studio,terrace,trim);
  const geometries=new Set(),materials=new Set(),textures=new Set();
  const geo=g=>{geometries.add(g);return g;},mat=(color,roughness=.8)=>{const m=new THREE.MeshStandardMaterial({color,roughness});materials.add(m);return m;};
  const box=geo(new THREE.BoxGeometry(1,1,1));
  const wood=mat(0x9f7b50),cream=mat(0xe3d9be),dark=mat(0x3d5145),brass=mat(0xbca277,.4),pages=mat(0xe7dfca),plaster=mat(0xc6caba);
  const covers=[mat(0x637e6f),mat(0x926c59),mat(0xb49d6c)];
  function mesh(parent,g,m){const o=new THREE.Mesh(g,m);o.castShadow=true;o.receiveShadow=true;parent.add(o);return o;}
  function cuboid(parent,m){return mesh(parent,box,m);}
  const baseboard=cuboid(trim,wood),cornice=cuboid(trim,cream),leftTrim=cuboid(trim,wood),rightTrim=cuboid(trim,wood);
  const panels=Array.from({length:5},()=>cuboid(trim,plaster));
  function sky(evening){
    const c=document.createElement('canvas');c.width=512;c.height=640;const x=c.getContext('2d');
    const g=x.createLinearGradient(0,0,0,640);g.addColorStop(0,evening?'#727f91':'#b9d5d6');g.addColorStop(.62,evening?'#dbb18d':'#e5e5cc');g.addColorStop(1,evening?'#788776':'#a3b89b');x.fillStyle=g;x.fillRect(0,0,512,640);
    // A quiet sky gradient remains undistorted across tall and wide windows.
    for(let i=0;i<8;i++){x.fillStyle=i%2?(evening?'#647365':'#93ac92'):(evening?'#778471':'#b2c4a5');x.beginPath();x.ellipse(i*95-40,630-i%3*37,160,110,0,0,Math.PI*2);x.fill();}
    const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;textures.add(texture);return texture;
  }
  const skies={day:sky(false),evening:sky(true)};
  const glassMat=new THREE.MeshBasicMaterial({map:skies.day,toneMapped:false});materials.add(glassMat);
  const windowRoot=new THREE.Group();studio.add(windowRoot);
  const glass=mesh(windowRoot,geo(new THREE.PlaneGeometry(1,1)),glassMat);glass.castShadow=false;
  const frames=Array.from({length:7},()=>cuboid(windowRoot,cream));
  const sill=cuboid(studio,wood),shelf=cuboid(studio,wood);
  const books=Array.from({length:3},(_,i)=>{const group=new THREE.Group();studio.add(group);const body=cuboid(group,pages);body.scale.set(.8,.82,.9);for(const y of [-.48,.48]){const cover=cuboid(group,covers[i]);cover.position.y=y;cover.scale.set(1,.06,1);}return group;});
  const picture=new THREE.Group();studio.add(picture);
  const pictureBack=cuboid(picture,wood);pictureBack.scale.set(1,1,.08);
  const pictureFace=cuboid(picture,cream);pictureFace.scale.set(.84,.84,.03);pictureFace.position.z=.055;
  const pictureDisc=mesh(picture,geo(new THREE.CircleGeometry(.22,32)),covers[0]);pictureDisc.position.set(-.1,.08,.08);pictureDisc.castShadow=false;
  const lamp=new THREE.Group();studio.add(lamp);
  const lampBase=mesh(lamp,geo(new THREE.CylinderGeometry(.34,.4,.09,24)),dark);lampBase.position.y=.045;
  const stem=mesh(lamp,geo(new THREE.CylinderGeometry(.035,.035,1.3,12)),brass);stem.position.set(.03,.7,0);
  const shadeMat=mat(0xf1d9a9);shadeMat.emissive=new THREE.Color(0xd4a965);shadeMat.emissiveIntensity=.12;
  const shade=mesh(lamp,geo(new THREE.ConeGeometry(.48,.47,24,1,true)),shadeMat);shadeMat.side=THREE.DoubleSide;shade.position.y=1.45;
  const light=new THREE.PointLight(0xffd49c,0,.3,2);lamp.add(light);light.position.y=1.25;
  const rugMat=mat(0xc4c6a7),rug=mesh(studio,geo(new THREE.CircleGeometry(1,64)),rugMat);rug.rotation.x=-Math.PI/2;rug.position.y=.00015;rug.castShadow=false;
  // The terrace's railing and shallow stage are small original additions;
  // the chair, round table and overhead lattice are verified source meshes.
  const railing=cuboid(terrace,dark),railPosts=Array.from({length:7},()=>cuboid(terrace,dark));
  const terraceBack=cuboid(terrace,cream);
  const outdoor=mesh(terrace,geo(new THREE.PlaneGeometry(1,1)),glassMat);outdoor.castShadow=false;outdoor.receiveShadow=false;
  for(const o of [...frames,...panels,baseboard,cornice,leftTrim,rightTrim])o.castShadow=false;
  const fabric=document.createElement('canvas');fabric.width=fabric.height=128;const fx=fabric.getContext('2d');fx.fillStyle='#eee9dc';fx.fillRect(0,0,128,128);fx.strokeStyle='#dedbcd';fx.lineWidth=1;
  for(let i=0;i<128;i+=4){fx.beginPath();fx.moveTo(i,0);fx.lineTo(i,128);fx.moveTo(0,i);fx.lineTo(128,i);fx.stroke();}
  const fabricMap=new THREE.CanvasTexture(fabric);fabricMap.colorSpace=THREE.SRGBColorSpace;fabricMap.wrapS=fabricMap.wrapT=THREE.RepeatWrapping;fabricMap.repeat.set(8,8);textures.add(fabricMap);rugMat.map=fabricMap;rugMat.roughness=.98;
  let kit=null,disposed=false,pending=null,controller=null,last=null,status='idle',error='',generation=0;
  const stateEvent=()=>window.dispatchEvent(new CustomEvent('companion:scene-status',{detail:{status,error}}));
  function placeKit(){
    if(!kit||!last)return;
    const {w,h,d}=last;
    for(const [name,x,z,target] of [['chair',-.29*w,-d*.64,w*.55],['table',.30*w,-d*.61,w*.30],['lattice',0,-d*.67,w*.9]]){
      const o=kit.getObjectByName('metax-'+name);if(!o)continue;
      const size=o.userData.referenceSize;const scale=name==='lattice'?target/size.x:Math.min(target/size.y,w*.32/size.x);
      o.scale.setScalar(scale);o.position.set(x,name==='lattice'?h*.9:0,z);
      if(name==='chair')o.rotation.y=.12;if(name==='table')o.rotation.y=0;
    }
  }
  function releaseKit(object){if(!object)return;object.removeFromParent();object.traverse(o=>{if(o.geometry)o.geometry.dispose();for(const m of [].concat(o.material||[]))m.dispose();});}
  async function loadKit(){
    if(disposed||kit||pending)return pending;
    const own=++generation;controller=new AbortController();status='loading';error='';stateEvent();
    const timer=setTimeout(()=>controller?.abort(),25000);
    pending=(async()=>{
      let result=null;
      try{
        const r=await fetch('./assets/terrace-kit.glb',{signal:controller.signal});if(!r.ok)throw new Error('场景资源未能下载');
        const b=await r.arrayBuffer();if(b.byteLength>10*1024*1024)throw new Error('场景资源超出大小预算');
        result=await new GLTFLoader().parseAsync(b,'');
        if(disposed||own!==generation){releaseKit(result.scene);return;}
        kit=result.scene;kit.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
        for(const name of ['chair','table','lattice']){const o=kit.getObjectByName('metax-'+name);if(!o)throw new Error('场景部件不完整');o.userData.referenceSize=new THREE.Box3().setFromObject(o).getSize(new THREE.Vector3());}
        terrace.add(kit);placeKit();status='ready';stateEvent();
      }catch(e){if(disposed||own!==generation)return;releaseKit(result?.scene);kit=null;status='error';error=e.name==='AbortError'?'露台下载超时，可重试或切换书房。':e.message;stateEvent();}
      finally{clearTimeout(timer);if(own===generation)pending=null;}
    })();return pending;
  }
  function update({w,h,d,front,room,inspect}){
    last={w,h,d,front,room};root.visible=!inspect&&room.scene!=='minimal';studio.visible=room.scene==='studio';terrace.visible=room.scene==='terrace';
    if(!root.visible)return;
    const p=Math.min(w*.12,h*.12,.035),rear=-d+.001;
    baseboard.scale.set(w,.005,.0025);baseboard.position.set(0,.0025,rear);
    cornice.scale.set(w,.004,.004);cornice.position.set(0,h-.004,rear);
    for(const [i,o] of [leftTrim,rightTrim].entries()){o.scale.set(.002,h,.003);o.position.set((i?1:-1)*(w/2-.001),h/2,rear);}
    for(const [i,o] of panels.entries()){o.scale.set(w/5-.001,h*.24,.001);o.position.set((i-2)*w/5,h*.16,rear+.001);}
    if(studio.visible){
      const ww=w*.64,wh=h*.49;windowRoot.position.set(-w*.09,h*.64,rear+.003);glass.scale.set(ww,wh,1);glass.material.map=skies[room.lighting];
      const positions=[[-ww/2,0,.002],[ww/2,0,.002],[0,-wh/2,.002],[0,wh/2,.002],[0,0,.003],[0,wh*.18,.003],[0,-wh*.18,.003]];
      frames.forEach((o,i)=>{o.position.set(...positions[i]);o.scale.set(i<2||i===4?.002:ww,i<2||i===4?wh:.002,.002);});
      sill.scale.set(ww+.007,.003,p*.43);sill.position.set(-w*.09,h*.64-wh/2-.002,rear+p*.2);
      shelf.scale.set(w*.29,.003,p*.58);shelf.position.set(w*.32,h*.42,rear+p*.25);
      books.forEach((o,i)=>{o.scale.set(p*(.58+i*.05),p*.12,p*.42);o.position.set(w*.30,h*.42+.003+i*p*.13,rear+p*.25);o.rotation.y=(i-1)*.1;});
      picture.scale.set(p*.95,p*1.1,p*.95);picture.position.set(w*.32,h*.64,rear+.004);
      lamp.scale.setScalar(p*.75);lamp.position.set(w*.35,0,-d*.67);
      shadeMat.emissiveIntensity=room.lighting==='evening'?.7:.08;light.intensity=room.lighting==='evening'?.0018:0;light.distance=p*7;
      rug.scale.set(w*.42,Math.min(d*.45,w*.65),1);rug.position.z=-d*.40;
      for(const o of books)o.visible=room.decor;lamp.visible=room.decor;picture.visible=room.decor;
    }
    if(terrace.visible){
      glassMat.map=skies[room.lighting];outdoor.scale.set(w,h,1);outdoor.position.set(0,h/2,rear+.001);
      const rz=-d*.83;railing.scale.set(w*.94,.0025,.0025);railing.position.set(0,h*.28,rz);
      railPosts.forEach((o,i)=>{o.scale.set(.0014,h*.28,.0014);o.position.set((i-3)*w*.145,h*.14,rz);});
      terraceBack.scale.set(w,h*.30,.001);terraceBack.position.set(0,h*.15,rear+.002);
      if(kit){kit.visible=room.decor;placeKit();}else if(room.decor&&status==='idle')loadKit();
    }
  }
  function retry(){if(status==='error'){status='idle';loadKit();}}
  window.addEventListener('companion:retry-scene',retry);
  return {update,retry,diagnostics:()=>({status,error,loaded:!!kit,scene:last?.room.scene||'studio',visible:root.visible}),
    dispose(){if(disposed)return;disposed=true;++generation;controller?.abort();window.removeEventListener('companion:retry-scene',retry);releaseKit(kit);kit=null;root.removeFromParent();geometries.forEach(g=>g.dispose());materials.forEach(m=>m.dispose());textures.forEach(t=>t.dispose());}
  };
}
