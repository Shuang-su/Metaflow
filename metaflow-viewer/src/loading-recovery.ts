type LoadingObservation = {
    loaded: boolean;
    hidden: boolean;
    frame: number;
    progress: number;
    stage: string;
    status: string;
};
/** No automatic reload: a suspended headset is not a failed download. */
class LoadingRecovery {
    private signature = '';
    private changedAt = 0;
    private startedAt: number | null = null;
    observe(now: number, state: LoadingObservation): 'failed' | 'waiting-frame' | 'stalled' | null {
        if (state.loaded || state.hidden) {
            this.startedAt = null;
            this.signature = '';
            return null;
        }
        if (this.startedAt === null) this.startedAt = now;
        const signature = JSON.stringify([state.progress, state.stage, state.status]);
        if (signature !== this.signature) {
            this.signature = signature;
            this.changedAt = now;
        }
        if (state.stage === 'error') return 'failed';
        if (state.frame === 0 && now - this.startedAt >= 20000) return 'waiting-frame';
        if (now - this.changedAt >= 30000) return 'stalled';
        return null;
    }
}
export { LoadingRecovery };
