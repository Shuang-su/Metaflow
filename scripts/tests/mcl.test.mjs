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

function taskRecord(planHash, requestText, status = 'complete', {
    taskId = 'MF-42-T01',
    planText = PLAN_BODY,
    planRevision = 1,
    sourceTaskId = 'fixture-thread',
    started = '2026-08-09T00:00:00Z',
    completed = '2026-08-09T00:01:00Z'
} = {}) {
    return `---
task_id: ${taskId}
change_id: MF-42
tool: codex
source_task_id: ${sourceTaskId}
status: ${status}
started: ${started}
completed: ${completed}
branch: codex/mf-42-fixture
head_before: abcdef0
head_after: abcdef1
plan_revision: ${planRevision}
plan_sha256: ${planHash}
archive_status: complete
execution_topology: single-agent
instruction_authority: task-local
authority_source: fixture Task Plan
implementer_id: codex/fixture-thread
review_relationship: author-self-review
reviewer_id: codex/fixture-thread
control_evidence: null
---

# Agent Completion Record

## Authorized Scope

Generate and validate the fixture.

## Execution Method and Authority

- Execution topology: single agent
- Tool-specific instructions and source: fixture Task Plan
- Adoption level: task-local
- Scope of authority: fixture generation only
- Review relationship: author self-review

## Complete User Request

${requestText}

## Complete Effective Task Plan

${planText}

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

function requestDocument(taskId, message) {
    return `---
change_id: MF-42
task_id: ${taskId}
source: codex
source_thread_id: fixture-${taskId}
captured: 2026-08-09
message_count: 1
redactions: 0
---

# Complete User Request Transcript

<!-- user-message:1 -->
${message}
<!-- /user-message -->
`;
}

async function createV11Fixture({
    materialText = null,
    materialSha = null,
    materialEntries = null,
    redactions = []
} = {}) {
    const root = await mkdtemp(join(tmpdir(), 'metaflow-mcl-v11-'));
    const completion = join(root, 'completion');
    await mkdir(join(completion, 'task-records'), { recursive: true });
    const planV2 = PLAN_BODY
        .replace('plan_revision: 1', 'plan_revision: 2')
        .replace('Prove deterministic completion generation.', 'Prove deterministic multi-task completion generation.');
    const planV1Hash = sha256(PLAN_BODY);
    const planV2Hash = sha256(planV2);
    const request1 = requestDocument('MF-42-T01', 'Implement the first immutable task.');
    const request2 = requestDocument('MF-42-T02', 'Implement the second task without rewriting the first.');
    const evidence = SPEC_BODY
        .replace('title: Fixture specification', 'title: Fixture evidence')
        .replace('status: specified', 'status: verifying')
        .replace('plan_revision: 1', 'plan_revision: 2')
        .replace('# Change Spec', '# Evidence');

    await writeFile(join(root, 'plan.md'), planV2);
    await writeFile(join(root, 'spec.md'), SPEC_BODY.replace('plan_revision: 1', 'plan_revision: 2'));
    await writeFile(join(root, 'evidence.md'), evidence);
    await writeFile(join(completion, 'closure.md'), closure());
    await writeFile(join(completion, 'redactions.json'), `${JSON.stringify(redactions, null, 2)}\n`);
    await writeFile(
        join(completion, 'task-records/MF-42-T01.md'),
        taskRecord(planV1Hash, request1, 'complete', {
            planText: PLAN_BODY,
            planRevision: 1,
            sourceTaskId: 'fixture-thread-t01'
        })
    );
    await writeFile(
        join(completion, 'task-records/MF-42-T02.md'),
        taskRecord(planV2Hash, request2, 'complete', {
            taskId: 'MF-42-T02',
            planText: planV2,
            planRevision: 2,
            sourceTaskId: 'fixture-thread-t02',
            started: '2026-08-09T00:01:00Z',
            completed: '2026-08-09T00:02:00Z'
        })
    );
    await writeFile(join(completion, 'plan-revisions.json'), `${JSON.stringify({
        schemaVersion: '1.0',
        revisions: [
            {
                revision: 1,
                sha256: planV1Hash,
                taskIds: ['MF-42-T01'],
                amendmentReason: 'Initial approved fixture plan.',
                approvalSource: 'Fixture user request one.'
            },
            {
                revision: 2,
                sha256: planV2Hash,
                taskIds: ['MF-42-T02'],
                amendmentReason: 'Add the independently approved second task.',
                approvalSource: 'Fixture user request two.'
            }
        ]
    }, null, 2)}\n`);

    if (materialText !== null) {
        await mkdir(join(completion, 'source-materials'), { recursive: true });
        await writeFile(join(completion, 'source-materials/input.md'), materialText);
    }
    if (materialEntries !== null || materialText !== null) {
        const entries = materialEntries ?? [{
            path: 'source-materials/input.md',
            sha256: materialSha ?? sha256(materialText),
            kind: 'fixture',
            provenance: 'test fixture',
            nonNormative: true
        }];
        await writeFile(join(completion, 'source-materials.json'), `${JSON.stringify({
            schemaVersion: '1.0',
            materials: entries
        }, null, 2)}\n`);
    }
    return { root, planV2, planV2Hash, request1, request2 };
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

test('strict check validates an active Change without pretending it is terminal', async () => {
    const root = await createFixture({ taskStatus: 'partial' });
    const planPath = join(root, 'plan.md');
    const closurePath = join(root, 'completion/closure.md');
    const activePlan = (await readFile(planPath, 'utf8'))
        .replace('status: closed', 'status: verifying')
        .replace('completion_state: complete', 'completion_state: pending');
    const requestText = await readFile(join(root, 'completion/request-transcript.md'), 'utf8');
    await writeFile(planPath, activePlan);
    await writeFile(
        join(root, 'completion/task-records/MF-42-T01.md'),
        taskRecord(sha256(activePlan), requestText, 'partial', { planText: activePlan })
    );
    await writeFile(
        closurePath,
        (await readFile(closurePath, 'utf8'))
            .replace('terminal_state: closed', 'terminal_state: verifying')
    );

    await generateChange(root);
    const manifest = await checkChange(root, { strict: true });
    assert.equal(manifest.terminalState, 'verifying');
    assert.equal(manifest.taskRecords[0].status, 'partial');
});

test('closure generation time cannot precede the latest Task completion', async () => {
    const root = await createFixture();
    const closurePath = join(root, 'completion/closure.md');
    await writeFile(
        closurePath,
        (await readFile(closurePath, 'utf8'))
            .replaceAll('2026-08-09T00:02:00Z', '2026-08-08T23:59:00Z')
    );
    await assert.rejects(
        () => generateChange(root),
        /generated_at precedes the latest Task completion/
    );
});

test('Manifest 1.1 aggregates immutable Task Records with task-specific request and plan metadata', async () => {
    const { root, planV2Hash, request1, request2 } = await createV11Fixture();
    const task1Path = join(root, 'completion/task-records/MF-42-T01.md');
    const task1Before = await readFile(task1Path, 'utf8');
    const first = await generateChange(root);
    assert.deepEqual(first.changed.sort(), [
        'agent-action-reply-summary.md',
        'approved-plan.md',
        'dossier.md',
        'manifest.json',
        'request-transcript.md'
    ]);
    assert.equal(await readFile(task1Path, 'utf8'), task1Before);

    const manifest = await checkChange(root, { strict: true });
    assert.equal(manifest.schemaVersion, '1.1');
    assert.equal(manifest.request.messageCount, 2);
    assert.equal(manifest.taskRecords[0].request.sha256, sha256(request1));
    assert.equal(manifest.taskRecords[0].request.messageCount, 1);
    assert.equal(manifest.taskRecords[0].plan.revision, 1);
    assert.equal(manifest.taskRecords[1].request.sha256, sha256(request2));
    assert.equal(manifest.taskRecords[1].plan.revision, 2);
    assert.equal(manifest.taskRecords[1].plan.sha256, planV2Hash);
    assert.deepEqual(manifest.planRevisions.map((entry) => entry.revision), [1, 2]);
    assert.equal(manifest.planRevisions[1].taskIds[0], 'MF-42-T02');

    const transcript = await readFile(join(root, 'completion/request-transcript.md'), 'utf8');
    const summary = await readFile(join(root, 'completion/agent-action-reply-summary.md'), 'utf8');
    assert.match(transcript, /## MF-42-T01/);
    assert.match(transcript, /## MF-42-T02/);
    assert.match(transcript, /Implement the first immutable task/);
    assert.match(transcript, /Implement the second task without rewriting the first/);
    assert.match(summary, /### MF-42-T01/);
    assert.match(summary, /### MF-42-T02/);
    const second = await generateChange(root);
    assert.deepEqual(second.changed, []);
});

test('historical task revisions remain valid while the current plan is checked against the revision index', async () => {
    const { root } = await createV11Fixture();
    await generateChange(root);
    const planPath = join(root, 'plan.md');
    const plan = await readFile(planPath, 'utf8');
    await writeFile(planPath, plan.replace('multi-task completion', 'changed multi-task completion'));
    await assert.rejects(() => generateChange(root), /current plan revision does not match plan\.md/);
});

test('Manifest 1.0 remains readable and checkable without a revision index', async () => {
    const root = await createFixture();
    await generateChange(root);
    const manifest = await checkChange(root, { strict: true });
    assert.equal(manifest.schemaVersion, '1.0');
    assert.equal(manifest.taskRecords[0].request, undefined);
    assert.equal(manifest.planRevisions, undefined);
    assert.equal(manifest.sourceMaterials, undefined);
});

test('fenced task request and plan snapshots are parsed without rewriting the Task Record', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const requestPath = join(root, 'completion/request-transcript.md');
    const request = await readFile(requestPath, 'utf8');
    const embeddedRequest = request.replace(
        'Implement the fixture.',
        'Implement the fixture.\n\n## Complete Effective Task Plan\n\nThis heading is quoted user content.'
    );
    let task = await readFile(taskPath, 'utf8');
    task = task
        .replace(request, `The request snapshot follows.\n\n\`\`\`\`\`\`\`\`markdown\n${embeddedRequest.trimEnd()}\n\`\`\`\`\`\`\`\`\n`)
        .replace(PLAN_BODY, `The plan snapshot follows.\n\n\`\`\`\`\`\`\`\`markdown\n${PLAN_BODY.trimEnd()}\n\`\`\`\`\`\`\`\`\n`);
    await writeFile(taskPath, task);
    const before = await readFile(taskPath, 'utf8');
    await generateChange(root);
    await checkChange(root, { strict: true });
    assert.equal(await readFile(taskPath, 'utf8'), before);
});

test('source materials are registered, checksummed, scanned, and included in the dossier', async () => {
    const material = '# Archived predecessor plan\n\nNon-normative source.\n';
    const { root } = await createV11Fixture({ materialText: material });
    await generateChange(root);
    const manifest = await checkChange(root, { strict: true });
    assert.deepEqual(manifest.sourceMaterials, [{
        path: 'source-materials/input.md',
        sha256: sha256(material),
        kind: 'fixture',
        provenance: 'test fixture',
        nonNormative: true
    }]);
    const dossier = await readFile(join(root, 'completion/dossier.md'), 'utf8');
    assert.match(dossier, new RegExp(`source-materials/input\\.md \\| .${sha256(material)}.`));
});

test('source material checksum mismatches are rejected', async () => {
    const { root } = await createV11Fixture({
        materialText: 'archived source\n',
        materialSha: '0'.repeat(64)
    });
    await assert.rejects(() => generateChange(root), /checksum mismatch for source-materials\/input\.md/);
});

test('source material path escapes are rejected', async () => {
    const { root } = await createV11Fixture({
        materialEntries: [{
            path: 'source-materials/../outside.md',
            sha256: '0'.repeat(64),
            kind: 'fixture',
            provenance: 'test fixture',
            nonNormative: true
        }]
    });
    await assert.rejects(() => generateChange(root), /material path escapes source-materials/);
});

test('duplicate, missing, unlisted, and unexpected source material paths are rejected', async (t) => {
    await t.test('duplicate', async () => {
        const material = 'duplicate source\n';
        const entry = {
            path: 'source-materials/input.md',
            sha256: sha256(material),
            kind: 'fixture',
            provenance: 'test fixture',
            nonNormative: true
        };
        const { root } = await createV11Fixture({ materialText: material, materialEntries: [entry, entry] });
        await assert.rejects(() => generateChange(root), /duplicate material path/);
    });

    await t.test('missing', async () => {
        const { root } = await createV11Fixture({
            materialEntries: [{
                path: 'source-materials/missing.md',
                sha256: '0'.repeat(64),
                kind: 'fixture',
                provenance: 'test fixture',
                nonNormative: true
            }]
        });
        await assert.rejects(() => generateChange(root), /missing source material/);
    });

    await t.test('unlisted', async () => {
        const { root } = await createV11Fixture({ materialText: 'unlisted source\n', materialEntries: [] });
        await assert.rejects(() => generateChange(root), /contains missing or unlisted files/);
    });

    await t.test('unexpected build artifact', async () => {
        const { root } = await createV11Fixture({
            materialEntries: [{
                path: 'source-materials/dist/output.md',
                sha256: '0'.repeat(64),
                kind: 'fixture',
                provenance: 'test fixture',
                nonNormative: true
            }]
        });
        await assert.rejects(() => generateChange(root), /unexpected cache or build artifact/);
    });
});

test('source materials participate in secret and redaction validation', async (t) => {
    await t.test('secret', async () => {
        const { root } = await createV11Fixture({ materialText: `ghp_${'1234567890'.repeat(3)}\n` });
        await assert.rejects(() => generateChange(root), /possible GitHub token/);
    });

    await t.test('audited redaction', async () => {
        const replacement = '[REDACTED: fixture credential]';
        const { root } = await createV11Fixture({
            materialText: `${replacement}\n`,
            redactions: [{
                location: 'source-materials/input.md:1',
                reason: 'Fixture credential must not be archived.',
                replacement
            }]
        });
        await generateChange(root);
        await checkChange(root, { strict: true });
    });

    await t.test('unlisted redaction', async () => {
        const { root } = await createV11Fixture({ materialText: '[REDACTED: missing manifest entry]\n' });
        await assert.rejects(() => generateChange(root), /unlisted redaction/);
    });
});

test('check detects a stale generated dossier', async () => {
    const root = await createFixture();
    await generateChange(root);
    await writeFile(join(root, 'completion/dossier.md'), '# stale\n');
    await assert.rejects(() => checkChange(root), /dossier\.md is stale/);
});

test('check rejects a semantically equal but non-deterministic manifest rewrite', async () => {
    const { root } = await createV11Fixture();
    await generateChange(root);
    const manifestPath = join(root, 'completion/manifest.json');
    const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(manifestPath, `${JSON.stringify(manifest)}\n`);
    await assert.rejects(() => checkChange(root), /manifest\.json is stale/);
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

test('task plan revision must match its embedded effective plan', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, task.replace('plan_revision: 1', 'plan_revision: 2'));
    await assert.rejects(() => generateChange(root), /plan_revision does not match the embedded effective plan/);
});

test('a link cannot replace the complete effective plan in a Task Record', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, task.replace(PLAN_BODY, 'See ../plan.md.\n'));
    await assert.rejects(() => generateChange(root), /Complete Effective Task Plan: missing YAML front matter/);
});

test('empty action or reply summaries are rejected', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, task.replace('## Agent Reply Summary\n\nReported the result.\n', '## Agent Reply Summary\n\n'));
    await assert.rejects(() => generateChange(root), /empty "## Agent Reply Summary"/);
});

test('execution method and authority are required in every Task Record', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    const withoutAuthority = task.replace(
        /## Execution Method and Authority\n\n[\s\S]*?\n\n(?=## Complete User Request)/,
        ''
    );
    await writeFile(taskPath, withoutAuthority);
    await assert.rejects(() => generateChange(root), /missing "## Execution Method and Authority"/);
});

test('an implementation author cannot be labeled as a distinct non-author reviewer', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, task.replace('review_relationship: author-self-review', 'review_relationship: distinct-non-author'));
    await assert.rejects(() => generateChange(root), /distinct-non-author review requires a different reviewer_id/);
});

test('enforced-control claims require control evidence', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    await writeFile(taskPath, task.replace('instruction_authority: task-local', 'instruction_authority: enforced-control'));
    await assert.rejects(() => generateChange(root), /enforced-control requires control_evidence/);
});

test('repository-policy claims require a repository normative source', async () => {
    const root = await createFixture();
    const taskPath = join(root, 'completion/task-records/MF-42-T01.md');
    const task = await readFile(taskPath, 'utf8');
    const unsupported = task
        .replace('instruction_authority: task-local', 'instruction_authority: repository-policy')
        .replace('authority_source: fixture Task Plan', 'authority_source: docs/missing-policy.md');
    await writeFile(taskPath, unsupported);
    await assert.rejects(() => generateChange(root), /repository-policy requires an existing repository-relative authority_source/);
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
        'docs/metaflow-change-lifecycle-v1.0-complete-plan.md',
        'aave-liquid-glass-lab/storybook/package.json',
        'metaflow-viewer/src/index.ts'
    ], registry);
    assert.deepEqual(Object.keys(result).sort(), ['design', 'platform', 'viewer']);
    assert.deepEqual(result.design, ['aave-liquid-glass-lab/storybook/package.json']);
    assert.deepEqual(result.platform, [
        'docs/changes/42-fixture/plan.md',
        'docs/metaflow-change-lifecycle-v1.0-complete-plan.md'
    ]);
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
