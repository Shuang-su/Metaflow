// Whole-face pose estimate, not gaze direction, identity, or TrueDepth data.
// FaceLandmarker matrices map canonical face coordinates into camera space.
// Only calibrated ratios/deltas are used; model centimetres are NOT real metres.
// Canonical eye anchor = mean of vertices 33,133,263,362 from MediaPipe's
// canonical_face_model.obj (Apache-2.0, Google). No iris visibility is required.
export const CANONICAL_EYE_ANCHOR = Object.freeze([0, 2.624618, 3.465663]);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const deg=180/Math.PI;
const dot=(a,b)=>a.reduce((n,x,i)=>n+x*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const finitePoint=p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=-.08&&p.x<=1.08&&p.y>=-.08&&p.y<=1.08;
export function inspectHeadPose(matrix){
  const d=matrix?.data;
  if(matrix?.rows!==4||matrix?.columns!==4||d?.length!==16||!Array.from(d).every(Number.isFinite))return null;
  if(Math.abs(d[3])+Math.abs(d[7])+Math.abs(d[11])>.001||Math.abs(d[15]-1)>.001)return null;
  const columns=[0,4,8].map(i=>Array.from(d).slice(i,i+3));
  const lengths=columns.map(v=>Math.hypot(...v));
  if(Math.min(...lengths)<.001||Math.max(...lengths)/Math.min(...lengths)>1.12)return null;
  const a=columns.map((v,i)=>v.map(x=>x/lengths[i]));
  if(Math.abs(dot(a[0],a[1]))>.1||Math.abs(dot(a[0],a[2]))>.1||Math.abs(dot(a[1],a[2]))>.1||dot(cross(a[0],a[1]),a[2])<.85)return null;
  const [x,y,z]=CANONICAL_EYE_ANCHOR;
  const anchor={x:d[0]*x+d[4]*y+d[8]*z+d[12],y:d[1]*x+d[5]*y+d[9]*z+d[13],depth:-(d[2]*x+d[6]*y+d[10]*z+d[14])};
  if(anchor.depth<=1||anchor.depth>2000||Math.hypot(anchor.x,anchor.y)>anchor.depth*3)return null;
  return {
    yaw:Math.atan2(a[2][0],a[2][2])*deg,
    pitch:Math.atan2(-a[2][1],Math.hypot(a[2][0],a[2][2]))*deg,
    roll:Math.atan2(a[0][1],a[1][1])*deg,
    horizontalProjection:Math.hypot(a[0][0],a[0][1]),
    verticalProjection:Math.hypot(a[1][0],a[1][1]),anchor
  };
}
export function measureHead(result,video){
  const points=result?.faceLandmarks?.[0],width=video?.videoWidth,height=video?.videoHeight;
  if(!points||!width||!height)return null;
  const pose=inspectHeadPose(result.facialTransformationMatrixes?.[0]);
  if(!pose||Math.abs(pose.yaw)>70||Math.abs(pose.pitch)>50||Math.abs(pose.roll)>55)return null;
  // Reject tiny/degenerate face fits, not merely small or occluded eye spacing.
  const face=[10,152,234,454,1,6].map(i=>points[i]).filter(finitePoint);
  if(face.length<4)return null;
  const faceHeight=(Math.max(...face.map(p=>p.y))-Math.min(...face.map(p=>p.y)))*height;
  const faceWidth=(Math.max(...face.map(p=>p.x))-Math.min(...face.map(p=>p.x)))*width;
  if(faceHeight<20||faceWidth<8)return null;
  let eyes=null,x,y,correctedSpan;
  const corners=[33,133,362,263].map(i=>points[i]);
  if(corners.every(finitePoint)){
    const left={x:(corners[0].x+corners[1].x)/2,y:(corners[0].y+corners[1].y)/2};
    const right={x:(corners[2].x+corners[3].x)/2,y:(corners[2].y+corners[3].y)/2};
    const midpoint={x:(left.x+right.x)/2,y:(left.y+right.y)/2};
    const span=Math.hypot((right.x-left.x)*width,(right.y-left.y)*height);
    if(span>=4){eyes={left,right,midpoint};x=midpoint.x*width;y=midpoint.y*height;correctedSpan=span/Math.max(.3,pose.horizontalProjection);}
  }
  if(!eyes){
    const top=points[10],bottom=points[152];
    if(!finitePoint(top)||!finitePoint(bottom))return null;
    // Eye-height approximation from the full face, used only to anchor the
    // initial screen offset. Subsequent motion uses the rigid head transform.
    x=(top.x*.68+bottom.x*.32)*width;y=(top.y*.68+bottom.y*.32)*height;
    correctedSpan=faceHeight*.36/Math.max(.45,pose.verticalProjection);
  }
  if(!Number.isFinite(correctedSpan)||correctedSpan<8)return null;
  return {x,y,span:correctedSpan,correctedSpan,width,height,pose,headAnchor:{...pose.anchor},eyes,source:eyes?'head+face':'head',faceHeight};
}
export function meanMeasurement(samples){
  if(!samples.length)return null;
  const mean=fn=>samples.reduce((sum,s)=>sum+fn(s),0)/samples.length;
  return {...samples.at(-1),x:mean(s=>s.x),y:mean(s=>s.y),correctedSpan:mean(s=>s.correctedSpan),
    headAnchor:{x:mean(s=>s.headAnchor.x),y:mean(s=>s.headAnchor.y),depth:mean(s=>s.headAnchor.depth)}};
}
export function calibrationIsStable(samples){
  if(!samples.length)return false;
  const range=fn=>Math.max(...samples.map(fn))-Math.min(...samples.map(fn));
  const span=samples.reduce((n,s)=>n+s.correctedSpan,0)/samples.length;
  const depth=samples.reduce((n,s)=>n+s.headAnchor.depth,0)/samples.length;
  return range(s=>s.x)<=span*.15&&range(s=>s.y)<=span*.15&&range(s=>s.headAnchor.depth)<=depth*.08&&
    range(s=>s.pose.yaw)<=8&&range(s=>s.pose.pitch)<=8&&range(s=>s.pose.roll)<=10;
}
export function estimateHeadEye(reference,measurement,baseline){
  const a=reference?.headAnchor,b=measurement?.headAnchor;
  if(!a||!b||!baseline||a.depth<=0||![a.x,a.y,a.depth,b.x,b.y,b.depth,baseline.x,baseline.y,baseline.z].every(Number.isFinite))return null;
  const scale=baseline.z/a.depth;
  return {x:baseline.x-(b.x-a.x)*scale,y:baseline.y+(b.y-a.y)*scale,z:baseline.z*b.depth/a.depth};
}
export function boundedHeadEye(eye,baseline){
  if(!eye)return null;
  return {x:clamp(eye.x,-.4,.4),y:clamp(eye.y,-.4,.45),z:clamp(eye.z,Math.max(.2,baseline.z*.55),Math.min(1.5,baseline.z*1.8))};
}
