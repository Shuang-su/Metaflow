import { portableProject, readProject, type StudioProject } from './document';

const prefix = 'metaflow-studio-draft-v1:';
export type DraftStorage = Pick<Storage, 'length' | 'key' | 'getItem' | 'setItem'>;
export type StudioDraft = { key: string; savedAt: string; project: StudioProject };
// Each browser page owns its draft key, so opening a fresh page cannot replace
// another page's unsaved work. Store configuration only; source models stay external.
export const saveDraft = (storage: DraftStorage, session: string, project: StudioProject): StudioDraft => {
    const models = project.assets.filter(a => a.role === 'model').map(a => a.name).sort();
    const key = `${prefix}${session}:${encodeURIComponent(models.join('|'))}`;
    const data = { savedAt: new Date().toISOString(), project: portableProject(project) };
    storage.setItem(key, JSON.stringify(data)); // Quota/security failures must be visible; never clear old drafts.
    return { key, ...data };
};
export const readDrafts = (storage: DraftStorage): StudioDraft[] => {
    const result: StudioDraft[] = [];
    for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(prefix)) continue;
        try {
            const raw = JSON.parse(storage.getItem(key));
            if (typeof raw.savedAt !== 'string' || !Number.isFinite(Date.parse(raw.savedAt))) continue;
            result.push({ key, savedAt: raw.savedAt, project: readProject(raw.project) });
        } catch { /* Keep damaged entries intact; omit them from restoration choices. */ }
    }
    return result.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
};
