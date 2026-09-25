import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const repositoryRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const checkerPath = join(repositoryRoot, 'scripts', 'check_markdown_links.mjs');

async function createFixture() {
    const root = await mkdtemp(join(tmpdir(), 'metaflow-markdown-links-'));
    await mkdir(join(root, 'scripts'), { recursive: true });
    await mkdir(join(root, 'docs', 'changes', 'example', 'completion', 'task-records'), { recursive: true });
    await mkdir(join(root, 'docs', 'changes', 'example', 'evidence'), { recursive: true });
    await copyFile(checkerPath, join(root, 'scripts', 'check_markdown_links.mjs'));
    await writeFile(join(root, 'docs', 'changes', 'example', 'spec.md'), '# Spec\n');
    await writeFile(join(root, 'docs', 'changes', 'example', 'evidence', 'route.jpg'), 'fixture\n');
    await execFile('git', ['init', '--quiet'], root);
    return root;
}

async function execFile(command, args, cwd) {
    return execFileSync(command, args, { cwd, encoding: 'utf8', stdio: 'pipe' });
}

test('completion artifacts resolve embedded links from the Change directory', async (t) => {
    const root = await createFixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const change = join(root, 'docs', 'changes', 'example');
    const embedded = '[Spec](spec.md)\n![Evidence](evidence/route.jpg)\n';
    await writeFile(join(change, 'completion', 'approved-plan.md'), embedded);
    await writeFile(join(change, 'completion', 'dossier.md'), embedded);
    await writeFile(join(change, 'completion', 'task-records', 'T01.md'), embedded);

    const output = await execFile('node', ['scripts/check_markdown_links.mjs'], root);
    assert.match(output, /Markdown link validation passed/);
});

test('completion fallback still rejects a target missing from the Change directory', async (t) => {
    const root = await createFixture();
    t.after(() => rm(root, { recursive: true, force: true }));
    const dossier = join(root, 'docs', 'changes', 'example', 'completion', 'dossier.md');
    await writeFile(dossier, '[Missing](evidence/missing.jpg)\n');

    assert.throws(
        () => execFileSync('node', ['scripts/check_markdown_links.mjs'], {
            cwd: root,
            encoding: 'utf8',
            stdio: 'pipe'
        }),
        (error) => {
            assert.equal(error.status, 1);
            assert.match(error.stderr, /missing local link target evidence\/missing\.jpg/);
            return true;
        }
    );
});
