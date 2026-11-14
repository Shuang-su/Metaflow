"""One-time guarded migration; CI commits the resulting ordinary source files.
No network calls, model edits, permissions changes or deployment in this script.
"""
from pathlib import Path
import re,json
ROOT=Path(__file__).resolve().parent
MARK='// MF165_HEAD_PALM_AIR_V1'
def one(text,a,b):
    if text.count(a)!=1:raise ValueError('Source anchor changed: '+a[:100])
    return text.replace(a,b)
def section(text,a,b,new):
    if text.count(a)!=1 or text.count(b)!=1:raise ValueError('Section anchor changed')
    start=text.index(a);end=text.index(b,start)
    return text[:start]+new+text[end:]

def app(t):
    t=MARK+"\nimport {placeTrackingVideo} from './tracking-preview.mjs';\n"+t
    t=one(t,"'animate','show-preview','auto-height'","'animate','auto-height'")
    t=one(t,'installMobileOptions(document);',"installMobileOptions(document);\n$('show-preview').checked=false;")
    t=one(t,"function showCameraCard() { $('camera-card').hidden=!state.video||!$('show-preview').checked; }", "function showCameraCard(){placeTrackingVideo(state.video,$('show-preview').checked,document);}")
    t=one(t,'function overlay(sample) {',"function overlay(sample) {\n  if(!$('show-preview').checked)return;")
    t=section(t,'  onVideo(video){','  onSample(sample){',"""  onVideo(video){
    state.video=video;
    if(video){state.permission='granted';enumerateCameras();}
    else $('camera-overlay').getContext('2d').clearRect(0,0,$('camera-overlay').width,$('camera-overlay').height);
    showCameraCard();
  },
""")
    t=one(t,"const labels={good:'眼位已校准','hold-still':'保持正对镜头',turned:'请转回正面',multiple:'请保留一人入镜',lost:'未找到双眼',unavailable:'等待摄像头'};", "const labels={good:'整脸 / 头部追踪','hold-still':'保持自然坐姿片刻',turned:'侧转过大，暂时保位',multiple:'多人入镜，已暂停',lost:'暂时保位，等待重捕获',unavailable:'等待摄像头'};")
    t=one(t,"    state.cameraPhase=result.state;", "    state.cameraPhase=result.state;\n    const quiet=$('quiet-tracking-status');quiet.textContent=({permission:'等待相机授权',loading:'准备本机追踪',calibrating:'自然坐姿校准',tracking:'头部追踪中',lost:'暂时保位 · 自动恢复',multiple:'多人入镜 · 已暂停',error:'追踪未启动',idle:'追踪已关闭'})[result.state]||'追踪准备中';")
    t=one(t,'function paintMode() {',"function paintMode() {\n  const active=state.mode==='camera';$('quiet-camera-stop').hidden=!active;$('quiet-tracking-status').hidden=!active;")
    t=one(t,"listen($('camera-stop'),'click',()=>setMode('manual'));", "listen($('camera-stop'),'click',()=>setMode('manual'));\nlisten($('quiet-camera-stop'),'click',()=>setMode('manual'));")
    t=t.replace('保持眼睛清晰可见','保持面部尽量在画面内').replace('摄像头跟随','头部追踪 · 本机').replace('取景已开启 · 待物理校准','追踪已开启 · 待物理校准').replace('取景正常 · 待画布校准','追踪正常 · 待画布校准')
    t=t.replace('正在本机估计眼位。小范围移动头部，检查脚点和地面是否稳定。','正在本机跟随头部。无需盯住镜头；短暂丢失会保位并自动恢复。')
    t=t.replace('真实取景已开启。请在“调整”中确认画布尺寸与镜头位置，确认后画面才跟随眼位。','静默追踪已开启。请在“调整”中确认画布尺寸与镜头位置；诊断取景默认关闭。')
    return t

def renderer(t):
    t=MARK+"\nimport {createPalmFacing} from './palm-facing.mjs';\n"+t
    t=one(t,'  const gestures=createGesturePlayer();','  const gestures=createGesturePlayer();\n  let palmFacing=null;')
    t=one(t,'(-REST_ARM+(REST_ARM+.7)*gesture.wave)', '(-REST_ARM+(REST_ARM-.25)*gesture.wave)')
    t=one(t,'-.25 * axis * gesture.wave','-.12 * axis * gesture.wave')
    t=one(t,'1.15 * axis * gesture.wave','1.6 * axis * gesture.wave')
    t=one(t,'-.12+(Math.sin(gesture.phase)*.23+.12)*gesture.wave','-.12*(1-gesture.wave)')
    t=one(t,'if (hand) hand.rotation.x = Math.sin(gesture.phase*1.2)*.35*axis*gesture.wave;', 'if(hand)hand.quaternion.identity();')
    t=one(t,"    const head = bone('head');", "    palmFacing?.apply(gesture.wave,gesture.phase);\n    const head = bone('head');")
    t=one(t,'    gestures.stop();state.mouthLevel=null;', '    gestures.stop();state.mouthLevel=null;palmFacing=null;')
    t=one(t,'      state.vrm = vrm; state.gltf = gltf;', '      state.vrm = vrm;palmFacing=createPalmFacing(vrm); state.gltf = gltf;')
    t=one(t,'gesture:gestures.active,mouthLevel:', 'palm:palmFacing?.diagnostics()||null,gesture:gestures.active,mouthLevel:')
    return t

ACCEPT="""    function requireRecenter(session,message,quality='lost',reason='lost') {
        if(!session.needsRecenter){session.recoverySamples=[];session.recoveryReason=reason;}
        session.needsRecenter=true;
        session.samples=[];
        // A stationary ornament should freeze, not jump back to the old centre.
        session.target={...(session.filtered||session.baseline)};
        status(session,quality==='multiple'?'multiple':'lost',message,quality);
    }

    function acceptMeasurement(session,measurement,time) {
        const pose=measurement.pose;
        if(!pose||!measurement.headAnchor)return;
        if(session.reference&&(measurement.width!==session.reference.width||measurement.height!==session.reference.height)){
            session.recoveryBlocked=true;
            requireRecenter(session,'相机画面尺寸已改变，请重新确认屏幕与镜头位置并校准。','lost','geometry');return;
        }
        if(session.recoveryBlocked)return;
        session.lastSeen=time;
        if(session.needsRecenter){
            const samples=session.recoverySamples||(session.recoverySamples=[]),last=samples.at(-1);
            if(last&&time-last.time>250)samples.length=0;
            samples.push({...measurement,time});if(samples.length>7)samples.shift();
            if(!calibrationIsStable(samples))session.recoverySamples=[{...measurement,time}];
            if(session.recoverySamples.length<7||time-session.recoverySamples[0].time<200)return;
            // Preserve the original geometric reference for ordinary short loss.
            // A stable jump/multi-face recovery re-anchors to the held position,
            // so switching observers never teleports the room. No identity test.
            if(session.recoveryReason==='jump'||session.recoveryReason==='multiple'){
                session.reference=meanMeasurement(session.recoverySamples);
                session.baseline={...session.filtered};
            }
            session.needsRecenter=false;session.previousRaw=null;session.recoverySamples=[];
        }
        if(!session.reference){
            const last=session.samples.at(-1);
            if(last&&(time-last.time>250||last.width!==measurement.width||last.height!==measurement.height))session.samples=[];
            session.samples.push({...measurement,time});if(session.samples.length>CALIBRATION_FRAMES)session.samples.shift();
            if(!calibrationIsStable(session.samples))session.samples=[{...measurement,time}];
            status(session,'calibrating','保持自然坐姿片刻；允许侧向坐姿，不需要盯住镜头。','hold-still');
            if(session.samples.length<CALIBRATION_FRAMES||time-session.samples[0].time<280)return;
            const reference=meanMeasurement(session.samples);session.reference=reference;session.samples=[];
            if(session.calibration.estimateOrigin){
                const scale=session.calibration.ipd/reference.correctedSpan;
                session.baseline=baselineEye({x:session.calibration.cameraX-(reference.x-reference.width/2)*scale,
                    y:session.calibration.cameraY-(reference.y-reference.height/2)*scale,z:session.manualBaseline.z});
            }
        }
        const raw=boundedHeadEye(estimateHeadEye(session.reference,measurement,session.baseline),session.baseline);
        if(!raw)return;
        if(session.previousRaw&&(Math.abs(raw.x-session.previousRaw.x)>.18||Math.abs(raw.y-session.previousRaw.y)>.18||Math.abs(raw.z-session.previousRaw.z)>.35)){
            requireRecenter(session,'检测变化较大，暂时保位；稳定单人入镜后自动恢复。','lost','jump');return;
        }
        session.previousRaw=raw;session.target=baselineEye(raw);
        status(session,'tracking',measurement.eyes?'整脸与头部姿态追踪 · 不依赖瞳孔方向':'头部姿态追踪 · 双眼不可见时的近似位置','good');
    }

"""
def tracking(t):
    t=MARK+"\nimport {measureHead as measureEyes,meanMeasurement,calibrationIsStable,estimateHeadEye,boundedHeadEye} from './head-estimator.mjs';\n"+t
    t=one(t,'const CALIBRATION_FRAMES = 15;','const CALIBRATION_FRAMES = 9;')
    t=one(t,'const FILTER_MS = 55;','const FILTER_MS = 45;')
    t=section(t,'function facePose(matrix) {','function startupFailure(error, stage) {','')
    t=one(t,'minFaceDetectionConfidence: 0.6','minFaceDetectionConfidence: 0.45')
    t=one(t,'minFacePresenceConfidence: 0.6','minFacePresenceConfidence: 0.5')
    t=one(t,'minTrackingConfidence: 0.6','minTrackingConfidence: 0.5')
    t=one(t,'width: { ideal: 640 }, height: { ideal: 480 }','width: { ideal: 1280 }, height: { ideal: 720 }')
    t=one(t,'        session.needsRecenter = false;', '        session.needsRecenter = false;session.recoverySamples=[];session.recoveryReason=null;session.recoveryBlocked=false;')
    t=section(t,'    function requireRecenter(session,','    function tick(session, time) {',ACCEPT)
    t=one(t,"requireRecenter(session, '检测到多人，已暂停跟随；请只保留一人入镜后重新校准。', 'multiple');", "requireRecenter(session,'检测到多人，已暂停；稳定单人入镜后自动恢复。','multiple','multiple');")
    t=t.replace('请一人正对镜头、保持约一秒；正在采集至少 15 帧稳定眼位。','保持自然坐姿片刻；正在用整张脸标定头部位置，无需盯住镜头。')
    t=t.replace('请让一张完整人脸进入取景框，保持眼睛清晰可见。','暂时没有可靠面部位置；画面保持不动，重新进入镜头后自动恢复。')
    t=t.replace('time - session.lastSeen > 850','time - session.lastSeen > 1200')
    t=t.replace('眼位丢失较久，已回到校准位置；请重新校准后继续。','暂时保留最后观看位置；稳定单人入镜后自动恢复。')
    t=t.replace('The sole output filter has a 55 ms','The sole output filter has a 45 ms')
    t=t.replace("if (session.reference) requireRecenter", "if (session.reference) requireRecenter")
    return t

def html(t):
    t=t.replace('<input id="show-preview" type="checkbox" checked>','<input id="show-preview" type="checkbox">')
    t=re.sub(r'(<input[^>]*id="show-preview"[^>]*?)\s+checked(?=[\s>])',r'\1',t)
    t=one(t,'<span class="command-divider" aria-hidden="true"></span>', '<span id="quiet-tracking-status" class="quiet-tracking-status" role="status" aria-live="polite" hidden>追踪未开启</span>\n        <button id="quiet-camera-stop" class="button quiet" type="button" hidden>停止追踪</button>\n        <span class="command-divider" aria-hidden="true"></span>')
    t=t.replace('显示摄像头预览','显示诊断取景（仅本次开启）').replace('摄像头与眼位','面部 / 头部追踪').replace('确认前可取景，但画面不跟随眼位。','确认前可静默识别，但场景不跟随；诊断取景需手动开启。')
    t=t.replace('iPhone / iPad mini / Mac','iPhone / iPhone Air / iPad mini / Mac')
    t=t.replace('Mac 与 iPad 的三维桌面窗口。','iPhone Air、iPhone、iPad 与 Mac 的三维桌面窗口。')
    t=t.replace('<p class="micro">沿垂直于屏幕的方向测量距离。</p>', '<p class="micro">沿垂直于屏幕的方向测量距离。设备侧放时按自然坐姿校准，不必持续看镜头。单目头部位置是近似估计；完全背脸或被遮挡时会暂停。</p>')
    return t

if __name__=='__main__':
    edits={}
    for name,fn in [('app.js',app),('renderer.js',renderer),('tracking.mjs',tracking)]:
        t=(ROOT/name).read_text()
        if not t.startswith(MARK):edits[name]=fn(t)
    if edits:
        edits['index.html']=html((ROOT/'index.html').read_text())
        m=(ROOT/'mobile.mjs').read_text()
        edits['mobile.mjs']=one(m,"  'iphone-large':", "  'iphone-air': Object.freeze({label:'iPhone Air · 6.5 英寸参考', short:cm(1260,460), long:cm(2736,460), distance:40}),\n  'iphone-large':")
        css=(ROOT/'styles.css').read_text()
        edits['styles.css']=css+'\n/* Quiet camera UI: preview is an explicit diagnostic only. */\n.quiet-tracking-status{font-size:12px;max-width:150px;line-height:1.35;color:#395541;}\n@media(max-width:600px){.command-bar{flex-wrap:wrap;}.quiet-tracking-status{max-width:120px;font-size:11px;}#quiet-camera-stop{min-height:44px;}}\n'
        about=(ROOT/'about.html').read_text()
        about=about.replace('<h2>当前状态与数据</h2>','<h2>本次更新：静默头部追踪与 iPhone Air</h2><p>“调整 → 使用设备”新增 iPhone Air 独立近似尺寸。摄像头须点击授权后才启动，默认不展示取景；诊断取景只在本次手动开启时显示。系统摄像头指示始终由浏览器保留。跟踪使用整脸几何与头部姿态估计观看位置，允许自然侧坐姿；短暂丢失保留最后位置，稳定单人返回后自动恢复。多人、背脸或严重遮挡时暂停。不是 TrueDepth 或身份识别。</p><p>招手使用模型实际手指骨骼定义掌面，朝向屏幕前方；修改不写回模型。当前验收仅为自动化与软件 WebGL，真实 iPhone Air/Safari、侧脸成功率及温升仍需实机检查。</p><h2>当前状态与数据</h2>')
        about=about.replace('“说一句”使用系统朗读和演示口型，尚未接入 AI 对话或原角色声音。','“动作 / 语音”支持系统朗读与本地音频。系统朗读为演示口型；本地音频为音量近似口型。未接入 AI 对话或原角色声音。')
        edits['about.html']=about
        spec=ROOT.parents[2]/'docs/changes/165-desktop-portrait/spec.md'
        # This application is three directories below the repository root.
        spec=ROOT.parents[2]/'docs/changes/165-desktop-portrait/spec.md'
        if spec.exists():
            addition='\n## 2026-11-14 用户批准的追踪、掌面与 Air 修订\n\n用户批准既有改动并要求发布到原 Netlify 独立站点。新增 iPhone Air 独立预设，依据 Apple 1260×2736、460 ppi，必须手动选择并用尺复核。默认不展示/不持久化相机预览；视频在 DOM 中持续供帧，保留相机权限、系统指示与显式停止入口。采用整脸头部姿态、自然侧向校准（软件允许 yaw 至 70°，不是实测识别保证）、短暂丢失保位、稳定单人自动恢复；多人暂停，画面尺寸变化仍需重新校准。仅使用单目校准比例，不声称真实距离或身份识别。角色与观察相机分离；招手按实际手指骨骼求掌面朝屏幕前方，验证两个现有模型。发布须通过测试、保护环境和精确目标回读，不修改主站目标。\n'
            if '用户批准的追踪、掌面与 Air 修订' not in spec.read_text():spec.write_text(spec.read_text()+addition)
    for name,t in edits.items():(ROOT/name).write_text(t)
    print('REFINED_SOURCE',list(edits))
