/** Stick navigation is independent of the tracked ray and uses unscaled axes. */
const wheelSelection = (axes: readonly number[], previous: number): number => {
    const offset = axes.length >= 4 ? 2 : 0;
    const x = axes[offset],
        y = axes[offset + 1];
    if (!Number.isFinite(x) || !Number.isFinite(y)) return -1;
    const length = Math.hypot(x, y);
    if (length < 0.25) return -1;
    if (length <= 0.55) return previous;
    const angle = ((Math.atan2(x, -y) * 180) / Math.PI + 360) % 360;
    if (previous >= 0) {
        const delta = Math.abs(((angle - previous * 90 + 540) % 360) - 180);
        if (delta <= 53) return previous;
    }
    return Math.round(angle / 90) % 4;
};

class WheelInput {
    selection = -1;
    armed = false;
    private pressed: number | null = null;

    update(axes: readonly number[], trigger: boolean): void {
        if (!this.armed) {
            if (wheelSelection(axes, -1) === -1) {
                const offset = axes.length >= 4 ? 2 : 0;
                if (Math.hypot(axes[offset], axes[offset + 1]) < 0.25 && !trigger) this.armed = true;
            }
            return;
        }
        this.selection = wheelSelection(axes, this.selection);
    }

    begin(): void {
        this.pressed = this.armed ? this.selection : null;
    }
    commit(): number | null {
        const result = this.armed && this.pressed === this.selection ? this.pressed : null;
        this.pressed = null;
        return result;
    }
    release(): void {
        this.pressed = null;
    }
    cancel(): void {
        this.selection = -1;
        this.armed = false;
        this.pressed = null;
    }
    get pressing(): boolean {
        return this.pressed !== null;
    }
}
export { WheelInput, wheelSelection };
