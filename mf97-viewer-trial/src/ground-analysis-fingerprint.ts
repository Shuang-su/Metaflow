/** Node-only fingerprint used by the CLI and the review server's expected-version gate. */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function groundAnalysisHash() {
    const scripts = resolve(dirname(fileURLToPath(import.meta.url)), '../scripts');
    const hash = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');
    return hash(['ground-analysis.ts', 'ground-detect.py', '../src/ground/spans.ts', '../src/ground/review.ts',
        '../../metaflow-viewer/src/navigation/layers.ts'].map(path => hash(readFileSync(resolve(scripts, path)))).join(':'));
}
