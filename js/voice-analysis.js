const API_BASE_URL = "http://127.0.0.1:5000/"; // Use same origin as the page

document.addEventListener('DOMContentLoaded', function() {
    const uploadArea = document.getElementById('uploadArea');
    const fileInput = document.getElementById('fileInput');
    const selectFileBtn = document.getElementById('selectFileBtn');
    const fileInfo = document.getElementById('fileInfo');
    const fileName = document.getElementById('fileName');
    const removeFile = document.getElementById('removeFile');
    const analyzeBtn = document.getElementById('analyzeBtn');
    const resultsSection = document.getElementById('resultsSection');
    const originalAudio = document.getElementById('originalAudio');
    const audioPlayerContainer = document.getElementById('audioPlayerContainer');
    const modelStatus = document.getElementById('modelStatus');
    const nextStepBtn = document.getElementById('nextStepBtn');
    const resetAnalysisBtn = document.getElementById('resetAnalysis');
    
    // Add these elements if they don't exist in your HTML
    const fileStatus = document.getElementById('fileStatus') || { textContent: '' };
    const fileDuration = document.getElementById('fileDuration') || { textContent: '' };
    const genderResult = document.getElementById('genderResult');
    const genderResultFemale = document.getElementById('genderResultFemale');
    const confidenceBar = document.getElementById('confidenceBar');
    const confidenceValue = document.getElementById('confidenceValue');
    const audioFeatures = document.getElementById('audioFeatures');

    // Check model status
    async function checkModelStatus() {
        try {
            const response = await fetch(`${API_BASE_URL}/api/voice-model-status`);
            if (response.ok) {
                const data = await response.json();
                if (data.model_loaded) {
                    modelStatus.textContent = "ECAPA-TDNN Model loaded successfully ✓";
                    modelStatus.parentElement.classList.add('bg-success', 'text-white');
                } else {
                    modelStatus.textContent = "Model not loaded";
                    modelStatus.parentElement.classList.add('bg-warning', 'text-dark');
                }
            } else {
                throw new Error('API not responding');
            }
        } catch (error) {
            modelStatus.textContent = "Connection failed - check backend";
            modelStatus.parentElement.classList.add('bg-danger', 'text-white');
        }
    }
    
    // Classify voice using backend API
    async function classifyVoiceWithAPI(audioFile) {
        const formData = new FormData();
        formData.append('file', audioFile);
        
        try {
            const response = await fetch(`${API_BASE_URL}/api/classify-voice`, {
                method: 'POST',
                body: formData
            });
            
            if (!response.ok) {
                const errorText = await response.text();
                throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
            }
            
            const result = await response.json();
            
            if (result.success) {
                return result;
            } else {
                throw new Error(result.error || 'Classification failed');
            }
            
        } catch (error) {
            console.error('API call failed:', error);
            throw error;
        }
    }
    
    // Upload area click event
    uploadArea.addEventListener('click', function(e) {
        if (e.target !== selectFileBtn) {
            fileInput.click();
        }
    });
    
    // Select file button click event
    selectFileBtn.addEventListener('click', function(e) {
        e.stopPropagation();
        fileInput.click();
    });
    
    // File input change event
    fileInput.addEventListener('change', async function() {
        if (fileInput.files.length > 0) {
            const file = fileInput.files[0];
            fileName.textContent = file.name;
            fileInfo.style.display = 'block';
            analyzeBtn.disabled = false;
            
            // Create object URL for the audio file
            const objectUrl = URL.createObjectURL(file);
            originalAudio.src = objectUrl;
            audioPlayerContainer.style.display = 'block';
            
            // Update file status
            if (fileStatus) fileStatus.textContent = 'Ready for analysis';
            
            // Set up audio duration display
            originalAudio.addEventListener('loadedmetadata', function() {
                const duration = originalAudio.duration;
                const minutes = Math.floor(duration / 60);
                const seconds = Math.floor(duration % 60);
                if (fileDuration) fileDuration.textContent = 
                    `${minutes}:${seconds.toString().padStart(2, '0')}`;
            });
        }
    });
    
    // Remove file event
    removeFile.addEventListener('click', function() {
        resetAnalysis();
    });
    
    // Analyze button event
    analyzeBtn.addEventListener('click', async function() {
        if (!fileInput.files.length) return;
        
        const file = fileInput.files[0];
        
        // Show loading state
        const originalText = analyzeBtn.innerHTML;
        analyzeBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>AI Analyzing...';
        analyzeBtn.disabled = true;
        if (fileStatus) fileStatus.textContent = 'Processing with AI...';
        modelStatus.textContent = "Running classification...";
        
        try {
            // Classify gender using API
            const result = await classifyVoiceWithAPI(file);
            
            // Display results
            showResults(result);
            
        } catch (error) {
            console.error('Analysis error:', error);
            if (fileStatus) fileStatus.textContent = 'Analysis failed';
            modelStatus.textContent = `Error: ${error.message}`;
            modelStatus.parentElement.classList.add('bg-danger', 'text-white');
            
            // Show error to user
            if (audioFeatures) {
                audioFeatures.innerHTML = `<div class="alert alert-danger" role="alert">
                    <strong>Error:</strong> ${error.message}
                </div>`;
            }
        } finally {
            analyzeBtn.innerHTML = originalText;
            analyzeBtn.disabled = false;
        }
    });
    
    // Show classification results
    function showResults(result) {
        if (!resultsSection) return;
        
        resultsSection.style.display = 'block';
        if (fileStatus) fileStatus.textContent = 'Analysis complete';
        modelStatus.textContent = "Classification complete ✓";
        modelStatus.parentElement.classList.add('bg-success', 'text-white');
        
        // Display gender result
        if (genderResult && genderResultFemale) {
            if (result.gender === 'male') {
                genderResult.style.display = 'inline-block';
                genderResultFemale.style.display = 'none';
                if (confidenceBar) confidenceBar.className = 'confidence-fill confidence-male';
            } else {
                genderResult.style.display = 'none';
                genderResultFemale.style.display = 'inline-block';
                if (confidenceBar) confidenceBar.className = 'confidence-fill confidence-female';
            }
        }
        
        // Animate confidence bar
        setTimeout(() => {
            if (confidenceBar) {
                const confidencePercent = Math.round(result.confidence * 100);
                confidenceBar.style.width = confidencePercent + '%';
            }
            if (confidenceValue) {
                confidenceValue.textContent = Math.round(result.confidence * 100) + '%';
            }
        }, 100);
        
        // Display audio features - FIXED: Use correct backend response structure
        if (audioFeatures) {
            audioFeatures.innerHTML = `
                <p><strong>Gender:</strong> ${result.gender}</p>
                <p><strong>Confidence:</strong> ${(result.confidence * 100).toFixed(1)}%</p>
                <p><strong>Probability Male:</strong> ${(result.probabilities.male * 100).toFixed(1)}%</p>
                <p><strong>Probability Female:</strong> ${(result.probabilities.female * 100).toFixed(1)}%</p>
                ${result.audio_info ? `
                    <p><strong>Duration:</strong> ${result.audio_info.duration} seconds</p>
                    <p><strong>Sample Rate:</strong> ${result.audio_info.sample_rate} Hz</p>
                ` : ''}
                ${result.model_info ? `
                    <p><strong>Model:</strong> ${result.model_info.model_type}</p>
                ` : ''}
            `;
        }
        
        // Enable next step button
        if (nextStepBtn) nextStepBtn.disabled = false;
    }
    
    // Reset analysis
    function resetAnalysis() {
        fileInput.value = '';
        if (fileInfo) fileInfo.style.display = 'none';
        if (audioPlayerContainer) audioPlayerContainer.style.display = 'none';
        analyzeBtn.disabled = true;
        if (resultsSection) resultsSection.style.display = 'none';
        
        // Reset results
        if (genderResult) genderResult.style.display = 'none';
        if (genderResultFemale) genderResultFemale.style.display = 'none';
        if (confidenceBar) {
            confidenceBar.style.width = '0%';
            confidenceBar.className = 'confidence-fill';
        }
        if (confidenceValue) confidenceValue.textContent = '0%';
        if (audioFeatures) {
            audioFeatures.innerHTML = '<p class="text-muted">AI analysis in progress...</p>';
        }
        if (nextStepBtn) nextStepBtn.disabled = true;
        
        if (fileStatus) fileStatus.textContent = 'No file selected';
        if (fileDuration) fileDuration.textContent = '--:--';
        modelStatus.textContent = "Ready for analysis";
        modelStatus.parentElement.className = 'p-3 bg-light rounded';
    }
    
    // Next step button
    if (nextStepBtn) {
        nextStepBtn.addEventListener('click', function() {
            alert("Next step: Downsampling and aliasing analysis - This will be implemented in Step 2");
        });
    }
    
    if (resetAnalysisBtn) {
        resetAnalysisBtn.addEventListener('click', resetAnalysis);
    }
    
    // Initialize the application
    async function init() {
        await checkModelStatus();
        resetAnalysis();
    }
    
    init();
});