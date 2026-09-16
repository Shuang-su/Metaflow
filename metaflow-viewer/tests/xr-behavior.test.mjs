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
    nav.menu={open:true,begin:()=>true,select:()=>selections++,release:()=>{},cancel:()=>{}};
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
    nav.menu={open:false,show(){this.open=true;},close(){this.open=false;},hide(){this.open=false;},cancel(){},release(){},isPointedAt(){return false},update(){}};
    nav.updateMarker=()=>{};
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
    nav.onMenuAction('posture');close(camera.getPosition().y,3.65+FOOT_CLEARANCE);close(camera.getLocalPosition().distance(tracked),0);
    nav.onMenuAction('posture');close(camera.getPosition().y,3.6+FOOT_CLEARANCE);
});

test('spatial panel selection matches the displayed row under rotation and consumes misses', () => {
    const menu=Object.create(XrSpatialMenu.prototype),entity=new Entity();
    entity.setPosition(4,2,-3);entity.setEulerAngles(15,90,0);entity.setLocalScale(.68,.86,1);
    let selected='';Object.assign(menu,{entity,canvas:{height:1024},inverse:new Mat4(),rayOrigin:new Vec3(),rayDirection:new Vec3(),pressed:new Map(),open:true,rows:[{action:'resume'},{action:'reset'}],action:(action)=>selected=action});
    const transform=entity.getWorldTransform();const origin=transform.transformPoint(new Vec3(0,0,1));
    const row=transform.transformPoint(new Vec3(0,.5-(242+84+35)/1024,0));
    const source={getOrigin:()=>origin,getDirection:()=>row.clone().sub(origin).normalize()};
    assert.equal(menu.begin(source),true);menu.select(source);assert.equal(selected,'reset');
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
    nav.onMenuAction('posture');close(camera.getPosition().y,2+1.65+FOOT_CLEARANCE);
    close(camera.getLocalPosition().distance(local),0);
});

test('walking averages supported ground across a small hole while teleport still refuses it', () => {
    const c=ground();c.queryRay=(x,oy,z)=>Math.abs(x)<.06&&Math.abs(z)<.06?null:{x,y:x>0?2.08:2,z};
    const moved=moveOnGround(c,new Vec3(0,3.8,0),2,1.6,.03,0);
    close(moved.x,.03);close(moved.y,(2+2.08*3)/4);
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
    const start=camera.getPosition().clone();nav.onMenuAction('posture');
    assert.equal(nav.preferences.posture,'standing');assert.equal(nav.actionStatus,'posture-blocked');
    close(camera.getPosition().distance(start),0);close(nav.heightOffset,0);
    ceiling=4;nav.onMenuAction('posture');assert.equal(nav.preferences.posture,'seated');close(camera.getPosition().y,3.85);
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
    assert.equal(lines.length,25);close(lines[0].b.y,2);assert.equal(lines[0].color,nav.validColor);
    close(camera.getPosition().distance(before),0);
    nav.global.collision=ground({noFloor:true});lines.length=0;nav.drawTeleportPreview(source);
    assert.equal(lines.length,1);assert.equal(lines[0].color,nav.invalidColor);
    close(camera.getPosition().distance(before),0);
});

test('menu pointer stops at rotated panel with a world-sized reticle, including non-button margins', () => {
    const menu=Object.create(XrSpatialMenu.prototype),entity=new Entity();
    entity.setPosition(4,2,-3);entity.setEulerAngles(15,90,0);entity.setLocalScale(.68,.86,1);
    const lines=[];const origin=entity.getWorldTransform().transformPoint(new Vec3(.2,0,2.3));
    const target=entity.getWorldTransform().transformPoint(new Vec3(.1,.46,0));
    const source={getOrigin:()=>origin,getDirection:()=>target.clone().sub(origin).normalize()};
    Object.assign(menu,{entity,width:.68,height:.86,canvas:{height:1024},inverse:new Mat4(),rayOrigin:new Vec3(),rayDirection:new Vec3(),pressed:new Map(),open:true,rows:[{action:'resume'}],material:{emissive:{}},draw(){},global:{state:{},app:{scene:{layers:{getLayerById:()=>({})}},drawLine:(a,b)=>lines.push([a.clone(),b.clone()])}}});
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
    Object.assign(menu,{entity,canvas:{height:1024},inverse:new Mat4(),rayOrigin:new Vec3(),rayDirection:new Vec3(),pressed:new Map(),open:false,rows:[],material:{emissive:{}},draw(){},place(){placements++},global:{camera,state:{},app:{scene:{layers:{getLayerById:()=>({})}},drawLine(){}}}});
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
    assert.equal(lines.length,3);close(lines[0].b.y,2);
    for(const line of lines)assert.equal(line.color,nav.invalidColor);
    close(lines[1].a.clone().add(lines[1].b).mulScalar(.5).distance(lines[0].b),0);
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
