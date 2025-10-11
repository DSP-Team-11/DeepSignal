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
            xorChannel1: null,
            xorChannel2: null,
            // Polar mode state
            polarMode: 'cumulative', // 'cumulative' or 'latest'
            polarTimeWindow: 5, // seconds
            polarRadiusScale: 0.8
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
            
            // Ensure initial state is correct
            viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
            console.log('Initial active channels:', viewerState.activeChannels.map(ch => ch.id));
            
            renderSignals();
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
            { id: 'Fp1', name: 'Fp1', color: '#FF0000', active: true },      // Bright Red
            { id: 'Fp2', name: 'Fp2', color: '#00FF00', active: true },      // Bright Green
            { id: 'F7', name: 'F7', color: '#0000FF', active: false },       // Bright Blue
            { id: 'F3', name: 'F3', color: '#FFFF00', active: false },       // Yellow
            { id: 'Fz', name: 'Fz', color: '#FF00FF', active: false },       // Magenta
            { id: 'F4', name: 'F4', color: '#00FFFF', active: false },       // Cyan
            { id: 'F8', name: 'F8', color: '#FFA500', active: false },       // Orange
            { id: 'T3', name: 'T3', color: '#800080', active: false },       // Purple
            { id: 'C3', name: 'C3', color: '#008000', active: false },       // Dark Green
            { id: 'Cz', name: 'Cz', color: '#000080', active: false },       // Navy Blue
            { id: 'C4', name: 'C4', color: '#800000', active: false },       // Maroon
            { id: 'T4', name: 'T4', color: '#808000', active: false },       // Olive
            { id: 'T5', name: 'T5', color: '#008080', active: false },       // Teal
            { id: 'P3', name: 'P3', color: '#FF4500', active: false },       // Orange Red
            { id: 'Pz', name: 'Pz', color: '#DA70D6', active: false },       // Orchid
            { id: 'P4', name: 'P4', color: '#32CD32', active: false },       // Lime Green
            { id: 'T6', name: 'T6', color: '#FFD700', active: false },       // Gold
            { id: 'O1', name: 'O1', color: '#DC143C', active: false },       // Crimson
            { id: 'O2', name: 'O2', color: '#1E90FF', active: false }        // Dodger Blue
        ];
        
        viewerState.channels = defaultChannels;
        viewerState.activeChannels = defaultChannels.filter(ch => ch.active);
        
        // Set default XOR channels (first two active channels)
        const activeChannels = viewerState.channels.filter(ch => ch.active);
        if (activeChannels.length >= 2) {
            viewerState.xorChannel1 = activeChannels[0].id;
            viewerState.xorChannel2 = activeChannels[1].id;
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
        <h6>XOR Channel Selection</h6>
        <div class="mb-2">
            <label class="small">Select Two Channels for XOR:</label>
            <div class="d-flex gap-2">
                <select class="form-select form-select-sm" id="xor-channel1">
                    <option value="">Select Channel 1</option>
                    ${viewerState.channels.map(ch => 
                        `<option value="${ch.id}" ${ch.id === viewerState.xorChannel1 ? 'selected' : ''}>${ch.name}</option>`
                    ).join('')}
                </select>
                <select class="form-select form-select-sm" id="xor-channel2">
                    <option value="">Select Channel 2</option>
                    ${viewerState.channels.map(ch => 
                        `<option value="${ch.id}" ${ch.id === viewerState.xorChannel2 ? 'selected' : ''}>${ch.name}</option>`
                    ).join('')}
                </select>
            </div>
        </div>
        <div class="small text-muted">
            XOR shows differences between two selected channels
        </div>
    `;
    
    const channelListContainer = document.querySelector('.channel-list');
    channelListContainer.parentNode.insertBefore(xorContainer, channelListContainer.nextSibling);
    
    // Add event listeners for XOR channel selection
    document.getElementById('xor-channel1').addEventListener('change', function() {
        viewerState.xorChannel1 = this.value;
        renderSignals();
    });
    
    document.getElementById('xor-channel2').addEventListener('change', function() {
        viewerState.xorChannel2 = this.value;
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
                   if (activeChannels.length >= 2) {
                       if (!activeChannels.find(ch => ch.id === viewerState.xorChannel1)) {
                           viewerState.xorChannel1 = activeChannels[0].id;
                       }
                       if (!activeChannels.find(ch => ch.id === viewerState.xorChannel2)) {
                           viewerState.xorChannel2 = activeChannels[1].id;
                       }
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
            const sampleRate = 250;
            const duration = 60;
            const numSamples = sampleRate * duration;
            
            viewerState.signalData = {};
            viewerState.sampleRate = sampleRate;
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
        
     
        // XOR comparison between two channels
function renderXORComparison(width, height, channelHeight, viewportStart, viewportEnd, sampleRate, fragment) {
            if (!viewerState.xorChannel1 || !viewerState.xorChannel2) {
                // Show selection prompt instead of error
                const promptMsg = document.createElement('div');
                promptMsg.className = 'd-flex justify-content-center align-items-center h-100 text-info';
                promptMsg.innerHTML = `
                    <div class="text-center">
                        <i class="bi-arrow-left-right display-4 mb-3"></i>
                        <p>Select two channels for XOR comparison</p>
                        <small>Choose channels from the dropdowns above</small>
                    </div>
                `;
                signalDisplay.appendChild(promptMsg);
                return;
            }
            
            const channel1Data = viewerState.signalData[viewerState.xorChannel1];
            const channel2Data = viewerState.signalData[viewerState.xorChannel2];
            
            if (!channel1Data || !channel2Data) return;
            
            const yOffset = channelHeight / 2; // Single channel display for XOR result
            const samplesPerPixel = (sampleRate * (viewportEnd - viewportStart)) / width;
            
            // Calculate XOR result (absolute difference)
            const xorResult = new Float32Array(Math.min(channel1Data.length, channel2Data.length));
            let maxXOR = 0;
            
            for (let i = 0; i < xorResult.length; i++) {
                const diff = Math.abs(channel1Data[i] - channel2Data[i]);
                xorResult[i] = diff;
                maxXOR = Math.max(maxXOR, diff);
            }
            
            const maxAmplitude = maxXOR || 1;
            
            // Create XOR result path with DARKER color
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('signal-line');
            path.setAttribute('stroke', '#8B0000'); // Dark Red - darker than channel colors
            path.setAttribute('stroke-width', '3'); // Thicker line for visibility

            let pathData = '';
            let firstPoint = true;
            let lastX = -1;
            
            for (let i = 0; i < width; i += 1) {
                const sampleIndex = Math.floor(viewportStart * sampleRate + i * samplesPerPixel);
                if (sampleIndex >= 0 && sampleIndex < xorResult.length) {
                    const x = i;
                    const normalizedValue = xorResult[sampleIndex] / maxAmplitude;
                    const y = yOffset - (normalizedValue * channelHeight * 0.4);
                    
                    if (firstPoint) {
                        pathData += `M ${x} ${y}`;
                        firstPoint = false;
                    } else if (Math.abs(x - lastX) > 0.5) {
                        pathData += ` L ${x} ${y}`;
                        lastX = x;
                    }
                }
            }
            
            path.setAttribute('d', pathData);
            fragment.appendChild(path);
            
            // Add XOR label with darker background
            const label = document.createElement('div');
            label.className = 'signal-label';
            label.textContent = `XOR: ${viewerState.xorChannel1} vs ${viewerState.xorChannel2}`;
            label.style.top = `${yOffset - 15}px`;
            label.style.left = '10px';
            label.style.background = 'rgba(139, 0, 0, 0.9)'; // Dark Red background
            label.style.color = 'white';
            label.style.fontWeight = 'bold';
            label.style.border = '1px solid #600';
            fragment.appendChild(label);
            
            // Add individual channel overlays with their original bright colors
            const channel1 = viewerState.channels.find(ch => ch.id === viewerState.xorChannel1);
            const channel2 = viewerState.channels.find(ch => ch.id === viewerState.xorChannel2);
            
            if (channel1) {
                renderChannelOverlay(channel1, yOffset, width, channelHeight, viewportStart, viewportEnd, sampleRate, fragment, 0.6);
            }
            if (channel2) {
                renderChannelOverlay(channel2, yOffset, width, channelHeight, viewportStart, viewportEnd, sampleRate, fragment, 0.6);
            }
        }
        
        // Render individual channel overlay for XOR view
    function renderChannelOverlay(channel, yOffset, width, channelHeight, viewportStart, viewportEnd, sampleRate, fragment, opacity) {
        const channelData = viewerState.signalData[channel.id];
        if (!channelData) return;
        
        const samplesPerPixel = (sampleRate * (viewportEnd - viewportStart)) / width;
        const maxAmplitude = viewerState.channelMaxAmplitudes[channel.id] || 1;
        
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('signal-line');
        
        // Use original bright channel colors for overlays
        path.setAttribute('stroke', channel.color);
        path.setAttribute('stroke-width', '1.5');
        path.setAttribute('opacity', opacity.toString());

        let pathData = '';
        let firstPoint = true;
        let lastX = -1;
        
        for (let i = 0; i < width; i += 1) {
            const sampleIndex = Math.floor(viewportStart * sampleRate + i * samplesPerPixel);
            if (sampleIndex >= 0 && sampleIndex < channelData.length) {
                const x = i;
                const normalizedValue = channelData[sampleIndex] / maxAmplitude;
                const y = yOffset - (normalizedValue * channelHeight * 0.4);
                
                if (firstPoint) {
                    pathData += `M ${x} ${y}`;
                    firstPoint = false;
                } else if (Math.abs(x - lastX) > 0.5) {
                    pathData += ` L ${x} ${y}`;
                    lastX = x;
                }
            }
        }
        
        path.setAttribute('d', pathData);
        fragment.appendChild(path);
        
        // Add channel overlay labels
        const label = document.createElement('div');
        label.className = 'signal-label';
        label.textContent = `${channel.name} (overlay)`;
        label.style.top = `${yOffset + 15}px`;
        label.style.left = '10px';
        label.style.background = channel.color;
        label.style.color = '#000';
        label.style.fontSize = '10px';
        label.style.opacity = '0.8';
        fragment.appendChild(label);
    }

   // Update the polar graph rendering function
function renderPolarGraph(width, height, fragment) {
    if (!viewerState.signalData || Object.keys(viewerState.signalData).length === 0) return;
    
    const centerX = width / 2;
    const centerY = height / 2;
    const maxRadius = Math.min(centerX, centerY) * 0.8 * (viewerState.polarRadiusScale || 0.8);
    const timeWindow = viewerState.polarTimeWindow || 5; // seconds
    
    // Draw polar grid
    drawPolarGrid(centerX, centerY, maxRadius, fragment);
    
    // Get current time window - FIXED: Use current time for dynamic display
    const currentTime = viewerState.currentTime || 0;
    const sampleRate = viewerState.sampleRate;
    const totalSamples = Object.values(viewerState.signalData)[0].length;
    const totalDuration = totalSamples / sampleRate;
    
    let startSample, endSample;
    
    if (viewerState.polarMode === 'latest') {
        // Show only the latest time window - FIXED: Make it dynamic
        endSample = Math.min(totalSamples - 1, Math.floor(currentTime * sampleRate));
        startSample = Math.max(0, endSample - Math.floor(timeWindow * sampleRate));
        
        // If we don't have enough data yet, adjust start sample
        if (endSample - startSample < timeWindow * sampleRate) {
            startSample = Math.max(0, endSample - Math.floor(timeWindow * sampleRate));
        }
    } else {
        // Cumulative mode - show entire signal up to current time
        startSample = 0;
        endSample = Math.min(totalSamples - 1, Math.floor(currentTime * sampleRate));
    }
    
    // Ensure we have data to display
    if (startSample >= endSample) {
        // Show message when no data available yet
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
        
        // Create polar path for this channel
        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.classList.add('signal-line', 'polar-element');
        path.setAttribute('stroke', channel.color);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('fill', 'none');
        path.setAttribute('opacity', '0.8');
        
        let pathData = '';
        let firstPoint = true;
        
        // Sample data points for performance (every 10th sample for smooth rendering)
        const sampleStep = Math.max(1, Math.floor(numSamples / 500));
        
        for (let i = startSample; i <= endSample; i += sampleStep) {
            const amplitude = channelData[i];
            const normalizedAmplitude = Math.abs(amplitude) / maxAmplitude;
            const radius = normalizedAmplitude * maxRadius;
            
            // Convert sample index to angle (time progression)
            // For latest mode, time progresses clockwise from current position
            let progress, angle;
            
            if (viewerState.polarMode === 'latest') {
                // Latest mode: time progresses clockwise, with current time at 0°
                progress = (i - startSample) / (endSample - startSample);
                angle = 2 * Math.PI * (1 - progress); // Clockwise from 0°
            } else {
                // Cumulative mode: time progresses counter-clockwise from 0°
                progress = i / totalSamples;
                angle = 2 * Math.PI * progress; // Counter-clockwise from 0°
            }
            
            // Convert polar to cartesian coordinates
            const x = centerX + radius * Math.cos(angle);
            const y = centerY + radius * Math.sin(angle);
            
            if (firstPoint) {
                pathData += `M ${x} ${y}`;
                firstPoint = false;
            } else {
                pathData += ` L ${x} ${y}`;
            }
        }
        
        // Close the path for a continuous line
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
            const currentX = centerX + currentRadius * Math.cos(0); // Current at 0°
            const currentY = centerY + currentRadius * Math.sin(0);
            
            // Add a marker for current position
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
    
    // Add time markers and information
    addPolarTimeMarkers(centerX, centerY, maxRadius, timeWindow, currentTime, totalDuration, fragment);
}

    // Draw polar coordinate grid
    function drawPolarGrid(centerX, centerY, maxRadius, fragment) {
        // Draw concentric circles (amplitude rings)
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
            
            // Add amplitude labels
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
        
        // Draw radial lines (time markers)
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
    
    // Add center information display
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
    
    // Add direction indicator for latest mode
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


        // Optimized signal rendering with throttling - FIXED VERSION
function renderSignals() {
    console.log("Active channels:", viewerState.activeChannels.map(ch => ch.id));
    console.log("Signal data keys:", Object.keys(viewerState.signalData || {}));
    
    const now = Date.now();
    if (now - viewerState.lastRenderTime < viewerState.renderThrottle) {
        return;
    }
    viewerState.lastRenderTime = now;
    
    // Clear existing signals efficiently - FIXED: Also clear placeholder messages and polar elements
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
        // Standard view - show all active channels
        const channelHeight = height / viewerState.activeChannels.length;
        viewerState.activeChannels.forEach((channel, index) => {
            const channelData = viewerState.signalData[channel.id];
            if (!channelData) {
                console.warn(`No data found for channel: ${channel.id}`);
                return;
            }
            
            const yOffset = index * channelHeight + channelHeight / 2;
            const samplesPerPixel = (sampleRate * (viewportEnd - viewportStart)) / width;
            const maxAmplitude = viewerState.channelMaxAmplitudes[channel.id] || 1;
            
            // Create SVG path with optimized point calculation
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.classList.add('signal-line');
            path.setAttribute('stroke', channel.color);
            path.setAttribute('stroke-width', '1.5');
            
            let pathData = '';
            let firstPoint = true;
            let lastX = -1;
            
            for (let i = 0; i < width; i += 1) {
                const sampleIndex = Math.floor(viewportStart * sampleRate + i * samplesPerPixel);
                if (sampleIndex >= 0 && sampleIndex < channelData.length) {
                    const x = i;
                    const normalizedValue = channelData[sampleIndex] / maxAmplitude;
                    const y = yOffset - (normalizedValue * channelHeight * 0.4);
                    
                    if (firstPoint) {
                        pathData += `M ${x} ${y}`;
                        firstPoint = false;
                    } else if (Math.abs(x - lastX) > 0.5) {
                        pathData += ` L ${x} ${y}`;
                        lastX = x;
                    }
                }
            }
            
            path.setAttribute('d', pathData);
            fragment.appendChild(path);
            
            // Add channel label
            const label = document.createElement('div');
            label.className = 'signal-label';
            label.textContent = channel.name;
            label.style.top = `${yOffset - 15}px`;
            label.style.left = '10px';
            label.style.background = channel.color;
            label.style.color = '#000';
            label.style.padding = '2px 6px';
            label.style.borderRadius = '3px';
            label.style.fontSize = '11px';
            label.style.fontWeight = 'bold';
            fragment.appendChild(label);
            
            // Add trial separation lines
            if (viewerState.allTrialsData && viewerState.allTrialsData.numTrials > 1) {
                addTrialSeparationLines(index, channelHeight, yOffset, width, sampleRate, fragment);
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
                            // Ensure we have two channels selected
                            const activeChannels = viewerState.channels.filter(ch => ch.active);
                            if (activeChannels.length < 2) {
                                // Auto-activate first two channels if less than 2 are active
                                viewerState.channels[0].active = true;
                                viewerState.channels[1].active = true;
                                viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
                            }
                            viewerState.xorChannel1 = viewerState.activeChannels[0]?.id;
                            viewerState.xorChannel2 = viewerState.activeChannels[1]?.id;
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
        
        // Update current time for polar mode - FIXED: Calculate properly
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
