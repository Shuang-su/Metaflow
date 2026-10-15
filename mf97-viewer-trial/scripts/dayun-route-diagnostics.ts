/** Locate first physical anomalies without discarding any proof or changing physics. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { collisionSourceFile, sha } from '../../mf79-viewer-trial/scripts/source';
import { BODY, stand, support, horizontal } from '../../mf79-viewer-trial/src/native-motion';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
const args = process.argv.slice(2), option = (name: string) => {
  const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`); return args[i + 1];
};
const manifestFile = option('--manifest'), m = JSON.parse(readFileSync(manifestFile, 'utf8')),
  proofBytes = readFileSync(option('--native-proof')), proof = JSON.parse(proofBytes.toString());
if (m.status !== 'analysis-complete' || sha(JSON.stringify(m.key)) !== m.fingerprint ||
    sha(readFileSync(resolve(dirname(manifestFile), 'nav.bin'))) !== m.navHash ||
    proof.navigationFingerprint !== m.fingerprint || proof.sourceHash !== m.sourceHash ||
    proof.nativeParametersUnchanged !== true || proof.automaticJump !== false ||
    JSON.stringify(proof.body) !== JSON.stringify(BODY)) throw Error('Diagnostic proof identity mismatch');
const resources = createOfflineResources(offlineResourceOptions(args)), loaded = await collisionSourceFile(option('--source'), m.key.geometryScope);
try {
  if (loaded.sourceHash !== m.sourceHash) throw Error('Diagnostic source mismatch');
  const anomalies: any[] = [], cases: any[] = [];
  for (const pair of proof.proofs) for (const direction of ['forward', 'reverse', 'returnAlongForward', 'returnAlongReverse']) {
    const run = pair[direction], trace = run?.trace ?? [];
    cases.push({ pair: pair.id, direction, reason: run?.reason ?? 'not-executed', ticks: trace.length,
      arrived: run?.ok === true, groundedTicks: trace.filter((p: any) => p.grounded && p.collision === 'active').length });
    const firstAir = trace.findIndex((p: any) => !p.grounded || p.collision !== 'active'),
      blocked = run?.firstConfirmedNoProgress ? trace.findIndex((p: any) => p.tick === run.firstConfirmedNoProgress.tick) : -1;
    for (const [kind, index] of [['first-air', firstAir], ['first-blocked', blocked]] as const) {
      if (index < 0) continue;
      let begin = index, end = index, distance = 0;
      while (begin > 0 && distance < 2) { distance += horizontal(trace[begin].position, trace[begin - 1].position); begin--; }
      distance = 0;
      while (end < trace.length - 1 && distance < 2) { distance += horizontal(trace[end].position, trace[end + 1].position); end++; }
      const center = trace[index].position, a = trace[Math.max(begin, index - 10)].position,
        b = kind === 'first-blocked' ? run.firstConfirmedNoProgress.target : trace[Math.min(end, index + 10)].position,
        length = horizontal(a, b);
      if (length < 1e-6) throw Error('Cannot orient diagnostic segment');
      const along = { x: (b.x - a.x) / length, z: (b.z - a.z) / length }, samples = [];
      for (let step = -25; step <= 25; step++) for (const offset of [-0.4, 0, 0.4]) {
        const eye = { x: center.x + along.x * step * 0.08 - along.z * offset,
          y: center.y, z: center.z + along.z * step * 0.08 + along.x * offset };
        const nearest = trace.slice(begin, end + 1).reduce((best: any, t: any) =>
          horizontal(t.position, eye) < horizontal(best.position, eye) ? t : best, trace[index]);
        eye.y = nearest.position.y;
        const known = loaded.space.known(eye.x, eye.y, eye.z), pushes = { x: 0, y: 0, z: 0 },
          height = known ? support(loaded.space.collision, eye) : null,
          standing = height !== null ? stand(loaded.space.collision, { ...eye, y: height }) : null;
        const capsuleHit = known ? loaded.space.collision.queryCapsule(eye.x, eye.y - BODY.eye + BODY.height / 2,
          eye.z, BODY.height / 2 - BODY.radius, BODY.radius, pushes) : null;
        samples.push({ along: step * 0.08, offset, eye, nearestTraceTick: nearest.tick,
          known, support: height, standing, capsuleHit, pushes });
      }
      anomalies.push({ id: `${pair.id}-${direction}-${kind}`, pair: pair.id, direction, kind, index,
        tick: trace[index].tick, center, along, supportBefore: trace[index - 1]?.support ?? null,
        supportAt: trace[index].support, supportDelta: trace[index - 1]?.support != null && trace[index].support != null
          ? trace[index].support - trace[index - 1].support : null,
        traceRange: [begin, end + 1], localTrace: trace.slice(begin, end + 1), samples,
        ...(kind === 'first-blocked' ? { stall: run.firstConfirmedNoProgress } : {}) });
    }
  }
  resources.writeJsonAtomic(option('--output'), { version: 1, usage: 'analysis-only', sourceHash: loaded.sourceHash,
    navigationFingerprint: m.fingerprint, proofHash: sha(proofBytes), scope: m.bounds,
    implementationHash: sha(readFileSync(new URL(import.meta.url))), body: BODY, nativeParametersUnchanged: true,
    traceSemantics: 'Original full proofs remain authoritative; local windows retain first anomaly and up to two metres on each side',
    supportSemantics: 'Original five-ray support and capsule at the nearest recorded eye height; null is query failure, not proof of a geometric hole',
    cases, anomalies }, { replace: false });
  console.log(JSON.stringify({ cases: cases.length, anomalies: anomalies.map(({ localTrace, samples, ...rest }) => rest) }));
} finally { loaded.destroy(); }
