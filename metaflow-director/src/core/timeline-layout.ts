import { clamp, layoutShots, totalDuration, type Shot } from "./model";

/** Film frames have a 40px transition gap and a separate 19px ruler lead-in. */
export function timelineLayout(shots: Shot[], width: number) {
  const compact = width <= 760;
  const origin = compact ? 38 : 52,
    right = compact ? 8 : 22;
  const visibleDuration = Math.max(14, totalDuration(shots) + 2);
  const scale = Math.max(20, (width - origin - right) / visibleDuration);
  let left = origin;
  const clips = layoutShots(shots).map((row, index) => {
    const size = Math.max(40, row.shot.duration * scale);
    const clip = {
      ...row,
      left,
      width: size,
      rulerStart: left + (index > 0 ? -20 : -19),
      rulerEnd: left + size + (index < shots.length - 1 ? 20 : 19),
    };
    left += size + 40;
    return clip;
  });
  const position = (time: number, selected?: string) => {
    const last = clips.at(-1);
    // The visible ruler continues past the last shot; those marks must not
    // collapse onto the shot endpoint even though seeking remains bounded.
    if (last && time > last.end)
      return last.rulerEnd + (time - last.end) * scale;
    const selectedClip = clips.find(
      (c) => c.shot.id === selected && time >= c.start && time <= c.end,
    );
    const clip =
      selectedClip ?? clips.findLast((c) => time >= c.start) ?? clips[0];
    return clip
      ? clip.rulerStart +
          clamp((time - clip.start) / clip.shot.duration, 0, 1) *
            (clip.rulerEnd - clip.rulerStart)
      : origin - 19;
  };
  const timeAt = (x: number) => {
    if (!clips.length) return 0;
    let nearest = clips[0],
      distance = Infinity;
    for (const clip of clips) {
      const d = Math.max(clip.rulerStart - x, x - clip.rulerEnd, 0);
      if (d < distance) {
        nearest = clip;
        distance = d;
      }
    }
    return (
      nearest.start +
      clamp(
        (x - nearest.rulerStart) / (nearest.rulerEnd - nearest.rulerStart),
        0,
        1,
      ) *
        nearest.shot.duration
    );
  };
  return {
    clips,
    scale,
    visibleDuration,
    addLeft: left,
    width: Math.max(width, left + 60 + right),
    position,
    timeAt,
  };
}
