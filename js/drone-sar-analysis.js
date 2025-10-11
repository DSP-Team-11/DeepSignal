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
    const analyzeBtn = document.getElementById('analyzeBtn');
    const clearFileBtn = document.getElementById('clearFileBtn'); // Add this

    // File input change
    fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
    
    // Analyze button - FIXED
    analyzeBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        console.log('🎯 Analyze button clicked');
        this.analyzeDroneSound();
    });

    // Clear file button - ADD THIS
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
    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        // Allow common audio formats, not just WAV
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

        this.loadAudioFile(file);
    }

   clearFile() {
    const fileInput = document.getElementById('audioFile');
    const fileName = document.getElementById('fileName');
    const fileSize = document.getElementById('fileSize');
    const fileInfo = document.querySelector('.file-info');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsSection = document.getElementById('resultsSection');
    
    // Reset file input
    if (fileInput) fileInput.value = '';
    
    // Reset file info display
    if (fileName) fileName.textContent = '';
    if (fileSize) fileSize.textContent = '';
    if (fileInfo) fileInfo.classList.add('d-none');
    
    // Reset button
    if (analyzeBtn) analyzeBtn.disabled = true;
    
    // Hide results
    if (resultsSection) resultsSection.classList.add('d-none');
    
    // Clear waveform
    this.clearWaveform();
    
    this.audioBuffer = null;
    
    console.log('🗑️ File cleared');
}

clearWaveform() {
    const canvas = document.getElementById('waveformCanvas');
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
            console.error('Error loading audio file:', err);
            alert('Error loading audio file. Please try another file.');
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
    console.log('🎯 analyzeDroneSound method called');
    
    // Check if we have a file
    const fileInput = document.getElementById('audioFile');
    if (!fileInput || !fileInput.files || !fileInput.files.length) {
        console.error('❌ No file selected');
        alert('Please upload a file first');
        return;
    }

    const file = fileInput.files[0];
    console.log('📁 Selected file:', file.name, 'Size:', file.size, 'Type:', file.type);

    // Prevent multiple analyses
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
    console.log('🔄 Button state updated - disabled with spinner');

    try {
        console.log('📤 Preparing to send request to /predict...');
        
        const formData = new FormData();
        formData.append('file', file);

        // Add timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => {
            console.log('⏰ Request timeout after 30 seconds');
            controller.abort();
        }, 30000);

        console.log('🚀 Sending fetch request...');
        const response = await fetch('http://127.0.0.1:5000/predict', {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });

        clearTimeout(timeoutId);
        console.log('📥 Response received. Status:', response.status);

        if (!response.ok) {
            const errorText = await response.text();
            console.error('❌ Server returned error:', response.status, errorText);
            throw new Error(`Server error ${response.status}: ${errorText}`);
        }

        // Parse the response
        const data = await response.json();
        console.log('✅ Received JSON data:', data);

        // IMPORTANT: Call displayResults with the data
        console.log('🎯 Calling displayResults...');
        this.displayResults(data);

    } catch (error) {
        console.error('❌ Analysis failed:', error);
        
        let userMessage = 'Analysis failed: ';
        if (error.name === 'AbortError') {
            userMessage += 'Request timeout (30 seconds)';
        } else if (error.message.includes('Failed to fetch')) {
            userMessage += 'Cannot connect to server. Check if Flask is running.';
        } else {
            userMessage += error.message;
        }
        
        // Display error in the results section
        this.displayError(userMessage);
        
    } finally {
        // CRITICAL: Always reset button state
        console.log('🔄 Resetting button state');
        this.isAnalyzing = false;
        btn.innerHTML = originalText;
        btn.disabled = false;
    }
}
displayResults(data) {
    console.log('🎯 displayResults called with data:', data);
    
    try {
        const resultsSection = document.getElementById('resultsSection');
        const classificationResult = document.getElementById('classificationResult');
        const detailedAnalysis = document.getElementById('detailedAnalysis');
        
        console.log('🔍 DOM elements found:', {
            resultsSection: !!resultsSection,
            classificationResult: !!classificationResult,
            detailedAnalysis: !!detailedAnalysis
        });
        
        if (!resultsSection || !classificationResult) {
            throw new Error('Required DOM elements not found');
        }

        // Extract data with fallbacks
        const prediction = data.prediction || 'Unknown';
        const confidence = data.confidence || 0;
        const confidenceDisplay = (confidence * 100).toFixed(1) + '%';
        
        console.log('📊 Displaying results:', { prediction, confidence: confidenceDisplay });

        // Build classification result HTML
        const classificationHTML = `
            <div class="alert alert-success mb-3">
                <div class="d-flex justify-content-between align-items-start">
                    <div>
                        <h6 class="alert-heading mb-2">🎯 Classification Complete</h6>
                        <div class="mb-2">
                            <strong>Prediction:</strong>
                            <span class="badge bg-primary ms-2 fs-6">${prediction}</span>
                        </div>
                        <div class="mb-2">
                            <strong>Confidence:</strong>
                            <span class="badge bg-info ms-2 fs-6">${confidenceDisplay}</span>
                        </div>
                    </div>
                    <div class="text-end">
                        <span class="badge bg-success">✓ Analyzed</span>
                    </div>
                </div>
                ${data.timestamp ? `
                    <hr class="my-2">
                    <div class="small text-muted">
                        <strong>Processed:</strong> ${new Date(data.timestamp).toLocaleString()}
                    </div>
                ` : ''}
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
                            <li><strong>Status:</strong> Completed</li>
                            ${data.message ? `<li><strong>Message:</strong> ${data.message}</li>` : ''}
                        </ul>
                    </div>
                    <div class="col-md-6">
                        ${data.all_probabilities ? `
                            <h6>All Probabilities:</h6>
                            <div class="small">
                                ${Object.entries(data.all_probabilities)
                                    .map(([className, prob]) => 
                                        `<div class="d-flex justify-content-between">
                                            <span>${className}:</span>
                                            <span>${(prob * 100).toFixed(2)}%</span>
                                        </div>`
                                    ).join('')}
                            </div>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;

        // Update the DOM
        classificationResult.innerHTML = classificationHTML;
        if (detailedAnalysis) {
            detailedAnalysis.innerHTML = detailedHTML;
        }
        
        // Show results section with animation
        resultsSection.classList.remove('d-none');
        resultsSection.style.opacity = '0';
        resultsSection.style.transform = 'translateY(20px)';
        
        // Animate in
        setTimeout(() => {
            resultsSection.style.transition = 'all 0.3s ease';
            resultsSection.style.opacity = '1';
            resultsSection.style.transform = 'translateY(0)';
        }, 50);

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
        // Show the results section
        resultsSection.classList.remove('d-none');
        
        // Display error in the classification result area
        classificationResult.innerHTML = `
            <div class="alert alert-danger">
                <h6>❌ Analysis Failed</h6>
                <p class="mb-0">${message}</p>
                <hr>
                <small class="text-muted">Please check the console for more details.</small>
            </div>
        `;
        
        console.log('✅ Error message displayed in results section');
    }
}
    setupWaveformCanvas() {
            const canvas = document.getElementById('waveformCanvas');
            if (canvas) {
                canvas.width = canvas.offsetWidth;
                canvas.height = canvas.offsetHeight;
            }
        }
    
        checkHTMLStructure() {
    console.log('🔍 Checking HTML structure...');
    
    const elements = [
        'analyzeBtn',
        'resultsSection', 
        'classificationResult',
        'audioFile',
        'fileName',
        'fileSize'
    ];
    
    elements.forEach(id => {
        const element = document.getElementById(id);
        console.log(`📋 ${id}:`, element ? 'FOUND' : 'NOT FOUND', element);
    });   
}

// Add this to your DroneAnalyzer class
debugElements() {
    console.log('🔍 Debugging HTML elements...');
    
    const elements = {
        'resultsSection': document.getElementById('resultsSection'),
        'classificationResult': document.getElementById('classificationResult'),
        'waveformCanvas': document.getElementById('waveformCanvas'),
        'detailedAnalysis': document.getElementById('detailedAnalysis')
    };
    
    Object.entries(elements).forEach(([name, element]) => {
        if (element) {
            console.log(`✅ ${name}:`, {
                exists: true,
                classes: element.className,
                parent: element.parentElement ? element.parentElement.id : 'no parent ID',
                children: element.children.length
            });
        } else {
            console.log(`❌ ${name}: NOT FOUND`);
        }
    });
    
    // Test if we can modify the classificationResult
    const testElement = document.getElementById('classificationResult');
    if (testElement) {
        const testContent = document.createElement('div');
        testContent.className = 'alert alert-warning';
        testContent.innerHTML = '<strong>TEST:</strong> If you see this, element targeting works!';
        testElement.appendChild(testContent);
        console.log('🧪 Test content added to classificationResult');
    }
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
        const analyzeBtn = document.getElementById('analyzeSarBtn');

        if (!fileInput || !uploadArea) {
            console.warn('SAR analysis elements not found in the DOM');
            return;
        }

        fileInput.addEventListener('change', (e) => this.handleFileSelect(e));
        
        // Prevent form submission
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

// Initialize both analyzers when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    // Initialize Drone Analyzer
    const droneAnalyzer = new DroneAnalyzer();
    window.droneAnalyzer = droneAnalyzer; // Make it globally available for debugging
    
    // Initialize SAR Analyzer
    const sarAnalyzer = new SARAnalyzer();
    window.sarAnalyzer = sarAnalyzer; // Make it globally available for debugging
    
    console.log('DeepSignal analyzers initialized successfully');
});
