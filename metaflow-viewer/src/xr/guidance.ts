/** Describe only the currently usable input; never advertise unverified gestures. */
const xrGuidance = (
    controllers: number,
    hands: boolean,
    transient: boolean,
    comfort: boolean,
    free: boolean,
    ar: boolean,
    handMovement: 'teleport' | 'target' | 'forward' = 'teleport'
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
    if (controllers && free) keys.push(comfort ? 'help-observe-teleport' : 'help-observe-hold');
    if (!controllers) {
        keys.push(
            handMovement === 'forward'
                ? 'help-hand-forward'
                : handMovement === 'target' && free
                  ? 'help-hand-target'
                  : 'help-hand-teleport'
        );
    }
    keys.push(free ? 'help-free' : 'help-floor', 'help-calibrate', 'tracking-hint');
    return keys;
};
export { xrGuidance };
