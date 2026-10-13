/** Research only: probe a disconnected component's four bounds with the
 * unchanged native controller. A bounding-box crossing is not a floor link. */
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { init, importNavMesh } from "../../mf79-viewer-trial/src/recast-runtime";
import { NativePlanner } from "../../mf79-viewer-trial/src/planner";
import { collisionSourceFile, sha } from "../../mf79-viewer-trial/scripts/source";
import { BODY, NativeDriver, stand, support, horizontal } from "../../mf79-viewer-trial/src/native-motion";
import { replayNativePolyline } from "../src/dayun-native-proof";
import { createOfflineResources, offlineResourceOptions, MiB } from "../src/offline-resources";

const args = process.argv.slice(2), option = (name: string) => {
  const i = args.indexOf(name);
  if (i < 0 || !args[i + 1]) throw Error(`Missing ${name}`);
  return args[i + 1];
};
const diagnosticBytes = readFileSync(option("--diagnostic")), diagnostic = JSON.parse(diagnosticBytes.toString()),
  proofBytes = readFileSync(option("--native-proof")), proof = JSON.parse(proofBytes.toString()),
  manifestFile = option("--manifest"), manifest = JSON.parse(readFileSync(manifestFile, "utf8")),
  navigationBytes = readFileSync(resolve(dirname(manifestFile), "nav.bin")),
  id = option("--pair"), pair = proof.proofs?.find((p: any) => p.id === id),
  probe = diagnostic.probes?.find((p: any) => p.id === id);
if (manifest.status !== "analysis-complete" || manifest.usage !== "offline-native-verification-only" ||
    sha(navigationBytes) !== manifest.navHash || sha(JSON.stringify(manifest.key)) !== manifest.fingerprint ||
    manifest.fingerprint !== proof.navigationFingerprint ||
    manifest.sourceHash !== proof.sourceHash || JSON.stringify(diagnostic.scope) !== JSON.stringify(manifest.bounds) ||
    diagnostic.usage !== "analysis-only" || diagnostic.nativeProbeSource?.sha256 !== sha(proofBytes) ||
    diagnostic.navigationFingerprint !== proof.navigationFingerprint || diagnostic.sourceHash !== proof.sourceHash ||
    proof.nativeParametersUnchanged !== true || proof.automaticJump !== false ||
    JSON.stringify(proof.body) !== JSON.stringify(BODY) || !pair?.fromState?.grounded ||
    pair.fromState.collision !== "active" || !pair.associations?.[0] ||
    !probe?.fromGroup || !probe.toGroup || probe.sameReciprocalGroup)
  throw Error("Requires a same-source disconnected native standing probe");
const margin = args.includes("--margin-metres") ? Number(option("--margin-metres")) :
  BODY.radius + diagnostic.boundaryMargin + 0.08;
if (!Number.isFinite(margin) || margin < 0.4 || margin > 5)
  throw Error("Boundary probe margin must stay within 0.4 to 5 metres");
const resources = createOfflineResources({ ...offlineResourceOptions(args), taskOutputBytes: 16 * MiB }),
  loaded = await collisionSourceFile(option("--source"), diagnostic.scope);
await init();
const nav = importNavMesh(navigationBytes).navMesh,
  planner = new NativePlanner(nav, loaded.space, manifest.fingerprint);
try {
  if (loaded.sourceHash !== proof.sourceHash) throw Error("Collision source differs from standing proof");
  const s = pair.fromState, eye = stand(loaded.space.collision, { ...s.position, y: s.supportHeight });
  if (!eye) throw Error("Native start no longer has capsule clearance");
  const driver = new NativeDriver(loaded.space.collision, eye);
  for (let i = 0; i < 30; i++) driver.step(0, 0);
  const start = driver.state;
  if (!start.grounded || start.collision !== "active" || horizontal(start.position, s.position) > 0.04 ||
      Math.abs(start.supportHeight! - s.supportHeight) > 0.08)
    throw Error("Native start changed since the standing proof");
  const originAssociation = planner.associate(start);
  if (!originAssociation || originAssociation.ref !== pair.associations[0].ref)
    throw Error("Native origin no longer associates with its recorded polygon");
  const b = probe.fromGroup.bounds,
    targets = [
      { id: "minX", ...start.position, x: b.min.x - margin },
      { id: "maxX", ...start.position, x: b.max.x + margin },
      { id: "minZ", ...start.position, z: b.min.z - margin },
      { id: "maxZ", ...start.position, z: b.max.z + margin },
    ], results = [];
  for (const target of targets) {
    if (!loaded.space.known(target.x, target.y, target.z))
      throw Error("Explicit boundary probe target is outside known collision coverage");
    const result = replayNativePolyline(loaded.space.collision, [start.position, target], p =>
      loaded.space.known(p.x, p.y, p.z));
    const crossed = result.trace.filter((t: any) => t.grounded && t.collision === "active" &&
      Math.abs(t.support - start.supportHeight!) <= 0.28 &&
      (t.position.x < b.min.x - 0.08 || t.position.x > b.max.x + 0.08 ||
       t.position.z < b.min.z - 0.08 || t.position.z > b.max.z + 0.08));
    const state = result.state, pushes = { x: 0, y: 0, z: 0 },
      capsuleHit = loaded.space.collision.queryCapsule(state.position.x,
        state.position.y - BODY.eye + BODY.height / 2, state.position.z,
        BODY.height / 2 - BODY.radius, BODY.radius, pushes);
    const terminalAssociation = planner.associate(state),
      navigation = terminalAssociation ? planner.path(originAssociation, terminalAssociation) : null,
      returned = result.ok ? replayNativePolyline(loaded.space.collision,
        [state.position, start.position], p => loaded.space.known(p.x, p.y, p.z)) : undefined;
    results.push({ direction: target.id, target, targetSupport: support(loaded.space.collision, target),
      terminalAssociation, navigationReason: navigation?.reason ?? "native-terminal-association-missing",
      returned,
      reachedOutsideComponentBounds: crossed.length > 0, firstGroundedCrossing: crossed[0] ?? null,
      terminalCapsule: { hit: capsuleHit, pushes }, ...result });
    console.log(JSON.stringify({ direction: target.id, reason: result.reason,
      reachedOutsideComponentBounds: crossed.length > 0, state: result.state.position,
      navigation: navigation?.reason ?? "native-terminal-association-missing", returned: returned?.ok }));
    resources.assertCapacity(2 * MiB, "Native component-boundary probe");
  }
  resources.writeJsonAtomic(option("--output"), { version: 1, usage: "analysis-only",
    sourceHash: loaded.sourceHash, navigationFingerprint: proof.navigationFingerprint,
    loadedTileIds: loaded.loadedTileIds, diagnosticHash: sha(diagnosticBytes), nativeProofHash: sha(proofBytes),
    pair: id, component: probe.fromGroup, start, margin, originAssociation, body: BODY, nativeParametersUnchanged: true,
    automaticJump: false, connectionConfirmed: false, semantics:
      "Four cardinal probes of one component bounding box; neither complete perimeter coverage nor floor connectivity",
    results }, { replace: false });
} finally { planner.destroy(); nav.destroy(); loaded.destroy(); }
