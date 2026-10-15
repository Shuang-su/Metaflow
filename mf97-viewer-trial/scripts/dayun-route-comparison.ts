/** Explicit research polylines; no navigation links or collision edits are created. */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { collisionSourceFile, sha } from '../../mf79-viewer-trial/scripts/source';
import { BODY, NativeDriver, stand } from '../../mf79-viewer-trial/src/native-motion';
import { replayNativePolyline } from '../src/dayun-native-proof';
import { createOfflineResources, offlineResourceOptions } from '../src/offline-resources';
const args = process.argv.slice(2), option = (name: string) => {
  const i = args.indexOf(name); if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`); return args[i + 1];
};
const manifestFile = option('--manifest'), m = JSON.parse(readFileSync(manifestFile, 'utf8')),
  routeBytes = readFileSync(option('--routes')), routes = JSON.parse(routeBytes.toString());
if (m.status !== 'analysis-complete' || sha(JSON.stringify(m.key)) !== m.fingerprint ||
    sha(readFileSync(resolve(dirname(manifestFile), 'nav.bin'))) !== m.navHash ||
    JSON.stringify(m.key.body) !== JSON.stringify(BODY) ||
    m.key.implementations?.nativeMotion !== sha(readFileSync(new URL('../../mf79-viewer-trial/src/native-motion.ts', import.meta.url))) ||
    m.key.controllerHash !== sha(readFileSync(new URL('../../metaflow-viewer/src/cameras/walk-controller.ts', import.meta.url))) ||
    routes.navigationFingerprint !== m.fingerprint || routes.sourceHash !== m.sourceHash ||
    !Array.isArray(routes.routes) || !routes.routes.length ||
    new Set(routes.routes.map((r: any) => r.id)).size !== routes.routes.length)
  throw Error('Route comparison identity mismatch');
for (const route of routes.routes)
  if (typeof route.id !== 'string' || !route.evidence || !Array.isArray(route.points) || route.points.length < 2 ||
      route.points.length > 10000 || route.points.some((p: any) => !p ||
        (['x', 'y', 'z'] as const).some(k => !Number.isFinite(p[k]) || p[k] < m.bounds.min[k] || p[k] > m.bounds.max[k])) ||
      !route.points.some((p: any) => Math.hypot(p.x - route.points[0].x, p.z - route.points[0].z) > 1e-6))
    throw Error('Invalid research route or scope');
const resources = createOfflineResources(offlineResourceOptions(args)), loaded = await collisionSourceFile(option('--source'), m.key.geometryScope);
try {
  if (loaded.sourceHash !== m.sourceHash) throw Error('Route comparison source mismatch');
  const proofs = [];
  for (const route of routes.routes) {
    const known = (p: any) => loaded.space.known(p.x, p.y, p.z), settle = (point: any) => {
      const eye = stand(loaded.space.collision, { ...point, y: point.y - BODY.eye - BODY.hover });
      if (!eye || !known(eye) || Math.abs(eye.y - point.y) > 0.24) return null;
      const driver = new NativeDriver(loaded.space.collision, eye);
      for (let i = 0; i < 30; i++) driver.step(0, 0);
      return driver.state.grounded && driver.state.collision === 'active' ? driver.state : null;
    };
    const from = settle(route.points[0]), to = settle(route.points.at(-1));
    if (!from || !to) { proofs.push({ ...route, reason: 'native-endpoint-rejected', fromState: from, toState: to }); continue; }
    const points = [from.position, ...route.points.slice(1, -1), to.position], reversed = [...points].reverse(),
      forward = replayNativePolyline(loaded.space.collision, points, known),
      reverse = replayNativePolyline(loaded.space.collision, reversed, known),
      returnAlongForward = forward.ok ? replayNativePolyline(loaded.space.collision,
        [forward.state.position, ...reversed.slice(1)], known) : undefined,
      returnAlongReverse = reverse.ok ? replayNativePolyline(loaded.space.collision,
        [reverse.state.position, ...points.slice(1)], known) : undefined;
    const allFourGrounded = [forward, reverse, returnAlongForward, returnAlongReverse].every(r =>
      r?.ok && r.trace.length > 0 && r.trace.every(t => t.grounded && t.collision === 'active'));
    proofs.push({ ...route, fromState: from, toState: to, forward, reverse, returnAlongForward, returnAlongReverse,
      actualSupportRise: to.supportHeight! - from.supportHeight!, allFourGrounded,
      reason: allFourGrounded ? 'four-way-grounded-local-route' : 'local-route-not-certified' });
    console.log(JSON.stringify({ id: route.id, allFourGrounded, forward: forward.reason, reverse: reverse.reason }));
  }
  resources.writeJsonAtomic(option('--output'), { version: 1, usage: 'analysis-only', sourceHash: loaded.sourceHash,
    navigationFingerprint: m.fingerprint, scope: m.bounds, routesHash: sha(routeBytes),
    implementationHash: sha(readFileSync(new URL(import.meta.url))), body: BODY, nativeParametersUnchanged: true,
    automaticJump: false, floorConnectionConfirmed: false,
    semantics: 'Explicit local route alternatives, four independent native replays; returns start at actual terminal positions', proofs }, { replace: false });
} finally { loaded.destroy(); }
