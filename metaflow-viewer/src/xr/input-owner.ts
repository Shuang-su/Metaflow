type InputKind = 'direct' | 'dwell' | 'stick';
/** Ownership is acquired by intent, never by discovery order. */
class InputOwner<T> {
    source: T | null = null;
    kind: InputKind | null = null;
    claim(source: T, kind: InputKind): boolean {
        if (this.source !== null && this.source !== source) return false;
        if (this.kind === 'direct' && kind !== 'direct') return false;
        this.source = source;
        this.kind = kind;
        return true;
    }
    release(source: T): void {
        if (source === this.source) this.clear();
    }
    clear(): void {
        this.source = null;
        this.kind = null;
    }
}
export { InputOwner };
