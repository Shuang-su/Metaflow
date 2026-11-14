import {mouthFromSamples} from './motion.mjs';
const clamp=(value,lo,hi,fallback)=>Number.isFinite(Number(value))?Math.min(hi,Math.max(lo,Number(value))):fallback;
const noop=()=>{};
/** No microphone, upload, external TTS API or embedded secret. System voices may
 * themselves use a platform network service. Local audio stays in this page. */
export function createVoiceController({onState=noop,onMouth=noop,environment=globalThis}={}) {
  const env=environment;
  const timer=env.setTimeout?.bind(env)||setTimeout;
  const untimer=env.clearTimeout?.bind(env)||clearTimeout;
  let active=null,disposed=false,serial=0;
  const current=s=>active===s&&!s.closed&&!disposed;
  function emit(phase,kind='',text='',message='') {onState({phase,kind,text,message});}
  function close(s) {
    if(!s||s.closed)return;
    s.closed=true;untimer(s.timeout);untimer(s.startTimeout);
    if(s.frame!=null)env.cancelAnimationFrame?.(s.frame);
    if(s.utterance){
      for(const key of ['onstart','onend','onerror','onpause','onresume'])s.utterance[key]=null;
      try{env.speechSynthesis?.cancel();}catch{}
    }
    if(s.audio){
      for(const key of ['onplaying','onpause','onwaiting','onended','onerror'])s.audio[key]=null;
      try{s.audio.pause();s.audio.removeAttribute('src');s.audio.load();}catch{}
    }
    try{s.source?.disconnect();s.analyser?.disconnect();}catch{}
    if(s.context){try{Promise.resolve(s.context.close()).catch(noop);}catch{}}
    if(s.url)env.URL.revokeObjectURL(s.url);
  }
  function stop() {
    const old=active;active=null;serial++;close(old);onMouth(0);emit('idle');
  }
  function failure(s,message) {
    if(!current(s))return;
    active=null;close(s);onMouth(0);emit('error',s.kind,'',message);
  }
  function finished(s) {if(current(s))stop();}
  function begin(kind,text='') {
    stop();
    if(disposed)return null;
    const s={id:++serial,kind,text,closed:false,frame:null,timeout:null,startTimeout:null};
    active=s;emit('loading',kind,text);return s;
  }
  function voices() {try{return env.speechSynthesis?.getVoices()||[];}catch{return [];}}
  function speak(text,{voiceURI='',rate=.94,pitch=1,volume=1}={}) {
    if(disposed)return false;
    text=String(text??'').trim();
    if(!text||text.length>500){stop();emit('error','tts','','请输入 1–500 个字符。');return false;}
    if(!env.speechSynthesis||!env.SpeechSynthesisUtterance){stop();emit('error','tts','','当前浏览器没有系统朗读；可选择本地音频。');return false;}
    const s=begin('tts',text);if(!s)return false;
    try{
      const utterance=new env.SpeechSynthesisUtterance(text);s.utterance=utterance;
      const list=voices();
      utterance.voice=list.find(v=>v.voiceURI===voiceURI)||list.find(v=>/^zh[-_]CN/i.test(v.lang))||list.find(v=>/^zh/i.test(v.lang))||null;
      utterance.lang=utterance.voice?.lang||'zh-CN';
      utterance.rate=clamp(rate,.5,1.5,.94);utterance.pitch=clamp(pitch,.5,1.5,1);utterance.volume=clamp(volume,0,1,1);
      utterance.onstart=()=>{if(current(s)){untimer(s.startTimeout);onMouth(null);emit('playing','tts',text,'系统语音 · 演示口型');}};
      utterance.onend=()=>finished(s);
      utterance.onerror=event=>failure(s,event?.error==='not-allowed'?'请点击朗读按钮，并检查设备音量和浏览器音频权限。':'系统朗读未完成，请更换声音或重试。');
      utterance.onpause=()=>{if(current(s)){onMouth(0);emit('paused','tts',text);}};
      utterance.onresume=()=>{if(current(s)){onMouth(null);emit('playing','tts',text);}};
      // Invoke during the original user click; no awaited work precedes speak().
      env.speechSynthesis.speak(utterance);
      s.startTimeout=timer(()=>failure(s,'系统声音未开始播放，请再次点击或选择其他声音。'),12000);
      s.timeout=timer(()=>failure(s,'朗读超过保护时限，已停止。'),Math.min(300000,30000+text.length*500/utterance.rate));
      return true;
    }catch{failure(s,'无法启动系统朗读。');return false;}
  }
  function playFile(file,{volume=1}={}) {
    if(disposed)return false;
    if(!file||typeof file.size!=='number'||file.size<=0||file.size>30*1024*1024||
      (!String(file.type||'').startsWith('audio/')&&!/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name||''))){
      stop();emit('error','file','','请选择不超过 30 MiB 的音频文件。');return false;
    }
    if(!env.Audio){stop();emit('error','file','','当前环境没有音频播放接口。');return false;}
    const s=begin('file',file.name||'本地音频');if(!s)return false;
    try{
      const audio=new env.Audio();s.audio=audio;
      audio.preload='metadata';audio.playsInline=true;audio.volume=clamp(volume,0,1,1);
      s.url=env.URL.createObjectURL(file);audio.src=s.url;
      const Context=env.AudioContext||env.webkitAudioContext;
      if(Context){
        s.context=new Context();s.source=s.context.createMediaElementSource(audio);
        s.analyser=s.context.createAnalyser();s.analyser.fftSize=1024;
        s.source.connect(s.analyser);s.analyser.connect(s.context.destination);
        s.samples=new Uint8Array(s.analyser.fftSize);s.level=0;s.lastFrame=0;
      }
      function tick(time){
        if(!current(s)||audio.paused||audio.ended)return;
        s.frame=null;
        if(s.analyser){
          s.analyser.getByteTimeDomainData(s.samples);const target=mouthFromSamples(s.samples);
          const dt=s.lastFrame?Math.min(100,time-s.lastFrame):16;s.lastFrame=time;
          s.level+=(target-s.level)*(1-Math.exp(-dt/(target>s.level?45:100)));onMouth(s.level);
        }
        s.frame=env.requestAnimationFrame(tick);
      }
      function hold(){
        if(!current(s))return;
        if(s.frame!=null)env.cancelAnimationFrame(s.frame);s.frame=null;s.level=0;onMouth(0);emit('paused','file',s.text);
      }
      audio.onplaying=()=>{
        if(!current(s))return;
        untimer(s.startTimeout);emit('playing','file',s.text,s.analyser?'本地音频 · 音量口型':'本地音频 · 当前环境不支持口型分析');
        if(s.frame==null)s.frame=env.requestAnimationFrame(tick);
      };
      audio.onpause=hold;audio.onwaiting=hold;audio.onended=()=>finished(s);
      audio.onerror=()=>failure(s,'音频格式无法播放或文件损坏。可尝试 MP3、WAV 或 M4A。');
      // Both calls retain user activation on iPhone / iPad. A late completion
      // cannot restart a stopped or replaced session.
      const resumed=s.context?s.context.resume():Promise.resolve();
      const played=audio.play();
      Promise.all([resumed,played]).catch(()=>failure(s,'音频没有开始播放，请再次点击播放并检查音量。'));
      s.startTimeout=timer(()=>failure(s,'音频启动超时，已释放播放资源。'),12000);
      return true;
    }catch{failure(s,'无法读取音频或创建音频分析器。');return false;}
  }
  return {speak,playFile,stop,voices,
    dispose(){if(disposed)return;stop();disposed=true;},
    get active(){return !!active;},
    get kind(){return active?.kind||'';}
  };
}
