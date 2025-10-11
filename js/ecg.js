// ecg.js — Complete frontend for ECG viewer (Standard / XOR / Polar / Recurrence)

// ------------------------------
// Configuration / constants
// ------------------------------
const API_ANALYZE = "http://127.0.0.1:5000/api/analyze_ecg"; // backend endpoint
const EXPECTED_LEADS = ["I","II","III","AVR","AVL","AVF","V1","V2","V3","V4","V5","V6"];

document.addEventListener("DOMContentLoaded", () => {
  // ========== UI references ==========
  const uploadBtn = document.getElementById("upload-btn");
  const uploadInput = document.getElementById("signal-upload");
  const uploadStatus = document.getElementById("upload-status");
  const analyzeBtn = document.getElementById("analyze-btn");
  const signalCanvas = document.getElementById("signal-canvas");
  const channelList = document.getElementById("channel-list");
  const viewerOptions = Array.from(document.querySelectorAll(".viewer-option"));
  const backBtn = document.getElementById("back-to-selection");

  // ========== App state ==========
  let uploadedFile = null;
  let rawMatrix = null;      // [nSamples][12] numeric matrix (reordered to EXPECTED_LEADS)
  let headers = [];          // column headers, uppercase
  let sr = 250;              // sampling rate (Hz) — default / may be estimated
  let selectedViewer = "standard";
  let currentLayout = "";    // Track current layout mode

  // Visualization params (user adjustable in control panel injected below)
  let viewportSeconds = 5;
  let speedMultiplier = 1.0;
  let chunkSeconds = 5;
  let polarMode = "latest";       // 'latest' | 'cumulative'
  let recurrenceMode = "scatter"; // 'scatter' | 'heatmap'
  let colormap = "viridis";
  let samplesPerPixel = 1;        // zoom
  let play = false;

  // Canvas runtime state
  let canvas = null;
  let ctx = null;
  let globalPointer = 0;   // left-most sample index of viewport
  let animationHandle = null;
  let prevChunk = null;    // for XOR comparison
  let polarTraces = [];    // for cumulative polar
  let recurrenceAccum = null; // for recurrence heatmap

  // --------------------------
  // Build channel checkboxes
  // --------------------------
  function renderChannelCheckboxes() {
    channelList.innerHTML = "";
    // Quick layout selector
    const quickDiv = document.createElement("div");
    quickDiv.className = "mb-2";
    quickDiv.innerHTML = `
      <label class="form-label">Quick Layout</label>
      <select id="quick-layout" class="form-select mb-2">
        <option value="">Choose layout</option>
        <option value="single">Single (pick below)</option>
        <option value="main3">Main 3 (I, II, III)</option>
        <option value="lead12">12 Leads</option>
      </select>
    `;
    channelList.appendChild(quickDiv);
    channelList.querySelector("#quick-layout").addEventListener("change", (e) => applyQuickLayout(e.target.value));

    EXPECTED_LEADS.forEach(lead => {
      // display aVR/aVL/aVF as conventional lowercase 'a'
      const display = (lead.startsWith("AV") ? "a" + lead.substring(1) : lead);
      const div = document.createElement("div");
      div.className = "form-check";
      div.innerHTML = `
        <input class="form-check-input lead-checkbox" type="checkbox" value="${lead}" id="lead-${lead}">
        <label class="form-check-label" for="lead-${lead}">${display}</label>
      `;
      channelList.appendChild(div);
    });

    // Add event listeners to checkboxes
    setupCheckboxListeners();
  }

  function setupCheckboxListeners() {
    const checkboxes = document.querySelectorAll('.lead-checkbox');
    checkboxes.forEach(checkbox => {
      checkbox.addEventListener('change', function() {
        handleCheckboxChange(this);
      });
    });
  }

  function handleCheckboxChange(changedCheckbox) {
    if (currentLayout === 'single' && changedCheckbox.checked) {
      // If in single mode and this checkbox was checked, uncheck all others
      const allCheckboxes = document.querySelectorAll('.lead-checkbox');
      allCheckboxes.forEach(checkbox => {
        if (checkbox !== changedCheckbox) {
          checkbox.checked = false;
        }
      });
    }
    else if (currentLayout === 'main3' && changedCheckbox.checked) {
      // If in main3 mode, ensure only I, II, III can be selected
      const allowedLeads = ["I", "II", "III"];
      const allCheckboxes = document.querySelectorAll('.lead-checkbox');
      
      // Uncheck any non-allowed leads that might be checked
      allCheckboxes.forEach(checkbox => {
        if (!allowedLeads.includes(checkbox.value) && checkbox.checked) {
          checkbox.checked = false;
        }
      });
      
      // If more than 3 leads are checked, uncheck the changed one
      const checkedCount = Array.from(allCheckboxes).filter(cb => cb.checked).length;
      if (checkedCount > 3) {
        changedCheckbox.checked = false;
      }
    }
    else if (currentLayout === 'lead12' && changedCheckbox.checked) {
      // If in lead12 mode, all leads should be selected automatically
      // This prevents manual deselection in lead12 mode
      const allCheckboxes = document.querySelectorAll('.lead-checkbox');
      allCheckboxes.forEach(checkbox => {
        checkbox.checked = true;
      });
    }
  }

  function applyQuickLayout(mode) {
    const checks = Array.from(document.querySelectorAll(".lead-checkbox"));
    
    // Update current layout state
    currentLayout = mode;
    
    // First, uncheck ALL checkboxes when changing layouts
    checks.forEach(c => c.checked = false);
    
    if (mode === "single") {
      // For single mode, leave all unchecked - user will select one
      // No automatic selection
    } 
    else if (mode === "main3") {
      // Auto-select only I, II, III and prevent others
      ["I","II","III"].forEach(L => { 
        const el = document.getElementById(`lead-${L}`); 
        if (el) el.checked = true; 
      });
    } 
    else if (mode === "lead12") {
      // Auto-select all 12 leads
      EXPECTED_LEADS.forEach(L => { 
        const el = document.getElementById(`lead-${L}`); 
        if (el) el.checked = true; 
      });
    }
    // For "Choose layout" or empty, leave all unchecked
  }

  renderChannelCheckboxes();

  // --------------------------
  // Inject controls into panel
  // --------------------------
  const controlPanel = document.querySelector(".control-panel");
  const controlsHTML = document.createElement("div");
  controlsHTML.innerHTML = `
    <hr>
    <label class="form-label">Viewport (seconds)</label>
    <input id="viewport-seconds" class="form-control mb-2" type="number" value="${viewportSeconds}" min="1" step="1">
    <label class="form-label">Playback Speed (multiplier)</label>
    <input id="speed-mult" class="form-range mb-2" type="range" min="0.25" max="4" step="0.25" value="${speedMultiplier}">
    <label class="form-label">Chunk width (seconds) — XOR / Recurrence</label>
    <input id="chunk-seconds" class="form-control mb-2" type="number" value="${chunkSeconds}" min="0.5" step="0.5">
    <label class="form-label">Polar mode</label>
    <select id="polar-mode" class="form-select mb-2"><option value="latest">Latest only</option><option value="cumulative">Cumulative</option></select>
    <label class="form-label">Recurrence mode</label>
    <select id="recurrence-mode" class="form-select mb-2"><option value="scatter">Cumulative scatter</option><option value="heatmap">Heatmap (2D intensity)</option></select>
    <label class="form-label">Colormap (heatmap)</label>
    <select id="colormap" class="form-select mb-2"><option value="viridis">Viridis</option><option value="hot">Hot</option><option value="jet">Jet</option><option value="gray">Gray</option></select>
    <label class="form-label">Zoom (samples per pixel)</label>
    <input id="zoom-spp" class="form-control mb-2" type="number" value="${samplesPerPixel}" min="1" max="10" step="1">
    <div class="d-flex gap-2">
      <button id="play-pause" class="btn btn-primary">Pause</button>
      <button id="step-forward" class="btn btn-outline-secondary">Step</button>
      <button id="reset-plot" class="btn btn-outline-secondary">Reset</button>
    </div>
  `;
  controlPanel.appendChild(controlsHTML);

  // control refs
  const viewportInput = document.getElementById("viewport-seconds");
  const speedInput = document.getElementById("speed-mult");
  const chunkInput = document.getElementById("chunk-seconds");
  const polarModeSelect = document.getElementById("polar-mode");
  const recurrenceModeSelect = document.getElementById("recurrence-mode");
  const colormapSelect = document.getElementById("colormap");
  const zoomInput = document.getElementById("zoom-spp");
  const playPauseBtn = document.getElementById("play-pause");
  const stepBtn = document.getElementById("step-forward");
  const resetBtn = document.getElementById("reset-plot");

  // --------------------------
  // Viewer selection handling
  // --------------------------
  viewerOptions.forEach(opt => {
    opt.addEventListener("click", () => {
      viewerOptions.forEach(o => o.classList.remove("active"));
      opt.classList.add("active");
      selectedViewer = opt.dataset.viewer;
      resetPlotState();
      enforceLeadSelectionRules();
    });
  });

  function enforceLeadSelectionRules() {
    const checks = Array.from(document.querySelectorAll(".lead-checkbox"));
    checks.forEach(cb => cb.disabled = false);
    // we just guide user; validation occurs on analyze click
  }

  // --------------------------
  // Upload events
  // --------------------------
  uploadBtn.addEventListener("click", () => uploadInput.click());
  uploadInput.addEventListener("change", () => {
    if (uploadInput.files.length > 0) {
      uploadedFile = uploadInput.files[0];
      uploadStatus.innerHTML = `<span class="text-success">File loaded: ${uploadedFile.name}</span>`;
    }
  });

  // --------------------------
  // Analyze button (main flow) - BOTH REAL-TIME AND DETECTION ENABLED BY DEFAULT
  // --------------------------
  analyzeBtn.addEventListener("click", async () => {
    if (!uploadedFile) { alert("Please upload a CSV first"); return; }

    // selected leads for plotting
    const selected = Array.from(document.querySelectorAll(".lead-checkbox:checked")).map(cb => cb.value);

    // Validate according to viewer
    if (selectedViewer === "xor" || selectedViewer === "polar") {
      if (selected.length !== 1) { alert("Please select exactly 1 lead for XOR/Polar."); return; }
    } else if (selectedViewer === "recurrence") {
      if (selected.length !== 2) { alert("Please select exactly 2 leads for Recurrence."); return; }
    } else if (selectedViewer === "standard") {
      if (selected.length === 0) { alert("Please select at least one lead for Standard view."); return; }
    }

    // Create canvas area + analysis result area
    signalCanvas.innerHTML = `
      <div id="analysis-result" class="mb-2">
        <div class="p-2 border rounded bg-light">
          <div class="spinner-border spinner-border-sm text-primary me-2" role="status"></div>
          <strong>Running abnormality detection...</strong>
        </div>
      </div>
      <div style="border:1px solid #eee; padding:8px;">
        <canvas id="ecg-canvas" width="900" height="500" style="display:block; width:100%; height:auto;"></canvas>
      </div>
    `;
    canvas = document.getElementById("ecg-canvas");
    ctx = canvas.getContext("2d");

    // Parse CSV (non-blocking heavy parse but OK for moderate files)
    try {
      await parseCSVIntoMatrix(uploadedFile);
    } catch (err) {
      signalCanvas.innerHTML = `<div class="text-danger p-2">CSV parse failed: ${err.message}</div>`;
      return;
    }

    // Reset runtime state
    globalPointer = 0;
    prevChunk = null;
    polarTraces = [];
    recurrenceAccum = null;

    // Draw the first frame (static snapshot)
    drawAxesCommon();
    drawFrame();

    // BOTH FEATURES ENABLED BY DEFAULT:
    // 1. Start real-time monitoring immediately
    startPlay();
    
    // 2. Run abnormality detection in background
    analyzeFileOnServer(uploadedFile).then(result => {
      console.log("Detection completed:", result);
    }).catch(err => {
      console.error("Detection failed:", err);
    });
  });

  // --------------------------
  // Parse CSV -> rawMatrix/headers (reorders to EXPECTED_LEADS)
  // - supports header row or headerless numeric CSV
  // - accepts comma/semicolon/tab separators
  // --------------------------
  async function parseCSVIntoMatrix(file) {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
    if (lines.length === 0) throw new Error("File is empty");

    // detect separator by first line containing comma/semicolon/tab
    const sep = (lines[0].includes(";") ? ";" : (lines[0].includes("\t") ? "\t" : ","));
    // first row tokens
    const firstTokens = lines[0].split(sep).map(t => t.trim());
    // if first row contains any non-numeric token -> header exists
    const numericFirst = firstTokens.every(t => t !== "" && !isNaN(Number(t)));
    if (!numericFirst) {
      // header present
      headers = firstTokens.map(h => h.toUpperCase().replace(/\s+/g,""));
      rawMatrix = lines.slice(1).map(l => l.split(sep).map(s => {
        const v = s.trim();
        return v === "" ? 0.0 : Number(v);
      }));
    } else {
      // no header -> create generic headers and parse all lines
      const row0 = lines[0].split(sep).map(s => Number(s));
      const ncols = row0.length;
      headers = EXPECTED_LEADS.slice(0, ncols).map(h => h.toUpperCase());
      rawMatrix = lines.map(l => l.split(sep).map(s => {
        const v = s.trim();
        return v === "" ? 0.0 : Number(v);
      }));
    }

    // Normalize: reorder to EXPECTED_LEADS; keep 12 columns
    // If file has any of the EXPECTED_LEADS as headers, we'll reorder by EXPECTED_LEADS and fill missing with zeros.
    const hasExpected = headers.some(h => EXPECTED_LEADS.includes(h));
    if (hasExpected) {
      const matrix = rawMatrix.map(row => {
        const out = [];
        for (let i = 0; i < EXPECTED_LEADS.length; ++i) {
          const idx = headers.indexOf(EXPECTED_LEADS[i]);
          out.push(idx >= 0 ? (row[idx] || 0) : 0.0);
        }
        return out;
      });
      rawMatrix = matrix;
      headers = EXPECTED_LEADS.slice();
    } else {
      // no expected lead names — if fewer than 12 columns pad, if more truncate
      if (rawMatrix[0].length < 12) {
        const missing = 12 - rawMatrix[0].length;
        rawMatrix.forEach(r => { for (let i=0;i<missing;i++) r.push(0.0); });
        while (headers.length < 12) headers.push(`L${headers.length+1}`);
      } else if (rawMatrix[0].length > 12) {
        rawMatrix = rawMatrix.map(r => r.slice(0,12));
        headers = headers.slice(0,12);
      }
      // ensure headers uppercase
      headers = headers.map(h => h.toUpperCase());
    }

    // If only 1 channel in input we already padded to 12 — keep sr default
    // Optionally estimate sampling rate if there is a TIME column
    const timeIdx = headers.findIndex(h => h.includes("TIME"));
    if (timeIdx >= 0) {
      const tvals = rawMatrix.map(r => Number(r[timeIdx] || 0)).filter(v => !isNaN(v));
      if (tvals.length > 2) {
        const diffs = [];
        for (let i=1;i<tvals.length;i++) diffs.push(tvals[i] - tvals[i-1]);
        const median = diffs.sort((a,b)=>a-b)[Math.floor(diffs.length/2)] || (1/250);
        if (median > 0) sr = Math.round(1.0 / median);
      }
    }
    // final safety checks
    if (!rawMatrix || rawMatrix.length === 0) throw new Error("Parsed CSV produced no numeric rows");
  }

  // --------------------------
  // Analyze (POST) to backend (returns promise)
  // - Shows friendly error message for NetworkError and hints to run backend and open page through server.
  // - Shows both full name and acronym for abnormalities.
  // --------------------------
  async function analyzeFileOnServer(file) {
    const analysisDiv = document.getElementById("analysis-result");
    const form = new FormData(); 
    form.append("file", file);
    
    // Abbreviation mapping
    const abnormalityNames = {
      "1dAVB": "1° Atrioventricular Block (1dAVB)",
      "LBBB": "Left Bundle Branch Block (LBBB)",
      "SB": "Sinus Bradycardia (SB)",
      "ST": "Sinus Tachycardia (ST)",
      "AF": "Atrial Flutter (AF)",
      "RBBB": "Right Bundle Branch Block (RBBB)",
      "Normal": "Normal ECG"
    };

    try {
      console.log("Sending request to backend...");
      const resp = await fetch(API_ANALYZE, { 
        method: "POST", 
        body: form,
        // Add headers to help with CORS if needed
        headers: {
          'Accept': 'application/json',
        }
      });
      
      if (!resp.ok) {
        throw new Error(`Server returned ${resp.status}: ${resp.statusText}`);
      }
      
      const json = await resp.json();
      console.log("Backend response:", json);
      
      // Get the display name with acronym
      const displayName = abnormalityNames[json.best_class] || json.best_class;
      const statusText = json.normal_abnormal === "Normal" ? 
        `<span class="text-success">Normal ✅</span>` : 
        `<span class="text-danger">Abnormal ⚠</span>`;
      
      analysisDiv.innerHTML = `<div class="p-2 border rounded">
        <strong>Status:</strong> ${statusText}
        &nbsp; <strong>Condition:</strong> ${displayName} (${(json.best_prob*100).toFixed(1)}% confidence)
      </div>`;
      return json;
    } catch (err) {
      console.error("Analysis error details:", err);
      
      // Differentiate network errors so user can take corrective action
      let errorMessage = `Detection failed: ${err.message}`;
      
      if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
        errorMessage = `
          <div class="alert alert-warning">
            <strong>Connection Error:</strong> Cannot reach the analysis server.<br>
            <small>
              Make sure:
              <ul class="mb-0 mt-1">
                <li>Backend is running at <code>http://127.0.0.1:5000</code></li>
                <li>CORS is enabled in your Flask backend</li>
                <li>You access this page via <code>http://localhost</code> not <code>file://</code></li>
              </ul>
            </small>
          </div>
        `;
      }
      
      analysisDiv.innerHTML = errorMessage;
      throw err;
    }
  }

  // --------------------------
  // Play / Step / Reset controls
  // --------------------------
  playPauseBtn.addEventListener("click", () => { if (play) stopPlay(); else startPlay(); });
  stepBtn.addEventListener("click", () => { advancePointer(Math.max(1, Math.round((viewportSeconds*sr)/4))); drawFrame(); });
  resetBtn.addEventListener("click", () => { resetPlotState(); drawAxesCommon(); drawFrame(); });

  viewportInput.addEventListener("change", () => { viewportSeconds = Math.max(1, Number(viewportInput.value)); drawAxesCommon(); drawFrame(); });
  speedInput.addEventListener("input", () => { speedMultiplier = Number(speedInput.value); });
  chunkInput.addEventListener("change", () => { chunkSeconds = Math.max(0.5, Number(chunkInput.value)); });
  polarModeSelect.addEventListener("change", () => { polarMode = polarModeSelect.value; });
  recurrenceModeSelect.addEventListener("change", () => { recurrenceMode = recurrenceModeSelect.value; recurrenceAccum = null; });
  colormapSelect.addEventListener("change", () => { colormap = colormapSelect.value; });
  zoomInput.addEventListener("change", () => { samplesPerPixel = Math.max(1, Math.round(Number(zoomInput.value))); drawFrame(); });

  // --------------------------
  // Pan & zoom interactions
  // --------------------------
  let dragging = false, dragStartX = 0, pointerAtDragStart = 0;
  signalCanvas.addEventListener("mousedown", (ev) => {
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    if (ev.button === 0) { dragging = true; dragStartX = x; pointerAtDragStart = globalPointer; }
  });
  window.addEventListener("mouseup", () => dragging = false);
  signalCanvas.addEventListener("mousemove", (ev) => {
    if (!dragging || !canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = ev.clientX - rect.left;
    const dx = Math.round((dragStartX - x) * samplesPerPixel);
    globalPointer = Math.max(0, pointerAtDragStart + dx);
    drawFrame();
  });
  signalCanvas.addEventListener("wheel", (ev) => {
    if (!canvas) return;
    ev.preventDefault();
    const delta = Math.sign(ev.deltaY);
    samplesPerPixel = Math.max(1, samplesPerPixel + delta);
    zoomInput.value = samplesPerPixel;
    drawFrame();
  }, { passive: false });

  // --------------------------
  // Play / Stop helpers
  // --------------------------
  function startPlay() {
    if (!rawMatrix) return;
    if (play) return;
    play = true; 
    playPauseBtn.innerText = "Pause";
    playPauseBtn.classList.remove("btn-primary");
    playPauseBtn.classList.add("btn-warning");
    
    const frameIntervalMs = Math.max(20, Math.round(1000 * (viewportSeconds / 100) / Math.max(0.01, speedMultiplier)));
    animationHandle = setInterval(() => {
      const stepSamples = Math.max(1, Math.round(sr * (viewportSeconds) * 0.02 * speedMultiplier));
      advancePointer(stepSamples);
      drawFrame();
    }, frameIntervalMs);
  }
  
  function stopPlay() {
    play = false; 
    playPauseBtn.innerText = "Play";
    playPauseBtn.classList.remove("btn-warning");
    playPauseBtn.classList.add("btn-primary");
    if (animationHandle) { clearInterval(animationHandle); animationHandle = null; }
  }
  
  function advancePointer(n) {
    globalPointer += n;
    if (!rawMatrix) return;
    if (globalPointer >= rawMatrix.length) globalPointer = 0;
  }

  // --------------------------
  // Drawing helpers — axes / grid (common)
  // --------------------------
  function drawAxesCommon() {
    if (!canvas) return;
    ctx = canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
    // background white
    ctx.fillStyle = "#fff"; ctx.fillRect(0,0,canvas.width,canvas.height);

    // grid (25px)
    ctx.strokeStyle = "#f2f2f2"; ctx.lineWidth = 1;
    for (let x=50; x < canvas.width - 20; x += 25) { ctx.beginPath(); ctx.moveTo(x,20); ctx.lineTo(x, canvas.height-40); ctx.stroke(); }
    for (let y=20; y < canvas.height - 40; y += 25) { ctx.beginPath(); ctx.moveTo(50, y); ctx.lineTo(canvas.width-20, y); ctx.stroke(); }

    // axes
    ctx.strokeStyle = "#999"; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(50, canvas.height-40); ctx.lineTo(canvas.width-20, canvas.height-40); ctx.stroke(); // x
    ctx.beginPath(); ctx.moveTo(50, 20); ctx.lineTo(50, canvas.height-40); ctx.stroke(); // y

    // labels - will be updated per viewer type
    ctx.fillStyle = "#333"; ctx.font = "13px Arial";
  }

  // --------------------------
  // drawFrame: routes to viewers
  // --------------------------
  function drawFrame() {
    if (!rawMatrix || !canvas) return;
    drawAxesCommon();

    const viewportSamples = Math.max(1, Math.round(viewportSeconds * sr));
    const left = Math.min(globalPointer, Math.max(0, rawMatrix.length - 1));
    const right = Math.min(rawMatrix.length, left + viewportSamples);

    const selected = Array.from(document.querySelectorAll(".lead-checkbox:checked")).map(cb => cb.value);

    if (selectedViewer === "standard") drawStandard(left, right, selected);
    else if (selectedViewer === "xor") drawXOR(left, right, selected);
    else if (selectedViewer === "polar") drawPolar(left, right, selected);
    else if (selectedViewer === "recurrence") drawRecurrence(left, right, selected);
  }

  // --------------------------
  // Standard viewport
  // - stacked leads (selected), nice axes and scaling
  // --------------------------
  function drawStandard(left, right, selected) {
    if (!selected || selected.length === 0) return;
    const w = canvas.width, h = canvas.height;
    const plotW = w - 80, plotH = h - 80;
    const X0 = 50, Y0 = 20;
    const viewportSamples = right - left;
    const spp = Math.max(1, samplesPerPixel); // samples per pixel
    const pixels = Math.min(plotW, Math.ceil(viewportSamples / spp));
    const n = selected.length;
    const bandH = Math.floor(plotH / n);

    // Draw time axis labels with proper units
    ctx.fillStyle = "#333"; ctx.font = "13px Arial";
    ctx.fillText("Time (seconds)", X0 + plotW/2 - 40, h - 10);
    
    // Draw amplitude axis label
    ctx.save();
    ctx.translate(15, Y0 + plotH/2);
    ctx.rotate(-Math.PI/2);
    ctx.fillText("Amplitude (mV)", 0, 0);
    ctx.restore();

    // Draw scale indicators
    ctx.strokeStyle = "#666"; ctx.lineWidth = 1;
    
    // Time scale indicator (1 second)
    const oneSecondPixels = sr / spp;
    if (oneSecondPixels < plotW - 20) {
      ctx.beginPath();
      ctx.moveTo(X0 + 10, h - 45);
      ctx.lineTo(X0 + 10 + oneSecondPixels, h - 45);
      ctx.stroke();
      ctx.fillText("1s", X0 + 10 + oneSecondPixels/2 - 8, h - 30);
    }

    // Amplitude scale indicator (1 mV)
    const oneMvPixels = 30; // 1 mV = 30 pixels
    ctx.beginPath();
    ctx.moveTo(X0 - 15, Y0 + plotH/2);
    ctx.lineTo(X0 - 15, Y0 + plotH/2 - oneMvPixels);
    ctx.stroke();
    ctx.fillText("1 mV", X0 - 45, Y0 + plotH/2 - oneMvPixels/2);

    for (let li = 0; li < n; li++) {
      const lead = selected[li].toUpperCase();
      const idx = headers.indexOf(lead);
      const offsetY = Y0 + li * bandH + Math.floor(bandH / 2);
      // center line
      ctx.strokeStyle = "#e6e6e6"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(X0, offsetY); ctx.lineTo(X0 + pixels, offsetY); ctx.stroke();

      // waveform
      ctx.strokeStyle = li === 0 ? "#007bff" : "#17a2b8";
      ctx.lineWidth = 1.5; ctx.beginPath();
      for (let px = 0; px < pixels; px++) {
        const sampleIndex = left + px * spp;
        const val = (rawMatrix[sampleIndex] && idx >= 0) ? rawMatrix[sampleIndex][idx] : 0;
        // scale: assume mV approx; 1 mV => 30 px (tunable)
        const y = offsetY - (val * 30);
        const x = X0 + px;
        if (px === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.fillStyle = "#333"; ctx.font = "13px Arial"; ctx.fillText(selected[li], 10, offsetY + 4);
    }
  }

  // --------------------------
  // XOR viewer: overlay N chunks + difference trace
  // - draws previous chunks transparently, and a final 'diff' where
  //   identical points are erased (NaN).
  // --------------------------
  function drawXOR(left, right, selected) {
    if (!selected || selected.length !== 1) return;
    const lead = selected[0].toUpperCase();
    const idx = headers.indexOf(lead);
    if (idx < 0) return;

    const chunkWidth = Math.max(4, Math.round(chunkSeconds * sr)); // minimum
    // find the chunk start (so the viewport corresponds to a chunk)
    const chunkIndex = Math.floor(left / chunkWidth);
    const baseStart = chunkIndex * chunkWidth;

    // collect a few adjacent chunks to overlay (previous, current, next)
    const chunksToDraw = 3;
    const colors = ["rgba(0,90,200,0.45)", "rgba(200,20,20,0.45)", "rgba(20,140,20,0.45)"];
    const w = canvas.width, h = canvas.height;
    const X0 = 50, Yc = Math.floor(h/2);
    const pxPerSample = Math.max(1, Math.floor((w - 80) / chunkWidth));
    
    // Draw axis labels for XOR plot
    ctx.fillStyle = "#333"; ctx.font = "13px Arial";
    ctx.fillText("Time (seconds)", X0 + (chunkWidth * pxPerSample)/2 - 40, h - 10);
    ctx.save();
    ctx.translate(15, Yc);
    ctx.rotate(-Math.PI/2);
    ctx.fillText("Amplitude (mV)", 0, 0);
    ctx.restore();

    // compute chunks arrays
    const chunks = [];
    for (let c = 0; c < chunksToDraw; c++) {
      const s = baseStart + (c - 1) * chunkWidth; // previous, current, next
      const start = Math.max(0, s);
      const end = Math.min(rawMatrix.length, start + chunkWidth);
      const arr = [];
      for (let i = start; i < end; i++) arr.push(rawMatrix[i][idx] || 0);
      chunks.push({start, arr});
    }

    // draw each chunk (semi-transparent)
    for (let c = 0; c < chunks.length; c++) {
      const chk = chunks[c];
      ctx.strokeStyle = colors[c % colors.length];
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < chk.arr.length; i++) {
        const v = chk.arr[i];
        const x = X0 + i * pxPerSample;
        const y = Yc - (v * 40);
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // compute XOR-like difference: start from first chunk, toggle by subsequent chunks
    let diff = new Array(chunkWidth).fill(NaN);
    // initialize with first chunk values where present
    const first = chunks[0].arr;
    for (let i = 0; i < first.length; i++) diff[i] = first[i];

    // for next chunks, if value close to current diff -> erase to NaN, else set to sample
    for (let c = 1; c < chunks.length; c++) {
      const arr = chunks[c].arr;
      for (let i = 0; i < arr.length; i++) {
        const a = arr[i], d = diff[i];
        const eps = 1e-6 + 0.02 * Math.max(Math.abs(a), Math.abs(d) || 1);
        if (isNaN(d)) {
          diff[i] = a; // nothing there, set it
        } else {
          if (Math.abs(a - d) < eps) diff[i] = NaN; // cancel
          else diff[i] = a; // different -> keep new value (toggle)
        }
      }
    }

    // draw final diff (thicker black)
    ctx.strokeStyle = "#000"; ctx.lineWidth = 2.2; ctx.beginPath();
    for (let i = 0; i < diff.length; i++) {
      const v = diff[i];
      const x = X0 + i * pxPerSample;
      const y = isNaN(v) ? Yc : (Yc - (v * 40));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Center label
    ctx.fillStyle = "#333"; ctx.fillText(lead, 10, Yc + 4);
    // show chunk boundaries
    ctx.fillStyle = "#666"; ctx.font = "12px Arial";
    ctx.fillText(`Chunk: ${chunkSeconds}s (${chunkWidth} samples)`, canvas.width - 220, 24);
  }

  // --------------------------
  // Polar viewer — θ=time, r=|amplitude| - FIXED VERSION
  // - latest single-ring or cumulative traces
  // --------------------------
  function drawPolar(left, right, selected) {
    if (!selected || selected.length !== 1) return;
    const lead = selected[0].toUpperCase();
    const idx = headers.indexOf(lead);
    if (idx < 0) return;

    const samples = Math.min(360, right - left);
    if (samples <= 2) return;
    
    const w = canvas.width, h = canvas.height; // ADDED: Define w and h
    const cx = Math.floor(w/2), cy = Math.floor(h/2);
    const maxRpx = Math.min(w, h) * 0.35;

    // build r/theta arrays
    const rvals = [];
    const thetas = [];
    for (let i = 0; i < samples; i++) {
      const v = rawMatrix[left + i] ? Math.abs(rawMatrix[left + i][idx]) : 0;
      rvals.push(v);
      thetas.push((i / samples) * 2 * Math.PI);
    }

    // Draw polar plot title and labels
    ctx.fillStyle = "#333"; ctx.font = "14px Arial"; ctx.textAlign = "center";
    ctx.fillText(`Polar Plot: ${lead}`, cx, 20);
    ctx.fillText("Radius: |Amplitude| (mV)", cx, h - 20);
    ctx.textAlign = "left";
    ctx.fillText("Angle: Time (radians)", 80, cy);
    
    // Draw scale indicator for radius
    ctx.strokeStyle = "#666"; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + maxRpx + 10, cy);
    ctx.lineTo(cx + maxRpx + 20, cy);
    ctx.stroke();
    ctx.textAlign = "left";
    ctx.fillText("1 mV", cx + maxRpx + 30, cy + 4);

    if (polarMode === "latest") {
      ctx.strokeStyle = "#c8383a"; ctx.lineWidth = 1.8; ctx.beginPath();
      for (let i=0;i<samples;i++) {
        const rr = Math.min(maxRpx, rvals[i] * 60);
        const ang = thetas[i];
        const x = cx + rr * Math.cos(ang);
        const y = cy + rr * Math.sin(ang);
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    } else {
      // cumulative: store traces and draw last N
      polarTraces.push({r: rvals.slice(), th: thetas.slice()});
      if (polarTraces.length > 20) polarTraces.shift();
      for (let t=0; t<polarTraces.length; t++) {
        const trace = polarTraces[t];
        ctx.strokeStyle = `rgba(${200-6*t},${50+6*t},${50+3*t},${0.7 - t*0.02})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        for (let i=0;i<trace.r.length;i++) {
          const rr = Math.min(maxRpx, trace.r[i] * 60);
          const ang = trace.th[i];
          const x = cx + rr * Math.cos(ang);
          const y = cy + rr * Math.sin(ang);
          if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
        }
        ctx.stroke();
      }
    }

    // polar guides with improved axis labels
    ctx.strokeStyle = "#aaa"; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(cx, cy, maxRpx, 0, 2*Math.PI); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, maxRpx/2, 0, 2*Math.PI); ctx.stroke();
    
    // Draw axis lines and labels
    ctx.strokeStyle = "#666"; ctx.lineWidth = 1;
    // Horizontal axis (0° and 180°)
    ctx.beginPath(); 
    ctx.moveTo(cx - maxRpx - 10, cy); 
    ctx.lineTo(cx + maxRpx + 10, cy); 
    ctx.stroke();
    // Vertical axis (90° and 270°)
    ctx.beginPath(); 
    ctx.moveTo(cx, cy - maxRpx - 10); 
    ctx.lineTo(cx, cy + maxRpx + 10); 
    ctx.stroke();
    
    // Axis labels
    ctx.fillStyle = "#333"; ctx.font = "12px Arial"; ctx.textAlign = "center";
    ctx.fillText("0° (0 rad)", cx + maxRpx + 25, cy + 4);
    ctx.fillText("180° (π rad)", cx - maxRpx - 25, cy + 4);
    ctx.fillText("90° (π/2 rad)", cx + 4, cy - maxRpx - 15);
    ctx.fillText("270° (3π/2 rad)", cx + 4, cy + maxRpx + 20);
  }

  // --------------------------
  // Recurrence viewer (scatter / heatmap) - IMPROVED AXIS LABELS
  // --------------------------
  function drawRecurrence(left, right, selected) {
    if (!selected || selected.length !== 2) return;
    const ch1 = headers.indexOf(selected[0].toUpperCase());
    const ch2 = headers.indexOf(selected[1].toUpperCase());
    if (ch1 < 0 || ch2 < 0) return;

    const chunk = Math.max(10, Math.round(chunkSeconds * sr));
    const end = Math.min(rawMatrix.length, left + chunk);
    const xs = [], ys = [];
    for (let i = left; i < end; i++) { xs.push(rawMatrix[i][ch1] || 0); ys.push(rawMatrix[i][ch2] || 0); }

    const w = canvas.width, h = canvas.height;
    const plotW = w - 120, plotH = h - 120;
    const X0 = 60, Y0 = 60;

    const xmin = Math.min(...xs), xmax = Math.max(...xs);
    const ymin = Math.min(...ys), ymax = Math.max(...ys);

    // Calculate ranges for scale indicators
    const xrange = xmax - xmin || 1;
    const yrange = ymax - ymin || 1;

    if (recurrenceMode === "scatter") {
      // Draw title
      ctx.fillStyle = "#333"; ctx.font = "14px Arial"; ctx.textAlign = "center";
      ctx.fillText(`${selected[0]} vs ${selected[1]} Recurrence Plot`, X0 + plotW/2, 30);
      
      // Improved axis labels for scatter plot
      ctx.fillStyle = "#333"; ctx.font = "13px Arial";
      ctx.fillText(`${selected[0]} Amplitude (mV)`, X0 + plotW/2, Y0 + plotH + 40);
      ctx.save();
      ctx.translate(20, Y0 + plotH/2);
      ctx.rotate(-Math.PI/2);
      ctx.fillText(`${selected[1]} Amplitude (mV)`, 0, 0);
      ctx.restore();

      // Draw scale indicators
      ctx.strokeStyle = "#666"; ctx.lineWidth = 1;
      
      // X-axis scale (0.5 mV)
      const xScalePixels = (0.5 / xrange) * plotW;
      if (xScalePixels > 20 && xScalePixels < plotW/2) {
        ctx.beginPath();
        ctx.moveTo(X0 + plotW - xScalePixels - 10, Y0 + plotH + 15);
        ctx.lineTo(X0 + plotW - 10, Y0 + plotH + 15);
        ctx.stroke();
        ctx.fillText("0.5 mV", X0 + plotW - xScalePixels/2 - 10, Y0 + plotH + 30);
      }

      // Y-axis scale (0.5 mV)
      const yScalePixels = (0.5 / yrange) * plotH;
      if (yScalePixels > 20 && yScalePixels < plotH/2) {
        ctx.beginPath();
        ctx.moveTo(X0 - 15, Y0 + 10);
        ctx.lineTo(X0 - 15, Y0 + 10 + yScalePixels);
        ctx.stroke();
        ctx.fillText("0.5 mV", X0 - 45, Y0 + 10 + yScalePixels/2);
      }

      // Draw the scatter points
      ctx.fillStyle = "rgba(95, 40, 150, 0.6)";
      for (let i = 0; i < xs.length; i++) {
        const xpx = X0 + ((xs[i]-xmin)/xrange) * plotW;
        const ypx = Y0 + plotH - ((ys[i]-ymin)/yrange) * plotH;
        ctx.fillRect(Math.round(xpx), Math.round(ypx), 2, 2);
      }
      
    } else {
      // heatmap accumulation
      const bins = 128;
      const Z = Array.from({length: bins}, () => new Uint32Array(bins));
      for (let i=0;i<xs.length;i++) {
        const xi = Math.floor(((xs[i]-xmin)/xrange)*(bins-1));
        const yi = Math.floor(((ys[i]-ymin)/yrange)*(bins-1));
        if (xi>=0 && yi>=0 && xi<bins && yi<bins) Z[yi][xi] += 1;
      }
      if (!recurrenceAccum) recurrenceAccum = Z.slice();
      else {
        for (let r=0;r<bins;r++) for (let c=0;c<bins;c++) recurrenceAccum[r][c] += Z[r][c];
      }
      
      // Draw title
      ctx.fillStyle = "#333"; ctx.font = "14px Arial"; ctx.textAlign = "center";
      ctx.fillText(`${selected[0]} vs ${selected[1]} Recurrence Heatmap`, X0 + plotW/2, 30);
      
      // Improved axis labels for heatmap
      ctx.fillStyle = "#333"; ctx.font = "13px Arial";
      ctx.fillText(`${selected[0]} Amplitude (mV)`, X0 + plotW/2, Y0 + plotH + 40);
      ctx.save();
      ctx.translate(20, Y0 + plotH/2);
      ctx.rotate(-Math.PI/2);
      ctx.fillText(`${selected[1]} Amplitude (mV)`, 0, 0);
      ctx.restore();

      // Draw scale indicators for heatmap
      ctx.strokeStyle = "#666"; ctx.lineWidth = 1;
      
      // X-axis scale (0.5 mV)
      const xScalePixels = (0.5 / xrange) * plotW;
      if (xScalePixels > 20 && xScalePixels < plotW/2) {
        ctx.beginPath();
        ctx.moveTo(X0 + plotW - xScalePixels - 10, Y0 + plotH + 15);
        ctx.lineTo(X0 + plotW - 10, Y0 + plotH + 15);
        ctx.stroke();
        ctx.fillText("0.5 mV", X0 + plotW - xScalePixels/2 - 10, Y0 + plotH + 30);
      }

      // Y-axis scale (0.5 mV)
      const yScalePixels = (0.5 / yrange) * plotH;
      if (yScalePixels > 20 && yScalePixels < plotH/2) {
        ctx.beginPath();
        ctx.moveTo(X0 - 15, Y0 + 10);
        ctx.lineTo(X0 - 15, Y0 + 10 + yScalePixels);
        ctx.stroke();
        ctx.fillText("0.5 mV", X0 - 45, Y0 + 10 + yScalePixels/2);
      }

      // draw heatmap in center region
      const mapW = plotW, mapH = plotH;
      const cellW = mapW / bins, cellH = mapH / bins;
      let maxVal = 0;
      for (let r=0;r<bins;r++) for (let c=0;c<bins;c++) maxVal = Math.max(maxVal, recurrenceAccum[r][c]);
      if (maxVal === 0) maxVal = 1;
      for (let r=0;r<bins;r++) {
        for (let c=0;c<bins;c++) {
          const val = recurrenceAccum[r][c] / maxVal;
          ctx.fillStyle = colormapToRGBA(val, colormap);
          const px = X0 + c*cellW, py = Y0 + (bins - r - 1)*cellH;
          ctx.fillRect(px, py, cellW+0.5, cellH+0.5);
        }
      }
      
      // Add colorbar legend for heatmap
      const colorbarWidth = 20, colorbarHeight = 150;
      const colorbarX = X0 + plotW + 10, colorbarY = Y0 + (plotH - colorbarHeight)/2;
      
      // Draw colorbar
      for (let i = 0; i < colorbarHeight; i++) {
        const val = 1 - (i / colorbarHeight);
        ctx.fillStyle = colormapToRGBA(val, colormap);
        ctx.fillRect(colorbarX, colorbarY + i, colorbarWidth, 1);
      }
      
      // Draw colorbar frame and labels
      ctx.strokeStyle = "#333"; ctx.lineWidth = 1;
      ctx.strokeRect(colorbarX, colorbarY, colorbarWidth, colorbarHeight);
      ctx.fillStyle = "#333"; ctx.font = "11px Arial";
      ctx.fillText("High", colorbarX + colorbarWidth + 5, colorbarY + 10);
      ctx.fillText("Low", colorbarX + colorbarWidth + 5, colorbarY + colorbarHeight - 5);
      ctx.fillText("Density", colorbarX - 10, colorbarY - 10);
    }
  }

  // --------------------------
  // Colormap helpers
  // --------------------------
  function colormapToRGBA(v, cmap) {
    v = Math.max(0, Math.min(1, v));
    if (cmap === "gray") {
      const g = Math.round(255 * v);
      return `rgba(${g},${g},${g},1)`;
    } else if (cmap === "hot") {
      const r = Math.round(255 * Math.min(1, 3*v));
      const g = Math.round(255 * Math.min(1, 3*(v-1/3)));
      const b = Math.round(255 * Math.min(1, 3*(v-2/3)));
      return `rgba(${r},${g},${b},1)`;
    } else if (cmap === "jet") {
      const r = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(1 - 4*v))));
      const g = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(0.5 - 4*v))));
      const b = Math.round(255 * Math.max(0, Math.min(1, 1.5 - Math.abs(-0.5 - 4*v))));
      return `rgba(${r},${g},${b},1)`;
    } else {
      // viridis-ish
      const r = Math.round(68 + 187*v);
      const g = Math.round(1 + 188*v);
      const b = Math.round(84 + 155*(1-v));
      return `rgba(${r},${g},${b},1)`;
    }
  }

  // --------------------------
  // Reset helpers
  // --------------------------
  function resetPlotState() {
    globalPointer = 0;
    prevChunk = null;
    polarTraces = [];
    recurrenceAccum = null;
    stopPlay();
  }

  function stopPlay() {
    if (animationHandle) { clearInterval(animationHandle); animationHandle = null; }
    play = false; 
    if (playPauseBtn) {
      playPauseBtn.innerText = "Play";
      playPauseBtn.classList.remove("btn-warning");
      playPauseBtn.classList.add("btn-primary");
    }
  }

  // On back button pressed: stop and restore default canvas content
  if (backBtn) backBtn.addEventListener("click", () => {
    stopPlay();
    signalCanvas.innerHTML = `
      <div class="d-flex justify-content-center align-items-center h-100 text-muted">
        <div class="text-center">
          <i class="bi-activity display-4 mb-3"></i>
          <p>ECG signal visualization will appear here</p>
          <small>Select leads and viewer options to begin</small>
        </div>
      </div>
    `;
  });

  // Initial enforcement
  enforceLeadSelectionRules();
});