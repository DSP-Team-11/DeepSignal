// js/doppler-analysis.js - Combined Doppler Effect Analysis

// Global variables
let currentAudioBlob = null;
let currentAudioUrl = null;
let currentDetectionData = null;

// ==================== DOWNSAMPLING TOOL ====================

const doppler_downsampling_Tool = {
    filename: "",
    processedUrl: "",

    init: function() {
        console.log('🎵 Downsampling tool initialized');
        this.setupEventListeners();
        this.testConnection();
    },

    setupEventListeners: function() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    const file = e.target.files[0];
                    console.log(`📁 File selected: ${file.name}`);
                    this.updateResult(`File selected: ${file.name}`, "info");
                }
            });
        }

        // Add event listener for slider
        const slider = document.getElementById('slider');
        if (slider) {
            slider.addEventListener('input', (e) => {
                this.updateSR(e.target.value);
            });
        }
    },

    testConnection: async function() {
        try {
            console.log('🔍 Testing server connection...');
            const response = await fetch('http://127.0.0.1:5000/api/health');
            if (response.ok) {
                console.log('✅ Server is connected');
                this.updateResult("Server connected ✅", "success");
            } else {
                throw new Error(`Server returned ${response.status}`);
            }
        } catch (error) {
            console.error('❌ Server connection failed:', error);
            this.updateResult("⚠️ Cannot connect to server - make sure Flask is running", "error");
        }
    },

    uploadFile: async function() {
        const fileInput = document.getElementById('fileInput');
        if (!fileInput) {
            alert("File input not found!");
            return;
        }

        const file = fileInput.files[0];
        if (!file) { 
            alert("Select a file first!"); 
            return; 
        }

        // Validate file type
        if (!file.name.toLowerCase().endsWith('.wav')) {
            alert("Please upload a WAV file");
            return;
        }

        console.log('📤 Uploading file:', file.name);
        this.showProcessing("Uploading file...");

        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('http://127.0.0.1:5000/doppler-downsampling-upload', { 
                method: 'POST', 
                body: formData 
            });

            if (!res.ok) {
                throw new Error(`Upload failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();

            if (data.error) {
                throw new Error(data.error);
            }

            this.filename = data.filename;
            this.updateResult("✅ File uploaded successfully!", "success");
            this.hideProcessing();

            // Auto-process with current sample rate
            setTimeout(() => {
                const sr = document.getElementById('slider').value;
                console.log(`🔄 Auto-processing with sample rate: ${sr} Hz`);
                this.updateSR(sr);
            }, 500);

        } catch (error) {
            console.error('❌ Upload failed:', error);
            this.updateResult("Upload failed: " + error.message, "error");
            this.hideProcessing();
        }
    },

    updateSR: async function(sr) {
        if (!this.filename) { 
            this.updateResult("❌ Please upload a file first!", "error");
            return; 
        }

        console.log(`🎚️ Setting sample rate to: ${sr} Hz`);
        document.getElementById("srVal").innerText = sr;
        this.showProcessing(`Downsampling to ${sr} Hz...`);

        try {
            const requestBody = { 
                filename: this.filename, 
                sample_rate: parseInt(sr) 
            };
            
            const res = await fetch('http://127.0.0.1:5000/doppler-downsampling', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            if (!res.ok) {
                throw new Error(`Processing failed: ${res.status} ${res.statusText}`);
            }

            const data = await res.json();

            if (data.error) {
                throw new Error(data.error);
            }

            // Update audio player with proper URL
            const player = document.getElementById('player');
            if (!player) {
                throw new Error("Audio player element not found");
            }

            // Use absolute URL for the audio source
            const audioUrl = `http://127.0.0.1:5000${data.audio_url}`;
            player.src = audioUrl;
            this.processedUrl = audioUrl;

            // Show download button
            const downloadBtn = document.getElementById('downloadBtn');
            if (downloadBtn) {
                downloadBtn.style.display = "inline-block";
            }

            this.updateResult(`✅ Downsampled to ${data.sample_rate} Hz - Ready to play!`, "success");
            this.hideProcessing();
            this.drawWaveform(data.audio_url);

            // Debug info
            console.log('🎵 Audio source set to:', audioUrl);
            console.log('Player element:', player);

            // Try to load and play audio
            player.load(); // Reload the audio element
            
            // Add event listeners for better debugging
            player.addEventListener('loadeddata', () => {
                console.log('✅ Audio loaded successfully');
                console.log('Audio duration:', player.duration);
            });
            
            player.addEventListener('error', (e) => {
                console.error('❌ Audio error:', player.error);
            });

        } catch (error) {
            console.error('❌ Processing failed:', error);
            this.updateResult("Processing failed: " + error.message, "error");
            this.hideProcessing();
        }
    },

    downloadAudio: function() {
        if (!this.processedUrl) {
            alert("No processed audio available");
            return;
        }
        
        // Extract filename from URL and create download URL
        const filename = this.processedUrl.split('/').pop();
        const downloadUrl = `http://127.0.0.1:5000/doppler-downsampling-download/${filename}`;
        
        console.log('💾 Downloading:', downloadUrl);
        
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `downsampled_${filename}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    },

    drawWaveform: async function(url) {
        try {
            const filename = url.split('/').pop();
            const response = await fetch(`http://127.0.0.1:5000/doppler-downsampling-waveform/${filename}`);
            
            if (!response.ok) {
                throw new Error(`Waveform fetch failed: ${response.status}`);
            }
            
            const data = await response.json();

            if (data.error) {
                throw new Error(data.error);
            }

            const canvas = document.getElementById("waveCanvas");
            if (!canvas) {
                throw new Error("Waveform canvas not found");
            }

            const ctx = canvas.getContext("2d");
            const width = canvas.width;
            const height = canvas.height;
            
            // Clear canvas
            ctx.clearRect(0, 0, width, height);
            
            // Draw background
            ctx.fillStyle = "#f8f9fa";
            ctx.fillRect(0, 0, width, height);

            // Draw waveform
            const waveform = data.waveform;
            const len = waveform.length;
            const step = Math.ceil(len / width);
            const amp = height / 2;

            ctx.beginPath();
            ctx.moveTo(0, amp);
            
            for (let i = 0; i < width; i++) {
                const index = Math.min(i * step, len - 1);
                const val = waveform[index] || 0;
                ctx.lineTo(i, amp - val * amp * 0.8);
            }

            ctx.strokeStyle = "#0078d7";
            ctx.lineWidth = 2;
            ctx.stroke();

            // Draw info
            ctx.fillStyle = "#333";
            ctx.font = "14px Arial";
            ctx.fillText(`Waveform at ${data.sample_rate} Hz`, 10, 20);

        } catch (error) {
            console.error("Waveform drawing failed:", error);
            this.drawErrorOnCanvas("Unable to draw waveform");
        }
    },

    drawErrorOnCanvas: function(message) {
        const canvas = document.getElementById("waveCanvas");
        if (!canvas) return;
        
        const ctx = canvas.getContext("2d");
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        ctx.fillStyle = "red";
        ctx.font = "14px Arial";
        ctx.textAlign = "center";
        ctx.fillText("❌ " + message, canvas.width / 2, canvas.height / 2);
    },

    showProcessing: function(message) {
        const processingInfo = document.getElementById('processingInfo');
        if (processingInfo) {
            processingInfo.style.display = 'block';
            if (message) {
                processingInfo.querySelector('span').textContent = message;
            }
        }
    },

    hideProcessing: function() {
        const processingInfo = document.getElementById('processingInfo');
        if (processingInfo) {
            processingInfo.style.display = 'none';
        }
    },

    updateResult: function(message, type = "info") {
        const resultElem = document.getElementById('result');
        if (resultElem) {
            resultElem.textContent = message;
            resultElem.className = `text-center mt-2 ${
                type === "success" ? "text-success" : 
                type === "error" ? "text-danger" : "text-muted"
            }`;
        }
    }
};

// ==================== DOPPLER SIMULATION FUNCTIONS ====================

async function generateDopplerSound() {
    const freq = document.getElementById('sourceFrequency').value;
    const speed = document.getElementById('velocity').value;
    const signalType = document.getElementById('signal-type').value;
    const dist = document.getElementById('lateralDistance').value;
    const fs = document.getElementById('samplingRate').value;

    if (!freq || !speed || !dist) {
        alert('Please fill all required fields');
        return;
    }

    console.log('Sending to Flask:', { freq, speed, signalType, dist });

    // Show progress bar
    document.getElementById('progressSection').classList.remove('d-none');
    document.getElementById('progressBar').style.width = '20%';
    document.getElementById('progressText').textContent = 'Connecting to server...';

    try {
        // Send request to Flask
        const response = await fetch('/simulate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: parseInt(signalType),
                freq: parseFloat(freq),
                speed: parseFloat(speed),
                dist: parseFloat(dist),
                fs: parseInt(fs)
            })
        });

        document.getElementById('progressBar').style.width = '60%';
        document.getElementById('progressText').textContent = 'Generating high-quality audio...';

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        // Receive high-quality audio from Flask
        currentAudioBlob = await response.blob();
        console.log('High-quality audio received:', currentAudioBlob.size, 'bytes');

        // Free memory if there was a previous URL
        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
        }
        currentAudioUrl = URL.createObjectURL(currentAudioBlob);

        document.getElementById('progressBar').style.width = '90%';
        document.getElementById('progressText').textContent = 'Finalizing audio...';

        // Update audio player
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = currentAudioUrl;

        // Set up event handlers
        audioPlayer.onloadeddata = function() {
            console.log('Audio loaded successfully, duration:', audioPlayer.duration);
            document.getElementById('progressBar').style.width = '100%';
            document.getElementById('progressText').textContent = 'Audio ready!';
        };

        audioPlayer.onerror = function(e) {
            console.error('Audio error:', e);
            alert('Error loading audio');
        };

        // Show audio player
        document.getElementById('audioPlayerSection').classList.remove('d-none');

        // Enable buttons
        document.getElementById('downloadBtn').disabled = false;

        // Calculate Doppler effect for display
        calculateDopplerEffect(freq, speed);

        // Try to play audio automatically
        setTimeout(() => {
            audioPlayer.play().catch(e => {
                console.log('Auto-play prevented, user must click play');
                document.getElementById('progressText').textContent = 'Audio ready! Click play to listen.';
            });
        }, 500);

        // Hide progress bar
        setTimeout(() => {
            document.getElementById('progressSection').classList.add('d-none');
            document.getElementById('progressBar').style.width = '0%';
        }, 3000);

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('progressText').textContent = 'Error: ' + error.message;
        document.getElementById('progressBar').classList.add('bg-danger');

        setTimeout(() => {
            document.getElementById('progressSection').classList.add('d-none');
        }, 5000);
    }
}

function calculateDopplerEffect(freq, speed) {
    const c = 343;
    const speedAbs = Math.abs(speed);

    const observedFreqApproaching = freq * (c / (c - speedAbs));
    const observedFreqReceding = freq * (c / (c + speedAbs));

    document.getElementById('observedFreq').textContent =
        `${observedFreqApproaching.toFixed(1)} Hz (approaching)`;

    const freqShift = (observedFreqApproaching - freq).toFixed(1);
    document.getElementById('freqShift').textContent = `+${freqShift} Hz`;
}

function downloadSound() {
    if (currentAudioBlob && currentAudioUrl) {
        const a = document.createElement('a');
        a.href = currentAudioUrl;
        a.download = `doppler_${document.getElementById('sourceFrequency').value}hz_${document.getElementById('velocity').value}ms.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        alert('Please generate audio first');
    }
}

// ==================== DETECTION FUNCTIONS ====================

function initializeFileUpload() {
    const uploadArea = document.querySelector('.upload-area');
    const fileInput = document.getElementById('audioFile');
    
    if (!uploadArea || !fileInput) {
        console.error('Upload area or file input not found');
        return;
    }
    
    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#0d6efd';
        uploadArea.style.backgroundColor = '#f8f9fa';
    });
    
    uploadArea.addEventListener('dragleave', function() {
        uploadArea.style.borderColor = '#dee2e6';
        uploadArea.style.backgroundColor = '';
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#dee2e6';
        uploadArea.style.backgroundColor = '';
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        }
    });

    // File input change event
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            // Update file info
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            
            // Show file info and enable detect button
            document.querySelector('.file-info').classList.remove('d-none');
            document.getElementById('detectBtn').disabled = false;
            
            // Hide previous results
            document.getElementById('resultsSection').classList.add('d-none');
        }
    });
}

function clearFile() {
    document.getElementById('audioFile').value = '';
    document.querySelector('.file-info').classList.add('d-none');
    document.getElementById('detectBtn').disabled = true;
    document.getElementById('resultsSection').classList.add('d-none');
    currentDetectionData = null;
}

async function detectDoppler() {
    console.log('detectDoppler function called');
    
    const fileInput = document.getElementById('audioFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select an audio file first');
        return;
    }

    // Show loading state
    const detectBtn = document.getElementById('detectBtn');
    const originalText = detectBtn.innerHTML;
    detectBtn.innerHTML = '<i class="bi-arrow-repeat spinner me-2"></i>Analyzing...';
    detectBtn.disabled = true;

    try {
        console.log('Starting analysis for file:', file.name);
        
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('/upload_car', {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            let errorMessage = 'Server error';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('Analysis completed successfully');
        currentDetectionData = data;
        
        // Display results
        displayDetectionResults(data);
        
        // Show results section
        document.getElementById('resultsSection').classList.remove('d-none');

    } catch (error) {
        console.error('Detection error:', error);
        alert('Error analyzing audio: ' + error.message);
    } finally {
        // Reset button state
        detectBtn.innerHTML = originalText;
        detectBtn.disabled = false;
    }
}

function displayDetectionResults(data) {
    // Update detection result
    const detectionResult = document.getElementById('detectionResult');
    if (detectionResult) {
        detectionResult.innerHTML = `
            <div class="text-success mb-2">
                <i class="bi-check-circle-fill me-2"></i>
                Doppler effect detected successfully
            </div>
            <div class="small">
                <div>Confidence: High</div>
                <div>Analysis Duration: ${data.times[data.times.length - 1].toFixed(2)}s</div>
                <div>Time Frames: ${data.times.length}</div>
            </div>
        `;
    }

    // Update frequency analysis
    const frequencyAnalysis = document.getElementById('frequencyAnalysis');
    if (frequencyAnalysis) {
        frequencyAnalysis.innerHTML = `
            <div class="mb-2">
                <strong>Source Frequency:</strong> ${data.f_source.toFixed(1)} Hz
            </div>
            <div class="mb-2">
                <strong>Approach Frequency:</strong> ${data.f_approach.toFixed(1)} Hz
            </div>
            <div class="mb-2">
                <strong>Recede Frequency:</strong> ${data.f_recede.toFixed(1)} Hz
            </div>
            <div class="mb-2">
                <strong>Frequency Shift:</strong> ${(data.f_approach - data.f_recede).toFixed(1)} Hz
            </div>
        `;
    }

    // Update summary cards
    const approachFreqElem = document.getElementById('approachFreq');
    const recedeFreqElem = document.getElementById('recedeFreq');
    const estimatedSpeedElem = document.getElementById('estimatedSpeed');
    
    if (approachFreqElem) approachFreqElem.textContent = data.f_approach.toFixed(1) + ' Hz';
    if (recedeFreqElem) recedeFreqElem.textContent = data.f_recede.toFixed(1) + ' Hz';
    
    // Convert m/s to km/h and display
    const speedKmh = Math.abs(data.estimated_velocity * 3.6);
    if (estimatedSpeedElem) estimatedSpeedElem.textContent = speedKmh.toFixed(1) + ' km/h';

    // Create frequency vs time chart
    createFrequencyTimeChart(data.times, data.frequencies, data.velocities);
}

function createFrequencyTimeChart(times, frequencies, velocities) {
    const canvas = document.getElementById('analysisCanvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set canvas dimensions
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;
    
    const padding = 40;
    const chartWidth = canvas.width - (padding * 2);
    const chartHeight = canvas.height - (padding * 2);
    
    // Find data ranges
    const maxTime = Math.max(...times);
    const minFreq = Math.min(...frequencies);
    const maxFreq = Math.max(...frequencies);
    const maxVel = Math.max(...velocities.map(v => Math.abs(v)));
    
    // Draw frequency curve
    ctx.beginPath();
    ctx.strokeStyle = '#0d6efd';
    ctx.lineWidth = 2;
    
    times.forEach((time, index) => {
        const x = padding + (time / maxTime) * chartWidth;
        const y = padding + chartHeight - ((frequencies[index] - minFreq) / (maxFreq - minFreq)) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // Draw velocity curve
    ctx.beginPath();
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    times.forEach((time, index) => {
        const x = padding + (time / maxTime) * chartWidth;
        const y = padding + chartHeight - ((velocities[index] + maxVel) / (2 * maxVel)) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw axes and labels
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.stroke();
    
    // Labels
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    // X-axis label
    ctx.fillText('Time (s)', canvas.width / 2, canvas.height - 10);
    
    // Y-axis label
    ctx.save();
    ctx.translate(10, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Frequency (Hz) / Velocity (m/s)', 0, 0);
    ctx.restore();
    
    // Legend
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0d6efd';
    ctx.fillText('Frequency', canvas.width - 120, 20);
    ctx.fillStyle = '#dc3545';
    ctx.fillText('Velocity', canvas.width - 120, 35);
}

function showDetailedAnalysis() {
    if (!currentDetectionData) {
        alert('No analysis data available. Please run detection first.');
        return;
    }
    
    const modalElement = document.getElementById('frequencyModal');
    if (!modalElement) {
        console.error('Frequency modal not found');
        return;
    }
    
    const modal = new bootstrap.Modal(modalElement);
    
    // Populate modal content
    const modalContent = document.getElementById('frequencyAnalysisContent');
    if (modalContent) {
        modalContent.innerHTML = `
            <h6>Detailed Doppler Analysis</h6>
            <div class="row">
                <div class="col-6">
                    <strong>Source Frequency:</strong>
                </div>
                <div class="col-6">
                    ${currentDetectionData.f_source.toFixed(1)} Hz
                </div>
            </div>
            <div class="row">
                <div class="col-6">
                    <strong>Max Frequency (Approach):</strong>
                </div>
                <div class="col-6">
                    ${currentDetectionData.f_approach.toFixed(1)} Hz
                </div>
            </div>
            <div class="row">
                <div class="col-6">
                    <strong>Min Frequency (Recede):</strong>
                </div>
                <div class="col-6">
                    ${currentDetectionData.f_recede.toFixed(1)} Hz
                </div>
            </div>
            <div class="row">
                <div class="col-6">
                    <strong>Estimated Velocity:</strong>
                </div>
                <div class="col-6">
                    ${Math.abs(currentDetectionData.estimated_velocity * 3.6).toFixed(1)} km/h
                </div>
            </div>
            <div class="row">
                <div class="col-6">
                    <strong>Analysis Points:</strong>
                </div>
                <div class="col-6">
                    ${currentDetectionData.times.length} frames
                </div>
            </div>
            <div class="mt-3">
                <small class="text-muted">Analysis based on STFT with high-resolution processing</small>
            </div>
        `;
    }
    
    modal.show();
}

// ==================== INITIALIZATION FUNCTIONS ====================

function initializeDopplerApp() {
    console.log('Doppler Analysis App - Initializing...');
    
    // Add CSS for better visualization
    const additionalStyles = `
        .detection-results {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-left: 4px solid #0d6efd;
        }
        .analysis-chart {
            background: white;
            border-radius: 8px;
            padding: 15px;
            margin-top: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card {
            transition: transform 0.2s;
        }
        .card:hover {
            transform: translateY(-2px);
        }
        .spinner {
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;

    // Inject styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = additionalStyles;
    document.head.appendChild(styleSheet);
    
    // Initialize file upload functionality
    initializeFileUpload();
    
    // Add event listener to detect button
    const detectBtn = document.getElementById('detectBtn');
    if (detectBtn) {
        detectBtn.addEventListener('click', function(e) {
            console.log('Detect button clicked via event listener');
            detectDoppler();
        });
    } else {
        console.error('Detect button not found!');
    }
    
    console.log('Doppler Analysis App - Ready!');
}

// ==================== INITIALIZATION ====================

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing Doppler Analysis Application...');
    
    // Initialize both tools
    doppler_downsampling_Tool.init();
    
    if (typeof initializeDopplerApp === 'function') {
        initializeDopplerApp();
    }
    
    console.log('✅ Doppler Analysis Application fully initialized');
});

// Debug function - can be called from browser console
window.debugDopplerApp = function() {
    console.log('🔍 Doppler App Debug Info:');
    console.log('- Downsampling filename:', doppler_downsampling_Tool.filename);
    console.log('- Current audio URL:', currentAudioUrl);
    console.log('- Detection data:', currentDetectionData);
    
    // Test server connection
    doppler_downsampling_Tool.testConnection();
};

// ==================== DOPPLER SIMULATION FUNCTIONS ====================

async function generateDopplerSound() {
    const freq = document.getElementById('sourceFrequency').value;
    const speed = document.getElementById('velocity').value;
    const signalType = document.getElementById('signal-type').value;
    const dist = document.getElementById('lateralDistance').value;
    const fs = document.getElementById('samplingRate').value;


    if (!freq || !speed || !dist) {
        alert('Please fill all required fields');
        return;
    }

    console.log('Sending to Flask:', { freq, speed, signalType, dist });

    // Show progress bar
    document.getElementById('progressSection').classList.remove('d-none');
    document.getElementById('progressBar').style.width = '20%';
    document.getElementById('progressText').textContent = 'Connecting to server...';

    try {
        // Send request to Flask
        const response = await fetch('http://127.0.0.1:5000/simulate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                type: parseInt(signalType),
                freq: parseFloat(freq),
                speed: parseFloat(speed),
                dist: parseFloat(dist),
                fs: parseInt(fs)
            })
        });

        document.getElementById('progressBar').style.width = '60%';
        document.getElementById('progressText').textContent = 'Generating high-quality audio...';

        if (!response.ok) {
            throw new Error(`Server error: ${response.status}`);
        }

        // Receive high-quality audio from Flask
        currentAudioBlob = await response.blob();
        console.log('High-quality audio received:', currentAudioBlob.size, 'bytes');

        // Free memory if there was a previous URL
        if (currentAudioUrl) {
            URL.revokeObjectURL(currentAudioUrl);
        }
        currentAudioUrl = URL.createObjectURL(currentAudioBlob);

        document.getElementById('progressBar').style.width = '90%';
        document.getElementById('progressText').textContent = 'Finalizing audio...';

        // Update audio player
        const audioPlayer = document.getElementById('audioPlayer');
        audioPlayer.src = currentAudioUrl;

        // Set up event handlers
        audioPlayer.onloadeddata = function() {
            console.log('Audio loaded successfully, duration:', audioPlayer.duration);
            document.getElementById('progressBar').style.width = '100%';
            document.getElementById('progressText').textContent = 'Audio ready!';
        };

        audioPlayer.onerror = function(e) {
            console.error('Audio error:', e);
            alert('Error loading audio');
        };

        // Show audio player
        document.getElementById('audioPlayerSection').classList.remove('d-none');

        // Enable buttons
        document.getElementById('downloadBtn').disabled = false;

        // Calculate Doppler effect for display
        calculateDopplerEffect(freq, speed);

        // Try to play audio automatically
        setTimeout(() => {
            audioPlayer.play().catch(e => {
                console.log('Auto-play prevented, user must click play');
                document.getElementById('progressText').textContent = 'Audio ready! Click play to listen.';
            });
        }, 500);

        // Hide progress bar
        setTimeout(() => {
            document.getElementById('progressSection').classList.add('d-none');
            document.getElementById('progressBar').style.width = '0%';
        }, 3000);

    } catch (error) {
        console.error('Error:', error);
        document.getElementById('progressText').textContent = 'Error: ' + error.message;
        document.getElementById('progressBar').classList.add('bg-danger');

        setTimeout(() => {
            document.getElementById('progressSection').classList.add('d-none');
        }, 5000);
    }
}

function calculateDopplerEffect(freq, speed) {
    const c = 343;
    const speedAbs = Math.abs(speed);

    const observedFreqApproaching = freq * (c / (c - speedAbs));
    const observedFreqReceding = freq * (c / (c + speedAbs));

    document.getElementById('observedFreq').textContent =
        `${observedFreqApproaching.toFixed(1)} Hz (approaching)`;

    const freqShift = (observedFreqApproaching - freq).toFixed(1);
    document.getElementById('freqShift').textContent = `+${freqShift} Hz`;
}

function downloadSound() {
    if (currentAudioBlob && currentAudioUrl) {
        const a = document.createElement('a');
        a.href = currentAudioUrl;
        a.download = `doppler_${document.getElementById('sourceFrequency').value}hz_${document.getElementById('velocity').value}ms.wav`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        alert('Please generate audio first');
    }
}

// ==================== DETECTION FUNCTIONS ====================

function initializeFileUpload() {
    const uploadArea = document.querySelector('.upload-area');
    const fileInput = document.getElementById('audioFile');
    
    if (!uploadArea || !fileInput) {
        console.error('Upload area or file input not found');
        return;
    }
    
    uploadArea.addEventListener('click', function() {
        fileInput.click();
    });
    
    uploadArea.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#0d6efd';
        uploadArea.style.backgroundColor = '#f8f9fa';
    });
    
    uploadArea.addEventListener('dragleave', function() {
        uploadArea.style.borderColor = '#dee2e6';
        uploadArea.style.backgroundColor = '';
    });
    
    uploadArea.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadArea.style.borderColor = '#dee2e6';
        uploadArea.style.backgroundColor = '';
        
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            const event = new Event('change', { bubbles: true });
            fileInput.dispatchEvent(event);
        }
    });

    // File input change event
    fileInput.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            // Update file info
            document.getElementById('fileName').textContent = file.name;
            document.getElementById('fileSize').textContent = `(${(file.size / 1024 / 1024).toFixed(2)} MB)`;
            
            // Show file info and enable detect button
            document.querySelector('.file-info').classList.remove('d-none');
            document.getElementById('detectBtn').disabled = false;
            
            // Hide previous results
            document.getElementById('resultsSection').classList.add('d-none');
        }
    });
}

function clearFile() {
    document.getElementById('audioFile').value = '';
    document.querySelector('.file-info').classList.add('d-none');
    document.getElementById('detectBtn').disabled = true;
    document.getElementById('resultsSection').classList.add('d-none');
    currentDetectionData = null;
}

async function detectDoppler() {
    console.log('detectDoppler function called');
    
    const fileInput = document.getElementById('audioFile');
    const file = fileInput.files[0];
    
    if (!file) {
        alert('Please select an audio file first');
        return;
    }

    // Show loading state
    const detectBtn = document.getElementById('detectBtn');
    const originalText = detectBtn.innerHTML;
    detectBtn.innerHTML = '<i class="bi-arrow-repeat spinner me-2"></i>Analyzing...';
    detectBtn.disabled = true;

    try {
        console.log('Starting analysis for file:', file.name);
        
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch('http://127.0.0.1:5000/upload_car', {
            method: 'POST',
            body: formData
        });

        console.log('Response status:', response.status);

        if (!response.ok) {
            let errorMessage = 'Server error';
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
            } catch (e) {
                errorMessage = `HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('Analysis completed successfully');
        currentDetectionData = data;
        
        // Display results
        displayDetectionResults(data);
        
        // Show results section
        document.getElementById('resultsSection').classList.remove('d-none');

    } catch (error) {
        console.error('Detection error:', error);
        alert('Error analyzing audio: ' + error.message);
    } finally {
        // Reset button state
        detectBtn.innerHTML = originalText;
        detectBtn.disabled = false;
    }
}

function displayDetectionResults(data) {
    // Update detection result
    const detectionResult = document.getElementById('detectionResult');
    if (detectionResult) {
        detectionResult.innerHTML = `
            <div class="text-success mb-2">
                <i class="bi-check-circle-fill me-2"></i>
                Doppler effect detected successfully
            </div>
            <div class="small">
                <div>Confidence: High</div>
                <div>Analysis Duration: ${data.times[data.times.length - 1].toFixed(2)}s</div>
                <div>Time Frames: ${data.times.length}</div>
            </div>
        `;
    }

    // Update frequency analysis
    const frequencyAnalysis = document.getElementById('frequencyAnalysis');
    if (frequencyAnalysis) {
        frequencyAnalysis.innerHTML = `
            <div class="mb-2">
                <strong>Source Frequency:</strong> ${data.f_source.toFixed(1)} Hz
            </div>
            <div class="mb-2">
                <strong>Approach Frequency:</strong> ${data.f_approach.toFixed(1)} Hz
            </div>
            <div class="mb-2">
                <strong>Recede Frequency:</strong> ${data.f_recede.toFixed(1)} Hz
            </div>
            <div class="mb-2">
                <strong>Frequency Shift:</strong> ${(data.f_approach - data.f_recede).toFixed(1)} Hz
            </div>
        `;
    }

    // Update summary cards
    const approachFreqElem = document.getElementById('approachFreq');
    const recedeFreqElem = document.getElementById('recedeFreq');
    const estimatedSpeedElem = document.getElementById('estimatedSpeed');
    
    if (approachFreqElem) approachFreqElem.textContent = data.f_approach.toFixed(1) + ' Hz';
    if (recedeFreqElem) recedeFreqElem.textContent = data.f_recede.toFixed(1) + ' Hz';
    
    // Convert m/s to km/h and display
    const speedKmh = Math.abs(data.estimated_velocity * 3.6);
    if (estimatedSpeedElem) estimatedSpeedElem.textContent = speedKmh.toFixed(1) + ' km/h';

    // Create frequency vs time chart
    createFrequencyTimeChart(data.times, data.frequencies, data.velocities);
}

function createFrequencyTimeChart(times, frequencies, velocities) {
    const canvas = document.getElementById('analysisCanvas');
    if (!canvas) {
        console.error('Canvas element not found');
        return;
    }
    
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Set canvas dimensions
    canvas.width = canvas.offsetWidth;
    canvas.height = 200;
    
    const padding = 40;
    const chartWidth = canvas.width - (padding * 2);
    const chartHeight = canvas.height - (padding * 2);
    
    // Find data ranges
    const maxTime = Math.max(...times);
    const minFreq = Math.min(...frequencies);
    const maxFreq = Math.max(...frequencies);
    const maxVel = Math.max(...velocities.map(v => Math.abs(v)));
    
    // Draw frequency curve
    ctx.beginPath();
    ctx.strokeStyle = '#0d6efd';
    ctx.lineWidth = 2;
    
    times.forEach((time, index) => {
        const x = padding + (time / maxTime) * chartWidth;
        const y = padding + chartHeight - ((frequencies[index] - minFreq) / (maxFreq - minFreq)) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    
    // Draw velocity curve
    ctx.beginPath();
    ctx.strokeStyle = '#dc3545';
    ctx.lineWidth = 1;
    ctx.setLineDash([5, 5]);
    
    times.forEach((time, index) => {
        const x = padding + (time / maxTime) * chartWidth;
        const y = padding + chartHeight - ((velocities[index] + maxVel) / (2 * maxVel)) * chartHeight;
        
        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Draw axes and labels
    ctx.strokeStyle = '#666';
    ctx.lineWidth = 1;
    
    // X-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding + chartHeight);
    ctx.lineTo(padding + chartWidth, padding + chartHeight);
    ctx.stroke();
    
    // Y-axis
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, padding + chartHeight);
    ctx.stroke();
    
    // Labels
    ctx.fillStyle = '#666';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    
    // X-axis label
    ctx.fillText('Time (s)', canvas.width / 2, canvas.height - 10);
    
    // Y-axis label
    ctx.save();
    ctx.translate(10, canvas.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillText('Frequency (Hz) / Velocity (m/s)', 0, 0);
    ctx.restore();
    
    // Legend
    ctx.textAlign = 'left';
    ctx.fillStyle = '#0d6efd';
    ctx.fillText('Frequency', canvas.width - 120, 20);
    ctx.fillStyle = '#dc3545';
    ctx.fillText('Velocity', canvas.width - 120, 35);
}

function showDetailedAnalysis() {
    if (!currentDetectionData) {
        alert('No analysis data available. Please run detection first.');
        return;
    }
    
    const modalElement = document.getElementById('frequencyModal');
    if (!modalElement) {
        console.error('Frequency modal not found');
        return;
    }
    
    const modal = new bootstrap.Modal(modalElement);
    
    // Populate modal content
    const modalContent = document.getElementById('frequencyAnalysisContent');
    if (modalContent) {
        modalContent.innerHTML = `
            <h6>Detailed Doppler Analysis</h6>
            <div class="row">
                <div class="col-6">
                    <strong>Source Frequency:</strong>
                </div>
                <div class="col-6">
                    ${currentDetectionData.f_source.toFixed(1)} Hz
                </div>
            </div>
            <div class="row">
                <div class="col-6">
                    <strong>Max Frequency (Approach):</strong>
                </div>
                <div class="col-6">
                    ${currentDetectionData.f_approach.toFixed(1)} Hz
                </div>
            </div>
            <div class="row">
                <div class="col-6">
                    <strong>Min Frequency (Recede):</strong>
                </div>
                <div class="col-6">
                    ${currentDetectionData.f_recede.toFixed(1)} Hz
                </div>
            </div>
            <div class="row">
                <div class="col-6">
                    <strong>Estimated Velocity:</strong>
                </div>
                <div class="col-6">
                    ${Math.abs(currentDetectionData.estimated_velocity * 3.6).toFixed(1)} km/h
                </div>
            </div>
            <div class="row">
                <div class="col-6">
                    <strong>Analysis Points:</strong>
                </div>
                <div class="col-6">
                    ${currentDetectionData.times.length} frames
                </div>
            </div>
            <div class="mt-3">
                <small class="text-muted">Analysis based on STFT with high-resolution processing</small>
            </div>
        `;
    }
    
    modal.show();
}

// ==================== INITIALIZATION FUNCTIONS ====================

function initializeDopplerApp() {
    console.log('Doppler Analysis App - Initializing...');
    
    // Add CSS for better visualization
    const additionalStyles = `
        .detection-results {
            background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
            border-left: 4px solid #0d6efd;
        }
        .analysis-chart {
            background: white;
            border-radius: 8px;
            padding: 15px;
            margin-top: 20px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        }
        .card {
            transition: transform 0.2s;
        }
        .card:hover {
            transform: translateY(-2px);
        }
        .spinner {
            animation: spin 1s linear infinite;

        }
        @keyframes spin {
            from { transform: rotate(0deg); }
            to { transform: rotate(360deg); }
        }
    `;

    // Inject styles
    const styleSheet = document.createElement('style');
    styleSheet.textContent = additionalStyles;
    document.head.appendChild(styleSheet);
    
    // Initialize file upload functionality
    initializeFileUpload();
    
    // Add event listener to detect button
    const detectBtn = document.getElementById('detectBtn');
    if (detectBtn) {
        detectBtn.addEventListener('click', function(e) {
            console.log('Detect button clicked via event listener');
            detectDoppler();
        });
    } else {
        console.error('Detect button not found!');
    }
    
    console.log('Doppler Analysis App - Ready!');
}




// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    initializeDopplerApp();
     doppler_downsampling_Tool.init();
});



// ==================== INITIALIZATION ====================

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Initializing Doppler Analysis Application...');
    
    // Initialize both tools
    doppler_downsampling_Tool.init();
    
    if (typeof initializeDopplerApp === 'function') {
        initializeDopplerApp();
    }
    
    console.log('✅ Doppler Analysis Application fully initialized');
});

// Debug function - can be called from browser console
window.debugDopplerApp = function() {
    console.log('🔍 Doppler App Debug Info:');
    console.log('- Downsampling filename:', doppler_downsampling_Tool.filename);
    console.log('- Current audio URL:', currentAudioUrl);
    console.log('- Detection data:', currentDetectionData);
    
    // Test server connection
    doppler_downsampling_Tool.testConnection();
};
(function() {
    // Prevent all link navigation
    document.addEventListener('click', function(e) {
        if (e.target.tagName === 'A' || e.target.closest('a')) {
            console.log('🚫 ALL link clicks prevented');
            e.preventDefault();
            e.stopPropagation();
            e.stopImmediatePropagation();
            return false;
        }
    }, true);
    
    // Prevent all form submissions
    document.addEventListener('submit', function(e) {
        console.log('🚫 ALL form submissions prevented');
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        return false;
    }, true);
    
    // Prevent browser navigation
    window.addEventListener('beforeunload', function(e) {
        console.log('🚫 ALL page unloads prevented');
        e.preventDefault();
        e.returnValue = '';
        return '';
    });
    
    // Prevent back/forward navigation
    history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', function(e) {
        history.pushState(null, null, window.location.href);
        console.log('🚫 Browser navigation prevented');
    });
})();