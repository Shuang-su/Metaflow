import type { NavigationTaskState } from './contracts';
/** Elapsed time decorates active work; it can never turn a terminal result into a query. */
export class NavigationTask {
    state: NavigationTaskState = 'idle';
    message = '';
    started = 0;
    set(state: NavigationTaskState, message: string, now = performance.now()) {
        if (state === 'computing' && this.state !== state) this.started = now;
        this.state = state;
        this.message = message;
    }
    begin(message: string, now = performance.now()) {
        this.started = now;
        this.set('computing', message, now);
    }
    text(now = performance.now()) {
        if (this.state !== 'computing') return this.message;
        if (now - this.started > 5000) return '仍在计算，可继续行走或取消';
        if (now - this.started > 1000) return '正在寻找路线，可继续行走';
        return this.message || '正在寻找路线，可继续行走';
    }
}
