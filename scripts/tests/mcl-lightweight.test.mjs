import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';

import { REPO_ROOT, findLegacyChangeDirectories } from '../mcl.mjs';

async function read(relativePath) {
    return readFile(join(REPO_ROOT, relativePath), 'utf8');
}

const CORE_CHINESE_DOCS = [
    'docs/README.md',
    'docs/getting-started/overview.md',
    'docs/getting-started/viewer.md',
    'docs/getting-started/editor.md',
    'docs/guides/editor-to-viewer.md',
    'docs/guides/add-publish-resource.md',
    'docs/guides/configure-viewer.md',
    'docs/guides/embed-share.md',
    'docs/guides/debug-and-profile.md',
    'docs/concepts/architecture.md',
    'docs/concepts/resource-loading.md',
    'docs/concepts/version-upstream-local.md',
    'docs/reference/repository-map.md',
    'docs/reference/viewer-url-parameters.md',
    'docs/reference/viewer-settings-schema.md',
    'docs/reference/resource-index.md',
    'docs/reference/editor-export-contract.md',
    'docs/reference/compatibility-and-version-sources.md',
    'docs/maintenance/development.md',
    'docs/maintenance/upstream-sync.md',
    'docs/maintenance/versioning-and-release.md',
    'docs/maintenance/deployment.md',
    'docs/maintenance/troubleshooting.md',
    'docs/maintenance/documentation.md',
    'docs/history/README.md'
];

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

test('resource tiers and forward Viewer SemVer preserve production while tracking the 5.19.1 recovery', async () => {
    const [mcl, guide, release, ledger, metadata, published] = await Promise.all([
        read('docs/metaflow-change-lifecycle-v1.0.md'),
        read('docs/guides/add-publish-resource.md'),
        read('docs/maintenance/versioning-and-release.md'),
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
    assert.match(release, /PATCH[\s\S]*`5\.19\.2`/);
    assert.match(release, /MINOR[\s\S]*`5\.20\.0`/);
    assert.match(release, /MAJOR[\s\S]*`6\.0\.0`/);
    assert.match(ledger, /从该边界之后只审计 Viewer、data 和 Viewer 发布支撑提交/);
    assert.match(ledger, /### X\.Y\.Z/);
    assert.equal(manifest.versioning.mode, 'semver-forward');
    assert.equal(manifest.current.displayVersion, '5.19.1');
    assert.equal(manifest.current.appSemver, '5.19.1');
    assert.equal(manifest.current.gitRef, '534b013');
    assert.match(ledger, /5\.19\.0[^\n]*deployment 前失败/);
    assert.match(ledger, /5\.19\.1[^\n]*正式生产发布仍在等待/);
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

test('on-demand Viewer validation uses the release-complete sparse fixture and build order', async () => {
    const workflow = await read('.github/workflows/ci.yml');
    const viewerJob = workflow.match(
        /  viewer:\n(?<body>[\s\S]*?)\n  editor:/
    );

    assert.ok(viewerJob?.groups?.body, 'Viewer validation job must be present');
    for (const path of ['.nvmrc', 'data/ACG/BitCity260711', 'data/ACG/SZCAF15']) {
        assert.match(viewerJob.groups.body, new RegExp(`^            ${path.replaceAll('/', '\\/')}$`, 'm'));
    }

    const buildAt = viewerJob.groups.body.indexOf('- name: Build Viewer');
    const testAt = viewerJob.groups.body.indexOf('- name: Test Viewer');
    assert.ok(buildAt >= 0 && testAt > buildAt, 'Viewer package must be built before consumer tests');
    assert.match(viewerJob.groups.body, /MCL_SMALL_FIXTURES: 1/);
});

test('controlled Viewer release uses a complete sparse fixture and exact deploy identity', async () => {
    const workflow = await read('.github/workflows/release.yml');
    const viewerStep = workflow.match(
        /- name: Build Viewer release payload[\s\S]*?run: \|(?<body>[\s\S]*?)\n      - name:/
    );

    assert.ok(viewerStep?.groups?.body, 'Viewer release step must be present');
    assert.match(workflow, /^            \.nvmrc$/m);
    assert.match(workflow, /^            data\/ACG\/BitCity260711$/m);
    assert.match(workflow, /^            data\/ACG\/SZCAF15$/m);
    assert.match(workflow, /node scripts\/validate_release_contract\.mjs/);
    assert.match(workflow, /item\.title === process\.env\.RELEASE_TAG/);
    assert.match(workflow, /item\.context === 'production'/);
    assert.match(workflow, /EXPECTED_VERSION: \$\{\{ needs\.prepare\.outputs\.version \}\}/);
    assert.match(workflow, /EXPECTED_PRODUCT_GIT_REF:/);
    assert.match(workflow, /smoke-production-version\.json/);

    const buildAt = viewerStep.groups.body.indexOf('npm run build');
    const testAt = viewerStep.groups.body.indexOf('MCL_SMALL_FIXTURES=1 npm test');
    assert.ok(buildAt >= 0 && testAt > buildAt, 'Viewer package must be built before consumer tests');
    for (const command of ['npm run fmt', 'npm run lint', 'npm run type:check', 'npm run publint']) {
        assert.ok(viewerStep.groups.body.includes(command), `missing release gate: ${command}`);
    }
    assert.ok(viewerStep.groups.body.includes('npm audit --omit=dev'));
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

test('active templates and the Change registry expose Revision 6 without rewriting history', async () => {
    const [issue, spec, plan, changes, templates, agents] = await Promise.all([
        read('docs/templates/mcl/issue-body.md'),
        read('docs/templates/mcl/spec.md'),
        read('docs/templates/mcl/plan.md'),
        read('docs/changes/README.md'),
        read('docs/templates/mcl/README.md'),
        read('AGENTS.md')
    ]);

    assert.match(issue, /Open \/ In Progress \/ In Review \/ Done/);
    assert.doesNotMatch(issue, /Proposed \/ Ready \/ In Progress/);
    assert.match(spec, /^status: specified$/m);
    assert.match(plan, /^status: approved$/m);
    assert.match(changes, /MF-1[\s\S]*Legacy 审计档案/);
    assert.match(changes, /MF-9[\s\S]*Legacy 审计档案/);
    assert.match(changes, /MF-28[\s\S]*当前 Revision 6 契约/);
    assert.match(templates, /仅显式审计模式/);
    assert.match(agents, /不能用 MF-1、MF-9/);
});

test('the Chinese handbook has 25 substantive, indexed core pages', async () => {
    const [index, oldUrlSettings, oldReleaseDeploy] = await Promise.all([
        read('docs/README.md'),
        read('docs/reference/viewer-url-settings.md'),
        read('docs/maintenance/release-deploy.md')
    ]);

    assert.equal(CORE_CHINESE_DOCS.length, 25);
    for (const relativePath of CORE_CHINESE_DOCS) {
        const body = await read(relativePath);
        assert.ok(body.trim().split(/\r?\n/).length >= 12, `${relativePath}: expected substantive content`);

        if (relativePath !== 'docs/README.md') {
            const indexTarget = relativePath.replace(/^docs\//, '');
            assert.ok(index.includes(`(${indexTarget})`), `${relativePath}: missing from docs/README.md`);
        }
    }

    assert.doesNotMatch(index, /viewer-url-settings\.md/);
    assert.doesNotMatch(index, /release-deploy\.md/);
    assert.match(oldUrlSettings, /viewer-url-parameters\.md/);
    assert.match(oldUrlSettings, /viewer-settings-schema\.md/);
    assert.match(oldReleaseDeploy, /versioning-and-release\.md/);
    assert.match(oldReleaseDeploy, /deployment\.md/);
});

test('check-all discovers manifests, not lightweight Spec and Plan directories', async () => {
    const directories = await findLegacyChangeDirectories();
    assert.ok(directories.some((path) => path.endsWith('docs/changes/1-adopt-mcl-v1')));
    assert.ok(!directories.some((path) => path.endsWith('docs/changes/18-mcl-lightweight')));
    assert.ok(!directories.some((path) => path.endsWith('docs/changes/28-mcl-local-first')));
});
