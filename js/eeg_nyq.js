// Nyquist Effect Simulation for EEG Signal Viewer
class NyquistEffect {
    constructor(viewerState) {
        this.viewerState = viewerState;
        this.originalSignalData = null;
        this.downsampledSignalData = null;
        this.isDownsampled = false;
        this.downsampleFactor = 1;
        this.nyquistFrequency = 0;
        this.classificationResult = null;
        this.downsampledClassificationResult = null;
    }

    // Add Nyquist controls to the UI
    addNyquistControls() {
        const controlsContainer = document.querySelector('.control-panel .card-body');
        
        const nyquistSection = document.createElement('div');
        nyquistSection.className = 'control-group mt-4';
        nyquistSection.innerHTML = `
            <h6>Nyquist Effect Simulation</h6>
            
            <div class="mb-2">
                <label class="small">Downsample Factor:</label>
                <input type="range" class="form-range" id="downsample-factor" min="1" max="10" value="1" step="1">
                <div class="small text-muted" id="downsample-value">1x (No downsampling)</div>
            </div>
            
            <div class="mb-2">
                <label class="small">Original Sample Rate:</label>
                <input type="number" class="form-control form-control-sm" id="original-sample-rate" value="250" min="1" max="10000">
                <div class="small text-muted" id="nyquist-frequency">Nyquist Frequency: 125 Hz</div>
            </div>
            
            <div class="mb-3">
                <button type="button" class="btn btn-warning btn-sm w-100" id="apply-downsampling">
                    <i class="bi-arrow-down-circle me-1"></i>Apply Downsampling
                </button>
                <button type="button" class="btn btn-secondary btn-sm w-100 mt-1" id="reset-downsampling" style="display: none;">
                    <i class="bi-arrow-clockwise me-1"></i>Reset to Original
                </button>
            </div>
            
            <div class="alert alert-info small" id="nyquist-info">
                <i class="bi-info-circle me-1"></i>
                Downsampling reduces sample rate and may cause aliasing if signal contains frequencies above the new Nyquist limit.
            </div>
            
            <div class="classification-comparison mt-3" id="classification-comparison" style="display: none;">
                <h6>Classification Impact</h6>
                <div class="comparison-result">
                    <div class="original-result">
                        <strong>Original Signal:</strong>
                        <span id="original-classification" class="badge bg-success ms-1">-</span>
                    </div>
                    <div class="downsampled-result mt-1">
                        <strong>Downsampled Signal:</strong>
                        <span id="downsampled-classification" class="badge bg-danger ms-1">-</span>
                    </div>
                    <div class="impact-result mt-2" id="impact-result">
                        <small class="text-muted">Classification impact will appear here</small>
                    </div>
                </div>
            </div>
        `;

        controlsContainer.appendChild(nyquistSection);
        this.setupNyquistEventListeners();
        this.updateNyquistInfo();
    }

    setupNyquistEventListeners() {
        const downsampleFactor = document.getElementById('downsample-factor');
        const downsampleValue = document.getElementById('downsample-value');
        const originalSampleRate = document.getElementById('original-sample-rate');
        const applyBtn = document.getElementById('apply-downsampling');
        const resetBtn = document.getElementById('reset-downsampling');

        // Update downsample factor display
        downsampleFactor.addEventListener('input', () => {
            const factor = parseInt(downsampleFactor.value);
            downsampleValue.textContent = `${factor}x (${this.calculateEffectiveSampleRate(factor)} Hz)`;
            this.updateNyquistInfo();
        });

        // Update sample rate and Nyquist frequency
        originalSampleRate.addEventListener('input', () => {
            this.viewerState.sampleRate = parseInt(originalSampleRate.value);
            this.updateNyquistInfo();
        });

        // Apply downsampling
        applyBtn.addEventListener('click', () => {
            this.applyDownsampling();
        });

        // Reset to original signal
        resetBtn.addEventListener('click', () => {
            this.resetDownsampling();
        });
    }

    updateNyquistInfo() {
        const downsampleFactor = parseInt(document.getElementById('downsample-factor').value);
        const originalRate = parseInt(document.getElementById('original-sample-rate').value);
        const effectiveRate = this.calculateEffectiveSampleRate(downsampleFactor);
        const nyquistFreq = effectiveRate / 2;

        document.getElementById('nyquist-frequency').textContent = 
            `Nyquist Frequency: ${nyquistFreq.toFixed(1)} Hz`;

        const infoElement = document.getElementById('nyquist-info');
        if (downsampleFactor > 1) {
            infoElement.className = 'alert alert-warning small';
            infoElement.innerHTML = `
                <i class="bi-exclamation-triangle me-1"></i>
                Downsampling to ${effectiveRate} Hz. Frequencies above ${nyquistFreq.toFixed(1)} Hz will alias!
            `;
        } else {
            infoElement.className = 'alert alert-info small';
            infoElement.innerHTML = `
                <i class="bi-info-circle me-1"></i>
                No downsampling applied. Original sample rate maintained.
            `;
        }
    }

    calculateEffectiveSampleRate(downsampleFactor) {
        const originalRate = parseInt(document.getElementById('original-sample-rate').value);
        return Math.floor(originalRate / downsampleFactor);
    }

    // Apply downsampling to the signal
    applyDownsampling() {
        if (!this.viewerState.signalData) {
            alert('Please load EEG signal data first!');
            return;
        }

        this.downsampleFactor = parseInt(document.getElementById('downsample-factor').value);
        
        if (this.downsampleFactor === 1) {
            alert('Downsample factor of 1x means no downsampling. Please choose a higher factor.');
            return;
        }

        // Store original data if not already stored
        if (!this.originalSignalData) {
            this.originalSignalData = { ...this.viewerState.signalData };
        }

        // Apply downsampling
        this.downsampledSignalData = {};
        const effectiveSampleRate = this.calculateEffectiveSampleRate(this.downsampleFactor);
        
        Object.keys(this.viewerState.signalData).forEach(channelId => {
            const originalData = this.viewerState.signalData[channelId];
            const downsampledLength = Math.ceil(originalData.length / this.downsampleFactor);
            const downsampledData = new Float32Array(downsampledLength);
            
            for (let i = 0; i < downsampledLength; i++) {
                const originalIndex = i * this.downsampleFactor;
                if (originalIndex < originalData.length) {
                    downsampledData[i] = originalData[originalIndex];
                }
            }
            
            this.downsampledSignalData[channelId] = downsampledData;
        });

        // Update viewer state with downsampled data
        this.viewerState.signalData = this.downsampledSignalData;
        this.viewerState.sampleRate = effectiveSampleRate;
        this.isDownsampled = true;

        // Update UI
        document.getElementById('reset-downsampling').style.display = 'block';
        document.getElementById('apply-downsampling').textContent = 'Update Downsampling';
        document.getElementById('classification-comparison').style.display = 'block';

        // Show warning about potential aliasing
        this.showAliasingWarning();

        // Re-render signals
        this.viewerState.renderSignals();

        // Simulate classification impact
        this.simulateClassificationImpact();

        console.log(`Applied ${this.downsampleFactor}x downsampling. Effective sample rate: ${effectiveSampleRate} Hz`);
    }

    // Reset to original signal
    resetDownsampling() {
        if (this.originalSignalData) {
            this.viewerState.signalData = this.originalSignalData;
            this.viewerState.sampleRate = parseInt(document.getElementById('original-sample-rate').value);
            this.isDownsampled = false;

            // Reset UI
            document.getElementById('reset-downsampling').style.display = 'none';
            document.getElementById('apply-downsampling').textContent = 'Apply Downsampling';
            document.getElementById('downsample-factor').value = 1;
            document.getElementById('downsample-value').textContent = '1x (No downsampling)';

            // Update Nyquist info
            this.updateNyquistInfo();

            // Re-render signals
            this.viewerState.renderSignals();

            console.log('Reset to original signal data');
        }
    }

    showAliasingWarning() {
        const originalRate = parseInt(document.getElementById('original-sample-rate').value);
        const effectiveRate = this.calculateEffectiveSampleRate(this.downsampleFactor);
        const nyquistFreq = effectiveRate / 2;

        // Create or update aliasing warning
        let warningElement = document.getElementById('aliasing-warning');
        if (!warningElement) {
            warningElement = document.createElement('div');
            warningElement.id = 'aliasing-warning';
            warningElement.className = 'alert alert-danger mt-2';
            document.querySelector('.nyquist-section').appendChild(warningElement);
        }

        warningElement.innerHTML = `
            <i class="bi-exclamation-triangle-fill me-2"></i>
            <strong>Aliasing Warning!</strong><br>
            <small>
                Sample rate reduced from ${originalRate} Hz to ${effectiveRate} Hz.<br>
                Frequencies above ${nyquistFreq.toFixed(1)} Hz will alias and distort the signal.<br>
                This may cause misclassification of EEG patterns.
            </small>
        `;
    }

    // Simulate the impact on classification
    simulateClassificationImpact() {
        const diseases = ['Normal', 'Epilepsy', 'Alzheimer', 'Parkinson', 'Sleep Disorder'];
        const originalDisease = diseases[Math.floor(Math.random() * diseases.length)];
        
        // Simulate classification failure due to downsampling
        let downsampledDisease;
        const failureChance = Math.min(0.3 + (this.downsampleFactor - 1) * 0.15, 0.9);
        
        if (Math.random() < failureChance) {
            // Classification fails - pick a different disease
            const otherDiseases = diseases.filter(d => d !== originalDisease);
            downsampledDisease = otherDiseases[Math.floor(Math.random() * otherDiseases.length)];
        } else {
            // Classification succeeds (rare with high downsampling)
            downsampledDisease = originalDisease;
        }

        // Update UI
        document.getElementById('original-classification').textContent = originalDisease;
        document.getElementById('downsampled-classification').textContent = downsampledDisease;

        const impactElement = document.getElementById('impact-result');
        if (originalDisease !== downsampledDisease) {
            impactElement.className = 'alert alert-danger small p-2';
            impactElement.innerHTML = `
                <i class="bi-x-circle-fill me-1"></i>
                <strong>Classification Failed!</strong><br>
                Model misclassified as ${downsampledDisease} instead of ${originalDisease}
            `;
        } else {
            impactElement.className = 'alert alert-success small p-2';
            impactElement.innerHTML = `
                <i class="bi-check-circle-fill me-1"></i>
                <strong>Classification Maintained</strong><br>
                Model correctly identified ${originalDisease} despite downsampling
            `;
        }

        // Store results for potential use with actual AI model
        this.classificationResult = {
            original: originalDisease,
            downsampled: downsampledDisease,
            confidence: Math.max(0.1, 1 - failureChance).toFixed(2)
        };
    }

    // Method to analyze actual signal for high-frequency content
    analyzeFrequencyContent() {
        if (!this.viewerState.signalData) return null;

        const channelId = Object.keys(this.viewerState.signalData)[0];
        const signal = this.viewerState.signalData[channelId];
        const sampleRate = this.viewerState.sampleRate;

        // Simple FFT-like analysis (using basic frequency estimation)
        const frequencies = this.estimateDominantFrequencies(signal, sampleRate);
        
        return {
            dominantFrequencies: frequencies,
            hasHighFrequencies: frequencies.some(freq => freq > sampleRate / 4),
            maxFrequency: Math.max(...frequencies)
        };
    }

    estimateDominantFrequencies(signal, sampleRate) {
        // Simple zero-crossing rate for frequency estimation
        let zeroCrossings = 0;
        for (let i = 1; i < signal.length; i++) {
            if ((signal[i-1] <= 0 && signal[i] > 0) || (signal[i-1] >= 0 && signal[i] < 0)) {
                zeroCrossings++;
            }
        }
        
        const duration = signal.length / sampleRate;
        const fundamentalFreq = zeroCrossings / (2 * duration);
        
        // Return estimated frequencies (fundamental and some harmonics)
        return [
            fundamentalFreq,
            fundamentalFreq * 2,
            fundamentalFreq * 3,
            fundamentalFreq * 4
        ].filter(freq => freq < sampleRate / 2);
    }

    // Export downsampled data for analysis
    exportDownsampledData() {
        if (!this.isDownsampled || !this.downsampledSignalData) {
            return null;
        }

        return {
            data: this.downsampledSignalData,
            originalSampleRate: parseInt(document.getElementById('original-sample-rate').value),
            downsampledSampleRate: this.viewerState.sampleRate,
            downsamplingFactor: this.downsampleFactor,
            nyquistFrequency: this.viewerState.sampleRate / 2,
            classificationImpact: this.classificationResult
        };
    }
}

// Initialize Nyquist Effect when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Wait for viewerState to be available
    setTimeout(() => {
        if (typeof viewerState !== 'undefined') {
            const nyquistEffect = new NyquistEffect(viewerState);
            nyquistEffect.addNyquistControls();
            
            // Make it globally available for the main script
            window.nyquistEffect = nyquistEffect;
        }
    }, 1000);
});