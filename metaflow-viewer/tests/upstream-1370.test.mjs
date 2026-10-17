import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import * as pc from 'playcanvas';
import ts from 'typescript';

async function loadSource(name, require) {
    const source = await readFile(new URL(`../src/${name}.ts`, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: {
        module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022
    } });
    const module = { exports: {} };
    new Function('require', 'exports', 'module', outputText)(require, module.exports, module);
    return module.exports;
}

const { createSwitchingPicker } = await loadSource('switching-picker', () => { throw Error('type-only import leaked'); });
const picker = (name) => ({
    releases: 0,
    pick: async () => name,
    pickSurface: async () => ({ name }),
    pickVisibility: async (points) => points.map(() => name === 'sorted' ? 0 : 1),
    renderView: () => ({ texture: name, renders: 1 }),
    release() { this.releases++; }
});

test('picking follows sorted capture/XR and stochastic preview without changing consumers', async () => {
    let stochastic = true;
    const a = picker('sorted'), b = picker('stochastic');
    const p = createSwitchingPicker(a, b, () => stochastic);
    assert.equal(await p.pick(0, 0), 'stochastic');
    const previous = p.renderView();
    stochastic = false; p.invalidate();
    assert.equal(await p.pick(0, 0), 'sorted');
    assert.deepEqual(await p.pickVisibility([{}], 1), [0]);
    assert.notEqual(p.renderView().renders, previous.renders);
    stochastic = true; p.invalidate();
    assert.equal((await p.pickSurface(0, 0)).name, 'stochastic');
    p.release(); p.release();
    assert.equal(a.releases, 1); assert.equal(b.releases, 1);
    assert.equal(await p.pick(0, 0), null); assert.equal(p.renderView(), null);
});

test('a pending pick from an old renderer cannot update the new view', async () => {
    const a = picker('sorted'), b = picker('stochastic');
    let finish;
    b.pick = () => new Promise(resolve => { finish = resolve; });
    const p = createSwitchingPicker(a, b, () => true);
    const pending = p.pick(0, 0); p.invalidate(); finish('obsolete depth');
    assert.equal(await pending, null);
    p.release();
});

class Script extends pc.EventHandler {
    constructor({ app, entity }) { super(); this.app = app; this.entity = entity; }
}
class XrControllers extends Script {}
class XrManipulation extends Script {
    initialize() {
        this.initial = [this.target.getLocalPosition().clone(), this.target.getLocalRotation().clone(), this.target.getLocalScale().clone()];
    }
    reset() {
        this.target.setLocalPosition(this.initial[0]);
        this.target.setLocalRotation(this.initial[1]);
        this.target.setLocalScale(this.initial[2]);
        this.app.fire('xr:manipulation:active', false);
    }
}
const engine = { ...pc, Script, XrManager: { isDeviceSupported: async () => true } };
const { XrVrNavigation } = await loadSource('xr-navigation', name => {
    assert.equal(name, 'playcanvas'); return engine;
});
const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator');
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { userAgent: 'OculusBrowser' } });
const { initXr } = await loadSource('xr', name => {
    if (name === 'playcanvas') return engine;
    if (name.endsWith('/xr-controllers.mjs')) return { XrControllers };
    if (name.endsWith('/xr-manipulation.mjs')) return { XrManipulation };
    if (name === './xr-navigation') return { XrVrNavigation };
    throw Error(name);
});
if (navigatorDescriptor) Object.defineProperty(globalThis, 'navigator', navigatorDescriptor);
else delete globalThis.navigator;

const raf = new Map(); let rafId = 0;
globalThis.requestAnimationFrame = fn => { raf.set(++rafId, fn); return rafId; };
globalThis.cancelAnimationFrame = id => raf.delete(id);
const tuple = v => [v.x, v.y, v.z];
function fixture() {
    const app = Object.assign(new pc.EventHandler(), { autoRender: false, renderNextFrame: false,
        graphicsDevice: { canvas: {} }, drawLine() {} });
    const xr = Object.assign(new pc.EventHandler(), { active: false, type: null, session: null,
        input: Object.assign(new pc.EventHandler(), { inputSources: [] }),
        domOverlay: { supported: true }, isAvailable: () => true, supportedFrameRates: [72, 90],
        updateTargetFrameRate(value) { this.targetRate = value; } });
    app.xr = xr;
    const parent = new pc.GraphNode('rig'), camera = new pc.GraphNode('camera'), sceneRoot = new pc.GraphNode('scene');
    parent.addChild(camera); camera.camera = { entity: camera, nearClip: 0.25, farClip: 731 };
    parent.findComponent = () => camera.camera;
    camera.setLocalPosition(12, 4, -9);
    const scripts = new Map();
    parent.addComponent = () => {};
    parent.script = {
        create(Type, options = {}) {
            const instance = new Type({ app, entity: parent });
            Object.assign(instance, options.properties); scripts.set(Type, instance); instance.initialize?.(); return instance;
        },
        destroy(Type) { scripts.get(Type)?.fire('destroy'); scripts.delete(Type); }
    };
    const state = { xrMode: null, performanceMode: true }, events = new pc.EventHandler();
    const global = { app, state, events, camera, sceneRoot, renderer: 'webgl', root: { prepend() {} }, analytics: { track() {} } };
    xr.start = (_camera, type, _space, options) => {
        xr.options = options;
        if (xr.fail) { options.callback(new Error('denied')); return; }
        xr.type = type; xr.active = true;
        xr.session = { end: async () => { xr.active = false; xr.session = null; xr.fire('end'); } };
        xr.fire('start'); options.callback(null);
    };
    const handle = initXr(global); handle.setManipulationTarget(sceneRoot);
    return { app, xr, parent, camera, sceneRoot, state, scripts, handle };
}

test('XR heading spans the full circle and restores clipping, camera and rendering after every session', async () => {
    for (const yaw of [-179, -135, -90, -45, 0, 45, 90, 135, 179]) {
        const f = fixture(); f.camera.setEulerAngles(0, yaw, 0);
        const forward = f.camera.forward.clone(), position = tuple(f.camera.getPosition());
        await f.handle.start('vr');
        assert.ok(f.parent.forward.dot(forward) > 0.99999, `yaw ${yaw}`);
        assert.equal(f.camera.camera.nearClip, 0.01); assert.equal(f.xr.targetRate, 72);
        assert.equal(f.xr.options.framebufferScaleFactor, 0.8);
        await f.handle.end();
        assert.deepEqual(tuple(f.camera.getPosition()), position);
        assert.equal(f.camera.camera.nearClip, 0.25); assert.equal(f.camera.camera.farClip, 731);
        assert.equal(f.app.autoRender, false); assert.equal(f.state.xrMode, null);
        f.handle.destroy();
        assert.equal(f.xr.input.hasEvent('add'), false); assert.equal(f.app.hasEvent('xr:manipulation:active'), false);
    }
    assert.equal(raf.size, 0);
});

test('XR manipulates one content root, admits a late environment and restores the pre-session transform', async () => {
    const f = fixture(), subject = new pc.GraphNode('subject'), environment = new pc.GraphNode('environment');
    subject.setLocalPosition(1, 2, 3); f.sceneRoot.addChild(subject);
    f.sceneRoot.setLocalPosition(5, 0, 2);
    await f.handle.start('ar');
    const manipulation = f.scripts.get(XrManipulation);
    assert.equal(manipulation.target, f.sceneRoot); assert.equal(manipulation.scalePivot, 'hands');
    f.sceneRoot.setLocalScale(2, 2, 2); f.sceneRoot.setLocalPosition(8, 4, -1);
    environment.setLocalPosition(1, 2, 3); f.sceneRoot.addChild(environment);
    assert.deepEqual(tuple(subject.getPosition()), tuple(environment.getPosition()));
    await f.handle.end();
    assert.deepEqual(tuple(f.sceneRoot.getLocalPosition()), [5, 0, 2]);
    assert.deepEqual(tuple(f.sceneRoot.getLocalScale()), [1, 1, 1]);
    assert.deepEqual(tuple(subject.getPosition()), [6, 2, 5]);
    assert.deepEqual(tuple(environment.getPosition()), [6, 2, 5]);
    f.handle.destroy();
});

test('two-hand grab pauses locomotion; permission failure restores state and allows a later session', async () => {
    const f = fixture(); f.xr.fail = true;
    await assert.rejects(f.handle.start('vr'), /denied/);
    assert.equal(f.camera.camera.nearClip, 0.25); assert.equal(f.camera.camera.farClip, 731);
    assert.equal(f.state.xrMode, null);
    f.xr.fail = false; await f.handle.start('vr');
    const input = Object.assign(new pc.EventHandler(), { handedness: 'left', gamepad: { axes: [0, 0, 0, 1] },
        getOrigin: () => new pc.Vec3(0, 1, 0), getDirection: () => new pc.Vec3(0, -1, 0) });
    f.xr.input.fire('add', input);
    const nav = f.scripts.get(XrVrNavigation), before = tuple(f.parent.getPosition());
    f.app.fire('xr:manipulation:active', true); nav.update(1);
    assert.deepEqual(tuple(f.parent.getPosition()), before);
    f.app.fire('xr:manipulation:active', false); nav.update(1);
    assert.notDeepEqual(tuple(f.parent.getPosition()), before);
    await f.handle.end(); f.handle.destroy();
    assert.equal(input.hasEvent('selectstart'), false); assert.equal(input.hasEvent('selectend'), false);
});

test('engine two-grip solver transforms subject, environment and late children together', async () => {
    // Execute the actual 2.23.0 solver with event/pose fixtures, not a substitute manipulation algorithm.
    const source = await readFile(new URL('../node_modules/playcanvas/scripts/esm/xr/xr-manipulation.mjs', import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { allowJs: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const module = { exports: {} };
    new Function('require', 'exports', 'module', outputText)(() => ({ ...pc, Script }), module.exports, module);
    const rig = new pc.GraphNode('rig'), camera = new pc.GraphNode('camera'); rig.addChild(camera);
    const app = Object.assign(new pc.EventHandler(), { xr: { active: true, camera, input: new pc.EventHandler() } });
    const root = new pc.GraphNode('content'), subject = new pc.GraphNode('subject'), environment = new pc.GraphNode('environment');
    root.addChild(subject); root.addChild(environment); subject.setLocalPosition(2, 0, 0); environment.setLocalPosition(2, 0, 0);
    const solver = new module.exports.XrManipulation({ app, entity: rig }); solver.target = root; solver.scaleThreshold = 0; solver.initialize();
    const leftPosition = new pc.Vec3(-0.5, 1, 0), rightPosition = new pc.Vec3(0.5, 1, 0);
    const left = { grip: true, squeezing: true, handedness: 'left', getLocalPosition: () => leftPosition };
    const right = { grip: true, squeezing: true, handedness: 'right', getLocalPosition: () => rightPosition };
    app.xr.input.fire('add', left); app.xr.input.fire('add', right);
    const active = []; app.on('xr:manipulation:active', v => active.push(v));
    solver.update(); leftPosition.set(1, 1, -1); rightPosition.set(1, 1, 1); solver.update();
    assert.ok(root.getLocalScale().x > 1.9); assert.notDeepEqual(tuple(subject.getPosition()), [2, 0, 0]);
    assert.deepEqual(tuple(subject.getPosition()), tuple(environment.getPosition()));
    const late = new pc.GraphNode('late environment'); late.setLocalPosition(2, 0, 0); root.addChild(late);
    assert.deepEqual(tuple(late.getPosition()), tuple(subject.getPosition()));
    assert.deepEqual(tuple(rig.getPosition()), [0, 0, 0]);
    right.squeezing = false; solver.update(); assert.deepEqual(active, [true, false]);
    solver.reset(); assert.deepEqual(tuple(root.getLocalScale()), [1, 1, 1]); assert.deepEqual(tuple(subject.getPosition()), [2, 0, 0]);
    solver.fire('destroy'); assert.equal(solver._inputSources.size, 0);
});
