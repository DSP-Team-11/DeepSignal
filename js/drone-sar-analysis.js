// Drone & SAR Analysis JavaScript

class DroneAnalyzer {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.isAnalyzing = false;
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupWaveformCanvas();
    }

    bindEvents() {
        const fileInput = document.getElementById('audioFile');
        const uploadArea = document.querySelector('.upload-area');
        
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Drag and drop support
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#198754';
            uploadArea.style.background = '#e8f5e8';
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

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.wav')) {
            this.showError('Please upload a .wav file');
            return;
        }

        // Validate file size (50MB limit)
        if (file.size > 50 * 1024 * 1024) {
            this.showError('File size must be less than 50MB');
            return;
        }

        this.displayFileInfo(file);
        this.enableAnalyzeButton();
        this.loadAudioFile(file);
    }

    displayFileInfo(file) {
        const fileInfo = document.querySelector('.file-info');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');
        
        fileName.textContent = file.name;
        fileSize.textContent = this.formatFileSize(file.size);
        fileInfo.classList.remove('d-none');
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    enableAnalyzeButton() {
        document.getElementById('analyzeBtn').disabled = false;
    }

    clearFile() {
        document.getElementById('audioFile').value = '';
        document.querySelector('.file-info').classList.add('d-none');
        document.getElementById('analyzeBtn').disabled = true;
        this.audioBuffer = null;
    }

    async loadAudioFile(file) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const arrayBuffer = await file.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            this.drawWaveform();
            
        } catch (error) {
            console.error('Error loading audio file:', error);
            this.showError('Error loading audio file. Please try again.');
        }
    }

    drawWaveform() {
        const canvas = document.getElementById('waveformCanvas');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        if (!this.audioBuffer) return;

        const data = this.audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);
        
        ctx.strokeStyle = '#00ff00';
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

    async analyzeDroneSound() {
        if (!this.audioBuffer) {
            this.showError('Please upload an audio file first');
            return;
        }

        if (this.isAnalyzing) return;

        this.isAnalyzing = true;
        this.showLoadingState();

        try {
            // Simulate analysis processing
            await this.simulateAnalysis();
            
            // Display results
            this.displayResults();
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.showError('Analysis failed. Please try again.');
        } finally {
            this.isAnalyzing = false;
            this.hideLoadingState();
        }
    }

    async simulateAnalysis() {
        // Simulate processing time
        return new Promise(resolve => {
            setTimeout(resolve, 2000 + Math.random() * 2000);
        });
    }

    displayResults() {
        const results = this.generateMockResults();
        const resultsSection = document.getElementById('resultsSection');
        const classificationResult = document.getElementById('classificationResult');
        const detailedAnalysis = document.getElementById('detailedAnalysis');

        // Display classification result
        classificationResult.innerHTML = `
            <div class="alert alert-${results.confidence > 0.7 ? 'success' : 'warning'}">
                <h6>${results.type}</h6>
                <div class="fw-bold">Confidence: ${(results.confidence * 100).toFixed(1)}%</div>
                <small class="text-muted">${results.description}</small>
            </div>
        `;

        // Display detailed analysis
        detailedAnalysis.innerHTML = `
            <div class="row">
                <div class="col-md-6">
                    <h6>Signal Characteristics</h6>
                    <ul class="list-unstyled">
                        <li><strong>Duration:</strong> ${results.duration}s</li>
                        <li><strong>Sample Rate:</strong> ${results.sampleRate} Hz</li>
                        <li><strong>Channels:</strong> ${results.channels}</li>
                        <li><strong>Max Frequency:</strong> ${results.maxFrequency} Hz</li>
                    </ul>
                </div>
                <div class="col-md-6">
                    <h6>Analysis Metrics</h6>
                    <ul class="list-unstyled">
                        <li><strong>Signal Quality:</strong> ${results.signalQuality}%</li>
                        <li><strong>Noise Level:</strong> ${results.noiseLevel} dB</li>
                        <li><strong>Dominant Frequency:</strong> ${results.dominantFreq} Hz</li>
                        <li><strong>Harmonic Content:</strong> ${results.harmonics}</li>
                    </ul>
                </div>
            </div>
        `;

        resultsSection.classList.remove('d-none');
    }

    generateMockResults() {
        const droneTypes = [
            'Quadcopter - Commercial',
            'Fixed-Wing UAV',
            'Hexacopter - Professional',
            'Unknown Drone Type',
            'Non-Drone Sound'
        ];

        const randomType = droneTypes[Math.floor(Math.random() * droneTypes.length)];
        const isDrone = !randomType.includes('Non-Drone');

        return {
            type: randomType,
            confidence: isDrone ? 0.7 + Math.random() * 0.3 : Math.random() * 0.3,
            description: isDrone 
                ? 'This audio contains characteristics consistent with drone rotor sounds.'
                : 'This audio does not appear to contain typical drone signatures.',
            duration: this.audioBuffer ? this.audioBuffer.duration.toFixed(2) : '0.00',
            sampleRate: this.audioBuffer ? this.audioBuffer.sampleRate : 0,
            channels: this.audioBuffer ? this.audioBuffer.numberOfChannels : 0,
            maxFrequency: Math.floor(500 + Math.random() * 15000),
            signalQuality: Math.floor(70 + Math.random() * 30),
            noiseLevel: (-40 - Math.random() * 30).toFixed(1),
            dominantFreq: Math.floor(100 + Math.random() * 1000),
            harmonics: Math.floor(3 + Math.random() * 8)
        };
    }

    showLoadingState() {
        const button = document.getElementById('analyzeBtn');
        button.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';
        button.disabled = true;
    }

    hideLoadingState() {
        const button = document.getElementById('analyzeBtn');
        button.innerHTML = '<i class="bi-play-circle me-2"></i>Analyze Drone Sound';
        button.disabled = false;
    }

    showError(message) {
        // Create or show error alert
        let errorAlert = document.querySelector('.alert-danger');
        if (!errorAlert) {
            errorAlert = document.createElement('div');
            errorAlert.className = 'alert alert-danger alert-dismissible fade show';
            errorAlert.innerHTML = `
                ${message}
                <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
            `;
            document.querySelector('.upload-container').prepend(errorAlert);
        } else {
            errorAlert.querySelector('.alert-message').textContent = message;
            errorAlert.classList.remove('d-none');
        }
    }

    setupWaveformCanvas() {
        const canvas = document.getElementById('waveformCanvas');
        if (canvas) {
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
        }
    }
}

// Initialize when page loads
let droneAnalyzer;

document.addEventListener('DOMContentLoaded', function() {
    droneAnalyzer = new DroneAnalyzer();
});

// Global functions for HTML event handlers
function analyzeDroneSound() {
    if (droneAnalyzer) {
        droneAnalyzer.analyzeDroneSound();
    }
}

function clearFile() {
    if (droneAnalyzer) {
        droneAnalyzer.clearFile();
    }
}