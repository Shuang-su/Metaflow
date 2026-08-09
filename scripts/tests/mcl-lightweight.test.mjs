import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { REPO_ROOT, findLegacyChangeDirectories } from '../mcl.mjs';

async function read(relativePath) {
    return readFile(join(REPO_ROOT, relativePath), 'utf8');
}

test('MCL revision 5 defines the lightweight collaboration contract', async () => {
    const mcl = await read('docs/metaflow-change-lifecycle-v1.0.md');

    assert.match(mcl, /^revision: 5$/m);
    assert.match(mcl, /### 3\.1 Issue Body Contract/);
    assert.match(mcl, /Proposed → Ready → In Progress → In Review → Done/);
    assert.match(mcl, /Decision Gate/);
    assert.ok(mcl.includes('Merge/Release Gate'));
    assert.match(mcl, /以下工件不再默认生成：Agent Completion Record、Change Completion Dossier、Manifest/);
    assert.match(mcl, /新 Change 不因没有 manifest 而失败/);
});

test('agent and contributor guidance use Issue and PR as default delivery', async () => {
    const [agents, contributing, pullRequest] = await Promise.all([
        read('AGENTS.md'),
        read('CONTRIBUTING.md'),
        read('.github/pull_request_template.md')
    ]);

    assert.match(agents, /完成交付以 Issue 和 PR 为准/);
    assert.doesNotMatch(agents, /Every independently prompted agent task must create/);
    assert.match(contributing, /Issue 是任务入口/);
    assert.match(contributing, /以下内容不是默认工件/);
    assert.match(pullRequest, /## Issue acceptance mapping/);
    assert.match(pullRequest, /## Follow-up and Issue delivery/);
    assert.doesNotMatch(pullRequest, /## Agent Completion/);
});

test('every Issue Form exposes the self-contained Issue contract', async () => {
    const issueFormRoot = join(REPO_ROOT, '.github/ISSUE_TEMPLATE');
    const filenames = (await readdir(issueFormRoot))
        .filter((name) => name.endsWith('.yml') && name !== 'config.yml');
    const requiredLabels = [
        'label: 当前状态',
        'label: 背景',
        'label: 目标',
        'label: 包含范围',
        'label: 排除范围',
        'label: 验收标准',
        'label: 风险、依赖与回退',
        'label: Spec / Plan 与相关任务',
        'label: 完成交付'
    ];

    assert.ok(filenames.length >= 6);
    for (const filename of filenames) {
        const body = await read(join('.github/ISSUE_TEMPLATE', filename));
        for (const label of requiredLabels) {
            assert.ok(body.includes(label), `${filename}: missing "${label}"`);
        }
    }
});

test('legacy completion templates remain available but are audit-only', async () => {
    for (const relativePath of [
        'docs/templates/mcl/agent-completion.md',
        'docs/templates/mcl/closure.md',
        'docs/templates/mcl/release-task-record.md'
    ]) {
        const body = await read(relativePath);
        assert.match(body, /仅限显式审计模式/, relativePath);
    }

    const manifest = await read('docs/changes/1-adopt-mcl-v1/completion/manifest.json');
    assert.match(manifest, /"schemaVersion": "1\.1"/);
});

test('check-all discovers manifests, not every lightweight Spec and Plan directory', async () => {
    const directories = await findLegacyChangeDirectories();
    assert.ok(directories.some((path) => path.endsWith('docs/changes/1-adopt-mcl-v1')));
    assert.ok(!directories.some((path) => path.endsWith('docs/changes/18-mcl-lightweight')));
});
