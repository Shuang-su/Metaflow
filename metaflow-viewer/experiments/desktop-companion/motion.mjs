const clamp=(n,a,b)=>Math.min(b,Math.max(a,n));
const smooth=(x)=>{x=clamp(x,0,1);return x*x*(3-2*x);};
export const GESTURES=Object.freeze({wave:2.8,nod:1.7,shake:1.8,bow:2.4});
export function gesturePose(name, elapsed, axis=1) {
  const zero={wave:0,phase:0,pitch:0,yaw:0,spine:0,smile:0,done:true};
  const duration=GESTURES[name];
  if(!duration||!Number.isFinite(elapsed)||elapsed<0||elapsed>=duration)return zero;
  const sign=axis<0?-1:1;
  const weight=smooth(elapsed/.25)*smooth((duration-elapsed)/.4);
  const result={...zero,done:false,phase:elapsed*10};
  if(name==='wave'){result.wave=weight;result.smile=.15*weight;}
  if(name==='nod')result.pitch=(1-Math.cos(elapsed*8))*.09*weight*sign;
  if(name==='shake')result.yaw=Math.sin(elapsed*8)*.24*weight;
  if(name==='bow'){result.spine=.22*weight*sign;result.pitch=.10*weight*sign;result.smile=.08*weight;}
  return result;
}
export function createGesturePlayer() {
  let action=null;
  return {
    play(name,time){if(!Object.hasOwn(GESTURES,name)||!Number.isFinite(time))return false;action={name,time};return true;},
    stop(){action=null;},
    sample(time,axis=1){
      if(!action)return gesturePose('',0,axis);
      const result=gesturePose(action.name,time-action.time,axis);
      if(result.done)action=null;
      return result;
    },
    get active(){return action?.name||null;}
  };
}
// Amplitude-only lipsync: deliberately not described as phoneme/viseme timing.
export function mouthFromSamples(samples) {
  if(!samples?.length)return 0;
  let mean=0;for(const x of samples)mean+=x/128-1;mean/=samples.length;
  let power=0;for(const x of samples)power+=(x/128-1-mean)**2;
  return clamp((Math.sqrt(power/samples.length)-.008)*5.5,0,.85);
}
