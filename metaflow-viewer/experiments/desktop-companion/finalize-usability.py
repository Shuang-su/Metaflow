from pathlib import Path
ROOT=Path(__file__).resolve().parent
p=ROOT/'device-detection.mjs';t=p.read_text()
t=t.replace("family==='phone'&&signature[3].startsWith('iphone')", "family==='phone'&&/iPhone|iPod/i.test(info.userAgent||'')&&signature[3].startsWith('iphone')")
t=t.replace("const mac=/Mac/i.test(info.platform||info.userAgent||'');", "const mac=/Mac/i.test((info.platform||'')+' '+(info.userAgent||''));")
p.write_text(t)
p=ROOT/'room-details.mjs';t=p.read_text().replace("lamp.visible=books.every(o=>{o.visible=room.decor;return true;})&&room.decor;picture.visible=room.decor;", "for(const o of books)o.visible=room.decor;lamp.visible=room.decor;picture.visible=room.decor;")
p.write_text(t)
p=ROOT/'app.js';t=p.read_text().replace("getState:()=>({...state,cameraActive:!!state.video})", "getState:()=>({...state,cameraActive:!!state.video,sceneStatus:renderer?.diagnostics().scene})")
p.write_text(t)
p=ROOT/'experience.mjs';t=p.read_text()
if 's.sceneStatus' not in t:
    t=t.replace("function updateProgress(){const s=getState();", "function updateProgress(){const s=getState();\n    if(s.sceneStatus&&room.scene==='terrace'){const a=s.sceneStatus;assetStatus.hidden=false;assetStatus.textContent=a.status==='loading'?'正在加载轻量露台部件…':a.status==='error'?a.error:a.status==='ready'?'原模型部件已载入':'';retry.hidden=a.status!=='error';}\n")
p.write_text(t)
print('FINALIZED platform matching / visible loading state')
