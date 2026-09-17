import { expect, test } from '@playwright/test';

test.beforeEach(async({page})=>{
 await page.goto('/e2e-fixture?webgl&noanalytics&noreveal&noanim');
 await expect(page.locator('#loadingWrap')).toHaveClass(/hidden/);
});

test('real auxiliary panel dwell advances once, shows progress without reuploading its text, and requires leaving',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.evaluate(()=>{
  const g=viewer.global,n=g.camera.parent.script.get('xrVrNavigation'),m=n.menu;
  n.preferences.confirmation='dwell';m.show();m.auxiliary=true;
  const v=g.camera.getPosition().clone(),origin=v.clone(),target=v.clone();
  const source={gamepad:{axes:[0,0,0,0]},getOrigin:()=>origin,getDirection:()=>target.clone().sub(origin).normalize()};
  window.__handsTest={n,m,source,origin,target,uploads:0};
  const setSource=m.texture.setSource.bind(m.texture);m.texture.setSource=(...args)=>{window.__handsTest.uploads++;return setSource(...args)};
  const setAim=(on)=>{const t=m.entity.getWorldTransform();t.transformPoint(v.clone().set(0,0,1),origin);t.transformPoint(v.clone().set(on?.41:2,.5-(242+2*84+35)/1024,0),target)};
  window.__handsTest.aim=setAim;setAim(false);
  window.__handsTest.timer=setInterval(()=>{m.update(n.preferences,'free-roam',new Set([source]),new Set([source]));g.app.renderNextFrame=true;},16);
 });
 await page.waitForTimeout(260);
 await page.evaluate(()=>window.__handsTest.aim(true));
 await expect.poll(()=>page.evaluate(()=>window.__handsTest.m.dwell.progress)).toBeGreaterThan(.1);
 const uploads=await page.evaluate(()=>window.__handsTest.uploads);
 await page.waitForTimeout(180);
 expect(await page.evaluate(()=>window.__handsTest.uploads)).toBe(uploads);
 await expect.poll(()=>page.evaluate(()=>window.__handsTest.n.preferences.dwellDuration)).toBe(1500);
 await page.waitForTimeout(1800);
 expect(await page.evaluate(()=>window.__handsTest.n.preferences.dwellDuration)).toBe(1500);
 expect(await page.evaluate(()=>window.__handsTest.m.rows.some(r=>r.label.includes('1.5')))).toBe(true);
 await page.evaluate(()=>clearInterval(window.__handsTest.timer));expect(errors).toEqual([]);
});

test('world ray picks actual rendered splat depth without changing the tracked camera',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const result=await page.evaluate(async()=>{
  const g=viewer.global,n=g.camera.parent.script.get('xrVrNavigation');n.initialized=true;n.menu.close();
  g.collision=null;g.collisionStatus='unavailable';
  const before=g.camera.getPosition().clone(),rotation=g.camera.getRotation().clone();
  const origin=before.clone();origin.x+=.2;
  const source={getOrigin:()=>origin,getDirection:()=>origin.clone().mulScalar(-1).normalize()};n.validSources.add(source);
  const world=g.app.scene.layers.layerList.find(l=>l.name==='World'),director=g.app.renderer.gsplatDirector;
  const cameras=[...world.camerasSet],resident=[...director.camerasMap.keys()],visibility=world.meshInstances.map(m=>m.isVisibleFunc);
  await n.queryScene(source,true,false);
  return {hit:n.sceneHit?.toArray(),queryCount:n.diagnostics.sceneQueries,error:n.actionStatus,
   cameraDistance:g.camera.getPosition().distance(before),sameRotation:g.camera.getRotation().equals(rotation),
   restoredCameras:cameras.length===world.camerasSet.size && cameras.every(c=>world.camerasSet.has(c)),
   restoredResident:resident.length===director.camerasMap.size && resident.every(c=>director.camerasMap.has(c)),
   restoredVisibility:world.meshInstances.every((m,i)=>m.isVisibleFunc===visibility[i])};
 });
 expect(result.queryCount).toBe(1);expect(result.error).toBe(null);
 expect(result.hit).toBeTruthy();expect(Math.abs(result.hit[2])).toBeLessThan(.2);
 expect(result.restoredCameras).toBe(true);expect(result.restoredResident).toBe(true);expect(result.restoredVisibility).toBe(true);
 expect(result.cameraDistance).toBe(0);expect(result.sameRotation).toBe(true);expect(errors).toEqual([]);
});
