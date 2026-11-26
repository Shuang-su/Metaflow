import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import ts from 'typescript';

const source = await readFile(new URL('../src/shenzhen/sp-map/overview.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 }
});
const encoded = Buffer.from(outputText).toString('base64');
const { makeMapOverview, stepMapOverview } = await import(`data:text/javascript;base64,${encoded}`);

const ring = (left, top, right, bottom) => [
    { x: left, z: top },
    { x: right, z: top },
    { x: right, z: bottom },
    { x: left, z: bottom }
];
// APEC map metres, from the surveyed Hall 2 and Hall 3 footprints.
const primary = ring(210.22, 489.459, 335.221, 609.459);
const adjacent = ring(76, 549.459, 195, 609.459);
const home = { x: 272.72, z: 549.459, span: 81.01479289940828, rotation: 0, anchorY: 0.5 };
const viewport = { width: 300, height: 300, unit: (300 * 3940) / 6760 };
const overview = makeMapOverview(primary, adjacent);
const westward = (x) => overview({ x, z: 575 }, home, viewport);

test('APEC overview begins fitting the service passage before the visitor leaves Hall 2', () => {
    assert.deepEqual(westward(250), home);
    const nearDoor = westward(220);
    const atDoor = westward(210.22);
    const insidePassage = westward(202);
    const insideHall3 = westward(175);
    assert.ok(nearDoor.span > home.span);
    assert.ok(atDoor.span > nearDoor.span);
    assert.ok(insidePassage.span > atDoor.span);
    assert.ok(insideHall3.span > insidePassage.span);
    assert.ok(atDoor.x < home.x);

    const frame = (440 * insideHall3.span) / (410 * viewport.unit);
    const left = insideHall3.x - (viewport.width * frame) / 2;
    const right = insideHall3.x + (viewport.width * frame) / 2;
    assert.ok(left < adjacent[0].x && right > primary[1].x);
});

test('the overview widens on the inside approaches to other exterior passages', () => {
    for (const position of [{ x: 326, z: 550 }, { x: 298, z: 601 }, { x: 282, z: 498 }]) {
        assert.ok(overview(position, home, viewport).span > home.span + 1);
    }
});

test('the outside frame keeps the visitor in view across display aspect ratios', () => {
    for (const [width, height] of [[300, 300], [310, 235], [235, 310]]) {
        const unit = Math.min(width, (height * 3940) / 6760);
        for (const position of [{ x: 356, z: 550 }, { x: 298, z: 630 }, { x: 282, z: 462 }]) {
            const view = overview(position, home, { width, height, unit });
            const scale = (410 * unit) / (440 * view.span);
            assert.ok(Math.abs(position.x - view.x) * scale < width / 2 - 10);
            assert.ok(Math.abs(position.z - view.z) * scale < height / 2 - 10);
        }
    }
});

test('the edge transition has no jump and returns to the ordinary frame after re-entry', () => {
    const before = westward(210.221);
    const after = westward(210.219);
    assert.ok(Math.abs(before.span - after.span) < 0.02);

    const wide = westward(170);
    const dt = 1 / 60;
    let frame = stepMapOverview(home, wide, dt, false);
    assert.ok(frame.span > home.span && frame.span < wide.span);
    let returning = stepMapOverview(wide, home, dt, false);
    assert.ok(wide.span - returning.span < frame.span - home.span);
    for (let i = 0; i < 480; i++) returning = stepMapOverview(returning, home, dt, false);
    assert.deepEqual(returning, home);
    assert.deepEqual(stepMapOverview(wide, home, dt, true), home);
});
