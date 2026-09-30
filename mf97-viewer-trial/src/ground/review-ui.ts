import type { GroundReview, GroundCandidate, GroundDecisions, Point } from './types';
import { isCurrentGroundReview } from './review';
const get=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const select=get<HTMLSelectElement>('candidate'), reviews:GroundReview[]=[], entries:{review:GroundReview;candidate:GroundCandidate;file:string}[]=[];
const decisions=new Map<string,'accepted'|'rejected'>();let current=0,verifiedSourceHash:string|null=null;
const reason:Record<string,string>={'footprint-edge-or-hole':'原有边界或孔洞','step-or-curb':'楼梯踏步或路缘','thin-slab-or-headroom':'薄楼板或净空不足',
    'exceeds-one-source-voxel':'高度差超过一个源体素','vertical-structure':'靠近墙体或展台竖面','occupancy-conflict':'体素占用不一致','small-platform-or-fixture':'小型台面或展品',
    'coherent-platform-or-step':'连续台面、踏步或路缘'};
function paint(canvas:HTMLCanvasElement,review:GroundReview,c:GroundCandidate,side:boolean){
    const ctx=canvas.getContext('2d')!;ctx.clearRect(0,0,canvas.width,canvas.height);
    const points=[...(review.previewPoints??[]),...c.surface.footprint],a=points.map(p=>p.x),b=points.map(p=>side?p.y:p.z);
    const minA=Math.min(...a)-.2,maxA=Math.max(...a)+.2,minB=Math.min(...b)-.2,maxB=Math.max(...b)+.2;
    const project=(p:Point)=>[40+(p.x-minA)/(maxA-minA)*(canvas.width-80),canvas.height-40-((side?p.y:p.z)-minB)/(maxB-minB)*(canvas.height-80)];
    ctx.fillStyle='#87939d';for(const p of review.previewPoints??[]){const[x,y]=project(p);ctx.beginPath();ctx.arc(x,y,2.3,0,Math.PI*2);ctx.fill();}
    ctx.strokeStyle='#268344';ctx.lineWidth=2;ctx.beginPath();for(const [i,p]of c.surface.footprint.entries()){const[x,y]=project(p);if(i)ctx.lineTo(x,y);else ctx.moveTo(x,y);}ctx.closePath();ctx.stroke();
    if(review.gridBounds)for(const e of c.edits){const r=review.voxelResolution,raw=review.gridBounds.min;
        const p={x:raw[0]+(e.ix+.5)*r,y:raw[1]+(e.iy+.5)*r,z:raw[2]+(e.iz+.5)*r};
        if(review.coordinateSpace==='metaflow-rz180'){p.x=-p.x;p.y=-p.y;}
        const[x,y]=project(p);ctx.fillStyle=e.after?'#247dcc':'#da772f';ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.fill();}
    ctx.fillStyle='#4d5a66';ctx.font='18px system-ui';ctx.fillText(`X ${minA.toFixed(2)}…${maxA.toFixed(2)} m`,40,25);ctx.fillText(`${side?'Y':'Z'} ${minB.toFixed(2)}…${maxB.toFixed(2)} m`,40,canvas.height-12);
}
function render(){
    const entry=entries[current];for(const id of ['accept','reject','revert','previous','next','export'])get<HTMLButtonElement>(id).disabled=!entry;
    if(!entry){get('policy').textContent='';return;}select.value=String(current);const {review,candidate:c,file}=entry;
    const accepted=[...decisions.values()].filter(v=>v==='accepted').length,rejected=[...decisions.values()].filter(v=>v==='rejected').length;
    get('summary').textContent=`${reviews.length} 个分块，${entries.length} 个平面候选；已接受 ${accepted}，已拒绝 ${rejected}。当前 ${current+1}/${entries.length}。`;
    const currentPolicy=reviews.every(isCurrentGroundReview);
    get('policy').textContent=currentPolicy?'连续结构保护版本 2。':'旧保护规则或算法指纹缺失：可以查看，但必须重新筛查报告后才能接受或导出。';
    get<HTMLButtonElement>('accept').disabled=!currentPolicy || c.status!=='proposed' || verifiedSourceHash!==review.sourceHash;
    get<HTMLButtonElement>('export').disabled=!currentPolicy || verifiedSourceHash!==review.sourceHash;
    get('detail').textContent=`文件：${file}\n支持面：${c.surface.id}\n状态：${decisions.get(c.id)??'未决定'}；候选类别：${c.status}\n拟改 ${c.edits.length} 个体素；平面样本 ${c.pointCount} 点\n平均高度残差：${(c.residualBefore*100).toFixed(2)} cm → ${(c.residualAfter*100).toFixed(2)} cm\n保留原因：${c.reasons.map(x=>reason[x]??x).join('、')||'无'}\n未知支持面：${review.unknownSpanCount}；源分辨率：${review.voxelResolution*100} cm`;
    paint(get<HTMLCanvasElement>('top'),review,c,false);paint(get<HTMLCanvasElement>('side'),review,c,true);
}
get<HTMLInputElement>('files').onchange=async event=>{
    reviews.length=0;entries.length=0;decisions.clear();select.replaceChildren();get('error').textContent='';current=0;verifiedSourceHash=null;
    get('verification').textContent='源指纹尚未核验。';
    try{for(const file of Array.from((event.target as HTMLInputElement).files??[])){const review=JSON.parse(await file.text()) as GroundReview;
        if(review.version!==1 || !Array.isArray(review.candidates)||review.detector!=='Open3D-0.19.0.detect_planar_patches')throw Error('报告格式不匹配');
        if(reviews.length && (review.sourceHash!==reviews[0].sourceHash || review.analysisHash!==reviews[0].analysisHash))throw Error('请选择同一场景、同一源与算法版本的分块');reviews.push(review);
        for(const candidate of review.candidates){const index=entries.length;entries.push({review,candidate,file:file.name});
            const option=document.createElement('option');option.value=String(index);option.textContent=`${file.name} · ${candidate.surface.layerId} · ${candidate.edits.length} 个体素`;select.append(option);}}
        if(!entries.length)get('summary').textContent=`已载入 ${reviews.length} 个分块：没有候选面，保留未知/原始结构。`;render();
    }catch(e){get('error').textContent=(e as Error).message;entries.length=0;render();}
};
get<HTMLInputElement>('source-files').onchange=async event=>{
    verifiedSourceHash=null;get('error').textContent='';
    try{
        const files=Array.from((event.target as HTMLInputElement).files??[]),json=files.find(f=>f.name.endsWith('.voxel.json')),bin=files.find(f=>f.name.endsWith('.voxel.bin'));
        if(!json||!bin||!reviews.length)throw Error('请先载入报告，再同时选择原始体素 JSON 与 BIN。');
        if(bin.size>256*1024**2)throw Error('此页面仅核验不超过 256 MiB 的单块源，请在离线命令核验较大源。');
        const digest=async(f:File)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',await f.arrayBuffer()))].map(v=>v.toString(16).padStart(2,'0')).join('');
        const result=await digest(json)+':'+await digest(bin);if(result!==reviews[0].sourceHash)throw Error('原始源指纹与报告不一致，不能接受或导出。');
        verifiedSourceHash=result;get('verification').textContent='原始 JSON 与 BIN 的 SHA-256 已与报告一致。';
    }catch(e){get('error').textContent=(e as Error).message;get('verification').textContent='核验未通过。';}render();
};
select.onchange=()=>{current=Number(select.value);render();};
get('previous').onclick=()=>{current=Math.max(0,current-1);render();};get('next').onclick=()=>{current=Math.min(entries.length-1,current+1);render();};
get('accept').onclick=()=>{const entry=entries[current];if(!entry||!isCurrentGroundReview(entry.review)||entry.candidate.status!=='proposed'||verifiedSourceHash!==entry.review.sourceHash)return;
    decisions.set(entry.candidate.id,'accepted');render();};
get('reject').onclick=()=>{decisions.set(entries[current].candidate.id,'rejected');render();};
get('revert').onclick=()=>{decisions.delete(entries[current].candidate.id);render();};
get('export').onclick=()=>{
    if(!reviews.length||!reviews.every(isCurrentGroundReview)||verifiedSourceHash!==reviews[0].sourceHash)return;
    const result:GroundDecisions={version:1,sourceHash:reviews[0].sourceHash,analysisHash:reviews[0].analysisHash,
        acceptedCandidateIds:[...decisions].filter(([,v])=>v==='accepted').map(([id])=>id),rejectedCandidateIds:[...decisions].filter(([,v])=>v==='rejected').map(([id])=>id)};
    const url=URL.createObjectURL(new Blob([JSON.stringify(result,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='ground-decisions.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
};render();
