type XrPreferences = { locomotion: 'continuous' | 'comfort'; posture: 'standing' | 'seated' };
const KEY = 'metaflow.xr.preferences.v1';
const defaults = (): XrPreferences => ({ locomotion: 'continuous', posture: 'standing' });
const loadPreferences = (): XrPreferences => {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return {
            locomotion: value?.locomotion === 'comfort' ? 'comfort' : 'continuous',
            posture: value?.posture === 'seated' ? 'seated' : 'standing'
        };
    } catch {
        return defaults();
    }
};
const savePreferences = (value: XrPreferences): void => {
    try {
        localStorage.setItem(KEY, JSON.stringify(value));
    } catch {
        /* Private mode still supports session preferences. */
    }
};
export { loadPreferences, savePreferences };
export type { XrPreferences };
