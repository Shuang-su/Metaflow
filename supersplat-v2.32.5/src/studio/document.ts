import { importSettings, validateSettings, type ExperienceSettings } from '../../../metaflow-viewer/src/settings';

export type OverlayMode = 'off' | 'selected' | 'titles';
export type AssetRef = { name: string; role: 'model' | 'skybox' | 'collision'; size?: number; modified?: number; url?: string; lod?: number; generated?: boolean };
export type StudioProject = {
    format: 'metaflow-studio'; version: 2; name: string;
    experience: ExperienceSettings;
    assets: AssetRef[];
    timeline: { frames: number; frameRate: number; frame: number; smoothness: number; loop: boolean; loopMode?: 'none' | 'repeat' | 'pingpong' };
    video: { overlay: OverlayMode; selected: number; [key: string]: unknown };
};
export const clone = <T>(value: T): T => structuredClone(value);
export const createProject = (): StudioProject => ({
    format: 'metaflow-studio',
    version: 2,
    name: '未命名场景',
    assets: [],
    experience: importSettings({ version: 2,
        tonemapping: 'none',
        highPrecisionRendering: true,
        background: { color: [0.055, 0.065, 0.08] },
        postEffectSettings: { bloom: { intensity: 0.1 }, grading: { brightness: 1 } },
        cameras: [],
        annotations: [],
        animTracks: [],
        startMode: 'default' }),
    timeline: { frames: 181, frameRate: 30, frame: 0, smoothness: 1, loop: true, loopMode: 'repeat' },
    video: { overlay: 'off', selected: -1 }
});
const merge = (raw: any, normalized: any): any => {
    if (Array.isArray(normalized)) return normalized.map((v, i) => merge(raw?.[i], v));
    if (!normalized || typeof normalized !== 'object') return normalized;
    const result = { ...raw };
    for (const [key, value] of Object.entries(normalized)) result[key] = merge(raw?.[key], value);
    return result;
};
export const readExperience = (raw: unknown): ExperienceSettings => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('设置必须是 JSON 对象');
    if ('format' in raw && raw.format === 'metaflow-studio') throw new Error('这是 Studio 工程，请使用“文件 → 打开工程”');
    if (!('cameras' in raw) && !('camera' in raw)) throw new Error('这不是展示设置 JSON；模型索引请使用“打开模型”或“打开模型文件夹”');
    // The existing Viewer owns version migration and validation. Preserve additional
    // fields recursively, including unknown post-effect and annotation metadata.
    const normalized = importSettings(clone(raw));
    const result = merge(raw, normalized);
    validateSettings(result);
    if (result.cameras.some((c: any) => c.initial.fov <= 0 || c.initial.fov >= 180)) throw new Error('相机 FOV 必须在 0–180 度之间');
    for (const track of result.animTracks) {
        const { times, values } = track.keyframes;
        if (values.position.length !== times.length * 3 || values.target.length !== times.length * 3 || values.fov.length !== times.length ||
            times.some((v: number, i: number) => v < 0 || (i > 0 && v <= times[i - 1]))) throw new Error('相机关键帧的时间或数组长度无效');
    }
    return result;
};
export const readProject = (raw: any): StudioProject => {
    if (raw?.format !== 'metaflow-studio' || ![1, 2].includes(raw.version)) throw new Error('不支持的 Studio 工程版本');
    const project = clone(raw) as StudioProject;
    project.experience = readExperience(raw.experience);
    if (typeof project.name !== 'string' || !Array.isArray(project.assets) || project.assets.some(a => !a || typeof a.name !== 'string' || !a.name || !['model', 'skybox', 'collision'].includes(a.role) ||
        (a.lod !== undefined && (!Number.isSafeInteger(a.lod) || a.lod < 0)) ||
        (a.size !== undefined && (!Number.isSafeInteger(a.size) || a.size < 0)) ||
        (a.modified !== undefined && !Number.isFinite(a.modified)) || (a.url !== undefined && typeof a.url !== 'string'))) throw new Error('工程资产记录无效');
    const t = project.timeline;
    if (!t || ![t.frames, t.frameRate, t.frame, t.smoothness].every(Number.isFinite) || t.frames < 1 || t.frameRate <= 0 || t.frame < 0 || t.frame >= t.frames || typeof t.loop !== 'boolean') throw new Error('时间线设置无效');
    if (raw.version === 1) {
        // v1's editing timeline interpreted its first track as seconds. Preserve
        // that local authoring result; external Experience Settings always use frames.
        const first = project.experience.animTracks[0];
        if (first) first.keyframes.times = first.keyframes.times.map(time => time * t.frameRate);
        project.version = 2;
    }
    t.loopMode ??= t.loop ? 'repeat' : 'none';
    if (!['none', 'repeat', 'pingpong'].includes(t.loopMode)) throw new Error('时间线循环模式无效');
    if (!['off', 'selected', 'titles'].includes(project.video?.overlay) || !Number.isInteger(project.video.selected)) throw new Error('视频叠加设置无效');
    return project;
};
export const compatibilityWarnings = (settings: ExperienceSettings): string[] => {
    const warnings: string[] = [];
    if (settings.background.gradient) warnings.push('渐变背景为 Metaflow 扩展；SuperSplat 可能只显示基础背景色。');
    if (settings.annotations.length > 25) warnings.push('标记超过线上 Studio 的 25 个创作数量参考值，全部保留；线上继续编辑能力需单独确认。');
    if (settings.animTracks.length > 1) warnings.push('仅编辑第一条相机动画，其余动画原样保留。');
    if (settings.animTracks.some(t => t.interpolation === 'step')) warnings.push('时间线编辑采用样条；未编辑的原始步进插值保留。');
    if (settings.soundUrl) warnings.push('音轨引用保留，本原型不播放或输出音轨。');
    const pose = { position: [0], target: [0], fov: 0 };
    const template = { ...createProject().experience,
        hasStartPose: false,
        soundUrl: '',
        background: { color: [0], skyboxUrl: '', gradient: {} },
        cameras: [{ initial: pose }],
        annotations: [{ position: [0], title: '', text: '', camera: { initial: pose }, extras: { metaflow: { nav: { enabled: false } } } }],
        animTracks: [{ name: '', duration: 0, frameRate: 0, loopMode: '', interpolation: '', smoothness: 0, keyframes: { times: [0], values: { position: [0], target: [0], fov: [0] } } }] };
    const extras: string[] = [];
    const findExtras = (value: any, known: any, path = '') => {
        if (Array.isArray(value)) {
            if (known?.[0]) value.forEach((entry, i) => findExtras(entry, known[0], `${path}[${i}]`));
        } else if (value && typeof value === 'object') {
            for (const [key, child] of Object.entries(value)) {
                const next = path ? `${path}.${key}` : key;
                if (!known || !(key in known)) extras.push(next);
                else if (next !== 'background.gradient') findExtras(child, known[key], next);
            }
        }
    };
    findExtras(settings, template);
    if (extras.length) warnings.push(`扩展字段原样保留，暂不编辑：${extras.slice(0, 8).join('、')}${extras.length > 8 ? ` 等 ${extras.length} 项` : ''}`);
    return warnings;
};
export const portableProject = (project: StudioProject): StudioProject => {
    const result = readProject(project);
    const walk = (value: any) => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (typeof child === 'string' && child.startsWith('blob:')) throw new Error(`无法保存临时资产地址：${key}，请重新关联资产`);
            walk(child);
        }
    };
    walk(result);
    return result;
};

// Settings export uses the same migration/validation boundary as import, while
// keeping the source document and unknown extension fields untouched.
export const portableExperience = (settings: unknown): ExperienceSettings => {
    const result = readExperience(settings);
    const walk = (value: any, path = 'settings') => {
        if (!value || typeof value !== 'object') return;
        for (const [key, child] of Object.entries(value)) {
            if (key !== 'title' && key !== 'text' && typeof child === 'string' && /^(?:blob:|file:)/i.test(child)) throw new Error(`无法导出临时或本机资产地址：${path}.${key}，请重新关联资产`);
            walk(child, `${path}.${key}`);
        }
    };
    walk(result);
    return result;
};
