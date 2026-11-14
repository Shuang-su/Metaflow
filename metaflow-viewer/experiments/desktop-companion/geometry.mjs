export function screenFrustum(width,height,eye,near=.015){
  if(![width,height,eye.x,eye.y,eye.z,near].every(Number.isFinite)||width<=0||height<=0||near<=0||eye.z<=near)throw new RangeError('Invalid physical screen geometry');
  return {left:near*(-width/2-eye.x)/eye.z,right:near*(width/2-eye.x)/eye.z,top:near*(height/2-eye.y)/eye.z,bottom:near*(-height/2-eye.y)/eye.z};
}
export function inspectVrm(buffer){
  if(!(buffer instanceof ArrayBuffer)||buffer.byteLength<20)throw new Error('请选择完整的单文件 VRM 模型。');
  const view=new DataView(buffer);
  if(view.getUint32(0,true)!==0x46546c67||view.getUint32(4,true)!==2||view.getUint32(8,true)!==buffer.byteLength)throw new Error('文件不是完整的 VRM / GLB 2.0。');
  let json=null;
  for(let p=12;p<buffer.byteLength;){
    if(p+8>buffer.byteLength)throw new Error('模型数据不完整。');
    const len=view.getUint32(p,true),type=view.getUint32(p+4,true);p+=8;
    if(len%4||p+len>buffer.byteLength)throw new Error('模型数据块损坏。');
    if(type===0x4e4f534a){if(json||len>8*1024*1024)throw new Error('模型描述过大或重复。');json=JSON.parse(new TextDecoder().decode(new Uint8Array(buffer,p,len)).replace(/\0+$/,''));}
    p+=len;
  }
  if(!json?.extensions?.VRMC_vrm&&!json?.extensions?.VRM)throw new Error('这个 GLB 没有 VRM 人形角色信息。');
  for(const item of [...(json.buffers||[]),...(json.images||[])])if(item.uri&&!/^data:/i.test(item.uri))throw new Error('请使用贴图和数据完整内嵌的单文件 VRM。');
  return json;
}
