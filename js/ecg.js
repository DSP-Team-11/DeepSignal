document.addEventListener('DOMContentLoaded', function() {
    const signalViewer = document.getElementById('signal-viewer');
    const viewerTitle = document.getElementById('viewer-title');
    const channelList = document.getElementById('channel-list');
    const backButton = document.getElementById('back-to-selection');
    const analyzeBtn = document.getElementById('analyze-btn');
    
    // ECG Lead configuration - Standard 12-lead ECG
    const ecgChannels = [
        'I', 'II', 'III', 'aVR', 'aVL', 'aVF',
        'V1', 'V2', 'V3', 'V4', 'V5', 'V6'
    ];

    let currentViewerMode = 'standard';

    // Back to medical signals
    backButton.addEventListener('click', function() {
        window.location.href = 'medical-signals.html';
    });

    // Viewer option selection
    document.querySelectorAll('.viewer-option').forEach(option => {
        option.addEventListener('click', function() {
            document.querySelectorAll('.viewer-option').forEach(opt => {
                opt.classList.remove('active');
            });
            this.classList.add('active');
            
            currentViewerMode = this.getAttribute('data-viewer');
            updateViewerMode(currentViewerMode);
        });
    });

    function populateChannels() {
        channelList.innerHTML = '';
        
        ecgChannels.forEach((channel, index) => {
            const channelItem = document.createElement('div');
            channelItem.className = 'form-check';
            channelItem.innerHTML = `
                <input class="form-check-input channel-checkbox" type="checkbox" id="ecg-channel-${index}" checked>
                <label class="form-check-label" for="ecg-channel-${index}">
                    ${channel}
                </label>
            `;
            channelList.appendChild(channelItem);
        });

        // Add event listeners to channel checkboxes
        document.querySelectorAll('.channel-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', function() {
                updateViewerMode(currentViewerMode);
            });
        });
    }

    function updateViewerMode(viewerType) {
        const canvas = document.getElementById('signal-canvas');
        const selectedChannels = getSelectedChannels();
        
        // Clear canvas
        canvas.innerHTML = '';
        
        switch(viewerType) {
            case 'standard':
                renderECGStandardView(canvas, selectedChannels);
                break;
            case 'xor':
                renderECGXORView(canvas, selectedChannels);
                break;
            case 'polar':
                renderECGPolarView(canvas, selectedChannels);
                break;
            case 'recurrence':
                renderECGRecurrenceView(canvas, selectedChannels);
                break;
        }
    }

    function renderECGStandardView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-activity display-4 text-primary mb-3"></i>
                <h5>ECG Standard View</h5>
                <p class="text-muted">Displaying ${channels.length} ECG leads</p>
                <small class="text-muted">Standard 12-lead electrocardiogram</small>
                <div class="mt-3 p-3 bg-light rounded">
                    <small class="text-muted">Leads active: ${channels.join(', ')}</small>
                </div>
            </div>
        `;
    }

    function renderECGXORView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-layers display-4 text-warning mb-3"></i>
                <h5>ECG XOR Comparison</h5>
                <p class="text-muted">Comparing ${channels.length} leads for abnormalities</p>
                <small class="text-muted">Morphological difference analysis</small>
                <div class="mt-3 p-3 bg-light rounded">
                    <small class="text-muted">ST segment and T-wave analysis active</small>
                </div>
            </div>
        `;
    }

    function renderECGPolarView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-bullseye display-4 text-info mb-3"></i>
                <h5>ECG Polar View</h5>
                <p class="text-muted">Vectorcardiography of ${channels.length} leads</p>
                <small class="text-muted">Cardiac vector analysis</small>
                <div class="mt-3 p-3 bg-light rounded">
                    <small class="text-muted">Mean electrical axis calculation</small>
                </div>
            </div>
        `;
    }

    function renderECGRecurrenceView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-diagram-3 display-4 text-danger mb-3"></i>
                <h5>ECG Recurrence Plot</h5>
                <p class="text-muted">Recurrence analysis of ${channels.length} leads</p>
                <small class="text-muted">Heart rhythm periodicity detection</small>
                <div class="mt-3 p-3 bg-light rounded">
                    <small class="text-muted">RR interval variability analysis</small>
                </div>
            </div>
        `;
    }

    function getSelectedChannels() {
        const selected = [];
        document.querySelectorAll('.channel-checkbox:checked').forEach(checkbox => {
            const label = checkbox.nextElementSibling;
            selected.push(label.textContent.trim());
        });
        return selected;
    }

    // Analyze button click
    analyzeBtn.addEventListener('click', function() {
        const selectedChannels = getSelectedChannels();
        const realTime = document.getElementById('real-time-toggle').checked;
        const aiAnalysis = document.getElementById('ai-analysis').checked;
        const heartRate = document.getElementById('heart-rate').checked;
        
        // Show processing indicator
        const canvas = document.getElementById('signal-canvas');
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <h5>Processing ECG Data...</h5>
                <p class="text-muted">Analyzing ${selectedChannels.length} leads</p>
                <small class="text-muted">
                    Real-time: ${realTime ? 'ON' : 'OFF'} | 
                    AI Detection: ${aiAnalysis ? 'ON' : 'OFF'} |
                    Heart Rate: ${heartRate ? 'ON' : 'OFF'}
                </small>
            </div>
        `;
        
        // Simulate processing delay with ECG-specific message
        setTimeout(() => {
            canvas.innerHTML = `
                <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                    <i class="bi-check-circle display-4 text-primary mb-3"></i>
                    <h5>ECG Analysis Complete</h5>
                    <p class="text-muted">Processed ${selectedChannels.length} leads successfully</p>
                    <div class="mt-3 p-3 bg-light rounded">
                        <small class="text-success">
                            <i class="bi-check-lg"></i> Normal sinus rhythm<br>
                            <i class="bi-check-lg"></i> Heart rate: 72 BPM<br>
                            <i class="bi-check-lg"></i> No arrhythmia detected
                        </small>
                    </div>
                </div>
            `;
        }, 2000);
    });

    // Initialize ECG channels
    populateChannels();
    updateViewerMode('standard');
});

// Signal Upload Functionality
document.addEventListener('DOMContentLoaded', function() {
    const uploadInput = document.getElementById('signal-upload');
    const uploadBtn = document.getElementById('upload-btn');
    const uploadStatus = document.getElementById('upload-status');
    const uploadContainer = document.querySelector('.upload-container');
    const analyzeBtn = document.getElementById('analyze-btn');

    // Click on button triggers file input
    uploadBtn.addEventListener('click', function() {
        uploadInput.click();
    });

    // File input change handler
    uploadInput.addEventListener('change', handleFileUpload);

    // Drag and drop functionality
    uploadContainer.addEventListener('dragover', function(e) {
        e.preventDefault();
        uploadContainer.classList.add('dragover');
    });

    uploadContainer.addEventListener('dragleave', function(e) {
        e.preventDefault();
        uploadContainer.classList.remove('dragover');
    });

    uploadContainer.addEventListener('drop', function(e) {
        e.preventDefault();
        uploadContainer.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFileSelection(files[0]);
        }
    });

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (file) {
            handleFileSelection(file);
        }
    }

    function handleFileSelection(file) {
        // Validate file type
        const validExtensions = ['.edf', '.csv', '.txt', '.mat', '.dat'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validExtensions.includes(fileExtension)) {
            showUploadStatus('error', 'Invalid file type. Please upload EDF, CSV, TXT, MAT, or DAT files.');
            return;
        }

        // Validate file size (max 50MB)
        const maxSize = 50 * 1024 * 1024; // 50MB in bytes
        if (file.size > maxSize) {
            showUploadStatus('error', 'File too large. Maximum size is 50MB.');
            return;
        }

        // Show upload progress
        showUploadStatus('uploading', `Uploading ${file.name}...`);
        
        // Simulate upload progress
        simulateUploadProgress(file);
    }

    function simulateUploadProgress(file) {
        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 15;
            if (progress >= 100) {
                progress = 100;
                clearInterval(progressInterval);
                
                // Process the file after "upload"
                processUploadedFile(file);
            }
            
            // Update progress bar
            const progressBar = document.querySelector('.progress-bar');
            if (progressBar) {
                progressBar.style.width = progress + '%';
            }
        }, 200);
    }

    function processUploadedFile(file) {
        // Here you would typically process the file
        // For now, we'll simulate processing
        
        setTimeout(() => {
            const fileInfo = {
                name: file.name,
                size: formatFileSize(file.size),
                type: file.type || 'Unknown',
                lastModified: new Date(file.lastModified).toLocaleDateString()
            };

            showUploadStatus('success', `
                <div class="file-info">
                    <strong>File uploaded successfully!</strong><br>
                    <span>Name: ${fileInfo.name}</span><br>
                    <span>Size: ${fileInfo.size}</span><br>
                    <span>Type: ${fileInfo.type}</span>
                </div>
            `);

            // Enable analyze button
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="bi-play-circle me-2"></i>Analyze Uploaded Signal';

            // Update viewer to show uploaded file is ready
            updateViewerForUploadedFile(file.name);

        }, 1000);
    }

    function showUploadStatus(type, message) {
        const statusClass = type === 'error' ? 'text-danger' : 
                           type === 'success' ? 'text-success' : 'text-primary';
        
        if (type === 'uploading') {
            uploadStatus.innerHTML = `
                <div class="${statusClass}">
                    <i class="bi-arrow-clockwise spinner-border spinner-border-sm me-2"></i>
                    ${message}
                    <div class="progress-bar"></div>
                </div>
            `;
        } else {
            uploadStatus.innerHTML = `<div class="${statusClass}">${message}</div>`;
        }
    }

    function formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    function updateViewerForUploadedFile(filename) {
        const canvas = document.getElementById('signal-canvas');
        const currentViewerMode = document.querySelector('.viewer-option.active').getAttribute('data-viewer');
        
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-file-earmark-medical display-4 text-primary mb-3"></i>
                <h5>File Ready for Analysis</h5>
                <p class="text-muted">${filename}</p>
                <small class="text-muted">Click "Analyze" to process the uploaded signal</small>
            </div>
        `;
    }

    // Reset upload when changing viewer modes or channels
    document.querySelectorAll('.viewer-option, .channel-checkbox').forEach(element => {
        element.addEventListener('change', function() {
            // Reset upload status if needed
            uploadStatus.innerHTML = '';
            uploadInput.value = '';
        });
    });
});