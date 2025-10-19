const API_BASE_URL = "http://127.0.0.1:5000/";
    
// NUCLEAR OPTION: Prevent ALL navigation and reloads
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

// Test if we can reach the server
async function testServerConnection() {
    try {
        console.log('🔗 Testing server connection...');
        const response = await fetch(API_BASE_URL + 'api/voice-model-status', {
            method: 'GET',
            mode: 'cors',
            headers: {
                'Accept': 'application/json',
            }
        });
        console.log('✅ Server connection test:', response.status);
        return response.ok;
    } catch (error) {
        console.error('❌ Server connection test failed:', error);
        return false;
    }
}

let currentFile = null;
let isInitialized = false;
let audioContext = null;
let originalAudioBuffer = null;
let downsampledAudioBuffer = null;

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    if (isInitialized) {
        console.log('⚠️ App already initialized, skipping...');
        return;
    }
    
    console.log('🚀 Voice Analysis App Starting...');
    isInitialized = true;
    
    // Get all elements - UPDATED TO MATCH YOUR HTML
    const elements = {
        // Upload section
        uploadArea: document.getElementById('uploadArea'),
        fileInput: document.getElementById('fileInput'),
        selectFileBtn: document.getElementById('selectFileBtn'),
        fileInfo: document.getElementById('fileInfo'),
        fileName: document.getElementById('fileName'),
        removeFile: document.getElementById('removeFile'),
        analyzeBtn: document.getElementById('analyzeBtn'),
        audioPlayerContainer: document.getElementById('audioPlayerContainer'),
        originalAudio: document.getElementById('originalAudio'),
        
        // Results section
        resultsSection: document.getElementById('resultsSection'),
        genderResult: document.getElementById('genderResult'),
        genderResultFemale: document.getElementById('genderResultFemale'),
        confidenceBar: document.getElementById('confidenceBar'),
        confidenceValue: document.getElementById('confidenceValue'),
        
        // Status elements
        fileStatus: document.getElementById('fileStatus'),
        fileStatusText: document.getElementById('fileStatusText'),
        fileDuration: document.getElementById('fileDuration'),
        
        // Downsampling section
        downsampledAudio: document.getElementById('downsampledAudio'),
        downsampledAudioContainer: document.getElementById('downsampledAudioContainer'),
        noDownsampledAudio: document.getElementById('noDownsampledAudio'),
        downsampleSlider: document.getElementById('downsampleSlider'),
        sampleRateValue: document.getElementById('sampleRateValue'),
        applyDownsampling: document.getElementById('applyDownsampling'),
        resetDownsampling: document.getElementById('resetDownsampling'),
        downsampledInfo: document.getElementById('downsampledInfo'),
        originalWaveform: document.getElementById('originalWaveform'),
        downsampledWaveform: document.getElementById('downsampledWaveform'),
        
        // Reset button
        resetAnalysisBtn: document.getElementById('resetAnalysis')
    };
    
    // Log which elements were found
    console.log('🔍 Found elements:');
    Object.keys(elements).forEach(key => {
        console.log(`  ${key}:`, elements[key] ? '✅' : '❌');
    });
    
    // Setup event listeners
    function setupEventListeners() {
        console.log('🔧 Setting up event listeners...');
        
        // Select File Button
        if (elements.selectFileBtn) {
            elements.selectFileBtn.addEventListener('click', function(e) {
                console.log('📁 Select File button clicked!');
                e.preventDefault();
                e.stopPropagation();
                elements.fileInput.click();
                return false;
            });
        }
        
        // File Input Change
        if (elements.fileInput) {
            elements.fileInput.addEventListener('change', function(e) {
                console.log('📁 File input changed! Files:', e.target.files);
                e.preventDefault();
                e.stopPropagation();
                if (e.target.files && e.target.files.length > 0) {
                    currentFile = e.target.files[0];
                    handleFileSelect(currentFile);
                }
                return false;
            });
        }
        
        // Analyze Button
        if (elements.analyzeBtn) {
            elements.analyzeBtn.addEventListener('click', function(e) {
                console.log('🎯 Analyze button clicked!');
                e.preventDefault();
                e.stopPropagation();
                analyzeAudio();
                return false;
            });
        }
        
        // Remove File
        if (elements.removeFile) {
            elements.removeFile.addEventListener('click', function(e) {
                console.log('🗑️ Remove file clicked!');
                e.preventDefault();
                e.stopPropagation();
                resetAnalysis();
                return false;
            });
        }
        
        // Reset Analysis
        if (elements.resetAnalysisBtn) {
            elements.resetAnalysisBtn.addEventListener('click', function(e) {
                console.log('🔄 Reset clicked!');
                e.preventDefault();
                e.stopPropagation();
                resetAnalysis();
                return false;
            });
        }
        
        // Downsampling Slider
        if (elements.downsampleSlider) {
            elements.downsampleSlider.addEventListener('input', function(e) {
                if (elements.sampleRateValue) {
                    elements.sampleRateValue.textContent = this.value + ' Hz';
                }
            });
        }
        
        // Apply Downsampling
        if (elements.applyDownsampling) {
            elements.applyDownsampling.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                applyDownsampling();
                return false;
            });
        }
        
        // Reset Downsampling
        if (elements.resetDownsampling) {
            elements.resetDownsampling.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                resetDownsampling();
                return false;
            });
        }
        
        console.log('✅ Event listeners setup complete');
    }
    
    // Handle file selection - UPDATED WITH NULL CHECKS
    async function handleFileSelect(file) {
        console.log('📁 Handling file:', file.name);
        
        // Validate file type
        const validTypes = ['audio/wav', 'audio/mp3', 'audio/mpeg', 'audio/m4a', 'audio/flac', 'audio/aac'];
        const validExtensions = /\.(wav|mp3|m4a|flac|aac)$/i;
        
        if (!validTypes.includes(file.type) && !file.name.match(validExtensions)) {
            alert('❌ Please select a valid audio file (WAV, MP3, M4A, FLAC, AAC)');
            return;
        }
        
        // Update UI with null checks
        if (elements.fileName) elements.fileName.textContent = file.name;
        if (elements.fileInfo) elements.fileInfo.style.display = 'block';
        if (elements.analyzeBtn) elements.analyzeBtn.disabled = false;
        if (elements.fileStatusText) elements.fileStatusText.textContent = 'Loading audio...';
        
        // Show loading state for downsampling section
        if (elements.applyDownsampling) {
            elements.applyDownsampling.disabled = true;
            elements.applyDownsampling.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Loading...';
        }
        
        try {
            // Create audio preview
            const objectUrl = URL.createObjectURL(file);
            if (elements.originalAudio) elements.originalAudio.src = objectUrl;
            if (elements.audioPlayerContainer) elements.audioPlayerContainer.style.display = 'block';
            
            // Wait for audio to load and get duration
            await new Promise((resolve, reject) => {
                if (!elements.originalAudio) {
                    reject(new Error('Audio element not found'));
                    return;
                }
                
                elements.originalAudio.onloadedmetadata = function() {
                    const duration = elements.originalAudio.duration;
                    const minutes = Math.floor(duration / 60);
                    const seconds = Math.floor(duration % 60);
                    if (elements.fileDuration) {
                        elements.fileDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                    }
                    resolve();
                };
                elements.originalAudio.onerror = () => reject(new Error('Audio loading failed'));
                // Set timeout as fallback
                setTimeout(resolve, 3000);
            });
            
            // Load audio for processing
            await loadAudioForProcessing(file);
            
            if (elements.fileStatusText) elements.fileStatusText.textContent = 'Ready for analysis';
            console.log('✅ File ready for analysis and downsampling');
            
        } catch (error) {
            console.error('❌ Error handling file:', error);
            if (elements.fileStatusText) elements.fileStatusText.textContent = 'Error loading file';
            alert('❌ Error loading audio file: ' + error.message);
        } finally {
            // Reset downsampling button state
            if (elements.applyDownsampling) {
                elements.applyDownsampling.disabled = false;
                elements.applyDownsampling.innerHTML = '<i class="bi bi-play-fill me-2"></i>Apply Downsampling';
            }
        }
    }
    
    // Load audio for processing
    async function loadAudioForProcessing(file) {
        return new Promise(async (resolve, reject) => {
            try {
                if (!audioContext) {
                    audioContext = new (window.AudioContext || window.webkitAudioContext)();
                }
                
                console.log('🎵 Loading audio for processing...');
                const arrayBuffer = await file.arrayBuffer();
                originalAudioBuffer = await audioContext.decodeAudioData(arrayBuffer);
                
                // Draw original waveform
                if (elements.originalWaveform) {
                    drawWaveform(elements.originalWaveform, originalAudioBuffer);
                }
                
                // Enable downsampling button
                if (elements.applyDownsampling) {
                    elements.applyDownsampling.disabled = false;
                }
                
                console.log('✅ Audio loaded for processing, sample rate:', originalAudioBuffer.sampleRate);
                resolve();
                
            } catch (error) {
                console.error('❌ Error loading audio for processing:', error);
                reject(error);
            }
        });
    }
    
    // Draw waveform on canvas
    function drawWaveform(canvas, audioBuffer) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw background
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);
        
        // Get audio data from first channel
        const data = audioBuffer.getChannelData(0);
        const step = Math.ceil(data.length / width);
        const amp = height / 2;
        
        // Draw waveform
        ctx.beginPath();
        ctx.moveTo(0, amp);
        
        for (let i = 0; i < width; i++) {
            const index = Math.min(Math.floor(i * step), data.length - 1);
            const value = data[index];
            ctx.lineTo(i, amp + value * amp * 0.8);
        }
        
        // Create gradient
        const gradient = ctx.createLinearGradient(0, 0, width, 0);
        gradient.addColorStop(0, '#80d0c7');
        gradient.addColorStop(1, '#80d0c7');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }
    
    // Apply downsampling
    async function applyDownsampling() {
        if (!originalAudioBuffer) {
            alert('❌ Please load an audio file first');
            return;
        }
        
        const targetSampleRate = parseInt(elements.downsampleSlider.value);
        
        // Show loading state
        if (elements.applyDownsampling) {
            elements.applyDownsampling.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Processing...';
            elements.applyDownsampling.disabled = true;
        }
        
        try {
            console.log(`🎵 Downsampling from ${originalAudioBuffer.sampleRate}Hz to ${targetSampleRate}Hz`);
            
            // Simple downsampling
            downsampledAudioBuffer = await downsampleAudioBuffer(originalAudioBuffer, targetSampleRate);
            
            // Create downloadable audio
            const audioBlob = await audioBufferToWav(downsampledAudioBuffer);
            const objectUrl = URL.createObjectURL(audioBlob);
            
            // Update UI with null checks
            if (elements.downsampledAudio) elements.downsampledAudio.src = objectUrl;
            if (elements.downsampledAudioContainer) elements.downsampledAudioContainer.style.display = 'block';
            if (elements.noDownsampledAudio) elements.noDownsampledAudio.style.display = 'none';
            if (elements.downsampledInfo) {
                elements.downsampledInfo.textContent = `Downsampled to ${targetSampleRate} Hz`;
            }
            
            // Draw downsampled waveform
            if (elements.downsampledWaveform) {
                drawWaveform(elements.downsampledWaveform, downsampledAudioBuffer);
            }
            
            console.log('✅ Downsampling applied successfully');
            
        } catch (error) {
            console.error('❌ Downsampling failed:', error);
            alert('❌ Downsampling failed: ' + error.message);
        } finally {
            if (elements.applyDownsampling) {
                elements.applyDownsampling.innerHTML = '<i class="bi bi-play-fill me-2"></i>Apply Downsampling';
                elements.applyDownsampling.disabled = false;
            }
        }
    }
    
    // Simple audio downsampling
    function downsampleAudioBuffer(audioBuffer, targetSampleRate) {
        return new Promise((resolve) => {
            const originalSampleRate = audioBuffer.sampleRate;
            const ratio = originalSampleRate / targetSampleRate;
            const newLength = Math.round(audioBuffer.length / ratio);
            const numberOfChannels = audioBuffer.numberOfChannels;
            
            // Create new buffer
            const newBuffer = audioContext.createBuffer(
                numberOfChannels,
                newLength,
                targetSampleRate
            );
            
            // Simple resampling (nearest neighbor)
            for (let channel = 0; channel < numberOfChannels; channel++) {
                const originalData = audioBuffer.getChannelData(channel);
                const newData = newBuffer.getChannelData(channel);
                
                for (let i = 0; i < newLength; i++) {
                    const originalIndex = Math.round(i * ratio);
                    if (originalIndex < originalData.length) {
                        newData[i] = originalData[originalIndex];
                    }
                }
            }
            
            resolve(newBuffer);
        });
    }
    
    // Convert AudioBuffer to WAV Blob
    async function audioBufferToWav(audioBuffer) {
        return new Promise((resolve) => {
            const numberOfChannels = audioBuffer.numberOfChannels;
            const length = audioBuffer.length;
            const sampleRate = audioBuffer.sampleRate;
            const bytesPerSample = 2;
            const blockAlign = numberOfChannels * bytesPerSample;
            const byteRate = sampleRate * blockAlign;
            const dataSize = length * blockAlign;
            
            const buffer = new ArrayBuffer(44 + dataSize);
            const view = new DataView(buffer);
            
            // WAV header
            const writeString = (offset, string) => {
                for (let i = 0; i < string.length; i++) {
                    view.setUint8(offset + i, string.charCodeAt(i));
                }
            };
            
            writeString(0, 'RIFF');
            view.setUint32(4, 36 + dataSize, true);
            writeString(8, 'WAVE');
            writeString(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true); // PCM format
            view.setUint16(22, numberOfChannels, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, byteRate, true);
            view.setUint16(32, blockAlign, true);
            view.setUint16(34, bytesPerSample * 8, true);
            writeString(36, 'data');
            view.setUint32(40, dataSize, true);
            
            // Write PCM data
            let offset = 44;
            for (let i = 0; i < length; i++) {
                for (let channel = 0; channel < numberOfChannels; channel++) {
                    const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(channel)[i]));
                    view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
                    offset += 2;
                }
            }
            
            resolve(new Blob([buffer], { type: 'audio/wav' }));
        });
    }
    
    // Reset downsampling
    function resetDownsampling() {
        if (elements.downsampledAudioContainer) elements.downsampledAudioContainer.style.display = 'none';
        if (elements.noDownsampledAudio) elements.noDownsampledAudio.style.display = 'block';
        if (elements.downsampleSlider) elements.downsampleSlider.value = 16000;
        if (elements.sampleRateValue) elements.sampleRateValue.textContent = '16000';
        
        // Clear downsampled waveform
        if (elements.downsampledWaveform) {
            const ctx = elements.downsampledWaveform.getContext('2d');
            ctx.clearRect(0, 0, elements.downsampledWaveform.width, elements.downsampledWaveform.height);
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, elements.downsampledWaveform.width, elements.downsampledWaveform.height);
        }
        
        // Clean up downsampled audio URL
        if (elements.downsampledAudio && elements.downsampledAudio.src.startsWith('blob:')) {
            URL.revokeObjectURL(elements.downsampledAudio.src);
            elements.downsampledAudio.src = '';
        }
        
        downsampledAudioBuffer = null;
        
        console.log('✅ Downsampling reset');
    }
    
    // Analyze audio - UPDATED WITH NULL CHECKS
    async function analyzeAudio() {
        console.log('🎯 Starting analysis...');
        
        if (!currentFile) {
            alert('❌ Please select a file first');
            return;
        }
        
        // Show loading state with null checks
        if (elements.analyzeBtn) {
            elements.analyzeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Analyzing...';
            elements.analyzeBtn.disabled = true;
        }
        if (elements.fileStatusText) elements.fileStatusText.textContent = 'AI Processing...';
        
        try {
            console.log('📤 Uploading file to API...');
            const formData = new FormData();
            formData.append('file', currentFile);
            
            console.log('🌐 Fetching:', API_BASE_URL + 'api/classify-voice');
            
            const response = await fetch(API_BASE_URL + 'api/classify-voice', {
                method: 'POST',
                body: formData,
                mode: 'cors'
            });
            
            console.log('📥 API Response status:', response.status);
            
            if (!response.ok) {
                throw new Error(`Server error ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ Analysis result received:', result);
            
            if (result.success) {
                showResults(result);
            } else {
                throw new Error(result.error || 'Analysis failed');
            }
            
        } catch (error) {
            console.error('❌ Analysis failed:', error);
            
            let errorMessage = 'Analysis failed: ';
            if (error.message.includes('Failed to fetch')) {
                errorMessage += 'Cannot connect to Flask server. Make sure it\'s running on http://127.0.0.1:5000/';
            } else {
                errorMessage += error.message;
            }
            
            alert('❌ ' + errorMessage);
            if (elements.fileStatusText) elements.fileStatusText.textContent = 'Analysis failed';
        } finally {
            if (elements.analyzeBtn) {
                elements.analyzeBtn.innerHTML = '<i class="bi bi-cpu me-2"></i>Analyze Voice Gender';
                elements.analyzeBtn.disabled = false;
            }
        }
    }
    
    // Show results - UPDATED WITH NULL CHECKS
    function showResults(result) {
        console.log('🎯 Displaying results...');
        
        if (elements.resultsSection) elements.resultsSection.style.display = 'block';
        if (elements.fileStatusText) elements.fileStatusText.textContent = 'Analysis complete';
        
        // Show gender result with null checks
        if (result.gender === 'male') {
            if (elements.genderResult) elements.genderResult.style.display = 'inline-block';
            if (elements.genderResultFemale) elements.genderResultFemale.style.display = 'none';
            if (elements.confidenceBar) elements.confidenceBar.className = 'confidence-fill confidence-male';
        } else {
            if (elements.genderResult) elements.genderResult.style.display = 'none';
            if (elements.genderResultFemale) elements.genderResultFemale.style.display = 'inline-block';
            if (elements.confidenceBar) elements.confidenceBar.className = 'confidence-fill confidence-female';
        }
        
        // Animate confidence bar
        setTimeout(() => {
            const confidencePercent = Math.round(result.confidence * 100);
            if (elements.confidenceBar) elements.confidenceBar.style.width = confidencePercent + '%';
            if (elements.confidenceValue) elements.confidenceValue.textContent = confidencePercent + '%';
        }, 100);
        
        console.log('✅ Results displayed successfully');
    }
    
    // Reset analysis - UPDATED WITH NULL CHECKS
    function resetAnalysis() {
        console.log('🔄 Resetting analysis...');
        
        if (elements.fileInput) elements.fileInput.value = '';
        currentFile = null;
        if (elements.fileInfo) elements.fileInfo.style.display = 'none';
        if (elements.audioPlayerContainer) elements.audioPlayerContainer.style.display = 'none';
        if (elements.analyzeBtn) elements.analyzeBtn.disabled = true;
        if (elements.resultsSection) elements.resultsSection.style.display = 'none';
        
        if (elements.genderResult) elements.genderResult.style.display = 'none';
        if (elements.genderResultFemale) elements.genderResultFemale.style.display = 'none';
        if (elements.confidenceBar) {
            elements.confidenceBar.style.width = '0%';
            elements.confidenceBar.className = 'confidence-fill';
        }
        if (elements.confidenceValue) elements.confidenceValue.textContent = '0%';
        
        if (elements.fileStatusText) elements.fileStatusText.textContent = 'No file selected';
        if (elements.fileDuration) elements.fileDuration.textContent = '--:--';
        
        // Reset downsampling
        resetDownsampling();
        
        // Clean up audio context
        if (audioContext) {
            audioContext.close().then(() => {
                audioContext = null;
            });
        }
        originalAudioBuffer = null;
        
        // Clean up URLs
        if (elements.originalAudio && elements.originalAudio.src.startsWith('blob:')) {
            URL.revokeObjectURL(elements.originalAudio.src);
            elements.originalAudio.src = '';
        }
    }
    
    // Initialize everything
    function initialize() {
        console.log('🚀 Initializing app...');
        setupEventListeners();
        resetAnalysis();
        console.log('✅ App initialized successfully');
    }
    
    // Start the app
    initialize();
});