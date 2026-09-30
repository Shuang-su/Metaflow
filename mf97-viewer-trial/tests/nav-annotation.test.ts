import test from 'node:test';
import assert from 'node:assert/strict';
import { navigationCapability, navigationAnnotationIndices, withNavigationEnabled, nearbyNavigationAnnotationIndices, NAV_ARRIVAL_RADIUS } from '../../metaflow-viewer/src/navigation/nav-annotation';
import { readPreferences } from '../../metaflow-viewer/src/preferences';
const annotation = {position:[0,0,0], title:'@Nav is plain text', text:'', camera:{initial:{position:[0,1.5,0],target:[0,0,1],fov:75}}, extras:{vendor:{nested:[1,2]},metaflow:{other:42,nav:{future:'kept'}}}};
test('only explicit boolean capability plus finite camera permits navigation; text is inert',()=>{
 assert.equal(navigationCapability(annotation).enabled,false);
 assert.equal(navigationCapability(withNavigationEnabled(annotation,true)).enabled,true);
 assert.equal(navigationCapability({...annotation,extras:{metaflow:{nav:{enabled:'true'}}}}).enabled,false);
 for(const position of [[NaN,0,0],[0,0],null]) assert.equal(navigationCapability({...withNavigationEnabled(annotation,true),camera:{initial:{...annotation.camera.initial,position}}}).enabled,false);
 assert.equal(navigationCapability({...withNavigationEnabled(annotation,true),camera:null}).declared,true);
});
test('toggle merges unknown extensions immutably and JSON roundtrip preserves them',()=>{
 const before=JSON.stringify(annotation), enabled=withNavigationEnabled(annotation,true), off=withNavigationEnabled(enabled,false);
 assert.equal(JSON.stringify(annotation),before); assert.deepEqual(enabled.extras.vendor,annotation.extras.vendor);
 assert.equal(enabled.extras.metaflow.other,42); assert.equal(enabled.extras.metaflow.nav.future,'kept');
 assert.equal(navigationCapability(JSON.parse(JSON.stringify(enabled))).enabled,true);
 assert.equal(navigationCapability(off).enabled,false);
});
test('filtered indices retain original identity; nearby cap does not hide far target',()=>{
 const nav=withNavigationEnabled(annotation,true), list=[annotation,nav,{...nav,camera:{initial:{...nav.camera.initial,position:[40,1.5,0]}}},nav,nav];
 assert.deepEqual(navigationAnnotationIndices(list),[1,2,3,4]);
 assert.deepEqual(nearbyNavigationAnnotationIndices(list,{x:0,y:1.5,z:0},0,2),[2,1,3]);
});
test('old 3m preferences ignored, guide and map independently persist',()=>{
 Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:(key:string)=>({guidanceRadius:'3',guidanceMode:'true',guidanceMapVisible:'false'} as Record<string,string>)[key] ?? null}});
 const prefs=readPreferences(false); assert.equal(NAV_ARRIVAL_RADIUS,2); assert.equal(prefs.guidanceMode,true); assert.equal(prefs.guidanceMapVisible,false); assert.equal('guidanceRadius' in prefs,false);
 delete (globalThis as any).localStorage;
});

test('unknown non-object containers are preserved and cannot be silently replaced',()=>{
 for(const extras of [null,'vendor',[],{metaflow:'vendor'},{metaflow:{nav:[1,2]}}]) {
  const a={...annotation,extras}, before=JSON.stringify(a);
  assert.throws(()=>withNavigationEnabled(a,true),/非对象扩展字段/); assert.equal(JSON.stringify(a),before);
 }
});
