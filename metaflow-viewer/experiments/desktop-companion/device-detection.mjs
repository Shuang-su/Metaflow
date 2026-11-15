import {deviceFamily} from './mobile.mjs';
// Screen signatures are hints, not hardware identifiers. No GPU fingerprint,
// network lookup, serial number, camera label or high-entropy UA request.
const signatures=Object.freeze([
  [420,912,3,'iphone-air','iPhone Air 屏幕特征'],
  [375,812,3,'iphone-compact','iPhone mini / 同尺寸屏幕'],
  [390,844,3,'iphone-standard','iPhone 6.1 英寸屏幕组'],
  [393,852,3,'iphone-standard','iPhone 6.1 英寸屏幕组'],
  [402,874,3,'iphone-standard','iPhone 标准屏幕组'],
  [414,896,3,'iphone-large','iPhone 大屏组'],
  [428,926,3,'iphone-large','iPhone Plus / Max 屏幕组'],
  [430,932,3,'iphone-large','iPhone Plus / Max 屏幕组'],
  [440,956,3,'iphone-large','iPhone Max 屏幕组'],
  [744,1133,2,'ipad-mini','iPad mini 8.3 英寸屏幕组'],
]);
export function detectDeviceProfile(info={}){
  const family=deviceFamily(info);
  const values=[Number(info.screenWidth),Number(info.screenHeight)].sort((a,b)=>a-b);
  const dpr=Number(info.dpr)||1;
  const signature=signatures.find(([a,b,r,,])=>Math.abs(values[0]-a)<1.1&&Math.abs(values[1]-b)<1.1&&Math.abs(dpr-r)<.1);
  const allowed=signature&&(family==='phone'&&signature[3].startsWith('iphone')||family==='tablet'&&signature[3].startsWith('ipad'));
  if(allowed)return {family,profile:signature[3],label:signature[4],confidence:'screen-match',basis:`${values.join(' × ')} 逻辑像素 · ${dpr}×`,note:'按屏幕特征推荐，不是硬件型号识别。显示缩放、同尺寸机型可能影响结果，请用校准尺复核。'};
  if(family==='phone')return {family,profile:'iphone-standard',label:'手机 · 通用起点',confidence:'family',basis:'手机浏览环境',note:'未匹配到可靠屏幕档位，请手动选择设备或测量画布。'};
  if(family==='tablet')return {family,profile:values[0]<800?'tablet-small':'ipad-11-landscape',label:'平板 · 通用起点',confidence:'family',basis:'触控平板浏览环境',note:'浏览器不能确定具体平板型号，选择实际尺寸后用尺核对。'};
  const mac=/Mac/i.test(info.platform||info.userAgent||'');
  return {family:'desktop',profile:mac?'macbook':'manual',label:mac?'Mac · 尺寸需测量':'电脑 · 尺寸需测量',confidence:'family',basis:'桌面浏览环境',note:'网页无法知道显示器实际英寸数或窗口位置；不要把逻辑像素直接当厘米。'};
}
export function readDeviceInfo(win=window,nav=navigator){return {userAgent:nav.userAgent,platform:nav.platform,maxTouchPoints:nav.maxTouchPoints,screenWidth:win.screen.width,screenHeight:win.screen.height,dpr:win.devicePixelRatio};}
export function shouldApplySuggestion(saved){return !saved||typeof saved['device-preset']!=='string';}
export function sanitizeRoom(value={}){
  return {scene:['studio','terrace','minimal'].includes(value.scene)?value.scene:'studio',
    lighting:['day','evening'].includes(value.lighting)?value.lighting:'day',
    quality:['balanced','high','low'].includes(value.quality)?value.quality:'balanced',
    clock:value.clock!==false,decor:value.decor!==false,
    model:['wenjing','reconstruction'].includes(value.model)?value.model:'wenjing'};
}
