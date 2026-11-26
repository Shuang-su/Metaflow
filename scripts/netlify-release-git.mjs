import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

const tip = '54167e40f9adbaa62e1d5e411c62e56424ec1e7f';
const studio = '2a0758bb5d63f78336aa5c96a2d07379f67d8f2e';
const proofHash = 'f37af9c3d6b43ce85fdaec59fd02ef84874c962adb1b8f7e0ddf67353ad2345a';

function objectBytes(objects, id, type) {
    assert.ok(Object.hasOwn(objects, id), `Missing archived Git object ${id}`);
    const bytes = Buffer.from(objects[id], 'base64');
    const oid = createHash('sha1').update(type + ' ' + bytes.length + '\0').update(bytes).digest('hex');
    assert.equal(oid, id, `Invalid archived Git ${type}`);
    return bytes;
}

function releaseProof(root) {
    let bytes;
    try { bytes = readFileSync(path.join(root, 'metadata/netlify-releases/viewer-v5.27.0-git.json.gz')); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    assert.equal(createHash('sha256').update(bytes).digest('hex'), proofHash);
    return JSON.parse(gunzipSync(bytes));
}

// Follow the original commit payloads from the exact build reported by Netlify.
// Only revisions reachable inside this immutable archive can be witnesses.
export function hasPublishedGitCommit(root, ref) {
    if (!/^[0-9a-f]{7,40}$/.test(ref)) return false;
    const proof = releaseProof(root);
    if (!proof) return false;
    const pending = [tip], visited = new Set();
    while (pending.length) {
        const id = pending.pop();
        if (visited.has(id) || !Object.hasOwn(proof.commits, id)) continue;
        const header = objectBytes(proof.commits, id, 'commit').toString().split('\n\n', 1)[0];
        visited.add(id);
        for (const parent of header.matchAll(/^parent ([a-f0-9]{40})$/gm)) pending.push(parent[1]);
    }
    return [...visited].filter(id => id.startsWith(ref)).length === 1;
}

function childId(objects, id, name) {
    const bytes = objectBytes(objects, id, 'tree');
    for (let offset = 0; offset < bytes.length;) {
        const separator = bytes.indexOf(0, offset);
        assert.ok(separator > offset && separator + 21 <= bytes.length);
        const entry = bytes.toString('utf8', offset, separator);
        if (entry.split(' ')[1] === name) return bytes.subarray(separator + 1, separator + 21).toString('hex');
        offset = separator + 21;
    }
    throw Error(`Missing archived tree entry ${name}`);
}

export function publishedStudioIndex(root) {
    assert.ok(hasPublishedGitCommit(root, studio));
    const { commits, indexObjects } = releaseProof(root);
    const tree = /^tree ([a-f0-9]{40})\n/.exec(objectBytes(commits, studio, 'commit').toString())[1];
    const data = childId(indexObjects, tree, 'data');
    return JSON.parse(objectBytes(indexObjects, childId(indexObjects, data, 'index.json'), 'blob'));
}
