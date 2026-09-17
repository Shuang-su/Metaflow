import { Vec3 } from 'playcanvas';
import type { XrInputSource } from 'playcanvas';

class PalmIntent {
    visible = false;
    private since: number | null = null;
    update(now: number, angle: number | null): boolean {
        if (angle === null || !Number.isFinite(angle) || angle > 50) {
            this.visible = false;
            this.since = null;
        } else if (!this.visible) {
            if (angle <= 35) {
                this.since ??= now;
                if (now - this.since >= 300) this.visible = true;
            } else this.since = null;
        }
        return this.visible;
    }
}
/** Joint positions are already transformed by the engine into world space. */
const palmFacing = (source: XrInputSource, head: Vec3): { angle: number; position: Vec3 } | null => {
    const hand = source.hand;
    if (!hand?.tracking || !['left', 'right'].includes(source.handedness)) return null;
    const wrist = hand.getJointById('wrist')?.getPosition();
    const index = hand.getJointById('index-finger-metacarpal')?.getPosition();
    const pinky = hand.getJointById('pinky-finger-metacarpal')?.getPosition();
    if (!wrist || !index || !pinky) return null;
    const a = new Vec3().sub2(index, wrist),
        b = new Vec3().sub2(pinky, wrist);
    const normal = new Vec3().cross(a, b);
    if (normal.length() < 0.00001) return null;
    if (source.handedness === 'left') normal.mulScalar(-1);
    normal.normalize();
    const position = new Vec3().add2(index, pinky).mulScalar(0.5);
    const toHead = new Vec3().sub2(head, position).normalize();
    return { angle: (Math.acos(Math.max(-1, Math.min(1, normal.dot(toHead)))) * 180) / Math.PI, position };
};
export { PalmIntent, palmFacing };
