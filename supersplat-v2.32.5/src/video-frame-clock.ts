// Output samples are indexed integers, never accumulated wall-clock deltas.
const videoFrameCount = (start: number, end: number, timelineFps: number, outputFps: number) => {
    if (![start, end, timelineFps, outputFps].every(Number.isFinite) || start < 0 || end < start || timelineFps <= 0 || outputFps <= 0) {
        throw new RangeError('Invalid video frame range or frame rate');
    }
    return Math.floor((end - start) * outputFps / timelineFps) + 1;
};

const videoFrameSample = (index: number, start: number, timelineFps: number, outputFps: number) => ({
    seconds: index / outputFps,
    timelineFrame: start + index * timelineFps / outputFps,
    timestamp: Math.round(index * 1e6 / outputFps),
    duration: Math.round((index + 1) * 1e6 / outputFps) - Math.round(index * 1e6 / outputFps)
});

export { videoFrameCount, videoFrameSample };
