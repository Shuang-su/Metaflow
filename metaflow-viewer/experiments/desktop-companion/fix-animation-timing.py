"""Guarded integration of real-time gesture lifetimes with bounded VRM physics."""
from pathlib import Path
ROOT=Path(__file__).resolve().parent
p=ROOT/'renderer.js';t=p.read_text()
if "import {frameDelta}" not in t:
    old='const elapsed = Math.max((ms - state.lastTime) / 1000, 0);\n    const dt = Math.min(elapsed, .05); state.lastTime = ms; state.time += dt;'
    assert t.count(old)==1,'Unexpected renderer timing source'
    t="import {frameDelta} from './animation-timing.mjs';\n"+t
    t=t.replace(old,'const {elapsed,simulationDelta:dt} = frameDelta(ms,state.lastTime);\n    state.lastTime = ms; state.time += elapsed;')
    assert 'animateAvatar(dt, current)' in t
    # Exponential bone interpolation is stable at large deltas; the existing
    # vrm.update(Math.min(dt,.05)) inside animateAvatar still bounds spring physics.
    t=t.replace('updateProjection(current, dt); animateAvatar(dt, current);','updateProjection(current, dt); animateAvatar(elapsed, current);')
    p.write_text(t)
p=ROOT/'usability.test.mjs';t=p.read_text()
if 'gesture durations use real elapsed time at low fps' not in t:
    t+='''
import {frameDelta} from './animation-timing.mjs';
import {createGesturePlayer,GESTURES} from './motion.mjs';
test('gesture durations use real elapsed time at low fps without unbounded physics',()=>{
  for(const fps of [1,2,5,15,60,120])for(const name of Object.keys(GESTURES)){
    const player=createGesturePlayer();player.play(name,0);
    let clock=0,previous=0;
    for(let n=1;n<=Math.ceil((GESTURES[name]+1)*fps);n++){
      const now=n*1000/fps,step=frameDelta(now,previous);previous=now;
      assert.ok(step.simulationDelta>=0&&step.simulationDelta<=.05);
      clock+=step.elapsed;player.sample(clock);
      if(clock>=GESTURES[name]){assert.equal(player.active,null);break;}
    }
    assert.equal(player.active,null);
    assert.ok(clock<=GESTURES[name]+1/fps+.00001);
  }
});
test('animation clock rejects non-finite and backward frame timestamps',()=>{
  for(const [now,last] of [[NaN,0],[1,Infinity],[0,1]])assert.deepEqual(frameDelta(now,last),{elapsed:0,simulationDelta:0});
  assert.deepEqual(frameDelta(10000,0),{elapsed:10,simulationDelta:.05});
});
'''
    p.write_text(t)
p=ROOT/'tracking-refinement.e2e.mjs';t=p.read_text()
if 'const gestureStartedAt=Date.now()' not in t:
    t=t.replace("    await page.locator('#wave').click();", "    const gestureStartedAt=Date.now();await page.locator('#wave').click();")
    t=t.replace("    await page.waitForFunction(()=>window.__companionDiagnostics().renderer.gesture===null,{},{timeout:30000});", "    await page.waitForFunction(()=>window.__companionDiagnostics().renderer.gesture===null,{},{timeout:15000});\n    report.checks.push({model:choice,gestureFinished:true,wallMilliseconds:Date.now()-gestureStartedAt});")
    p.write_text(t)
print('FIXED gesture real-time clock / preserved bounded physics / low-fps regression checks')
