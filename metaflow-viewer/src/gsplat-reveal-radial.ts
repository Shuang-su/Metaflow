import { AppBase, BoundingBox, Entity, Vec3 } from 'playcanvas';

const shaderGLSL = /* glsl */`
uniform float uRevealTime;
uniform vec3 uRevealCenter;
uniform float uRevealRadius;
uniform float uRevealSpeed;
uniform float uRevealAcceleration;
uniform float uRevealDelay;
uniform float uRevealOscillation;
uniform float uRevealDotSize;
uniform float uRevealActive;

float gRevealDist;
float gRevealDotWave;
float gRevealLiftTime;
float gRevealLiftWave;
const float REVEAL_START_RADIUS = 0.005;
const float REVEAL_DOT_SCALE = 0.035;
const float REVEAL_DOT_PEAK_SCALE = 0.07;

float revealHash(vec3 p) {
    return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453);
}

void initReveal(vec3 center) {
    gRevealDist = length(center - uRevealCenter);
    gRevealDotWave = uRevealSpeed * uRevealTime + 0.5 * uRevealAcceleration * uRevealTime * uRevealTime;
    gRevealLiftTime = max(0.0, uRevealTime - uRevealDelay);
    gRevealLiftWave = uRevealSpeed * gRevealLiftTime + 0.5 * uRevealAcceleration * gRevealLiftTime * gRevealLiftTime;
}

void modifySplatCenter(inout vec3 center) {
    if (uRevealActive < 0.5) {
        return;
    }

    initReveal(center);
    if (gRevealDist > uRevealRadius) {
        return;
    }

    bool wavesActive = gRevealLiftTime <= 0.0 || gRevealDist > gRevealLiftWave - 1.5;
    if (wavesActive) {
        float phase = revealHash(center) * 6.28318;
        center.y += sin(uRevealTime * 3.0 + phase) * uRevealOscillation * 0.25;
    }
}

void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
    if (uRevealActive < 0.5) {
        scale = vec3(0.0);
        return;
    }

    if (gRevealDist > uRevealRadius) {
        scale = vec3(0.0);
        return;
    }

    vec3 originalScale = scale;
    float originalSize = gsplatGetSizeFromScale(scale);
    float revealScale;
    bool isLiftWave = gRevealLiftTime > 0.0 && gRevealLiftWave > gRevealDist;

    if (isLiftWave) {
        revealScale = (gRevealLiftWave >= gRevealDist + 2.0)
            ? 1.0
            : mix(REVEAL_DOT_SCALE, 1.0, (gRevealLiftWave - gRevealDist) * 0.5);
    } else if (gRevealDist > gRevealDotWave + REVEAL_START_RADIUS) {
        scale = vec3(0.0);
        return;
    } else if (gRevealDist > max(gRevealDotWave - 1.0, 0.0)) {
        float distToWave = abs(gRevealDist - gRevealDotWave);
        revealScale = (distToWave < 0.5)
            ? mix(REVEAL_DOT_SCALE, REVEAL_DOT_PEAK_SCALE, 1.0 - distToWave * 2.0)
            : mix(0.0, REVEAL_DOT_SCALE, smoothstep(gRevealDotWave + REVEAL_START_RADIUS, max(gRevealDotWave - 1.0, 0.0), gRevealDist));
    } else {
        revealScale = REVEAL_DOT_SCALE;
    }

    if (revealScale >= 1.0) {
        scale = originalScale;
        return;
    }

    if (isLiftWave) {
        float t = (revealScale - REVEAL_DOT_SCALE) / (1.0 - REVEAL_DOT_SCALE);
        float dotSize = uRevealDotSize;
        float finalSize = mix(dotSize, originalSize * revealScale, t);
        gsplatMakeSpherical(scale, min(finalSize, originalSize));
    } else {
        gsplatMakeSpherical(scale, min(uRevealDotSize * revealScale / REVEAL_DOT_SCALE, originalSize));
    }
}

void modifySplatColor(vec3 center, inout vec4 color) {
}
`;

const shaderWGSL = /* wgsl */`
uniform uRevealTime: f32;
uniform uRevealCenter: vec3f;
uniform uRevealRadius: f32;
uniform uRevealSpeed: f32;
uniform uRevealAcceleration: f32;
uniform uRevealDelay: f32;
uniform uRevealOscillation: f32;
uniform uRevealDotSize: f32;
uniform uRevealActive: f32;

var<private> gRevealDist: f32;
var<private> gRevealDotWave: f32;
var<private> gRevealLiftTime: f32;
var<private> gRevealLiftWave: f32;
const REVEAL_START_RADIUS: f32 = 0.005;
const REVEAL_DOT_SCALE: f32 = 0.035;
const REVEAL_DOT_PEAK_SCALE: f32 = 0.07;

fn revealHash(p: vec3f) -> f32 {
    return fract(sin(dot(p, vec3f(127.1, 311.7, 74.7))) * 43758.5453);
}

fn initReveal(center: vec3f) {
    gRevealDist = length(center - uniform.uRevealCenter);
    gRevealDotWave = uniform.uRevealSpeed * uniform.uRevealTime + 0.5 * uniform.uRevealAcceleration * uniform.uRevealTime * uniform.uRevealTime;
    gRevealLiftTime = max(0.0, uniform.uRevealTime - uniform.uRevealDelay);
    gRevealLiftWave = uniform.uRevealSpeed * gRevealLiftTime + 0.5 * uniform.uRevealAcceleration * gRevealLiftTime * gRevealLiftTime;
}

fn modifySplatCenter(center: ptr<function, vec3f>) {
    if (uniform.uRevealActive < 0.5) {
        return;
    }

    initReveal(*center);
    if (gRevealDist > uniform.uRevealRadius) {
        return;
    }

    let wavesActive = gRevealLiftTime <= 0.0 || gRevealDist > gRevealLiftWave - 1.5;
    if (wavesActive) {
        let phase = revealHash(*center) * 6.28318;
        (*center).y += sin(uniform.uRevealTime * 3.0 + phase) * uniform.uRevealOscillation * 0.25;
    }
}

fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {
    if (uniform.uRevealActive < 0.5) {
        *scale = vec3f(0.0);
        return;
    }

    if (gRevealDist > uniform.uRevealRadius) {
        *scale = vec3f(0.0);
        return;
    }

    let originalScale = *scale;
    let originalSize = gsplatGetSizeFromScale(*scale);
    var revealScale: f32;
    let isLiftWave = gRevealLiftTime > 0.0 && gRevealLiftWave > gRevealDist;

    if (isLiftWave) {
        revealScale = select(mix(REVEAL_DOT_SCALE, 1.0, (gRevealLiftWave - gRevealDist) * 0.5), 1.0, gRevealLiftWave >= gRevealDist + 2.0);
    } else if (gRevealDist > gRevealDotWave + REVEAL_START_RADIUS) {
        *scale = vec3f(0.0);
        return;
    } else if (gRevealDist > max(gRevealDotWave - 1.0, 0.0)) {
        let distToWave = abs(gRevealDist - gRevealDotWave);
        revealScale = select(
            mix(0.0, REVEAL_DOT_SCALE, smoothstep(gRevealDotWave + REVEAL_START_RADIUS, max(gRevealDotWave - 1.0, 0.0), gRevealDist)),
            mix(REVEAL_DOT_SCALE, REVEAL_DOT_PEAK_SCALE, 1.0 - distToWave * 2.0),
            distToWave < 0.5
        );
    } else {
        revealScale = REVEAL_DOT_SCALE;
    }

    if (revealScale >= 1.0) {
        *scale = originalScale;
        return;
    }

    if (isLiftWave) {
        let t = (revealScale - REVEAL_DOT_SCALE) / (1.0 - REVEAL_DOT_SCALE);
        let dotSize = uniform.uRevealDotSize;
        let finalSize = mix(dotSize, originalSize * revealScale, t);
        gsplatMakeSpherical(scale, min(finalSize, originalSize));
    } else {
        gsplatMakeSpherical(scale, min(uniform.uRevealDotSize * revealScale / REVEAL_DOT_SCALE, originalSize));
    }
}

fn modifySplatColor(center: vec3f, color: ptr<function, vec4f>) {
}
`;

type RevealMaterial = {
    getShaderChunks: (language: 'glsl' | 'wgsl') => Map<string, string>;
    setParameter: (name: string, value: number | number[]) => void;
    update: () => void;
    shaderChunksVersion?: string;
};

type RevealGsplatComponent = {
    unified?: boolean;
    material?: RevealMaterial | null;
    instance?: {
        material?: RevealMaterial | null;
    } | null;
    setWorkBufferModifier?: (value: { glsl: string; wgsl: string } | null) => void;
    setParameter?: (name: string, value: number | number[]) => void;
    deleteParameter?: (name: string) => void;
};

const tmpCenter = new Vec3();
const tmpExtents = new Vec3();
const tmpMin = new Vec3();
const tmpMax = new Vec3();
const DEFAULT_REVEAL_MIN_DURATION = 5.0;
const DEFAULT_REVEAL_SPEED = 0.6;
const DEFAULT_REVEAL_ACCELERATION = 3.5;
const DEFAULT_REVEAL_DELAY = 1.0;
const MAX_REVEAL_DELTA_TIME = 1 / 30;
const REVEAL_PACE_SCALE = 0.6;
const MEGA_VOXEL_PACE_SCALE = 0.85;
const REVEAL_REFERENCE_RADIUS = 20;
const WORKBUFFER_UPDATE_AUTO = 0;
const WORKBUFFER_UPDATE_ALWAYS = 2;
const SHADER_CHUNKS_VERSION = '2.25';
const LEGACY_ONLINE_DOT = 0.035 * 0.012;

type RevealDotProfile = 'characterSog' | 'streamingScene' | 'megaVoxel';

// uRevealDotSize：第一波稳定区球半径（世界单位）；dot 波前峰值约为 2×。
// 识别逻辑见 viewer.ts resolveRevealDotProfile。仅改数值无需 bump SHADER_CHUNKS_VERSION。
function calcRevealDotSize(profile: RevealDotProfile, radius: number): number {
    switch (profile) {
        case 'characterSog':
            // legacy-sog + experienceType=character（cyrene、remielle-dan）
            // 旧版线上 0.00042 的 1.5 倍；不随半径缩放 → 固定 0.00063
            return LEGACY_ONLINE_DOT * 1.5;
        case 'streamingScene':
            // 场景 SOG（c2-lib）与普通流式（无 voxelManifest）
            // clamp(radius * 系数, 下限, 上限)；r=30 → 0.00198
            // 调大：提高系数 / 下限 / 上限；调小：反向
            return Math.min(Math.max(radius * 0.000066, 0.0012), 0.015);
        case 'megaVoxel':
            // 有 voxelManifestUrl（Dayun）；大场景高空相机可见；r=100 → 0.022
            return Math.min(Math.max(radius * 0.00022, 0.004), 0.05);
    }
}

const REVEAL_UNIFORMS = [
    'uRevealTime',
    'uRevealCenter',
    'uRevealRadius',
    'uRevealSpeed',
    'uRevealAcceleration',
    'uRevealDelay',
    'uRevealOscillation',
    'uRevealDotSize',
    'uRevealActive'
];

type GsplatRevealRadialOptions = {
    streamingLod?: boolean;
    dotProfile?: RevealDotProfile;
    subjectBounds?: BoundingBox;
    onComplete?: () => void;
    onSubjectRevealed?: () => void;
};

class GsplatRevealRadial {
    private app: AppBase;

    private rootEntities: Entity[];

    private language: 'glsl' | 'wgsl';

    private materials = new Set<RevealMaterial>();

    private workBufferModifierComponents = new Set<RevealGsplatComponent>();

    private armed = false;

    private playing = false;

    private time = 0;

    private center = [0, 0, 0];

    private radius = 1;

    private waveRadius = 1;

    private subjectRadius = 1;

    private subjectRevealTime = 0;

    private subjectRevealedNotified = false;

    private readonly boundsMin = new Vec3();

    private readonly boundsMax = new Vec3();

    private speed = DEFAULT_REVEAL_SPEED;

    private acceleration = DEFAULT_REVEAL_ACCELERATION;

    private delay = DEFAULT_REVEAL_DELAY;

    private duration = DEFAULT_REVEAL_MIN_DURATION;

    private readonly streamingLod: boolean;

    private readonly dotProfile: RevealDotProfile;

    private readonly onComplete?: () => void;

    private readonly onSubjectRevealed?: () => void;

    private completed = false;

    private readonly materialCreatedHandler = (material: RevealMaterial) => {
        if (!this.armed) {
            return;
        }

        if (!this.hasNonUnifiedRoots()) {
            return;
        }

        this.applyToMaterial(material);
        this.updateUniforms();
        this.app.renderNextFrame = true;
    };

    private readonly updateHandler = (dt: number) => {
        this.update(dt);
    };

    constructor(
        app: AppBase,
        rootEntity: Entity | Entity[],
        bounds: BoundingBox,
        focusPoint?: Vec3,
        options?: GsplatRevealRadialOptions
    ) {
        this.app = app;
        this.rootEntities = Array.isArray(rootEntity) ? rootEntity : [rootEntity];
        this.language = app.graphicsDevice.isWebGPU ? 'wgsl' : 'glsl';
        this.streamingLod = options?.streamingLod ?? false;
        this.dotProfile = options?.dotProfile ?? 'streamingScene';
        this.onComplete = options?.onComplete;
        this.onSubjectRevealed = options?.onSubjectRevealed;

        this.boundsMin.copy(bounds.getMin());
        this.boundsMax.copy(bounds.getMax());
        tmpMin.copy(this.boundsMin);
        tmpMax.copy(this.boundsMax);
        tmpCenter.copy(tmpMin).add(tmpMax).mulScalar(0.5);
        tmpExtents.copy(tmpMax).sub(tmpCenter);

        if (focusPoint) {
            tmpCenter.copy(focusPoint);
        }

        this.center = [tmpCenter.x, tmpCenter.y, tmpCenter.z];
        this.radius = this.calcFarthestCornerRadius(tmpCenter, tmpMin, tmpMax);

        if (options?.subjectBounds) {
            tmpMin.copy(options.subjectBounds.getMin());
            tmpMax.copy(options.subjectBounds.getMax());
            this.subjectRadius = this.calcFarthestCornerRadius(tmpCenter, tmpMin, tmpMax);
        } else {
            this.subjectRadius = this.radius;
        }

        this.applyMotionProfile();
        this.subjectRevealTime = this.getLiftReachTime(this.subjectRadius);
        this.duration = Math.max(DEFAULT_REVEAL_MIN_DURATION, this.getCompletionTime());
    }

    attachEntity(entity: Entity, expandBounds?: BoundingBox) {
        if (this.rootEntities.includes(entity)) {
            return;
        }

        this.rootEntities.push(entity);

        if (expandBounds) {
            this.mergeRevealBounds(expandBounds);
        }

        if (!this.armed) {
            return;
        }

        const gsplat = entity.gsplat as RevealGsplatComponent | undefined;
        if (gsplat?.unified && gsplat.setWorkBufferModifier) {
            gsplat.setWorkBufferModifier({ glsl: shaderGLSL, wgsl: shaderWGSL });
            this.workBufferModifierComponents.add(gsplat);
        }

        this.applyToKnownMaterials();
        this.updateUniforms();
        this.app.renderNextFrame = true;
    }

    arm() {
        if (this.armed) {
            return;
        }

        this.armed = true;
        this.playing = false;
        this.time = 0;
        this.applyToUnifiedWorkBuffer();
        this.applyToKnownMaterials();
        this.updateUniforms();
        (this.app.systems as any).gsplat?.on?.('material:created', this.materialCreatedHandler);
        this.app.renderNextFrame = true;
    }

    beginVisiblePlayback() {
        if (!this.armed) {
            this.arm();
        }

        if (this.playing) {
            return;
        }

        this.applyToKnownMaterials();
        this.time = 0;
        this.updateUniforms();
        this.playing = true;
        this.app.on('update', this.updateHandler);
        this.app.renderNextFrame = true;
    }

    destroy() {
        this.app.off('update', this.updateHandler);
        (this.app.systems as any).gsplat?.off?.('material:created', this.materialCreatedHandler);
        this.setWorkBufferAlwaysUpdate(false);
        this.clearUnifiedWorkBuffer();
        for (const material of this.materials) {
            material.getShaderChunks(this.language).delete('gsplatModifyVS');
            material.update();
        }
        this.materials.clear();
        this.armed = false;
        this.playing = false;
        this.app.renderNextFrame = true;
    }

    private applyToKnownMaterials() {
        for (const gsplat of this.getGsplatComponents()) {
            if (gsplat?.unified) {
                continue;
            }

            this.applyOptionalMaterial(gsplat?.instance?.material);
            this.applyOptionalMaterial(gsplat?.material);
        }

        // PlayCanvas creates camera/layer-specific GSplat manager materials after the
        // component material is available. Reveal must patch those live materials too,
        // otherwise the template material updates but the rendered splats stay unchanged.
        const director = (this.app.renderer as any).gsplatDirector;
        const camerasMap = director?.camerasMap;
        if (!camerasMap?.forEach) {
            return;
        }

        camerasMap.forEach((cameraData: any) => {
            cameraData?.layersMap?.forEach?.((layerData: any) => {
                this.applyOptionalMaterial(layerData?.gsplatManager?.material);
                this.applyOptionalMaterial(layerData?.gsplatManagerShadow?.material);
            });
        });
    }

    private applyToUnifiedWorkBuffer() {
        for (const gsplat of this.getGsplatComponents()) {
            if (!gsplat?.unified || !gsplat.setWorkBufferModifier) {
                continue;
            }

            gsplat.setWorkBufferModifier({ glsl: shaderGLSL, wgsl: shaderWGSL });
            this.workBufferModifierComponents.add(gsplat);
        }
    }

    private clearUnifiedWorkBuffer() {
        if (this.workBufferModifierComponents.size === 0) {
            return;
        }

        for (const gsplat of this.workBufferModifierComponents) {
            gsplat.setWorkBufferModifier?.(null);
            for (const name of REVEAL_UNIFORMS) {
                gsplat.deleteParameter?.(name);
            }
        }
        this.workBufferModifierComponents.clear();
    }

    private setWorkBufferAlwaysUpdate(enable: boolean) {
        if (this.workBufferModifierComponents.size === 0) {
            return;
        }

        const mode = enable ? WORKBUFFER_UPDATE_ALWAYS : WORKBUFFER_UPDATE_AUTO;

        // Non-octree unified components render their own placement, so the component-level
        // setter is enough for them.
        for (const gsplat of this.workBufferModifierComponents) {
            (gsplat as any).workBufferUpdate = mode;
        }

        // Octree (streaming LOD) renders per-file child placements that do not inherit the
        // update mode. Reach them through the director and flag each active placement so the
        // work buffer re-bakes with the live reveal uniforms every frame.
        const director = (this.app.renderer as any).gsplatDirector;
        const camerasMap = director?.camerasMap;
        if (!camerasMap?.forEach) {
            return;
        }

        camerasMap.forEach((cameraData: any) => {
            cameraData?.layersMap?.forEach?.((layerData: any) => {
                for (const manager of [layerData?.gsplatManager, layerData?.gsplatManagerShadow]) {
                    manager?.octreeInstances?.forEach?.((instance: any) => {
                        instance?.activePlacements?.forEach?.((placement: any) => {
                            placement.workBufferUpdate = mode;
                        });
                    });
                }
            });
        });
    }

    private getGsplatComponents() {
        return this.rootEntities.map((entity) => entity.gsplat as RevealGsplatComponent | undefined);
    }

    private hasNonUnifiedRoots() {
        return this.getGsplatComponents().some((gsplat) => gsplat && !gsplat.unified);
    }

    private applyOptionalMaterial(material?: RevealMaterial | null) {
        if (!material) {
            return;
        }

        this.applyToMaterial(material);
    }

    private applyToMaterial(material: RevealMaterial) {
        if (this.materials.has(material)) {
            return;
        }

        material.getShaderChunks(this.language).set('gsplatModifyVS', this.language === 'wgsl' ? shaderWGSL : shaderGLSL);
        material.shaderChunksVersion = SHADER_CHUNKS_VERSION;
        material.update();
        this.materials.add(material);
    }

    private update(dt: number) {
        if (!this.playing) {
            return;
        }

        this.applyToKnownMaterials();
        if (this.materials.size === 0 && this.workBufferModifierComponents.size === 0) {
            this.app.renderNextFrame = true;
            return;
        }

        this.time += Math.min(Math.max(dt, 0), MAX_REVEAL_DELTA_TIME);

        if (!this.subjectRevealedNotified && this.time >= this.subjectRevealTime) {
            this.subjectRevealedNotified = true;
            this.onSubjectRevealed?.();
        }

        if (this.time >= this.duration) {
            if (!this.completed) {
                this.completed = true;
                this.onComplete?.();
            }
            this.destroy();
            return;
        }

        this.updateUniforms();

        // Unified gsplat (streaming LOD) bakes the work buffer modifier only when a
        // placement is first uploaded, so uRevealTime stays frozen per chunk. The
        // engine re-bakes a placement when its workBufferUpdate is ALWAYS, but octree
        // file placements never inherit that flag from the component. Set it directly on
        // the rendered placements each frame so the modifier re-runs with the live time.
        if (this.workBufferModifierComponents.size > 0) {
            this.setWorkBufferAlwaysUpdate(true);
        }

        this.app.renderNextFrame = true;
    }

    private updateUniforms() {
        const values: [string, number | number[]][] = [
            ['uRevealTime', this.time],
            ['uRevealCenter', this.center],
            ['uRevealRadius', this.radius],
            ['uRevealSpeed', this.speed],
            ['uRevealAcceleration', this.acceleration],
            ['uRevealDelay', this.delay],
            ['uRevealOscillation', Math.min(Math.max(this.radius * 0.002, 0.025), 0.16)],
            ['uRevealDotSize', calcRevealDotSize(this.dotProfile, this.radius)],
            ['uRevealActive', this.playing ? 1 : 0]
        ];

        if (this.workBufferModifierComponents.size > 0) {
            for (const gsplat of this.workBufferModifierComponents) {
                for (const [name, value] of values) {
                    gsplat.setParameter?.(name, value);
                }
            }
        }

        if (this.materials.size === 0 && this.workBufferModifierComponents.size === 0) {
            return;
        }

        for (const material of this.materials) {
            for (const [name, value] of values) {
                material.setParameter(name, value);
            }
            material.update();
        }
    }

    private getLiftReachTime(targetRadius: number) {
        if (this.acceleration === 0) {
            return this.delay + targetRadius / Math.max(this.speed, 0.0001);
        }

        const discriminant = this.speed * this.speed + 2 * this.acceleration * targetRadius;
        return this.delay + (-this.speed + Math.sqrt(Math.max(discriminant, 0))) / this.acceleration;
    }

    private getCompletionTime() {
        return this.getLiftReachTime(this.waveRadius);
    }

    private mergeRevealBounds(bounds: BoundingBox) {
        const min = bounds.getMin();
        const max = bounds.getMax();
        this.boundsMin.x = Math.min(this.boundsMin.x, min.x);
        this.boundsMin.y = Math.min(this.boundsMin.y, min.y);
        this.boundsMin.z = Math.min(this.boundsMin.z, min.z);
        this.boundsMax.x = Math.max(this.boundsMax.x, max.x);
        this.boundsMax.y = Math.max(this.boundsMax.y, max.y);
        this.boundsMax.z = Math.max(this.boundsMax.z, max.z);

        tmpCenter.set(this.center[0], this.center[1], this.center[2]);
        this.radius = this.calcFarthestCornerRadius(tmpCenter, this.boundsMin, this.boundsMax);
        this.waveRadius = this.radius;
        this.duration = Math.max(DEFAULT_REVEAL_MIN_DURATION, this.getCompletionTime());
    }

    private applyMotionProfile() {
        this.waveRadius = this.radius;
        if (this.dotProfile === 'megaVoxel') {
            this.fitWaveToSceneSize();
            this.speed *= MEGA_VOXEL_PACE_SCALE;
            this.acceleration *= MEGA_VOXEL_PACE_SCALE;
            // Slower lift wave start tracks pace so dot/lift gap stays proportionally wider.
            this.delay = DEFAULT_REVEAL_DELAY / MEGA_VOXEL_PACE_SCALE;
            return;
        }

        this.speed = DEFAULT_REVEAL_SPEED * REVEAL_PACE_SCALE;
        this.acceleration = DEFAULT_REVEAL_ACCELERATION * REVEAL_PACE_SCALE;
        this.delay = DEFAULT_REVEAL_DELAY;
    }

    private fitWaveToSceneSize() {
        if (this.radius <= REVEAL_REFERENCE_RADIUS) {
            return;
        }

        const refDiscriminant = DEFAULT_REVEAL_SPEED * DEFAULT_REVEAL_SPEED
            + 2 * DEFAULT_REVEAL_ACCELERATION * REVEAL_REFERENCE_RADIUS;
        const crossTime = Math.max(
            (-DEFAULT_REVEAL_SPEED + Math.sqrt(refDiscriminant)) / DEFAULT_REVEAL_ACCELERATION,
            0.1
        );
        this.speed = DEFAULT_REVEAL_SPEED;
        this.acceleration = Math.max(
            0.0001,
            2 * Math.max(this.radius - this.speed * crossTime, 0.0001) / (crossTime * crossTime)
        );
    }

    private calcFarthestCornerRadius(center: Vec3, min: Vec3, max: Vec3) {
        let radiusSq = 0;
        for (const x of [min.x, max.x]) {
            for (const y of [min.y, max.y]) {
                for (const z of [min.z, max.z]) {
                    const dx = x - center.x;
                    const dy = y - center.y;
                    const dz = z - center.z;
                    radiusSq = Math.max(radiusSq, dx * dx + dy * dy + dz * dz);
                }
            }
        }

        return Math.max(Math.sqrt(radiusSq), 1);
    }
}

export {
    GsplatRevealRadial,
    calcRevealDotSize,
    shaderGLSL as gsplatRevealRadialGLSL,
    shaderWGSL as gsplatRevealRadialWGSL,
    type GsplatRevealRadialOptions,
    type RevealDotProfile
};
