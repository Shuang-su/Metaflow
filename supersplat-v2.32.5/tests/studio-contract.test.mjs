import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';
import { Mat4 } from 'playcanvas';

// Compile the authoritative TS and its pure schema dependencies, preserving a
// single engine identity. No browser application / renderer is mocked here.
const modules = new Map();
async function loadSource(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    let source = ts.transpileModule(await readFile(url, 'utf8'), { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText;
    for (const match of [...source.matchAll(/from ['"]([^'"]+)['"]/g)]) {
        const specifier = match[1];
        const dependency = specifier.startsWith('.') ? await loadSource(new URL(`${specifier}.ts`, url)) : import.meta.resolve(specifier);
        source = source.replaceAll(`from '${specifier}'`, `from '${dependency}'`).replaceAll(`from "${specifier}"`, `from '${dependency}'`);
    }
    const dataUrl = `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
    modules.set(url.href, dataUrl); return dataUrl;
}
const { createProject, readExperience, readProject, portableProject, portableExperience, compatibilityWarnings } = await import(await loadSource(new URL('../src/studio/document.ts', import.meta.url)));
const { projectAnnotations, wrapText, moveAlongView, placeAnnotationCard } = await import(await loadSource(new URL('../src/studio/overlay.ts', import.meta.url)));
const { validateCollision } = await import(await loadSource(new URL('../src/studio/files.ts', import.meta.url)));

test('settings retain unknown nested fields and reject malformed contracts before replacement', () => {
    const raw = createProject().experience;
    raw.vendorExtension = { future: [1, 2], nested: { value: 'unchanged' } };
    raw.postEffectSettings.bloom.futureThreshold = 0.72;
    raw.postEffectSettings.futureEffect = { enabled: true, vendor: 'retained' };
    raw.annotations.push({ position: [0, 0, 0], title: '<img src=x onerror=alert(1)>', text: '中文\n<b>原文</b>', extras: { test: 2 }, camera: { initial: { position: [0, 0, 1], target: [0, 0, 0], fov: 75 } } });
    const result = readExperience(JSON.parse(JSON.stringify(raw)));
    assert.deepEqual(result, raw);
    assert.ok(compatibilityWarnings(result).some(w => w.includes('vendorExtension')));
    assert.ok(compatibilityWarnings(result).some(w => w.includes('postEffectSettings.bloom.futureThreshold')));
    assert.throws(() => readExperience({ ...raw, version: 999 }));
    assert.throws(() => readExperience({ ...raw, cameras: [{ initial: { position: [NaN, 0, 0], target: [0, 0, 0], fov: 75 } }] }));
    assert.throws(() => readExperience({ ...raw, annotations: [{ ...raw.annotations[0], position: [0, 1] }] }));
});

test('project config roundtrip preserves refs, LOD, video preferences and rejects temporary URLs', () => {
    const p = createProject();
    p.assets.push({ name: 'lod-meta.json', role: 'model', lod: 2, size: 360, modified: 55 });
    p.video = { overlay: 'selected', selected: 0, width: 1080, height: 1920, frameRate: 60, reveal: 'viewer', revealDotProfile: 'characterSog' };
    assert.deepEqual(readProject(JSON.parse(JSON.stringify(portableProject(p)))), p);
    p.experience.background.skyboxUrl = 'blob:ephemeral';
    assert.throws(() => portableProject(p), /临时/);
    assert.throws(() => readProject({ ...p, version: 999 }));
    assert.throws(() => readProject({ ...p, timeline: { ...p.timeline, frameRate: 0 } }));
});

test('CJK text layout preserves paragraphs and clips annotations behind/outside camera', () => {
    const text = '中文说明第一行\n第二行 very long title';
    const lines = wrapText(text, s => Array.from(s).length * 10, 60);
    assert.ok(lines.every(line => Array.from(line).length <= 6));
    assert.equal(lines.join(''), text.replace('\n', ''));
    const points = [[0, 0, 0], [2, 0, 0], [0, -2, 0], [0, 0, 2]].map(position => ({ position, title: '点', text: '' }));
    assert.deepEqual(projectAnnotations(points, new Mat4(), 1920, 1080).map(p => [p.index, p.x, p.y]), [[0, 960, 540], [3, 960, 540]]);
    // Viewer clamps depth instead of hiding near/far-clipped hotspots. Behind-camera w still hides.
    const behind = new Mat4(); behind.data[15] = -1;
    assert.deepEqual(projectAnnotations(points, behind, 1920, 1080), []);
    assert.deepEqual(placeAnnotationCard(950, 300, 256, 80, 1000, 600), {left:669,top:260,flipped:true});
    assert.deepEqual(moveAlongView([0, 0, 0], [0, 0, 5], 0.1), [0, 0, -0.1]);
});

test('collision pairing rejects mismatches, truncation and invalid coordinate bounds', async () => {
    const metadata = { version: '1.1', leafSize: 4, nodeWordCount: 1, leafDataCount: 0, voxelResolution: 0.1, treeDepth: 1,
        gridBounds: { min: [-1, -1, -1], max: [1, 1, 1] }, gaussianBounds: { min: [-1, -1, -1], max: [1, 1, 1] } };
    const json = value => new File([JSON.stringify(value)], 'test.voxel.json');
    const binary = new File([new Uint32Array([0xff000000])], 'test.voxel.bin');
    assert.deepEqual(await validateCollision(json(metadata), binary), metadata);
    const { gaussianBounds, ...rest } = metadata;
    const modern = { ...rest, sceneBounds: gaussianBounds };
    assert.deepEqual(await validateCollision(json(modern), binary), modern);
    assert.equal('gaussianBounds' in modern, false);
    await assert.rejects(validateCollision(json(rest), binary), /范围缺失/);
    await assert.rejects(validateCollision(json({ ...modern, sceneBounds: { min: [0, 0, 0], max: [1, NaN, 1] } }), binary), /坐标/);
    await assert.rejects(validateCollision(json(metadata), new File(['x'], 'wrong.bin')), /同名/);
    await assert.rejects(validateCollision(json(metadata), new File(['x'], 'test.voxel.bin')), /长度/);
    await assert.rejects(validateCollision(json({ ...metadata, gridBounds: { min: [1, 1, 1], max: [0, 0, 0] } }), binary), /坐标/);
});

const { Events } = await import(await loadSource(new URL('../src/events.ts', import.meta.url)));
const { registerTimelineEvents } = await import(await loadSource(new URL('../src/timeline.ts', import.meta.url)));
test('Studio once and pingpong clocks respect endpoints, pause phase and seek', () => {
    const e = new Events(); registerTimelineEvents(e, true);
    e.invoke('docDeserialize.timeline', {frames:31,frameRate:30,loopMode:'pingpong'});
    e.fire('timeline.setPlaying',true);
    e.fire('update',1); assert.equal(e.invoke('timeline.frame'),30);
    e.fire('update',.2); assert.equal(e.invoke('timeline.frame'),24);
    e.fire('timeline.setPlaying',false);e.fire('update',10);assert.equal(e.invoke('timeline.frame'),24);
    e.fire('timeline.setPlaying',true);e.fire('update',.2);assert.equal(e.invoke('timeline.frame'),18);
    e.fire('timeline.setFrame',0);assert.equal(e.invoke('timeline.playing'),false);
    e.fire('timeline.prevFrame');assert.equal(e.invoke('timeline.frame'),0);
    e.fire('timeline.setLoopMode','none');e.fire('timeline.setPlaying',true);e.fire('update',2);
    assert.equal(e.invoke('timeline.frame'),30);assert.equal(e.invoke('timeline.playing'),false);
    e.fire('timeline.setPlaying',true);e.fire('update',.1);assert.equal(e.invoke('timeline.frame'),3);
    e.fire('timeline.setPlaying',false);
});


test('portable settings reject project/index JSON and temporary assets without mutating source', () => {
    assert.throws(() => readExperience(createProject()), /打开工程/);
    assert.throws(() => readExperience({ means: { files: ['means.webp'] } }), /模型索引/);
    const raw = createProject().experience;
    raw.annotations = Array.from({ length: 100 }, (_, i) => ({ position: [0, 0, 0], title: `点 ${i}`, text: '中文\n说明', camera: { initial: { position: [0, 0, 5], target: [0, 0, 0], fov: 60 } }, extras: { id: i } }));
    raw.extension = { retained: true };
    const before = structuredClone(raw);
    assert.deepEqual(portableExperience(raw), before);
    assert.deepEqual(raw, before);
    assert.ok(compatibilityWarnings(raw).some(w => w.includes('25')));
    for (const url of ['blob:temporary', 'file:///Users/model.hdr']) {
        raw.background.skyboxUrl = url;
        assert.throws(() => portableExperience(raw), /资产地址/);
        assert.equal(raw.background.skyboxUrl, url);
    }
});

test('drafts survive a fresh page and storage failure does not erase prior work', async () => {
    const { saveDraft, readDrafts } = await import(await loadSource(new URL('../src/studio/drafts.ts', import.meta.url)));
    const data = new Map();
    const storage = { get length() { return data.size; }, key: i => [...data.keys()][i], getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v) };
    const project = createProject(); project.assets.push({ name: 'example.ply', role: 'model' });
    project.experience.annotations = Array.from({ length: 10 }, (_, i) => ({ position: [i, 1, 0], title: `点 ${i}`, text: '', camera: { initial: { position: [0, 1, 1], target: [0, 1, 0], fov: 65 } } }));
    saveDraft(storage, 'editing-page', project);
    const fresh = createProject(); fresh.assets = project.assets;
    saveDraft(storage, 'fresh-page', fresh);
    assert.equal(readDrafts(storage).length, 2);
    assert.equal(readDrafts(storage).find(d => d.key.includes('editing-page')).project.experience.annotations.length, 10);
    assert.throws(() => saveDraft({ ...storage, setItem() { throw Error('quota'); } }, 'editing-page', fresh));
    assert.equal(readDrafts(storage).find(d => d.key.includes('editing-page')).project.experience.annotations.length, 10);
    storage.setItem('metaflow-studio-draft-v1:broken', '{');
    assert.equal(readDrafts(storage).length, 2);
    assert.equal(storage.getItem('metaflow-studio-draft-v1:broken'), '{');
});

const { withNavigationEnabled, navigationCapability } = await import(await loadSource(new URL('../../metaflow-viewer/src/navigation/nav-annotation.ts', import.meta.url)));
test('@Nav narrow update survives project/save/export and retains unknown metadata', () => {
    const project = createProject();
    const annotation = {position:[0,0,0],title:'ordinary',text:'',camera:{initial:{position:[1,1.5,1],target:[0,0,0],fov:75}},extras:{vendor:{a:[1]},metaflow:{keep:'retained',nav:{future:42}}}};
    project.experience.annotations.push(annotation);
    const original = JSON.stringify(project);
    project.experience.annotations[0] = withNavigationEnabled(annotation, true);
    const saved = readProject(JSON.parse(JSON.stringify(portableProject(project))));
    assert.equal(navigationCapability(saved.experience.annotations[0]).enabled, true);
    assert.deepEqual(saved.experience.annotations[0].extras.vendor, {a:[1]});
    assert.equal(saved.experience.annotations[0].extras.metaflow.nav.future,42);
    const warnings = compatibilityWarnings(saved.experience).join(' ');
    assert.ok(warnings.includes('extras.vendor'));
    assert.ok(warnings.includes('nav.future'));
    assert.equal(warnings.includes('nav.enabled'), false);
    const exported = portableExperience(saved.experience);
    assert.equal(navigationCapability(exported.annotations[0]).enabled,true);
    assert.equal(navigationCapability(withNavigationEnabled(saved.experience.annotations[0],false)).enabled,false);
    assert.equal(navigationCapability(JSON.parse(original).experience.annotations[0]).enabled,false);
});

test('Studio rejects camera-less Nav files without replacing metadata; valid-camera extensions roundtrip unchanged', () => {
    const project = createProject();
    const extras = { vendor: ['未修改', { payload: [false, 3] }], metaflow: { future: 'retained', nav: { enabled: true, future: { mode: 7 } } } };
    project.experience.annotations.push({ position: [0, 0, 0], title: '普通标题', text: '正文不含命令',
        camera: { initial: { position: [0, 1.5, 2], target: [0, 0, 0], fov: 75 } }, extras });
    const original = JSON.stringify(project);
    const originalExtrasBytes = Buffer.from(JSON.stringify(extras), 'utf8');
    const reopened = readProject(JSON.parse(JSON.stringify(portableProject(project))));
    const exported = portableExperience(reopened.experience);
    assert.deepEqual(Buffer.from(JSON.stringify(reopened.experience.annotations[0].extras), 'utf8'), originalExtrasBytes);
    assert.deepEqual(Buffer.from(JSON.stringify(exported.annotations[0].extras), 'utf8'), originalExtrasBytes);
    assert.equal(navigationCapability(exported.annotations[0]).enabled, true);
    assert.equal(JSON.stringify(project), original);

    // The existing public settings schema requires an annotation camera. An
    // in-memory capability reason does not make this malformed wire input valid.
    const missing = JSON.parse(original);
    delete missing.experience.annotations[0].camera;
    const malformedBytes = JSON.stringify(missing);
    assert.deepEqual(navigationCapability(missing.experience.annotations[0]), {
        declared: true, enabled: false, reason: '尚未保存有效观看相机'
    });
    assert.throws(() => readProject(missing), /annotations\[0\]\.camera must be an object/);
    assert.throws(() => readExperience(missing.experience), /annotations\[0\]\.camera must be an object/);
    assert.throws(() => portableProject(missing), /annotations\[0\]\.camera must be an object/);
    assert.throws(() => portableExperience(missing.experience), /annotations\[0\]\.camera must be an object/);
    assert.equal(JSON.stringify(missing), malformedBytes);
});
