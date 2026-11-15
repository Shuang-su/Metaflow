// Lifetimes and gesture phase advance by actual foreground elapsed time.
// Only physics/interpolation integration is clamped; sharing the clamp with the
// lifetime clock stretched a 2.8s gesture to ~56s at one rendered frame/second.
export function frameDelta(nowMs,previousMs){
  const elapsed=Number.isFinite(nowMs)&&Number.isFinite(previousMs)?Math.max(0,(nowMs-previousMs)/1000):0;
  return {elapsed,simulationDelta:Math.min(elapsed,.05)};
}
