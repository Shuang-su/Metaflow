import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
async function load(file, require = () => { throw Error('unexpected import'); }) {
    const source = await readFile(new URL(file, import.meta.url), 'utf8');
    const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } });
    const module = { exports: {} }; new Function('require', 'exports', 'module', outputText)(require, module.exports, module); return module.exports;
}
const bg = await load('../src/background.ts');
const { registerBackground } = await load('../../editor-shared/background-state.ts', () => bg);
const redBlue = { color: [.2, .4, .6], gradient: { ...bg.defaultGradient([1, 0, 0]), angle: 90, stops: [{ position: 0, color: [1, 0, 0], opacity: 1 }, { position: 1, color: [0, 0, 1], opacity: 1 }] } };
const near = (actual, expected) => actual.forEach((v, i) => assert.ok(Math.abs(v - expected[i]) < 1e-7, `${actual} != ${expected}`));
test('linear direction uses the actual portrait/landscape frame', () => {
    near(bg.sampleBackground(redBlue, 0, .5, 1920, 1080), [1, 0, 0]);
    near(bg.sampleBackground(redBlue, 1, .5, 1080, 1920), [0, 0, 1]);
    const diagonal = { ...redBlue, gradient: { ...redBlue.gradient, angle: 135 } };
    near(bg.sampleBackground(diagonal, 0, 0, 2, 1), [1, 0, 0]);
    near(bg.sampleBackground(diagonal, 1, 0, 2, 1), [1/3, 0, 2/3]);
});
test('radial geometry and stop alpha flatten against the base in sRGB', () => {
    const radial = { ...redBlue, gradient: { ...redBlue.gradient, type: 'radial', center: [.25, .75], radius: [.25, .5] } };
    near(bg.sampleBackground(radial, .25, .75), [1, 0, 0]); near(bg.sampleBackground(radial, .5, .75), [0, 0, 1]);
    const alpha = structuredClone(redBlue); alpha.gradient.stops[0].opacity = 0;
    near(bg.sampleBackground(alpha, 0, 0), alpha.color); near(bg.sampleBackground(alpha, .5, .5), [.1, .2, .8]);
});
test('legacy three colours stay readable and new settings contain legacy approximation', () => {
    const legacy = { color: [0, 0, 0], gradient: { topColor: [1, 0, 0], horizonColor: [0, 1, 0], bottomColor: [0, 0, 1], horizonStop: .6 } };
    const original = JSON.stringify(legacy); near(bg.sampleBackground(legacy, .5, .6), [0, 1, 0]); assert.equal(JSON.stringify(legacy), original);
    const result = bg.exportBackground(redBlue); near(result.gradient.topColor, [.5, 0, .5]); assert.equal(result.gradient.stops.length, 2);
});
test('a drag is one history entry; cancellation, undo and redo restore exact project state', () => {
    const handlers = new Map(), funcs = new Map(), history = [];
    const events = { on: (key, fn) => handlers.set(key, [...handlers.get(key) ?? [], fn]), function: (key, fn) => funcs.set(key, fn), invoke: key => funcs.get(key)(), fire: (key, ...args) => { if (key === 'edit.add') history.push(args[0]); for (const fn of handlers.get(key) ?? []) fn(...args); } };
    registerBackground(events, { color: [0, 0, 0] }, () => {}, () => {});
    events.fire('background.begin');
    for (let i = 0; i < 20; i++) events.fire('background.preview', { ...redBlue, rememberedGradient: redBlue.gradient });
    events.fire('background.commit'); assert.equal(history.length, 1);
    const after = events.invoke('background.value'); history[0].undo(); assert.deepEqual(events.invoke('background.value'), { color: [0, 0, 0] }); history[0].do(); assert.deepEqual(events.invoke('background.value'), after);
    events.fire('background.preview', { color: [1, 1, 1] }); events.fire('background.cancel'); assert.deepEqual(events.invoke('background.value'), after); assert.equal(history.length, 1);
});

test('new gradient validation rejects malformed geometry without changing settings version', async () => {
    const utils = await load('../src/schemas/validate-utils.ts');
    const { validateV2 } = await load('../src/schemas/v2.ts', () => utils);
    const settings = JSON.parse((await readFile(new URL('./fixtures/dayun-settings.json', import.meta.url), 'utf8')).replace(/^\s*\/\/.*$/gm, '').replace(/,\s*([}\]])/g, '$1'));
    // Fixture may be v1; use the published importer to obtain the ordinary v2 fields.
    const { importSettings } = await import('../dist/settings.js');
    const value = importSettings(settings); value.background = bg.exportBackground(redBlue);
    assert.equal(validateV2(value).version, 2);
    value.background.gradient.stops[0].position = NaN; assert.throws(() => validateV2(value), /finite/);
    value.background.gradient.stops[0].position = 0; value.background.gradient.radius = [0,.5]; assert.throws(() => validateV2(value), /radius/);
});

test('legacy RGBA background tuples never overflow the RGB gradient texture or change their wire data', async () => {
    class Texture {
        constructor() { this.data = new Uint8Array(1024 * 4); }
        lock() { return this.data; }
        unlock() {}
    }
    const { BackgroundRenderer } = await load('../src/background-renderer.ts', name => name === 'playcanvas' ? { Texture } : bg);
    const renderer = new BackgroundRenderer({});
    const background = { color: [.2,.4,.6,.5] }, original = JSON.stringify(background);
    renderer.setBackground(background);
    assert.deepEqual([...renderer.ramp.data.slice(-4)], [51,102,153,255]);
    assert.equal(JSON.stringify(background),original);
    near(bg.sampleRamp(bg.normalizeGradient(redBlue.gradient), background.color, 0),[1,0,0]);
    assert.equal(bg.cssColor(background.color),'rgb(51 102 153)');
});

const picker = await load('../../editor-shared/background-picker-math.ts', () => bg);
test('picker HSV preserves hue through grey and hue/saturation through black', () => {
    const previous = [.57, .8, 1];
    near(picker.rgbToHsv([0, 0, 0], previous), [.57, .8, 0]);
    near(picker.rgbToHsv([.5, .5, .5], previous), [.57, 0, .5]);
    for (const rgb of [[1,0,0], [0,1,0], [0,0,1], [.1,.4,.8]]) near(picker.hsvToRgb(picker.rgbToHsv(rgb)), rgb);
    near(picker.rgbToHsv([1,0,0], [1,1,1]), [1,1,1]);
});
test('scrubbing uses four incremental speed bands and reverses immediately at a bound', () => {
    assert.deepEqual([-32, 0, 32, 64].map(picker.scrubSpeed), [2,1,.5,.25]);
    let value = 180;
    for (const dy of [-32, 0, 32, 64]) value = picker.scrubValue(value, 10, dy, -360, 360);
    assert.equal(value, 217.5);
    assert.equal(picker.scrubValue(value, 0, -200, -360, 360), value);
    value = picker.scrubValue(99, 100, 0, 0, 100);
    assert.equal(picker.scrubValue(value, -1, 0, 0, 100), 99);
});
