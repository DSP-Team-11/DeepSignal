const API_BASE_URL = "http://127.0.0.1:5000/";
    
// AUDIO-FRIENDLY NAVIGATION BLOCKING
(function() {
    // Only prevent actual page navigation
    document.addEventListener('click', function(e) {
        const target = e.target;
        
        // ALLOW all audio, video, button, and control elements
        if (target.tagName === 'AUDIO' || 
            target.tagName === 'VIDEO' ||
            target.tagName === 'BUTTON' ||
            target.tagName === 'INPUT' ||
            target.type === 'button' ||
            target.type === 'submit' ||
            target.type === 'range' ||
            target.controls || // Any element with controls attribute
            target.closest('audio') ||
            target.closest('button') ||
            target.classList.contains('btn') ||
            target.classList.contains('audio-control')) {
            console.log('✅ Allowing click on interactive element:', target.tagName);
            return true; // Allow these clicks completely
        }
        
        // Only prevent actual navigation links
        if (target.tagName === 'A' || target.closest('a')) {
            const anchor = target.tagName === 'A' ? target : target.closest('a');
            const href = anchor.href;
            
            if (href && 
                !href.startsWith('javascript:') && 
                !href.startsWith('blob:') &&
                !href.includes('#') &&
                !anchor.hasAttribute('download')) {
                
                console.log('🚫 Navigation prevented:', href);
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
        }
        
        return true; // Allow all other clicks
    }, true);

    // Allow ALL form submissions
    document.addEventListener('submit', function(e) {
        console.log('✅ Form submission allowed');
        return true; // Don't prevent form submissions
    });

    // Keep page unload prevention (doesn't affect audio)
    window.addEventListener('beforeunload', function(e) {
        e.preventDefault();
        e.returnValue = '';
        return '';
    });

    // Prevent back/forward navigation
    history.pushState(null, null, window.location.href);
    window.addEventListener('popstate', function() {
        history.pushState(null, null, window.location.href);
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
let currentDownsampledFileUrl = null;
let currentFileId = null; // NEW: Track file ID for two-step process

// Wait for DOM to be fully loaded
document.addEventListener('DOMContentLoaded', function() {
    if (isInitialized) {
        console.log('⚠️ App already initialized, skipping...');
        return;
    }
    
    console.log('🚀 Voice Analysis App Starting...');
    isInitialized = true;
    
    // Get all elements - UPDATED FOR TWO-STEP PROCESS
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
        downloadDownsampledBtn: document.getElementById('downloadDownsampledBtn'),
        qualityInfo: document.getElementById('qualityInfo'),
        qualityWarnings: document.getElementById('qualityWarnings'),
        
        // NEW: Two-step VoiceFixer elements
        applyVoiceFixerBtn: document.getElementById('applyVoiceFixerBtn'), // NEW BUTTON
        voicefixerStatus: document.getElementById('voicefixerStatus'),
        restorationStatus: document.getElementById('restorationStatus'), // NEW: Show restoration state
        
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
                    const sampleRate = parseInt(this.value);
                    const nyquist = sampleRate / 2;
                    
                    let aliasWarning = "";
                    if (sampleRate < 4000) aliasWarning = ` (Nyquist: ${nyquist}Hz - EXTREME ALIASING)`;
                    else if (sampleRate < 8000) aliasWarning = ` (Nyquist: ${nyquist}Hz - Heavy Aliasing)`;
                    else if (sampleRate < 16000) aliasWarning = ` (Nyquist: ${nyquist}Hz - Clear Aliasing)`;
                    else if (sampleRate < 32000) aliasWarning = ` (Nyquist: ${nyquist}Hz - Some Aliasing)`;
                    
                    elements.sampleRateValue.textContent = sampleRate + ' Hz' + aliasWarning;
                }
            });
        }
        
        // Apply Downsampling (STEP 1 - Downsampling only)
        if (elements.applyDownsampling) {
            elements.applyDownsampling.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                applyDownsamplingStep1();
                return false;
            });
        }
        
        // NEW: Apply VoiceFixer (STEP 2 - Restoration only)
        if (elements.applyVoiceFixerBtn) {
            elements.applyVoiceFixerBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                applyVoiceFixerStep2();
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
        
        // Download Downsampled Audio
        if (elements.downloadDownsampledBtn) {
            elements.downloadDownsampledBtn.addEventListener('click', function(e) {
                e.preventDefault();
                e.stopPropagation();
                downloadDownsampledAudio();
                return false;
            });
        }
        
        console.log('✅ Event listeners setup complete');
        
        // Check VoiceFixer status on startup
        checkVoiceFixerStatus();
    }
    
    // NEW: Check VoiceFixer availability
    async function checkVoiceFixerStatus() {
        try {
            const response = await fetch(API_BASE_URL + 'api/audio-downsampling-status');
            if (response.ok) {
                const status = await response.json();
                if (elements.voicefixerStatus) {
                    if (status.voicefixer_available) {
                        elements.voicefixerStatus.innerHTML = '<span class="badge bg-success">VoiceFixer Available</span>';
                        if (elements.applyVoiceFixerBtn) elements.applyVoiceFixerBtn.disabled = false;
                    } else {
                        elements.voicefixerStatus.innerHTML = '<span class="badge bg-warning">VoiceFixer Not Available</span>';
                        if (elements.applyVoiceFixerBtn) elements.applyVoiceFixerBtn.disabled = true;
                    }
                }
            }
        } catch (error) {
            console.error('❌ Failed to check VoiceFixer status:', error);
        }
    }
    
    // Handle file selection - UPDATED WITH NULL CHECKS
    // In your handleFileSelect function, update the audio loading part:
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
    
    try {
        // Create audio preview - FIXED: Use different approach
        const objectUrl = URL.createObjectURL(file);
        console.log('🎵 Created object URL for preview:', objectUrl);
        
        if (elements.originalAudio) {
            // Clear previous source and set new one
            elements.originalAudio.src = '';
            elements.originalAudio.src = objectUrl;
            elements.originalAudio.load(); // Force reload
            
            // Add event listeners to track loading
            elements.originalAudio.onloadstart = () => console.log('🔊 Audio loading started');
            elements.originalAudio.oncanplay = () => console.log('🔊 Audio can play');
            elements.originalAudio.onerror = (e) => console.error('🔊 Audio error:', e);
        }
        
        if (elements.audioPlayerContainer) elements.audioPlayerContainer.style.display = 'block';
        
        // Wait for audio to load with better error handling
        await new Promise((resolve, reject) => {
            if (!elements.originalAudio) {
                reject(new Error('Audio element not found'));
                return;
            }
            
            const timeout = setTimeout(() => {
                console.log('⚠️ Audio load timeout, continuing anyway');
                resolve();
            }, 5000);
            
            elements.originalAudio.onloadedmetadata = function() {
                clearTimeout(timeout);
                const duration = elements.originalAudio.duration;
                const minutes = Math.floor(duration / 60);
                const seconds = Math.floor(duration % 60);
                if (elements.fileDuration) {
                    elements.fileDuration.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
                }
                console.log('✅ Audio metadata loaded, duration:', duration);
                resolve();
            };
            
            elements.originalAudio.onerror = (e) => {
                clearTimeout(timeout);
                console.error('🔊 Audio loading failed:', e);
                reject(new Error('Audio loading failed'));
            };
        });
        
        // Load audio for processing
        await loadAudioForProcessing(file);
        
        if (elements.fileStatusText) elements.fileStatusText.textContent = 'Ready for analysis';
        console.log('✅ File ready for analysis and downsampling');
        
    } catch (error) {
        console.error('❌ Error handling file:', error);
        if (elements.fileStatusText) elements.fileStatusText.textContent = 'Error loading file';
        alert('❌ Error loading audio file: ' + error.message);
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
    function drawWaveform(canvas, audioBuffer, isDownsampled = false, isRestored = false) {
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
        
        // Color code based on audio state
        let waveformColor = '#007bff'; // Blue for original
        if (isRestored) {
            waveformColor = '#28a745'; // Green for restored
        } else if (isDownsampled) {
            waveformColor = '#80d0c7'; // Teal for downsampled
        }
        
        // Color for aliasing severity
        const sampleRate = audioBuffer.sampleRate;
        if (sampleRate < 8000) {
            waveformColor = '#F44336'; // Red - heavy aliasing
        } else if (sampleRate < 16000) {
            waveformColor = '#FF9800'; // Orange - noticeable aliasing
        } else if (sampleRate < 32000) {
            waveformColor = '#4CAF50'; // Green - some aliasing
        }
        
        ctx.beginPath();
        ctx.moveTo(0, amp);
        
        for (let i = 0; i < width; i++) {
            const index = Math.min(Math.floor(i * step), data.length - 1);
            const value = data[index];
            ctx.lineTo(i, amp + value * amp * 0.8);
        }
        
        ctx.strokeStyle = waveformColor;
        ctx.lineWidth = isDownsampled || isRestored ? 2 : 1.5;
        ctx.stroke();
        
        // Add sample rate and state info
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        
        let stateText = '';
        if (isRestored) stateText = ' (Restored)';
        else if (isDownsampled) stateText = ' (Downsampled)';
        
        ctx.fillText(`${(sampleRate / 1000).toFixed(1)} kHz${stateText}`, 5, 15);
        
        // Add aliasing warning for low sample rates
        if (sampleRate < 16000 && !isRestored) {
            ctx.fillStyle = waveformColor;
            ctx.font = 'bold 10px Arial';
            ctx.fillText('ALIASING', width - 50, 15);
        }
        
        // Add restoration badge
        if (isRestored) {
            ctx.fillStyle = '#28a745';
            ctx.font = 'bold 10px Arial';
            ctx.fillText('RESTORED', width - 60, 15);
        }
    }
    
    // STEP 1: Apply downsampling only
    async function applyDownsamplingStep1() {
        if (!currentFile) {
            alert('❌ Please load an audio file first');
            return;
        }

        const targetSampleRate = parseInt(elements.downsampleSlider.value);
        
        // Show loading state
        if (elements.applyDownsampling) {
            elements.applyDownsampling.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Downsampling...';
            elements.applyDownsampling.disabled = true;
        }

        try {
            console.log(`🎵 Step 1: Downsampling to ${targetSampleRate}Hz`);
            
            const formData = new FormData();
            formData.append('audio', currentFile);
            formData.append('target_sr', targetSampleRate.toString());
            
            const response = await fetch(API_BASE_URL + 'api/downsample-audio', {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ Step 1 result:', result);
            
            if (result.success) {
                // Store file ID for step 2
                currentFileId = result.file_id;
                
                // Update UI with step 1 results
                updateDownsamplingStep1UI(result);
            } else {
                throw new Error(result.error || 'Downsampling failed');
            }
            
        } catch (error) {
            console.error('❌ Step 1 failed:', error);
            alert('❌ Downsampling failed: ' + error.message);
        } finally {
            if (elements.applyDownsampling) {
                elements.applyDownsampling.innerHTML = '<i class="bi bi-play-fill me-2"></i>Apply Downsampling';
                elements.applyDownsampling.disabled = false;
            }
        }
    }
    
    // STEP 2: Apply VoiceFixer restoration to downsampled audio
    async function applyVoiceFixerStep2() {
        if (!currentFileId) {
            alert('❌ Please apply downsampling first (Step 1)');
            return;
        }

        // Show loading state
        if (elements.applyVoiceFixerBtn) {
            elements.applyVoiceFixerBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Restoring...';
            elements.applyVoiceFixerBtn.disabled = true;
        }

        try {
            console.log('🎵 Step 2: Applying VoiceFixer restoration...');
            
            const response = await fetch(API_BASE_URL + 'api/apply-voicefixer', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    file_id: currentFileId
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || `Server error: ${response.status}`);
            }
            
            const result = await response.json();
            console.log('✅ Step 2 result:', result);
            
            if (result.success) {
                // Update UI with step 2 results
                updateVoiceFixerStep2UI(result);
            } else {
                throw new Error(result.error || 'VoiceFixer restoration failed');
            }
            
        } catch (error) {
            console.error('❌ Step 2 failed:', error);
            alert('❌ VoiceFixer restoration failed: ' + error.message);
        } finally {
            if (elements.applyVoiceFixerBtn) {
                elements.applyVoiceFixerBtn.innerHTML = '<i class="bi bi-magic me-2"></i>Apply VoiceFixer';
                elements.applyVoiceFixerBtn.disabled = false;
            }
        }
    }
    
// Update UI after Step 1 (Downsampling only) - FIXED to work like original audio
async function updateDownsamplingStep1UI(result) {
    // Store file path for download
    currentDownsampledFileUrl = result.file_path;
    
    // Update downsampled info
    if (elements.downsampledInfo) {
        elements.downsampledInfo.innerHTML = `
            <strong>Step 1 Complete: Downsampled to ${result.new_sample_rate} Hz</strong><br>
            <small class="text-muted">
                Original: ${result.original_sample_rate} Hz → 
                New: ${result.new_sample_rate} Hz 
                (Ratio: ${result.downsampling_ratio}x)<br>
                Nyquist: ${result.nyquist_frequency} Hz
            </small>
        `;
    }
    
    // Show quality assessment
    if (elements.qualityInfo && result.quality_assessment) {
        const quality = result.quality_assessment;
        elements.qualityInfo.innerHTML = `
            <div class="alert alert-${getQualityAlertClass(quality.quality_level)}">
                <strong>Quality: ${quality.quality_level}</strong><br>
                RMS Energy: ${quality.rms_energy.toFixed(4)}<br>
                Dynamic Range: ${quality.dynamic_range_db.toFixed(1)} dB
            </div>
        `;
    }
    
    // Show warnings
    if (elements.qualityWarnings && result.quality_assessment && result.quality_assessment.warnings.length > 0) {
        elements.qualityWarnings.innerHTML = result.quality_assessment.warnings
            .map(warning => `<div class="alert alert-warning">⚠️ ${warning}</div>`)
            .join('');
        elements.qualityWarnings.style.display = 'block';
    } else if (elements.qualityWarnings) {
        elements.qualityWarnings.style.display = 'none';
    }
    
    // FIXED: Load audio from server and create blob URL like the original audio
    if (elements.downsampledAudio) {
        try {
            const downloadUrl = `${API_BASE_URL}api/download-downsampled/${encodeURIComponent(result.file_path)}`;
            console.log('🎵 Downloading downsampled audio for preview:', downloadUrl);
            
            // Fetch the audio file from server
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to download audio: ${response.status}`);
            }
            
            // Convert to blob and create object URL (same as original audio)
            const audioBlob = await response.blob();
            const objectUrl = URL.createObjectURL(audioBlob);
            console.log('🎵 Created blob URL for downsampled audio:', objectUrl);
            
            // Set the audio source (same approach as original audio)
            elements.downsampledAudio.src = objectUrl;
            elements.downsampledAudio.load(); // Force reload
            
            // Add the same event listeners as original audio
            elements.downsampledAudio.onloadstart = () => console.log('🔊 Downsampled audio loading started');
            elements.downsampledAudio.oncanplay = () => console.log('🔊 Downsampled audio can play');
            elements.downsampledAudio.onerror = (e) => console.error('🔊 Downsampled audio error:', e);
            
        } catch (error) {
            console.error('❌ Failed to load downsampled audio:', error);
        }
    }
    
    // Show downsampled audio container
    if (elements.downsampledAudioContainer) elements.downsampledAudioContainer.style.display = 'block';
    if (elements.noDownsampledAudio) elements.noDownsampledAudio.style.display = 'none';
    
    // Enable download button
    if (elements.downloadDownsampledBtn) {
        elements.downloadDownsampledBtn.disabled = false;
    }
    
    // Enable VoiceFixer button for step 2
    if (elements.applyVoiceFixerBtn) {
        elements.applyVoiceFixerBtn.disabled = false;
    }
    
    // Show restoration status
    if (elements.restorationStatus) {
        elements.restorationStatus.innerHTML = `
            <div class="alert alert-info">
                <strong>Step 1 Complete</strong><br>
                Audio has been downsampled. You can now apply VoiceFixer restoration to improve quality.
            </div>
        `;
    }
    
    // Draw waveform from backend data if available
    if (result.waveform_data && elements.downsampledWaveform) {
        drawWaveformFromData(elements.downsampledWaveform, result.waveform_data, true, false);
    }
    
    console.log('✅ Step 1 UI updated - ready for VoiceFixer');
}

// Update UI after Step 2 (VoiceFixer restoration) - FIXED to work like original audio
async function updateVoiceFixerStep2UI(result) {
    // Update file path for download
    currentDownsampledFileUrl = result.file_path;
    
    // Update downsampled info with restoration status
    if (elements.downsampledInfo) {
        elements.downsampledInfo.innerHTML = `
            <strong>Step 2 Complete: VoiceFixer Restoration Applied</strong><br>
            <small class="text-muted">
                Sample Rate: ${result.sample_rate} Hz<br>
                Duration: ${result.audio_duration.toFixed(2)}s
            </small>
        `;
    }
    
    // Show restoration success message
    if (elements.qualityInfo) {
        elements.qualityInfo.innerHTML = `
            <div class="alert alert-success">
                <strong>✅ VoiceFixer Restoration Complete</strong><br>
                Audio quality has been enhanced using AI restoration
            </div>
        `;
    }
    
    // Clear warnings (restoration should fix them)
    if (elements.qualityWarnings) {
        elements.qualityWarnings.innerHTML = '';
        elements.qualityWarnings.style.display = 'none';
    }
    
    // FIXED: Load restored audio from server and create blob URL like the original audio
    if (elements.downsampledAudio) {
        try {
            const downloadUrl = `${API_BASE_URL}api/download-downsampled/${encodeURIComponent(result.file_path)}`;
            console.log('🎵 Downloading restored audio for preview:', downloadUrl);
            
            // Fetch the audio file from server
            const response = await fetch(downloadUrl);
            if (!response.ok) {
                throw new Error(`Failed to download audio: ${response.status}`);
            }
            
            // Convert to blob and create object URL (same as original audio)
            const audioBlob = await response.blob();
            const objectUrl = URL.createObjectURL(audioBlob);
            console.log('🎵 Created blob URL for restored audio:', objectUrl);
            
            // Set the audio source (same approach as original audio)
            elements.downsampledAudio.src = objectUrl;
            elements.downsampledAudio.load(); // Force reload
            
            // Add the same event listeners as original audio
            elements.downsampledAudio.onloadstart = () => console.log('🔊 Restored audio loading started');
            elements.downsampledAudio.oncanplay = () => console.log('🔊 Restored audio can play');
            elements.downsampledAudio.onerror = (e) => console.error('🔊 Restored audio error:', e);
            
        } catch (error) {
            console.error('❌ Failed to load restored audio:', error);
        }
    }
    
    // Update restoration status
    if (elements.restorationStatus) {
        elements.restorationStatus.innerHTML = `
            <div class="alert alert-success">
                <strong>Step 2 Complete</strong><br>
                VoiceFixer restoration has been applied. Compare the audio quality with the downsampled version.
            </div>
        `;
    }
    
    // Disable VoiceFixer button (already applied)
    if (elements.applyVoiceFixerBtn) {
        elements.applyVoiceFixerBtn.disabled = true;
        elements.applyVoiceFixerBtn.innerHTML = '<i class="bi bi-check me-2"></i>VoiceFixer Applied';
    }
    
    // Draw waveform from backend data if available
    if (result.waveform_data && elements.downsampledWaveform) {
        drawWaveformFromData(elements.downsampledWaveform, result.waveform_data, true, true);
    }
    
    console.log('✅ Step 2 UI updated - restoration complete');
}
    
    // Draw waveform from backend data
    function drawWaveformFromData(canvas, waveformData, isDownsampled = false, isRestored = false) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        
        // Clear canvas
        ctx.clearRect(0, 0, width, height);
        
        // Draw background
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, width, height);
        
        const samples = waveformData.samples;
        const amp = height / 2;
        
        // Color based on state
        let waveformColor = isRestored ? '#28a745' : '#80d0c7'; // Green for restored, teal for downsampled
        
        ctx.beginPath();
        ctx.moveTo(0, amp);
        
        for (let i = 0; i < width; i++) {
            const index = Math.floor(i * samples.length / width);
            const value = samples[index] || 0;
            ctx.lineTo(i, amp + value * amp * 0.8);
        }
        
        ctx.strokeStyle = waveformColor;
        ctx.lineWidth = 2;
        ctx.stroke();
        
        // Add sample rate and state info
        ctx.fillStyle = '#666';
        ctx.font = '10px Arial';
        
        let stateText = isRestored ? ' (Restored)' : ' (Downsampled)';
        ctx.fillText(`${(waveformData.sample_rate / 1000).toFixed(1)} kHz${stateText}`, 5, 15);
        
        // Add restoration badge
        if (isRestored) {
            ctx.fillStyle = '#28a745';
            ctx.font = 'bold 10px Arial';
            ctx.fillText('RESTORED', width - 60, 15);
        }
    }
    
    // Download downsampled audio from backend
    async function downloadDownsampledAudio() {
        if (!currentDownsampledFileUrl) {
            alert('❌ No processed audio available');
            return;
        }
        
        try {
            console.log('📥 Downloading processed audio...');
            
            // Extract filename from the file path
            const fileName = `processed_audio_${Date.now()}.wav`;
            const downloadUrl = `${API_BASE_URL}api/download-downsampled/${encodeURIComponent(currentDownsampledFileUrl)}`;
            
            // Create temporary link for download
            const link = document.createElement('a');
            link.href = downloadUrl;
            link.download = fileName;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            
            console.log('✅ Download initiated');
            
        } catch (error) {
            console.error('❌ Download failed:', error);
            alert('❌ Download failed: ' + error.message);
        }
    }
    
    // Helper function for quality alert classes
    function getQualityAlertClass(qualityLevel) {
        switch (qualityLevel.toLowerCase()) {
            case 'very low': return 'danger';
            case 'low': return 'warning';
            case 'medium': return 'info';
            case 'good': return 'success';
            case 'high': return 'success';
            default: return 'info';
        }
    }

    // Update the slider for proper downsampling range
    if (elements.downsampleSlider) {
        // Extended range for extreme downsampling with VoiceFixer
        elements.downsampleSlider.min = 1000;   // Very low - extreme aliasing
        elements.downsampleSlider.max = 48000;  // Maximum for high quality
        elements.downsampleSlider.value = 8000; // Default to noticeable aliasing
        elements.downsampleSlider.step = 1000;
        
        // Set initial value display
        if (elements.sampleRateValue) {
            elements.sampleRateValue.textContent = '8000 Hz (Nyquist: 4000Hz - Clear Aliasing)';
        }
    }
    
    // Reset downsampling
    function resetDownsampling() {
        if (elements.downsampledAudioContainer) elements.downsampledAudioContainer.style.display = 'none';
        if (elements.noDownsampledAudio) elements.noDownsampledAudio.style.display = 'block';
        if (elements.downsampleSlider) elements.downsampleSlider.value = 8000;
        if (elements.sampleRateValue) elements.sampleRateValue.textContent = '8000 Hz (Nyquist: 4000Hz - Clear Aliasing)';
        
        // Clear downsampled waveform
        if (elements.downsampledWaveform) {
            const ctx = elements.downsampledWaveform.getContext('2d');
            ctx.clearRect(0, 0, elements.downsampledWaveform.width, elements.downsampledWaveform.height);
            ctx.fillStyle = '#f8f9fa';
            ctx.fillRect(0, 0, elements.downsampledWaveform.width, elements.downsampledWaveform.height);
        }
        
        // Clear audio source
        if (elements.downsampledAudio) {
            elements.downsampledAudio.src = '';
        }
        
        // Reset backend file references
        currentDownsampledFileUrl = null;
        currentFileId = null;
        
        // Disable download button
        if (elements.downloadDownsampledBtn) {
            elements.downloadDownsampledBtn.disabled = true;
        }
        
        // Disable VoiceFixer button
        if (elements.applyVoiceFixerBtn) {
            elements.applyVoiceFixerBtn.disabled = true;
            elements.applyVoiceFixerBtn.innerHTML = '<i class="bi bi-magic me-2"></i>Apply VoiceFixer';
        }
        
        // Clear quality info
        if (elements.qualityInfo) elements.qualityInfo.innerHTML = '';
        if (elements.qualityWarnings) {
            elements.qualityWarnings.innerHTML = '';
            elements.qualityWarnings.style.display = 'none';
        }
        
        // Clear restoration status
        if (elements.restorationStatus) {
            elements.restorationStatus.innerHTML = '';
        }
        
        downsampledAudioBuffer = null;
        
        console.log('✅ Downsampling reset');
    }
    
    // ... rest of your existing functions (analyzeAudio, showResults, resetAnalysis, initialize) remain the same ...
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