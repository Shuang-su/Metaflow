#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf8' }
);
const files = output.split('\n').filter(Boolean).sort();
const errors = [];
const forbiddenSegments = /(^|\/)(?:node_modules|dist|public|test-results|playwright-report|__pycache__)(?:\/|$)/;
const forbiddenNames = /(^|\/)(?:\.DS_Store|\.env(?:\..*)?)$/;
const textExtensions = new Set([
    '', '.cjs', '.css', '.html', '.js', '.json', '.jsonc', '.jsx', '.md', '.mjs', '.py', '.scss', '.sh', '.sql', '.svg', '.toml', '.ts', '.tsx', '.txt', '.yaml', '.yml'
]);
const secretPatterns = [
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/],
    ['OpenAI-style secret', /\bsk-[A-Za-z0-9_-]{20,}\b/],
    ['Supabase secret', /\bsb_secret_[A-Za-z0-9_-]{16,}\b/],
    ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/]
];

for (const file of files) {
    if (forbiddenSegments.test(file) || forbiddenNames.test(file)) {
        errors.push(`${file}: cache, build output, or local-only file must not be committed`);
        continue;
    }
    if (!textExtensions.has(extname(file).toLowerCase())) continue;
    let text;
    try {
        text = await readFile(resolve(root, file), 'utf8');
    } catch {
        continue;
    }
    const scrubbed = text.replace(/\[REDACTED: [^\]]+\]/g, '');
    for (const [label, pattern] of secretPatterns) {
        if (pattern.test(scrubbed)) errors.push(`${file}: possible ${label}`);
    }
}

if (errors.length > 0) {
    for (const error of errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
} else {
    console.log(`Repository hygiene and secret scan passed for ${files.length} files.`);
}
