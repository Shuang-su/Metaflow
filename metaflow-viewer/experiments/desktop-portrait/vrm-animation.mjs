import * as THREE from 'three';

/**
 * VRM Animation Controller for desktop portrait experiment.
 * Manages idle breathing, blinking, look-at, and audio-driven mouth animation.
 * 
 * Does not implement real conversation or Eidolon integration - provides clean seam for future.
 */

/**
 * Create an animation controller for a VRM character.
 * @param {VRM} vrm - The VRM instance to animate
 * @param {Object} options - Animation parameters
 * @returns {Object} Controller with update() and dispose()
 */
export function createVRMAnimationController(vrm, {
    breathingRate = 0.25,        // Breathing cycles per second (15 per minute)
    breathingAmount = 0.02,      // Subtle chest expansion
    blinkInterval = 3.0,         // Average seconds between blinks
    blinkIntervalVariance = 2.0, // Randomness in blink timing
    blinkDuration = 0.15,        // How long a blink takes
    lookAtSmoothing = 0.1,       // Look-at interpolation speed
    mouthOpenSmoothing = 0.15    // Mouth animation smoothness
} = {}) {
    if (!vrm?.humanoid) {
        throw new TypeError('需要包含 humanoid 的有效 VRM');
    }
    
    let disposed = false;
    let time = 0;
    let nextBlinkTime = Math.random() * blinkInterval;
    let blinkPhase = 0; // 0 = not blinking, 0-1 = blink progress
    let targetLookAt = new THREE.Vector3(0, 0, 1); // Forward by default
    let currentMouthOpen = 0;
    let targetMouthOpen = 0;
    
    const expressionManager = vrm.expressionManager;
    const lookAt = vrm.lookAt;
    
    // Check available expressions
    const hasBlinkExpression = expressionManager && (
        expressionManager.getExpressionTrackName('blink') ||
        expressionManager.getExpressionTrackName('blinkLeft') ||
        expressionManager.getExpressionTrackName('blinkRight')
    );
    
    const hasMouthExpression = expressionManager && (
        expressionManager.getExpressionTrackName('aa') ||
        expressionManager.getExpressionTrackName('mouth')
    );
    
    // Store initial chest scale for breathing
    const chest = vrm.humanoid.getNormalizedBoneNode('chest') || 
                  vrm.humanoid.getNormalizedBoneNode('spine');
    const initialChestScale = chest ? chest.scale.clone() : null;
    
    /**
     * Update animations. Call every frame with delta time.
     * @param {number} deltaTime - Time in seconds since last update
     */
    function update(deltaTime) {
        if (disposed || !vrm) return;
        
        time += deltaTime;
        
        // Breathing animation - subtle chest expansion
        if (chest && initialChestScale) {
            const breathPhase = Math.sin(time * breathingRate * Math.PI * 2);
            const breathScale = 1 + breathPhase * breathingAmount;
            chest.scale.copy(initialChestScale).multiplyScalar(breathScale);
        }
        
        // Blinking animation
        if (hasBlinkExpression && expressionManager) {
            if (time >= nextBlinkTime) {
                if (blinkPhase === 0) {
                    // Start new blink
                    blinkPhase = 0.001;
                    nextBlinkTime = time + blinkInterval + 
                        (Math.random() - 0.5) * 2 * blinkIntervalVariance;
                }
            }
            
            if (blinkPhase > 0) {
                blinkPhase += deltaTime / blinkDuration;
                if (blinkPhase >= 1) {
                    blinkPhase = 0; // Blink complete
                }
                
                // Blink curve: quick close, quick open
                const blinkValue = blinkPhase < 0.5 
                    ? blinkPhase * 2 
                    : (1 - blinkPhase) * 2;
                
                // Try different blink expression names
                const blinkName = expressionManager.getExpressionTrackName('blink') ||
                                 expressionManager.getExpressionTrackName('blinkLeft');
                const blinkRightName = expressionManager.getExpressionTrackName('blinkRight');
                
                if (blinkName) {
                    expressionManager.setValue(blinkName, blinkValue);
                }
                if (blinkRightName && blinkRightName !== blinkName) {
                    expressionManager.setValue(blinkRightName, blinkValue);
                }
            }
        }
        
        // Mouth animation driven by audio amplitude (set via setMouthOpen)
        if (hasMouthExpression && expressionManager) {
            currentMouthOpen += (targetMouthOpen - currentMouthOpen) * mouthOpenSmoothing;
            
            // Map to 'aa' expression (Japanese VRM standard for mouth open)
            const mouthName = expressionManager.getExpressionTrackName('aa') ||
                             expressionManager.getExpressionTrackName('mouth');
            if (mouthName) {
                expressionManager.setValue(mouthName, Math.max(0, Math.min(1, currentMouthOpen)));
            }
        }
        
        // Look-at animation
        if (lookAt) {
            // VRM lookAt expects target in world space
            lookAt.target = targetLookAt;
        }
        
        // Update VRM internal systems
        vrm.update(deltaTime);
    }
    
    /**
     * Set look-at target position in world space.
     * @param {THREE.Vector3} position - World position to look at
     */
    function setLookAtTarget(position) {
        if (disposed) return;
        targetLookAt.copy(position);
    }
    
    /**
     * Set mouth open amount from audio amplitude.
     * @param {number} amount - 0 to 1, where 1 is fully open
     */
    function setMouthOpen(amount) {
        if (disposed) return;
        targetMouthOpen = Math.max(0, Math.min(1, amount));
    }
    
    /**
     * Reset animation state.
     */
    function reset() {
        if (disposed) return;
        time = 0;
        nextBlinkTime = Math.random() * blinkInterval;
        blinkPhase = 0;
        currentMouthOpen = 0;
        targetMouthOpen = 0;
        if (expressionManager) {
            expressionManager.setValue('aa', 0);
            expressionManager.setValue('blink', 0);
        }
    }
    
    /**
     * Clean up resources.
     */
    function dispose() {
        if (disposed) return;
        disposed = true;
        // Expression manager is owned by VRM, don't dispose it
    }
    
    return {
        update,
        setLookAtTarget,
        setMouthOpen,
        reset,
        dispose,
        get hasBlinking() { return hasBlinkExpression; },
        get hasMouth() { return hasMouthExpression; },
        get hasLookAt() { return !!lookAt; }
    };
}

/**
 * Audio-driven mouth animation controller.
 * Analyzes audio and drives mouth open amount based on volume.
 * 
 * Note: This is amplitude-based approximation, not phoneme/viseme timing.
 * Real lip-sync requires audio service with phoneme timestamps.
 */
export function createAudioMouthController({
    onMouthUpdate = null,
    smoothingTimeConstant = 0.8,
    minDecibels = -60,
    maxDecibels = -10,
    fftSize = 256
} = {}) {
    let audioContext = null;
    let analyser = null;
    let source = null;
    let audio = null;
    let animationFrame = null;
    let disposed = false;
    
    /**
     * Start analyzing audio element.
     * @param {HTMLAudioElement} audioElement - Audio element to analyze
     */
    function attachAudio(audioElement) {
        if (disposed) throw new Error('Controller已释放');
        detach();
        
        audio = audioElement;
        
        // Create audio context (requires user gesture)
        if (!audioContext) {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        // Create analyzer
        analyser = audioContext.createAnalyser();
        analyser.fftSize = fftSize;
        analyser.smoothingTimeConstant = smoothingTimeConstant;
        analyser.minDecibels = minDecibels;
        analyser.maxDecibels = maxDecibels;
        
        // Connect audio to analyzer
        source = audioContext.createMediaElementSource(audio);
        source.connect(analyser);
        analyser.connect(audioContext.destination);
        
        // Start analysis loop
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        function analyze() {
            if (disposed || !analyser) return;
            
            analyser.getByteFrequencyData(dataArray);
            
            // Calculate average amplitude, emphasizing speech frequencies (300-3000 Hz)
            const binCount = dataArray.length;
            const nyquist = audioContext.sampleRate / 2;
            const hzPerBin = nyquist / binCount;
            
            let sum = 0;
            let count = 0;
            for (let i = 0; i < binCount; i++) {
                const freq = i * hzPerBin;
                if (freq >= 300 && freq <= 3000) {
                    sum += dataArray[i];
                    count++;
                }
            }
            
            const average = count > 0 ? sum / count : 0;
            const normalized = average / 255; // 0 to 1
            
            // Apply non-linear curve for better mouth movement
            const mouthOpen = Math.pow(normalized, 0.7) * 1.2;
            
            if (onMouthUpdate) {
                onMouthUpdate(Math.min(1, mouthOpen));
            }
            
            animationFrame = requestAnimationFrame(analyze);
        }
        
        analyze();
    }
    
    /**
     * Detach from current audio element.
     */
    function detach() {
        if (animationFrame !== null) {
            cancelAnimationFrame(animationFrame);
            animationFrame = null;
        }
        
        if (source) {
            try {
                source.disconnect();
            } catch {}
            source = null;
        }
        
        if (analyser) {
            try {
                analyser.disconnect();
            } catch {}
            analyser = null;
        }
        
        audio = null;
    }
    
    /**
     * Clean up all resources including AudioContext.
     */
    function dispose() {
        if (disposed) return;
        disposed = true;
        
        detach();
        
        if (audioContext) {
            audioContext.close().catch(() => {});
            audioContext = null;
        }
    }
    
    return {
        attachAudio,
        detach,
        dispose,
        get isActive() { return !!analyser; }
    };
}
