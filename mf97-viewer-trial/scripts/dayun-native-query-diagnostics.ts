/** Replay recorded inputs exactly, observing existing native collision calls. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { collisionSourceFile, sha } from '../../mf79-viewer-trial/scripts/source';
import { BODY, NativeDriver, length } from '../../mf79-viewer-trial/src/native-motion';
import { observeNativeQueries, type NativeQuery } from '../src/native-query-observer';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
const args = process.argv.slice(2), option = (name: string) => {
  const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`); return args[i + 1];
};
const manifestFile = option('--manifest'), m = JSON.parse(readFileSync(manifestFile, 'utf8')),
  proofBytes = readFileSync(option('--native-proof')), proof = JSON.parse(proofBytes.toString()),
  controllerHash = sha(readFileSync(new URL('../../metaflow-viewer/src/cameras/walk-controller.ts', import.meta.url)));
if (m.status !== 'analysis-complete' || sha(JSON.stringify(m.key)) !== m.fingerprint ||
    sha(readFileSync(resolve(dirname(manifestFile), 'nav.bin'))) !== m.navHash ||
    proof.navigationFingerprint !== m.fingerprint || proof.sourceHash !== m.sourceHash ||
    JSON.stringify(proof.scope) !== JSON.stringify(m.bounds) || JSON.stringify(m.key.body) !== JSON.stringify(BODY) ||
    JSON.stringify(proof.body) !== JSON.stringify(BODY) || proof.nativeParametersUnchanged !== true || proof.automaticJump !== false ||
    m.key.controllerHash !== controllerHash || m.key.implementations.nativeMotion !==
      sha(readFileSync(new URL('../../mf79-viewer-trial/src/native-motion.ts', import.meta.url))))
  throw Error('Native input diagnostic identity mismatch');
const resources = createOfflineResources(offlineResourceOptions(args)), loaded = await collisionSourceFile(option('--source'), m.key.geometryScope);
try {
  if (loaded.sourceHash !== m.sourceHash) throw Error('Native input diagnostic source mismatch');
  const cases = [];
  for (const pair of proof.proofs) for (const direction of ['forward', 'reverse', 'returnAlongForward', 'returnAlongReverse']) {
    const run = pair[direction], reference = run?.trace;
    if (!reference?.length) { cases.push({ pair: pair.id, direction, reason: run?.reason ?? 'not-executed', replayed: false as const }); continue; }
    const begin = direction === 'forward' || direction === 'reverse' ? run.points?.[0] :
      direction === 'returnAlongForward' ? pair.forward.points?.at(-1) : pair.reverse.points?.at(-1);
    if (!begin || ![begin.x, begin.y, begin.z].every(Number.isFinite) ||
        !Array.isArray(run.input) || run.input.length !== reference.length ||
        reference.some((v: any, i: number) => v.tick !== i + 1 ||
          ![v.position?.x, v.position?.y, v.position?.z].every(Number.isFinite) ||
          (v.support !== null && !Number.isFinite(v.support)) || typeof v.grounded !== 'boolean' ||
          !['active', 'held', 'missing'].includes(v.collision)) ||
        run.input.some((v: any, i: number) => !Array.isArray(v) || v.length !== 3 || !v.every(Number.isFinite) || v[0] !== reference[i].tick))
      throw Error('Requires complete original steering input and endpoint-based replay semantics');
    const firstAir = reference.findIndex((p: any) => !p.grounded || p.collision !== 'active'),
      firstBlocked = run.firstConfirmedNoProgress ? reference.findIndex((p: any) => p.tick === run.firstConfirmedNoProgress.tick) : -1,
      centres = [firstAir, firstBlocked, ...(run.ok ? [] : [reference.length - 1])].filter(i => i >= 0);
    let queries: NativeQuery[] = [];
    const driver = new NativeDriver(observeNativeQueries(loaded.space.collision, q => queries.push(q)), begin), frames = [];
    let maxPositionError = 0, maxSupportError = 0, mismatchedFrames = 0, firstMismatch: unknown = null, airborneFrames = 0, capsuleHitFrames = 0;
    for (let i = 0; i < run.input.length; i++) {
      queries = [];
      const before = driver.state, [, x, z] = run.input[i], after = driver.step(x, z, false), expected = reference[i],
        positionError = length(after.position, expected.position), supportError = after.supportHeight === null || expected.support === null
          ? (after.supportHeight === expected.support ? 0 : null) : Math.abs(after.supportHeight - expected.support);
      maxPositionError = Math.max(maxPositionError, positionError); maxSupportError = Math.max(maxSupportError, supportError ?? 0);
      if (positionError > 1e-9 || supportError === null || supportError > 1e-9 || after.grounded !== expected.grounded || after.collision !== expected.collision) {
        mismatchedFrames++; firstMismatch ??= { tick: expected.tick, positionError, supportError };
      }
      airborneFrames += Number(!after.grounded); capsuleHitFrames += Number(queries.some(q => q.kind === 'capsule' && q.hit));
      if (centres.some(n => Math.abs(n - i) <= 12)) frames.push({ tick: expected.tick, before, after, queries,
        displacementFromHoverTarget: after.supportHeight === null ? null : before.position.y - after.supportHeight - BODY.eye - BODY.hover });
    }
    const result = { pair: pair.id, direction, reason: run.reason, replayed: true as const, ticks: reference.length,
      maxPositionError, maxSupportError, mismatchedFrames, firstMismatch, exactReplay: mismatchedFrames === 0,
      firstAirTick: firstAir < 0 ? null : reference[firstAir].tick,
      firstBlockedTick: firstBlocked < 0 ? null : reference[firstBlocked].tick, airborneFrames, capsuleHitFrames, frames };
    cases.push(result); console.log(JSON.stringify({ ...result, frames: frames.length }));
  }
  resources.writeJsonAtomic(option('--output'), { version: 1, usage: 'analysis-only', sourceHash: loaded.sourceHash,
    navigationFingerprint: m.fingerprint, scope: m.bounds, proofHash: sha(proofBytes), controllerHash, body: BODY,
    nativeParametersUnchanged: true, automaticJump: false, floorConnectionConfirmed: false,
    implementations: { script: sha(readFileSync(new URL(import.meta.url))), observer: sha(readFileSync(new URL('../src/native-query-observer.ts', import.meta.url))) },
    semantics: 'Original recorded inputs replayed from original route endpoints; observer delegates the same collision calls and compares every recorded frame. Windows are first air/block +/-12 ticks and failed-run end.', cases }, { replace: false });
  if (cases.some(c => c.replayed && !c.exactReplay)) throw Error('Observed replay differed from original evidence; diagnostic is not certified');
} finally { loaded.destroy(); }
