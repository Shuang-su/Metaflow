type XrPreferences = {
    locomotion: 'continuous' | 'comfort';
    posture: 'standing' | 'seated';
    movementSpeed: number;
    rotateSpeed: number;
    trajectory: 'arc' | 'straight';
};
const KEY = 'metaflow.xr.preferences.v1';
const defaults = (): XrPreferences => ({
    locomotion: 'continuous',
    posture: 'standing',
    movementSpeed: 1.5,
    rotateSpeed: 90,
    trajectory: 'arc'
});
const loadPreferences = (): XrPreferences => {
    try {
        const value = JSON.parse(localStorage.getItem(KEY) ?? '{}');
        return {
            locomotion: value?.locomotion === 'comfort' ? 'comfort' : 'continuous',
            posture: value?.posture === 'seated' ? 'seated' : 'standing',
            movementSpeed: [0.75, 1.5, 2.25].includes(value?.movementSpeed) ? value.movementSpeed : 1.5,
            rotateSpeed: [45, 90, 120].includes(value?.rotateSpeed) ? value.rotateSpeed : 90,
            trajectory: value?.trajectory === 'straight' ? 'straight' : 'arc'
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
