class DroneAnalyzer {
    constructor() {
        this.audioContext = null;
        this.audioBuffer = null;
        this.processedAudioBuffer = null;
        this.isAnalyzing = false;
        this.currentSampleRate = 16000;
        this.confidenceData = [];
        this.currentFilename = "";
        this.confidenceChart = null;
        this.init();
    }

    init() {
        this.bindEvents();
        this.setupWaveformCanvas();
        this.setupSampleRateSlider();
        this.initConfidenceChart();
        this.setupAudioPlayer();
    }

    bindEvents() {
        const fileInput = document.getElementById('audioFile');
        const uploadArea = document.querySelector('.upload-area');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const clearFileBtn = document.getElementById('clearFileBtn');

        // File input change
        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Analyze button
        analyzeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            console.log('🎯 Analyze button clicked');
            this.analyzeWithCurrentSampleRate();
        });

        // Clear file button
        if (clearFileBtn) {
            clearFileBtn.addEventListener('click', (e) => {
                e.preventDefault();
                this.clearFile();
            });
        }

        // Drag & Drop
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#198754';
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#dee2e6';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#dee2e6';
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                this.handleFileSelect(e);
            }
        });

        console.log('✅ Event binding completed');
    }

    setupSampleRateSlider() {
        const slider = document.getElementById('sampleRateSlider');
        const srValue = document.getElementById('srValue');
        
        if (slider && srValue) {
            slider.addEventListener('input', (e) => {
                this.currentSampleRate = parseInt(e.target.value);
                srValue.textContent = this.currentSampleRate + ' Hz';
                
                // Auto-analyze when slider changes if we have a file
                if (this.currentFilename) {
                    this.analyzeWithCurrentSampleRate();
                }
            });
        }
    }

    setupAudioPlayer() {
        const audioPlayer = document.getElementById('audioPlayer');
        if (audioPlayer) {
            // Add debug event listeners
            audioPlayer.addEventListener('error', (e) => {
                console.error('❌ Audio player error:', audioPlayer.error);
            });
            
            audioPlayer.addEventListener('loadeddata', () => {
                console.log('✅ Audio data loaded');
            });
            
            audioPlayer.addEventListener('canplay', () => {
                console.log('🎵 Audio can play');
            });
        }
    }

    initConfidenceChart() {
        const ctx = document.getElementById('confidenceChart').getContext('2d');
        this.confidenceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: [],
                datasets: [{
                    label: 'Drone Confidence',
                    data: [],
                    borderColor: 'green',
                    backgroundColor: 'rgba(0,255,0,0.2)',
                    fill: true,
                    tension: 0.3,
                    pointBackgroundColor: 'blue',
                    pointBorderColor: 'white',
                    pointRadius: 6,
                    pointHoverRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                return `Confidence: ${(context.raw * 100).toFixed(2)}%`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        title: {
                            display: true,
                            text: 'Sample Rate (Hz)'
                        },
                        reverse: true
                    },
                    y: {
                        title: {
                            display: true,
                            text: 'Drone Confidence'
                        },
                        min: 0,
                        max: 1,
                        ticks: {
                            callback: function(value) {
                                return (value * 100).toFixed(0) + '%';
                            }
                        }
                    }
                }
            }
        });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Allow common audio formats
        const audioFormats = ['.wav', '.mp3', '.m4a', '.flac', '.aac'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!audioFormats.includes(fileExtension)) {
            alert('Please upload an audio file (WAV, MP3, M4A, FLAC, AAC)');
            return;
        }

        if (file.size > 50 * 1024 * 1024) {
            alert('File size must be less than 50MB');
            return;
        }

        document.getElementById('fileName').textContent = file.name;
        document.getElementById('fileSize').textContent = (file.size / (1024*1024)).toFixed(2) + ' MB';
        document.querySelector('.file-info').classList.remove('d-none');
        document.getElementById('analyzeBtn').disabled = false;

        // Show downsampling controls
        this.showDownsamplingControls();

        this.loadAudioFile(file);
    }

    showDownsamplingControls() {
        const downsamplingSection = document.getElementById('downsamplingSection');
        if (downsamplingSection) {
            downsamplingSection.classList.remove('d-none');
        }
    }

    hideDownsamplingControls() {
        const downsamplingSection = document.getElementById('downsamplingSection');
        if (downsamplingSection) {
            downsamplingSection.classList.add('d-none');
        }
    }

    async loadAudioFile(file) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const arrayBuffer = await file.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.drawWaveform(this.audioBuffer, 'waveformCanvas', 'Original Audio');
            
            // Reset confidence data and upload file
            this.confidenceData = [];
            await this.uploadFile(file);
            
        } catch (err) {
            console.error('Error loading audio file:', err);
            alert('Error loading audio file. Please try another file.');
        }
    }

    async uploadFile(file) {
        try {
            console.log('📤 Uploading file...');
            const formData = new FormData();
            formData.append('file', file);

            const response = await fetch('http://127.0.0.1:5000/api/drone-downsample/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.status}`);
            }

            const data = await response.json();
            console.log('✅ File uploaded successfully:', data);

            if (data.success) {
                this.currentFilename = data.filename;
                // Auto-analyze with current sample rate
                this.analyzeWithCurrentSampleRate();
            } else {
                throw new Error(data.error || 'Upload failed');
            }

        } catch (error) {
            console.error('❌ Upload failed:', error);
            alert('File upload failed: ' + error.message);
        }
    }

    async analyzeWithCurrentSampleRate() {
        if (!this.currentFilename) {
            console.error('No file uploaded yet');
            return;
        }

        if (this.isAnalyzing) {
            console.log('⚠️ Already analyzing, skipping...');
            return;
        }

        this.isAnalyzing = true;
        const btn = document.getElementById('analyzeBtn');
        const originalText = btn.innerHTML;
        
        // Update UI
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';
        btn.disabled = true;

        try {
            console.log('🔄 Processing with sample rate:', this.currentSampleRate);
            
            const processData = {
                filename: this.currentFilename,
                sample_rate: this.currentSampleRate
            };

            const response = await fetch('http://127.0.0.1:5000/api/drone-downsample/process', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(processData)
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Processing failed: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('✅ Processing completed:', result);

            if (result.success) {
                // Update audio player with processed audio
                await this.updateAudioPlayer(result.audio_url);

                // Store confidence data
                this.updateConfidenceData(result);

                // Display results
                this.displayResults(result);
            } else {
                throw new Error(result.error || 'Processing failed');
            }

        } catch (error) {
            console.error('❌ Analysis failed:', error);
            this.displayError('Analysis failed: ' + error.message);
        } finally {
            this.isAnalyzing = false;
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    async updateAudioPlayer(audioUrl) {
        const audioPlayer = document.getElementById('audioPlayer');
        if (!audioPlayer || !audioUrl) {
            console.warn('Audio player or URL not available');
            return;
        }

        try {
            // Create absolute URL if needed
            const fullAudioUrl = audioUrl.startsWith('http') ? 
                audioUrl : 
                `http://127.0.0.1:5000${audioUrl}`;

            console.log('🎵 Setting audio player source:', fullAudioUrl);

            // Clear previous source
            audioPlayer.src = '';
            
            // Set new source
            audioPlayer.src = fullAudioUrl;
            
            // Load the new source
            audioPlayer.load();

            // Load processed audio for waveform display
            await this.loadProcessedAudioForWaveform(fullAudioUrl);

        } catch (error) {
            console.error('❌ Error updating audio player:', error);
        }
    }

    async loadProcessedAudioForWaveform(audioUrl) {
        try {
            console.log('🎵 Loading processed audio for waveform...');
            
            const response = await fetch(audioUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch processed audio: ${response.status}`);
            }

            const audioBlob = await response.blob();
            const arrayBuffer = await audioBlob.arrayBuffer();

            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            // Decode the processed audio data
            this.processedAudioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            
            // Draw the processed audio waveform
            this.drawWaveform(this.processedAudioBuffer, 'processedWaveformCanvas', 'Processed Audio');

        } catch (error) {
            console.error('❌ Error loading processed audio for waveform:', error);
        }
    }

    drawWaveform(audioBuffer, canvasId, title = 'Audio Waveform') {
        if (!audioBuffer) {
            console.warn('No audio buffer available for waveform');
            return;
        }
        
        const canvas = document.getElementById(canvasId);
        if (!canvas) {
            console.error(`Canvas not found: ${canvasId}`);
            return;
        }

        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const data = audioBuffer.getChannelData(0); // Use first channel
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Set background
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        // Draw waveform
        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();

        // Calculate step to fit waveform in canvas width
        const step = Math.ceil(data.length / width);
        
        // Find the maximum absolute value for normalization
        let maxVal = 0.001; // Avoid division by zero
        for (let i = 0; i < data.length; i += Math.max(1, Math.floor(data.length / 1000))) {
            maxVal = Math.max(maxVal, Math.abs(data[i]));
        }
        
        // Draw the waveform
        for (let i = 0; i < width; i++) {
            const index = Math.min(Math.floor(i * step), data.length - 1);
            const normalizedVal = data[index] / maxVal;
            const y = height / 2 + (normalizedVal * height / 2);
            
            if (i === 0) {
                ctx.moveTo(i, y);
            } else {
                ctx.lineTo(i, y);
            }
        }
        
        ctx.stroke();

        // Add title
        ctx.fillStyle = '#fff';
        ctx.font = '12px Arial';
        ctx.textAlign = 'center';
        ctx.fillText(title, width / 2, 15);
        
        console.log(`✅ Waveform drawn: ${title}`);
    }

    updateConfidenceData(result) {
        const sampleRate = result.sample_rate;
        const confidence = result.confidence;
        const label = result.label;

        // Calculate drone confidence (if label is "drone", use confidence directly, otherwise use 1-confidence)
        const droneConfidence = label.toLowerCase() === 'drone' ? confidence : (1 - confidence);

        // Find if we already have data for this sample rate
        const existingIndex = this.confidenceData.findIndex(item => item.sampleRate === sampleRate);
        
        if (existingIndex !== -1) {
            // Update existing data
            this.confidenceData[existingIndex] = {
                sampleRate,
                confidence,
                droneConfidence,
                label
            };
        } else {
            // Add new data
            this.confidenceData.push({
                sampleRate,
                confidence,
                droneConfidence,
                label
            });
        }

        // Sort by sample rate (descending)
        this.confidenceData.sort((a, b) => b.sampleRate - a.sampleRate);

        // Update chart
        this.updateConfidenceChart();
    }

    updateConfidenceChart() {
        if (!this.confidenceChart || this.confidenceData.length === 0) return;

        const sampleRates = this.confidenceData.map(item => item.sampleRate + ' Hz');
        const confidences = this.confidenceData.map(item => item.droneConfidence);

        this.confidenceChart.data.labels = sampleRates;
        this.confidenceChart.data.datasets[0].data = confidences;
        this.confidenceChart.update();

        console.log('📊 Chart updated with data:', this.confidenceData);
    }

    displayResults(data) {
        console.log('🎯 displayResults called with data:', data);
        
        try {
            const resultsSection = document.getElementById('resultsSection');
            const classificationResult = document.getElementById('classificationResult');
            const detailedAnalysis = document.getElementById('detailedAnalysis');
            
            if (!resultsSection || !classificationResult) {
                throw new Error('Required DOM elements not found');
            }

            const prediction = data.label || 'Unknown';
            const confidence = data.confidence || 0;
            const confidenceDisplay = (confidence * 100).toFixed(1) + '%';
            const sampleRate = data.sample_rate || this.currentSampleRate;

            // Build classification result HTML
            const classificationHTML = `
                <div class="alert ${prediction.toLowerCase() === 'drone' ? 'alert-success' : 'alert-warning'} mb-3">
                    <div class="d-flex justify-content-between align-items-start">
                        <div>
                            <h6 class="alert-heading mb-2">🎯 Classification Complete</h6>
                            <div class="mb-2">
                                <strong>Prediction:</strong>
                                <span class="badge ${prediction.toLowerCase() === 'drone' ? 'bg-success' : 'bg-warning'} ms-2 fs-6">${prediction.toUpperCase()}</span>
                            </div>
                            <div class="mb-2">
                                <strong>Confidence:</strong>
                                <span class="badge bg-info ms-2 fs-6">${confidenceDisplay}</span>
                            </div>
                            <div class="mb-2">
                                <strong>Sample Rate:</strong>
                                <span class="badge bg-secondary ms-2 fs-6">${sampleRate} Hz</span>
                            </div>
                        </div>
                        <div class="text-end">
                            <span class="badge bg-success">✓ Analyzed</span>
                        </div>
                    </div>
                </div>
            `;

            // Build detailed analysis HTML
            const detailedHTML = `
                <div class="analysis-details">
                    <h6>Analysis Information</h6>
                    <div class="row">
                        <div class="col-md-6">
                            <ul class="list-unstyled">
                                <li><strong>Model:</strong> Drone Audio Classifier</li>
                                <li><strong>Sample Rate:</strong> ${sampleRate} Hz</li>
                                <li><strong>Status:</strong> Completed</li>
                                ${data.message ? `<li><strong>Message:</strong> ${data.message}</li>` : ''}
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <h6>Aliasing Analysis</h6>
                            <div class="small">
                                <div class="d-flex justify-content-between">
                                    <span>Current Confidence:</span>
                                    <span>${confidenceDisplay}</span>
                                </div>
                                <div class="d-flex justify-content-between">
                                    <span>Data Points:</span>
                                    <span>${this.confidenceData.length}</span>
                                </div>
                                <div class="d-flex justify-content-between">
                                    <span>Sample Rate Range:</span>
                                    <span>${Math.min(...this.confidenceData.map(d => d.sampleRate))} - ${Math.max(...this.confidenceData.map(d => d.sampleRate))} Hz</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            // Update the DOM
            classificationResult.innerHTML = classificationHTML;
            if (detailedAnalysis) {
                detailedAnalysis.innerHTML = detailedHTML;
            }
            
            // Show results section
            resultsSection.classList.remove('d-none');

            console.log('✅ Results displayed successfully');

        } catch (error) {
            console.error('❌ Error in displayResults:', error);
            this.displayError('Failed to display results: ' + error.message);
        }
    }

    displayError(message) {
        console.log('🔄 Displaying error:', message);
        
        const resultsSection = document.getElementById('resultsSection');
        const classificationResult = document.getElementById('classificationResult');
        
        if (resultsSection && classificationResult) {
            resultsSection.classList.remove('d-none');
            classificationResult.innerHTML = `
                <div class="alert alert-danger">
                    <h6>❌ Analysis Failed</h6>
                    <p class="mb-0">${message}</p>
                </div>
            `;
        }
    }

    clearFile() {
        const fileInput = document.getElementById('audioFile');
        const fileName = document.getElementById('fileName');
        const fileSize = document.getElementById('fileSize');
        const fileInfo = document.querySelector('.file-info');
        const analyzeBtn = document.getElementById('analyzeBtn');
        const resultsSection = document.getElementById('resultsSection');
        const audioPlayer = document.getElementById('audioPlayer');
        
        // Reset file input
        if (fileInput) fileInput.value = '';
        
        // Reset file info display
        if (fileName) fileName.textContent = '';
        if (fileSize) fileSize.textContent = '';
        if (fileInfo) fileInfo.classList.add('d-none');
        
        // Reset button
        if (analyzeBtn) analyzeBtn.disabled = true;
        
        // Hide results and downsampling controls
        if (resultsSection) resultsSection.classList.add('d-none');
        this.hideDownsamplingControls();
        
        // Clear audio player
        if (audioPlayer) {
            audioPlayer.src = '';
            audioPlayer.load();
        }
        
        // Clear waveform and data
        this.clearWaveforms();
        this.currentFilename = "";
        this.confidenceData = [];
        
        // Reset chart
        if (this.confidenceChart) {
            this.confidenceChart.data.labels = [];
            this.confidenceChart.data.datasets[0].data = [];
            this.confidenceChart.update();
        }
        
        this.audioBuffer = null;
        this.processedAudioBuffer = null;
        
        console.log('🗑️ File cleared');
    }

    clearWaveforms() {
        const canvases = ['waveformCanvas', 'processedWaveformCanvas'];
        
        canvases.forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                const ctx = canvas.getContext('2d');
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Draw a blank state
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#666';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '14px Arial';
                ctx.fillText('No audio loaded', canvas.width / 2, canvas.height / 2);
            }
        });
    }

    setupWaveformCanvas() {
        const canvases = ['waveformCanvas', 'processedWaveformCanvas'];
        
        canvases.forEach(canvasId => {
            const canvas = document.getElementById(canvasId);
            if (canvas) {
                // Set explicit dimensions
                canvas.width = canvas.offsetWidth || 500;
                canvas.height = canvas.offsetHeight || 150;
                
                // Initialize with blank state
                const ctx = canvas.getContext('2d');
                ctx.fillStyle = '#000';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.fillStyle = '#666';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.font = '14px Arial';
                ctx.fillText('No audio loaded', canvas.width / 2, canvas.height / 2);
            }
        });
    }
}

// SARAnalyzer class remains the same
class SARAnalyzer {
    constructor() {
        this.sarImage = null;
        this.isAnalyzing = false;
        this.init();
    }

    init() {
        this.bindEvents();
    }

    bindEvents() {
        const fileInput = document.getElementById('sarImageFile');
        const uploadArea = document.getElementById('sarUploadArea');
        const analyzeBtn = document.getElementById('analyzeSarBtn');

        if (!fileInput || !uploadArea) {
            console.warn('SAR analysis elements not found in the DOM');
            return;
        }

        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        analyzeBtn.addEventListener('click', (e) => {
            e.preventDefault();
            this.analyzeSarImage();
        });

        // Drag & Drop for SAR image
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#198754';
        });

        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#dee2e6';
        });

        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#dee2e6';
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                this.handleFileSelect(e);
            }
        });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Check if it's an image file
        const isTiff = file.name.toLowerCase().endsWith('.tif') || file.name.toLowerCase().endsWith('.tiff');
        const isImage = file.type.match('image.*') && !isTiff;
        
        if (!isImage && !isTiff) {
            alert('Please upload an image file (JPG, PNG, TIFF, etc.)');
            return;
        }

        document.getElementById('sarFileName').textContent = file.name;
        document.getElementById('sarFileSize').textContent = (file.size / (1024*1024)).toFixed(2) + ' MB';
        document.getElementById('sarFileInfo').classList.remove('d-none');
        document.getElementById('analyzeSarBtn').disabled = false;

        // Preview the image
        this.previewImage(file, isTiff);
        this.sarImage = file;
    }

    previewImage(file, isTiff) {
        const previewContainer = document.getElementById('sarImagePreview');
        const previewImage = document.getElementById('previewImage');
        
        if (isTiff) {
            // For TIFF files, show a placeholder
            previewImage.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlRJRiBGaWxlPC90ZXh0Pjx0ZXh0IHg9IjUwJSIgeT0iNjAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM2NjYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj4ke2ZpbGUubmFtZX08L3RleHQ+PC9zdmc+';
            previewContainer.classList.remove('d-none');
        } else {
            // For regular image files, use FileReader for preview
            const reader = new FileReader();
            reader.onload = (e) => {
                previewImage.src = e.target.result;
                previewContainer.classList.remove('d-none');
            };
            reader.readAsDataURL(file);
        }
    }

    clearSarFile() {
        document.getElementById('sarImageFile').value = '';
        document.getElementById('sarFileInfo').classList.add('d-none');
        document.getElementById('sarImagePreview').classList.add('d-none');
        document.getElementById('analyzeSarBtn').disabled = true;
        this.sarImage = null;
        document.getElementById('sarResultsSection').classList.add('d-none');
    }

    async analyzeSarImage() {
        if (!this.sarImage) return alert('Please upload a SAR image first');
        if (this.isAnalyzing) return;

        this.isAnalyzing = true;
        const btn = document.getElementById('analyzeSarBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('file', this.sarImage);

        try {
            const res = await fetch('http://127.0.0.1:5000/sar/analyze', {
                method: 'POST',
                body: formData
            });
            
            if (!res.ok) {
                throw new Error(`Server returned ${res.status}: ${res.statusText}`);
            }
            
            const data = await res.json();
            this.displaySarResults(data);
        } catch (err) {
            console.error('SAR analysis error:', err);
            alert('Error during SAR analysis: ' + err.message);
        } finally {
            this.isAnalyzing = false;
            btn.innerHTML = originalText;
            btn.disabled = false;
        }
    }

    displaySarResults(data) {
        const resultsSection = document.getElementById('sarResultsSection');
        if (!resultsSection) {
            console.error('SAR results section not found');
            return;
        }

        resultsSection.classList.remove('d-none');
        
        if (data.original_image) {
            const result1Element = document.getElementById('sarResult1');
            if (result1Element) {
                result1Element.innerHTML = `
                    <h6>Uploaded SAR Image</h6>
                    <img src="${data.original_image}" alt="Uploaded SAR Image" class="result-image">
                    <p class="mt-2 text-muted small">Processed and converted to PNG</p>
                `;
            }
        }
        
        if (data.generated_plot) {
            const result2Element = document.getElementById('sarResult2');
            if (result2Element) {
                result2Element.innerHTML = `
                    <h6>Intensity Analysis Plot</h6>
                    <img src="${data.generated_plot}" alt="SAR Analysis Plot" class="result-image">
                    <p class="mt-2 text-muted small">Intensity distribution and histogram</p>
                `;
            }
        }
        
        if (data.analysis) {
            const analysisDetails = document.getElementById('sarAnalysisDetails');
            if (analysisDetails) {
                analysisDetails.innerHTML = `
                    <div class="row">
                        <div class="col-md-6">
                            <h6>Statistical Analysis</h6>
                            <ul class="list-unstyled">
                                <li><strong>Mean Intensity:</strong> ${data.analysis.mean || 'N/A'} dB</li>
                                <li><strong>Median Intensity:</strong> ${data.analysis.median || 'N/A'} dB</li>
                                <li><strong>Min Intensity:</strong> ${data.analysis.min || 'N/A'} dB</li>
                                <li><strong>Max Intensity:</strong> ${data.analysis.max || 'N/A'} dB</li>
                                <li><strong>Standard Deviation:</strong> ${data.analysis.std || 'N/A'} dB</li>
                            </ul>
                        </div>
                        <div class="col-md-6">
                            <h6>Image Information</h6>
                            <ul class="list-unstyled">
                                <li><strong>File Name:</strong> ${this.sarImage.name}</li>
                                <li><strong>File Size:</strong> ${(this.sarImage.size / (1024*1024)).toFixed(2)} MB</li>
                                <li><strong>Type:</strong> ${data.file_info?.processed_type || 'Processed'}</li>
                                <li><strong>Dimensions:</strong> ${data.metadata?.width || 'N/A'} × ${data.metadata?.height || 'N/A'}</li>
                            </ul>
                        </div>
                    </div>
                `;
            }
        }
    }
}

// Global function to set sample rate quickly
function setSampleRate(rate) {
    const slider = document.getElementById('sampleRateSlider');
    const srValue = document.getElementById('srValue');
    
    if (slider && srValue) {
        slider.value = rate;
        srValue.textContent = rate + ' Hz';
        
        // Trigger the input event to update the analyzer
        slider.dispatchEvent(new Event('input'));
    }
}

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    window.droneAnalyzer = new DroneAnalyzer();
    window.sarAnalyzer = new SARAnalyzer();
    console.log('🚀 Drone and SAR Analyzers initialized');
});