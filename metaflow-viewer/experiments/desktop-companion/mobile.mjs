// Physical DISPLAY sizes are approximate starting points, never chassis sizes.
// iPhone 6.1 reference: Apple 111872, 1170 x 2532 at 460 ppi.
// iPad mini 8.3 reference: Apple 121456, 1488 x 2266 at 326 ppi.
// Other labels are size classes, not automatic identification of an Apple model.
const cm = (pixels, ppi) => pixels / ppi * 2.54;
export const MOBILE_PROFILES = Object.freeze({
  'iphone-compact': Object.freeze({label:'iPhone 小屏 / mini · 近似起点', short:5.76, long:12.49, distance:35}),
  'iphone-standard': Object.freeze({label:'iPhone 6.1 英寸参考 · 请用尺校准', short:cm(1170,460), long:cm(2532,460), distance:40}),
  'iphone-large': Object.freeze({label:'iPhone Plus / Max · 近似起点', short:7.12, long:15.42, distance:45}),
  'ipad-mini': Object.freeze({label:'iPad mini 8.3 英寸 · 6 / A17 Pro', short:cm(1488,326), long:cm(2266,326), distance:45}),
  'tablet-small': Object.freeze({label:'其他小平板 / 旧款 mini · 请用尺校准', short:12, long:16, distance:45})
});
export function deviceFamily({userAgent='', platform='', maxTouchPoints=0}={}) {
  if (/iPhone|iPod/i.test(userAgent)) return 'phone';
  if (/iPad/i.test(userAgent) || (/Mac/i.test(platform) && maxTouchPoints>1)) return 'tablet';
  if (/Android.*Mobile/i.test(userAgent)) return 'phone';
  if (/Android/i.test(userAgent)) return 'tablet';
  return 'desktop';
}
export function landscapeOrientation({angle, type, screenWidth=0, screenHeight=0}={}) {
  if (typeof type==='string' && /^(portrait|landscape)/.test(type)) return type.startsWith('landscape');
  if (Number.isFinite(angle)) return Math.abs(angle % 180)===90;
  return screenWidth>screenHeight;
}
export function mobileProfileValues(id, {landscape=false, canvasWidth=1, screenWidth=1, screenHeight=1}={}) {
  const p=MOBILE_PROFILES[id]; if(!p) return null;
  if (![canvasWidth,screenWidth,screenHeight].every(v=>Number.isFinite(v)&&v>0)) throw new RangeError('Invalid screen metrics');
  const cssWidth=landscape?Math.max(screenWidth,screenHeight):Math.min(screenWidth,screenHeight);
  const width=(landscape?p.long:p.short)*Math.min(1,canvasWidth/cssWidth);
  return {width:Math.max(5,width),tilt:70,'floor-offset':.6,'avatar-depth':1.5,'room-depth':16,distance:p.distance};
}
// An orientation swap can preserve measured cm/CSS-pixel, but not eye or
// camera placement calibration. The caller must invalidate confirmation.
export function rotatedMeasuredWidth(calibration, metrics) {
  const a=calibration?.reference,b=metrics;
  if(!a||!b||!Number.isFinite(calibration.cmPerPixel)||calibration.cmPerPixel<=0) return null;
  if(a.dpr!==b.dpr||a.scale!==b.scale) return null;
  const same=(a.screenWidth===b.screenWidth&&a.screenHeight===b.screenHeight);
  const swapped=(a.screenWidth===b.screenHeight&&a.screenHeight===b.screenWidth);
  if(!(same||swapped)||!Number.isFinite(b.width)||b.width<=0) return null;
  return calibration.cmPerPixel*b.width;
}
export function recommendedPixelRatio(info={}, dpr=1) {
  const family=deviceFamily(info);
  return Math.max(.5,Math.min(Number.isFinite(dpr)?dpr:1,family==='phone'?1.25:family==='tablet'?1.5:1.75));
}
export function pinchZoom(initialZoom, initialDistance, distance) {
  if(![initialZoom,initialDistance,distance].every(v=>Number.isFinite(v)&&v>0)) return initialZoom;
  return Math.max(.5,Math.min(1.8,initialZoom*distance/initialDistance));
}
export function installMobileOptions(doc) {
  const select=doc.getElementById('device-preset');
  for(const [id,p] of Object.entries(MOBILE_PROFILES)) {
    if([...select.options].some(o=>o.value===id)) continue;
    const option=doc.createElement('option');option.value=id;option.textContent=p.label;select.append(option);
  }
  const placement=doc.getElementById('camera-placement');
  if(![...placement.options].some(o=>o.value==='bottom')) {
    const option=doc.createElement('option');option.value='bottom';option.textContent='屏幕下侧 · 倒置摆放';placement.append(option);
  }
}
