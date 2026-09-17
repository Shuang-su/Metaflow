/** Describe only the currently usable input; never advertise unverified gestures. */
const xrGuidance = (
    controllers: number,
    hands: boolean,
    transient: boolean,
    comfort: boolean,
    free: boolean,
    ar: boolean
): string[] => {
    if (!controllers && !hands && !transient) return ['input-wait', 'tracking-hint'];
    if (ar) return ['menu-hint', 'tracking-hint'];
    const keys = controllers
        ? [
              comfort && !free ? 'comfort-hint' : controllers === 1 ? 'help-single' : 'help-move',
              'help-wheel',
              comfort && !free ? 'help-select' : 'help-controller-select'
          ]
        : [transient ? 'help-transient' : 'hand-hint', 'help-hand-menu'];
    if (controllers && comfort) keys.push('help-turn');
    keys.push(free ? 'help-free' : 'help-floor', 'help-calibrate', 'tracking-hint');
    return keys;
};
export { xrGuidance };
