import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test, { after } from 'node:test';
import ts from 'typescript';
import { Entity, EventHandler, Mat4, Vec3 } from 'playcanvas';

// Compile the shipping modules into a temporary ESM graph. Works on the project's Node 20 baseline.
const directory = mkdtempSync(join(tmpdir(), 'metaflow-xr-tests-'));
after(() => rmSync(directory, { recursive: true, force: true }));
const compiled = new Map();
const compile = (file) => {
    if (compiled.has(file)) return compiled.get(file);
    const output = join(directory, `${compiled.size}.mjs`);
    const url = pathToFileURL(output).href;
    compiled.set(file, url);
    if (file.endsWith('.json')) {
        writeFileSync(output, `export default ${readFileSync(file, 'utf8')}`);
        return url;
    }
    let source = ts.transpileModule(readFileSync(file, 'utf8'), {
        compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext }
    }).outputText;
    source = source.replace(/(from\s+['"])([^'"]+)(['"])/g, (_, before, specifier, after) => {
        let target;
        if (specifier.startsWith('.')) {
            let dependency = resolve(dirname(file), specifier);
            if (!/\.[a-z]+$/i.test(dependency)) {
                try { readFileSync(dependency + '.ts'); dependency += '.ts'; }
                catch { dependency = join(dependency, 'index.ts'); }
            }
            target = compile(dependency);
        } else target = import.meta.resolve(specifier);
        return before + target + after;
    });
    writeFileSync(output, source);
    return url;
};
const loadTs = (relative) => import(compile(fileURLToPath(new URL(relative, import.meta.url))));
const { hasStick, singleStickIntent, readStick, horizontalForward, rotateAroundHead, placeHead, moveOnGround, teleportTarget, standableFloor, findEntryFloor, FOOT_CLEARANCE } = await loadTs('../src/xr/locomotion.ts');
const { ensureNativeXrResolution } = await loadTs('../src/xr/presentation.ts');
const { captureSessionState } = await loadTs('../src/xr/session-state.ts');
const { XrVrNavigation } = await loadTs('../src/xr-navigation.ts');
const { XrSpatialMenu } = await loadTs('../src/xr/menu.ts');
const { InputOwner } = await loadTs('../src/xr/input-owner.ts');
const { DwellInput } = await loadTs('../src/xr/dwell.ts');
const { PalmIntent } = await loadTs('../src/xr/palm.ts');
const { SceneTargetQuery, observationTarget, stepToTarget } = await loadTs('../src/xr/scene-target.ts');
const { confirmSelection } = await loadTs('../src/xr/feedback.ts');
const { TiledVoxelCollision } = await loadTs('../src/collision/tiled-voxel-collision.ts');

const { surfaceCells, nearbySurfaceCells, appendCellEdges, cellEdgeBatches } = await loadTs('../src/voxel-wire-overlay.ts');

test('stereo voxel batches preserve all cells and never submit an oversized line draw', () => {
    const edges = [];
    for (let i = 0; i < 2000; i++) appendCellEdges(edges, [i * .05, 0, 0, .05]);
    const batches = [...cellEdgeBatches(edges)];
    assert.equal(batches.length, 8);
    assert.ok(batches.every(b => b.length <= 6144 * 3 && b.length % 72 === 0));
    assert.deepEqual(batches.flat(), edges);
    assert.deepEqual([...cellEdgeBatches([])], []);
    assert.equal([...cellEdgeBatches(edges.slice(0, 257 * 72))][1].length, 72);
});

const close = (a, b, message) => assert.ok(Math.abs(a - b) < 0.00001, `${message ?? ''}: ${a} != ${b}`);
const ground = (options = {}) => ({
    voxelResolution: .05,
    isReadyAt: (x) => x < (options.loadedUntil ?? Infinity),
    querySurfaceNormal: () => ({ nx: 0, ny: options.normalY ?? 1, nz: 0 }),
    queryRay(ox, oy, oz, dx, dy, dz, max) {
        if (dy >= 0 || options.noFloor) return null;
        const t = (2 - oy) / dy;
        return t >= 0 && t <= max ? { x: ox + dx * t, y: 2, z: oz + dz * t } : null;
    },
    queryCapsule: (x) => x + .18 > (options.wall ?? Infinity),
    querySphere: () => false,
    isFreeAt: () => true
});

test('stick deadzone preserves analog speed, clamps diagonals, and keeps neutral stick separate from touchpad', () => {
    assert.deepEqual(readStick([0.05, -0.05]), [0, 0]);
    close(readStick([0.575, 0])[0], 0.5);
    close(readStick([1, 0])[0], 1);
    close(Math.hypot(...readStick([1, 1])), 1);
    assert.deepEqual(readStick([1, 1, 0, 0]), [0, 0]);
    assert.deepEqual(readStick([NaN, Infinity]), [0, 0]);
});

test('pitch changes do not change walking speed; vertical gaze retains the last direction', () => {
    const previous = new Vec3(0, 0, -1);
    horizontalForward(new Vec3(.5, .866, 0), previous);
    close(previous.length(), 1);
    assert.deepEqual(horizontalForward(new Vec3(0, 1, 0), previous).toArray(), [1, 0, 0]);
});

test('turning preserves the room-scale head world position and only rotates the rig', () => {
    const rig = new Entity(); const head = new Entity(); rig.addChild(head);
    rig.setPosition(10, 2, -3); rig.setEulerAngles(0, 57, 0); head.setLocalPosition(1, 1.6, .4);
    const before = head.getPosition().clone(); const local = head.getLocalPosition().clone();
    rotateAroundHead(rig, head, 30);
    close(head.getPosition().distance(before), 0);
    close(head.getLocalPosition().distance(local), 0);
});

test('teleport placement handles arbitrary rig yaw and horizontal tracked offsets', () => {
    for (const yaw of [0, 30, 90, 180, -120]) {
        const rig = new Entity(); const head = new Entity(); rig.addChild(head);
        rig.setEulerAngles(0, yaw, 0); head.setLocalPosition(.7, 1.6, -.3);
        const local = head.getLocalPosition().clone(); const target = new Vec3(4, 3.7, -8);
        placeHead(rig, head, target);
        close(head.getPosition().distance(target), 0);
        close(head.getLocalPosition().distance(local), 0);
    }
});

test('teleport rejects missing collision, unknown tiles, steep surfaces and insufficient clearance', () => {
    const origin = new Vec3(0, 3.6, 0), ray = new Vec3(0, -1, -1).normalize();
    assert.equal(teleportTarget(null, origin, ray, origin, 1.6), null);
    assert.equal(teleportTarget(ground({ loadedUntil: 0 }), origin, ray, origin, 1.6), null);
    assert.equal(teleportTarget(ground({ normalY: 0 }), origin, ray, origin, 1.6), null);
    assert.equal(teleportTarget(ground({ wall: .1 }), origin, ray, origin, 1.6), null);
    const target = teleportTarget(ground(), origin, ray, origin, 1.6);
    close(target.y, 2); close(target.z, -1.6);
});

test('ground movement stops at walls, unready tile edges and unsupported floors', () => {
    const head = new Vec3(0, 3.6, 0);
    const wall = moveOnGround(ground({ wall: .6 }), head, 2, 1.6, 2, .1);
    assert.ok(wall.x <= .42); assert.ok(wall.z > 0);
    const tile = moveOnGround(ground({ loadedUntil: .6 }), head, 2, 1.6, 2, 0);
    assert.ok(tile.x < .42);
    assert.deepEqual(moveOnGround(ground({ noFloor: true }), head, 2, 1.6, 1, 0).toArray(), [0, 2, 0]);
    assert.equal(standableFloor(ground(), 0, 2.2, 0, 1.6, .5), 2);
});

test('streamed readiness uses the declared world coordinate transform and rejects outside bounds', () => {
    const collision = Object.create(TiledVoxelCollision.prototype);
    collision.loadOptions = { coordinateSpace: 'metaflow-rz180' };
    collision.manifest = { tiles: [{id:'a',coreBounds:{min:[-3,-5,-1],max:[-1,5,1]}}] };
    collision._loaded = new Map([['a', {}]]); collision._activeIds = new Set(['a']);
    assert.equal(collision.isReadyAt(2, 0), true);
    assert.equal(collision.isReadyAt(-2, 0), false);
    assert.equal(collision.isReadyAt(100, 0), false);
    collision._loaded.clear(); assert.equal(collision.isReadyAt(2, 0), false);
});

test('camera and rendering restore after cancellation/end, once, including nondefault rig state', () => {
    const rig = new Entity(); const camera = new Entity(); rig.addChild(camera);
    rig.setPosition(1, 2, 3); camera.setLocalPosition(.3, .4, .5);
    camera.camera = { nearClip:.2,farClip:500,clearColor:{clone:()=>({r:.2,g:.3,b:.4,a:1})},fov:65,horizontalFov:false,aspectRatio:2 };
    const app = { autoRender:false,scene:{gsplat:{splatBudget:4e6,colorUpdateAngle:.2,lodUpdateAngle:90,lodBehindPenalty:5}} };
    const restore = captureSessionState({app,camera});
    camera.camera.nearClip=.03; camera.camera.fov=110; rig.setPosition(100,0,0); camera.setLocalPosition(0,1.6,0);
    app.scene.gsplat.splatBudget=1e6; app.autoRender=true;
    restore();
    assert.deepEqual(rig.getPosition().toArray(),[1,2,3]); assert.deepEqual(camera.getLocalPosition().toArray(),[.3,.4,.5]);
    assert.equal(camera.camera.nearClip,.2); assert.equal(camera.camera.fov,65);
    assert.equal(app.scene.gsplat.splatBudget,4e6); assert.equal(app.autoRender,false);
    camera.camera.nearClip=.8; restore(); assert.equal(camera.camera.nearClip,.8);
});

test('selectend cancellation and source loss do not teleport; menu selection is exclusive', () => {
    const xr = new EventHandler(); xr.input = new EventHandler(); xr.visibilityState='visible'; xr._referenceSpace={};
    const rig = new Entity(); rig.script = { enabled: true };
    const nav = new XrVrNavigation({app:{xr},entity:rig});
    let selections=0, teleports=0;
    nav.menu={ownership:new InputOwner(),setPalm(){},open:true,begin:()=>true,select:()=>selections++,release:()=>{},cancel:()=>{}};
    nav.global={}; nav.initialized=true; nav.sessionVR=true;
    nav.teleport=()=>teleports++;
    const source = new EventHandler(); source.inputSource={targetRaySpace:{}};
    nav.addSource(source);
    nav.lastFrame=performance.now();
    const event={frame:{getViewerPose:()=>{throw new DOMException('Input event is not an animation frame','InvalidStateError');},getPose:()=>({})}};
    source.fire('selectstart',event); source.fire('selectend',event);
    assert.equal(selections,0); assert.equal(teleports,0);
    source.fire('selectstart',event); source.fire('select',event); source.fire('selectend',event);
    assert.equal(selections,1); assert.equal(teleports,0);
    source.fire('selectstart',event);
    nav.lastFrame=0;
    source.fire('select',event);
    assert.equal(selections,1);
    source.fire('selectend',event);
    nav.lastFrame=performance.now();
    nav.menu.open=false;nav.menu.begin=()=>false;
    source.fire('selectstart',event); nav.removeSource(source);source.fire('select',event);
    assert.equal(teleports,0);assert.equal(nav.handlers.size,0);
});

test('entry searches nearby loaded ground, keeps 45 degree voxel normals and refuses missing floor', () => {
    const collision = ground({ normalY: Math.SQRT1_2 });
    collision.queryCapsule = (x) => Math.abs(x) < .24;
    const floor = findEntryFloor(collision, new Vec3(0, 3.6, 0), 1.6);
    assert.ok(Math.abs(floor.x) >= .24);
    assert.equal(findEntryFloor(ground({ noFloor: true }), new Vec3(0, 3.6, 0), 1.6), null);
});

const navigationHarness = () => {
    const xr = new EventHandler(); xr.active = true; xr.visibilityState = 'visible'; xr.input = new EventHandler();
    const rig = new Entity(); rig.script = { enabled: true }; const camera = new Entity(); rig.addChild(camera);
    camera.setLocalPosition(.4, 1.6, .3);
    const nav = new XrVrNavigation({app:{xr},entity:rig});
    nav.global={camera,collision:null,collisionStatus:'unavailable'};
    nav.menu={ownership:new InputOwner(),setPalm(){},open:false,show(){this.open=true;},close(){this.open=false;},hide(){this.open=false;},cancel(){},release(){},isPointedAt(){return false},update(){}};
    nav.updateMarker=()=>{};nav.nextScenePreview=Infinity;
    nav.initialized=true; nav.sessionVR=true; nav.floor=0;
    return { nav, rig, camera };
};

test('menu and loss of tracking stop software movement, neutral input rearms, comfort has snap hysteresis', () => {
    const {nav,rig,camera}=navigationHarness();
    const left={gamepad:{axes:[0,0,0,0],buttons:[]},handedness:'left'};
    const right={gamepad:{axes:[0,0,0,0],buttons:[]},handedness:'right'};
    nav.inputSources.add(left);nav.inputSources.add(right);nav.validSources.add(left);nav.validSources.add(right);
    const tick=()=>{nav.lastFrame=performance.now();nav.update(.02);};
    tick(); left.gamepad.axes[3]=-1; nav.menu.open=true; const before=camera.getPosition().clone();tick();
    close(camera.getPosition().distance(before),0);
    nav.menu.open=false;tick();close(camera.getPosition().distance(before),0);
    left.gamepad.axes[3]=0;tick();left.gamepad.axes[3]=-1;tick();
    assert.ok(camera.getPosition().distance(before)>.01);
    nav.lastFrame=0;nav.update(.02);const stopped=camera.getPosition().clone();tick();close(camera.getPosition().distance(stopped),0);
    nav.validSources.add(left);nav.validSources.add(right);left.gamepad.axes[3]=0;tick();
    nav.preferences.locomotion='comfort';right.gamepad.axes[2]=1;const pivot=camera.getPosition().clone();tick();
    const rotated=rig.getLocalRotation().clone();close(camera.getPosition().distance(pivot),0);
    tick();assert.ok(rig.getLocalRotation().equals(rotated));
    right.gamepad.axes[2]=0;tick();right.gamepad.axes[2]=1;tick();assert.ok(!rig.getLocalRotation().equals(rotated));
});

test('late collision requires explicit calibration; tracked pose and seated height remain independent', () => {
    const {nav,camera}=navigationHarness();nav.entryEye.set(0,3.6,0);nav.global.collisionStatus='loading';
    nav.placeInitial();assert.equal(nav.needsFloorCalibration,true);
    const tracked=camera.getLocalPosition().clone();nav.global.collision=ground();nav.global.collisionStatus='ready';
    nav.onMenuAction('calibrate');assert.equal(nav.needsFloorCalibration,false);close(camera.getPosition().y,3.6+FOOT_CLEARANCE);
    nav.onMenuAction('boost');close(camera.getPosition().y,3.65+FOOT_CLEARANCE);close(camera.getLocalPosition().distance(tracked),0);
    nav.onMenuAction('boost');close(camera.getPosition().y,3.6+FOOT_CLEARANCE);
});

test('spatial panel selection matches the displayed row under rotation and consumes misses', () => {
    const menu=Object.create(XrSpatialMenu.prototype),entity=new Entity();
    entity.setPosition(4,2,-3);entity.setEulerAngles(15,90,0);entity.setLocalScale(.68,.86,1);
    let selected='';Object.assign(menu,{ownership:new InputOwner(),dwell:new DwellInput(),revision:0,progressPoints:Array.from({length:33},()=>new Vec3()),progressCenter:new Vec3(),entity,canvas:{height:1024},inverse:new Mat4(),rayOrigin:new Vec3(),rayDirection:new Vec3(),pressed:new Map(),open:true,rows:[{action:'resume'},{action:'reset'}],action:(action)=>selected=action});
    const transform=entity.getWorldTransform();const origin=transform.transformPoint(new Vec3(0,0,1));
    const row=transform.transformPoint(new Vec3(0,.5-(242+84+35)/1024,0));
    const source={getOrigin:()=>origin,getDirection:()=>row.clone().sub(origin).normalize()};
    assert.equal(menu.begin(source),true);menu.select(source);assert.equal(selected,'');assert.equal(menu.confirmation,'reset');menu.activate('confirm');assert.equal(selected,'reset');
    row.copy(transform.transformPoint(new Vec3(2,0,0)));selected='';assert.equal(menu.begin(source),true);menu.select(source);assert.equal(selected,'');
});

test('XR resolution corrects a window-to-headset DPR change without altering desktop preferences', () => {
    for (const backend of ['webgl','webgpu']) {
        const calls=[], session={}, properties={nearClip:.1,farClip:1000.53,fov:95};const onError=()=>{};
        const global={renderer:backend,app:{graphicsDevice:{maxPixelRatio:1.25},xr:{session,xrBridge:{attachPresentation:(...args)=>calls.push(args)}}},camera:{camera:{nearClip:.1,farClip:1000.53,camera:{setXrProperties:p=>Object.assign(properties,p)}}}};
        ensureNativeXrResolution(global,1.25,onError);assert.equal(calls.length,0);
        ensureNativeXrResolution(global,4,onError);
        assert.equal(calls.length,1);assert.equal(calls[0][0],session);
        assert.equal(calls[0][1].framebufferScaleFactor,1);
        assert.equal(calls[0][1].depthNear,.03);
        assert.equal(calls[0][1].depthFar,1000);
        assert.deepEqual(properties,{nearClip:.03,farClip:1000,fov:95});
        assert.equal(calls[0][1].onBindingError,onError);
        assert.equal(global.app.graphicsDevice.maxPixelRatio,1.25);
    }
});

test('single right controller can walk and turn, with grip enabling strafe; hands are not mistaken for sticks', () => {
    assert.equal(hasStick({gamepad:{axes:[],buttons:[{pressed:true}]}}),false);
    assert.equal(hasStick({gamepad:{axes:[0,0,0,0]}}),true);
    assert.deepEqual(singleStickIntent([0,0,1,0],false),{move:[0,0],turn:1});
    assert.deepEqual(singleStickIntent([0,0,1,0],true),{move:[1,0],turn:0});
    const {nav,rig,camera}=navigationHarness();
    const source={gamepad:{axes:[0,0,0,0],buttons:[{},{}]},handedness:'right'};
    nav.inputSources.add(source);nav.validSources.add(source);
    const tick=()=>{nav.lastFrame=performance.now();nav.update(.02);};tick();
    source.gamepad.axes[3]=-1;const before=camera.getPosition().clone();tick();assert.ok(camera.getPosition().distance(before)>.01);
    source.gamepad.axes[3]=0;source.gamepad.axes[2]=1;const pivot=camera.getPosition().clone();const rotation=rig.getLocalRotation().clone();tick();
    close(camera.getPosition().distance(pivot),0);assert.ok(!rig.getLocalRotation().equals(rotation));
    source.gamepad.buttons[1].pressed=true;const strafeRotation=rig.getLocalRotation().clone();tick();
    assert.ok(camera.getPosition().distance(pivot)>.01);assert.ok(rig.getLocalRotation().equals(strafeRotation));
});

test('voxel wire overlay uses real surface cells, omits solid interiors and yields through empty space', () => {
    const c={gridMinX:0,gridMinY:0,gridMinZ:0,numVoxelsX:3,numVoxelsY:3,numVoxelsZ:3,voxelResolution:1,flipXY:false,
        isVoxelSolid:(x,y,z)=>x>=0&&x<3&&y>=0&&y<3&&z>=0&&z<3};
    const visited=[...surfaceCells(c,new Vec3(1.5,1.5,1.5),5)];
    assert.equal(visited.length,27);assert.equal(visited.filter(Boolean).length,26);
    assert.equal(visited.some(cell=>cell&&cell[0]===1&&cell[1]===1&&cell[2]===1),false);
    const empty=[...surfaceCells({...c,isVoxelSolid:()=>false},new Vec3(1.5,1.5,1.5),5)];
    assert.equal(empty.length,27);assert.ok(empty.every(cell=>cell===null));
    assert.deepEqual([...surfaceCells(c,new Vec3(20,20,20),2)],[]);
});
test('voxel wire overlay preserves flipped cell bounds and emits twelve world-space cube edges', () => {
    const c={gridMinX:2,gridMinY:4,gridMinZ:6,numVoxelsX:1,numVoxelsY:1,numVoxelsZ:1,voxelResolution:.5,flipXY:true,
        isVoxelSolid:(x,y,z)=>x===0&&y===0&&z===0};
    const cells=[...surfaceCells(c,new Vec3(-2.25,-4.25,6.25),1)].filter(Boolean);
    assert.deepEqual(cells,[[-2.5,-4.5,6,.5]]);
    const lines=[];appendCellEdges(lines,cells[0]);assert.equal(lines.length,72);
    const xs=lines.filter((_,i)=>i%3===0),ys=lines.filter((_,i)=>i%3===1);
    assert.equal(Math.min(...xs),-2.5);assert.equal(Math.max(...xs),-2);
    assert.equal(Math.min(...ys),-4.5);assert.equal(Math.max(...ys),-4);
});

test('viewer tracking loss cancels held gestures and re-arms only after neutral input on recovery', () => {
    const {nav,camera}=navigationHarness();
    const source={gamepad:{axes:[0,0,0,-1],buttons:[]},handedness:'right',inputSource:{targetRaySpace:{}}};
    nav.inputSources.add(source);nav.validSources.add(source);nav.blockUntilNeutral=false;
    nav.gestures.set(source,'free');nav.lastFrame=performance.now();
    const before=camera.getPosition().clone();
    nav.onFrame({getViewerPose:()=>null,getPose:()=>({})});
    assert.equal(nav.lastFrame,0);assert.equal(nav.gestures.size,0);assert.equal(nav.validSources.size,0);
    const frame={getViewerPose:()=>({emulatedPosition:false}),getPose:()=>({})};
    nav.onFrame(frame);nav.update(.02);close(camera.getPosition().distance(before),0);
    source.gamepad.axes[3]=0;nav.onFrame(frame);nav.update(.02);
    source.gamepad.axes[3]=-1;nav.onFrame(frame);nav.update(.02);
    assert.ok(camera.getPosition().distance(before)>.01);
    const recovered=camera.getPosition().clone();
    nav.lastFrame=performance.now()-350;nav.gestures.set(source,'free');
    nav.onFrame(frame);nav.update(.02);
    assert.equal(nav.gestures.size,0);close(camera.getPosition().distance(recovered),0);
});

test('selection feedback is optional and controller disconnects cannot break an action', async () => {
    const pulses=[];
    confirmSelection({gamepad:{hapticActuators:[{pulse:(...args)=>{pulses.push(args);return Promise.resolve(true);}}]}});
    assert.deepEqual(pulses,[[.2,35]]);
    assert.doesNotThrow(()=>confirmSelection({gamepad:null}));
    assert.doesNotThrow(()=>confirmSelection({gamepad:{hapticActuators:[]}}));
    assert.doesNotThrow(()=>confirmSelection({gamepad:{hapticActuators:[{pulse:()=>{throw Error('disconnected');}}]}}));
    confirmSelection({gamepad:{hapticActuators:[{pulse:()=>Promise.reject(Error('unavailable'))}]}});
    await new Promise(resolve=>setImmediate(resolve));
});

test('capped voxel scan reaches the feet before distant floor cells and visits each cell once', () => {
    const c={gridMinX:-2.4,gridMinY:0,gridMinZ:-2.4,numVoxelsX:61,numVoxelsY:1,numVoxelsZ:61,voxelResolution:.08,flipXY:false,
        isVoxelSolid:(x,y,z)=>x>=0&&x<61&&y===0&&z>=0&&z<61};
    const cells=[...surfaceCells(c,new Vec3(0,1.2,0))].filter(Boolean);
    assert.ok(cells.length>2000);
    assert.equal(new Set(cells.map(c=>c.join(','))).size,cells.length);
    const first=cells[0];
    assert.ok(first[0]<=1e-6&&first[0]+first[3]>=-1e-6);
    assert.ok(first[2]<=1e-6&&first[2]+first[3]>=-1e-6);
    const ring=c=>Math.max(Math.round(Math.abs((c[0]-first[0])/.08)),Math.round(Math.abs((c[2]-first[2])/.08)));
    assert.ok(cells.every((c,i)=>i===0||ring(c)>=ring(cells[i-1])));
    const scans=nearbySurfaceCells([c,{...c,gridMinY:.1}],new Vec3(0,1.2,0));
    close(scans.next().value[1],0);close(scans.next().value[1],.1);
});

test('XR clearance matches Viewer walking throughout placement, teleport and reset', async () => {
    const {WalkController}=await loadTs('../src/cameras/walk-controller.ts');
    close(FOOT_CLEARANCE,new WalkController().hoverHeight);
    const {nav,rig,camera}=navigationHarness();nav.global.collision=ground();nav.global.collisionStatus='ready';
    nav.entryEye=new Vec3(0,3.8,0);nav.entryYaw=0;nav.preferences={posture:'standing',locomotion:'continuous'};
    const local=camera.getLocalPosition().clone();nav.placeInitial();
    close(camera.getPosition().y,2+local.y+FOOT_CLEARANCE);
    nav.teleport({getOrigin:()=>new Vec3(1,3.8,0),getDirection:()=>new Vec3(0,-1,0)});
    close(camera.getPosition().x,1);close(camera.getPosition().y,2+local.y+FOOT_CLEARANCE);
    nav.reset();close(camera.getPosition().y,2+local.y+FOOT_CLEARANCE);
    nav.onMenuAction('boost');close(camera.getPosition().y,2+1.65+FOOT_CLEARANCE);
    close(camera.getLocalPosition().distance(local),0);
});

test('walking averages supported ground across a small hole while teleport still refuses it', () => {
    const c=ground();c.queryRay=(x,oy,z)=>Math.abs(x)<.06&&Math.abs(z)<.06?null:{x,y:x>0?2.08:2,z};
    const moved=moveOnGround(c,new Vec3(0,3.8,0),2,1.6,.03,0);
    close(moved.x,.03);close(moved.y,(2+2.08*3)/4-.025);
    assert.equal(standableFloor(c,.03,2.25,0,1.6,.5),null);
    const steep=ground({normalY:0});close(moveOnGround(steep,new Vec3(0,3.8,0),2,1.6,.1,0).x,0);
    const drop=ground();drop.queryRay=(x,oy,z)=>({x,y:1.6,z});
    close(moveOnGround(drop,new Vec3(0,3.8,0),2,1.6,.1,0).x,0);
});

test('capsule push-out slides on diagonal walls without exceeding requested movement', () => {
    const c=ground();c.queryCapsule=(x,y,z,half,r,out)=>{const overlap=x+z-.03;if(overlap<=1e-7)return false;out.x=-overlap/2;out.y=0;out.z=-overlap/2;return true};
    const moved=moveOnGround(c,new Vec3(0,3.8,0),2,1.6,.04,0);
    close(moved.x,.035);close(moved.z,-.005);close(moved.y,2);
    assert.ok(Math.hypot(moved.x,moved.z)<=.04);
    const blocked=ground();blocked.queryCapsule=(x,y,z,half,r,out)=>{out.x=1;out.y=0;out.z=0;return true};
    assert.deepEqual(moveOnGround(blocked,new Vec3(0,3.8,0),2,1.6,.04,0).toArray(),[0,2,0]);
});

test('walking rechecks support after push-out and rejects ceiling descent and unresolved contact', () => {
    const c=ground();c.queryCapsule=(x,y,z,half,r,out)=>{if(z<0)return false;out.x=-.005;out.y=0;out.z=-.005;return true};
    c.isReadyAt=(x,z)=>z>=-.181;
    assert.deepEqual(moveOnGround(c,new Vec3(0,3.8,0),2,1.6,.04,0).toArray(),[0,2,0]);
    for(const y of [-.02,0]){const bad=ground();bad.queryCapsule=(x,cy,z,half,r,out)=>{out.x=out.z=0;out.y=y;return true};
        assert.deepEqual(moveOnGround(bad,new Vec3(0,3.8,0),2,1.6,.04,0).toArray(),[0,2,0]);}
});

test('walking resolves a low capsule contact without spring motion or penetration', () => {
    const c=ground();c.queryCapsule=(x,y,z,half,r,out)=>{const bottom=y-half-r;if(bottom>=2.23-1e-6)return false;out.x=out.z=0;out.y=2.23-bottom;return true};
    const moved=moveOnGround(c,new Vec3(0,3.8,0),2,1.6,.04,0);
    close(moved.x,.04);close(moved.y,2.03);
    const again=moveOnGround(c,new Vec3(moved.x,3.83,0),moved.y,1.6,.04,0);
    close(again.y,moved.y);
});

test('walking filters one noisy voxel-edge normal but still rejects a genuinely steep footprint', () => {
    const c=ground();c.querySurfaceNormal=(x,y,z)=>({nx:0,ny:x>.1?0:1,nz:0});
    close(moveOnGround(c,new Vec3(0,3.8,0),2,1.6,.03,0).x,.03);
    assert.equal(standableFloor(c,.03,2.25,0,1.6,.5),null);
    c.querySurfaceNormal=()=>({nx:0,ny:.5,nz:0});
    close(moveOnGround(c,new Vec3(0,3.8,0),2,1.6,.03,0).x,0);
});

test('posture and recalibration commit height only after clearance succeeds', () => {
    const {nav,rig,camera}=navigationHarness();camera.setLocalPosition(.4,1.1,.3);rig.setPosition(0,2.2,0);
    nav.floor=2;nav.preferences={posture:'standing',locomotion:'continuous'};nav.global.collision=ground();nav.global.collisionStatus='ready';
    let ceiling=3.5;nav.global.collision.queryCapsule=(x,y,z,half,r)=>y+half+r>ceiling;
    const start=camera.getPosition().clone();nav.onMenuAction('boost');
    assert.equal(!!nav.preferences.seatedBoost,false);assert.equal(nav.actionStatus,'posture-blocked');
    close(camera.getPosition().distance(start),0);close(nav.heightOffset,0);
    ceiling=4;nav.onMenuAction('boost');assert.equal(nav.preferences.seatedBoost,true);close(camera.getPosition().y,3.85);
    camera.setLocalPosition(.4,.9,.3);ceiling=3.5;
    const before=camera.getPosition().clone(),offset=nav.heightOffset;nav.onMenuAction('calibrate');
    close(camera.getPosition().distance(before),0);close(nav.heightOffset,offset);assert.equal(nav.needsFloorCalibration,false);
    assert.equal(nav.actionStatus,'calibration-needed');
    ceiling=4;nav.onMenuAction('calibrate');close(camera.getPosition().y,3.85);close(camera.getLocalPosition().y,.9);
});

test('last controller disconnect clears held selection, opens recovery menu and cannot replay after reconnect', () => {
    const {nav,camera}=navigationHarness();const source=new EventHandler();source.gamepad={axes:[0,0,0,-1],buttons:[]};source.handedness='right';source.inputSource={targetRaySpace:{}};
    nav.addSource(source);nav.gestures.set(source,'teleport');nav.validSources.add(source);let teleports=0;nav.teleport=()=>teleports++;
    nav.removeSource(source);assert.equal(nav.menu.open,true);assert.equal(nav.controllerDisconnected,true);
    assert.equal(nav.gestures.size,0);assert.equal(source.hasEvent('select'),false);
    source.gamepad.buttons=[{pressed:true},{},{},{},{},{pressed:true}];
    nav.addSource(source);nav.addSource(source);assert.equal(nav.handlers.size,1);assert.equal(nav.controllerDisconnected,false);
    let begins=0;nav.menu.begin=()=>{begins++;return true};nav.lastFrame=performance.now();
    source.fire('selectstart',{frame:{getPose:()=>({})}});assert.equal(begins,0);assert.equal(nav.gestures.size,0);
    assert.equal(nav.buttonHeld.has(source),true);
    source.gamepad.buttons[0].pressed=false;source.gamepad.buttons[5].pressed=false;source.fire('selectend');
    assert.equal(nav.selectNeedsRelease.size,0);
    nav.lastFrame=performance.now();source.fire('select',{frame:{getPose:()=>({})}});assert.equal(teleports,0);
    nav.onMenuAction('resume');nav.validSources.add(source);const before=camera.getPosition().clone();
    const tick=()=>{nav.lastFrame=performance.now();nav.update(.02)};tick();close(camera.getPosition().distance(before),0);
    source.gamepad.axes[3]=0;tick();source.gamepad.axes[3]=-1;tick();assert.ok(camera.getPosition().distance(before)>.01);
    nav.endSession();assert.equal(source.hasEvent('selectstart'),false);assert.equal(nav.handlers.size,0);
});

test('comfort previews one idle controller without selection and suppresses preview for menu and continuous mode', () => {
    const {nav}=navigationHarness();nav.global.collision=ground();nav.global.collisionStatus='ready';nav.preferences.locomotion='comfort';nav.blockUntilNeutral=false;
    const left={gamepad:{axes:[0,0,0,0],buttons:[]},handedness:'left'},right={gamepad:{axes:[0,0,0,0],buttons:[]},handedness:'right'},shown=[];
    for(const s of [left,right]){nav.inputSources.add(s);nav.validSources.add(s)}nav.drawTeleportPreview=s=>shown.push(s);
    const tick=()=>{nav.lastFrame=performance.now();nav.update(.02)};tick();assert.deepEqual(shown,[right]);assert.equal(nav.gestures.size,0);
    shown.length=0;nav.menu.isPointedAt=()=>true;tick();assert.equal(shown.length,0);
    nav.menu.isPointedAt=()=>false;nav.menu.open=true;tick();assert.equal(shown.length,0);
    nav.menu.open=false;nav.blockUntilNeutral=false;nav.preferences.locomotion='continuous';tick();assert.equal(shown.length,0);
});

test('teleport preview uses the validated landing point and invalid targets never draw a landing ring', () => {
    const {nav,camera}=navigationHarness();nav.global.collision=ground();
    const lines=[];nav.app.drawLine=(a,b,color)=>lines.push({a:a.clone(),b:b.clone(),color});
    const source={getOrigin:()=>new Vec3(1,3.8,0),getDirection:()=>new Vec3(0,-1,0)};
    const before=camera.getPosition().clone();nav.drawTeleportPreview(source);
    assert.equal(lines.length,nav.previewTrace.count-1+24);close(lines[nav.previewTrace.count-2].b.y,2);assert.equal(lines[0].color,nav.validColor);
    close(camera.getPosition().distance(before),0);
    nav.global.collision=ground({noFloor:true});nav.nextPreviewAt=0;lines.length=0;nav.drawTeleportPreview(source);
    assert.equal(lines.length,50);assert.equal(lines[0].color,nav.invalidColor);
    close(camera.getPosition().distance(before),0);
});

test('menu pointer stops at rotated panel with a world-sized reticle, including non-button margins', () => {
    const menu=Object.create(XrSpatialMenu.prototype),entity=new Entity();
    entity.setPosition(4,2,-3);entity.setEulerAngles(15,90,0);entity.setLocalScale(.68,.86,1);
    const lines=[];const origin=entity.getWorldTransform().transformPoint(new Vec3(.2,0,2.3));
    const target=entity.getWorldTransform().transformPoint(new Vec3(.1,.46,0));
    const source={getOrigin:()=>origin,getDirection:()=>target.clone().sub(origin).normalize()};
    Object.assign(menu,{ownership:new InputOwner(),dwell:new DwellInput(),revision:0,progressPoints:Array.from({length:33},()=>new Vec3()),progressCenter:new Vec3(),entity,width:.68,height:.86,canvas:{height:1024},inverse:new Mat4(),rayOrigin:new Vec3(),rayDirection:new Vec3(),pressed:new Map(),open:true,rows:[{action:'resume'}],material:{emissive:{}},draw(){},global:{state:{},app:{scene:{layers:{getLayerById:()=>({})}},drawLine:(a,b)=>lines.push([a.clone(),b.clone()])}}});
    const tick=()=>menu.update({locomotion:'comfort',posture:'standing'},'grounded',new Set([source]),new Set([source]));
    tick();assert.equal(lines.length,17);close(lines[0][1].distance(target),0);assert.equal(menu.hovered,-1);
    for(const [a,b] of lines.slice(1)){close(a.distance(target),.006);close(b.distance(target),.006)}
    // Outside the panel: no reticle and a short neutral ray, not an infinite intersection.
    target.copy(entity.getWorldTransform().transformPoint(new Vec3(2,0,0)));lines.length=0;tick();
    assert.equal(lines.length,1);close(lines[0][0].distance(lines[0][1]),1.4);
    // Behind the surface must not be selectable.
    origin.copy(entity.getWorldTransform().transformPoint(new Vec3(0,0,-1)));
    target.copy(entity.getPosition());assert.equal(menu.intersect(source),false);
});

test('compact menu stays fixed while aimed or pressed and follows again after disengagement', () => {
    const menu=Object.create(XrSpatialMenu.prototype),entity=new Entity(),camera=new Entity();
    entity.setPosition(0,1,-1);entity.setLocalScale(.23,.075,1);
    const origin=new Vec3(0,1,0),target=new Vec3(0,1,-1);
    const source={getOrigin:()=>origin,getDirection:()=>target.clone().sub(origin).normalize()};
    let placements=0;
    Object.assign(menu,{ownership:new InputOwner(),dwell:new DwellInput(),revision:0,progressPoints:Array.from({length:33},()=>new Vec3()),progressCenter:new Vec3(),entity,canvas:{height:1024},inverse:new Mat4(),rayOrigin:new Vec3(),rayDirection:new Vec3(),pressed:new Map(),open:false,rows:[],material:{emissive:{}},draw(){},place(){placements++},global:{camera,state:{},app:{scene:{layers:{getLayerById:()=>({})}},drawLine(){}}}});
    const tick=(valid=true)=>menu.update({locomotion:'comfort',posture:'standing'},'grounded',new Set([source]),new Set(valid?[source]:[]));
    tick();camera.setEulerAngles(0,20,0);tick();assert.equal(placements,0);
    assert.equal(menu.begin(source),true);target.x=2;tick();assert.equal(placements,0);
    menu.release(source);tick();assert.equal(placements,1);
    target.x=0;tick(false);assert.equal(placements,2); // stale rays cannot hold the control in place
});

test('teleport rejects a first wall or ceiling hit even when there is walkable floor below it', () => {
    const collision=ground();const queryFloor=collision.queryRay.bind(collision);
    let first=true, surfaceY=0;
    collision.queryRay=(...args)=>{if(first){first=false;return {x:0,y:2.1,z:-1}}return queryFloor(...args)};
    collision.querySurfaceNormal=(x,y,z,dx,dy)=>({nx:1,ny:dy===-1?1:surfaceY,nz:0});
    const origin=new Vec3(0,3.5,0),direction=new Vec3(0,-.4,-1).normalize(),head=new Vec3(0,3.6,0);
    for(const ny of [0,-1,NaN,.5]){first=true;surfaceY=ny;assert.equal(teleportTarget(collision,origin,direction,head,1.6),null)}
    first=true;surfaceY=1;assert.ok(teleportTarget(collision,origin,direction,head,1.6));
});

test('blocked teleport preview ends at obstacle and draws a rejection cross without moving the head', () => {
    const {nav,camera}=navigationHarness();nav.global.collision=ground({normalY:0});
    const lines=[];nav.app.drawLine=(a,b,color)=>lines.push({a:a.clone(),b:b.clone(),color});
    const before=camera.getPosition().clone();
    nav.drawTeleportPreview({getOrigin:()=>new Vec3(1,3.8,0),getDirection:()=>new Vec3(0,-1,0)});
    assert.equal(lines.length,nav.previewTrace.count+1);const endpoint=lines[nav.previewTrace.count-2].b;close(endpoint.y,2);
    for(const line of lines)assert.equal(line.color,nav.invalidColor);
    close(lines.at(-1).a.clone().add(lines.at(-1).b).mulScalar(.5).distance(endpoint),0);
    close(camera.getPosition().distance(before),0);
});

test('aiming an existing teleport gesture at the compact menu cancels teleport confirmation', () => {
    const {nav}=navigationHarness();nav.initialized=true;nav.preferences.locomotion='comfort';nav.global.collisionStatus='ready';
    const source=new EventHandler();source.inputSource={targetRaySpace:{}};
    let pointed=false,teleports=0;nav.menu.begin=()=>false;nav.menu.isPointedAt=()=>pointed;nav.teleport=()=>teleports++;
    nav.addSource(source);nav.lastFrame=performance.now();
    const event={frame:{getPose:()=>({})}};
    source.fire('selectstart',event);pointed=true;source.fire('select',event);source.fire('selectend');
    assert.equal(teleports,0);assert.equal(nav.gestures.size,0);
    pointed=false;source.fire('selectstart',event);source.fire('select',event);source.fire('selectend');assert.equal(teleports,1);
});

test('walking suppresses small height noise and follows cumulative slopes without staircase snaps', () => {
    const c=ground();let level=2;
    c.queryRay=(x,oy,z)=>({x,y:level,z});
    let floor=2,x=0;
    for(const y of [2.01,1.98,2.024,1.976,2]){level=y;const next=moveOnGround(c,new Vec3(x,floor+1.8,0),floor,1.6,.02,0);close(next.y,2);x=next.x;floor=next.y}
    for(const sign of [1,-1]){
        floor=2;x=0;
        for(let i=1;i<=20;i++){
            level=2+sign*i*.01;
            const next=moveOnGround(c,new Vec3(x,floor+1.8,0),floor,1.6,.02,0);
            close(next.y,2+sign*Math.max(0,i*.01-.025));
            assert.ok(Math.abs(next.y-floor)<=.010001);x=next.x;floor=next.y;
        }
    }
    // Hovering above a lower surface must still respect a low ceiling at the filtered height.
    level=1.98;c.queryCapsule=(x,y,z,half,r,out)=>{out.x=out.z=0;out.y=-.01;return true};
    assert.deepEqual(moveOnGround(c,new Vec3(0,3.8,0),2,1.6,.02,0).toArray(),[0,2,0]);
});

const { WheelInput, wheelSelection } = await loadTs('../src/xr/wheel.ts');
const { loadPreferences } = await loadTs('../src/xr/preferences.ts');
test('wheel has raw radial hysteresis, stable angular boundaries and explicit matching trigger confirmation',()=>{
 const w=new WheelInput();w.update([1,0],false);w.begin();assert.equal(w.commit(),null);
 w.update([0,0],true);assert.equal(w.armed,false);w.update([0,0],false);assert.equal(w.armed,true);
 w.update([0,-.6],false);assert.equal(w.selection,0);
 const axes=a=>[Math.sin(a*Math.PI/180),-Math.cos(a*Math.PI/180)];
 w.update(axes(52),false);assert.equal(w.selection,0);w.update(axes(54),false);assert.equal(w.selection,1);
 w.update([.4,0],false);assert.equal(w.selection,1);w.begin();w.update([0,1],true);assert.equal(w.commit(),null);
 w.begin();assert.equal(w.commit(),2);assert.equal(w.commit(),null);
 w.update([0,0],false);w.begin();assert.equal(w.commit(),-1);
 w.update([1,0],false);w.begin();w.release();assert.equal(w.commit(),null);
 w.cancel();assert.equal(w.armed,false);assert.equal(wheelSelection([NaN,0],1),-1);
});
test('XR preference migration keeps posture and mode, validates presets and tolerates broken storage',()=>{
 const previous=globalThis.localStorage;
 try{
  let saved=JSON.stringify({locomotion:'comfort',posture:'seated'});globalThis.localStorage={getItem:()=>saved};
  assert.deepEqual(loadPreferences(),{locomotion:'comfort',posture:'seated',seatedBoost:false,confirmation:'direct',dwellDuration:1000,mainHand:'right',handMovement:'teleport',movementSpeed:1.5,rotateSpeed:90,trajectory:'arc'});
  saved=JSON.stringify({movementSpeed:2.25,rotateSpeed:45,trajectory:'straight'});assert.equal(loadPreferences().movementSpeed,2.25);assert.equal(loadPreferences().trajectory,'straight');
  saved=JSON.stringify({movementSpeed:999,rotateSpeed:-1});assert.equal(loadPreferences().rotateSpeed,90);
  saved='broken';assert.equal(loadPreferences().locomotion,'continuous');
 }finally{if(previous===undefined)delete globalThis.localStorage;else globalThis.localStorage=previous}
});
test('reset validates the destination before changing head position or heading',()=>{
 const {nav,camera,rig}=navigationHarness();nav.global.collision=ground({wall:-10});nav.global.collisionStatus='ready';
 nav.spawnEye.set(5,3.8,0);nav.spawnFloor=2;nav.spawnYaw=90;const pos=camera.getPosition().clone(),rotation=rig.getEulerAngles().clone();
 nav.onMenuAction('reset');close(camera.getPosition().distance(pos),0);close(rig.getEulerAngles().distance(rotation),0);assert.equal(nav.actionStatus,'reset-blocked');
 nav.global.collision=ground();nav.onMenuAction('reset');close(camera.getPosition().x,5);assert.equal(nav.actionStatus,null);
});

const { traceTeleport, TeleportTrace } = await loadTs('../src/xr/teleport.ts');
test('arc follows bounded segments and validates first surface and support instead of looking through obstacles',()=>{
 const origin=new Vec3(0,3.8,0),head=origin.clone(),direction=new Vec3(0,0,-1),c=ground();
 const out=new TeleportTrace(),result=traceTeleport(c,origin,direction,head,1.6,true,out);
 assert.equal(result,out);assert.equal(result.valid,true);assert.ok(result.target.z < -2);close(result.target.y,2);
 assert.ok(result.count<=129);for(let i=1;i<result.count;i++)assert.ok(result.points[i].distance(result.points[i-1])<=.200001);
 const groundQuery=c.queryRay.bind(c);c.queryRay=(x,y,z,dx,dy,dz,max)=>{const t=(-1-z)/dz;return t>=0&&t<=max?{x:x+dx*t,y:y+dy*t,z:-1}:groundQuery(x,y,z,dx,dy,dz,max)};
 c.querySurfaceNormal=(x,y,z)=>({nx:0,ny:z===-1?0:1,nz:1});
 const wall=traceTeleport(c,origin,direction,head,1.6,true);assert.equal(wall.valid,false);assert.equal(wall.reason,'surface');close(wall.hit.z,-1);
 const empty=traceTeleport(ground({noFloor:true}),origin,new Vec3(0,1,0),head,1.6,true);assert.equal(empty.reason,'none');assert.ok(empty.count<=129);
 const low=traceTeleport(ground({wall:-1}),origin,direction,head,1.6,true);assert.equal(low.reason,'space');
 const unloaded=ground();unloaded.isReadyAlongSegment=()=>false;const pending=traceTeleport(unloaded,origin,direction,head,1.6,true);assert.equal(pending.reason,'loading');assert.equal(pending.valid,false);
 assert.equal(traceTeleport(c,origin,new Vec3(NaN,0,0),head,1.6,true).valid,false);
});
test('streamed segment readiness rejects holes between loaded endpoints and respects world coordinate flip',()=>{
 const c=Object.create(TiledVoxelCollision.prototype);c.loadOptions={};
 const tile=(id,a,b)=>({id,coreBounds:{min:[a,-5,-1],max:[b,5,1]}});
 c.manifest={tiles:[tile('a',0,1),tile('b',1,1.01),tile('c',1.01,2)]};c._tilesById=new Map(c.manifest.tiles.map(t=>[t.id,t]));c._loaded=new Map([['a',{}],['c',{}]]);c._activeIds=new Set(['a','b','c']);
 assert.equal(c.isReadyAlongSegment(.5,0,1.5,0),false);c._loaded.set('b',{});assert.equal(c.isReadyAlongSegment(.5,0,1.5,0),true);
 assert.equal(c.isReadyAlongSegment(.5,0,2.5,0),false);assert.equal(c.isReadyAlongSegment(.5,0,.5,0),true);
 c.loadOptions.coordinateSpace='metaflow-rz180';assert.equal(c.isReadyAlongSegment(-.5,0,-1.5,0),true);
 c._activeIds.delete('b');assert.equal(c.isReadyAlongSegment(-.5,0,-1.5,0),false);
});
test('preview cache is rate limited and teleport confirmation rechecks a changed destination',()=>{
 const {nav,camera}=navigationHarness();nav.global.collision=ground();nav.global.collisionStatus='ready';nav.app.drawLine=()=>{};
 const source={gamepad:{axes:[0,0,0,0],buttons:[]},getOrigin:()=>new Vec3(0,3.8,0),getDirection:()=>new Vec3(0,0,-1)};
 let rays=0;const c=nav.global.collision,q=c.queryRay.bind(c);c.queryRay=(...args)=>{rays++;return q(...args)};
 nav.drawTeleportPreview(source);const first=rays;assert.ok(first>0);nav.drawTeleportPreview(source);assert.equal(rays,first);
 nav.invalidatePreview();nav.drawTeleportPreview(source);assert.equal(rays,first);assert.equal(nav.previewSource,null);
 nav.nextPreviewAt=0;nav.drawTeleportPreview(source);assert.ok(rays>first);
 c.isReadyAlongSegment=()=>false;const before=camera.getPosition().clone();nav.teleport(source);close(camera.getPosition().distance(before),0);assert.equal(nav.previewSource,null);
});

test('arc bounds range and time, rejects ceilings and incomplete footprints',()=>{
 const origin=new Vec3(0,3.8,0), empty=ground({noFloor:true});
 for(const d of [new Vec3(1,0,0),new Vec3(0,1,0),new Vec3(0,-1,0)]) {
  const trace=traceTeleport(empty,origin,d,origin,1.6,true);
  assert.equal(trace.valid,false);assert.ok(trace.count<=129);
  for(let i=0;i<trace.count;i++) {assert.ok(Math.hypot(trace.points[i].x,trace.points[i].z)<=10);if(i)assert.ok(trace.points[i].distance(trace.points[i-1])<=.200001);}
  if(d.y===1)assert.ok(trace.points[trace.count-1].y>=origin.y+12-19.6-1e-6);
 }
 const ceiling={...ground(),querySurfaceNormal:()=>({nx:0,ny:-1,nz:0}),queryRay(x,y,z,dx,dy,dz,max){const t=(4-y)/dy;return t>=0&&t<=max?{x:x+dx*t,y:4,z:z+dz*t}:null;}};
 const blocked=traceTeleport(ceiling,origin,new Vec3(0,1,-1),origin,1.6,true);assert.equal(blocked.reason,'surface');close(blocked.hit.y,4);
 const narrow=ground(),query=narrow.queryRay.bind(narrow);narrow.queryRay=(x,...args)=>Math.abs(x)>.1?null:query(x,...args);
 assert.equal(traceTeleport(narrow,origin,new Vec3(0,0,-1),origin,1.6,true).valid,false);
});
test('last controller removal opens recovery even while a hand input remains',()=>{
 const {nav}=navigationHarness(), controller=new EventHandler(),hand=new EventHandler();
 controller.gamepad={axes:[0,0,0,0],buttons:[]};nav.addSource(controller);nav.addSource(hand);nav.removeSource(controller);
 assert.equal(nav.menu.open,true);assert.equal(nav.controllerDisconnected,true);assert.equal(nav.blockUntilNeutral,true);
});

const { xrGuidance } = await loadTs('../src/xr/guidance.ts');
const { LoadingRecovery } = await loadTs('../src/loading-recovery.ts');
test('guidance follows available input without claiming unsupported hand gestures',()=>{
 assert.ok(xrGuidance(1,false,false,false,false,false).includes('help-single'));
 assert.ok(!xrGuidance(1,false,false,false,false,false).includes('help-move'));
 assert.ok(xrGuidance(2,false,false,false,false,false).includes('help-move'));
 assert.ok(xrGuidance(1,false,false,true,false,false).includes('comfort-hint'));
 assert.ok(xrGuidance(0,true,false,false,false,false).includes('hand-hint'));
 assert.ok(xrGuidance(0,false,true,false,false,false).includes('help-transient'));
 assert.deepEqual(xrGuidance(0,false,false,false,false,false),['input-wait','tracking-hint']);
});
test('loading recovery distinguishes missing frames, stalled resources and explicit failure',()=>{
 const r=new LoadingRecovery(),s={loaded:false,hidden:false,frame:0,progress:0,stage:'stream-schedule',status:'starting'};
 assert.equal(r.observe(0,s),null);assert.equal(r.observe(19999,s),null);assert.equal(r.observe(20000,s),'waiting-frame');
 s.frame=1;s.progress=1;assert.equal(r.observe(21000,s),null);assert.equal(r.observe(51000,s),'stalled');
 s.stage='error';assert.equal(r.observe(51001,s),'failed');s.loaded=true;assert.equal(r.observe(51002,s),null);
});
test('hidden time does not count as stalled loading after returning to the page',()=>{
 const r=new LoadingRecovery(),s={loaded:false,hidden:false,frame:0,progress:0,stage:'download',status:''};
 r.observe(0,s);s.hidden=true;assert.equal(r.observe(1000,s),null);s.hidden=false;assert.equal(r.observe(100000,s),null);
 assert.equal(r.observe(119999,s),null);assert.equal(r.observe(120000,s),'waiting-frame');
});

test('dwell waits 200ms then fills, pauses at an edge and requires leaving after completion', () => {
 const d=new DwellInput(); d.update(0,'a',true,1000);
 for(let t=100;t<=900;t+=100) assert.equal(d.update(t,'a',true,1000),null);
 assert.equal(d.update(1000,'a',true,1000),'a');
 for(let t=1100;t<=1800;t+=100) assert.equal(d.update(t,'a',true,1000),null);
 d.update(1900,null,false,1000);d.update(2000,null,false,1000);d.update(2100,null,false,1000);
 d.update(2200,'a',true,1000);for(let t=2300;t<=2500;t+=100)d.update(t,'a',true,1000);
 const progress=d.progress;d.update(2550,'a',false,1000);d.update(2600,'a',true,1000);close(d.progress,progress);
 d.update(2700,'a',false,1000);d.update(2901,'a',true,1000);assert.equal(d.progress,0);
});

test('dwell target changes, direct takeover, menu rebuild and missing frames cannot carry progress', () => {
 const d=new DwellInput();d.update(0,'page1:reset',true,1000);for(let t=100;t<=900;t+=100)d.update(t,'page1:reset',true,1000);
 d.update(950,'page2:confirm',true,1000);assert.equal(d.progress,0);
 d.reset(true);d.update(1050,'page2:confirm',true,1000);assert.equal(d.progress,0);
 d.update(1150,null,false,1000);d.update(1350,null,false,1000);d.update(1450,'page2:confirm',true,1000);
 d.update(5000,'page2:confirm',true,1000);assert.equal(d.progress,0);
});

test('ownership rejects the other hand and dwell cannot steal an active trigger',()=>{
 const owner=new InputOwner(),left={},right={};
 assert.equal(owner.claim(right,'dwell'),true);assert.equal(owner.claim(left,'direct'),false);
 assert.equal(owner.claim(right,'direct'),true);assert.equal(owner.claim(right,'dwell'),false);
 owner.release(left);assert.equal(owner.source,right);owner.release(right);
 assert.equal(owner.claim(left,'direct'),true);
});

test('palm entry uses hold and angular hysteresis, loss clears it immediately',()=>{
 const p=new PalmIntent();assert.equal(p.update(0,30),false);assert.equal(p.update(299,30),false);
 assert.equal(p.update(300,35),true);assert.equal(p.update(400,49),true);assert.equal(p.update(500,51),false);
 p.update(600,30);p.update(800,40);assert.equal(p.update(900,30),false);assert.equal(p.update(1200,30),true);
 assert.equal(p.update(1300,null),false);
});

test('observation points stop before surfaces in three dimensions without invented ground',()=>{
 const head=new Vec3(0,1,0);assert.equal(observationTarget(head,null),null);
 assert.equal(observationTarget(head,new Vec3(0,1,.5)),null);assert.equal(observationTarget(head,new Vec3(0,1,11)),null);
 const high=new Vec3(0,7,-8),target=observationTarget(head,high);
 close(high.distance(target),.75);close(head.distance(target),9.25);
 close(stepToTarget(head,target,.75,1).length(),.75*.05);
 close(stepToTarget(head,head,1,.02).length(),0);
});

test('scene query is single-flight, throttles previews, and rejects invalidated readback',async()=>{
 const q=new SceneTargetQuery();let resolve, calls=0;
 const first=q.query(0,false,()=>{calls++;return new Promise(r=>resolve=r)});
 assert.equal(q.busy,true);assert.equal(await q.query(1,false,async()=>{calls++;return new Vec3()}),null);
 q.invalidate();resolve(new Vec3(1,0,0));assert.equal(await first,null);assert.equal(calls,1);
 assert.equal(await q.query(50,false,async()=>{calls++;return new Vec3()}),null);
 assert.ok(await q.query(100,true,async()=>{calls++;return new Vec3()}));assert.equal(calls,2);
});

test('continuous scene selection released before readback never starts movement; menu cancels teleport',async()=>{
 const {nav,camera}=navigationHarness();let resolve;
 const source={getOrigin:()=>new Vec3(0,1,0),getDirection:()=>new Vec3(0,0,-1)};
 nav.scenePicker={pick:()=>new Promise(r=>resolve=r)};nav.validSources.add(source);
 nav.gestures.set(source,'scene');const before=camera.getPosition().clone();
 const pending=nav.queryScene(source,true,false);nav.gestures.delete(source);resolve(new Vec3(0,1,-4));await pending;
 assert.equal(nav.sceneTarget,null);close(camera.getPosition().distance(before),0);
 const teleport=nav.queryScene(source,true,true);nav.menu.open=true;nav.cancelScene();resolve(new Vec3(0,1,-4));await teleport;
 close(camera.getPosition().distance(before),0);
 nav.global.collisionStatus='loading';let calls=0;nav.scenePicker.pick=async()=>{calls++;return new Vec3()};
 await nav.queryScene(source,true,true);assert.equal(calls,0);
});

test('real tracked height follows sitting and crouching without enabling legacy seated compensation',()=>{
 const {nav,camera,rig}=navigationHarness();nav.preferences.posture='seated';nav.preferences.seatedBoost=false;
 nav.entryEye.set(0,2,0);nav.placeInitial();close(nav.heightOffset,0);
 const rigBefore=rig.getPosition().clone();camera.setLocalPosition(0,.8,0);close(nav.effectiveHeight(),.8);
 camera.setLocalPosition(0,1.8,0);close(nav.effectiveHeight(),1.8);close(rig.getPosition().distance(rigBefore),0);
 nav.onReferenceReset();assert.equal(nav.sceneTarget,null);assert.equal(nav.menu.open,true);assert.equal(nav.actionStatus,'calibration-needed');
});

test('queued scene confirmations stay single-flight and perform a fresh query after preview',async()=>{
 const q=new SceneTargetQuery();let release;const calls=[];
 const a=q.query(0,false,()=>{calls.push('preview');return new Promise(r=>release=r)});
 const b=q.query(10,true,async()=>{calls.push('first');await Promise.resolve();return new Vec3(1,0,0)});
 const c=q.query(20,true,async()=>{calls.push('second');return new Vec3(2,0,0)});
 assert.deepEqual(calls,['preview']);release(new Vec3());await a;assert.equal((await b).x,1);assert.equal((await c).x,2);
 assert.deepEqual(calls,['preview','first','second']);assert.equal(q.busy,false);
});

test('normal transient pinch removal preserves committed scene teleport but controller disconnect cancels it',async()=>{
 for(const transient of [true,false]) {
  const {nav,camera}=navigationHarness();let resolve;
  const source=new EventHandler();source.inputSource={targetRayMode:transient?'transient-pointer':'tracked-pointer'};
  source.getOrigin=()=>camera.getPosition().clone();source.getDirection=()=>new Vec3(0,0,-1);
  nav.addSource(source);nav.validSources.add(source);nav.scenePicker={pick:()=>new Promise(r=>resolve=r)};
  const before=camera.getPosition().clone(),pending=nav.queryScene(source,true,true);
  nav.removeSource(source);resolve(before.clone().add(new Vec3(0,0,-4)));await pending;
  close(camera.getPosition().distance(before),transient?3.25:0);
  assert.equal(nav.diagnostics.inputLosses,transient?0:1);
 }
});

test('two hands respect dominant selection and one hand degrades without changing the preference',()=>{
 const {nav}=navigationHarness();nav.preferences.mainHand='right';
 const left={hand:{},handedness:'left'},right={hand:{},handedness:'right'};
 nav.validSources.add(left);nav.validSources.add(right);
 assert.equal(nav.selectable(left),false);assert.equal(nav.selectable(right),true);
 nav.validSources.delete(right);assert.equal(nav.selectable(left),true);assert.equal(nav.preferences.mainHand,'right');
 nav.preferences.mainHand='left';nav.validSources.add(right);assert.equal(nav.selectable(right),false);
 assert.equal(nav.selectable({inputSource:{targetRayMode:'transient-pointer'}}),true);
});


test('temporary hand tracking loss preserves capability tracking and counts one loss',()=>{
 const {nav}=navigationHarness();const source=new EventHandler();
 source.inputSource={targetRaySpace:{},hand:new Map(['wrist','index-finger-metacarpal','pinky-finger-metacarpal'].map(id=>[id,{}]))};
 source.hand={tracking:true};nav.addSource(source);nav.validSources.add(source);
 const frame={getViewerPose:()=>({}),getPose:()=>null,getJointPose:()=>({})};
 nav.onFrame(frame);nav.onFrame(frame);
 assert.equal(nav.diagnostics.inputLosses,1);assert.equal(nav.capabilities.has(source),true);
 frame.getPose=()=>({});nav.onFrame(frame);
 assert.equal(nav.validSources.has(source),true);assert.equal(nav.capabilities.get(source).joints,true);
});
