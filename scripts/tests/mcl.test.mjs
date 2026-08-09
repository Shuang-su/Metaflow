import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
    checkChange,
    classifyPaths,
    generateChange,
    loadComponentRegistry,
    parseFrontMatter,
    sha256
} from '../mcl.mjs';
import { discoverTargets } from '../upstream_watch.mjs';

const PLAN_BODY = `---
change_id: MF-42
title: Fixture change
status: closed
component:
  - platform
risk: T2
type: governance
owner: fixture
created: 2026-08-09
updated: 2026-08-09
issue: https://github.com/Shuang-su/Metaflow/issues/42
plan_revision: 1
completion_state: complete
supersedes: null
terminal_reason: null
---

# Implementation Plan

## Goal

Prove deterministic completion generation.

## Tasks

1. Generate.
2. Check.

## Validation

Run the test suite.
`;

const SPEC_BODY = `---
change_id: MF-42
title: Fixture specification
status: specified
component:
  - platform
risk: T2
type: governance
owner: fixture
created: 2026-08-09
updated: 2026-08-09
issue: https://github.com/Shuang-su/Metaflow/issues/42
plan_revision: 1
completion_state: complete
supersedes: null
terminal_reason: null
---

# Change Spec

Generate a deterministic fixture and reject invalid completion material.
`;

function taskRecord(planHash, requestText, status = 'complete') {
    return `---
task_id: MF-42-T01
change_id: MF-42
tool: codex
source_task_id: fixture-thread
status: ${status}
started: 2026-08-09T00:00:00Z
completed: 2026-08-09T00:01:00Z
branch: codex/mf-42-fixture
head_before: abcdef0
head_after: abcdef1
plan_revision: 1
plan_sha256: ${planHash}
archive_status: complete
---

# Agent Completion Record

## Authorized Scope

Generate and validate the fixture.

## Complete User Request

${requestText}

## Complete Effective Task Plan

${PLAN_BODY}

## Chronological Action Summary

Generated and checked.

## Agent Reply Summary

Reported the result.

## Files and External Effects

Temporary files only.

## Validation

The validator passed.

## Failures, Retries, and Skipped Checks

None.

## Plan Deviations and Approval

None.

## Remaining Work and Continuation Conditions

None.

## Final Delivery

Fixture record.
`;
}

function closure(status = 'complete', includeDisposition = true) {
    return `---
change_id: MF-42
status: closing
terminal_state: closed
owner: fixture
closed_at: 2026-08-09T00:02:00Z
approved_by: fixture
generated_at: 2026-08-09T00:02:00Z
---

# Closure

## Closure Decision

Close after validation.

## Task Disposition

${includeDisposition ? `MF-42-T01: ${status === 'complete' ? 'completed' : 'accepted disposition'}.` : 'None.'}

## Plan Amendments and Deviations

None.

## Implementation and External Effects

Temporary fixture generated.

## Verification and Review

Validator passed.

## Release, Rollback and Observation

Not applicable.

## Remaining Risks and Follow-up Changes

None.

## Ledger, Version, PR, and Release Links

Not applicable.

## Redactions

None.

## Final Response Delivery

Delivered by the test.
`;
}

async function createFixture({ taskStatus = 'complete', includeDisposition = true, secret = null, marker = true } = {}) {
    const root = await mkdtemp(join(tmpdir(), 'metaflow-mcl-'));
    const completion = join(root, 'completion');
    await mkdir(join(completion, 'task-records'), { recursive: true });
    const planHash = sha256(PLAN_BODY);
    const requestText = `---
change_id: MF-42
task_id: MF-42-T01
source: codex
source_thread_id: fixture-thread
captured: 2026-08-09
message_count: 1
redactions: 0
---

# Complete User Request Transcript

${marker ? '<!-- user-message:1 -->' : ''}
Implement the fixture.${secret ? ` ${secret}` : ''}
<!-- /user-message -->
`;
    const summaryText = `---
change_id: MF-42
status: closing
generated_at: 2026-08-09T00:02:00Z
---

# Agent Actions and Replies Summary

## Task Inventory

MF-42-T01

## Chronological Action Summary

Generated the fixture.

## Agent Reply Summary

Reported validation.

## Files and External Effects

Temporary files only.

## Validation, Failures, and Omissions

All fixture checks ran.
`;
    const evidenceText = `---
change_id: MF-42
title: Fixture evidence
status: verifying
component:
  - platform
risk: T2
type: governance
owner: fixture
created: 2026-08-09
updated: 2026-08-09
issue: https://github.com/Shuang-su/Metaflow/issues/42
plan_revision: 1
completion_state: complete
supersedes: null
terminal_reason: null
---

# Evidence

The fixture validator passed.
`;

    await writeFile(join(root, 'plan.md'), PLAN_BODY);
    await writeFile(join(root, 'spec.md'), SPEC_BODY);
    await writeFile(join(root, 'evidence.md'), evidenceText);
    await writeFile(join(completion, 'request-transcript.md'), requestText);
    await writeFile(join(completion, 'agent-action-reply-summary.md'), summaryText);
    await writeFile(join(completion, 'closure.md'), closure(taskStatus, includeDisposition));
    await writeFile(join(completion, 'redactions.json'), '[]\n');
    await writeFile(join(completion, 'task-records/MF-42-T01.md'), taskRecord(planHash, requestText, taskStatus));
    return root;
}

test('front matter parser preserves list fields and scalars', () => {
    const parsed = parseFrontMatter(PLAN_BODY, 'fixture');
    assert.deepEqual(parsed.data.component, ['platform']);
    assert.equal(parsed.data.plan_revision, 1);
    assert.equal(parsed.data.completion_state, 'complete');
});

test('generate and strict check are deterministic', async () => {
    const root = await createFixture();
    const first = await generateChange(root);
    assert.deepEqual(first.changed.sort(), ['approved-plan.md', 'dossier.md', 'manifest.json']);
    const second = await generateChange(root);
    assert.deepEqual(second.changed, []);
    const manifest = await checkChange(root, { strict: true });
    assert.equal(manifest.changeId, 'MF-42');
    assert.equal(manifest.taskRecords[0].status, 'complete');
    assert.equal(manifest.taskRecords[0].sourceTaskId, 'fixture-thread');
    const dossier = await readFile(join(root, 'completion/dossier.md'), 'utf8');
    assert.match(dossier, /## 2\. Complete User Request Transcript/);
    assert.match(dossier, /## 5\. Complete Effective Plan/);
    assert.match(dossier, /Implement the fixture/);
    let insideFence = false;
    const dossierSections = dossier.split('\n').flatMap((line) => {
        if (/^`{4,}/.test(line)) {
            insideFence = !insideFence;
            return [];
        }
        const match = !insideFence && line.match(/^## ([0-9]+)\./);
        return match ? [Number(match[1])] : [];
    });
    assert.deepEqual(dossierSections, Array.from({ length: 13 }, (_, index) => index + 1));
});

test('check detects a stale generated dossier', async () => {
    const root = await createFixture();
    await generateChange(root);
    await writeFile(join(root, 'completion/dossier.md'), '# stale\n');
    await assert.rejects(() => checkChange(root), /dossier\.md is stale/);
});

test('source checksums require canonical on-disk bytes', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, `${task}\n`);
    await assert.rejects(
        () => generateChange(root),
        /source must use LF and exactly one terminal newline/
    );
});

test('request message count requires explicit message markers', async () => {
    const root = await createFixture({ marker: false });
    await assert.rejects(() => generateChange(root), /user-message markers must be contiguous and ordered/);
});

test('request message markers must retain their original order', async () => {
    const root = await createFixture();
    const requestPath = join(root, 'completion/request-transcript.md');
    const request = await readFile(requestPath, 'utf8');
    await writeFile(requestPath, request.replace('user-message:1', 'user-message:2'));
    await assert.rejects(() => generateChange(root), /user-message markers must be contiguous and ordered/);
});

test('task plan revision must match the effective Change plan', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, task.replace('plan_revision: 1', 'plan_revision: 2'));
    await assert.rejects(() => generateChange(root), /plan_revision does not match plan\.md/);
});

test('a link cannot replace the complete effective plan in a Task Record', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, task.replace(PLAN_BODY, 'See ../plan.md.\n'));
    await assert.rejects(() => generateChange(root), /complete effective plan is not embedded verbatim/);
});

test('empty action or reply summaries are rejected', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, task.replace('## Agent Reply Summary\n\nReported the result.\n', '## Agent Reply Summary\n\n'));
    await assert.rejects(() => generateChange(root), /empty "## Agent Reply Summary"/);
});

test('unresolved placeholders are rejected from completion sources', async () => {
    const root = await createFixture();
    const summaryPath = join(root, 'completion/agent-action-reply-summary.md');
    const summary = await readFile(summaryPath, 'utf8');
    await writeFile(summaryPath, summary.replace('Reported validation.', 'TBD'));
    await assert.rejects(() => generateChange(root), /unresolved TODO\/TBD\/FIXME/);
});

test('likely secrets block generation', async () => {
    const root = await createFixture({ secret: `ghp_${'1234567890'.repeat(3)}` });
    await assert.rejects(() => generateChange(root), /possible GitHub token/);
});

test('non-complete terminal tasks require a closure disposition', async () => {
    const root = await createFixture({ taskStatus: 'blocked', includeDisposition: false });
    await assert.rejects(() => generateChange(root), /missing disposition for MF-42-T01/);
});

test('component registry classifies platform and design paths independently', async () => {
    const registry = await loadComponentRegistry();
    const result = classifyPaths([
        'docs/changes/42-fixture/plan.md',
        'aave-liquid-glass-lab/storybook/package.json',
        'metaflow-viewer/src/index.ts'
    ], registry);
    assert.deepEqual(Object.keys(result).sort(), ['design', 'platform', 'viewer']);
    assert.deepEqual(result.design, ['aave-liquid-glass-lab/storybook/package.json']);
});

test('upstream watcher derives targets from component version sources', async () => {
    const targets = await discoverTargets();
    assert.deepEqual(
        targets.map(({ component, repository }) => ({ component, repository })),
        [
            { component: 'viewer', repository: 'playcanvas/supersplat-viewer' },
            { component: 'editor', repository: 'playcanvas/supersplat' }
        ]
    );
    assert.ok(targets.every((target) => /^\d+\.\d+\.\d+/.test(target.currentVersion)));
});
