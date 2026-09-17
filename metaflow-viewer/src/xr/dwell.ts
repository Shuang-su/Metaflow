/** A menu-only timer. Missing frames never count as time spent pointing. */
class DwellInput {
    target: string | null = null;
    progress = 0;
    private elapsed = 0;
    private last: number | null = null;
    private outside: number | null = null;
    private blocked = false;
    private away: number | null = null;

    reset(requireLeave = false): void {
        this.target = null;
        this.progress = this.elapsed = 0;
        this.last = this.outside = this.away = null;
        this.blocked = requireLeave;
    }

    update(now: number, target: string | null, inConfirm: boolean, duration: number): string | null {
        const delta = this.last === null ? 0 : Math.max(0, now - this.last);
        this.last = now;
        if (delta > 250) {
            this.reset(true);
            this.last = now;
        }
        if (this.blocked) {
            if (!inConfirm) {
                this.away ??= now;
                if (now - this.away >= 200) {
                    this.blocked = false;
                    this.last = now;
                }
            } else this.away = null;
            return null;
        }
        if (target !== this.target || target === null) {
            this.target = target;
            this.elapsed = this.progress = 0;
            this.outside = null;
            return null;
        }
        if (!inConfirm) {
            this.outside ??= now;
            if (now - this.outside > 100) this.elapsed = this.progress = 0;
            return null;
        }
        if (this.outside !== null) {
            if (now - this.outside > 100) this.elapsed = this.progress = 0;
            this.outside = null;
        } else this.elapsed += delta;
        this.progress = Math.max(0, Math.min(1, (this.elapsed - 200) / (duration - 200)));
        if (this.progress < 1) return null;
        const result = this.target;
        this.reset(true);
        return result;
    }
}
export { DwellInput };
