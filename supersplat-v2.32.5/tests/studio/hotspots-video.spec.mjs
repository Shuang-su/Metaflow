import { test, expect } from '@playwright/test';
import { writeFile, readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { boot } from '../e2e/helpers.mjs';
import { setupCalibrationScene, installVideoAudit, renderVideo, probeVideo, clearAudit } from '../e2e/video-helpers.mjs';

async function ready(page) {
    const errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.addInitScript(installVideoAudit);
    await page.addInitScript(() => {
        window.cameraFrames = [];
        const encode = window.VideoEncoder.prototype.encode;
        window.VideoEncoder.prototype.encode = function (frame, options) {
            const camera = window.scene?.camera;
            if (camera) window.cameraFrames.push({timestamp:frame.timestamp,position:camera.mainCamera.getPosition().toArray()});
            return encode.call(this, frame, options);
        };
    });
    await boot(page,'/studio/');
    await page.waitForFunction(()=>window.scene.events.functions.has('studio.project'));
    await page.evaluate(setupCalibrationScene);
    await page.evaluate(async()=>{const e=window.scene.events,s=e.invoke('studio.experience');s.cameras=[{initial:{position:[0,0,5],target:[0,0,0],fov:60}}];s.annotations=[];s.animTracks=[];await e.invoke('studio.importExperience',s);});
    return errors;
}
async function pixels(page,z) {
    return page.evaluate(async z=>{
        const s=window.scene,e=s.events,p=e.invoke('studio.experience');
        p.annotations=z===null?[]:[{position:[0,0,z],title:'中文热点',text:'遮挡后保持淡显\n沿用 Viewer',camera:p.cameras[0]}];
        await e.invoke('studio.importExperience',p);
        s.forceRender=true;await new Promise(r=>e.once('postrender',r));
        const rt=e.invoke('studio.renderTarget'),d=new Uint8Array(rt.width*rt.height*4);
        await rt.colorBuffer.read(0,0,rt.width,rt.height,{renderTarget:rt,data:d});
        const scale=rt.height/s.canvas.clientHeight,out=[];
        for(let dy=-6;dy<=6;dy++)for(let dx=-9;dx<=-4;dx++){const i=(Math.floor(rt.height/2+dy*scale)*rt.width+Math.floor(rt.width/2+dx*scale))*4;out.push(...d.slice(i,i+3));}
        return {mean:out.reduce((a,b)=>a+b,0)/out.length,values:out};
    },z);
}
test('Viewer GPU hotspots occlude through splats, hover and remain clickable',async({page})=>{
    const errors=await ready(page);
    const background=await pixels(page,null),front=await pixels(page,1),behind=await pixels(page,-1);
    console.log(JSON.stringify({background:background.mean,front:front.mean,behind:behind.mean}));
    expect(Math.abs(front.mean-behind.mean)).toBeGreaterThan(10);
    expect(Math.abs(behind.mean-background.mean)).toBeLessThan(Math.abs(front.mean-background.mean));
    await page.screenshot({path:test.info().outputPath('hotspot-occluded.png')});
    const canvas=await page.locator('#canvas').boundingBox();await page.mouse.move(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
    await page.mouse.click(canvas.x+canvas.width/2,canvas.y+canvas.height/2);
    await expect(page.locator('.studio-floating-card')).toContainText('中文热点');
    await page.screenshot({path:test.info().outputPath('hotspot-selected.png')});
    await writeFile(test.info().outputPath('occlusion.json'),JSON.stringify({background,front,behind},null,2));expect(errors).toEqual([]);
});

test('frame based camera video shares GPU hotspots, effects and Chinese text',async({page})=>{
    test.setTimeout(120000);const errors=await ready(page);
    await page.evaluate(async()=>{const e=window.scene.events,s=e.invoke('studio.experience');s.annotations=[{position:[0,0,-1],title:'中文镜头验证',text:'第零帧开始\n第二行说明',camera:s.cameras[0]}];s.animTracks=[{name:'Camera',duration:1,frameRate:30,loopMode:'pingpong',interpolation:'spline',smoothness:1,keyframes:{times:[0,15,30],values:{position:[0,0,5,1,0,5,0,0,5],target:[0,0,0,0,0,0,0,0,0],fov:[60,60,60]}}}];s.postEffectSettings.bloom.enabled=true;s.postEffectSettings.bloom.intensity=.08;await e.invoke('studio.importExperience',s);const p=e.invoke('studio.project');p.video.overlay='selected';p.video.selected=0;await e.invoke('studio.importProject',p);window.recordVideoPixels=true;});
    const file=test.info().outputPath('camera-hotspot-1080p30.mp4');
    const audit=await renderVideo(page,{startFrame:0,endFrame:30,frameRate:30,width:1920,height:1080,bitrate:8000000,format:'mp4',codec:'h264',transparentBg:false,showDebug:false,projection:'standard',reveal:'none'},file);
    expect(audit.frames).toHaveLength(31);expect(new Set(audit.hashes).size).toBeGreaterThan(10);
    const probe=probeVideo(file);expect(probe.streams[0].nb_read_frames).toBe('31');
    const cameraFrames=await page.evaluate(()=>window.cameraFrames);
    expect(cameraFrames).toHaveLength(31);
    expect(cameraFrames[0].position[0]).toBeCloseTo(0,5);
    expect(cameraFrames[15].position[0]).toBeCloseTo(1,5);
    expect(cameraFrames[30].position[0]).toBeCloseTo(0,5);
    audit.frames.forEach((frame,i)=>expect(frame.timestamp).toBe(Math.round(i*1e6/30)));
    probe.frames.forEach((frame,i)=>expect(Number(frame.pts_time)).toBeCloseTo(i/30,5));
    execFileSync('ffmpeg',['-v','error','-i',file,'-f','null','-']);
    await writeFile(test.info().outputPath('video-audit.json'),JSON.stringify({audit,probe,cameraFrames},null,2));
    expect(audit.locked).toBe(false);expect(audit.capturing).toBe(false);
    const variants=[];
    for (const mode of ['off','titles']) {
        await clearAudit(page);
        await page.evaluate(async mode=>{const e=window.scene.events,p=e.invoke('studio.project');p.video.overlay=mode;await e.invoke('studio.importProject',p);},mode);
        const variant=await renderVideo(page,{startFrame:0,endFrame:2,frameRate:30,width:1920,height:1080,bitrate:8000000,format:'mp4',codec:'h264',transparentBg:false,showDebug:false,projection:'standard',reveal:'none'},test.info().outputPath(`hotspot-${mode}.mp4`));
        expect(variant.frames).toHaveLength(3);expect(variant.hashes[0]).not.toBe(audit.hashes[0]);expect(variant.locked).toBe(false);variants.push({mode,hash:variant.hashes[0]});
    }
    expect(variants[0].hash).not.toBe(variants[1].hash);
    const playback=await page.context().newPage();
    await playback.setContent('<video controls muted></video>');
    await playback.locator('video').evaluate((video,bytes)=>{video.src=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'video/mp4'}));},Array.from(await readFile(file)));
    await playback.locator('video').evaluate(async video=>{if(video.readyState<2)await new Promise((resolve,reject)=>{video.onloadeddata=resolve;video.onerror=reject;});await video.play();});
    await expect.poll(()=>playback.locator('video').evaluate(video=>video.currentTime)).toBeGreaterThan(.1);
    await playback.locator('video').evaluate(async video=>{video.pause();video.currentTime=.7;await new Promise(resolve=>video.onseeked=resolve);});
    expect(await playback.locator('video').evaluate(video=>video.currentTime)).toBeCloseTo(.7,2);await playback.close();
    expect(errors).toEqual([]);
});
