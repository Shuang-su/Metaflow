import { AppBase, BoundingBox, Entity, Vec3 } from 'playcanvas';

const shaderGLSL = /* glsl */`
uniform float uRevealTime;
uniform vec3 uRevealCenter;
uniform float uRevealRadius;
uniform float uRevealSpeed;
uniform float uRevealAcceleration;
uniform float uRevealDelay;
uniform float uRevealOscillation;

float gRevealDist;
float gRevealDotWave;
float gRevealLiftTime;
float gRevealLiftWave;
const float REVEAL_START_RADIUS = 0.005;
const float REVEAL_DOT_SCALE = 0.035;
const float REVEAL_DOT_PEAK_SCALE = 0.07;
const float REVEAL_DOT_SIZE = 0.012;

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
    initReveal(center);
    if (gRevealDist > uRevealRadius) {
        return;
    }

    bool wavesActive = gRevealLiftTime <= 0.0 || gRevealDist > gRevealLiftWave - 1.5;
    if (wavesActive) {
        float phase = revealHash(center) * 6.28318;
        center.y += sin(uRevealTime * 3.0 + phase) * uRevealOscillation * 0.25;
    }

    float distToLiftWave = abs(gRevealDist - gRevealLiftWave);
    if (distToLiftWave < 1.0 && gRevealLiftTime > 0.0) {
        float liftAmount = (1.0 - distToLiftWave) * sin(distToLiftWave * 3.14159);
        center.y += liftAmount * uRevealOscillation * 0.9;
    }
}

void modifySplatRotationScale(vec3 originalCenter, vec3 modifiedCenter, inout vec4 rotation, inout vec3 scale) {
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
        float dotSize = revealScale * REVEAL_DOT_SIZE;
        float finalSize = mix(dotSize, originalSize * revealScale, t);
        gsplatMakeSpherical(scale, min(finalSize, originalSize));
    } else {
        gsplatMakeSpherical(scale, min(revealScale * REVEAL_DOT_SIZE, originalSize));
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

var<private> gRevealDist: f32;
var<private> gRevealDotWave: f32;
var<private> gRevealLiftTime: f32;
var<private> gRevealLiftWave: f32;
const REVEAL_START_RADIUS: f32 = 0.005;
const REVEAL_DOT_SCALE: f32 = 0.035;
const REVEAL_DOT_PEAK_SCALE: f32 = 0.07;
const REVEAL_DOT_SIZE: f32 = 0.012;

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
    initReveal(*center);
    if (gRevealDist > uniform.uRevealRadius) {
        return;
    }

    let wavesActive = gRevealLiftTime <= 0.0 || gRevealDist > gRevealLiftWave - 1.5;
    if (wavesActive) {
        let phase = revealHash(*center) * 6.28318;
        (*center).y += sin(uniform.uRevealTime * 3.0 + phase) * uniform.uRevealOscillation * 0.25;
    }

    let distToLiftWave = abs(gRevealDist - gRevealLiftWave);
    if (distToLiftWave < 1.0 && gRevealLiftTime > 0.0) {
        let liftAmount = (1.0 - distToLiftWave) * sin(distToLiftWave * 3.14159);
        (*center).y += liftAmount * uniform.uRevealOscillation * 0.9;
    }
}

fn modifySplatRotationScale(originalCenter: vec3f, modifiedCenter: vec3f, rotation: ptr<function, vec4f>, scale: ptr<function, vec3f>) {
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
        let dotSize = revealScale * REVEAL_DOT_SIZE;
        let finalSize = mix(dotSize, originalSize * revealScale, t);
        gsplatMakeSpherical(scale, min(finalSize, originalSize));
    } else {
        gsplatMakeSpherical(scale, min(revealScale * REVEAL_DOT_SIZE, originalSize));
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
const DEFAULT_REVEAL_SPEED = 1.0;
const DEFAULT_REVEAL_ACCELERATION = 5.0;
const DEFAULT_REVEAL_DELAY = 2.0;
const MAX_REVEAL_DELTA_TIME = 1 / 30;
const SHADER_CHUNKS_VERSION = '2.19';
const REVEAL_UNIFORMS = [
    'uRevealTime',
    'uRevealCenter',
    'uRevealRadius',
    'uRevealSpeed',
    'uRevealAcceleration',
    'uRevealDelay',
    'uRevealOscillation'
];

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

    private speed = DEFAULT_REVEAL_SPEED;

    private acceleration = DEFAULT_REVEAL_ACCELERATION;

    private readonly delay = DEFAULT_REVEAL_DELAY;

    private duration = DEFAULT_REVEAL_MIN_DURATION;

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

    constructor(app: AppBase, rootEntity: Entity | Entity[], bounds: BoundingBox, focusPoint?: Vec3) {
        this.app = app;
        this.rootEntities = Array.isArray(rootEntity) ? rootEntity : [rootEntity];
        this.language = app.graphicsDevice.isWebGPU ? 'wgsl' : 'glsl';

        tmpMin.copy(bounds.getMin());
        tmpMax.copy(bounds.getMax());
        tmpCenter.copy(tmpMin).add(tmpMax).mulScalar(0.5);
        tmpExtents.copy(tmpMax).sub(tmpCenter);

        if (focusPoint) {
            tmpCenter.copy(focusPoint);
        }

        this.center = [tmpCenter.x, tmpCenter.y, tmpCenter.z];
        this.radius = this.calcFarthestCornerRadius(tmpCenter, tmpMin, tmpMax);
        this.fitMotionToMinimumDuration();
        this.duration = Math.max(DEFAULT_REVEAL_MIN_DURATION, this.getCompletionTime());
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
        if (this.time >= this.duration) {
            this.destroy();
            return;
        }

        this.updateUniforms();
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
            ['uRevealOscillation', Math.min(Math.max(this.radius * 0.002, 0.025), 0.16)]
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

    private getCompletionTime() {
        if (this.acceleration === 0) {
            return this.delay + this.radius / Math.max(this.speed, 0.0001);
        }

        const discriminant = this.speed * this.speed + 2 * this.acceleration * this.radius;
        return this.delay + (-this.speed + Math.sqrt(Math.max(discriminant, 0))) / this.acceleration;
    }

    private fitMotionToMinimumDuration() {
        const liftTravelTime = Math.max(DEFAULT_REVEAL_MIN_DURATION - this.delay, 0.1);
        this.speed = Math.min(DEFAULT_REVEAL_SPEED, this.radius * 0.15 / liftTravelTime);
        this.acceleration = Math.max(
            0.0001,
            2 * Math.max(this.radius - this.speed * liftTravelTime, 0.0001) / (liftTravelTime * liftTravelTime)
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

export { GsplatRevealRadial, shaderGLSL as gsplatRevealRadialGLSL, shaderWGSL as gsplatRevealRadialWGSL };
