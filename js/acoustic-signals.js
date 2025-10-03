// Acoustic Signals Analysis JavaScript

class AcousticSignalAnalyzer {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.isAnalyzing = false;
        this.animationId = null;
        this.signalData = [];
        this.currentSignalType = 'doppler';
        this.currentMode = 'time';
        
        this.init();
    }

    init() {
        this.setupCanvas();
        this.bindEvents();
        this.generateSampleData();
    }

    setupCanvas() {
        // Set canvas dimensions
        this.canvas.width = this.canvas.offsetWidth;
        this.canvas.height = this.canvas.offsetHeight;
        
        // Set initial style
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    }

    bindEvents() {
        // Window resize handling
        window.addEventListener('resize', () => {
            this.setupCanvas();
            this.drawSignal();
        });

        // Signal type change
        document.getElementById('signalType').addEventListener('change', (e) => {
            this.currentSignalType = e.target.value;
            this.generateSampleData();
            this.drawSignal();
        });

        // Analysis mode change
        document.getElementById('analysisMode').addEventListener('change', (e) => {
            this.currentMode = e.target.value;
            this.drawSignal();
        });
    }

    generateSampleData() {
        this.signalData = [];
        const sampleCount = 1000;
        
        switch(this.currentSignalType) {
            case 'doppler':
                this.generateDopplerSignal(sampleCount);
                break;
            case 'drone':
                this.generateDroneSignal(sampleCount);
                break;
            case 'submarine':
                this.generateSubmarineSignal(sampleCount);
                break;
            case 'radar':
                this.generateRadarSignal(sampleCount);
                break;
        }
    }

    generateDopplerSignal(count) {
        for (let i = 0; i < count; i++) {
            const x = (i / count) * 4 * Math.PI;
            // Doppler effect simulation with frequency shift
            const baseFreq = 2;
            const dopplerShift = Math.sin(x * 0.5) * 0.5;
            const value = Math.sin(x * (baseFreq + dopplerShift)) * 
                         Math.exp(-x * 0.1) * 
                         (0.7 + 0.3 * Math.sin(x * 0.3));
            this.signalData.push(value);
        }
    }

    generateDroneSignal(count) {
        for (let i = 0; i < count; i++) {
            const x = (i / count) * 8 * Math.PI;
            // Drone rotor signature - multiple harmonics
            const fundamental = Math.sin(x * 2);
            const harmonic1 = Math.sin(x * 4) * 0.5;
            const harmonic2 = Math.sin(x * 6) * 0.3;
            const amplitudeMod = 0.5 + 0.5 * Math.sin(x * 0.5);
            const value = (fundamental + harmonic1 + harmonic2) * amplitudeMod * 0.8;
            this.signalData.push(value);
        }
    }

    generateSubmarineSignal(count) {
        for (let i = 0; i < count; i++) {
            const x = (i / count) * 6 * Math.PI;
            // Submarine acoustic signature - low frequency with pulses
            const baseSignal = Math.sin(x * 0.5) * 0.7;
            const pulse = Math.random() > 0.95 ? Math.sin(x * 20) * 0.3 : 0;
            const noise = (Math.random() - 0.5) * 0.1;
            const value = baseSignal + pulse + noise;
            this.signalData.push(value);
        }
    }

    generateRadarSignal(count) {
        for (let i = 0; i < count; i++) {
            const x = (i / count) * 10 * Math.PI;
            // Radar pulse simulation
            const pulseRate = 5;
            const pulse = Math.abs(Math.sin(x * pulseRate)) > 0.9 ? 
                         Math.sin(x * 20) * Math.exp(-(x % (2*Math.PI/pulseRate)) * 3) : 0;
            const clutter = Math.sin(x * 0.3) * 0.2;
            const value = pulse + clutter;
            this.signalData.push(value);
        }
    }

    drawSignal() {
        this.ctx.fillStyle = '#000';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        
        switch(this.currentMode) {
            case 'time':
                this.drawTimeDomain();
                break;
            case 'frequency':
                this.drawFrequencyDomain();
                break;
            case 'spectrogram':
                this.drawSpectrogram();
                break;
            case 'comparison':
                this.drawComparison();
                break;
        }
        
        this.updateStatistics();
    }

    drawTimeDomain() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerY = height / 2;
        const scaleY = height * 0.4;
        
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        this.signalData.forEach((value, index) => {
            const x = (index / this.signalData.length) * width;
            const y = centerY - value * scaleY;
            
            if (index === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        
        this.ctx.stroke();
        
        // Draw grid
        this.drawGrid();
    }

    drawFrequencyDomain() {
        const fftData = this.computeFFT(this.signalData);
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.strokeStyle = '#ff6b6b';
        this.ctx.lineWidth = 2;
        this.ctx.beginPath();
        
        fftData.forEach((magnitude, index) => {
            if (index < fftData.length / 2) { // Only show positive frequencies
                const x = (index / (fftData.length / 2)) * width;
                const y = height - magnitude * height * 2;
                
                if (index === 0) {
                    this.ctx.moveTo(x, y);
                } else {
                    this.ctx.lineTo(x, y);
                }
            }
        });
        
        this.ctx.stroke();
        this.drawGrid();
    }

    drawSpectrogram() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const segmentSize = 64;
        const overlap = 32;
        
        for (let i = 0; i < this.signalData.length - segmentSize; i += overlap) {
            const segment = this.signalData.slice(i, i + segmentSize);
            const fft = this.computeFFT(segment);
            
            for (let j = 0; j < fft.length / 2; j++) {
                const magnitude = fft[j];
                const x = (i / this.signalData.length) * width;
                const y = (j / (fft.length / 2)) * height;
                
                const intensity = Math.min(255, Math.floor(magnitude * 500));
                this.ctx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
                this.ctx.fillRect(x, height - y, width / (this.signalData.length / overlap), height / (fft.length / 2));
            }
        }
    }

    drawComparison() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        const centerY = height / 2;
        const scaleY = height * 0.3;
        
        // Draw reference signal
        this.ctx.strokeStyle = '#00ff00';
        this.ctx.lineWidth = 1;
        this.drawComparisonSignal(this.signalData, scaleY, centerY - scaleY);
        
        // Draw compared signal (phase shifted)
        this.ctx.strokeStyle = '#ff6b6b';
        const comparedData = this.signalData.map((val, idx) => 
            Math.sin((idx / this.signalData.length) * 4 * Math.PI + Math.PI * 0.2)
        );
        this.drawComparisonSignal(comparedData, scaleY, centerY + scaleY);
        
        this.drawGrid();
    }

    drawComparisonSignal(data, scaleY, offsetY) {
        const width = this.canvas.width;
        this.ctx.beginPath();
        
        data.forEach((value, index) => {
            const x = (index / data.length) * width;
            const y = offsetY - value * scaleY;
            
            if (index === 0) {
                this.ctx.moveTo(x, y);
            } else {
                this.ctx.lineTo(x, y);
            }
        });
        
        this.ctx.stroke();
    }

    drawGrid() {
        const width = this.canvas.width;
        const height = this.canvas.height;
        
        this.ctx.strokeStyle = '#333';
        this.ctx.lineWidth = 1;
        
        // Vertical lines
        for (let x = 0; x < width; x += width / 10) {
            this.ctx.beginPath();
            this.ctx.moveTo(x, 0);
            this.ctx.lineTo(x, height);
            this.ctx.stroke();
        }
        
        // Horizontal lines
        for (let y = 0; y < height; y += height / 8) {
            this.ctx.beginPath();
            this.ctx.moveTo(0, y);
            this.ctx.lineTo(width, y);
            this.ctx.stroke();
        }
    }

    computeFFT(data) {
        // Simple FFT approximation for demonstration
        const n = data.length;
        const fft = new Array(n).fill(0);
        
        for (let k = 0; k < n; k++) {
            let real = 0;
            let imag = 0;
            
            for (let t = 0; t < n; t++) {
                const angle = 2 * Math.PI * k * t / n;
                real += data[t] * Math.cos(angle);
                imag -= data[t] * Math.sin(angle);
            }
            
            fft[k] = Math.sqrt(real * real + imag * imag) / n;
        }
        
        return fft;
    }

    updateStatistics() {
        // Update statistics based on current signal
        const frequency = this.calculateDominantFrequency();
        const amplitude = this.calculateRMS();
        const quality = this.calculateSignalQuality();
        const dopplerShift = this.calculateDopplerShift();
        
        document.getElementById('frequencyValue').textContent = `${frequency.toFixed(1)} Hz`;
        document.getElementById('amplitudeValue').textContent = `${amplitude.toFixed(2)} dB`;
        document.getElementById('qualityValue').textContent = `${quality}%`;
        document.getElementById('dopplerValue').textContent = `${dopplerShift.toFixed(1)} Hz`;
    }

    calculateDominantFrequency() {
        const fft = this.computeFFT(this.signalData);
        let maxIndex = 0;
        let maxValue = 0;
        
        for (let i = 1; i < fft.length / 2; i++) {
            if (fft[i] > maxValue) {
                maxValue = fft[i];
                maxIndex = i;
            }
        }
        
        return (maxIndex / this.signalData.length) * 1000; // Convert to Hz
    }

    calculateRMS() {
        const sumSquares = this.signalData.reduce((sum, val) => sum + val * val, 0);
        return 20 * Math.log10(Math.sqrt(sumSquares / this.signalData.length));
    }

    calculateSignalQuality() {
        // Simple signal quality estimation
        const noiseLevel = this.estimateNoise();
        const signalLevel = this.calculateRMS();
        const snr = signalLevel - noiseLevel;
        return Math.min(100, Math.max(0, (snr + 20) * 5));
    }

    calculateDopplerShift() {
        if (this.currentSignalType === 'doppler') {
            return Math.random() * 50 + 10; // Simulated Doppler shift
        }
        return 0;
    }

    estimateNoise() {
        // Simple noise estimation
        const variations = [];
        for (let i = 1; i < this.signalData.length; i++) {
            variations.push(Math.abs(this.signalData[i] - this.signalData[i-1]));
        }
        const avgVariation = variations.reduce((a, b) => a + b, 0) / variations.length;
        return 20 * Math.log10(avgVariation);
    }

    startAnalysis() {
        if (!this.isAnalyzing) {
            this.isAnalyzing = true;
            this.animate();
        }
    }

    stopAnalysis() {
        this.isAnalyzing = false;
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
    }

    animate() {
        if (!this.isAnalyzing) return;
        
        // Update signal data with slight variations for animation
        this.signalData = this.signalData.map((val, idx) => {
            const time = Date.now() * 0.001;
            const variation = Math.sin(time + idx * 0.1) * 0.1;
            return Math.max(-1, Math.min(1, val + variation * 0.05));
        });
        
        this.drawSignal();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    resetAnalysis() {
        this.stopAnalysis();
        this.generateSampleData();
        this.drawSignal();
    }
}

// Global functions for HTML event handlers
let analyzer;

function loadSignal(signalType) {
    document.getElementById('signalType').value = signalType;
    if (analyzer) {
        analyzer.currentSignalType = signalType;
        analyzer.generateSampleData();
        analyzer.drawSignal();
    }
}

function startAnalysis() {
    if (!analyzer) {
        analyzer = new AcousticSignalAnalyzer('signalCanvas');
    }
    analyzer.startAnalysis();
}

function resetAnalysis() {
    if (analyzer) {
        analyzer.resetAnalysis();
    }
}

function exportData() {
    if (analyzer) {
        const dataStr = JSON.stringify(analyzer.signalData);
        const dataBlob = new Blob([dataStr], {type: 'application/json'});
        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `acoustic_signal_${analyzer.currentSignalType}_${Date.now()}.json`;
        link.click();
        URL.revokeObjectURL(url);
    }
}

// Initialize when page loads
document.addEventListener('DOMContentLoaded', function() {
    analyzer = new AcousticSignalAnalyzer('signalCanvas');
    analyzer.drawSignal();
});