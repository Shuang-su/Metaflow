import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PROJECTION_PERSPECTIVE, Vec3 } from 'playcanvas';
import ts from 'typescript';

const source = await readFile(new URL('../src/input/shared.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }
});
const script = outputText.replace("from 'playcanvas'", `from ${JSON.stringify(import.meta.resolve('playcanvas'))}`);
const { screenToMove } = await import('data:text/javascript;base64,' + Buffer.from(script).toString('base64'));

test('screen-space pan preserves projected motion for a metric first-person controller or a scaled scene', () => {
    const cameraComponent = {
        fov: 85, aspectRatio: 1.6, horizontalFov: true, projection: PROJECTION_PERSPECTIVE,
        system: { app: { graphicsDevice: { clientRect: { width: 1280, height: 800 } } } }
    };
    const context = { cameraComponent, distance: 2.7 };
    const unitsPerMeter = 0.018994308848046808;
    const orbit = screenToMove({ ...context, isFirstPerson: false, unitsPerMeter }, 100, 20, new Vec3());
    const fly = screenToMove({ ...context, isFirstPerson: true, unitsPerMeter }, 100, 20, new Vec3());
    const defaultScale = screenToMove({ ...context, isFirstPerson: true }, 100, 20, new Vec3());
    assert(fly.mulScalar(unitsPerMeter).distance(orbit) < 1e-10);
    assert.deepEqual(defaultScale, orbit);
});
