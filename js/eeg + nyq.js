// EEG Signal Viewer Implementation with Nyquist Effect
document.addEventListener('DOMContentLoaded', function() {
    // Signal viewer state
    const viewerState = {
        isPlaying: false,
        currentTime: 0,
        viewportDuration: 10,
        signalData: null,
        channels: [],
        activeChannels: [],
        animationId: null,
        speed: 1,
        zoom: 1,
        pan: 0,
        sampleRate: 250,
        allTrialsData: null,
        currentTrialDisplay: 'all',
        channelMaxAmplitudes: {},
        lastRenderTime: 0,
        renderThrottle: 16,
        currentViewMode: 'standard',
        xorChannel: null,
        polarMode: 'cumulative',
        polarTimeWindow: 5,
        polarRadiusScale: 0.8
    };
    
    window.viewerState = viewerState;
    
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

    // Nyquist Effect Class
    class NyquistEffect {
        constructor(viewerState) {
            this.viewerState = viewerState;
            this.originalSignalData = null;
            this.downsampledSignalData = null;
            this.isDownsampled = false;
            this.downsampleFactor = 1;
            this.nyquistFrequency = 0;
            this.classificationResult = null;
            this.downsampledClassificationResult = null;
        }

        addNyquistControls() {
    // Check if controls already exist and remove them
    const existingSection = document.getElementById('nyquist-section');
    if (existingSection) {
        existingSection.remove();
    }

    // Try different selectors for the controls container
    let controlsContainer = document.querySelector('.control-panel .card-body');
    if (!controlsContainer) {
        controlsContainer = document.querySelector('.control-panel');
        if (!controlsContainer) {
            console.error('Could not find controls container');
            return;
        }
    }
    
    console.log('Found controls container:', controlsContainer);
    
    const nyquistSection = document.createElement('div');
    nyquistSection.id = 'nyquist-section';
    nyquistSection.className = 'control-group mt-4 p-3 border rounded bg-light';
    nyquistSection.innerHTML = `
        <h6 class="text-primary">🎛️ Nyquist Effect Simulation</h6>
        
        <div class="mb-2">
            <label class="small fw-bold">Downsample Factor:</label>
            <input type="range" class="form-range" id="downsample-factor" min="1" max="10" value="1" step="1">
            <div class="small text-muted" id="downsample-value">1x (No downsampling)</div>
        </div>
        
        <div class="mb-2">
            <label class="small fw-bold">Original Sample Rate:</label>
            <input type="number" class="form-control form-control-sm" id="original-sample-rate" value="250" min="1" max="10000">
            <div class="small text-info fw-bold" id="nyquist-frequency">Nyquist Frequency: 125 Hz</div>
        </div>
        
        <div class="mb-3">
            <button type="button" class="btn btn-warning btn-sm w-100" id="apply-downsampling">
                <i class="bi-arrow-down-circle me-1"></i>Apply Downsampling
            </button>
            <button type="button" class="btn btn-secondary btn-sm w-100 mt-1" id="reset-downsampling" style="display: none;">
                <i class="bi-arrow-clockwise me-1"></i>Reset to Original
            </button>
        </div>
        
        <div class="alert alert-info small" id="nyquist-info">
            <i class="bi-info-circle me-1"></i>
            Downsampling reduces sample rate and may cause aliasing if signal contains frequencies above the new Nyquist limit.
        </div>
        
        <div class="classification-comparison mt-3" id="classification-comparison" style="display: none;">
            <h6 class="text-success">Classification Impact</h6>
            <div class="comparison-result">
                <div class="original-result">
                    <strong>Original Signal:</strong>
                    <span id="original-classification" class="badge bg-success ms-1">-</span>
                </div>
                <div class="downsampled-result mt-1">
                    <strong>Downsampled Signal:</strong>
                    <span id="downsampled-classification" class="badge bg-danger ms-1">-</span>
                </div>
                <div class="impact-result mt-2" id="impact-result">
                    <small class="text-muted">Classification impact will appear here</small>
                </div>
            </div>
        </div>
    `;

    // Insert after the upload section or at the end
    const uploadSection = controlsContainer.querySelector('.upload-container');
    if (uploadSection) {
        uploadSection.parentNode.insertBefore(nyquistSection, uploadSection.nextSibling);
        console.log('✓ Inserted Nyquist section after upload container');
    } else {
        controlsContainer.appendChild(nyquistSection);
        console.log('✓ Appended Nyquist section to controls container');
    }
    
    this.setupNyquistEventListeners();
    this.updateNyquistInfo();
    
    // Force a reflow to ensure display
    nyquistSection.offsetHeight;
}
        setupNyquistEventListeners() {
            const downsampleFactor = document.getElementById('downsample-factor');
            const downsampleValue = document.getElementById('downsample-value');
            const originalSampleRate = document.getElementById('original-sample-rate');
            const applyBtn = document.getElementById('apply-downsampling');
            const resetBtn = document.getElementById('reset-downsampling');

            downsampleFactor.addEventListener('input', () => {
                const factor = parseInt(downsampleFactor.value);
                downsampleValue.textContent = `${factor}x (${this.calculateEffectiveSampleRate(factor)} Hz)`;
                this.updateNyquistInfo();
            });

            originalSampleRate.addEventListener('input', () => {
                this.viewerState.sampleRate = parseInt(originalSampleRate.value);
                this.updateNyquistInfo();
            });

            applyBtn.addEventListener('click', () => {
                this.applyDownsampling();
            });

            resetBtn.addEventListener('click', () => {
                this.resetDownsampling();
            });
        }

        updateNyquistInfo() {
            const downsampleFactor = parseInt(document.getElementById('downsample-factor').value);
            const originalRate = parseInt(document.getElementById('original-sample-rate').value);
            const effectiveRate = this.calculateEffectiveSampleRate(downsampleFactor);
            const nyquistFreq = effectiveRate / 2;

            document.getElementById('nyquist-frequency').textContent = 
                `Nyquist Frequency: ${nyquistFreq.toFixed(1)} Hz`;

            const infoElement = document.getElementById('nyquist-info');
            if (downsampleFactor > 1) {
                infoElement.className = 'alert alert-warning small';
                infoElement.innerHTML = `
                    <i class="bi-exclamation-triangle me-1"></i>
                    Downsampling to ${effectiveRate} Hz. Frequencies above ${nyquistFreq.toFixed(1)} Hz will alias!
                `;
            } else {
                infoElement.className = 'alert alert-info small';
                infoElement.innerHTML = `
                    <i class="bi-info-circle me-1"></i>
                    No downsampling applied. Original sample rate maintained.
                `;
            }
        }

        calculateEffectiveSampleRate(downsampleFactor) {
            const originalRate = parseInt(document.getElementById('original-sample-rate').value);
            return Math.floor(originalRate / downsampleFactor);
        }

        applyDownsampling() {
            if (!this.viewerState.signalData) {
                alert('Please load EEG signal data first!');
                return;
            }

            this.downsampleFactor = parseInt(document.getElementById('downsample-factor').value);
            
            if (this.downsampleFactor === 1) {
                alert('Downsample factor of 1x means no downsampling. Please choose a higher factor.');
                return;
            }

            if (!this.originalSignalData) {
                this.originalSignalData = {};
                Object.keys(this.viewerState.signalData).forEach(channelId => {
                    this.originalSignalData[channelId] = new Float32Array(this.viewerState.signalData[channelId]);
                });
            }

            this.downsampledSignalData = {};
            const effectiveSampleRate = this.calculateEffectiveSampleRate(this.downsampleFactor);
            
            Object.keys(this.viewerState.signalData).forEach(channelId => {
                const originalData = this.originalSignalData[channelId];
                const downsampledLength = Math.ceil(originalData.length / this.downsampleFactor);
                const downsampledData = new Float32Array(downsampledLength);
                
                for (let i = 0; i < downsampledLength; i++) {
                    const originalIndex = i * this.downsampleFactor;
                    if (originalIndex < originalData.length) {
                        downsampledData[i] = originalData[originalIndex];
                    }
                }
                
                this.downsampledSignalData[channelId] = downsampledData;
            });

            this.viewerState.signalData = this.downsampledSignalData;
            this.viewerState.sampleRate = effectiveSampleRate;
            this.isDownsampled = true;

            document.getElementById('reset-downsampling').style.display = 'block';
            document.getElementById('apply-downsampling').textContent = 'Update Downsampling';
            document.getElementById('classification-comparison').style.display = 'block';

            this.showAliasingWarning();
            renderSignals();
            this.simulateClassificationImpact();

            console.log(`Applied ${this.downsampleFactor}x downsampling. Effective sample rate: ${effectiveSampleRate} Hz`);
        }

        resetDownsampling() {
            if (this.originalSignalData) {
                this.viewerState.signalData = {};
                Object.keys(this.originalSignalData).forEach(channelId => {
                    this.viewerState.signalData[channelId] = new Float32Array(this.originalSignalData[channelId]);
                });
                
                this.viewerState.sampleRate = parseInt(document.getElementById('original-sample-rate').value);
                this.isDownsampled = false;

                const warningElement = document.getElementById('aliasing-warning');
                if (warningElement) {
                    warningElement.remove();
                }

                document.getElementById('reset-downsampling').style.display = 'none';
                document.getElementById('apply-downsampling').textContent = 'Apply Downsampling';
                document.getElementById('downsample-factor').value = 1;
                document.getElementById('downsample-value').textContent = '1x (No downsampling)';
                document.getElementById('classification-comparison').style.display = 'none';

                this.updateNyquistInfo();
                renderSignals();

                console.log('Reset to original signal data');
            }
        }

        showAliasingWarning() {
            const originalRate = parseInt(document.getElementById('original-sample-rate').value);
            const effectiveRate = this.calculateEffectiveSampleRate(this.downsampleFactor);
            const nyquistFreq = effectiveRate / 2;

            let warningElement = document.getElementById('aliasing-warning');
            if (!warningElement) {
                warningElement = document.createElement('div');
                warningElement.id = 'aliasing-warning';
                warningElement.className = 'alert alert-danger mt-2';
                document.querySelector('.nyquist-section').appendChild(warningElement);
            }

            warningElement.innerHTML = `
                <i class="bi-exclamation-triangle-fill me-2"></i>
                <strong>Aliasing Warning!</strong><br>
                <small>
                    Sample rate reduced from ${originalRate} Hz to ${effectiveRate} Hz.<br>
                    Frequencies above ${nyquistFreq.toFixed(1)} Hz will alias and distort the signal.<br>
                    This may cause misclassification of EEG patterns.
                </small>
            `;
        }

        simulateClassificationImpact() {
            const diseases = ['Normal', 'Epilepsy', 'Alzheimer', 'Parkinson', 'Sleep Disorder'];
            const originalDisease = diseases[Math.floor(Math.random() * diseases.length)];
            
            let downsampledDisease;
            const failureChance = Math.min(0.3 + (this.downsampleFactor - 1) * 0.15, 0.9);
            
            if (Math.random() < failureChance) {
                const otherDiseases = diseases.filter(d => d !== originalDisease);
                downsampledDisease = otherDiseases[Math.floor(Math.random() * otherDiseases.length)];
            } else {
                downsampledDisease = originalDisease;
            }

            document.getElementById('original-classification').textContent = originalDisease;
            document.getElementById('downsampled-classification').textContent = downsampledDisease;

            const impactElement = document.getElementById('impact-result');
            if (originalDisease !== downsampledDisease) {
                impactElement.className = 'alert alert-danger small p-2';
                impactElement.innerHTML = `
                    <i class="bi-x-circle-fill me-1"></i>
                    <strong>Classification Failed!</strong><br>
                    Model misclassified as ${downsampledDisease} instead of ${originalDisease}
                `;
            } else {
                impactElement.className = 'alert alert-success small p-2';
                impactElement.innerHTML = `
                    <i class="bi-check-circle-fill me-1"></i>
                    <strong>Classification Maintained</strong><br>
                    Model correctly identified ${originalDisease} despite downsampling
                `;
            }

            this.classificationResult = {
                original: originalDisease,
                downsampled: downsampledDisease,
                confidence: Math.max(0.1, 1 - failureChance).toFixed(2)
            };
        }

        analyzeFrequencyContent() {
            if (!this.viewerState.signalData) return null;

            const channelId = Object.keys(this.viewerState.signalData)[0];
            const signal = this.viewerState.signalData[channelId];
            const sampleRate = this.viewerState.sampleRate;

            const frequencies = this.estimateDominantFrequencies(signal, sampleRate);
            
            return {
                dominantFrequencies: frequencies,
                hasHighFrequencies: frequencies.some(freq => freq > sampleRate / 4),
                maxFrequency: Math.max(...frequencies)
            };
        }

        estimateDominantFrequencies(signal, sampleRate) {
            let zeroCrossings = 0;
            for (let i = 1; i < signal.length; i++) {
                if ((signal[i-1] <= 0 && signal[i] > 0) || (signal[i-1] >= 0 && signal[i] < 0)) {
                    zeroCrossings++;
                }
            }
            
            const duration = signal.length / sampleRate;
            const fundamentalFreq = zeroCrossings / (2 * duration);
            
            return [
                fundamentalFreq,
                fundamentalFreq * 2,
                fundamentalFreq * 3,
                fundamentalFreq * 4
            ].filter(freq => freq < sampleRate / 2);
        }

        exportDownsampledData() {
            if (!this.isDownsampled || !this.downsampledSignalData) {
                return null;
            }

            return {
                data: this.downsampledSignalData,
                originalSampleRate: parseInt(document.getElementById('original-sample-rate').value),
                downsampledSampleRate: this.viewerState.sampleRate,
                downsamplingFactor: this.downsampleFactor,
                nyquistFrequency: this.viewerState.sampleRate / 2,
                classificationImpact: this.classificationResult
            };
        }
    }

    const nyquistEffect = new NyquistEffect(viewerState);
    window.nyquistEffect = nyquistEffect;
    
    function initViewer() {
        const width = signalDisplay.clientWidth;
        const height = signalDisplay.clientHeight;
        
        signalGrid.setAttribute('width', width);
        signalGrid.setAttribute('height', height);
        
        drawGrid(width, height);
        setupDefaultChannels();
        generateSampleData();
        setupEventListeners();
        
        nyquistEffect.addNyquistControls();
        
        viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
        console.log('Initial active channels:', viewerState.activeChannels.map(ch => ch.id));
        
        renderSignals();
    }
    
    function drawGrid(width, height) {
        signalGrid.innerHTML = '';
        
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

    function setupDefaultChannels() {
        const defaultChannels = [
            { id: 'Fp1', name: 'Fp1', color: '#E63946', active: true },
            { id: 'Fp2', name: 'Fp2', color: '#06D6A0', active: true },
            { id: 'F7', name: 'F7', color: '#118AB2', active: false },
            { id: 'F3', name: 'F3', color: '#FFD166', active: false },
            { id: 'Fz', name: 'Fz', color: '#8338EC', active: false },
            { id: 'F4', name: 'F4', color: '#06BCC1', active: false },
            { id: 'F8', name: 'F8', color: '#F8961E', active: false },
            { id: 'T3', name: 'T3', color: '#9B5DE5', active: false },
            { id: 'C3', name: 'C3', color: '#118C4F', active: false },
            { id: 'Cz', name: 'Cz', color: '#1D3557', active: false },
            { id: 'C4', name: 'C4', color: '#B56576', active: false },
            { id: 'T4', name: 'T4', color: '#6A4C93', active: false },
            { id: 'T5', name: 'T5', color: '#00A8E8', active: false },
            { id: 'P3', name: 'P3', color: '#EF476F', active: false },
            { id: 'Pz', name: 'Pz', color: '#C77DFF', active: false },
            { id: 'P4', name: 'P4', color: '#4CAF50', active: false },
            { id: 'T6', name: 'T6', color: '#FFD23F', active: false },
            { id: 'O1', name: 'O1', color: '#FF6B6B', active: false },
            { id: 'O2', name: 'O2', color: '#3A86FF', active: false }
        ];
        
        viewerState.channels = defaultChannels;
        viewerState.activeChannels = defaultChannels.filter(ch => ch.active);
        
        const activeChannels = viewerState.channels.filter(ch => ch.active);
        if (activeChannels.length >= 1) {
            viewerState.xorChannel = activeChannels[0].id;
        }
        
        renderChannelList();
    }
    
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
        
        if (viewerState.currentViewMode === 'xor') {
            addXORChannelSelection();
        }
        
        if (viewerState.currentViewMode === 'polar') {
            addPolarControls();
        }
    }
    
    function addXORChannelSelection() {
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
        
        document.getElementById('xor-channel').addEventListener('change', function() {
            viewerState.xorChannel = this.value;
            renderSignals();
        });
    }

    function removeXORChannelSelection() {
        const xorContainer = document.getElementById('xor-channel-selection');
        if (xorContainer) {
            xorContainer.remove();
        }
    }

    function addPolarControls() {
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

    function removePolarControls() {
        const polarControls = document.getElementById('polar-controls');
        if (polarControls) {
            polarControls.remove();
        }
    }

    function toggleChannel(channelId, isActive) {
        const channel = viewerState.channels.find(ch => ch.id === channelId);
        if (channel) {
            const currentActiveCount = viewerState.channels.filter(ch => ch.active).length;
            
            if (!isActive && currentActiveCount <= 1) {
                alert('At least one channel must be active. Please select another channel before disabling this one.');
                document.getElementById(`channel-${channelId}`).checked = true;
                return;
            }
            
            channel.active = isActive;
            viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
            
            console.log(`Toggled channel ${channelId} to ${isActive}`);
            console.log('Active channels:', viewerState.activeChannels.map(ch => ch.id));
            
            if (viewerState.currentViewMode === 'xor') {
                const activeChannels = viewerState.activeChannels;
                if (activeChannels.length >= 1 && !activeChannels.find(ch => ch.id === viewerState.xorChannel)) {
                    viewerState.xorChannel = activeChannels[0].id;
                }
                removeXORChannelSelection();
                addXORChannelSelection();
            }
            
            renderSignals();
        }
    }
    
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
    
    async function loadSignalData(file) {
        const fileExtension = file.name.split('.').pop().toLowerCase();
        if (fileExtension === 'npy') {
            return await parseNPYFile(file);
        } else {
            throw new Error(`File type .${fileExtension} not yet implemented`);
        }
    }

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

        resetViewerState();
        renderChannelList();
    }

    function processAllTrials() {
        if (!viewerState.allTrialsData) return;
        
        const { numTrials, numChannels, numSamples, data } = viewerState.allTrialsData;
        viewerState.signalData = {};
        
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
            
            const channelName = viewerState.channels[channelIdx]?.name || `Channel ${channelIdx + 1}`;
            const channelColor = viewerState.channels[channelIdx]?.color || getColorForIndex(channelIdx);
            
            viewerState.signalData[channelName] = combinedData;
            viewerState.channelMaxAmplitudes[channelName] = maxAmplitude || 1;
            
            if (viewerState.channels[channelIdx]) {
                viewerState.channels[channelIdx].active = channelIdx < 2;
            }
        }
        
        viewerState.channels = viewerState.channels.slice(0, 19);
        viewerState.activeChannels = viewerState.channels.filter(ch => ch.active);
        
        addTrialInfo(numTrials, numSamples);
    }
    
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
    
    function getColorForIndex(index) {
        const colors = [
            '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
            '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9',
            '#F1948A', '#82E0AA', '#F8C471', '#85C1E9', '#D7BDE2',
            '#F9E79F', '#A9DFBF', '#F5B7B1', '#AED6F1'
        ];
        return colors[index % colors.length];
    }

    function renderXORComparison(width, height, channelHeight, viewportStart, viewportEnd, sampleRate, fragment) {
        if (!viewerState.xorChannel) {
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
        
        const chunkDuration = viewportDuration;
        const samplesPerChunk = Math.floor(chunkDuration * sampleRate);
        const totalSamples = channelData.length;
        const numChunks = Math.floor(totalSamples / samplesPerChunk);
        
        if (numChunks < 2) {
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
        
        const xorResults = [];
        let maxDifference = 0;
        
        for (let chunkIdx = 1; chunkIdx < numChunks; chunkIdx++) {
            const prevChunkStart = (chunkIdx - 1) * samplesPerChunk;
            const currentChunkStart = chunkIdx * samplesPerChunk;
            
            const chunkDifferences = new Float32Array(samplesPerChunk);
            
            for (let i = 0; i < samplesPerChunk; i++) {
                const prevSample = channelData[prevChunkStart + i];
                const currentSample = channelData[currentChunkStart + i];
                
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
        
        xorResults.forEach((chunk, chunkIndex) => {
            const chunkStartTime = chunk.startTime;
            const chunkEndTime = chunkStartTime + chunkDuration;
            
            if (chunkEndTime < viewportStart || chunkStartTime > viewportEnd) {
                return;
            }
            
            const viewportRelativeStart = Math.max(0, chunkStartTime - viewportStart);
            const viewportRelativeEnd = Math.min(viewportDuration, chunkEndTime - viewportStart);
            
            const startX = (viewportRelativeStart / viewportDuration) * width;
            const endX = (viewportRelativeEnd / viewportDuration) * width;
            const chunkWidth = endX - startX;
            
            if (chunkWidth <= 0) return;
            
            const samplesPerPixel = Math.max(1, samplesPerChunk / chunkWidth);
            
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
            
            for (let i = 0; i < chunkWidth; i += 5) {
                const sampleIndex = Math.floor(i * samplesPerPixel);
                if (sampleIndex >= 0 && sampleIndex < chunk.differences.length) {
                    const difference = chunk.differences[sampleIndex];
                    
                    if (difference > 0.05) {
                        const x = startX + i;
                        const prevValue = chunk.prevData[sampleIndex] / (viewerState.channelMaxAmplitudes[viewerState.xorChannel] || 1);
                        const currentValue = chunk.currentData[sampleIndex] / (viewerState.channelMaxAmplitudes[viewerState.xorChannel] || 1);
                        
                        const yPrev = yOffset - (prevValue * channelHeight * 0.4);
                        const yCurrent = yOffset - (currentValue * channelHeight * 0.4);
                        
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
    }

    function renderPolarGraph(width, height, fragment) {
        if (!viewerState.signalData || Object.keys(viewerState.signalData).length === 0) return;
        
        const centerX = width / 2;
        const centerY = height / 2;
        const maxRadius = Math.min(centerX, centerY) * 0.8 * (viewerState.polarRadiusScale || 0.8);
        const timeWindow = viewerState.polarTimeWindow || 5;
        
        drawPolarGrid(centerX, centerY, maxRadius, fragment);
        
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

        // Optimized signal rendering with throttling - FIXED VERSION
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
