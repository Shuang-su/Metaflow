import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { REPO_ROOT, findLegacyChangeDirectories } from '../mcl.mjs';

async function read(relativePath) {
    return readFile(join(REPO_ROOT, relativePath), 'utf8');
}

test('MCL revision 6 defines the local-first lifecycle and conditional artifacts', async () => {
    const mcl = await read('docs/metaflow-change-lifecycle-v1.0.md');

    assert.match(mcl, /^revision: 6$/m);
    assert.match(mcl, /^last_change_id: MF-28$/m);
    assert.match(mcl, /Request \/ Observation/);
    assert.match(mcl, /Open → In Progress → In Review → Done/);
    assert.match(mcl, /开始条件/);
    assert.match(mcl, /完成条件/);
    assert.match(mcl, /Ready.*不是通用状态/);
    assert.doesNotMatch(mcl, /\| Decision Gate \|/);
    assert.doesNotMatch(mcl, /\| Merge\/Release Gate \|/);
    assert.match(mcl, /Spec、仓库 Plan 和 TDD 是条件工件/);
    assert.match(mcl, /普通 GitHub CI 只按需手动运行/);
    assert.match(mcl, /新 Change 不因没有 manifest 而失败/);
});

test('Completion Contract stays in PR, Issue, or concise direct-commit trailers', async () => {
    const [mcl, agents, contributing, pullRequest] = await Promise.all([
        read('docs/metaflow-change-lifecycle-v1.0.md'),
        read('AGENTS.md'),
        read('CONTRIBUTING.md'),
        read('.github/pull_request_template.md')
    ]);

    for (const body of [mcl, agents, contributing]) {
        assert.match(body, /Validation:/);
        assert.match(body, /Release:/);
        assert.match(body, /Refs:/);
        assert.match(body, /Ledger.*Version History.*不是通用 Completion Contract|Ledger 与 Version History 不是通用完成档案|二者不是通用 Completion Contract/s);
    }
    assert.match(agents, /有 PR：PR 记录实际结果/);
    assert.match(contributing, /PR 存在时就是 Completion Contract/);
    assert.match(pullRequest, /## Actual result/);
    assert.match(pullRequest, /## Issue acceptance mapping/);
    assert.match(pullRequest, /## Completion and follow-up/);
    assert.doesNotMatch(pullRequest, /## Agent Completion/);
});

test('every Issue Form exposes the self-contained Issue contract and current states', async () => {
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
        assert.doesNotMatch(body, /\bReady\b/, `${filename}: Ready is no longer a status`);
        assert.match(body, /\bIn Progress\b/);
        assert.match(body, /\bDone\b/);
    }
});

test('resource tiers and forward Viewer SemVer are documented without changing current release', async () => {
    const [mcl, guide, release, ledger, metadata, published] = await Promise.all([
        read('docs/metaflow-change-lifecycle-v1.0.md'),
        read('docs/guides/add-publish-resource.md'),
        read('docs/maintenance/release-deploy.md'),
        read('docs/metaflow-viewer-change-ledger.md'),
        read('metadata/version-history.json'),
        read('data/version-history.json')
    ]);
    const manifest = JSON.parse(metadata);

    for (const body of [mcl, guide]) {
        assert.match(body, /常规资源/);
        assert.match(body, /大型或新增入口/);
        assert.match(body, /结构性资源变更/);
        assert.match(body, /20 个文件|20 个/);
        assert.match(body, /100 MiB/);
    }
    assert.match(release, /PATCH，例如 `5\.18\.1`/);
    assert.match(release, /MINOR，例如 `5\.19\.0`/);
    assert.match(release, /MAJOR，例如 `6\.0\.0`/);
    assert.match(ledger, /从该边界之后只审计 Viewer、data 和 Viewer 发布支撑提交/);
    assert.match(ledger, /### X\.Y\.Z/);
    assert.equal(manifest.versioning.mode, 'semver-forward');
    assert.equal(manifest.current.displayVersion, '5.18a');
    assert.equal(manifest.current.appSemver, '5.18.0');
    assert.deepEqual(JSON.parse(published), manifest);
});

test('ordinary GitHub validation is manual and main has no required status check', async () => {
    const [workflow, trackedRuleset] = await Promise.all([
        read('.github/workflows/ci.yml'),
        read('.github/rulesets/main.json')
    ]);
    const ruleset = JSON.parse(trackedRuleset);

    assert.match(workflow, /^name: On-demand validation$/m);
    assert.match(workflow, /^  workflow_dispatch:$/m);
    assert.doesNotMatch(workflow, /^  pull_request:$/m);
    assert.doesNotMatch(workflow, /^  push:$/m);
    assert.match(workflow, /name: manual \/ summary/);
    assert.doesNotMatch(workflow, /required \/ gate/);
    assert.ok(ruleset.rules.some((rule) => rule.type === 'deletion'));
    assert.ok(ruleset.rules.some((rule) => rule.type === 'non_fast_forward'));
    assert.ok(ruleset.rules.some((rule) => rule.type === 'pull_request'));
    assert.ok(!ruleset.rules.some((rule) => rule.type === 'required_status_checks'));
    assert.ok(ruleset.bypass_actors.some((actor) => (
        actor.actor_type === 'User'
        && actor.actor_id === 103928586
        && actor.bypass_mode === 'always'
    )));
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

test('check-all discovers manifests, not lightweight Spec and Plan directories', async () => {
    const directories = await findLegacyChangeDirectories();
    assert.ok(directories.some((path) => path.endsWith('docs/changes/1-adopt-mcl-v1')));
    assert.ok(!directories.some((path) => path.endsWith('docs/changes/18-mcl-lightweight')));
    assert.ok(!directories.some((path) => path.endsWith('docs/changes/28-mcl-local-first')));
});
