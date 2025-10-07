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
            if (e.dataTransfer.files.length) {
                fileInput.files = e.dataTransfer.files;
                this.handleFileSelect(e);
            }
        });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        if (!file.name.toLowerCase().endsWith('.wav')) {
            alert('Please upload a .wav file');
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

        this.loadAudioFile(file);
    }

    clearFile() {
        document.getElementById('audioFile').value = '';
        document.querySelector('.file-info').classList.add('d-none');
        document.getElementById('analyzeBtn').disabled = true;
        this.audioBuffer = null;
        const canvas = document.getElementById('waveformCanvas');
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        document.getElementById('resultsSection').classList.add('d-none');
    }

    async loadAudioFile(file) {
        try {
            if (!this.audioContext) {
                this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
            }

            const arrayBuffer = await file.arrayBuffer();
            this.audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
            this.drawWaveform();
        } catch (err) {
            console.error(err);
            alert('Error loading audio file.');
        }
    }

    drawWaveform() {
        if (!this.audioBuffer) return;
        const canvas = document.getElementById('waveformCanvas');
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        const data = this.audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);

        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, width, height);

        ctx.strokeStyle = '#00ff00';
        ctx.lineWidth = 1;
        ctx.beginPath();

        for (let i = 0; i < width; i++) {
            const val = data[i*step] * height/2;
            const y = height/2 + val;
            if (i === 0) ctx.moveTo(i, y);
            else ctx.lineTo(i, y);
        }
        ctx.stroke();
    }

    async analyzeDroneSound() {
        if (!this.audioBuffer) return alert('Please upload a file first');
        if (this.isAnalyzing) return;

        this.isAnalyzing = true;
        const btn = document.getElementById('analyzeBtn');
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';
        btn.disabled = true;

        const file = document.getElementById('audioFile').files[0];
        const formData = new FormData();
        formData.append('file', file);

        try {
            const res = await fetch('http://127.0.0.1:5000/classify', {
                method: 'POST',
                body: formData
            });
            
            if (!res.ok) {
                throw new Error(`Server returned ${res.status}: ${res.statusText}`);
            }
            
            const data = await res.json();
            this.displayResults(data);
        } catch (err) {
            console.error('Drone analysis error:', err);
            alert('Error during drone sound analysis. Please check the console for details.');
        } finally {
            this.isAnalyzing = false;
            btn.innerHTML = '<i class="bi-play-circle me-2"></i>Analyze Drone Sound';
            btn.disabled = false;
        }
    }

    displayResults(data) {
        document.getElementById('resultsSection').classList.remove('d-none');
        document.getElementById('classificationResult').innerHTML = `
            <div class="alert alert-info">
                <h6>${data.label}</h6>
                <p>Confidence: ${(data.confidence*100).toFixed(1)}%</p>
            </div>
        `;
    }

    setupWaveformCanvas() {
        const canvas = document.getElementById('waveformCanvas');
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }
}

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

        if (!fileInput || !uploadArea) {
            console.warn('SAR analysis elements not found in the DOM');
            return;
        }

        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));

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
            // For TIFF files, show a placeholder and convert to PNG for preview
            previewImage.src = 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjIwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwJSIgaGVpZ2h0PSIxMDAlIiBmaWxsPSIjZGRkIi8+PHRleHQgeD0iNTAlIiB5PSI1MCUiIGZvbnQtZmFtaWx5PSJBcmlhbCwgc2Fucy1zZXJpZiIgZm9udC1zaXplPSIxNCIgZmlsbD0iIzY2NiIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iPlRJRiBGaWxlPC90ZXh0Pjx0ZXh0IHg9IjUwJSIgeT0iNjAlIiBmb250LWZhbWlseT0iQXJpYWwsIHNhbnMtc2VyaWYiIGZvbnQtc2l6ZT0iMTIiIGZpbGw9IiM2NjYiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGR5PSIuM2VtIj4kew            fileLm5hbWV9PC90ZXh0Pjwvc3ZnPg==';
            previewContainer.classList.remove('d-none');
            
            // Optionally, you can send the TIFF to the backend for conversion and preview
            // this.convertTiffForPreview(file);
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

    // Optional: Convert TIFF to PNG for preview using the backend
    async convertTiffForPreview(file) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const res = await fetch('http://127.0.0.1:5000/sar/convert', {
                method: 'POST',
                body: formData
            });
            
            if (res.ok) {
                const data = await res.json();
                document.getElementById('previewImage').src = data.converted_image;
            }
        } catch (err) {
            console.error('Error converting TIFF for preview:', err);
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
        btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';
        btn.disabled = true;

        const formData = new FormData();
        formData.append('file', this.sarImage);

        try {
            // Send to backend for processing
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
            alert('Error during SAR analysis. Please check the console for details.');
        } finally {
            this.isAnalyzing = false;
            btn.innerHTML = '<i class="bi-gear me-2"></i>Analyze SAR Image';
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
        
        // Display the uploaded image and the generated plot
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
        
        // Display analysis details if available
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
        } else {
            // Fallback if no analysis data
            const analysisDetails = document.getElementById('sarAnalysisDetails');
            if (analysisDetails) {
                analysisDetails.innerHTML = `
                    <p>SAR image analysis completed. The plot shows the intensity distribution and histogram of the SAR data.</p>
                    <p><strong>File:</strong> ${this.sarImage.name}</p>
                `;
            }
        }
    }
}

// Initialize both analyzers when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Drone Analyzer
    const droneAnalyzer = new DroneAnalyzer();
    window.analyzeDroneSound = () => droneAnalyzer.analyzeDroneSound();
    window.clearFile = () => droneAnalyzer.clearFile();
    
    // Initialize SAR Analyzer
    const sarAnalyzer = new SARAnalyzer();
    window.analyzeSarImage = () => sarAnalyzer.analyzeSarImage();
    window.clearSarFile = () => sarAnalyzer.clearSarFile();
    
    console.log('DeepSignal analyzers initialized successfully');
});