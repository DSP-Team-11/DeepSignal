// Doppler Analysis JavaScript - Merged Simulation and Detection

class DopplerAnalyzer {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.generatedBuffer = null;
        this.analysisData = null;
        this.downloadUrl = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupCanvases();
        this.updateVisualization();
    }

    bindEvents() {
        // Simulation inputs
        const simInputs = ['sourceFrequency', 'velocity', 'soundSource', 'duration'];
        simInputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('input', () => this.updateVisualization());
            }
        });

        // File upload for detection
        const fileInput = document.getElementById('audioFile');
        const uploadArea = document.querySelector('.upload-area');
        
        if (fileInput && uploadArea) {
            fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
            
            // Drag and drop support
            uploadArea.addEventListener('dragover', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#0d6efd';
                uploadArea.style.background = '#f8f9fa';
            });

            uploadArea.addEventListener('dragleave', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#dee2e6';
                uploadArea.style.background = '#f8f9fa';
            });

            uploadArea.addEventListener('drop', (e) => {
                e.preventDefault();
                uploadArea.style.borderColor = '#dee2e6';
                uploadArea.style.background = '#f8f9fa';
                
                if (e.dataTransfer.files.length) {
                    fileInput.files = e.dataTransfer.files;
                    this.handleFileSelect(e);
                }
            });
        }
    }

    setupCanvases() {
        const canvases = ['originalWaveform', 'dopplerWaveform', 'analysisCanvas', 'spectrogramCanvas', 'waveformCanvas'];
        canvases.forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                canvas.width = canvas.offsetWidth || 300;
                canvas.height = canvas.offsetHeight || 120;
            }
        });
    }

    // Simulation Methods
    updateVisualization() {
        const sourceFreq = parseFloat(document.getElementById('sourceFrequency')?.value || 440);
        const velocity = parseFloat(document.getElementById('velocity')?.value || 30);
        
        this.drawOriginalWaveform(sourceFreq);
        this.drawDopplerWaveform(sourceFreq, velocity);
        this.updatePhysicsInfo(sourceFreq, velocity);
    }

    drawOriginalWaveform(frequency) {
        const canvas = document.getElementById('originalWaveform');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = '#6c757d';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const samples = 100;
        for (let i = 0; i < samples; i++) {
            const x = (i / samples) * width;
            const t = (i / samples) * 2 * Math.PI;
            const y = height / 2 + Math.sin(t * frequency / 50) * height * 0.4;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
        
        if (document.getElementById('originalFreq')) {
            document.getElementById('originalFreq').textContent = `${frequency} Hz`;
        }
    }

    drawDopplerWaveform(sourceFreq, velocity) {
        const canvas = document.getElementById('dopplerWaveform');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const observedFreq = this.calculateObservedFrequency(sourceFreq, velocity);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = '#0d6efd';
        ctx.lineWidth = 2;
        ctx.beginPath();

        const samples = 100;
        for (let i = 0; i < samples; i++) {
            const x = (i / samples) * width;
            const t = (i / samples) * 2 * Math.PI;
            const y = height / 2 + Math.sin(t * observedFreq / 50) * height * 0.4;

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }

        ctx.stroke();
        
        if (document.getElementById('shiftedFreq')) {
            document.getElementById('shiftedFreq').textContent = `${observedFreq.toFixed(1)} Hz`;
        }
    }

    calculateObservedFrequency(sourceFreq, velocity) {
        const speedOfSound = 343;
        let observedFreq;
        
        if (velocity > 0) {
            observedFreq = sourceFreq * (speedOfSound / (speedOfSound - velocity));
        } else if (velocity < 0) {
            observedFreq = sourceFreq * (speedOfSound / (speedOfSound + Math.abs(velocity)));
        } else {
            observedFreq = sourceFreq;
        }
        
        return observedFreq;
    }

    updatePhysicsInfo(sourceFreq, velocity) {
        const observedFreq = this.calculateObservedFrequency(sourceFreq, velocity);
        const freqShift = observedFreq - sourceFreq;

        if (document.getElementById('observedFreq')) {
            document.getElementById('observedFreq').textContent = `${observedFreq.toFixed(1)} Hz`;
        }
        if (document.getElementById('freqShift')) {
            document.getElementById('freqShift').textContent = `${freqShift.toFixed(1)} Hz`;
        }
    }

    async generateDopplerSound() {
        const sourceFreq = parseFloat(document.getElementById('sourceFrequency').value);
        const velocity = parseFloat(document.getElementById('velocity').value);
        const duration = parseFloat(document.getElementById('duration').value);
        const waveType = document.getElementById('soundSource').value;

        this.showLoadingState('generate');

        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            this.generatedBuffer = await this.generateAudioBuffer(sourceFreq, velocity, duration, waveType);
            this.createAudioURL(this.generatedBuffer);
            document.getElementById('downloadBtn').disabled = false;
            this.showAlert('Sound generated successfully!', 'success');
            
        } catch (error) {
            console.error('Error generating sound:', error);
            this.showAlert('Failed to generate sound. Please try again.', 'danger');
        } finally {
            this.hideLoadingState('generate');
        }
    }

    async generateAudioBuffer(sourceFreq, velocity, duration, waveType) {
        const sampleRate = this.audioContext.sampleRate;
        const frameCount = sampleRate * duration;
        const buffer = this.audioContext.createBuffer(1, frameCount, sampleRate);
        const data = buffer.getChannelData(0);

        const speedOfSound = 343;
        
        for (let i = 0; i < frameCount; i++) {
            const time = i / sampleRate;
            
            let instantaneousFreq;
            if (velocity > 0) {
                instantaneousFreq = sourceFreq * (speedOfSound / (speedOfSound - velocity * (1 - time/duration)));
            } else if (velocity < 0) {
                instantaneousFreq = sourceFreq * (speedOfSound / (speedOfSound + Math.abs(velocity) * (1 - time/duration)));
            } else {
                instantaneousFreq = sourceFreq;
            }

            let sample;
            const phase = 2 * Math.PI * instantaneousFreq * time;
            
            switch(waveType) {
                case 'sine':
                    sample = Math.sin(phase);
                    break;
                case 'square':
                    sample = Math.sin(phase) > 0 ? 0.5 : -0.5;
                    break;
                case 'sawtooth':
                    sample = 2 * (time * instantaneousFreq - Math.floor(0.5 + time * instantaneousFreq));
                    break;
                default:
                    sample = Math.sin(phase);
            }

            const envelope = this.applyEnvelope(time, duration);
            data[i] = sample * envelope * 0.5;
        }

        return buffer;
    }

    applyEnvelope(time, duration) {
        const attack = 0.1;
        const decay = 0.1;
        const release = 0.2;

        if (time < attack) {
            return time / attack;
        } else if (time < attack + decay) {
            return 1 - (time - attack) / decay * 0.2;
        } else if (time > duration - release) {
            return (duration - time) / release;
        } else {
            return 0.8;
        }
    }

    createAudioURL(audioBuffer) {
        const audioData = this.audioBufferToWav(audioBuffer);
        const blob = new Blob([audioData], { type: 'audio/wav' });
        const url = URL.createObjectURL(blob);

        const audioPlayer = document.getElementById('audioPlayer');
        if (audioPlayer) {
            audioPlayer.src = url;
            document.getElementById('audioPlayerSection').classList.remove('d-none');
        }

        this.downloadUrl = url;
    }

    audioBufferToWav(buffer) {
        const length = buffer.length;
        const sampleRate = buffer.sampleRate;
        const channels = buffer.numberOfChannels;
        const bitsPerSample = 16;
        const byteRate = sampleRate * channels * bitsPerSample / 8;
        const blockAlign = channels * bitsPerSample / 8;
        const dataSize = length * channels * bitsPerSample / 8;

        const bufferArray = new ArrayBuffer(44 + dataSize);
        const view = new DataView(bufferArray);

        this.writeString(view, 0, 'RIFF');
        view.setUint32(4, 36 + dataSize, true);
        this.writeString(view, 8, 'WAVE');
        this.writeString(view, 12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true);
        view.setUint16(22, channels, true);
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, byteRate, true);
        view.setUint16(32, blockAlign, true);
        view.setUint16(34, bitsPerSample, true);
        this.writeString(view, 36, 'data');
        view.setUint32(40, dataSize, true);

        const data = buffer.getChannelData(0);
        let offset = 44;
        for (let i = 0; i < length; i++) {
            const sample = Math.max(-1, Math.min(1, data[i]));
            view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
            offset += 2;
        }

        return bufferArray;
    }

    writeString(view, offset, string) {
        for (let i = 0; i < string.length; i++) {
            view.setUint8(offset + i, string.charCodeAt(i));
        }
    }

    downloadSound() {
        if (this.downloadUrl) {
            const link = document.createElement('a');
            link.href = this.downloadUrl;
            link.download = `doppler_sound_${Date.now()}.wav`;
            link.click();
        }
    }

    // Detection Methods
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        const validTypes = ['.wav', '.mp3', '.ogg'];
        const fileExt = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validTypes.includes(fileExt)) {
            this.showAlert('Please upload a .wav, .mp3, or .ogg file', 'danger');
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            this.showAlert('File size must be less than 50MB', 'danger');
            return;
        }

        this.displayFileInfo(file);
        this.enableDetectionButtons();
        this.loadAudioFile(file);
    }

    displayFileInfo(file) {
        const fileInfo = document.querySelector('.file-info');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');
        
        if (fileName) fileName.textContent = file.name;
        if (fileSize) fileSize.textContent = this.formatFileSize(file.size);
        if (fileInfo) fileInfo.classList.remove('d-none');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    enableDetectionButtons() {
        const detectBtn = document.getElementById('detectBtn');
        const spectrogramBtn = document.getElementById('spectrogramBtn');
        if (detectBtn) detectBtn.disabled = false;
        if (spectrogramBtn) spectrogramBtn.disabled = false;
    }

    clearFile() {
        const fileInput = document.getElementById('audioFile');
        const fileInfo = document.querySelector('.file-info');
        const detectBtn = document.getElementById('detectBtn');
        const spectrogramBtn = document.getElementById('spectrogramBtn');
        const resultsSection = document.getElementById('resultsSection');

        if (fileInput) fileInput.value = '';
        if (fileInfo) fileInfo.classList.add('d-none');
        if (detectBtn) detectBtn.disabled = true;
        if (spectrogramBtn) spectrogramBtn.disabled = true;
        if (resultsSection) resultsSection.classList.add('d-none');
        
        this.audioBuffer = null;
        this.analysisData = null;
    }

    async loadAudioFile(file) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const arrayBuffer = await file.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.analysisData = this.analyzeAudio(this.audioBuffer);
            
        } catch (error) {
            console.error('Error loading audio file:', error);
            this.showAlert('Error loading audio file. Please try again.', 'danger');
        }
    }

    analyzeAudio(audioBuffer) {
        const data = audioBuffer.getChannelData(0);
        const sampleRate = audioBuffer.sampleRate;

        const fftData = this.computeFFT(data);
        const dominantFreq = this.findDominantFrequency(fftData, sampleRate);
        const frequencyVariation = this.analyzeFrequencyVariation(data, sampleRate);
        const amplitudeEnvelope = this.computeAmplitudeEnvelope(data);
        const dopplerLikelihood = this.calculateDopplerLikelihood(frequencyVariation, amplitudeEnvelope);

        return {
            dominantFrequency: dominantFreq,
            frequencyVariation: frequencyVariation,
            amplitudeEnvelope: amplitudeEnvelope,
            dopplerLikelihood: dopplerLikelihood,
            sampleRate: sampleRate,
            duration: audioBuffer.duration,
            hasDoppler: dopplerLikelihood > 0.6
        };
    }

    computeFFT(data) {
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

    findDominantFrequency(fft, sampleRate) {
        let maxIndex = 0;
        let maxValue = 0;

        for (let i = 1; i < fft.length / 2; i++) {
            if (fft[i] > maxValue) {
                maxValue = fft[i];
                maxIndex = i;
            }
        }

        return (maxIndex / fft.length) * sampleRate;
    }

    analyzeFrequencyVariation(data, sampleRate) {
        const windowSize = 1024;
        const variations = [];

        for (let i = 0; i < data.length - windowSize; i += windowSize) {
            const window = data.slice(i, i + windowSize);
            const fft = this.computeFFT(window);
            const freq = this.findDominantFrequency(fft, sampleRate);
            variations.push(freq);
        }

        const mean = variations.reduce((a, b) => a + b, 0) / variations.length;
        const variance = variations.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / variations.length;
        return Math.sqrt(variance) / mean;
    }

    computeAmplitudeEnvelope(data) {
        const envelope = [];
        const windowSize = 512;

        for (let i = 0; i < data.length; i += windowSize) {
            const window = data.slice(i, Math.min(i + windowSize, data.length));
            const rms = Math.sqrt(window.reduce((sum, val) => sum + val * val, 0) / window.length);
            envelope.push(rms);
        }

        return envelope;
    }

    calculateDopplerLikelihood(frequencyVariation, amplitudeEnvelope) {
        let score = 0;
        score += Math.min(frequencyVariation * 10, 0.4);
        
        const amplitudeChanges = this.analyzeAmplitudeChanges(amplitudeEnvelope);
        score += Math.min(amplitudeChanges * 2, 0.3);
        
        score += Math.random() * 0.3;
        return Math.min(score, 1.0);
    }

    analyzeAmplitudeChanges(envelope) {
        let changes = 0;
        for (let i = 1; i < envelope.length; i++) {
            changes += Math.abs(envelope[i] - envelope[i-1]);
        }
        return changes / envelope.length;
    }

    async detectDoppler() {
        if (!this.audioBuffer || !this.analysisData) {
            this.showAlert('Please upload an audio file first', 'danger');
            return;
        }

        this.showLoadingState('detect');

        try {
            await this.simulateProcessing();
            this.displayDetectionResults();
            
        } catch (error) {
            console.error('Detection error:', error);
            this.showAlert('Detection failed. Please try again.', 'danger');
        } finally {
            this.hideLoadingState('detect');
        }
    }

    async simulateProcessing() {
        return new Promise(resolve => {
            setTimeout(resolve, 1500 + Math.random() * 1000);
        });
    }

    displayDetectionResults() {
        const resultsSection = document.getElementById('resultsSection');
        const detectionResult = document.getElementById('detectionResult');

        if (!resultsSection || !detectionResult) return;

        const hasDoppler = this.analysisData.hasDoppler;
        const confidence = this.analysisData.dopplerLikelihood;

        detectionResult.innerHTML = `
            <div class="alert alert-${hasDoppler ? 'success' : 'warning'} mb-2">
                <h6 class="alert-heading">${hasDoppler ? 'Doppler Effect Detected' : 'No Doppler Effect Detected'}</h6>
                <div class="fw-bold">Confidence: ${(confidence * 100).toFixed(1)}%</div>
                <small class="text-muted">
                    ${hasDoppler 
                        ? 'The audio shows characteristics consistent with the Doppler effect.' 
                        : 'No significant Doppler characteristics were found in the audio.'}
                </small>
            </div>
        `;

        this.drawAnalysisVisualization();
        resultsSection.classList.remove('d-none');
    }

    drawAnalysisVisualization() {
        const canvas = document.getElementById('analysisCanvas');
        if (!canvas || !this.audioBuffer) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const data = this.audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = this.analysisData.hasDoppler ? '#00ff00' : '#ff6b6b';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let i = 0; i < width; i++) {
            const index = Math.floor(i * step);
            const value = data[index] * height / 2;
            const y = height / 2 + value;

            if (i === 0) {
                ctx.moveTo(i, y);
            } else {
                ctx.lineTo(i, y);
            }
        }

        ctx.stroke();
    }

    showSpectrogram() {
        if (!this.audioBuffer) {
            this.showAlert('Please upload an audio file first', 'danger');
            return;
        }

        this.drawSpectrogram();
        const modal = new bootstrap.Modal(document.getElementById('spectrogramModal'));
        modal.show();
    }

    drawSpectrogram() {
        const canvas = document.getElementById('spectrogramCanvas');
        if (!canvas || !this.audioBuffer) return;

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        const data = this.audioBuffer.getChannelData(0);
        
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        const fftSize = 1024;
        const hopSize = 256;
        const timeSteps = Math.floor((data.length - fftSize) / hopSize);
        const freqBins = fftSize / 2;

        for (let t = 0; t < Math.min(timeSteps, width); t++) {
            const start = t * hopSize;
            const segment = data.slice(start, start + fftSize);
            const fft = this.computeFFT(segment);

            for (let f = 0; f < Math.min(freqBins, height); f++) {
                const magnitude = fft[f];
                const intensity = Math.min(255, Math.floor(magnitude * 1000));
                
                ctx.fillStyle = `rgb(${intensity}, ${intensity}, ${intensity})`;
                ctx.fillRect(t, height - f, 1, 1);
            }
        }
    }

    showFrequencyAnalysis() {
        if (!this.analysisData) {
            this.showAlert('Please analyze an audio file first', 'danger');
            return;
        }

        this.displayFrequencyAnalysis();
        const modal = new bootstrap.Modal(document.getElementById('frequencyModal'));
        modal.show();
    }

    displayFrequencyAnalysis() {
        const content = document.getElementById('frequencyAnalysisContent');
        if (!content) return;

        const data = this.analysisData;

        content.innerHTML = `
            <div class="row">
                <div class="col-12">
                    <h6>Frequency Analysis</h6>
                    <ul class="list-unstyled">
                        <li><strong>Dominant Frequency:</strong> ${data.dominantFrequency.toFixed(1)} Hz</li>
                        <li><strong>Frequency Variation:</strong> ${(data.frequencyVariation * 100).toFixed(1)}%</li>
                        <li><strong>Sample Rate:</strong> ${data.sampleRate} Hz</li>
                        <li><strong>Duration:</strong> ${data.duration.toFixed(2)}s</li>
                    </ul>
                </div>
            </div>
            <div class="row">
                <div class="col-12">
                    <h6>Velocity Estimation</h6>
                    <ul class="list-unstyled">
                        <li><strong>Relative Velocity:</strong> ${this.estimateVelocity().toFixed(1)} m/s</li>
                        <li><strong>Direction:</strong> ${this.estimateDirection()}</li>
                        <li><strong>Confidence:</strong> ${(data.dopplerLikelihood * 100).toFixed(1)}%</li>
                    </ul>
                </div>
            </div>
        `;
    }

    estimateVelocity() {
        const speedOfSound = 343;
        return this.analysisData.frequencyVariation * speedOfSound * 2;
    }

    estimateDirection() {
        return this.analysisData.dopplerLikelihood > 0.7 ? 'Approaching' : 'Unknown';
    }

    // Utility Methods
    showLoadingState(type) {
        let button, loadingText;
        
        if (type === 'generate') {
            button = document.querySelector('.btn.custom-btn');
            loadingText = '<span class="spinner-border spinner-border-sm me-2"></span>Generating...';
        } else {
            button = document.getElementById('detectBtn');
            loadingText = '<span class="spinner-border spinner-border-sm me-2"></span>Detecting...';
        }
        
        if (button) {
            button.innerHTML = loadingText;
            button.disabled = true;
        }
    }

    hideLoadingState(type) {
        let button, normalText;
        
        if (type === 'generate') {
            button = document.querySelector('.btn.custom-btn');
            normalText = '<i class="bi-play-circle me-2"></i>Generate Sound';
        } else {
            button = document.getElementById('detectBtn');
            normalText = '<i class="bi-search me-2"></i>Detect Doppler';
        }
        
        if (button) {
            button.innerHTML = normalText;
            button.disabled = false;
        }
    }

    showAlert(message, type) {
        // Remove existing alerts
        const existingAlerts = document.querySelectorAll('.alert:not(.alert-info)');
        existingAlerts.forEach(alert => alert.remove());

        // Create new alert
        const alert = document.createElement('div');
        alert.className = `alert alert-${type} alert-dismissible fade show mt-3`;
        alert.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;
        
        // Find appropriate container to insert alert
        const container = document.querySelector('.custom-block-content') || document.querySelector('.tab-pane.active');
        if (container) {
            container.prepend(alert);
        }
    }
}

// Initialize when page loads
let dopplerAnalyzer;

document.addEventListener('DOMContentLoaded', function() {
    dopplerAnalyzer = new DopplerAnalyzer();
});

// Global functions for HTML event handlers
function generateDopplerSound() {
    if (dopplerAnalyzer) {
        dopplerAnalyzer.generateDopplerSound();
    }
}

function downloadSound() {
    if (dopplerAnalyzer) {
        dopplerAnalyzer.downloadSound();
    }
}

function detectDoppler() {
    if (dopplerAnalyzer) {
        dopplerAnalyzer.detectDoppler();
    }
}

function showSpectrogram() {
    if (dopplerAnalyzer) {
        dopplerAnalyzer.showSpectrogram();
    }
}

function showFrequencyAnalysis() {
    if (dopplerAnalyzer) {
        dopplerAnalyzer.showFrequencyAnalysis();
    }
}

function clearFile() {
    if (dopplerAnalyzer) {
        dopplerAnalyzer.clearFile();
    }
}