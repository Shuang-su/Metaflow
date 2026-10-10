import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';
const source = await readFile(new URL('../src/poster.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, { compilerOptions: {module: ts.ModuleKind.ESNext,target: ts.ScriptTarget.ES2022} });
const { initPoster } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
const fixture = (complete = false, naturalWidth = 0) => {
    const images = new Map(), listeners = new Map(), classes = new Set(), timers = new Map(), frames = new Map();let id = 0;
    const saved = new Map(['setTimeout','clearTimeout','requestAnimationFrame','cancelAnimationFrame'].map(key => [key,globalThis[key]]));
    globalThis.setTimeout = fn => {timers.set(++id,fn);return id;};globalThis.clearTimeout = id => timers.delete(id);
    globalThis.requestAnimationFrame = fn => {frames.set(++id,fn);return id;};globalThis.cancelAnimationFrame = id => frames.delete(id);
    const style = () => ({ setProperty(key,value) {this[key]=value;} });
    const poster = {style:style()}, root={dataset:{},style:style(),classList:{add:c=>classes.add(c),remove:c=>classes.delete(c)},querySelector:()=>poster};
    const image={src:'/cover.webp',complete,naturalWidth,addEventListener:(n,f)=>images.set(n,f),removeEventListener:(n,f)=>{if(images.get(n)===f)images.delete(n);}};
    const events={on:(n,f)=>listeners.set(n,f),off:(n,f)=>{if(listeners.get(n)===f)listeners.delete(n);}};
    const stop=initPoster(root,image,events);
    return { root,poster,classes,images,listeners,timers,frames,stop,paint(){for(const [id,fn] of frames){frames.delete(id);fn();}},close(){stop();for(const [k,v] of saved)globalThis[k]=v;} };
};
test('loading UI waits until the poster load and paint opportunity, including cached images',()=>{
    for(const cached of [false,true]){const f=fixture(cached,cached?4096:0);try{assert.ok(f.classes.has('sse-posterPending'));if(!cached)f.images.get('load')();assert.ok(f.classes.has('sse-posterPending'));f.paint();assert.equal(f.root.dataset.posterStatus,'ready');assert.equal(f.classes.size,0);assert.equal(f.timers.size,0);}finally{f.close();}}
});
test('failed and stalled images release loading UI; late success clears the fallback',()=>{
    for(const mode of ['error','timeout','cached-error']){const f=fixture(mode==='cached-error',0);try{if(mode==='error')f.images.get('error')();if(mode==='timeout')[...f.timers.values()][0]();assert.equal(f.root.dataset.posterStatus,'unavailable');assert.equal(f.classes.size,0);f.images.get('load')();f.paint();assert.equal(f.root.dataset.posterStatus,'ready');}finally{f.close();}}
});
test('a ready scene is never blocked by the poster and frees all pending work',()=>{
    const f=fixture();try{f.listeners.get('loaded:changed')();assert.equal(f.root.dataset.posterStatus,'scene-ready');assert.equal(f.root.style['--canvas-opacity'],'1');assert.equal(f.poster.style.display,'none');assert.equal(f.timers.size+f.images.size+f.listeners.size+f.frames.size,0);}finally{f.close();}
});
test('destroy or initialization failure disposes pending image events and frame callbacks idempotently',()=>{
    const f=fixture();try{f.images.get('load')();f.stop();f.stop();assert.equal(f.timers.size+f.images.size+f.listeners.size+f.frames.size,0);}finally{f.close();}
});
