from pathlib import Path
ROOT=Path(__file__).resolve().parent
MARK='// MF165_ORIENTATION_SETTLED'
def one(text,old,new):
    if text.count(old)!=1:raise ValueError('Source anchor changed: '+old[:80])
    return text.replace(old,new)
p=ROOT/'app.js';t=p.read_text()
if MARK not in t:
    t=one(t,"function showCameraCard(){placeTrackingVideo(state.video,$('show-preview').checked,document);}","function showCameraCard(){placeTrackingVideo(state.video,$('show-preview').checked&&!$('app').classList.contains('immersive'),document);}")
    t=one(t,"$('app').classList.toggle('immersive',hideControls);$('leave-display').hidden=!hideControls;","$('app').classList.toggle('immersive',hideControls);$('leave-display').hidden=!hideControls;showCameraCard();")
    t=one(t,"$('app').classList.remove('immersive');$('leave-display').hidden=true;","$('app').classList.remove('immersive');$('leave-display').hidden=true;showCameraCard();")
    old="listen(screen.orientation,'change',reorientMobile);listen(window,'orientationchange',reorientMobile);"
    new="""// MF165_ORIENTATION_SETTLED
// orientationchange can precede the new CSS viewport. Coalesce both events,
// then measure after layout; keyboard-only resize never changes orientation.
let orientationTimer=0;
function scheduleMobileOrientation(){
  clearTimeout(orientationTimer);
  orientationTimer=setTimeout(()=>{if(!state.disposed)reorientMobile();},180);
}
listen(screen.orientation,'change',scheduleMobileOrientation);
listen(window,'orientationchange',scheduleMobileOrientation);
listen(window,'resize',scheduleMobileOrientation);
listen(window,'pagehide',()=>clearTimeout(orientationTimer));"""
    t=one(t,old,new);p.write_text(t)
p=ROOT/'tracking-refinement.e2e.mjs';t=p.read_text()
if 'upstreamInfo' not in t:
    t=one(t,"checks:[],errors:[]", "checks:[],errors:[],upstreamInfo:[]")
    t=one(t,"page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('favicon.ico'))report.errors.push(m.text());});", "page.on('console',m=>{if(m.type()!=='error')return;const text=m.text();if(text==='INFO: Created TensorFlow Lite XNNPACK delegate for CPU.'){report.upstreamInfo.push(text);return;}if(!text.includes('favicon.ico'))report.errors.push(text);});")
    t=one(t,"report.pass=false;report.failure=e.message;", "report.pass=false;report.failure=e.message;report.state=await page.evaluate(()=>({diagnostics:window.__companionDiagnostics?.(),angle:screen.orientation?.angle,type:screen.orientation?.type,width:innerWidth,height:innerHeight,screenWidth:screen.width,screenHeight:screen.height})).catch(()=>null);")
    p.write_text(t)
print('FINALIZED orientation event race / immersive video / precise upstream INFO classification')
