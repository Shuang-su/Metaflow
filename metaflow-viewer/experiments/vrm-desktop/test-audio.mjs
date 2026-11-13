/**
 * Generate synthetic test audio with speech-band content
 * Returns an AudioBuffer suitable for mouth animation testing
 */

export async function generateTestAudio() {
    const sampleRate = 22050;
    const duration = 3.0; // seconds
    const numSamples = Math.floor(sampleRate * duration);
    
    // Create audio context
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    
    // Create buffer
    const buffer = audioContext.createBuffer(1, numSamples, sampleRate);
    const channelData = buffer.getChannelData(0);
    
    // Generate speech-like modulated sine wave
    // Multiple frequency bands with envelope
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        
        // Envelope (attack-sustain-release)
        let envelope = 1.0;
        if (t < 0.1) {
            envelope = t / 0.1; // Attack
        } else if (t > duration - 0.2) {
            envelope = (duration - t) / 0.2; // Release
        }
        
        // Mix of frequencies in speech range (200-3000 Hz)
        const f1 = 300 * (1 + 0.3 * Math.sin(t * 3)); // Fundamental with vibrato
        const f2 = 800 * (1 + 0.2 * Math.sin(t * 5)); // First formant
        const f3 = 2200 * (1 + 0.1 * Math.sin(t * 7)); // Second formant
        
        const sample = 
            0.4 * Math.sin(2 * Math.PI * f1 * t) +
            0.3 * Math.sin(2 * Math.PI * f2 * t) +
            0.2 * Math.sin(2 * Math.PI * f3 * t);
        
        // Apply envelope and amplitude modulation (syllables)
        const modulation = 0.5 + 0.5 * Math.sin(t * 8 * Math.PI); // ~4 syllables/sec
        channelData[i] = sample * envelope * modulation * 0.3;
    }
    
    return buffer;
}

/**
 * Export as WAV blob for download/testing
 */
export function audioBufferToWav(buffer) {
    const numChannels = buffer.numberOfChannels;
    const sampleRate = buffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;
    
    const bytesPerSample = bitDepth / 8;
    const blockAlign = numChannels * bytesPerSample;
    
    const data = [];
    for (let i = 0; i < buffer.length; i++) {
        for (let channel = 0; channel < numChannels; channel++) {
            const sample = buffer.getChannelData(channel)[i];
            const intSample = Math.max(-1, Math.min(1, sample)) * 0x7FFF;
            data.push(intSample);
        }
    }
    
    const dataSize = data.length * bytesPerSample;
    const bufferSize = 44 + dataSize;
    const arrayBuffer = new ArrayBuffer(bufferSize);
    const view = new DataView(arrayBuffer);
    
    // Write WAV header
    const writeString = (offset, string) => {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    };
    
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, format, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);
    
    // Write audio data
    let offset = 44;
    for (const sample of data) {
        view.setInt16(offset, sample, true);
        offset += 2;
    }
    
    return new Blob([arrayBuffer], { type: 'audio/wav' });
}
