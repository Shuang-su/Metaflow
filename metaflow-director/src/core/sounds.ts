let context: AudioContext | undefined,
  master: GainNode | undefined,
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
  if (name === "tick" && now - last < 35) return;
  if (name === "tick") last = now;
  context ??= new AudioContext();
  const play = () => {
    if (muted || !context || context.state !== "running") return;
    if (!master) {
      master = context.createGain();
      master.gain.value = 4;
      const limiter = context.createDynamicsCompressor();
      limiter.threshold.value = -8;
      limiter.knee.value = 6;
      limiter.ratio.value = 12;
      limiter.attack.value = 0.002;
      limiter.release.value = 0.08;
      master.connect(limiter).connect(context.destination);
    }
    // Observed 2026-10-08 feedback: short filtered noise, with a separate
    // release tone and a two-part toggle. No third-party audio asset is used.
    const layer = (
      frequency: number,
      decay: number,
      peak: number,
      offset = 0,
      q = 1.8,
      tone = false,
    ) => {
      const audio = context!;
      const t = audio.currentTime + offset;
      const gain = audio.createGain();
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(
        Math.max(0.0001, peak * volume * 0.4),
        t + 0.001,
      );
      gain.gain.exponentialRampToValueAtTime(0.0001, t + decay + 0.001);
      gain.connect(master!);
      let node: AudioBufferSourceNode | OscillatorNode;
      let filter: BiquadFilterNode | undefined;
      if (tone) {
        node = audio.createOscillator();
        node.frequency.value = frequency;
      } else {
        node = audio.createBufferSource();
        const buffer = audio.createBuffer(
          1,
          Math.ceil((decay + 0.004) * audio.sampleRate),
          audio.sampleRate,
        );
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        node.buffer = buffer;
        filter = audio.createBiquadFilter();
        filter.type = "bandpass";
        filter.frequency.value = frequency;
        filter.Q.value = q;
      }
      if (filter) node.connect(filter).connect(gain);
      else node.connect(gain);
      node.start(t);
      node.stop(t + decay + 0.004);
      node.onended = () => {
        node.disconnect();
        filter?.disconnect();
        gain.disconnect();
      };
    };
    if (name === "press") layer(1700, 0.02, 0.13, 0, 1.4);
    else if (name === "toggle") {
      layer(2200, 0.016, 0.12, 0, 1.6);
      layer(3800, 0.02, 0.1, 0.024, 1.6);
    } else if (name === "release") {
      layer(4600, 0.016, 0.12);
      layer(3200, 0.05, 0.02, 0.006, 1.8, true);
    } else {
      layer(5400, 0.018, 0.14);
      layer(2600, 0.012, 0.018, 0, 1.8, true);
    }
  };
  if (context.state === "running") play();
  else void context.resume().then(play, () => {});
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
