document.addEventListener('DOMContentLoaded', function() {
    const signalViewer = document.getElementById('signal-viewer');
    const viewerTitle = document.getElementById('viewer-title');
    const channelList = document.getElementById('channel-list');
    const backButton = document.getElementById('back-to-selection');
    const analyzeBtn = document.getElementById('analyze-btn');
    
    // EEG Channel configuration - International 10-20 system
    const eegChannels = [
        'Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4',
        'P3', 'P4', 'O1', 'O2', 'F7', 'F8',
        'T3', 'T4', 'T5', 'T6', 'Fz', 'Cz', 'Pz'
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
        
        eegChannels.forEach((channel, index) => {
            const channelItem = document.createElement('div');
            channelItem.className = 'form-check';
            channelItem.innerHTML = `
                <input class="form-check-input channel-checkbox" type="checkbox" id="eeg-channel-${index}" checked>
                <label class="form-check-label" for="eeg-channel-${index}">
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
                renderEEGStandardView(canvas, selectedChannels);
                break;
            case 'xor':
                renderEEGXORView(canvas, selectedChannels);
                break;
            case 'polar':
                renderEEGPolarView(canvas, selectedChannels);
                break;
        }
    }

    function renderEEGStandardView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-cpu display-4 text-success mb-3"></i>
                <h5>EEG Standard View</h5>
                <p class="text-muted">Displaying ${channels.length} EEG channels</p>
                <small class="text-muted">International 10-20 system montage</small>
                <div class="mt-3 p-3 bg-light rounded">
                    <small class="text-muted">Channels active: ${channels.join(', ')}</small>
                </div>
            </div>
        `;
    }

    function renderEEGXORView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-layers display-4 text-warning mb-3"></i>
                <h5>EEG XOR Comparison</h5>
                <p class="text-muted">Comparing ${channels.length} channels for asymmetry</p>
                <small class="text-muted">Hemispheric comparison analysis</small>
                <div class="mt-3 p-3 bg-light rounded">
                    <small class="text-muted">Left-right hemisphere comparison active</small>
                </div>
            </div>
        `;
    }

    function renderEEGPolarView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-bullseye display-4 text-info mb-3"></i>
                <h5>EEG Polar View</h5>
                <p class="text-muted">Topographic mapping of ${channels.length} channels</p>
                <small class="text-muted">Spatial frequency distribution</small>
                <div class="mt-3 p-3 bg-light rounded">
                    <small class="text-muted">Alpha, Beta, Theta, Delta bands visualization</small>
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
        const frequencyAnalysis = document.getElementById('frequency-analysis').checked;
        
        // Show processing indicator
        const canvas = document.getElementById('signal-canvas');
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <div class="spinner-border text-success mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <h5>Processing EEG Data...</h5>
                <p class="text-muted">Analyzing ${selectedChannels.length} channels</p>
                <small class="text-muted">
                    Real-time: ${realTime ? 'ON' : 'OFF'} | 
                    AI Detection: ${aiAnalysis ? 'ON' : 'OFF'} |
                    Frequency: ${frequencyAnalysis ? 'ON' : 'OFF'}
                </small>
            </div>
        `;
        
        // Simulate processing delay with EEG-specific message
        setTimeout(() => {
            canvas.innerHTML = `
                <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                    <i class="bi-check-circle display-4 text-success mb-3"></i>
                    <h5>EEG Analysis Complete</h5>
                    <p class="text-muted">Processed ${selectedChannels.length} channels successfully</p>
                    <div class="mt-3 p-3 bg-light rounded">
                        <small class="text-success">
                            <i class="bi-check-lg"></i> No seizure activity detected<br>
                            <i class="bi-check-lg"></i> Normal background rhythm<br>
                            <i class="bi-check-lg"></i> Symmetrical hemispheric activity
                        </small>
                    </div>
                </div>
            `;
        }, 2000);
    });

    // Initialize EEG channels
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
        const validExtensions = ['.edf', '.csv', '.txt', '.mat', '.dat', '.npy'];
        const fileExtension = '.' + file.name.split('.').pop().toLowerCase();
        
        if (!validExtensions.includes(fileExtension)) {
            showUploadStatus('error', 'Invalid file type. Please upload EDF, CSV, TXT, MAT, DAT, or NPY files.');
            return;
        }

        // Validate file size (max 100MB for .npy, 50MB for others)
        const maxSize = fileExtension === '.npy' ? 100 * 1024 * 1024 : 50 * 1024 * 1024;
        if (file.size > maxSize) {
            const maxSizeMB = fileExtension === '.npy' ? 100 : 50;
            showUploadStatus('error', `File too large. Maximum size is ${maxSizeMB}MB.`);
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
                type: file.type || detectFileFormat(file.name),
                lastModified: new Date(file.lastModified).toLocaleDateString(),
                format: detectFileFormat(file.name)
            };

            const processingInfo = getProcessingSuggestions(fileInfo.format);

            showUploadStatus('success', `
                <div class="file-info">
                    <strong>File uploaded successfully!</strong><br>
                    <span>Name: ${fileInfo.name}</span><br>
                    <span>Size: ${fileInfo.size}</span><br>
                    <span>Format: ${fileInfo.format}</span><br>
                    <span class="text-muted">${processingInfo}</span>
                </div>
            `);

            // Enable analyze button
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="bi-play-circle me-2"></i>Analyze Uploaded Signal';

            // Update viewer to show uploaded file is ready
            updateViewerForUploadedFile(file.name, fileInfo.format);

        }, 1000);
    }

    function detectFileFormat(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        const formatMap = {
            'edf': 'European Data Format',
            'csv': 'Comma Separated Values',
            'txt': 'Text File',
            'mat': 'MATLAB File',
            'dat': 'Binary Data File',
            'npy': 'NumPy Array'
        };
        return formatMap[ext] || 'Unknown Format';
    }

    function getProcessingSuggestions(format) {
        const suggestions = {
            'European Data Format': 'Multi-channel EEG/ECG data with header information',
            'Comma Separated Values': 'Tabular data with signal values per column',
            'Text File': 'Raw signal data in text format',
            'MATLAB File': 'Structured data with variables and metadata',
            'Binary Data File': 'Raw binary signal data',
            'NumPy Array': 'N-dimensional array data for machine learning'
        };
        return suggestions[format] || 'Standard signal processing will be applied';
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

    function updateViewerForUploadedFile(filename, format) {
        const canvas = document.getElementById('signal-canvas');
        const currentViewerMode = document.querySelector('.viewer-option.active').getAttribute('data-viewer');
        
        let formatIcon = 'bi-file-earmark-medical';
        if (format === 'NumPy Array') {
            formatIcon = 'bi-cpu'; // ML/array icon for NumPy
        } else if (format === 'European Data Format') {
            formatIcon = 'bi-file-medical'; // Medical format icon
        }
        
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="${formatIcon} display-4 text-primary mb-3"></i>
                <h5>File Ready for Analysis</h5>
                <p class="text-muted">${filename}</p>
                <small class="text-muted">Format: ${format}</small>
                <small class="text-muted mt-2">Click "Analyze" to process the uploaded signal</small>
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