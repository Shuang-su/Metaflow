let context: AudioContext | undefined,
  muted = true,
  last = 0,
  lastValue = 0;
export const setSoundMuted = (value: boolean) => {
  muted = value;
};
export function sound(name = "tick", volume = 0.1) {
  if (
    muted ||
    !navigator.userActivation?.hasBeenActive ||
    typeof AudioContext === "undefined"
  )
    return;
  const now = performance.now();
  if (now - last < 35) return;
  last = now;
  context ??= new AudioContext();
  void context.resume();
  const oscillator = context.createOscillator(),
    gain = context.createGain(),
    t = context.currentTime;
  oscillator.type = "sine";
  oscillator.frequency.setValueAtTime(name === "release" ? 900 : 1600, t);
  oscillator.frequency.exponentialRampToValueAtTime(500, t + 0.035);
  gain.gain.setValueAtTime(Math.max(0.001, volume * 0.18), t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(t + 0.05);
  oscillator.onended = () => {
    oscillator.disconnect();
    gain.disconnect();
  };
}
export const startScrub = (value: number) => {
  lastValue = value;
  sound("tick", 0.07);
};
export const scrubSound = (value: number) => {
  if (Math.abs(value - lastValue) > 0.006) {
    lastValue = value;
    sound("tick", 0.05);
  }
};
export const endScrub = () => sound("release", 0.08);
