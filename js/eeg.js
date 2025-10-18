// EEG Signal Viewer Implementation
document.addEventListener('DOMContentLoaded', function() {
    // Signal viewer state
    const viewerState = {
        isPlaying: false,
        currentTime: 0,
        viewportDuration: 10, // seconds
        signalData: null,
        channels: [],
        activeChannels: [],
        animationId: null,
        speed: 1,
        zoom: 1,
        pan: 0,
        sampleRate: 250, // Default sample rate
        allTrialsData: null,
        currentTrialDisplay: 'all',
        // Performance optimization
        channelMaxAmplitudes: {}, // Cache max amplitudes
        lastRenderTime: 0,
        renderThrottle: 16, // ~60fps
        // XOR mode state
        currentViewMode: 'standard', // 'standard', 'xor', 'polar', 'recurrence'
        xorChannel: null, // Single channel for XOR
        // Polar mode state
        polarMode: 'cumulative', // 'cumulative' or 'latest'
        polarTimeWindow: 5, // seconds
        polarRadiusScale: 0.8,
        // Nyquist down sampling state - ADDED
        downSamplingRate: 128, // Current down sampling rate
        originalSampleRate: 128, // Original sample rate
        downSampledData: null, // Cache for downsampled data
        showDownsampled: true // Whether to show downsampled signal
    };
    
    // DOM elements
    const signalDisplay = document.getElementById('signal-display');
    const signalGrid = document.getElementById('signal-grid');
    const timeDisplay = document.getElementById('time-display');
    const channelList = document.getElementById('channel-list');
    const playBtn = document.getElementById('play-btn');
    const pauseBtn = document.getElementById('pause-btn');
    const resetBtn = document.getElementById('reset-btn');
    const speedControl = document.getElementById('speed-control');
    const speedValue = document.getElementById('speed-value');
    const zoomControl = document.getElementById('zoom-control');
    const zoomValue = document.getElementById('zoom-value');
    const panControl = document.getElementById('pan-control');
    const panValue = document.getElementById('pan-value');
    const uploadBtn = document.getElementById('upload-btn');
    const signalUpload = document.getElementById('signal-upload');
    const uploadStatus = document.getElementById('upload-status');
    const analyzeBtn = document.getElementById('analyzeBtn');
    
    // Initialize the viewer
   function initViewer() {
        const width = signalDisplay.clientWidth;
        const height = signalDisplay.clientHeight;
        
        signalGrid.setAttribute('width', width);
        signalGrid.setAttribute('height', height);
        
        drawGrid(width, height);
        setupDefaultChannels();
        generateSampleData();
        setupEventListeners();
        
        // Add down sampling controls - ADDED
        addDownSamplingControls();
        
        // Ensure initial state is correct
        viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
        console.log('Initial active channels:', viewerState.activeChannels.map(ch => ch.id));
        
        renderSignals();
    }
    
    // Add Nyquist down sampling controls - ADDED FUNCTION
    function addDownSamplingControls() {
        // Remove existing controls if they exist
        const existingControls = document.getElementById('downsampling-controls');
        if (existingControls) {
            existingControls.remove();
        }
        
        const controlsContainer = document.querySelector('.viewer-controls .row');
        if (!controlsContainer) return;
        
        // Create down sampling controls
        const downSamplingRow = document.createElement('div');
        downSamplingRow.className = 'row mt-3';
        downSamplingRow.id = 'downsampling-controls';
        downSamplingRow.innerHTML = `
            <div class="col-md-6">
                <div class="control-group">
                    <label>Down Sampling Rate</label>
                    <div class="slider-control">
                        <input type="range" class="form-range" id="downsampling-control" min="1" max="128" step="1" value="${viewerState.downSamplingRate}">
                        <span class="slider-value" id="downsampling-value">${viewerState.downSamplingRate} Hz</span>
                    </div>
                    <div class="sampling-info small text-muted">
                        <div>Original: ${viewerState.originalSampleRate} Hz | Current: <span id="current-sampling">${viewerState.downSamplingRate} Hz</span></div>
                        <div>Nyquist Limit: <span id="nyquist-limit">${Math.floor(viewerState.downSamplingRate/2)} Hz</span></div>
                        <div id="aliasing-warning" class="nyquist-warning" style="color: #dc3545; display: ${viewerState.downSamplingRate < 64 ? 'block' : 'none'}">⚠️ Potential aliasing below Nyquist limit</div>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="control-group">
                    <label>Display Options</label>
                    <div class="form-check">
                        <input class="form-check-input" type="checkbox" id="show-downsampled-checkbox" ${viewerState.showDownsampled ? 'checked' : ''}>
                        <label class="form-check-label" for="show-downsampled-checkbox">
                            Show Downsampled Signal
                        </label>
                    </div>
                </div>
            </div>
        `;
        
        controlsContainer.appendChild(downSamplingRow);
        
        // Add event listeners for down sampling controls
        document.getElementById('downsampling-control').addEventListener('input', function() {
            viewerState.downSamplingRate = parseInt(this.value);
            document.getElementById('downsampling-value').textContent = this.value + ' Hz';
            document.getElementById('current-sampling').textContent = this.value + ' Hz';
            document.getElementById('nyquist-limit').textContent = Math.floor(this.value/2) + ' Hz';
            
            // Show/hide aliasing warning
            const warning = document.getElementById('aliasing-warning');
            warning.style.display = this.value < 64 ? 'block' : 'none';
            
            // Apply down sampling
            applyDownSampling();
            renderSignals();
        });
        
        document.getElementById('show-downsampled-checkbox').addEventListener('change', function() {
            viewerState.showDownsampled = this.checked;
            renderSignals();
        });
    }
    
    // Apply Nyquist down sampling to the data - ADDED FUNCTION
    function applyDownSampling() {
        if (!viewerState.signalData) return;
        
        viewerState.downSampledData = {};
        
        // Calculate downsampling factor
        const downsamplingFactor = Math.floor(viewerState.originalSampleRate / viewerState.downSamplingRate);
        
        for (const channelId in viewerState.signalData) {
            const originalData = viewerState.signalData[channelId];
            const downsampledData = [];
            
            // Apply downsampling by taking every nth sample
            for (let i = 0; i < originalData.length; i += downsamplingFactor) {
                downsampledData.push(originalData[i]);
            }
            
            viewerState.downSampledData[channelId] = downsampledData;
        }
    }
    
    // Draw grid for the signal display
    function drawGrid(width, height) {
        signalGrid.innerHTML = '';
        
        // Draw horizontal grid lines
        const horizontalSpacing = height / 8;
        for (let i = 0; i <= 8; i++) {
            const y = i * horizontalSpacing;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', 0);
            line.setAttribute('y1', y);
            line.setAttribute('x2', width);
            line.setAttribute('y2', y);
            line.setAttribute('stroke', i === 4 ? '#ccc' : '#eee');
            line.setAttribute('stroke-width', 1);
            signalGrid.appendChild(line);
        }
        
        // Draw vertical grid lines
        const verticalSpacing = width / 10;
        for (let i = 0; i <= 10; i++) {
            const x = i * verticalSpacing;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', x);
            line.setAttribute('y1', 0);
            line.setAttribute('x2', x);
            line.setAttribute('y2', height);
            line.setAttribute('stroke', i === 5 ? '#ccc' : '#eee');
            line.setAttribute('stroke-width', 1);
            signalGrid.appendChild(line);
        }
    }

    // Set up default EEG channels
function setupDefaultChannels() {
    const defaultChannels = [
    { id: 'Fp1', name: 'Fp1', color: '#E63946', active: true },   // Warm Red
    { id: 'Fp2', name: 'Fp2', color: '#06D6A0', active: true },   // Mint Green
    { id: 'F7', name: 'F7', color: '#118AB2', active: false },    // Deep Sky Blue
    { id: 'F3', name: 'F3', color: '#FFD166', active: false },    // Soft Yellow
    { id: 'Fz', name: 'Fz', color: '#8338EC', active: false },    // Violet
    { id: 'F4', name: 'F4', color: '#06BCC1', active: false },    // Cyan Teal
    { id: 'F8', name: 'F8', color: '#F8961E', active: false },    // Orange
    { id: 'T3', name: 'T3', color: '#9B5DE5', active: false },    // Lavender Purple
    { id: 'C3', name: 'C3', color: '#118C4F', active: false },    // Forest Green
    { id: 'Cz', name: 'Cz', color: '#1D3557', active: false },    // Navy Blue
    { id: 'C4', name: 'C4', color: '#B56576', active: false },    // Mauve Rose
    { id: 'T4', name: 'T4', color: '#6A4C93', active: false },    // Grape
    { id: 'T5', name: 'T5', color: '#00A8E8', active: false },    // Bright Cyan
    { id: 'P3', name: 'P3', color: '#EF476F', active: false },    // Coral Pink
    { id: 'Pz', name: 'Pz', color: '#C77DFF', active: false },    // Soft Violet
    { id: 'P4', name: 'P4', color: '#4CAF50', active: false },    // Balanced Green
    { id: 'T6', name: 'T6', color: '#FFD23F', active: false },    // Golden Yellow
    { id: 'O1', name: 'O1', color: '#FF6B6B', active: false },    // Salmon Red
    { id: 'O2', name: 'O2', color: '#3A86FF', active: false }     // Bright Blue
];

    
    viewerState.channels = defaultChannels;
    viewerState.activeChannels = defaultChannels.filter(ch => ch.active);
    
    // Set default XOR channel (first active channel)
    const activeChannels = viewerState.channels.filter(ch => ch.active);
    if (activeChannels.length >= 1) {
        viewerState.xorChannel = activeChannels[0].id;
    }
    
    renderChannelList();
}
    
    // Render the channel list in the control panel
    function renderChannelList() {
        channelList.innerHTML = '';
        
        viewerState.channels.forEach(channel => {
            const channelItem = document.createElement('div');
            channelItem.className = 'channel-item';
            
            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.id = `channel-${channel.id}`;
            checkbox.checked = channel.active;
            checkbox.addEventListener('change', () => toggleChannel(channel.id, checkbox.checked));
            
            const colorBox = document.createElement('div');
            colorBox.className = 'channel-color';
            colorBox.style.backgroundColor = channel.color;
            
            const label = document.createElement('label');
            label.htmlFor = `channel-${channel.id}`;
            label.textContent = channel.name;
            label.style.marginLeft = '8px';
            label.style.cursor = 'pointer';
            
            channelItem.appendChild(checkbox);
            channelItem.appendChild(colorBox);
            channelItem.appendChild(label);
            
            channelList.appendChild(channelItem);
        });
        
        // Add XOR channel selection if in XOR mode
        if (viewerState.currentViewMode === 'xor') {
            addXORChannelSelection();
        }
        
        // Add polar controls if in polar mode
        if (viewerState.currentViewMode === 'polar') {
            addPolarControls();
        }
    }
    
    // Add XOR channel selection interface
function addXORChannelSelection() {
    // Remove any existing XOR selection first to prevent duplicates
    removeXORChannelSelection();
    
    const xorContainer = document.createElement('div');
    xorContainer.id = 'xor-channel-selection';
    xorContainer.className = 'control-group mt-3';
    xorContainer.innerHTML = `
        <h6>Time-Chunk XOR Mode</h6>
        <div class="mb-2">
            <label class="small">Select Channel for XOR:</label>
            <select class="form-select form-select-sm" id="xor-channel">
                <option value="">Select Channel</option>
                ${viewerState.channels.map(ch => 
                    `<option value="${ch.id}" ${ch.id === viewerState.xorChannel ? 'selected' : ''}>${ch.name}</option>`
                ).join('')}
            </select>
        </div>
        <div class="small text-muted">
            <i class="bi-info-circle me-1"></i>
            XOR compares consecutive time chunks. Identical chunks are erased.
        </div>
    `;
    
    const channelListContainer = document.querySelector('.channel-list');
    channelListContainer.parentNode.insertBefore(xorContainer, channelListContainer.nextSibling);
    
    // Add event listener for XOR channel selection
    document.getElementById('xor-channel').addEventListener('change', function() {
        viewerState.xorChannel = this.value;
        renderSignals();
    });
}

    // Remove XOR channel selection
    function removeXORChannelSelection() {
        const xorContainer = document.getElementById('xor-channel-selection');
        if (xorContainer) {
            xorContainer.remove();
        }
    }

    // Add polar mode controls
    function addPolarControls() {
        // Remove any existing polar controls first
        removePolarControls();
        
        const polarControls = document.createElement('div');
        polarControls.id = 'polar-controls';
        polarControls.className = 'control-group mt-3';
        polarControls.innerHTML = `
            <h6>Polar Display Settings</h6>
            <div class="mb-2">
                <label class="small">Display Mode:</label>
                <div class="btn-group w-100" role="group">
                    <input type="radio" class="btn-check" name="polarMode" id="polar-cumulative" value="cumulative" ${viewerState.polarMode === 'cumulative' ? 'checked' : ''}>
                    <label class="btn btn-outline-primary btn-sm" for="polar-cumulative">Cumulative</label>
                    
                    <input type="radio" class="btn-check" name="polarMode" id="polar-latest" value="latest" ${viewerState.polarMode === 'latest' ? 'checked' : ''}>
                    <label class="btn btn-outline-primary btn-sm" for="polar-latest">Latest Only</label>
                </div>
            </div>
            <div class="mb-2">
                <label class="small">Time Window (seconds):</label>
                <input type="range" class="form-range" id="polar-time-window" min="1" max="30" value="${viewerState.polarTimeWindow}" step="1">
                <div class="small text-muted" id="polar-time-value">${viewerState.polarTimeWindow}s</div>
            </div>
            <div class="mb-2">
                <label class="small">Max Radius Scale:</label>
                <input type="range" class="form-range" id="polar-radius-scale" min="0.1" max="2" value="${viewerState.polarRadiusScale}" step="0.1">
                <div class="small text-muted" id="polar-radius-value">${viewerState.polarRadiusScale}x</div>
            </div>
        `;
        
        const channelListContainer = document.querySelector('.channel-list');
        channelListContainer.parentNode.insertBefore(polarControls, channelListContainer.nextSibling);
        
        // Event listeners for polar controls
        document.querySelectorAll('input[name="polarMode"]').forEach(radio => {
            radio.addEventListener('change', function() {
                viewerState.polarMode = this.value;
                renderSignals();
            });
        });
        
        document.getElementById('polar-time-window').addEventListener('input', function() {
            viewerState.polarTimeWindow = parseFloat(this.value);
            document.getElementById('polar-time-value').textContent = this.value + 's';
            renderSignals();
        });
        
        document.getElementById('polar-radius-scale').addEventListener('input', function() {
            viewerState.polarRadiusScale = parseFloat(this.value);
            document.getElementById('polar-radius-value').textContent = this.value + 'x';
            renderSignals();
        });
    }

    // Remove polar controls
    function removePolarControls() {
        const polarControls = document.getElementById('polar-controls');
        if (polarControls) {
            polarControls.remove();
        }
    }
    
    // Add this helper function to debug channel state
function debugChannelState() {
    console.log('=== CHANNEL STATE DEBUG ===');
    console.log('All channels:', viewerState.channels.map(ch => ({id: ch.id, active: ch.active})));
    console.log('Active channels:', viewerState.activeChannels.map(ch => ch.id));
    console.log('Signal data keys:', Object.keys(viewerState.signalData || {}));
    console.log('==========================');
} 

   // Toggle channel visibility - FIXED VERSION WITH VALIDATION
   function toggleChannel(channelId, isActive) {
       const channel = viewerState.channels.find(ch => ch.id === channelId);
       if (channel) {
           // Count currently active channels
           const currentActiveCount = viewerState.channels.filter(ch => ch.active).length;
           
           // Prevent unchecking if this is the last active channel
           if (!isActive && currentActiveCount <= 1) {
               alert('At least one channel must be active. Please select another channel before disabling this one.');
               // Re-check the checkbox
               document.getElementById(`channel-${channelId}`).checked = true;
               return;
           }
           
           channel.active = isActive;
           
           // Update active channels
           viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
           
           console.log(`Toggled channel ${channelId} to ${isActive}`);
           console.log('Active channels:', viewerState.activeChannels.map(ch => ch.id));
           
           // Handle XOR mode specific updates
           if (viewerState.currentViewMode === 'xor') {
               const activeChannels = viewerState.activeChannels;
               if (activeChannels.length >= 1 && !activeChannels.find(ch => ch.id === viewerState.xorChannel)) {
                   viewerState.xorChannel = activeChannels[0].id;
               }
               // Update XOR UI
               removeXORChannelSelection();
               addXORChannelSelection();
           }
           
           // Force immediate re-render
           renderSignals();
       }
   }
    
    // Generate sample EEG data for demonstration
    function generateSampleData() {
        const sampleRate = 128; // Changed to 128 Hz as specified
        const duration = 60;
        const numSamples = sampleRate * duration;
        
        viewerState.signalData = {};
        viewerState.sampleRate = sampleRate;
        viewerState.originalSampleRate = sampleRate; // Set original sample rate
        viewerState.channelMaxAmplitudes = {};
        
        viewerState.channels.forEach(channel => {
            const data = new Float32Array(numSamples);
            let maxAmplitude = 0;
            
            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;
                let baseFreq;
                switch(channel.id) {
                    case 'Fp1': baseFreq = 8; break;
                    case 'Fp2': baseFreq = 12; break;
                    case 'F3': baseFreq = 4; break;
                    case 'F4': baseFreq = 2; break;
                    default: baseFreq = 10;
                }
                
                const value = 0.5 * Math.sin(2 * Math.PI * baseFreq * t) + 
                            0.3 * Math.sin(2 * Math.PI * (baseFreq * 2) * t) +
                            0.1 * Math.random();
                
                data[i] = value;
                maxAmplitude = Math.max(maxAmplitude, Math.abs(value));
            }
            
            viewerState.signalData[channel.id] = data;
            viewerState.channelMaxAmplitudes[channel.id] = maxAmplitude || 1;
        });
        
        // Apply initial down sampling
        applyDownSampling();
        
        renderSignals();
    }
    
    // Parse NPY file
    async function parseNPYFile(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = function(e) {
                try {
                    const arrayBuffer = e.target.result;
                    const dataView = new DataView(arrayBuffer);
                    
                    const magic = new Uint8Array(arrayBuffer, 0, 6);
                    const magicStr = String.fromCharCode(...magic);
                    if (magicStr !== '\x93NUMPY') {
                        throw new Error('Not a valid NPY file');
                    }
                    
                    const majorVersion = dataView.getUint8(6);
                    const minorVersion = dataView.getUint8(7);
                    
                    let headerLength;
                    if (majorVersion === 1) {
                        headerLength = dataView.getUint16(8, true);
                    } else if (majorVersion === 2) {
                        headerLength = dataView.getUint32(8, true);
                    } else {
                        throw new Error(`Unsupported NPY version: ${majorVersion}.${minorVersion}`);
                    }
                    
                    const headerBytes = new Uint8Array(arrayBuffer, 10, headerLength);
                    const header = new TextDecoder().decode(headerBytes);
                    
                    const shapeMatch = header.match(/'shape'\s*:\s*\(([^)]+)\)/);
                    const dtypeMatch = header.match(/'descr'\s*:\s*'([^']+)'/);
                    
                    if (!shapeMatch || !dtypeMatch) {
                        throw new Error('Invalid NPY header format');
                    }
                    
                    const shapeStr = shapeMatch[1].trim();
                    const shape = shapeStr ? shapeStr.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n)) : [];
                    const dtype = dtypeMatch[1];
                    const dataOffset = 10 + headerLength;
                    const totalElements = shape.reduce((a, b) => a * b, 1);
                    
                    let data;
                    if (dtype === '<f4') {
                        data = new Float32Array(arrayBuffer, dataOffset, totalElements);
                    } else if (dtype === '<f8') {
                        data = new Float64Array(arrayBuffer, dataOffset, totalElements);
                    } else if (dtype === '<i4') {
                        data = new Int32Array(arrayBuffer, dataOffset, totalElements);
                    } else if (dtype === '<i2') {
                        data = new Int16Array(arrayBuffer, dataOffset, totalElements);
                    } else {
                        throw new Error(`Unsupported data type: ${dtype}`);
                    }
                    
                    resolve({ data, shape, dtype });
                } catch (error) {
                    reject(error);
                }
            };
            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsArrayBuffer(file);
        });
    }
    
    // Load signal data from uploaded file
    async function loadSignalData(file) {
        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (fileExtension === 'npy') {
            return await parseNPYFile(file);
        } else {
            throw new Error(`File type .${fileExtension} not yet implemented`);
        }
    }
 
  // Process uploaded signal data
function processUploadedData(uploadedData) {
    viewerState.signalData = {};
    viewerState.allTrialsData = null;
    viewerState.channelMaxAmplitudes = {};

    const shape = uploadedData.shape;
    const data = uploadedData.data;

    console.log('Uploaded data shape:', shape);

    if (shape.length === 3) {
        const [numTrials, numChannels, numSamples] = shape;
        console.log(`Processing ${numTrials} trials, ${numChannels} channels, ${numSamples} samples`);
        
        // Limit to maximum 19 channels
        const processedChannels = Math.min(numChannels, 19);
        viewerState.allTrialsData = { 
            numTrials, 
            numChannels: processedChannels, 
            numSamples, 
            data 
        };
        processAllTrials();
    } else if (shape.length === 2) {
        const [numChannels, numSamples] = shape;
        const processedChannels = Math.min(numChannels, 19);
        viewerState.allTrialsData = { 
            numTrials: 1, 
            numChannels: processedChannels, 
            numSamples, 
            data 
        };
        processAllTrials();
    } else if (shape.length === 1) {
        viewerState.allTrialsData = { 
            numTrials: 1, 
            numChannels: 1, 
            numSamples: shape[0], 
            data 
        };
        processAllTrials();
    } else {
        throw new Error(`Unsupported data shape: [${shape.join(', ')}]`);
    }

    // Reset the viewer state after processing
    resetViewerState();
    renderChannelList();
}
  
// Process all trials for simultaneous display
function processAllTrials() {
    if (!viewerState.allTrialsData) return;
    
    const { numTrials, numChannels, numSamples, data } = viewerState.allTrialsData;
    viewerState.signalData = {};
    
    // Only process up to 19 channels maximum (standard EEG montage)
    const maxChannels = Math.min(numChannels, 19);
    
    console.log(`Processing ${maxChannels} channels out of ${numChannels} available`);
    
    for (let channelIdx = 0; channelIdx < maxChannels; channelIdx++) {
        const combinedData = new Float32Array(numTrials * numSamples);
        let maxAmplitude = 0;
        
        for (let trialIdx = 0; trialIdx < numTrials; trialIdx++) {
            const trialOffset = trialIdx * numChannels * numSamples + channelIdx * numSamples;
            const combinedOffset = trialIdx * numSamples;
            
            const trialData = data.subarray(trialOffset, trialOffset + numSamples);
            combinedData.set(trialData, combinedOffset);
            
            for (let i = 0; i < numSamples; i++) {
                const absValue = Math.abs(trialData[i]);
                if (absValue > maxAmplitude) maxAmplitude = absValue;
            }
        }
        
        // Use the predefined channel names from our 19 EEG channels
        const channelName = viewerState.channels[channelIdx]?.name || `Channel ${channelIdx + 1}`;
        const channelColor = viewerState.channels[channelIdx]?.color || getColorForIndex(channelIdx);
        
        viewerState.signalData[channelName] = combinedData;
        viewerState.channelMaxAmplitudes[channelName] = maxAmplitude || 1;
        
        // Only update existing channels, don't create new ones
        if (viewerState.channels[channelIdx]) {
            viewerState.channels[channelIdx].active = channelIdx < 2; // Auto-activate first 2 channels
        }
    }
    
    // Reset channels to only show the standard 19
    viewerState.channels = viewerState.channels.slice(0, 19);
    viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
    
    // Apply down sampling to uploaded data
    applyDownSampling();
    
    addTrialInfo(numTrials, numSamples);
}
    
    // Add trial information display
    function addTrialInfo(numTrials, numSamplesPerTrial) {
        const existingInfo = document.getElementById('trial-info');
        if (existingInfo) existingInfo.remove();
        
        const trialInfo = document.createElement('div');
        trialInfo.id = 'trial-info';
        trialInfo.className = 'control-group';
        trialInfo.innerHTML = `
            <label>Trial Information</label>
            <div class="small text-muted">
                <div>Total Trials: ${numTrials}</div>
                <div>Samples per Trial: ${numSamplesPerTrial}</div>
                <div>Total Duration: ${(numTrials * numSamplesPerTrial / viewerState.sampleRate).toFixed(1)}s</div>
                <div>Displaying: All trials combined</div>
            </div>
        `;
        
        const uploadContainer = document.querySelector('.upload-container');
        uploadContainer.parentNode.insertBefore(trialInfo, uploadContainer.nextSibling);
    }
    
    // Helper function to get colors for channels
    function getColorForIndex(index) {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F1948A', '#82E0AA', '#F8C471', '#85C1E9', '#D7BDE2',
            '#F9E79F', '#A9DFBF', '#F5B7B1', '#AED6F1'
        ];
        return colors[index % colors.length];
    }
 
// XOR comparison for single channel with time-chunk XOR - SHOW DIFFERENCES
function renderXORComparison(width, height, channelHeight, viewportStart, viewportEnd, sampleRate, fragment) {
    if (!viewerState.xorChannel) {
        // Show selection prompt
        const promptMsg = document.createElement('div');
        promptMsg.className = 'd-flex justify-content-center align-items-center h-100 text-info';
        promptMsg.innerHTML = `
            <div class="text-center">
                <i class="bi-arrow-left-right display-4 mb-3"></i>
                <p>Select a channel for XOR comparison</p>
                <small>Choose a channel from the dropdown above</small>
            </div>
        `;
        fragment.appendChild(promptMsg);
        return;
    }
    
    const channelData = viewerState.signalData[viewerState.xorChannel];
    
    if (!channelData) {
        console.error(`No data found for XOR channel: ${viewerState.xorChannel}`);
        return;
    }
    
    const yOffset = channelHeight / 2;
    const viewportDuration = viewportEnd - viewportStart;
    
    // Calculate XOR using time chunks equal to viewport duration
    const chunkDuration = viewportDuration;
    const samplesPerChunk = Math.floor(chunkDuration * sampleRate);
    const totalSamples = channelData.length;
    const numChunks = Math.floor(totalSamples / samplesPerChunk);
    
    if (numChunks < 2) {
        // Not enough data for XOR comparison
        const noDataMsg = document.createElement('div');
        noDataMsg.className = 'd-flex justify-content-center align-items-center h-100 text-warning';
        noDataMsg.innerHTML = `
            <div class="text-center">
                <i class="bi-exclamation-triangle display-4 mb-3"></i>
                <p>Not enough data for XOR comparison</p>
                <small>Need at least 2 time chunks of data</small>
            </div>
        `;
        fragment.appendChild(noDataMsg);
        return;
    }
    
    // Create XOR result by overlaying consecutive chunks and showing differences
    const xorResults = [];
    let maxDifference = 0;
    
    for (let chunkIdx = 1; chunkIdx < numChunks; chunkIdx++) {
        const prevChunkStart = (chunkIdx - 1) * samplesPerChunk;
        const currentChunkStart = chunkIdx * samplesPerChunk;
        
        const chunkDifferences = new Float32Array(samplesPerChunk);
        
        for (let i = 0; i < samplesPerChunk; i++) {
            const prevSample = channelData[prevChunkStart + i];
            const currentSample = channelData[currentChunkStart + i];
            
            // Calculate the actual difference between chunks
            const difference = Math.abs(currentSample - prevSample);
            
            chunkDifferences[i] = difference;
            maxDifference = Math.max(maxDifference, difference);
        }
        
        xorResults.push({
            differences: chunkDifferences,
            prevData: channelData.subarray(prevChunkStart, prevChunkStart + samplesPerChunk),
            currentData: channelData.subarray(currentChunkStart, currentChunkStart + samplesPerChunk),
            startTime: currentChunkStart / sampleRate,
            chunkIndex: chunkIdx
        });
    }
    
    const maxAmplitude = maxDifference || 1;
    const channel = viewerState.channels.find(ch => ch.id === viewerState.xorChannel);
    
    // Render each XOR chunk with visual differences
    xorResults.forEach((chunk, chunkIndex) => {
        const chunkStartTime = chunk.startTime;
        const chunkEndTime = chunkStartTime + chunkDuration;
        
        // Only render chunks that are visible in current viewport
        if (chunkEndTime < viewportStart || chunkStartTime > viewportEnd) {
            return;
        }
        
        // Calculate position in viewport
        const viewportRelativeStart = Math.max(0, chunkStartTime - viewportStart);
        const viewportRelativeEnd = Math.min(viewportDuration, chunkEndTime - viewportStart);
        
        const startX = (viewportRelativeStart / viewportDuration) * width;
        const endX = (viewportRelativeEnd / viewportDuration) * width;
        const chunkWidth = endX - startX;
        
        if (chunkWidth <= 0) return;
        
        const samplesPerPixel = Math.max(1, samplesPerChunk / chunkWidth);
        
        // Render previous chunk as shadow/faded version
        const prevPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        prevPath.classList.add('signal-line', 'xor-prev-chunk');
        prevPath.setAttribute('stroke', channel?.color || '#666');
        prevPath.setAttribute('stroke-width', '1.5');
        prevPath.setAttribute('opacity', '0.3');
        prevPath.setAttribute('stroke-dasharray', '3,2');

        let prevPathData = '';
        let firstPrevPoint = true;
        
        for (let i = 0; i < chunkWidth; i += 1) {
            const sampleIndex = Math.floor(i * samplesPerPixel);
            if (sampleIndex >= 0 && sampleIndex < chunk.prevData.length) {
                const x = startX + i;
                const normalizedValue = chunk.prevData[sampleIndex] / (viewerState.channelMaxAmplitudes[viewerState.xorChannel] || 1);
                const y = yOffset - (normalizedValue * channelHeight * 0.4);
                
                if (firstPrevPoint) {
                    prevPathData += `M ${x} ${y}`;
                    firstPrevPoint = false;
                } else {
                    prevPathData += ` L ${x} ${y}`;
                }
            }
        }
        
        if (prevPathData) {
            prevPath.setAttribute('d', prevPathData);
            fragment.appendChild(prevPath);
        }
        
        // Render current chunk as solid line
        const currentPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        currentPath.classList.add('signal-line', 'xor-current-chunk');
        currentPath.setAttribute('stroke', channel?.color || '#0000FF');
        currentPath.setAttribute('stroke-width', '2');
        currentPath.setAttribute('opacity', '0.7');

        let currentPathData = '';
        let firstCurrentPoint = true;
        
        for (let i = 0; i < chunkWidth; i += 1) {
            const sampleIndex = Math.floor(i * samplesPerPixel);
            if (sampleIndex >= 0 && sampleIndex < chunk.currentData.length) {
                const x = startX + i;
                const normalizedValue = chunk.currentData[sampleIndex] / (viewerState.channelMaxAmplitudes[viewerState.xorChannel] || 1);
                const y = yOffset - (normalizedValue * channelHeight * 0.4);
                
                if (firstCurrentPoint) {
                    currentPathData += `M ${x} ${y}`;
                    firstCurrentPoint = false;
                } else {
                    currentPathData += ` L ${x} ${y}`;
                }
            }
        }
        
        if (currentPathData) {
            currentPath.setAttribute('d', currentPathData);
            fragment.appendChild(currentPath);
        }
        
        // Render differences as highlighted areas
        const diffPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        diffPath.classList.add('signal-line', 'xor-difference');
        diffPath.setAttribute('stroke', '#FF0000');
        diffPath.setAttribute('stroke-width', '3');
        diffPath.setAttribute('opacity', '0.8');

        let diffPathData = '';
        let firstDiffPoint = true;
        
        for (let i = 0; i < chunkWidth; i += 1) {
            const sampleIndex = Math.floor(i * samplesPerPixel);
            if (sampleIndex >= 0 && sampleIndex < chunk.differences.length) {
                const difference = chunk.differences[sampleIndex];
                
                // Only show points where there are significant differences
                if (difference > 0.02) {
                    const x = startX + i;
                    const normalizedValue = chunk.currentData[sampleIndex] / (viewerState.channelMaxAmplitudes[viewerState.xorChannel] || 1);
                    const y = yOffset - (normalizedValue * channelHeight * 0.4);
                    
                    if (firstDiffPoint) {
                        diffPathData += `M ${x} ${y}`;
                        firstDiffPoint = false;
                    } else {
                        diffPathData += ` L ${x} ${y}`;
                    }
                }
            }
        }
        
        if (diffPathData) {
            diffPath.setAttribute('d', diffPathData);
            fragment.appendChild(diffPath);
        }
        
        // Add vertical difference bars at significant change points
        for (let i = 0; i < chunkWidth; i += 5) { // Sample every 5 pixels for performance
            const sampleIndex = Math.floor(i * samplesPerPixel);
            if (sampleIndex >= 0 && sampleIndex < chunk.differences.length) {
                const difference = chunk.differences[sampleIndex];
                
                if (difference > 0.05) { // Significant difference threshold
                    const x = startX + i;
                    const prevValue = chunk.prevData[sampleIndex] / (viewerState.channelMaxAmplitudes[viewerState.xorChannel] || 1);
                    const currentValue = chunk.currentData[sampleIndex] / (viewerState.channelMaxAmplitudes[viewerState.xorChannel] || 1);
                    
                    const yPrev = yOffset - (prevValue * channelHeight * 0.4);
                    const yCurrent = yOffset - (currentValue * channelHeight * 0.4);
                    
                    // Draw a vertical line showing the difference
                    const diffLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    diffLine.classList.add('xor-diff-line');
                    diffLine.setAttribute('x1', x);
                    diffLine.setAttribute('y1', yPrev);
                    diffLine.setAttribute('x2', x);
                    diffLine.setAttribute('y2', yCurrent);
                    diffLine.setAttribute('stroke', '#FF6B00');
                    diffLine.setAttribute('stroke-width', '2');
                    diffLine.setAttribute('opacity', '0.7');
                    fragment.appendChild(diffLine);
                    
                    // Add a dot at the current value
                    const diffDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    diffDot.classList.add('xor-diff-dot');
                    diffDot.setAttribute('cx', x);
                    diffDot.setAttribute('cy', yCurrent);
                    diffDot.setAttribute('r', '3');
                    diffDot.setAttribute('fill', '#FF0000');
                    diffDot.setAttribute('opacity', '0.9');
                    fragment.appendChild(diffDot);
                }
            }
        }
        
        // Add chunk label
        if (chunkIndex < 3 && chunkWidth > 50) {
            const label = document.createElement('div');
            label.className = 'signal-label xor-label';
            label.innerHTML = `Chunk ${chunkIndex + 1}<br><small>vs ${chunkIndex}</small>`;
            label.style.position = 'absolute';
            label.style.top = `${yOffset - 35}px`;
            label.style.left = `${startX + 10}px`;
            label.style.background = 'rgba(0, 0, 0, 0.8)';
            label.style.color = 'white';
            label.style.fontSize = '9px';
            label.style.padding = '3px 6px';
            label.style.borderRadius = '3px';
            label.style.border = '1px solid #666';
            label.style.textAlign = 'center';
            fragment.appendChild(label);
        }
    });
    
    // Add XOR info label
    const infoLabel = document.createElement('div');
    infoLabel.className = 'signal-label';
    infoLabel.innerHTML = `
        <strong>XOR: ${viewerState.xorChannel}</strong><br>
        <small>• Dashed: Previous chunk</small><br>
        <small>• Solid: Current chunk</small><br>
        <small>• Red: Significant differences</small>
    `;
    infoLabel.style.top = `${yOffset - 20}px`;
    infoLabel.style.left = '10px';
    infoLabel.style.background = 'rgba(0, 0, 0, 0.9)';
    infoLabel.style.color = 'white';
    infoLabel.style.fontWeight = 'normal';
    infoLabel.style.border = '1px solid #666';
    infoLabel.style.zIndex = '10';
    infoLabel.style.padding = '8px';
    infoLabel.style.fontSize = '11px';
    infoLabel.style.lineHeight = '1.3';
    fragment.appendChild(infoLabel);
    
    // Add legend for visual elements
    const legend = document.createElement('div');
    legend.className = 'signal-label';
    legend.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 2px;">
            <div style="width: 12px; height: 2px; background: ${channel?.color || '#666'}; opacity: 0.3; margin-right: 5px;"></div>
            <small>Previous chunk</small>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 2px;">
            <div style="width: 12px; height: 2px; background: ${channel?.color || '#0000FF'}; margin-right: 5px;"></div>
            <small>Current chunk</small>
        </div>
        <div style="display: flex; align-items: center; margin-bottom: 2px;">
            <div style="width: 12px; height: 2px; background: #FF0000; margin-right: 5px;"></div>
            <small>Difference points</small>
        </div>
        <div style="display: flex; align-items: center;">
            <div style="width: 12px; height: 2px; background: #FF6B00; margin-right: 5px;"></div>
            <small>Change magnitude</small>
        </div>
    `;
    legend.style.top = `${yOffset + 30}px`;
    legend.style.left = '10px';
    legend.style.background = 'rgba(255, 255, 255, 0.9)';
    legend.style.color = '#000';
    legend.style.border = '1px solid #ccc';
    legend.style.padding = '6px';
    legend.style.fontSize = '9px';
    fragment.appendChild(legend);
}

// Update the polar graph rendering function (keep existing polar functions)
function renderPolarGraph(width, height, fragment) {
    // ... (keep existing polar graph code unchanged)
    if (!viewerState.signalData || Object.keys(viewerState.signalData).length === 0) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(centerX, centerY) * 0.8 * (viewerState.polarRadiusScale || 0.8);
    const timeWindow = viewerState.polarTimeWindow || 5; // seconds
    
    // Draw polar grid
    drawPolarGrid(centerX, centerY, maxRadius, fragment);
    
    // Get current time window
    const currentTime = viewerState.currentTime || 0;
    const sampleRate = viewerState.sampleRate;
    const totalSamples = Object.values(viewerState.signalData)[0].length;
    const totalDuration = totalSamples / sampleRate;
    
    let startSample, endSample;
    
    if (viewerState.polarMode === 'latest') {
        endSample = Math.min(totalSamples - 1, Math.floor(currentTime * sampleRate));
        startSample = Math.max(0, endSample - Math.floor(timeWindow * sampleRate));
        
        if (endSample - startSample < timeWindow * sampleRate) {
            startSample = Math.max(0, endSample - Math.floor(timeWindow * sampleRate));
        }
    } else {
        startSample = 0;
        endSample = Math.min(totalSamples - 1, Math.floor(currentTime * sampleRate));
    }
    
    if (startSample >= endSample) {
        const noDataMsg = document.createElement('div');
        noDataMsg.className = 'd-flex justify-content-center align-items-center h-100 text-info';
        noDataMsg.innerHTML = `
            <div class="text-center">
                <i class="bi-play-circle display-4 mb-3"></i>
                <p>Play the signal to see polar visualization</p>
                <small>Data will appear as the signal plays</small>
            </div>
        `;
        fragment.appendChild(noDataMsg);
        return;
    }
    
    // Render each active channel with their colors
    viewerState.activeChannels.forEach((channel, channelIndex) => {
        const channelData = viewerState.signalData[channel.id];
        if (!channelData) return;
        
        const maxAmplitude = viewerState.channelMaxAmplitudes[channel.id] || 1;
        const numSamples = endSample - startSample + 1;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('signal-line', 'polar-element');
        path.setAttribute('stroke', channel.color);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.8');
        
        let pathData = '';
        let firstPoint = true;
        
        const sampleStep = Math.max(1, Math.floor(numSamples / 500));
        
        for (let i = startSample; i <= endSample; i += sampleStep) {
            const amplitude = channelData[i];
            const normalizedAmplitude = Math.abs(amplitude) / maxAmplitude;
            const radius = normalizedAmplitude * maxRadius;
            
            let progress, angle;
            
            if (viewerState.polarMode === 'latest') {
                progress = (i - startSample) / (endSample - startSample);
                angle = 2 * Math.PI * (1 - progress);
            } else {
                progress = i / totalSamples;
                angle = 2 * Math.PI * progress;
            }
            
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            if (firstPoint) {
                pathData += `M ${x} ${y}`;
                firstPoint = false;
            } else {
                pathData += ` L ${x} ${y}`;
            }
        }
        
        if (pathData && viewerState.polarMode === 'cumulative') {
            const firstAmplitude = channelData[startSample];
            const firstNormalized = Math.abs(firstAmplitude) / maxAmplitude;
            const firstRadius = firstNormalized * maxRadius;
            const firstX = centerX + firstRadius * Math.cos(0);
            const firstY = centerY + firstRadius * Math.sin(0);
            pathData += ` L ${firstX} ${firstY}`;
        }
        
        path.setAttribute('d', pathData);
        fragment.appendChild(path);
        
        // Add current position indicator for latest mode
        if (viewerState.polarMode === 'latest' && channelData[endSample] !== undefined) {
            const currentAmplitude = channelData[endSample];
            const currentNormalized = Math.abs(currentAmplitude) / maxAmplitude;
            const currentRadius = currentNormalized * maxRadius;
            const currentX = centerX + currentRadius * Math.cos(0);
            const currentY = centerY + currentRadius * Math.sin(0);
            
            const marker = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
            marker.classList.add('polar-element');
            marker.setAttribute('cx', currentX);
            marker.setAttribute('cy', currentY);
            marker.setAttribute('r', '4');
            marker.setAttribute('fill', channel.color);
            marker.setAttribute('stroke', '#000');
            marker.setAttribute('stroke-width', '1');
            fragment.appendChild(marker);
        }
        
        // Add channel label on the polar plot
        const labelAngle = (2 * Math.PI * channelIndex) / viewerState.activeChannels.length;
        const labelRadius = maxRadius * 1.15;
        const labelX = centerX + labelRadius * Math.cos(labelAngle);
        const labelY = centerY + labelRadius * Math.sin(labelAngle);
        
        const label = document.createElement('div');
        label.className = 'signal-label polar-element';
        label.textContent = channel.name;
        label.style.position = 'absolute';
        label.style.left = `${labelX}px`;
        label.style.top = `${labelY}px`;
        label.style.background = channel.color;
        label.style.color = '#000';
        label.style.padding = '2px 6px';
        label.style.borderRadius = '3px';
        label.style.fontSize = '11px';
        label.style.fontWeight = 'bold';
        label.style.transform = 'translate(-50%, -50%)';
        label.style.border = '1px solid rgba(0,0,0,0.3)';
        fragment.appendChild(label);
    });
    
    addPolarTimeMarkers(centerX, centerY, maxRadius, timeWindow, currentTime, totalDuration, fragment);
}

// Draw polar coordinate grid
function drawPolarGrid(centerX, centerY, maxRadius, fragment) {
    const numRings = 5;
    for (let i = 1; i <= numRings; i++) {
        const radius = (maxRadius * i) / numRings;
        const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        circle.classList.add('polar-element');
        circle.setAttribute('cx', centerX);
        circle.setAttribute('cy', centerY);
        circle.setAttribute('r', radius);
        circle.setAttribute('stroke', '#e0e0e0');
        circle.setAttribute('stroke-width', '1');
        circle.setAttribute('fill', 'none');
        circle.setAttribute('stroke-dasharray', i === numRings ? 'none' : '2,2');
        fragment.appendChild(circle);
        
        const label = document.createElement('div');
        label.className = 'polar-element';
        label.textContent = (i / numRings).toFixed(1);
        label.style.position = 'absolute';
        label.style.left = `${centerX + radius + 5}px`;
        label.style.top = `${centerY}px`;
        label.style.color = '#666';
        label.style.fontSize = '10px';
        fragment.appendChild(label);
    }
    
    const numRadials = 12;
    for (let i = 0; i < numRadials; i++) {
        const angle = (2 * Math.PI * i) / numRadials;
        const x = centerX + maxRadius * Math.cos(angle);
        const y = centerY + maxRadius * Math.sin(angle);
        
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.classList.add('polar-element');
        line.setAttribute('x1', centerX);
        line.setAttribute('y1', centerY);
        line.setAttribute('x2', x);
        line.setAttribute('y2', y);
        line.setAttribute('stroke', '#e0e0e0');
        line.setAttribute('stroke-width', '1');
        fragment.appendChild(line);
    }
}

// Update the time markers function to show current time
function addPolarTimeMarkers(centerX, centerY, maxRadius, timeWindow, currentTime, totalDuration, fragment) {
    const numMarkers = 8;
    const markerRadius = maxRadius * 1.15;
    
    for (let i = 0; i < numMarkers; i++) {
        const angle = (2 * Math.PI * i) / numMarkers;
        let timeValue;
        
        if (viewerState.polarMode === 'latest') {
            timeValue = (timeWindow * i) / numMarkers;
        } else {
            timeValue = (totalDuration * i) / numMarkers;
        }
        
        const x = centerX + markerRadius * Math.cos(angle);
        const y = centerY + markerRadius * Math.sin(angle);
        
        const label = document.createElement('div');
        label.className = 'polar-element';
        label.textContent = `${timeValue.toFixed(1)}s`;
        label.style.position = 'absolute';
        label.style.left = `${x}px`;
        label.style.top = `${y}px`;
        label.style.color = '#666';
        label.style.fontSize = '9px';
        label.style.transform = 'translate(-50%, -50%)';
        label.style.background = 'rgba(255,255,255,0.8)';
        label.style.padding = '1px 3px';
        label.style.borderRadius = '2px';
        fragment.appendChild(label);
    }
    
    const centerLabel = document.createElement('div');
    centerLabel.className = 'polar-element';
    
    if (viewerState.polarMode === 'latest') {
        centerLabel.innerHTML = `
            <div style="text-align: center; line-height: 1.2;">
                <strong>Latest ${timeWindow}s</strong><br>
                Time: ${currentTime.toFixed(1)}s<br>
                <small>${viewerState.activeChannels.length} channels</small>
            </div>
        `;
    } else {
        centerLabel.innerHTML = `
            <div style="text-align: center; line-height: 1.2;">
                <strong>Cumulative</strong><br>
                Current: ${currentTime.toFixed(1)}s<br>
                Total: ${totalDuration.toFixed(1)}s<br>
                <small>${viewerState.activeChannels.length} channels</small>
            </div>
        `;
    }
    
    centerLabel.style.position = 'absolute';
    centerLabel.style.left = `${centerX}px`;
    centerLabel.style.top = `${centerY}px`;
    centerLabel.style.color = '#333';
    centerLabel.style.fontSize = '10px';
    centerLabel.style.textAlign = 'center';
    centerLabel.style.transform = 'translate(-50%, -50%)';
    centerLabel.style.background = 'rgba(255, 255, 255, 0.9)';
    centerLabel.style.padding = '6px';
    centerLabel.style.borderRadius = '6px';
    centerLabel.style.border = '1px solid #ccc';
    fragment.appendChild(centerLabel);
    
    if (viewerState.polarMode === 'latest') {
        const directionText = document.createElement('div');
        directionText.className = 'polar-element';
        directionText.innerHTML = '🕒 Time progresses clockwise →';
        directionText.style.position = 'absolute';
        directionText.style.left = `${centerX}px`;
        directionText.style.top = `${centerY + maxRadius * 1.3}px`;
        directionText.style.color = '#666';
        directionText.style.fontSize = '10px';
        directionText.style.transform = 'translate(-50%, -50%)';
        directionText.style.background = 'rgba(255,255,255,0.8)';
        directionText.style.padding = '2px 6px';
        directionText.style.borderRadius = '3px';
        fragment.appendChild(directionText);
    }
}

    // Optimized signal rendering with throttling - FIXED VERSION with down sampling
function renderSignals() {
    console.log("Active channels:", viewerState.activeChannels.map(ch => ch.id));
    console.log("Signal data keys:", Object.keys(viewerState.signalData || {}));
    
    const now = Date.now();
    if (now - viewerState.lastRenderTime < viewerState.renderThrottle) {
        return;
    }
    viewerState.lastRenderTime = now;
    
    // Clear existing signals efficiently
    const existingSignals = signalDisplay.querySelectorAll('.signal-line, .signal-label, .trial-line, .trial-label, .polar-element');
    existingSignals.forEach(el => el.remove());
    
    // Clear any placeholder messages
    const placeholders = signalDisplay.querySelectorAll('div:not(.control-group):not(#signal-grid)');
    placeholders.forEach(el => {
        if (el.parentElement === signalDisplay) {
            el.remove();
        }
    });
    
    // If no signal data or no active channels, show appropriate message
    if (!viewerState.signalData || Object.keys(viewerState.signalData).length === 0) {
        signalDisplay.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 text-muted">
                <div class="text-center">
                    <i class="bi-upload display-4 mb-3"></i>
                    <p>No signal data loaded</p>
                    <small>Upload a signal file to begin visualization</small>
                </div>
            </div>
        `;
        return;
    }
    
    if (viewerState.activeChannels.length === 0) {
        signalDisplay.innerHTML = `
            <div class="d-flex justify-content-center align-items-center h-100 text-info">
                <div class="text-center">
                    <i class="bi-eye-slash display-4 mb-3"></i>
                    <p>No channels selected</p>
                    <small>Check channels in the control panel to view signals</small>
                </div>
            </div>
        `;
        return;
    }
    
    const width = signalDisplay.clientWidth;
    const height = signalDisplay.clientHeight;
    
    const sampleRate = viewerState.sampleRate;
    const firstChannelData = viewerState.signalData[viewerState.activeChannels[0]?.id];
    if (!firstChannelData) {
        console.error("No data for first active channel");
        return;
    }
    
    const totalDuration = firstChannelData.length / sampleRate;
    const viewportStart = (viewerState.pan / 100) * Math.max(0, totalDuration - viewerState.viewportDuration / viewerState.zoom);
    const viewportEnd = viewportStart + (viewerState.viewportDuration / viewerState.zoom);
    
    // Update time display
    if (viewerState.allTrialsData) {
        const samplesPerTrial = viewerState.allTrialsData.numSamples;
        const currentTrial = Math.floor(viewportStart * sampleRate / samplesPerTrial) + 1;
        const totalTrials = viewerState.allTrialsData.numTrials;
        timeDisplay.textContent = `Time: ${viewportStart.toFixed(1)}s (Trial ${currentTrial}/${totalTrials}) - ${viewportEnd.toFixed(1)}s`;
    } else {
        timeDisplay.textContent = `Time: ${viewportStart.toFixed(1)}s - ${viewportEnd.toFixed(1)}s`;
    }
    
    // Batch DOM operations
    const fragment = document.createDocumentFragment();
    
    if (viewerState.currentViewMode === 'xor') {
        const channelHeight = height;
        // XOR comparison mode - show single XOR result
        renderXORComparison(width, height, channelHeight, viewportStart, viewportEnd, sampleRate, fragment);
    } else if (viewerState.currentViewMode === 'polar') {
        // Polar view mode
        renderPolarGraph(width, height, fragment);
    } else {
        // Standard view - show all active channels with downsampled signals below
        const channelHeight = height / (viewerState.activeChannels.length * (viewerState.showDownsampled ? 2 : 1));
        viewerState.activeChannels.forEach((channel, index) => {
            const channelData = viewerState.signalData[channel.id];
            if (!channelData) {
                console.warn(`No data found for channel: ${channel.id}`);
                return;
            }
            
            // Calculate y offsets for original and downsampled signals
            const displayIndex = viewerState.showDownsampled ? index * 2 : index;
            const originalYOffset = displayIndex * channelHeight + channelHeight / 2;
            
            const maxAmplitude = viewerState.channelMaxAmplitudes[channel.id] || 1;
            const samplesPerPixel = (sampleRate * (viewportEnd - viewportStart)) / width;
            
            // Render original signal
            const originalPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            originalPath.classList.add('signal-line');
            originalPath.setAttribute('stroke', channel.color);
            originalPath.setAttribute('stroke-width', '1.5');
            
            let originalPathData = '';
            let firstPoint = true;
            let lastX = -1;
            
            for (let i = 0; i < width; i += 1) {
                const sampleIndex = Math.floor(viewportStart * sampleRate + i * samplesPerPixel);
                if (sampleIndex >= 0 && sampleIndex < channelData.length) {
                    const x = i;
                    const normalizedValue = channelData[sampleIndex] / maxAmplitude;
                    const y = originalYOffset - (normalizedValue * channelHeight * 0.4);
                    
                    if (firstPoint) {
                        originalPathData += `M ${x} ${y}`;
                        firstPoint = false;
                    } else if (Math.abs(x - lastX) > 0.5) {
                        originalPathData += ` L ${x} ${y}`;
                        lastX = x;
                    }
                }
            }
            
            originalPath.setAttribute('d', originalPathData);
            fragment.appendChild(originalPath);
            
            // Add original channel label
            const originalLabel = document.createElement('div');
            originalLabel.className = 'signal-label';
            originalLabel.textContent = `${channel.name} (Original)`;
            originalLabel.style.top = `${originalYOffset - 15}px`;
            originalLabel.style.left = '10px';
            originalLabel.style.background = channel.color;
            originalLabel.style.color = '#000';
            originalLabel.style.padding = '2px 6px';
            originalLabel.style.borderRadius = '3px';
            originalLabel.style.fontSize = '11px';
            originalLabel.style.fontWeight = 'bold';
            fragment.appendChild(originalLabel);
            
            // Render downsampled signal if enabled
            if (viewerState.showDownsampled && viewerState.downSampledData && viewerState.downSampledData[channel.id]) {
                const downsampledData = viewerState.downSampledData[channel.id];
                const downsampledYOffset = (displayIndex + 1) * channelHeight + channelHeight / 2;
                const downsampledSamplesPerPixel = (viewerState.downSamplingRate * (viewportEnd - viewportStart)) / width;
                
                const downsampledPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
               downsampledPath.classList.add('signal-line');
               downsampledPath.setAttribute('stroke', '#000000'); // Example: blue tone
               downsampledPath.setAttribute('stroke-width', '1.5');
               downsampledPath.removeAttribute('stroke-dasharray'); // Remove dashed effect

                
                let downsampledPathData = '';
                let firstDownsampledPoint = true;
                let lastDownsampledX = -1;
                
                for (let i = 0; i < width; i += 1) {
                    const sampleIndex = Math.floor(viewportStart * viewerState.downSamplingRate + i * downsampledSamplesPerPixel);
                    if (sampleIndex >= 0 && sampleIndex < downsampledData.length) {
                        const x = i;
                        const normalizedValue = downsampledData[sampleIndex] / maxAmplitude;
                        const y = downsampledYOffset - (normalizedValue * channelHeight * 0.4);
                        
                        if (firstDownsampledPoint) {
                            downsampledPathData += `M ${x} ${y}`;
                            firstDownsampledPoint = false;
                        } else if (Math.abs(x - lastDownsampledX) > 0.5) {
                            downsampledPathData += ` L ${x} ${y}`;
                            lastDownsampledX = x;
                        }
                    }
                }
                
                downsampledPath.setAttribute('d', downsampledPathData);
                fragment.appendChild(downsampledPath);
                
                // Add downsampled channel label
                const downsampledLabel = document.createElement('div');
                downsampledLabel.className = 'signal-label';
                downsampledLabel.textContent = `${channel.name} (Downsampled ${viewerState.downSamplingRate}Hz)`;
                downsampledLabel.style.top = `${downsampledYOffset - 15}px`;
                downsampledLabel.style.left = '10px';
                downsampledLabel.style.background = '#FF0000';
                downsampledLabel.style.color = '#FFF';
                downsampledLabel.style.padding = '2px 6px';
                downsampledLabel.style.borderRadius = '3px';
                downsampledLabel.style.fontSize = '11px';
                downsampledLabel.style.fontWeight = 'bold';
                fragment.appendChild(downsampledLabel);
            }
            
            // Add trial separation lines
            if (viewerState.allTrialsData && viewerState.allTrialsData.numTrials > 1) {
                addTrialSeparationLines(index, channelHeight, originalYOffset, width, sampleRate, fragment);
            }
        });
    }
    
    signalGrid.appendChild(fragment);
    console.log("Signals rendered successfully");
}

    function resetViewerState() {
        viewerState.isPlaying = false;
        viewerState.currentTime = 0;
        viewerState.pan = 0;
        viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
        
        // Reset controls
        panControl.value = 0;
        panValue.textContent = '0%';
        
        // Clear any existing signals
        const existingSignals = signalDisplay.querySelectorAll('.signal-line, .signal-label, .trial-line, .trial-label, .polar-element');
        existingSignals.forEach(el => el.remove());
        
        // Force re-render
        renderSignals();
    }
    
    // Add vertical lines to separate trials
    function addTrialSeparationLines(channelIndex, channelHeight, yOffset, width, sampleRate, fragment) {
        if (!viewerState.allTrialsData) return;
        
        const { numTrials, numSamples } = viewerState.allTrialsData;
        const samplesPerTrial = numSamples;
        
        for (let trialIdx = 1; trialIdx < numTrials; trialIdx++) {
            const trialStartTime = (trialIdx * samplesPerTrial) / sampleRate;
            const viewportStart = (viewerState.pan / 100) * Math.max(0, (numTrials * samplesPerTrial / sampleRate) - viewerState.viewportDuration / viewerState.zoom);
            const x = ((trialStartTime - viewportStart) * width) / (viewerState.viewportDuration / viewerState.zoom);
            
            if (x >= 0 && x <= width) {
                const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                line.classList.add('trial-line');
                line.setAttribute('x1', x);
                line.setAttribute('y1', yOffset - channelHeight / 2);
                line.setAttribute('x2', x);
                line.setAttribute('y2', yOffset + channelHeight / 2);
                line.setAttribute('stroke', '#ff6b6b');
                line.setAttribute('stroke-width', '1');
                line.setAttribute('stroke-dasharray', '5,5');
                line.setAttribute('opacity', '0.7');
                fragment.appendChild(line);
                
                const label = document.createElement('div');
                label.className = 'trial-label signal-label';
                label.textContent = `T${trialIdx + 1}`;
                label.style.top = `${yOffset - channelHeight / 2 - 10}px`;
                label.style.left = `${x + 5}px`;
                label.style.background = 'rgba(255, 107, 107, 0.8)';
                fragment.appendChild(label);
            }
        }
    }
    
    // Set up event listeners
    function setupEventListeners() {
        playBtn.addEventListener('click', playSignal);
        pauseBtn.addEventListener('click', pauseSignal);
        resetBtn.addEventListener('click', resetSignal);
        
        speedControl.addEventListener('input', updateSpeed);
        zoomControl.addEventListener('input', updateZoom);
        panControl.addEventListener('input', updatePan);
        
        uploadBtn.addEventListener('click', () => signalUpload.click());
        signalUpload.addEventListener('change', handleFileUpload);
        
        analyzeBtn.addEventListener('click', startAnalysis);
        
        // Viewer mode selection
        const viewerOptions = document.querySelectorAll('.viewer-option');
        viewerOptions.forEach(option => {
            option.addEventListener('click', () => {
                viewerOptions.forEach(opt => opt.classList.remove('active'));
                option.classList.add('active');
                
                // Update viewer mode
                const newMode = option.getAttribute('data-viewer');
                viewerState.currentViewMode = newMode;
                
                // Handle mode-specific setup
                if (newMode === 'xor') {
                    // Ensure we have at least one channel selected
                    const activeChannels = viewerState.channels.filter(ch => ch.active);
                    if (activeChannels.length < 1) {
                        // Auto-activate first channel if none are active
                        viewerState.channels[0].active = true;
                        viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
                    }
                    viewerState.xorChannel = viewerState.activeChannels[0]?.id;
                    addXORChannelSelection();
                    removePolarControls();
                } else if (newMode === 'polar') {
                    removeXORChannelSelection();
                    addPolarControls();
                    // Initialize polar mode defaults
                    if (!viewerState.polarTimeWindow) viewerState.polarTimeWindow = 5;
                    if (!viewerState.polarRadiusScale) viewerState.polarRadiusScale = 0.8;
                    if (!viewerState.polarMode) viewerState.polarMode = 'cumulative';
                } else {
                    removeXORChannelSelection();
                    removePolarControls();
                }
                
                renderSignals();
                renderChannelList();
            });
        });
        
        window.addEventListener('resize', () => {
            drawGrid(signalDisplay.clientWidth, signalDisplay.clientHeight);
            renderSignals();
        });
    }
    
function playSignal() {
    if (viewerState.isPlaying) return;
    
    viewerState.isPlaying = true;
    playBtn.disabled = true;
    pauseBtn.disabled = false;
    
    function animate() {
        if (!viewerState.isPlaying) return;
        
        const firstChannel = viewerState.activeChannels[0];
        const channelData = viewerState.signalData[firstChannel?.id];
        
        if (!channelData) {
            pauseSignal();
            return;
        }
        
        const totalDuration = channelData.length / viewerState.sampleRate;
        const maxPan = 100 - (100 / (totalDuration / (viewerState.viewportDuration / viewerState.zoom)));
        
        viewerState.pan = Math.min(maxPan, viewerState.pan + (0.1 * viewerState.speed));
        panControl.value = viewerState.pan;
        panValue.textContent = `${Math.round(viewerState.pan)}%`;
        
        // Update current time for polar mode
        viewerState.currentTime = (viewerState.pan / 100) * (totalDuration - (viewerState.viewportDuration / viewerState.zoom)) + (viewerState.viewportDuration / viewerState.zoom / 2);
        
        if (viewerState.pan >= maxPan) {
            viewerState.pan = 0;
            panControl.value = 0;
            viewerState.currentTime = 0;
        }
        
        renderSignals();
        viewerState.animationId = requestAnimationFrame(animate);
    }
    
    animate();
}
    // Pause the signal
    function pauseSignal() {
        viewerState.isPlaying = false;
        playBtn.disabled = false;
        pauseBtn.disabled = true;
        
        if (viewerState.animationId) {
            cancelAnimationFrame(viewerState.animationId);
            viewerState.animationId = null;
        }
    }
    
   function resetSignal() {
        pauseSignal();
        viewerState.pan = 0;
        viewerState.currentTime = 0;
        panControl.value = 0;
        panValue.textContent = '0%';
        renderSignals();
    }
    
    // Update playback speed
    function updateSpeed() {
        viewerState.speed = parseFloat(speedControl.value);
        speedValue.textContent = `${viewerState.speed.toFixed(1)}x`;
    }
    
    // Update zoom level
    function updateZoom() {
        viewerState.zoom = parseFloat(zoomControl.value);
        zoomValue.textContent = `${viewerState.zoom.toFixed(1)}x`;
        renderSignals();
    }
    
function updatePan() {
    viewerState.pan = parseFloat(panControl.value);
    panValue.textContent = `${Math.round(viewerState.pan)}%`;
    
    // Update current time for polar mode
    const firstChannel = viewerState.activeChannels[0];
    const channelData = viewerState.signalData[firstChannel?.id];
    if (channelData) {
        const totalDuration = channelData.length / viewerState.sampleRate;
        viewerState.currentTime = (viewerState.pan / 100) * (totalDuration - (viewerState.viewportDuration / viewerState.zoom)) + (viewerState.viewportDuration / viewerState.zoom / 2);
    }
    
    renderSignals();
}
    
    // Handle file upload
    async function handleFileUpload(event) {
        const file = event.target.files[0];
        if (!file) return;
        
        uploadStatus.textContent = `Uploading ${file.name}...`;
        uploadStatus.className = 'mt-2 small text-info';
        
        try {
            const uploadedData = await loadSignalData(file);
            console.log('Parsed NPY data:', uploadedData);
            processUploadedData(uploadedData);
            
            uploadStatus.textContent = `File ${file.name} loaded successfully (${uploadedData.shape.join('x')})`;
            uploadStatus.className = 'mt-2 small text-success';
        } catch (error) {
            console.error('Error loading file:', error);
            uploadStatus.textContent = `Error loading file: ${error.message}`;
            uploadStatus.className = 'mt-2 small text-danger';
            generateSampleData();
        }
    }
    
    // Start EEG analysis with backend
    async function startAnalysis() {
        // Get the file from the upload input
        const file = signalUpload.files[0];
        
        if (!file) {
            alert('Please upload an EEG signal file (.npy or .npz) first!');
            return;
        }

        analyzeBtn.disabled = true;
        analyzeBtn.innerHTML = '<i class="bi-hourglass-split me-2"></i>Analyzing with AI...';

        try {
            const formData = new FormData();
            formData.append('file', file);

            console.log('Sending file to backend:', file.name, file.size);
            
            const response = await fetch('http://127.0.0.1:5000/api/classify_eeg', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`Server error: ${response.status} - ${errorText}`);
            }

            const result = await response.json();
            console.log('Backend response:', result);

            if (result.status === "error") {
                throw new Error(result.error || "Unknown error from backend");
            }

            // Show the classification results
            showClassificationResult(result);
            
        } catch (error) {
            console.error('Analysis error:', error);
            alert('Analysis failed: ' + error.message);
        } finally {
            analyzeBtn.disabled = false;
            analyzeBtn.innerHTML = '<i class="bi-play-circle me-2"></i>Analyze with AI';
        }
    }

function showClassificationResult(classification) {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.innerHTML = `
        <div class="modal-dialog modal-lg">
            <div class="modal-content">
                <div class="modal-header bg-primary text-white">
                    <h5 class="modal-title">EEG Analysis Results</h5>
                    <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body text-center">
                    <h3 class="text-primary">${classification.prediction}</h3>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
    const bsModal = new bootstrap.Modal(modal);
    bsModal.show();
    modal.addEventListener('hidden.bs.modal', () => {
        document.body.removeChild(modal);
    });
}

    // Initialize the viewer
    initViewer();
});