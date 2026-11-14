// Hide presentation, never permission prompts or the OS camera indicator.
// An attached non-display:none video avoids suspending mobile Safari decoding.
export function placeTrackingVideo(video,enabled,doc=document){
  const card=doc.getElementById('camera-card'),host=doc.getElementById('camera-preview');
  card.hidden=!video||!enabled;
  if(!video)return;
  video.muted=true;video.playsInline=true;video.hidden=false;
  video.setAttribute('playsinline','');video.className='camera-video';
  if(enabled){
    video.removeAttribute('aria-hidden');video.style.cssText='width:100%;height:100%;object-fit:contain;display:block';
    if(video.parentElement!==host)host.prepend(video);
  }else{
    video.setAttribute('aria-hidden','true');
    video.style.cssText='position:fixed;left:-2px;top:0;width:1px;height:1px;opacity:0;pointer-events:none';
    if(video.parentElement!==doc.body)doc.body.append(video);
  }
}
