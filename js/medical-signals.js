document.addEventListener('DOMContentLoaded', function() {
    const signalViewer = document.getElementById('signal-viewer');
    const viewerTitle = document.getElementById('viewer-title');
    const channelList = document.getElementById('channel-list');
    const backButton = document.getElementById('back-to-selection');
    const recurrenceOption = document.getElementById('recurrence-option');
    const analyzeBtn = document.getElementById('analyze-btn');
    
    // Channel configurations
    const ecgChannels = [
        'I', 'II', 'III', 'aVR', 'aVL', 'aVF',
        'V1', 'V2', 'V3', 'V4', 'V5', 'V6'
    ];
    
    const eegChannels = [
        'Fp1', 'Fp2', 'F3', 'F4', 'C3', 'C4',
        'P3', 'P4', 'O1', 'O2', 'F7', 'F8',
        'T3', 'T4', 'T5', 'T6', 'Fz', 'Cz', 'Pz'
    ];

    let currentSignalType = 'ecg';
    let currentViewerMode = 'standard';

    // Signal type selection
    document.querySelectorAll('.select-signal-btn').forEach(btn => {
        btn.addEventListener('click', function() {
            const signalType = this.getAttribute('data-type');
            currentSignalType = signalType;
            showSignalViewer(signalType);
        });
    });

    // Back to selection
    backButton.addEventListener('click', function() {
        signalViewer.style.display = 'none';
        document.querySelectorAll('.signal-type-card').forEach(card => {
            card.style.display = 'block';
        });
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

    function showSignalViewer(signalType) {
        // Hide selection cards
        document.querySelectorAll('.signal-type-card').forEach(card => {
            card.style.display = 'none';
        });
        
        // Show viewer
        signalViewer.style.display = 'block';
        
        // Update title
        viewerTitle.textContent = signalType.toUpperCase() + ' Signal Viewer';
        
        // Populate channels
        populateChannels(signalType);
        
        // Handle recurrence option visibility
        if (signalType === 'eeg') {
            recurrenceOption.style.display = 'none';
        } else {
            recurrenceOption.style.display = 'block';
        }
        
        // Reset to standard view
        updateViewerMode('standard');
    }

    function populateChannels(signalType) {
        channelList.innerHTML = '';
        const channels = signalType === 'ecg' ? ecgChannels : eegChannels;
        
        channels.forEach((channel, index) => {
            const channelItem = document.createElement('div');
            channelItem.className = 'form-check';
            channelItem.innerHTML = `
                <input class="form-check-input channel-checkbox" type="checkbox" id="channel-${index}" checked>
                <label class="form-check-label" for="channel-${index}">
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
                renderStandardView(canvas, selectedChannels);
                break;
            case 'xor':
                renderXORView(canvas, selectedChannels);
                break;
            case 'polar':
                renderPolarView(canvas, selectedChannels);
                break;
            case 'recurrence':
                if (currentSignalType === 'ecg') {
                    renderRecurrenceView(canvas, selectedChannels);
                }
                break;
        }
    }

    function renderStandardView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-graph-up display-4 text-primary mb-3"></i>
                <h5>Standard View</h5>
                <p class="text-muted">Displaying ${channels.length} channels</p>
                <small class="text-muted">Real-time signal visualization</small>
            </div>
        `;
    }

    function renderXORView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-layers display-4 text-warning mb-3"></i>
                <h5>XOR Comparison View</h5>
                <p class="text-muted">Comparing ${channels.length} channels for abnormalities</p>
                <small class="text-muted">Exclusive OR analysis active</small>
            </div>
        `;
    }

    function renderPolarView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-bullseye display-4 text-success mb-3"></i>
                <h5>Polar View</h5>
                <p class="text-muted">Radial representation of ${channels.length} channels</p>
                <small class="text-muted">Circular coordinate system visualization</small>
            </div>
        `;
    }

    function renderRecurrenceView(canvas, channels) {
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <i class="bi-diagram-3 display-4 text-danger mb-3"></i>
                <h5>Recurrence Plot</h5>
                <p class="text-muted">ECG recurrence analysis</p>
                <small class="text-muted">Pattern repetition visualization</small>
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
        
        // Show processing indicator
        const canvas = document.getElementById('signal-canvas');
        canvas.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 flex-column">
                <div class="spinner-border text-primary mb-3" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <h5>Processing Signals...</h5>
                <p class="text-muted">Analyzing ${selectedChannels.length} channels</p>
                <small class="text-muted">Real-time: ${realTime ? 'ON' : 'OFF'} | AI: ${aiAnalysis ? 'ON' : 'OFF'}</small>
            </div>
        `;
        
        // Simulate processing delay
        setTimeout(() => {
            updateViewerMode(currentViewerMode);
        }, 1500);
    });

    // Initialize with ECG channels by default
    populateChannels('ecg');
});