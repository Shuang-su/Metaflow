#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { access, lstat, mkdir, readFile, readdir, realpath, writeFile } from 'node:fs/promises';
import { constants as fsConstants, existsSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const CHANGE_STATES = new Set([
    'observed',
    'proposed',
    'accepted',
    'specified',
    'planned',
    'implementing',
    'verifying',
    'ready-for-release',
    'released',
    'observing',
    'closing',
    'closed',
    'rejected',
    'parked',
    'superseded',
    'rolled-back'
]);

export const TERMINAL_CHANGE_STATES = new Set([
    'closed',
    'rejected',
    'parked',
    'superseded',
    'rolled-back'
]);

export const TASK_STATES = new Set([
    'complete',
    'partial',
    'blocked',
    'failed',
    'cancelled'
]);

const CHANGE_ID_PATTERN = /^MF-(?:[1-9][0-9]*|T0-[0-9]{8}-[a-z0-9]+(?:-[a-z0-9]+)*)$/;
const TASK_ID_PATTERN = /^MF-(?:[1-9][0-9]*|T0-[0-9]{8}-[a-z0-9]+(?:-[a-z0-9]+)*)-T([0-9]{2})$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const REQUIRED_COMPONENTS = new Set(['viewer', 'editor', 'design', 'data', 'platform', 'reference']);
const EXECUTION_TOPOLOGIES = new Set(['single-agent', 'multiple-independent-tasks', 'subagent', 'external-tool']);
const ADOPTION_LEVELS = new Set(['reference', 'task-local', 'repository-policy', 'enforced-control']);
const REVIEW_RELATIONSHIPS = new Set(['author-self-review', 'distinct-non-author', 'not-performed']);
const SECRET_PATTERNS = [
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
    ['OpenAI-style secret', /\bsk-[A-Za-z0-9_-]{20,}\b/g],
    ['Supabase secret', /\bsb_secret_[A-Za-z0-9_-]{16,}\b/g],
    ['Private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g]
];
const UNEXPECTED_SOURCE_SEGMENTS = new Set([
    '.DS_Store',
    '.cache',
    '.git',
    'build',
    'coverage',
    'dist',
    'node_modules'
]);

const REQUIRED_TASK_HEADINGS = [
    '## Authorized Scope',
    '## Execution Method and Authority',
    '## Complete User Request',
    '## Complete Effective Task Plan',
    '## Chronological Action Summary',
    '## Agent Reply Summary',
    '## Files and External Effects',
    '## Validation',
    '## Failures, Retries, and Skipped Checks',
    '## Plan Deviations and Approval',
    '## Remaining Work and Continuation Conditions',
    '## Final Delivery'
];

const REQUIRED_CLOSURE_HEADINGS = [
    '## Closure Decision',
    '## Task Disposition',
    '## Plan Amendments and Deviations',
    '## Implementation and External Effects',
    '## Verification and Review',
    '## Release, Rollback and Observation',
    '## Remaining Risks and Follow-up Changes',
    '## Ledger, Version, PR, and Release Links',
    '## Redactions',
    '## Final Response Delivery'
];

const PLACEHOLDER_PATTERNS = [
    [/\b(?:TODO|TBD|FIXME)\b/i, 'TODO/TBD/FIXME'],
    [/\bMF-000(?:-T[0-9]{2})?\b/, 'template Change or Task ID'],
    [/\bYYYY-MM-DD(?:THH:MM:SSZ)?\b/, 'template date'],
    [/<sha256>/i, 'template checksum']
];

function assertion(condition, message) {
    if (!condition) throw new Error(message);
}

function assertExactKeys(value, allowedKeys, source) {
    assertion(value && typeof value === 'object' && !Array.isArray(value), `${source}: expected an object`);
    const unexpected = Object.keys(value).filter((key) => !allowedKeys.includes(key));
    assertion(unexpected.length === 0, `${source}: unexpected field(s): ${unexpected.join(', ')}`);
}

function normalizeText(text) {
    return text.replace(/\r\n/g, '\n').replace(/\s*$/, '') + '\n';
}

export function sha256(content) {
    return createHash('sha256').update(content).digest('hex');
}

function parseScalar(value) {
    const trimmed = value.trim();
    if (trimmed === 'null' || trimmed === '~') return null;
    if (trimmed === 'true') return true;
    if (trimmed === 'false') return false;
    if (/^-?[0-9]+$/.test(trimmed)) return Number(trimmed);
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

export function parseFrontMatter(text, source = 'document') {
    const normalized = text.replace(/\r\n/g, '\n');
    assertion(normalized.startsWith('---\n'), `${source}: missing YAML front matter`);
    const end = normalized.indexOf('\n---\n', 4);
    assertion(end >= 0, `${source}: unclosed YAML front matter`);

    const header = normalized.slice(4, end);
    const data = {};
    const lines = header.split('\n');
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index];
        if (!line.trim()) continue;
        const match = line.match(/^([A-Za-z0-9_]+):(?:\s*(.*))?$/);
        assertion(match, `${source}: unsupported front-matter line "${line}"`);
        const [, key, rawValue = ''] = match;
        if (rawValue.trim() === '') {
            const values = [];
            while (index + 1 < lines.length) {
                const item = lines[index + 1].match(/^\s{2}-\s+(.+)$/);
                if (!item) break;
                values.push(parseScalar(item[1]));
                index += 1;
            }
            data[key] = values;
        } else {
            data[key] = parseScalar(rawValue);
        }
    }
    return { data, body: normalized.slice(end + 5) };
}

function markdownSection(text, heading) {
    const normalized = text.replace(/\r\n/g, '\n');
    const escaped = heading.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
    const match = new RegExp(`^## ${escaped}[ \\t]*$`, 'm').exec(normalized);
    if (!match) return '';
    const contentStart = match.index + match[0].length;
    const remainder = normalized.slice(contentStart).replace(/^\n/, '');
    const nextHeading = /^## /m.exec(remainder);
    return remainder.slice(0, nextHeading?.index ?? remainder.length).trim();
}

function taskSection(text, heading, nextHeading, source) {
    const normalized = text.replace(/\r\n/g, '\n');
    const startPattern = new RegExp(`^## ${heading.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm');
    const start = startPattern.exec(normalized);
    assertion(start, `${source}: missing "## ${heading}"`);
    const contentStart = start.index + start[0].length;
    const remainder = normalized.slice(contentStart).replace(/^\n/, '');
    const nextPattern = new RegExp(`^## ${nextHeading.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm');
    const next = nextPattern.exec(remainder);
    assertion(next, `${source}: missing "## ${nextHeading}" after "## ${heading}"`);
    return remainder.slice(0, next.index).trim();
}

function extractTaskDocument(text, heading, nextHeading, source) {
    const normalized = text.replace(/\r\n/g, '\n');
    const startPattern = new RegExp(`^## ${heading.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm');
    const start = startPattern.exec(normalized);
    assertion(start, `${source}: missing "## ${heading}"`);
    const remainder = normalized.slice(start.index + start[0].length).replace(/^\n/, '');
    const nextPattern = new RegExp(`^## ${nextHeading.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&')}[ \\t]*$`, 'm');
    const next = nextPattern.exec(remainder);
    assertion(next, `${source}: missing "## ${nextHeading}" after "## ${heading}"`);

    const opening = /(?:^|\n)(`{3,})markdown[ \\t]*\n/.exec(remainder);
    if (!opening || opening.index > next.index) return normalizeText(remainder.slice(0, next.index).trim());

    const fence = opening[1];
    const documentStart = opening.index + opening[0].length;
    const closingPattern = new RegExp(`^${fence}[ \\t]*$`, 'm');
    const closing = closingPattern.exec(remainder.slice(documentStart));
    assertion(closing, `${source}: unterminated fenced Markdown in "## ${heading}"`);
    const closingEnd = documentStart + closing.index + closing[0].length;
    const outerNext = nextPattern.exec(remainder.slice(closingEnd));
    assertion(outerNext, `${source}: missing outer "## ${nextHeading}" after fenced Markdown`);
    return normalizeText(remainder.slice(documentStart, documentStart + closing.index));
}

function validateRequestTranscript(
    text,
    source,
    expectedChangeId,
    expectedTaskId = null,
    { validateMarkers = true } = {}
) {
    const parsed = parseFrontMatter(text, source);
    assertion(parsed.data.change_id === expectedChangeId, `${source}: change_id mismatch`);
    if (expectedTaskId !== null) {
        assertion(
            parsed.data.task_id === undefined || parsed.data.task_id === expectedTaskId,
            `${source}: task_id does not match ${expectedTaskId}`
        );
    }
    assertion(
        Number.isInteger(parsed.data.message_count) && parsed.data.message_count >= 1,
        `${source}: invalid message_count`
    );
    assertion(
        Number.isInteger(parsed.data.redactions) && parsed.data.redactions >= 0,
        `${source}: invalid redactions count`
    );
    if (validateMarkers) {
        const messageNumbers = [...text.matchAll(/<!-- user-message:([0-9]+) -->/g)]
            .map((match) => Number(match[1]));
        const expectedNumbers = Array.from({ length: parsed.data.message_count }, (_, index) => index + 1);
        assertion(
            JSON.stringify(messageNumbers) === JSON.stringify(expectedNumbers),
            `${source}: user-message markers must be contiguous and ordered from 1 to ${parsed.data.message_count}`
        );
        const closingMarkers = (text.match(/<!-- \/user-message -->/g) || []).length;
        assertion(
            closingMarkers === parsed.data.message_count,
            `${source}: expected ${parsed.data.message_count} closing user-message markers, found ${closingMarkers}`
        );
    }
    assertion(text.includes('# Complete User Request Transcript'), `${source}: missing transcript heading`);
    return {
        data: parsed.data,
        text,
        messageCount: parsed.data.message_count,
        sha256: sha256(text)
    };
}

function assertHeadings(text, headings, source) {
    for (const heading of headings) {
        assertion(text.includes(`${heading}\n`) || text.endsWith(heading), `${source}: missing "${heading}"`);
        const content = markdownSection(text, heading.replace(/^## /, ''));
        assertion(content.length > 0, `${source}: empty "${heading}"`);
    }
}

function assertNoPlaceholders(text, source) {
    for (const [pattern, label] of PLACEHOLDER_PATTERNS) {
        assertion(!pattern.test(text), `${source}: unresolved ${label}`);
    }
}

async function exists(path) {
    try {
        await access(path, fsConstants.F_OK);
        return true;
    } catch {
        return false;
    }
}

async function readNormalized(path) {
    const raw = await readFile(path, 'utf8');
    const normalized = normalizeText(raw);
    assertion(
        raw === normalized,
        `${relativePosix(REPO_ROOT, path)}: source must use LF and exactly one terminal newline`
    );
    return normalized;
}

async function writeNormalized(path, content) {
    const normalized = normalizeText(content);
    await mkdir(dirname(path), { recursive: true });
    if (await exists(path)) {
        const current = await readFile(path, 'utf8');
        if (current === normalized) return false;
    }
    await writeFile(path, normalized, 'utf8');
    return true;
}

async function writeJson(path, value) {
    return writeNormalized(path, JSON.stringify(value, null, 2));
}

function relativePosix(from, to) {
    return relative(from, to).split(sep).join('/');
}

function stripFrontMatter(text, source) {
    return parseFrontMatter(text, source).body.trim();
}

function validateChangeId(value, source) {
    assertion(typeof value === 'string' && CHANGE_ID_PATTERN.test(value), `${source}: invalid change_id "${value}"`);
}

function validateCommonFrontMatter(data, source) {
    validateChangeId(data.change_id, source);
    assertion(typeof data.title === 'string' && data.title.length > 0, `${source}: missing title`);
    assertion(CHANGE_STATES.has(data.status), `${source}: invalid status "${data.status}"`);
    assertion(['T0', 'T1', 'T2', 'T3'].includes(data.risk), `${source}: invalid risk "${data.risk}"`);
    assertion(Array.isArray(data.component) && data.component.length > 0, `${source}: component must be a non-empty list`);
    for (const component of data.component) {
        assertion(REQUIRED_COMPONENTS.has(component), `${source}: unknown component "${component}"`);
    }
    assertion(Number.isInteger(data.plan_revision) && data.plan_revision >= 1, `${source}: plan_revision must be >= 1`);
}

function scanSecrets(text, source) {
    const findings = [];
    const scrubbed = text.replace(/\[REDACTED: [^\]]+\]/g, '');
    for (const [label, pattern] of SECRET_PATTERNS) {
        pattern.lastIndex = 0;
        if (pattern.test(scrubbed)) findings.push(`${source}: possible ${label}`);
    }
    return findings;
}

function globToRegExp(pattern) {
    let result = '^';
    for (let index = 0; index < pattern.length; index += 1) {
        const char = pattern[index];
        const next = pattern[index + 1];
        if (char === '*' && next === '*') {
            result += '.*';
            index += 1;
        } else if (char === '*') {
            result += '[^/]*';
        } else if (char === '?') {
            result += '[^/]';
        } else {
            result += char.replace(/[.*+?^$\{\}()|[\]\\]/g, '\\$&');
        }
    }
    return new RegExp(`${result}$`);
}

export async function loadComponentRegistry(root = REPO_ROOT) {
    const path = join(root, 'metadata/components.json');
    const registry = JSON.parse(await readFile(path, 'utf8'));
    assertion(registry.schemaVersion === '1.0', 'metadata/components.json: unsupported schemaVersion');
    assertion(Array.isArray(registry.components), 'metadata/components.json: components must be an array');
    const seen = new Set();
    for (const component of registry.components) {
        assertion(REQUIRED_COMPONENTS.has(component.id), `metadata/components.json: invalid id "${component.id}"`);
        assertion(!seen.has(component.id), `metadata/components.json: duplicate id "${component.id}"`);
        seen.add(component.id);
        assertion(Array.isArray(component.ownedPaths) && component.ownedPaths.length > 0, `${component.id}: ownedPaths must be non-empty`);
        assertion(Array.isArray(component.checks) && component.checks.length > 0, `${component.id}: checks must be non-empty`);
    }
    for (const required of REQUIRED_COMPONENTS) {
        assertion(seen.has(required), `metadata/components.json: missing component "${required}"`);
    }
    return registry;
}

export function classifyPaths(paths, registry) {
    const result = {};
    for (const component of registry.components) {
        const matchers = component.ownedPaths.map(globToRegExp);
        const matchedPaths = paths.filter((path) => matchers.some((matcher) => matcher.test(path)));
        if (matchedPaths.length > 0) result[component.id] = matchedPaths;
    }
    return result;
}

function gitChangedPaths(root, base) {
    const args = base
        ? ['diff', '--name-only', '--diff-filter=ACMR', `${base}...HEAD`]
        : ['diff', '--name-only', '--diff-filter=ACMR', 'HEAD'];
    const output = execFileSync('git', args, { cwd: root, encoding: 'utf8' });
    return output.split('\n').map((value) => value.trim()).filter(Boolean);
}

async function listMarkdownFiles(directory) {
    if (!(await exists(directory))) return [];
    return (await readdir(directory))
        .filter((name) => name.endsWith('.md'))
        .sort()
        .map((name) => join(directory, name));
}

function validateTaskRecord(text, source, expectedChangeId) {
    const { data } = parseFrontMatter(text, source);
    assertion(TASK_ID_PATTERN.test(data.task_id), `${source}: invalid task_id "${data.task_id}"`);
    assertion(data.change_id === expectedChangeId, `${source}: change_id does not match ${expectedChangeId}`);
    assertion(data.task_id.startsWith(`${expectedChangeId}-T`), `${source}: task_id does not belong to ${expectedChangeId}`);
    assertion(typeof data.tool === 'string' && data.tool.length > 0, `${source}: missing tool`);
    assertion(
        data.source_task_id === null || (typeof data.source_task_id === 'string' && data.source_task_id.length > 0),
        `${source}: invalid source_task_id`
    );
    assertion(TASK_STATES.has(data.status), `${source}: invalid task status "${data.status}"`);
    assertion(typeof data.started === 'string' && !Number.isNaN(Date.parse(data.started)), `${source}: invalid started time`);
    assertion(typeof data.completed === 'string' && !Number.isNaN(Date.parse(data.completed)), `${source}: invalid completed time`);
    assertion(Date.parse(data.completed) >= Date.parse(data.started), `${source}: completed precedes started`);
    assertion(data.branch === null || (typeof data.branch === 'string' && data.branch.length > 0), `${source}: invalid branch`);
    for (const field of ['head_before', 'head_after']) {
        assertion(data[field] === null || (typeof data[field] === 'string' && data[field].length > 0), `${source}: invalid ${field}`);
    }
    assertion(Number.isInteger(data.plan_revision) && data.plan_revision >= 1, `${source}: invalid plan_revision`);
    if (data.plan_sha256 !== null) {
        assertion(SHA256_PATTERN.test(data.plan_sha256), `${source}: invalid plan_sha256`);
    }
    assertion(EXECUTION_TOPOLOGIES.has(data.execution_topology), `${source}: invalid execution_topology`);
    assertion(ADOPTION_LEVELS.has(data.instruction_authority), `${source}: invalid instruction_authority`);
    assertion(typeof data.authority_source === 'string' && data.authority_source.length > 0, `${source}: missing authority_source`);
    assertion(typeof data.implementer_id === 'string' && data.implementer_id.length > 0, `${source}: missing implementer_id`);
    assertion(REVIEW_RELATIONSHIPS.has(data.review_relationship), `${source}: invalid review_relationship`);
    assertion(
        data.reviewer_id === null || (typeof data.reviewer_id === 'string' && data.reviewer_id.length > 0),
        `${source}: invalid reviewer_id`
    );
    assertion(
        data.control_evidence === null || (typeof data.control_evidence === 'string' && data.control_evidence.length > 0),
        `${source}: invalid control_evidence`
    );
    if (data.review_relationship === 'author-self-review') {
        assertion(data.reviewer_id === data.implementer_id, `${source}: author-self-review must identify the implementer as reviewer`);
    } else if (data.review_relationship === 'distinct-non-author') {
        assertion(data.reviewer_id !== null && data.reviewer_id !== data.implementer_id, `${source}: distinct-non-author review requires a different reviewer_id`);
    } else {
        assertion(data.reviewer_id === null, `${source}: not-performed review must use reviewer_id: null`);
    }
    if (data.instruction_authority === 'enforced-control') {
        assertion(data.control_evidence !== null, `${source}: enforced-control requires control_evidence`);
    }
    if (data.instruction_authority === 'repository-policy') {
        const authorityPath = resolve(REPO_ROOT, data.authority_source);
        assertion(
            !isAbsolute(data.authority_source) && !relative(REPO_ROOT, authorityPath).startsWith(`..${sep}`) && existsSync(authorityPath),
            `${source}: repository-policy requires an existing repository-relative authority_source`
        );
    }
    assertHeadings(text, REQUIRED_TASK_HEADINGS, source);
    const executionRecord = text.slice(text.indexOf('## Chronological Action Summary'));
    assertNoPlaceholders(executionRecord, source);

    const requestText = extractTaskDocument(
        text,
        'Complete User Request',
        'Complete Effective Task Plan',
        source
    );
    const request = validateRequestTranscript(
        requestText,
        `${source}: Complete User Request`,
        expectedChangeId,
        data.task_id
    );
    const planText = extractTaskDocument(
        text,
        'Complete Effective Task Plan',
        'Chronological Action Summary',
        source
    );
    const plan = parseFrontMatter(planText, `${source}: Complete Effective Task Plan`);
    validateCommonFrontMatter(plan.data, `${source}: Complete Effective Task Plan`);
    assertion(plan.data.change_id === expectedChangeId, `${source}: embedded plan change_id mismatch`);
    assertion(
        data.plan_revision === plan.data.plan_revision,
        `${source}: plan_revision does not match the embedded effective plan`
    );
    const embeddedPlanHash = sha256(planText);
    if (data.plan_sha256 !== null) {
        assertion(
            data.plan_sha256 === embeddedPlanHash,
            `${source}: plan_sha256 does not match the embedded effective plan`
        );
    }

    return {
        data,
        request,
        plan: {
            data: plan.data,
            text: planText,
            revision: plan.data.plan_revision,
            sha256: embeddedPlanHash
        },
        sections: {
            actions: taskSection(text, 'Chronological Action Summary', 'Agent Reply Summary', source),
            replies: taskSection(text, 'Agent Reply Summary', 'Files and External Effects', source),
            effects: taskSection(text, 'Files and External Effects', 'Validation', source),
            validation: taskSection(text, 'Validation', 'Failures, Retries, and Skipped Checks', source),
            failures: taskSection(
                text,
                'Failures, Retries, and Skipped Checks',
                'Plan Deviations and Approval',
                source
            )
        }
    };
}

function taskSequence(taskId) {
    return Number(taskId.match(TASK_ID_PATTERN)?.[1] ?? -1);
}

function buildInventory(tasks) {
    const lines = [
        '| Task ID | Tool | Status | Record |',
        '| --- | --- | --- | --- |'
    ];
    for (const task of tasks) {
        lines.push(`| ${task.data.task_id} | ${task.data.tool} | ${task.data.status} | ${task.relativePath} |`);
    }
    return lines.join('\n');
}

function checksumTable(sourceFiles) {
    const lines = [
        '| Source | SHA-256 |',
        '| --- | --- |'
    ];
    for (const source of sourceFiles) {
        lines.push(`| ${source.path} | \`${source.sha256}\` |`);
    }
    return lines.join('\n');
}

function renderRedactions(redactions) {
    if (redactions.length === 0) return 'No redactions.';
    return redactions
        .map((item) => `- ${item.location}: ${item.replacement} — ${item.reason}`)
        .join('\n');
}

function fencedMarkdown(text) {
    const normalized = text.trim();
    const longestRun = Math.max(0, ...[...normalized.matchAll(/`+/g)].map((match) => match[0].length));
    const fence = '`'.repeat(Math.max(4, longestRun + 1));
    return `${fence}markdown\n${normalized}\n${fence}`;
}

function renderRequestTranscript(change, tasks, redactions, generatedAt) {
    const messageCount = tasks.reduce((total, task) => total + task.request.messageCount, 0);
    const taskDocuments = tasks.map((task) => `## ${task.data.task_id}

- Request SHA-256: \`${task.request.sha256}\`
- Message count: ${task.request.messageCount}

${fencedMarkdown(task.request.text)}`).join('\n\n');
    return normalizeText(`---
change_id: ${change.data.change_id}
source: task-records
generated_at: ${new Date(generatedAt).toISOString()}
message_count: ${messageCount}
redactions: ${redactions.length}
---

# Complete User Request Transcript

<!-- Generated by scripts/mcl.mjs from immutable Task Records. Do not edit directly. -->

${taskDocuments}
`);
}

function renderTaskSummarySection(tasks, key) {
    return tasks
        .map((task) => `### ${task.data.task_id}\n\n${task.sections[key]}`)
        .join('\n\n');
}

function renderAgentSummary(change, closure, tasks) {
    const validation = tasks.map((task) => `### ${task.data.task_id}

${task.sections.validation}

#### Failures, Retries, and Skipped Checks

${task.sections.failures}`).join('\n\n');
    return normalizeText(`---
change_id: ${change.data.change_id}
status: ${change.data.status}
generated_at: ${new Date(closure.data.generated_at).toISOString()}
---

# Agent Actions and Replies Summary

<!-- Generated by scripts/mcl.mjs from immutable Task Records. Do not edit directly. -->

## Task Inventory

${buildInventory(tasks)}

## Chronological Action Summary

${renderTaskSummarySection(tasks, 'actions')}

## Agent Reply Summary

${renderTaskSummarySection(tasks, 'replies')}

## Files and External Effects

${renderTaskSummarySection(tasks, 'effects')}

## Validation, Failures, and Omissions

${validation}
`);
}

async function loadPlanRevisionIndex(path, change, tasks, planHash) {
    const source = relativePosix(REPO_ROOT, path);
    const text = await readNormalized(path);
    const document = JSON.parse(text);
    assertExactKeys(document, ['schemaVersion', 'revisions'], source);
    assertion(document.schemaVersion === '1.0', `${source}: unsupported schemaVersion`);
    assertion(Array.isArray(document.revisions), `${source}: revisions must be an array`);
    const seenRevisions = new Set();
    const seenTasks = new Set();
    const revisions = document.revisions.map((entry) => {
        assertExactKeys(
            entry,
            ['revision', 'sha256', 'taskIds', 'amendmentReason', 'approvalSource'],
            `${source}: revision entry`
        );
        assertion(
            Number.isInteger(entry.revision) && entry.revision >= 1,
            `${source}: invalid revision "${entry.revision}"`
        );
        assertion(!seenRevisions.has(entry.revision), `${source}: duplicate revision ${entry.revision}`);
        seenRevisions.add(entry.revision);
        assertion(SHA256_PATTERN.test(entry.sha256), `${source}: revision ${entry.revision} has invalid sha256`);
        assertion(Array.isArray(entry.taskIds), `${source}: revision ${entry.revision} taskIds must be an array`);
        assertion(
            typeof entry.amendmentReason === 'string' && entry.amendmentReason.trim().length > 0,
            `${source}: revision ${entry.revision} requires amendmentReason`
        );
        assertion(
            typeof entry.approvalSource === 'string' && entry.approvalSource.trim().length > 0,
            `${source}: revision ${entry.revision} requires approvalSource`
        );
        const localTasks = new Set();
        for (const taskId of entry.taskIds) {
            assertion(TASK_ID_PATTERN.test(taskId), `${source}: invalid task ID "${taskId}"`);
            assertion(!localTasks.has(taskId), `${source}: duplicate task ID ${taskId} in revision ${entry.revision}`);
            assertion(!seenTasks.has(taskId), `${source}: task ID ${taskId} appears in multiple revisions`);
            localTasks.add(taskId);
            seenTasks.add(taskId);
        }
        return {
            revision: entry.revision,
            sha256: entry.sha256,
            taskIds: [...entry.taskIds],
            amendmentReason: entry.amendmentReason,
            approvalSource: entry.approvalSource
        };
    }).sort((a, b) => a.revision - b.revision);

    const expectedRevisions = Array.from(
        { length: change.data.plan_revision },
        (_, index) => index + 1
    );
    assertion(
        JSON.stringify(revisions.map((entry) => entry.revision)) === JSON.stringify(expectedRevisions),
        `${source}: revisions must be contiguous from 1 to ${change.data.plan_revision}`
    );
    const currentRevision = revisions.at(-1);
    assertion(
        currentRevision.sha256 === planHash,
        `${source}: current revision sha256 does not match plan.md`
    );

    const taskById = new Map(tasks.map((task) => [task.data.task_id, task]));
    for (const taskId of seenTasks) {
        assertion(taskById.has(taskId), `${source}: unknown task ID ${taskId}`);
    }
    for (const task of tasks) {
        assertion(seenTasks.has(task.data.task_id), `${source}: missing ${task.data.task_id} from revision taskIds`);
        assertion(task.data.plan_sha256 !== null, `${task.path}: Manifest 1.1 requires plan_sha256`);
        const revision = revisions.find((entry) => entry.revision === task.plan.revision);
        assertion(revision, `${source}: missing revision ${task.plan.revision} for ${task.data.task_id}`);
        assertion(revision.taskIds.includes(task.data.task_id), `${source}: ${task.data.task_id} is assigned to the wrong revision`);
        assertion(
            revision.sha256 === task.plan.sha256,
            `${source}: revision ${revision.revision} sha256 does not match ${task.data.task_id}`
        );
    }
    return { text, revisions };
}

function isPathInside(parent, candidate) {
    const rel = relative(parent, candidate);
    return rel !== '' && !rel.startsWith(`..${sep}`) && rel !== '..' && !isAbsolute(rel);
}

async function listFilesRecursively(directory, base = directory) {
    if (!(await exists(directory))) return [];
    const files = [];
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
        const absolute = join(directory, entry.name);
        assertion(!entry.isSymbolicLink(), `${relativePosix(REPO_ROOT, absolute)}: symbolic links are not allowed`);
        if (entry.isDirectory()) {
            files.push(...await listFilesRecursively(absolute, base));
        } else if (entry.isFile()) {
            files.push(relativePosix(base, absolute));
        }
    }
    return files.sort();
}

function validateRedactionsInText(text, path, redactions) {
    const targeted = redactions.filter((item) => item.location === path || item.location.startsWith(`${path}:`));
    for (const item of targeted) {
        assertion(text.includes(item.replacement), `${path}: redaction manifest entry is not present in the source`);
    }
    const replacements = [...text.matchAll(/\[REDACTED: [^\]]+\]/g)].map((match) => match[0]);
    for (const replacement of replacements) {
        assertion(
            targeted.some((item) => item.replacement === replacement),
            `${path}: unlisted redaction ${replacement}`
        );
    }
}

async function loadSourceMaterials(paths, completionDir, redactions) {
    const indexExists = await exists(paths.sourceMaterialsIndex);
    const actualFiles = await listFilesRecursively(paths.sourceMaterials);
    if (!indexExists) {
        assertion(actualFiles.length === 0, `${relativePosix(REPO_ROOT, paths.sourceMaterials)}: source materials are unlisted`);
        return { indexText: null, materials: [] };
    }

    const indexSource = relativePosix(REPO_ROOT, paths.sourceMaterialsIndex);
    const indexText = await readNormalized(paths.sourceMaterialsIndex);
    const document = JSON.parse(indexText);
    assertExactKeys(document, ['schemaVersion', 'materials'], indexSource);
    assertion(document.schemaVersion === '1.0', `${indexSource}: unsupported schemaVersion`);
    assertion(Array.isArray(document.materials), `${indexSource}: materials must be an array`);
    const seenPaths = new Set();
    const sourceRoot = resolve(paths.sourceMaterials);
    const sourceRootReal = await realpath(sourceRoot).catch(() => sourceRoot);
    const materials = [];
    for (const entry of document.materials) {
        assertExactKeys(
            entry,
            ['path', 'sha256', 'kind', 'provenance', 'nonNormative'],
            `${indexSource}: material entry`
        );
        assertion(typeof entry.path === 'string' && entry.path.length > 0, `${indexSource}: material path is required`);
        assertion(!entry.path.includes('\\'), `${indexSource}: material paths must use POSIX separators`);
        assertion(!isAbsolute(entry.path), `${indexSource}: absolute material path is not allowed`);
        assertion(entry.path.startsWith('source-materials/'), `${indexSource}: material path must start with source-materials/`);
        assertion(
            !entry.path.split('/').some((segment) => UNEXPECTED_SOURCE_SEGMENTS.has(segment)),
            `${indexSource}: unexpected cache or build artifact ${entry.path}`
        );
        const absolute = resolve(completionDir, ...entry.path.split('/'));
        assertion(isPathInside(sourceRoot, absolute), `${indexSource}: material path escapes source-materials: ${entry.path}`);
        assertion(!seenPaths.has(entry.path), `${indexSource}: duplicate material path ${entry.path}`);
        seenPaths.add(entry.path);
        assertion(SHA256_PATTERN.test(entry.sha256), `${indexSource}: ${entry.path} has invalid sha256`);
        assertion(typeof entry.kind === 'string' && entry.kind.length > 0, `${indexSource}: ${entry.path} requires kind`);
        assertion(
            typeof entry.provenance === 'string' && entry.provenance.length > 0,
            `${indexSource}: ${entry.path} requires provenance`
        );
        assertion(typeof entry.nonNormative === 'boolean', `${indexSource}: ${entry.path} requires nonNormative`);
        assertion(await exists(absolute), `${indexSource}: missing source material ${entry.path}`);
        const info = await lstat(absolute);
        assertion(info.isFile() && !info.isSymbolicLink(), `${indexSource}: source material must be a regular file: ${entry.path}`);
        const actualReal = await realpath(absolute);
        assertion(isPathInside(sourceRootReal, actualReal), `${indexSource}: material resolves outside source-materials: ${entry.path}`);
        const bytes = await readFile(absolute);
        const actualHash = sha256(bytes);
        assertion(actualHash === entry.sha256, `${indexSource}: checksum mismatch for ${entry.path}`);
        let sourceText;
        try {
            sourceText = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        } catch {
            throw new Error(`${indexSource}: ${entry.path} must be UTF-8 text for secret scanning`);
        }
        const findings = scanSecrets(sourceText, entry.path);
        assertion(findings.length === 0, findings.join('\n'));
        validateRedactionsInText(sourceText, entry.path, redactions);
        materials.push({
            path: entry.path,
            sha256: entry.sha256,
            kind: entry.kind,
            provenance: entry.provenance,
            nonNormative: entry.nonNormative,
            text: sourceText
        });
    }

    const listedFiles = [...seenPaths]
        .map((path) => path.slice('source-materials/'.length))
        .sort();
    assertion(
        JSON.stringify(listedFiles) === JSON.stringify(actualFiles),
        `${indexSource}: source-materials directory contains missing or unlisted files`
    );
    materials.sort((a, b) => a.path.localeCompare(b.path));
    return { indexText, materials };
}

function renderDossier({
    change,
    request,
    summary,
    approvedPlan,
    evidence,
    closure,
    tasks,
    sourceFiles,
    redactions
}) {
    const closureBody = parseFrontMatter(closure.text, closure.path).body;
    const metadata = [
        `- Change ID: ${change.data.change_id}`,
        `- Title: ${change.data.title}`,
        `- Risk: ${change.data.risk}`,
        `- Components: ${change.data.component.join(', ')}`,
        `- Lifecycle state: ${closure.data.terminal_state}`,
        `- Owner: ${change.data.owner}`,
        `- Issue: ${change.data.issue}`
    ].join('\n');

    return normalizeText(`# Change Completion Dossier

<!-- Generated by scripts/mcl.mjs. Do not edit directly. -->

## 1. Change Metadata

${metadata}

## 2. Complete User Request Transcript

${fencedMarkdown(stripFrontMatter(request.text, request.path))}

## 3. Agent Task Inventory

${buildInventory(tasks)}

## 4. Agent Actions and Replies Summary

${fencedMarkdown(stripFrontMatter(summary.text, summary.path))}

## 5. Complete Effective Plan

${fencedMarkdown(approvedPlan.text)}

## 6. Plan Amendments and Deviations

${markdownSection(closureBody, 'Plan Amendments and Deviations') || 'None.'}

## 7. Implementation and External Effects

${markdownSection(closureBody, 'Implementation and External Effects') || 'None.'}

## 8. Verification and Review Evidence

${fencedMarkdown(stripFrontMatter(evidence.text, evidence.path))}

## 9. Release, Rollback and Observation

${markdownSection(closureBody, 'Release, Rollback and Observation') || 'Not applicable.'}

## 10. Remaining Risks and Follow-up Changes

${markdownSection(closureBody, 'Remaining Risks and Follow-up Changes') || 'None.'}

## 11. Ledger, Version, PR, and Release Links

${markdownSection(closureBody, 'Ledger, Version, PR, and Release Links') || 'None.'}

## 12. Checksums and Redaction Manifest

${checksumTable(sourceFiles)}

${renderRedactions(redactions)}

## 13. Closure Decision

${markdownSection(closureBody, 'Closure Decision') || 'Not yet closed.'}
`);
}

async function loadChange(changeDirectory, { requireGenerated = false } = {}) {
    const changeDir = isAbsolute(changeDirectory)
        ? resolve(changeDirectory)
        : resolve(REPO_ROOT, changeDirectory);
    const completionDir = join(changeDir, 'completion');
    const paths = {
        proposal: join(changeDir, 'proposal.md'),
        spec: join(changeDir, 'spec.md'),
        plan: join(changeDir, 'plan.md'),
        evidence: join(changeDir, 'evidence.md'),
        request: join(completionDir, 'request-transcript.md'),
        approvedPlan: join(completionDir, 'approved-plan.md'),
        summary: join(completionDir, 'agent-action-reply-summary.md'),
        closure: join(completionDir, 'closure.md'),
        redactions: join(completionDir, 'redactions.json'),
        planRevisions: join(completionDir, 'plan-revisions.json'),
        sourceMaterialsIndex: join(completionDir, 'source-materials.json'),
        sourceMaterials: join(completionDir, 'source-materials'),
        dossier: join(completionDir, 'dossier.md'),
        manifest: join(completionDir, 'manifest.json'),
        tasks: join(completionDir, 'task-records')
    };

    for (const name of ['plan', 'evidence', 'closure', 'redactions']) {
        assertion(await exists(paths[name]), `${relativePosix(REPO_ROOT, paths[name])}: missing required source`);
    }
    const manifestVersion = await exists(paths.planRevisions) ? '1.1' : '1.0';
    if (manifestVersion === '1.0') {
        for (const name of ['request', 'summary']) {
            assertion(await exists(paths[name]), `${relativePosix(REPO_ROOT, paths[name])}: missing required source`);
        }
    }

    const planText = await readNormalized(paths.plan);
    const change = {
        ...parseFrontMatter(planText, relativePosix(REPO_ROOT, paths.plan)),
        text: planText,
        path: relativePosix(REPO_ROOT, paths.plan)
    };
    validateCommonFrontMatter(change.data, change.path);

    const artifacts = {};
    const requiredArtifacts = [];
    if (['T2', 'T3'].includes(change.data.risk)) requiredArtifacts.push('spec');
    if (change.data.risk === 'T3') requiredArtifacts.push('proposal');
    for (const name of requiredArtifacts) {
        assertion(await exists(paths[name]), `${relativePosix(REPO_ROOT, paths[name])}: ${change.data.risk} Change requires ${name}.md`);
    }
    for (const name of ['proposal', 'spec']) {
        if (!(await exists(paths[name]))) continue;
        const text = await readNormalized(paths[name]);
        const artifact = {
            ...parseFrontMatter(text, relativePosix(REPO_ROOT, paths[name])),
            text,
            path: relativePosix(REPO_ROOT, paths[name])
        };
        validateCommonFrontMatter(artifact.data, artifact.path);
        assertion(artifact.data.change_id === change.data.change_id, `${artifact.path}: change_id mismatch`);
        assertion(artifact.data.risk === change.data.risk, `${artifact.path}: risk mismatch`);
        assertion(
            JSON.stringify([...artifact.data.component].sort()) === JSON.stringify([...change.data.component].sort()),
            `${artifact.path}: component mismatch`
        );
        artifacts[name] = artifact;
    }

    let request = null;
    let summary = null;
    if (manifestVersion === '1.0') {
        const requestText = await readNormalized(paths.request);
        const validated = validateRequestTranscript(
            requestText,
            relativePosix(REPO_ROOT, paths.request),
            change.data.change_id
        );
        request = {
            ...validated,
            path: relativePosix(REPO_ROOT, paths.request)
        };

        const summaryText = await readNormalized(paths.summary);
        summary = {
            ...parseFrontMatter(summaryText, relativePosix(REPO_ROOT, paths.summary)),
            text: summaryText,
            path: relativePosix(REPO_ROOT, paths.summary)
        };
        assertion(summary.data.change_id === change.data.change_id, `${summary.path}: change_id mismatch`);
        assertHeadings(summary.text, [
            '## Task Inventory',
            '## Chronological Action Summary',
            '## Agent Reply Summary',
            '## Files and External Effects',
            '## Validation, Failures, and Omissions'
        ], summary.path);
        assertNoPlaceholders(summary.text, summary.path);
    }

    const evidenceText = await readNormalized(paths.evidence);
    const evidence = {
        ...parseFrontMatter(evidenceText, relativePosix(REPO_ROOT, paths.evidence)),
        text: evidenceText,
        path: relativePosix(REPO_ROOT, paths.evidence)
    };
    assertion(evidence.data.change_id === change.data.change_id, `${evidence.path}: change_id mismatch`);
    validateCommonFrontMatter(evidence.data, evidence.path);
    assertion(evidence.data.risk === change.data.risk, `${evidence.path}: risk mismatch`);
    assertion(
        JSON.stringify([...evidence.data.component].sort()) === JSON.stringify([...change.data.component].sort()),
        `${evidence.path}: component mismatch`
    );
    assertNoPlaceholders(evidence.text, evidence.path);

    const closureText = await readNormalized(paths.closure);
    const closure = {
        ...parseFrontMatter(closureText, relativePosix(REPO_ROOT, paths.closure)),
        text: closureText,
        path: relativePosix(REPO_ROOT, paths.closure)
    };
    assertion(closure.data.change_id === change.data.change_id, `${closure.path}: change_id mismatch`);
    assertion(CHANGE_STATES.has(closure.data.terminal_state), `${closure.path}: invalid terminal_state "${closure.data.terminal_state}"`);
    assertion(typeof closure.data.generated_at === 'string' && !Number.isNaN(Date.parse(closure.data.generated_at)), `${closure.path}: generated_at must be an ISO date-time`);
    assertHeadings(closure.text, REQUIRED_CLOSURE_HEADINGS, closure.path);
    assertNoPlaceholders(closure.text, closure.path);
    assertion(closure.data.terminal_state === change.data.status, `${closure.path}: terminal_state must match plan status`);

    const redactions = JSON.parse(await readFile(paths.redactions, 'utf8'));
    assertion(Array.isArray(redactions), `${relativePosix(REPO_ROOT, paths.redactions)}: expected an array`);
    for (const item of redactions) {
        assertion(typeof item.location === 'string' && item.location.length > 0, 'redaction: missing location');
        assertion(typeof item.reason === 'string' && item.reason.length > 0, 'redaction: missing reason');
        assertion(/^\[REDACTED: .+\]$/.test(item.replacement), 'redaction: invalid replacement');
    }
    const taskPaths = await listMarkdownFiles(paths.tasks);
    assertion(taskPaths.length > 0, `${relativePosix(REPO_ROOT, paths.tasks)}: at least one Task Record is required`);
    const tasks = [];
    const seenTaskIds = new Set();
    for (const taskPath of taskPaths) {
        const text = await readNormalized(taskPath);
        const relativePath = relativePosix(completionDir, taskPath);
        const validated = validateTaskRecord(text, relativePosix(REPO_ROOT, taskPath), change.data.change_id);
        assertion(basename(taskPath) === `${validated.data.task_id}.md`, `${relativePosix(REPO_ROOT, taskPath)}: filename must match task_id`);
        assertion(!seenTaskIds.has(validated.data.task_id), `duplicate Task ID ${validated.data.task_id}`);
        seenTaskIds.add(validated.data.task_id);
        tasks.push({ ...validated, text, path: relativePosix(REPO_ROOT, taskPath), relativePath });
    }
    tasks.sort((a, b) => taskSequence(a.data.task_id) - taskSequence(b.data.task_id));
    tasks.forEach((task, index) => {
        assertion(taskSequence(task.data.task_id) === index + 1, `Task sequence must be contiguous from T01; found ${task.data.task_id}`);
    });
    const latestTaskCompletion = Math.max(...tasks.map((task) => Date.parse(task.data.completed)));
    assertion(
        Date.parse(closure.data.generated_at) >= latestTaskCompletion,
        `${closure.path}: generated_at precedes the latest Task completion`
    );

    const planHash = sha256(planText);
    for (const task of tasks) {
        if (task.plan.revision === change.data.plan_revision) {
            assertion(
                task.plan.sha256 === planHash,
                `${task.path}: current plan revision does not match plan.md`
            );
        }
    }

    let planRevisionIndex = null;
    if (manifestVersion === '1.1') {
        planRevisionIndex = await loadPlanRevisionIndex(paths.planRevisions, change, tasks, planHash);
        const requestText = renderRequestTranscript(change, tasks, redactions, closure.data.generated_at);
        request = {
            ...validateRequestTranscript(
                requestText,
                relativePosix(REPO_ROOT, paths.request),
                change.data.change_id,
                null,
                { validateMarkers: false }
            ),
            path: relativePosix(REPO_ROOT, paths.request)
        };
        const summaryText = renderAgentSummary(change, closure, tasks);
        summary = {
            ...parseFrontMatter(summaryText, relativePosix(REPO_ROOT, paths.summary)),
            text: summaryText,
            path: relativePosix(REPO_ROOT, paths.summary)
        };
        assertHeadings(summary.text, [
            '## Task Inventory',
            '## Chronological Action Summary',
            '## Agent Reply Summary',
            '## Files and External Effects',
            '## Validation, Failures, and Omissions'
        ], summary.path);
    }
    assertion(request.data.redactions === redactions.length, `${request.path}: redactions count mismatch`);

    const sourceMaterials = await loadSourceMaterials(paths, completionDir, redactions);

    const disposition = markdownSection(closure.text, 'Task Disposition');
    for (const task of tasks.filter((item) => item.data.status !== 'complete')) {
        assertion(disposition.includes(task.data.task_id), `${closure.path}: missing disposition for ${task.data.task_id}`);
    }

    const terminalState = closure.data.terminal_state;
    if (TERMINAL_CHANGE_STATES.has(terminalState)) {
        assertion(change.data.completion_state === 'complete', `${change.path}: terminal Change must set completion_state: complete`);
        for (const source of [evidence.text, closure.text]) {
            assertion(!/\bPending execution\b/i.test(source), 'terminal Change contains "Pending execution"');
        }
    }

    const secretFindings = [];
    for (const source of [request, summary, evidence, closure, ...tasks]) {
        secretFindings.push(...scanSecrets(source.text, source.path));
    }
    if (planRevisionIndex) {
        const revisionPath = relativePosix(completionDir, paths.planRevisions);
        secretFindings.push(...scanSecrets(planRevisionIndex.text, revisionPath));
        validateRedactionsInText(planRevisionIndex.text, revisionPath, redactions);
    }
    if (sourceMaterials.indexText) {
        const materialsPath = relativePosix(completionDir, paths.sourceMaterialsIndex);
        secretFindings.push(...scanSecrets(sourceMaterials.indexText, materialsPath));
        validateRedactionsInText(sourceMaterials.indexText, materialsPath, redactions);
    }
    assertion(secretFindings.length === 0, secretFindings.join('\n'));

    if (requireGenerated) {
        assertion(await exists(paths.approvedPlan), `${relativePosix(REPO_ROOT, paths.approvedPlan)}: missing generated file`);
        if (manifestVersion === '1.1') {
            assertion(await exists(paths.request), `${relativePosix(REPO_ROOT, paths.request)}: missing generated file`);
            assertion(await exists(paths.summary), `${relativePosix(REPO_ROOT, paths.summary)}: missing generated file`);
        }
        assertion(await exists(paths.dossier), `${relativePosix(REPO_ROOT, paths.dossier)}: missing generated file`);
        assertion(await exists(paths.manifest), `${relativePosix(REPO_ROOT, paths.manifest)}: missing generated file`);
    }

    return {
        changeDir,
        completionDir,
        paths,
        change,
        artifacts,
        request,
        summary,
        evidence,
        closure,
        redactions,
        tasks,
        planHash,
        manifestVersion,
        planRevisionIndex,
        sourceMaterials
    };
}

function sourceDescriptors(context) {
    const sources = [
        { path: relativePosix(context.completionDir, context.paths.request), text: context.request.text },
        { path: relativePosix(context.completionDir, context.paths.plan), text: context.change.text },
        { path: relativePosix(context.completionDir, context.paths.summary), text: context.summary.text },
        { path: relativePosix(context.completionDir, context.paths.evidence), text: context.evidence.text },
        { path: relativePosix(context.completionDir, context.paths.closure), text: context.closure.text },
        ...context.tasks.map((task) => ({ path: task.relativePath, text: task.text }))
    ];
    if (context.planRevisionIndex) {
        sources.push({
            path: relativePosix(context.completionDir, context.paths.planRevisions),
            text: context.planRevisionIndex.text
        });
    }
    if (context.sourceMaterials.indexText) {
        sources.push({
            path: relativePosix(context.completionDir, context.paths.sourceMaterialsIndex),
            text: context.sourceMaterials.indexText
        });
    }
    for (const material of context.sourceMaterials.materials) {
        sources.push({ path: material.path, text: material.text, sha256: material.sha256 });
    }
    return sources.map((source) => ({
        ...source,
        sha256: source.sha256 ?? sha256(source.text)
    }));
}

function buildManifest(context, dossierText) {
    const sources = sourceDescriptors(context);
    const sourceByPath = new Map(sources.map((source) => [source.path, source]));
    const legacyTaskRecords = context.tasks.map((task) => ({
        taskId: task.data.task_id,
        tool: task.data.tool,
        sourceTaskId: task.data.source_task_id ?? null,
        status: task.data.status,
        record: task.relativePath,
        sha256: sha256(task.text)
    }));

    const taskRecords = context.manifestVersion === '1.0'
        ? legacyTaskRecords
        : legacyTaskRecords.map((record, index) => ({
            ...record,
            request: {
                sha256: context.tasks[index].request.sha256,
                messageCount: context.tasks[index].request.messageCount
            },
            plan: {
                revision: context.tasks[index].plan.revision,
                sha256: context.tasks[index].plan.sha256
            }
        }));

    const manifest = {
        schemaVersion: context.manifestVersion,
        changeId: context.change.data.change_id,
        terminalState: context.closure.data.terminal_state,
        risk: context.change.data.risk,
        components: context.change.data.component,
        request: {
            path: 'request-transcript.md',
            sha256: sourceByPath.get('request-transcript.md').sha256,
            messageCount: context.request.data.message_count
        },
        plan: {
            path: 'approved-plan.md',
            sha256: context.planHash,
            revision: context.change.data.plan_revision,
            source: '../plan.md'
        },
        agentSummary: {
            path: 'agent-action-reply-summary.md',
            sha256: sourceByPath.get('agent-action-reply-summary.md').sha256
        },
        ...(context.manifestVersion === '1.1'
            ? { planRevisions: context.planRevisionIndex.revisions }
            : {}),
        taskRecords,
        ...(context.manifestVersion === '1.1'
            ? {
                sourceMaterials: context.sourceMaterials.materials
                    .map(({ text: _text, ...material }) => material)
            }
            : {}),
        closure: {
            path: 'closure.md',
            sha256: sourceByPath.get('closure.md').sha256
        },
        dossier: {
            path: 'dossier.md',
            sha256: sha256(dossierText)
        },
        redactions: context.redactions,
        generatedAt: new Date(context.closure.data.generated_at).toISOString()
    };
    return manifest;
}

export async function buildGeneratedChange(changeDirectory) {
    const context = await loadChange(changeDirectory);
    const sources = sourceDescriptors(context);
    const dossier = renderDossier({
        change: context.change,
        request: context.request,
        summary: context.summary,
        approvedPlan: { text: context.change.text },
        evidence: context.evidence,
        closure: context.closure,
        tasks: context.tasks,
        sourceFiles: sources,
        redactions: context.redactions
    });
    const manifest = buildManifest(context, dossier);
    return { context, approvedPlan: context.change.text, dossier, manifest };
}

export async function generateChange(changeDirectory) {
    const generated = await buildGeneratedChange(changeDirectory);
    const changed = [];
    if (generated.context.manifestVersion === '1.1') {
        if (await writeNormalized(generated.context.paths.request, generated.context.request.text)) changed.push('request-transcript.md');
        if (await writeNormalized(generated.context.paths.summary, generated.context.summary.text)) changed.push('agent-action-reply-summary.md');
    }
    if (await writeNormalized(generated.context.paths.approvedPlan, generated.approvedPlan)) changed.push('approved-plan.md');
    if (await writeNormalized(generated.context.paths.dossier, generated.dossier)) changed.push('dossier.md');
    if (await writeJson(generated.context.paths.manifest, generated.manifest)) changed.push('manifest.json');
    return { changed, manifest: generated.manifest };
}

export async function checkChange(changeDirectory, { strict = false } = {}) {
    const generated = await buildGeneratedChange(changeDirectory);
    const context = await loadChange(changeDirectory, { requireGenerated: true });
    const actualRequest = await readNormalized(context.paths.request);
    const actualSummary = await readNormalized(context.paths.summary);
    const actualApprovedPlan = await readNormalized(context.paths.approvedPlan);
    const actualDossier = await readNormalized(context.paths.dossier);
    const actualManifestText = await readNormalized(context.paths.manifest);
    const actualManifest = JSON.parse(actualManifestText);

    if (context.manifestVersion === '1.1') {
        assertion(actualRequest === generated.context.request.text, `${relativePosix(REPO_ROOT, context.paths.request)} is stale; run generate`);
        assertion(actualSummary === generated.context.summary.text, `${relativePosix(REPO_ROOT, context.paths.summary)} is stale; run generate`);
    }
    assertion(actualApprovedPlan === generated.approvedPlan, `${relativePosix(REPO_ROOT, context.paths.approvedPlan)} is stale; run generate`);
    assertion(actualDossier === generated.dossier, `${relativePosix(REPO_ROOT, context.paths.dossier)} is stale; run generate`);
    assertion(
        actualManifestText === normalizeText(JSON.stringify(generated.manifest, null, 2)) &&
            JSON.stringify(actualManifest) === JSON.stringify(generated.manifest),
        `${relativePosix(REPO_ROOT, context.paths.manifest)} is stale; run generate`
    );

    if (strict && TERMINAL_CHANGE_STATES.has(context.closure.data.terminal_state)) {
        assertion(context.tasks.every((task) => task.data.status === 'complete'), 'strict terminal check requires all Tasks to be complete');
    } else if (strict) {
        assertion(
            context.change.data.completion_state === 'pending',
            'strict active-Change check requires completion_state: pending'
        );
    }

    return generated.manifest;
}

async function findChangeDirectories(root = REPO_ROOT) {
    const base = join(root, 'docs/changes');
    if (!(await exists(base))) return [];
    const found = [];
    async function walk(directory, depth) {
        if (depth > 3) return;
        const entries = await readdir(directory, { withFileTypes: true });
        if (entries.some((entry) => entry.isFile() && entry.name === 'plan.md')) {
            found.push(directory);
            return;
        }
        for (const entry of entries) {
            if (entry.isDirectory()) await walk(join(directory, entry.name), depth + 1);
        }
    }
    await walk(base, 0);
    return found.sort();
}

export async function validateVersionHistories(root = REPO_ROOT) {
    const effectiveDate = '2026-08-09';
    const files = [
        'metadata/version-history.json',
        'metadata/editor-version-history.json'
    ];
    for (const file of files) {
        const absolute = join(root, file);
        const document = JSON.parse(await readFile(absolute, 'utf8'));
        assertion(['1.0', '1.1'].includes(document.schemaVersion), `${file}: unsupported schemaVersion`);
        assertion(document.current && typeof document.current === 'object', `${file}: missing current`);
        assertion(Array.isArray(document.entries), `${file}: entries must be an array`);
        for (const entry of document.entries) {
            const isMclEntry =
                document.schemaVersion === '1.1' &&
                typeof entry.date === 'string' &&
                entry.date >= effectiveDate;
            if (isMclEntry) {
                assertion(entry.trace && typeof entry.trace === 'object', `${file}: post-MCL entry ${entry.displayVersion ?? entry.appSemver} requires trace`);
            }
            if (!entry.trace) continue;
            for (const field of ['changeId', 'pullRequest', 'completionManifest', 'completionDossier']) {
                assertion(typeof entry.trace[field] === 'string' && entry.trace[field].length > 0, `${file}: trace.${field} is required`);
            }
            validateChangeId(entry.trace.changeId, `${file}: trace.changeId`);
            for (const field of ['proposal', 'spec', 'plan', 'evidence', 'completionManifest', 'completionDossier']) {
                const value = entry.trace[field];
                if (typeof value === 'string' && !value.startsWith('http')) {
                    assertion(await exists(join(root, value)), `${file}: trace.${field} does not exist: ${value}`);
                }
            }
        }
    }
}

export async function checkAll({ strict = false } = {}) {
    await loadComponentRegistry();
    await validateVersionHistories();
    const directories = await findChangeDirectories();
    assertion(directories.length > 0, 'no governed Change directories found');
    const results = [];
    for (const directory of directories) {
        results.push(await checkChange(directory, { strict }));
    }
    return results;
}

function usage() {
    return `Usage:
  node scripts/mcl.mjs generate <change-directory>
  node scripts/mcl.mjs check <change-directory> [--strict]
  node scripts/mcl.mjs check-all [--strict]
  node scripts/mcl.mjs classify [--base <git-ref>] [path ...]
  node scripts/mcl.mjs validate-registry
  node scripts/mcl.mjs validate-version-history`;
}

async function main(argv) {
    const [command, ...args] = argv;
    if (!command || command === '--help' || command === '-h') {
        console.log(usage());
        return;
    }

    if (command === 'generate') {
        assertion(args[0], 'generate requires a Change directory');
        const result = await generateChange(args[0]);
        console.log(JSON.stringify(result, null, 2));
        return;
    }

    if (command === 'check') {
        assertion(args[0], 'check requires a Change directory');
        const result = await checkChange(args[0], { strict: args.includes('--strict') });
        console.log(JSON.stringify({ ok: true, changeId: result.changeId }, null, 2));
        return;
    }

    if (command === 'check-all') {
        const results = await checkAll({ strict: args.includes('--strict') });
        console.log(JSON.stringify({ ok: true, changes: results.map((item) => item.changeId) }, null, 2));
        return;
    }

    if (command === 'classify') {
        const baseIndex = args.indexOf('--base');
        let base = null;
        if (baseIndex >= 0) {
            assertion(args[baseIndex + 1], '--base requires a Git ref');
            base = args[baseIndex + 1];
            args.splice(baseIndex, 2);
        }
        const paths = args.length > 0 ? args : gitChangedPaths(REPO_ROOT, base);
        const registry = await loadComponentRegistry();
        console.log(JSON.stringify({ paths, components: classifyPaths(paths, registry) }, null, 2));
        return;
    }

    if (command === 'validate-registry') {
        const registry = await loadComponentRegistry();
        console.log(JSON.stringify({ ok: true, components: registry.components.map((item) => item.id) }, null, 2));
        return;
    }

    if (command === 'validate-version-history') {
        await validateVersionHistories();
        console.log(JSON.stringify({ ok: true }, null, 2));
        return;
    }

    throw new Error(`unknown command "${command}"\n${usage()}`);
}

const isCli = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isCli) {
    main(process.argv.slice(2)).catch((error) => {
        console.error(`MCL check failed: ${error.message}`);
        process.exitCode = 1;
    });
}
