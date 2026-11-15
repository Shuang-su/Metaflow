import test from 'node:test';
import assert from 'node:assert/strict';
import {detectDeviceProfile,shouldApplySuggestion,sanitizeRoom} from './device-detection.mjs';
const air={userAgent:'Mozilla/5.0 (iPhone)',platform:'iPhone',maxTouchPoints:5,screenWidth:420,screenHeight:912,dpr:3};
test('Air screen match works in both orientations without claiming hardware identity',()=>{
  for(const [w,h] of [[420,912],[912,420]]){const r=detectDeviceProfile({...air,screenWidth:w,screenHeight:h});assert.equal(r.profile,'iphone-air');assert.equal(r.confidence,'screen-match');assert.match(r.note,/不是硬件型号/);}
});
test('unknown and zoomed phone screens stay generic rather than inventing an exact model',()=>{
  assert.equal(detectDeviceProfile({...air,screenWidth:380,dpr:2.7}).confidence,'family');
  assert.equal(detectDeviceProfile({...air,screenWidth:0,screenHeight:0}).confidence,'family');
});
test('mini signature requires a tablet and correct pixel ratio',()=>{
  const info={userAgent:'Macintosh',platform:'MacIntel',maxTouchPoints:5,screenWidth:744,screenHeight:1133,dpr:2};
  assert.equal(detectDeviceProfile(info).profile,'ipad-mini');
  assert.notEqual(detectDeviceProfile({...info,maxTouchPoints:0}).profile,'ipad-mini');
});
test('Mac and external-monitor screen dimensions never prove real centimetres',()=>{
  const r=detectDeviceProfile({platform:'MacIntel',maxTouchPoints:0,screenWidth:1512,screenHeight:982,dpr:2});
  assert.equal(r.profile,'macbook');assert.match(r.note,/实际英寸/);
  assert.equal(detectDeviceProfile({platform:'Win32',screenWidth:1920,screenHeight:1080}).profile,'manual');
});
test('explicit saved profile is not replaced by automatic suggestion',()=>{
  assert.equal(shouldApplySuggestion({'device-preset':'manual'}),false);
  assert.equal(shouldApplySuggestion({'device-preset':'iphone-large'}),false);
  assert.equal(shouldApplySuggestion({}),true);assert.equal(shouldApplySuggestion(null),true);
});
test('scene settings reject null, malformed and arbitrary values',()=>{
  for(const value of [null,undefined,[],false,'terrace',{scene:'<script>',quality:'unlimited',lighting:'bad',model:'arbitrary'}]){
    const r=sanitizeRoom(value);assert.equal(r.scene,'studio');assert.equal(r.quality,'balanced');assert.equal(r.model,'wenjing');
  }
});
test('valid room options and explicit false controls survive reload',()=>{
  assert.deepEqual(sanitizeRoom({scene:'terrace',quality:'low',lighting:'evening',clock:false,decor:false,model:'reconstruction'}),{scene:'terrace',quality:'low',lighting:'evening',clock:false,decor:false,model:'reconstruction'});
});

test('Android tablet is not an iPad even with the same screen signature',()=>{const d=detectDeviceProfile({userAgent:'Mozilla/5.0 Android 15',platform:'Linux armv8l',maxTouchPoints:5,screenWidth:744,screenHeight:1133,dpr:2});assert.equal(d.confidence,'family');assert.notEqual(d.profile,'ipad-mini');});

test('Android is never named iPhone merely because its screen matches',()=>{const d=detectDeviceProfile({...air,userAgent:'Mozilla Android Mobile',platform:'Linux armv8l'});assert.equal(d.confidence,'family');assert.doesNotMatch(d.label,/iPhone Air/);});
