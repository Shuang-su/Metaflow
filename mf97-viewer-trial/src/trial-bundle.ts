import { validateMapManifest } from "../../metaflow-viewer/src/navigation/map-assets";

/** Local, explicitly selected collision/navigation pair. Never a saved default. */
export type TrialBundle = {
  version: 1;
  id: string;
  status: "validated-local-trial";
  defaultEnabled: false;
  identity: {
    version: 1;
    scene: "apms-2026";
    artifactId: string;
    originalSourceHash: string;
    sourceHash: string;
    analysisHash: string;
    decisionHash: string;
    navFingerprint: string;
    navHash: string;
    collisionHash: string;
    proofHashes: Record<string, string>;
    implementation: { file: string; sha256: string }[];
    inputs: {
      artifact: string;
      navDirectory: string;
      originalMapManifest: string;
    };
  };
  collisionUrl: string;
  navigationManifestUrl: string;
  navigationMapUrl: string;
  originalUrl: string;
  files: { navigation: string; map: string };
  limitation: string;
};
const hash = /^[a-f0-9]{64}$/;
export const isTrialBundleId = (value: string) => /^[a-f0-9]{24}$/.test(value);
export function validateTrialBundle(
  value: unknown,
  id: string,
  scene: string,
): TrialBundle {
  const b = value as TrialBundle,
    i = b?.identity;
  if (
    !isTrialBundleId(id) ||
    b?.version !== 1 ||
    b.id !== id ||
    b.status !== "validated-local-trial" ||
    b.defaultEnabled !== false ||
    !i ||
    i.version !== 1 ||
    i.scene !== scene ||
    scene !== "apms-2026" ||
    !isTrialBundleId(i.artifactId) ||
    ![i.sourceHash, i.originalSourceHash].every(
      (v) => typeof v === "string" && /^[a-f0-9]{64}:[a-f0-9]{64}$/.test(v),
    ) ||
    ![
      i.analysisHash,
      i.decisionHash,
      i.navFingerprint,
      i.navHash,
      i.collisionHash,
      b.files?.navigation,
      b.files?.map,
    ].every((v) => typeof v === "string" && hash.test(v)) ||
    !i.proofHashes ||
    ![
      "materialization",
      "native",
      "gpu",
      "regression",
      "navigation",
      "map",
      "review",
      "decisions",
    ].every((k) => hash.test(i.proofHashes[k])) ||
    !Array.isArray(i.implementation) ||
    !i.implementation.length ||
    i.implementation.some(
      (v) => typeof v.file !== "string" || !hash.test(v.sha256),
    ) ||
    !i.inputs ||
    typeof i.inputs.artifact !== "string" ||
    typeof i.inputs.navDirectory !== "string" ||
    typeof i.inputs.originalMapManifest !== "string"
  )
    throw Error("试用资产清单身份或验证记录无效");
  const base = `/mf97-trial-bundles/${id}/`;
  if (
    b.collisionUrl !== `/mf97-accepted/${i.artifactId}/walk.voxel.json` ||
    b.navigationManifestUrl !== base + "navigation-manifest.json" ||
    b.navigationMapUrl !== base + "map-manifest.json" ||
    b.originalUrl !== "/?scene=" + scene
  )
    throw Error("试用资产路径与已验证版本不一致");
  return b;
}
const digest = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
    (n) => n.toString(16).padStart(2, "0"),
  ).join("");
export async function loadTrialBundle(
  id: string,
  scene: string,
  fetcher: typeof fetch = fetch,
) {
  if (!isTrialBundleId(id) || scene !== "apms-2026")
    throw Error("无效或不适用的本地试用版本");
  const read = async (url: string, expected?: string) => {
    const response = await fetcher(url, { cache: "no-store" });
    if (!response.ok) throw Error("试用资产缺失：" + url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (expected && (await digest(bytes)) !== expected)
      throw Error("试用资产指纹不一致：" + url);
    return JSON.parse(new TextDecoder().decode(bytes));
  };
  const bundle = validateTrialBundle(
      await read(`/mf97-trial-bundles/${id}/bundle.json`),
      id,
      scene,
    ),
    i = bundle.identity;
  if (
    (await digest(new TextEncoder().encode(JSON.stringify(i)))).slice(0, 24) !==
    id
  )
    throw Error("试用版本身份指纹不一致");
  const [navigation, map, collision] = await Promise.all([
    read(bundle.navigationManifestUrl, bundle.files.navigation),
    read(bundle.navigationMapUrl, bundle.files.map),
    read(bundle.collisionUrl, i.sourceHash.split(":")[0]),
  ]);
  if (
    navigation.status !== "complete" ||
    navigation.scene !== scene ||
    navigation.sourceHash !== i.sourceHash ||
    navigation.fingerprint !== i.navFingerprint ||
    navigation.navHash !== i.navHash ||
    navigation.collisionHash !== i.collisionHash ||
    navigation.trialBundle?.id !== id ||
    navigation.collisionSource !== undefined ||
    JSON.stringify(navigation.meta) !== JSON.stringify(collision) ||
    (await digest(new TextEncoder().encode(JSON.stringify(navigation.key)))) !==
      navigation.fingerprint
  )
    throw Error("修正版碰撞与导航没有成套绑定");
  validateMapManifest(map, { collisionHash: i.sourceHash });
  if (
    map.scene !== scene ||
    map.derivation?.bundleId !== id ||
    map.derivation?.originalManifestHash !== i.proofHashes.map ||
    map.derivation?.gaussianUnchanged !== true ||
    map.coverage.status !== "complete" ||
    map.layers.some((layer: any) =>
      layer.tiles.some(
        (t: any) =>
          !new RegExp("^/mf97-maps/" + scene + "/[a-zA-Z0-9_-]+\\.webp$").test(
            t.url,
          ),
      ),
    )
  )
    throw Error("修正版地图来源或瓦片路径不一致");
  return {
    bundle,
    collisionUrl: bundle.collisionUrl,
    navigationManifestUrl: bundle.navigationManifestUrl,
    navigationMapUrl: bundle.navigationMapUrl,
    originalUrl: bundle.originalUrl,
  };
}
