/**
 * Generate test audio for mouth animation demonstration.
 * Creates simple synthesized speech-like audio patterns.
 */

/**
 * Create a test audio clip with speech-like frequency modulation.
 * @param {number} durationSeconds - Duration of the clip
 * @param {number} sampleRate - Audio sample rate (default 44100)
 * @returns {Blob} WAV audio blob
 */
export function generateTestAudio(durationSeconds = 3, sampleRate = 44100) {
    const numSamples = Math.floor(durationSeconds * sampleRate);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);
    
    // WAV header
    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    writeString(view, 8, 'WAVE');
    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // fmt chunk size
    view.setUint16(20, 1, true); // PCM
    view.setUint16(22, 1, true); // mono
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true); // byte rate
    view.setUint16(32, 2, true); // block align
    view.setUint16(34, 16, true); // bits per sample
    writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);
    
    // Generate speech-like waveform
    // Simulate phoneme-like patterns with varying frequencies and amplitudes
    let offset = 44;
    const phonemes = [
        { freq: 700, duration: 0.15, amplitude: 0.4 },  // like 'a'
        { freq: 500, duration: 0.12, amplitude: 0.35 }, // like 'o'
        { freq: 900, duration: 0.10, amplitude: 0.3 },  // like 'e'
        { freq: 600, duration: 0.13, amplitude: 0.4 },  // like 'u'
        { freq: 800, duration: 0.11, amplitude: 0.35 }, // like 'i'
        { freq: 0, duration: 0.08, amplitude: 0.0 }     // silence/consonant
    ];
    
    let phonemeIndex = 0;
    let phonemeTime = 0;
    let currentPhoneme = phonemes[0];
    
    for (let i = 0; i < numSamples; i++) {
        const t = i / sampleRate;
        
        // Switch phonemes
        if (phonemeTime >= currentPhoneme.duration) {
            phonemeTime = 0;
            phonemeIndex = (phonemeIndex + 1) % phonemes.length;
            currentPhoneme = phonemes[phonemeIndex];
        }
        phonemeTime += 1 / sampleRate;
        
        // Generate sample with harmonics for natural sound
        let sample = 0;
        if (currentPhoneme.freq > 0) {
            const fundamental = Math.sin(2 * Math.PI * currentPhoneme.freq * t);
            const harmonic2 = Math.sin(2 * Math.PI * currentPhoneme.freq * 2 * t) * 0.3;
            const harmonic3 = Math.sin(2 * Math.PI * currentPhoneme.freq * 3 * t) * 0.15;
            
            // Add envelope
            const envelopeProgress = phonemeTime / currentPhoneme.duration;
            const envelope = envelopeProgress < 0.1 
                ? envelopeProgress / 0.1 
                : envelopeProgress > 0.8 
                    ? (1 - envelopeProgress) / 0.2 
                    : 1;
            
            sample = (fundamental + harmonic2 + harmonic3) * currentPhoneme.amplitude * envelope;
        }
        
        // Add subtle noise for realism
        const noise = (Math.random() - 0.5) * 0.02;
        sample += noise;
        
        // Write 16-bit PCM sample
        const intSample = Math.max(-32768, Math.min(32767, Math.floor(sample * 32767)));
        view.setInt16(offset, intSample, true);
        offset += 2;
    }
    
    return new Blob([buffer], { type: 'audio/wav' });
}

function writeString(view, offset, string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Create a blob URL for test audio that can be used immediately.
 * Remember to revoke the URL when done.
 */
export function createTestAudioUrl(durationSeconds = 3) {
    const blob = generateTestAudio(durationSeconds);
    return URL.createObjectURL(blob);
}
