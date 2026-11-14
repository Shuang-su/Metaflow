import {createVoiceController} from './voice.mjs';
export function createCompanionControls({getRenderer,isReady,notify,openSettings,onSpeaking=()=>{},environment=window}) {
  const doc=environment.document,abort=new AbortController();
  const $=id=>doc.getElementById(id);
  const listen=(node,event,fn)=>node?.addEventListener(event,fn,{signal:abort.signal});
  const section=doc.createElement('section');section.className='companion-extras';section.id='companion-extras';section.tabIndex=-1;
  section.innerHTML=`<h3>动作与声音</h3>
    <p class="extra-help">动作不改变观看相机；静止时会平滑回到待机。</p>
    <div class="extra-actions" role="group" aria-label="角色动作">
      <button type="button" data-gesture="wave">招手</button><button type="button" data-gesture="nod">点头</button>
      <button type="button" data-gesture="shake">摇头</button><button type="button" data-gesture="bow">鞠躬</button>
    </div><button type="button" id="stop-gesture">停止动作</button>
    <label for="speech-text">要朗读的文字</label>
    <textarea id="speech-text" rows="3" maxlength="500" placeholder="输入想让角色说的话">你好！很高兴在你的桌上见到你。试着移动一下视线，或者让我向你打个招呼吧。</textarea>
    <label for="speech-voice">系统声音</label><select id="speech-voice"><option value="">自动选择中文声音</option></select>
    <p class="extra-help">这里是设备提供的系统声音，不是奶绿原声或 AI 对话。部分系统声音可能联网。</p>
    <label for="speech-rate">语速 <output id="speech-rate-value">0.94×</output></label>
    <input id="speech-rate" type="range" min="0.5" max="1.5" step="0.02" value="0.94">
    <label for="speech-volume">音量 <output id="speech-volume-value">100%</output></label>
    <input id="speech-volume" type="range" min="0" max="1" step="0.05" value="1">
    <label class="extra-check"><input id="speech-gesture" type="checkbox" checked>开口时轻轻点头</label>
    <div class="extra-actions"><button type="button" id="speech-play">朗读文字</button><button type="button" id="speech-stop">停止声音</button></div>
    <label for="speech-audio">本地音频 · 不上传</label><input id="speech-audio" type="file" accept="audio/*,.mp3,.wav,.m4a,.aac,.ogg,.flac">
    <p id="speech-file-name" class="extra-help">可播放你有权使用的配音，最大 30 MiB。</p>
    <button type="button" id="audio-play">播放所选音频</button>
    <p id="voice-status" role="status" aria-live="polite">点击后启用音频。系统朗读使用演示口型；音频文件使用音量近似口型。</p>`;
  const host=doc.querySelector('#settings-panel .settings-scroll');host.append(section);
  const shortcut=doc.createElement('button');shortcut.type='button';shortcut.id='motion-speech';shortcut.textContent='动作 / 语音';
  doc.querySelector('.command-bar').append(shortcut);
  let file=null,disposed=false,gestured=false;
  function available(){if(!isReady()){notify('角色尚未加载完成。',true);return false;}return true;}
  const voice=createVoiceController({environment,
    onMouth(level){getRenderer()?.setMouthLevel(level);},
    onState(s){
      if(disposed)return;
      const playing=s.phase==='playing';onSpeaking(playing);getRenderer()?.setSpeaking(playing);
      if(s.phase==='loading')gestured=false;
      if(playing&&!gestured&&$('speech-gesture').checked){getRenderer()?.playGesture('nod');gestured=true;}
      const label={loading:'正在准备声音',playing:s.kind==='tts'?'正在系统朗读 · 演示口型':'正在播放本地音频 · 音量口型',paused:'音频暂停或正在缓冲',idle:'声音已停止',error:s.message};
      $('voice-status').textContent=label[s.phase]||s.message;
      $('speak').textContent=voice?.active?'停止声音':'朗读文字';
      $('caption').hidden=!playing;
      $('caption').textContent=s.kind==='tts'?s.text:s.kind==='file'?`正在播放：${s.text}`:'';
      if(s.phase==='error')notify(s.message,true);
    }
  });
  function readText(){
    if(!available())return false;
    return voice.speak($('speech-text').value,{voiceURI:$('speech-voice').value,rate:Number($('speech-rate').value),volume:Number($('speech-volume').value)});
  }
  function refreshVoices(){
    if(disposed)return;
    const select=$('speech-voice'),value=select.value;
    select.replaceChildren(new Option('自动选择中文声音',''));
    const voices=voice.voices().slice().sort((a,b)=>Number(/^zh/i.test(b.lang))-Number(/^zh/i.test(a.lang)));
    for(const v of voices){const o=doc.createElement('option');o.value=v.voiceURI;o.textContent=`${v.name} · ${v.lang}${v.localService?' · 本机':''}`;select.append(o);}
    if([...select.options].some(o=>o.value===value))select.value=value;
  }
  // Opening the actions section must not summon the phone keyboard.
  listen(shortcut,'click',()=>{openSettings();section.scrollIntoView({block:'start'});section.focus({preventScroll:true});});
  for(const button of section.querySelectorAll('[data-gesture]'))listen(button,'click',()=>{if(available())getRenderer()?.playGesture(button.dataset.gesture);});
  listen($('stop-gesture'),'click',()=>getRenderer()?.stopGesture());
  listen($('speech-play'),'click',readText);
  listen($('speech-stop'),'click',()=>voice.stop());
  listen($('speech-audio'),'change',()=>{voice.stop();file=$('speech-audio').files?.[0]||null;$('speech-file-name').textContent=file?file.name:'尚未选择音频';});
  listen($('audio-play'),'click',()=>{if(available())voice.playFile(file,{volume:Number($('speech-volume').value)});});
  listen($('speech-rate'),'input',()=>{$('speech-rate-value').textContent=Number($('speech-rate').value).toFixed(2)+'×';});
  listen($('speech-volume'),'input',()=>{$('speech-volume-value').textContent=Math.round(Number($('speech-volume').value)*100)+'%';});
  listen(environment.speechSynthesis,'voiceschanged',refreshVoices);refreshVoices();
  return {
    toggleSpeech(){if(voice.active)voice.stop();else readText();},
    stop(){voice.stop();},
    dispose(){if(disposed)return;voice.dispose();disposed=true;abort.abort();file=null;section.remove();shortcut.remove();},
    diagnostics(){return {active:voice.active,kind:voice.kind};}
  };
}
