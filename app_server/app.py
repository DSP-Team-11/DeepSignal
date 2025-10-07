from flask import Flask, request, jsonify, send_file, render_template, send_from_directory
from flask_cors import CORS
from werkzeug.utils import secure_filename
import numpy as np
import pandas as pd
import torch
import torch.nn as nn
import tensorflow as tf
import librosa
import torchaudio
import soundfile as sf
import matplotlib.pyplot as plt
import rasterio
from scipy.signal import medfilt, find_peaks
from PIL import Image
from datetime import datetime
import io
import base64
import tempfile
import shutil
import traceback
import webbrowser
import threading
import os

# Import your model functions
try:
    from model import get_model
except ImportError:
    # Fallback for production
    def get_model(n_classes, last_layer):
        # You might need to implement a fallback or ensure model.py is included
        pass

app = Flask(__name__)
CORS(app)

# =============================================================================
# Configuration
# =============================================================================
UPLOAD_DIR = "uploads"
STATIC_DIR = "static"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS = {'npy', 'npz', 'csv', 'txt'}

# Configuration of drone and sar
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
ALLOWED_AUDIO_EXTENSIONS = {'wav'}
ALLOWED_IMAGE_EXTENSIONS = {'tif', 'tiff', 'jpg', 'jpeg', 'png'}

# Audio processing parameters (update these to match your model's training)
SAMPLE_RATE = 16000
N_MELS = 128
N_FFT = 2048
HOP_LENGTH = 512
DURATION = 5  # seconds

# Create directories
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(STATIC_DIR, exist_ok=True)

# =============================================================================
# Load Models
# =============================================================================

# Load ECG Model
try:
    model_path = "model.hdf5"
    ecg_model = get_model(n_classes=6, last_layer='sigmoid')
    ecg_model.load_weights(model_path)
    print("✅ ECG Model loaded successfully")
except Exception as e:
    print(f"❌ Error loading ECG model: {e}")
    ecg_model = None

ecg_labels = ["1dAVb", "RBBB", "LBBB", "SB", "AF", "ST"]

# Load EEG Model
EEG_MODEL_PATH = "eegnet_deploy.pt"
device = torch.device("cpu")

try:
    eeg_model = torch.jit.load(EEG_MODEL_PATH, map_location=device)
    eeg_model.eval()
    print(f"✅ EEG Model loaded successfully from {EEG_MODEL_PATH}")
except Exception as e:
    print(f"❌ Error loading EEG model: {e}")
    eeg_model = None

eeg_label_map = [
    "Healthy",
    "Alzheimer's",
    "Frontotemporal Dementia",
    "Multiple Sclerosis",
    "Parkinson's Disease"
]

# =============================================================================
# Helper Functions for EEG
# =============================================================================

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def save_uploaded_file(file, filename):
    """Save uploaded file to uploads directory"""
    filepath = os.path.join(UPLOAD_DIR, filename)
    file.save(filepath)
    print(f"📁 File saved to: {filepath}")
    return filepath

def preprocess_eeg_signal(signal: np.ndarray):
    """
    Preprocess EEG signal exactly like training.
    - Transpose each trial to (19,128)
    - Normalize each channel (z-score)
    - Handle any input shape (19x128, 345x128x19, etc.)
    """
    print(f"🔄 Preprocessing EEG signal with shape: {signal.shape}")

    # Case 1 — signal is (trials, time, channels)
    if signal.ndim == 3 and signal.shape[-1] == 19:
        signal = np.transpose(signal, (0, 2, 1))  # (trials, 19, 128)
        print("📊 Transposed (trials,128,19) → (trials,19,128)")

    # Case 2 — signal is (channels, samples)
    elif signal.ndim == 2:
        if signal.shape[0] == 128 and signal.shape[1] == 19:
            signal = signal.T  # (19,128)
            print("📊 Transposed (128,19) → (19,128)")
        signal = np.expand_dims(signal, axis=0)  # (1,19,128)

    # Ensure correct channel/time dimensions
    trials, chans, samples = signal.shape
    if chans != 19 or samples != 128:
        print(f"⚠️ Adjusting shape from {signal.shape} to (trials,19,128)")
        fixed = np.zeros((trials, 19, 128))
        fixed[:, :min(chans, 19), :min(samples, 128)] = signal[:, :min(chans, 19), :min(samples, 128)]
        signal = fixed

    # Normalize each trial per channel
    normed = []
    for trial in signal:
        norm_trial = (trial - trial.mean(axis=1, keepdims=True)) / (trial.std(axis=1, keepdims=True) + 1e-6)
        normed.append(norm_trial)
    signal = np.stack(normed).astype(np.float32)

    tensor = torch.tensor(signal, dtype=torch.float32)
    print(f"✅ Final EEG tensor shape: {tensor.shape}")
    return tensor

def run_eeg_model_inference(tensor):
    """Run EEGNet model inference and return prediction + confidence."""
    print(f"🧠 Running EEG inference on tensor: {tensor.shape}")

    with torch.no_grad():
        # EEGNet expects (batch, 19, 128)
        outputs = eeg_model(tensor)
        print(f"🧩 Raw EEG model output shape: {outputs.shape}")

        # Handle shape automatically
        if outputs.ndim > 2:
            outputs = outputs.view(outputs.size(0), -1)

        probabilities = torch.nn.functional.softmax(outputs, dim=1)
        pred_indices = torch.argmax(probabilities, dim=1)
        pred_idx = torch.mode(pred_indices).values.item()
        confidence = probabilities[0, pred_idx].item()
        prediction = eeg_label_map[pred_idx]

        print(f"🎯 EEG Predicted: {prediction} ({confidence*100:.1f}%)")

        return {
            "prediction": prediction,
            "confidence": round(confidence, 4),
            "all_probabilities": {eeg_label_map[i]: round(probabilities[0, i].item(), 4) for i in range(len(eeg_label_map))}
        }

def process_uploaded_file(filepath):
    """Process uploaded file and return signal data"""
    ext = os.path.splitext(filepath)[1].lower()
    
    if ext == '.npy':
        signal = np.load(filepath, allow_pickle=True)
    elif ext == '.npz':
        with np.load(filepath, allow_pickle=True) as data:
            signal = data[data.files[0]]  # Get first array
    elif ext in ['.csv', '.txt']:
        signal = np.loadtxt(filepath, delimiter=',')
    else:
        raise ValueError(f"Unsupported file format: {ext}")
    
    return signal

# =============================================================================
# Main Routes
# =============================================================================

@app.route("/")
def home():
    """Serve main landing page"""
    return send_file("index.html")

@app.route("/ecg")
def ecg_page():
    """Serve ECG analysis page"""
    return send_file("ecg.html")

@app.route("/eeg")
def eeg_page():
    """Serve EEG analysis page - directly from root directory"""
    try:
        return send_file("eeg.html")
    except FileNotFoundError:
        return "EEG page not found. Please ensure eeg.html is in the root directory.", 404

@app.route('/static/<path:filename>')
def serve_static(filename):
    """Serve static files (CSS, JS, images, etc.)"""
    return send_from_directory(STATIC_DIR, filename)


# =============================================================================
# Health Check & System Info
# =============================================================================

@app.route("/api/health", methods=["GET"])
@app.route('/health', methods=["GET"])
def health_check():
    return jsonify({
        "message": "Multi-Model Medical Analysis API is running",
        "status": "healthy",
        "models_loaded": {
            "ecg_model": ecg_model is not None,
            "eeg_model": eeg_model is not None,
            "drone_model": drone_model is not None
        },
        "upload_directory": UPLOAD_DIR,
        "supported_applications": [
            "ECG Analysis", 
            "EEG Classification", 
            "Doppler Analysis",
            "Drone Audio Classification", 
            "SAR Image Analysis"
        ],
        "timestamp": datetime.now().isoformat()
    })

# =============================================================================
# ECG Analysis Endpoints
# =============================================================================

@app.route("/api/analyze_ecg", methods=["POST"])
def analyze_ecg():
    """Analyze ECG signals from CSV files"""
    try:
        if ecg_model is None:
            return jsonify({"error": "ECG Model not loaded"}), 500
        
        file = request.files["file"]
        df = pd.read_csv(file, header=0)

        # Normalize column names
        df.columns = [c.strip().upper() for c in df.columns]
        expected_leads = ["I","II","III","AVR","AVL","AVF","V1","V2","V3","V4","V5","V6"]

        # Keep only expected leads
        df = df[[c for c in df.columns if c in expected_leads]]

        # Fill missing leads with zeros
        for lead in expected_leads:
            if lead not in df.columns:
                df[lead] = 0.0
        df = df[expected_leads]

        # Convert to numpy
        ecg_array = df.to_numpy().astype(np.float32)

        # Pad or truncate to 4096 samples
        if ecg_array.shape[0] < 4096:
            pad_len = 4096 - ecg_array.shape[0]
            ecg_array = np.pad(ecg_array, ((0, pad_len), (0, 0)), mode="constant")
        if ecg_array.shape[0] > 4096:
            ecg_array = ecg_array[:4096, :]

        # If only 1 lead, tile to 12
        if ecg_array.shape[1] == 1:
            ecg_array = np.tile(ecg_array, (1, 12))

        # Prepare for model
        ecg_input = np.expand_dims(ecg_array, axis=0)

        # Prediction
        probs = ecg_model.predict(ecg_input)

        # Classification
        if all(p < 0.5 for p in probs[0]):
            normal_abnormal = "Normal"
        else:
            normal_abnormal = "Abnormal"

        best_index = int(np.argmax(probs[0]))

        return jsonify({
            "normal_abnormal": normal_abnormal,
            "best_class": ecg_labels[best_index],
            "best_prob": float(probs[0][best_index]),
            "all_probabilities": {ecg_labels[i]: float(probs[0][i]) for i in range(len(ecg_labels))}
        })

    except Exception as e:
        return jsonify({"error": str(e)}), 500

# =============================================================================
# EEG Analysis Endpoints
# =============================================================================

@app.route("/api/upload", methods=["POST"])
def upload_file():
    """Endpoint specifically for file upload without processing"""
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400
    
    if not allowed_file(file.filename):
        return jsonify({"error": f"File type not allowed. Please upload {ALLOWED_EXTENSIONS} files"}), 400

    try:
        # Save the uploaded file with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        filename = f"{timestamp}_{file.filename}"
        filepath = save_uploaded_file(file, filename)
        
        # Get file info and signal shape
        file_size = os.path.getsize(filepath)
        signal = process_uploaded_file(filepath)
        
        return jsonify({
            "message": "File uploaded successfully",
            "filename": filename,
            "filepath": filepath,
            "size_bytes": file_size,
            "signal_shape": list(signal.shape),
            "upload_time": datetime.now().isoformat()
        })

    except Exception as e:
        print(f"❌ Upload error: {str(e)}")
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@app.route('/api/classify_eeg', methods=['POST'])
def classify_eeg():
    """Classify EEG signals from uploaded files"""
    try:
        if eeg_model is None:
            return jsonify({'error': 'EEG Model not loaded'}), 500

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Empty filename'}), 400

        # Secure and temporarily save file
        filename = secure_filename(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), filename)
        file.save(temp_path)
        print(f"📁 Uploaded EEG file saved to: {temp_path}")

        # Load signal
        signal = np.load(temp_path, allow_pickle=True)
        print(f"📊 Loaded EEG signal shape: {signal.shape}")

        # Preprocess
        tensor = preprocess_eeg_signal(signal)

        # Run model inference
        results = run_eeg_model_inference(tensor)

        # Clean up
        os.remove(temp_path)

        # Return JSON response
        return jsonify({
            'prediction': results['prediction'],
            'confidence': results['confidence'],
            'probabilities': results['all_probabilities']
        })

    except Exception as e:
        print(f"❌ EEG Classification Error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# =============================================================================
# File Management Endpoints
# =============================================================================

@app.route("/api/files", methods=["GET"])
def list_files():
    """List all uploaded files"""
    try:
        files = []
        for filename in os.listdir(UPLOAD_DIR):
            filepath = os.path.join(UPLOAD_DIR, filename)
            if os.path.isfile(filepath):
                stat = os.stat(filepath)
                files.append({
                    "filename": filename,
                    "size_bytes": stat.st_size,
                    "modified_time": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "filepath": filepath
                })
        
        return jsonify({
            "upload_directory": UPLOAD_DIR,
            "total_files": len(files),
            "files": sorted(files, key=lambda x: x['modified_time'], reverse=True)
        })
    except Exception as e:
        return jsonify({"error": f"Could not list files: {str(e)}"}), 500

@app.route("/api/files/<filename>", methods=["DELETE"])
def delete_file(filename):
    """Delete a specific uploaded file"""
    try:
        # Security check to prevent directory traversal
        safe_filename = os.path.basename(filename)
        filepath = os.path.join(UPLOAD_DIR, safe_filename)
        
        if not os.path.exists(filepath):
            return jsonify({"error": "File not found"}), 404
            
        os.remove(filepath)
        return jsonify({"message": f"File {safe_filename} deleted successfully"})
    except Exception as e:
       return jsonify({"error": f"Could not delete file: {str(e)}"}), 500
    
# ---------------------------
# الصفحة الرئيسية
# ---------------------------
# @app.route('/doppler-analysis')
# def index():
#     return send_from_directory('.', 'doppler-analysis.html')
@app.route("/doppler-analysis")
def index():
    """Serve Doppler analysis page"""
    return send_file("doppler-analysis.html")


# ---------------------------
# خدمة الملفات الثابتة
# ---------------------------
@app.route('/js/<path:filename>')
def js_files(filename):
    return send_from_directory('js', filename)


@app.route('/css/<path:filename>')
def css_files(filename):
    return send_from_directory('css', filename)


@app.route('/images/<path:filename>')
def images_files(filename):
    return send_from_directory('images', filename)


@app.route('/icons/<path:filename>')
def icons_files(filename):
    return send_from_directory('icons', filename)


# ---------------------------
# توليد الصوت - مع إصلاح صفارة الإسعاف
# ---------------------------
@app.route('/simulate', methods=['POST'])
def simulate():
    data = request.get_json()
    sig_type = int(data['type'])
    f_engine = float(data['freq'])
    v_car = float(data['speed'])
    d_perp = float(data['dist'])

    fs = 44100
    c = 343.0
    alpha = 1.0
    x_start = -200.0
    x_end = 200.0

    # حساب المدة
    duration = abs(x_end - x_start) / v_car
    t = np.linspace(0.0, duration, int(fs * duration), endpoint=False)
    x = x_start + v_car * t
    d = np.sqrt(x ** 2 + d_perp ** 2)

    # حساب تأثير دوبلر
    v_radial = - (x * v_car) / (d + 1e-12)

    # توليد الإشارة بناءً على النوع
    if sig_type == 1:
        # Realistic car engine
        f_inst = f_engine * (c / (c - v_radial))
        f_inst = np.clip(f_inst, 20.0, fs / 4.0)
        phase = 2.0 * np.pi * np.cumsum(f_inst) / fs

        harm_amps = [1.0, 0.6, 0.35, 0.18, 0.1]
        signal = np.zeros_like(t)
        for k, amp in enumerate(harm_amps, start=1):
            signal += amp * np.sin(k * phase)
        # إضافة ضوضاء خفيفة
        noise = np.random.normal(0.0, 1.0, len(t))
        noise = np.convolve(noise, np.ones(fs // 4000) / (fs // 4000), mode='same')
        signal += 0.25 * noise

    elif sig_type == 2:
        # Square wave
        f_inst = f_engine * (c / (c - v_radial))
        f_inst = np.clip(f_inst, 20.0, fs / 4.0)
        phase = 2.0 * np.pi * np.cumsum(f_inst) / fs
        signal = np.sign(np.sin(phase))

    elif sig_type == 3:
        # Sawtooth wave
        f_inst = f_engine * (c / (c - v_radial))
        f_inst = np.clip(f_inst, 20.0, fs / 4.0)
        phase = 2.0 * np.pi * np.cumsum(f_inst) / fs
        signal = 2 * ((phase / (2 * np.pi)) % 1) - 1

    elif sig_type == 4:
        # 🚑 Ambulance siren - الإصلاح هنا
        f1, f2 = 700, 900  # ترددات الصفارة
        tone_period = 0.3  # فترة التبديل بين الترددين (بالثواني)

        # إنشاء مصفوفة التبديل بين الترددين
        tone_switch = np.floor(t / tone_period) % 2
        f_siren = np.where(tone_switch == 0, f1, f2)

        # تطبيق تأثير دوبلر على كل تردد
        f_inst = f_siren * (c / (c - v_radial))
        f_inst = np.clip(f_inst, 20.0, fs / 4.0)

        # حساب الطور بشكل صحيح
        phase = 2.0 * np.pi * np.cumsum(f_inst) / fs
        signal = np.sin(phase)

    else:
        # Default sine wave
        f_inst = f_engine * (c / (c - v_radial))
        f_inst = np.clip(f_inst, 20.0, fs / 4.0)
        phase = 2.0 * np.pi * np.cumsum(f_inst) / fs
        signal = np.sin(phase)

    # تطبيق التوهين والتلاشي
    att = 1.0 / (d ** alpha + 1e-12)
    fade = np.ones_like(t)
    ramp = int(0.02 * fs)
    fade[:ramp] = np.linspace(0.0, 1.0, ramp)
    fade[-ramp:] = np.linspace(1.0, 0.0, ramp)
    signal *= att * fade

    # تطبيع الإشارة
    signal = signal / np.max(np.abs(signal))

    # حفظ كملف WAV وإرجاعه
    buf = io.BytesIO()
    sf.write(buf, signal, fs, format='WAV')
    buf.seek(0)
    return send_file(buf, mimetype="audio/wav")

#########################################


@app.route('/upload_car', methods=['POST'])
def upload_car():
    if "file" not in request.files:
        return jsonify({"error": "No file uploaded"}), 400

    file = request.files["file"]
    if file.filename == "":
        return jsonify({"error": "No file selected"}), 400

    # Accept more file types
    if not file.filename.lower().endswith(('.wav', '.mp3', '.ogg')):
        return jsonify({"error": "Only .wav, .mp3, .ogg files are supported"}), 400

    try:
        # Read audio file
        audio_bytes = file.read()
        y, sr = librosa.load(io.BytesIO(audio_bytes), sr=44100)

        # STFT parameters - higher resolution
        n_fft = 8192
        hop_length = 256
        
        D = np.abs(librosa.stft(y, n_fft=n_fft, hop_length=hop_length))
        DB = librosa.amplitude_to_db(D, ref=np.max)
        freqs = librosa.fft_frequencies(sr=sr, n_fft=n_fft)
        times = librosa.frames_to_time(np.arange(D.shape[1]), sr=sr, hop_length=hop_length)

        # Define frequency range
        freq_min, freq_max = 100, 10000
        freq_mask = (freqs >= freq_min) & (freqs <= freq_max)
        
        D_filtered = D[freq_mask, :]
        DB_filtered = DB[freq_mask, :]
        freqs_filtered = freqs[freq_mask]

        # Extract dominant frequencies
        main_freqs = []
        for i in range(D_filtered.shape[1]):
            col = D_filtered[:, i]
            
            # Find peaks
            peaks, properties = find_peaks(col, height=np.max(col) * 0.3, distance=10)
            
            if len(peaks) > 0:
                # Select strongest peak
                strongest_peak = peaks[np.argmax(col[peaks])]
                
                # Use parabolic interpolation for better accuracy
                if strongest_peak > 0 and strongest_peak < len(col) - 1:
                    y0, y1, y2 = col[strongest_peak-1], col[strongest_peak], col[strongest_peak+1]
                    offset = 0.5 * (y0 - y2) / (y0 - 2*y1 + y2) if (y0 - 2*y1 + y2) != 0 else 0
                    peak_freq = freqs_filtered[strongest_peak] + offset * (freqs_filtered[1] - freqs_filtered[0])
                    main_freqs.append(peak_freq)
                else:
                    main_freqs.append(freqs_filtered[strongest_peak])
            else:
                # fallback
                main_freqs.append(freqs_filtered[np.argmax(col)])
        
        main_freqs = np.array(main_freqs)
        
        # Apply median filter
        kernel_size = min(11, len(main_freqs) if len(main_freqs) % 2 == 1 else len(main_freqs) - 1)
        if kernel_size >= 3:
            main_freqs = medfilt(main_freqs, kernel_size=kernel_size)
        
        # Find f_approach and f_recede more intelligently
        # Ignore first and last 15% of data
        valid_start = int(len(main_freqs) * 0.15)
        valid_end = int(len(main_freqs) * 0.85)
        valid_freqs = main_freqs[valid_start:valid_end]
        
        # Calculate percentiles instead of min/max to avoid outliers
        f_approach = np.percentile(valid_freqs, 98)  # top 2%
        f_recede = np.percentile(valid_freqs, 2)     # bottom 2%
        
        # Original frequency (geometric average more accurate than arithmetic)
        f_source = np.sqrt(f_approach * f_recede)
        
        c = 343.0  # speed of sound m/s
        
        # Doppler equation
        v = c * (f_approach - f_recede) / (f_approach + f_recede)
        
        # Calculate velocity for each frame
        velocities = c * (main_freqs - f_source) / f_source

        return jsonify({
            "times": times.tolist(),
            "frequencies": main_freqs.tolist(),
            "velocities": velocities.tolist(),
            "spectrogram": DB_filtered.tolist(),
            "freq_axis": freqs_filtered.tolist(),
            "estimated_velocity": float(v),
            "f_approach": float(f_approach),
            "f_recede": float(f_recede),
            "f_source": float(f_source),
            "message": "Analysis completed successfully"
        })
    except Exception as e:
        return jsonify({"error": f"Error processing file: {str(e)}"}), 500
# ---------------------------
# صفحة spectrogram
# ---------------------------
@app.route("/spectro")
def spectro():
    """Serve spectrogram analysis page"""
    return send_file("spectro.html")

####Drone and Sar


def allowed_audio_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_AUDIO_EXTENSIONS

def allowed_image_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

# Load your trained model
def load_drone_model(model_path):
    """Load your pre-trained drone classification model"""
    try:
        # Load the model (adjust based on how your model was saved)
        model = torch.load(model_path, map_location=torch.device('cpu'))
        model.eval()
        print(f"Model loaded successfully from {model_path}")
        return model
    except Exception as e:
        print(f"Error loading model: {e}")
        return None

# Load your model (update the path to your actual .pth file)
MODEL_PATH = "audio_cnn_model.pth"  # Change this to your model file path
drone_model = load_drone_model(MODEL_PATH)

def preprocess_audio_for_model(audio_path):
    """Preprocess audio to match your model's input requirements"""
    try:
        # Load audio file
        waveform, sr = librosa.load(audio_path, sr=SAMPLE_RATE)
        
        # Ensure consistent duration
        target_length = SAMPLE_RATE * DURATION
        if len(waveform) > target_length:
            waveform = waveform[:target_length]
        else:
            padding = target_length - len(waveform)
            waveform = np.pad(waveform, (0, padding))
        
        # Create mel spectrogram (adjust based on your model's requirements)
        mel_spectrogram = librosa.feature.melspectrogram(
            y=waveform,
            sr=SAMPLE_RATE,
            n_fft=N_FFT,
            hop_length=HOP_LENGTH,
            n_mels=N_MELS
        )
        
        # Convert to log scale
        log_mel_spectrogram = librosa.power_to_db(mel_spectrogram, ref=np.max)
        
        # Normalize
        log_mel_spectrogram = (log_mel_spectrogram - log_mel_spectrogram.mean()) / log_mel_spectrogram.std()
        
        # Add channel dimension and convert to tensor
        spectrogram_tensor = torch.tensor(log_mel_spectrogram).unsqueeze(0).unsqueeze(0).float()
        
        return spectrogram_tensor, waveform, sr
        
    except Exception as e:
        raise Exception(f"Audio preprocessing error: {str(e)}")

def classify_with_model(audio_path):
    """Use your trained model for classification"""
    if drone_model is None:
        return None
    
    try:
        # Preprocess audio
        spectrogram_tensor, waveform, sr = preprocess_audio_for_model(audio_path)
        
        # Make prediction
        with torch.no_grad():
            outputs = drone_model(spectrogram_tensor)
            probabilities = torch.softmax(outputs, dim=1)
            confidence, predicted = torch.max(probabilities, 1)
            
            # Update class labels to match your model's training
            class_labels = ['Drone', 'Bird', 'Noise']
            predicted_label = class_labels[predicted.item()]
            confidence_score = confidence.item()
        
        return {
            'label': predicted_label,
            'confidence': confidence_score,
            'model_used': True
        }
        
    except Exception as e:
        print(f"Model prediction error: {e}")
        return None

def analyze_sar_image(image_path, is_tiff=True):
    """
    Analyze SAR image using the provided Python code
    Returns: original_image, generated_plot, analysis_stats
    """
    try:
        if is_tiff:
            # Process TIFF files with rasterio
            with rasterio.open(image_path) as src:
                img = src.read(1)  # read first band
                
                # Get image metadata
                metadata = {
                    'width': src.width,
                    'height': src.height,
                    'crs': str(src.crs),
                    'transform': str(src.transform),
                    'count': src.count,
                    'dtype': str(src.dtypes[0])
                }
        else:
            # Process regular images (JPG, PNG)
            pil_img = Image.open(image_path)
            if pil_img.mode != 'L':
                img = np.array(pil_img.convert('L'))  # Convert to grayscale
            else:
                img = np.array(pil_img)
            
            metadata = {
                'width': pil_img.width,
                'height': pil_img.height,
                'mode': pil_img.mode,
                'format': pil_img.format
            }

        # Convert to dB scale (avoid log of zero) - This is the key SAR analysis step
        img_db = 10 * np.log10(img.astype(np.float64) + 1e-6)

        # ----------------------------
        # Generate the analysis plot (exactly as in your Python code)
        # ----------------------------
        plt.figure(figsize=(12, 6))

        # 1. Show image
        plt.subplot(1, 2, 1)
        plt.imshow(img_db, cmap="gray")
        plt.title("SAR Quicklook")
        plt.colorbar(label="Intensity (dB)")
        plt.axis("off")

        # 2. Histogram of intensities
        plt.subplot(1, 2, 2)
        plt.hist(img_db.flatten(), bins=200, color="darkorange", edgecolor="black")
        plt.xlabel("Backscatter Intensity (dB)")
        plt.ylabel("Number of Pixels")
        plt.title("Histogram of Pixel Intensities")

        plt.tight_layout()

        # Save plot to bytes
        plot_buffer = io.BytesIO()
        plt.savefig(plot_buffer, format='png', dpi=150, bbox_inches='tight')
        plot_buffer.seek(0)
        plot_data = base64.b64encode(plot_buffer.getvalue()).decode('utf-8')
        plt.close()

        # Create display version of original image (converted to PNG)
        original_buffer = io.BytesIO()
        
        if is_tiff:
            # Convert TIFF to PNG for display using the dB scaled image
            plt.figure(figsize=(8, 6))
            plt.imshow(img_db, cmap="gray")
            plt.title("SAR Image (dB Scale)")
            plt.colorbar(label="Intensity (dB)")
            plt.axis("off")
            plt.tight_layout()
            plt.savefig(original_buffer, format='png', dpi=150, bbox_inches='tight')
            plt.close()
        else:
            # For regular images
            plt.figure(figsize=(8, 6))
            plt.imshow(img, cmap="viridis")
            plt.title("Uploaded Image")
            plt.colorbar(label="Intensity")
            plt.axis("off")
            plt.tight_layout()
            plt.savefig(original_buffer, format='png', dpi=150, bbox_inches='tight')
            plt.close()
        
        original_buffer.seek(0)
        original_data = base64.b64encode(original_buffer.getvalue()).decode('utf-8')

        # Calculate statistics (exactly as in your Python code)
        stats = {
            'mean': round(float(np.mean(img_db)), 4),
            'median': round(float(np.median(img_db)), 4),
            'min': round(float(np.min(img_db)), 4),
            'max': round(float(np.max(img_db)), 4),
            'std': round(float(np.std(img_db)), 4),
            'variance': round(float(np.var(img_db)), 4)
        }

        # Print statistics to console (for debugging)
        print("SAR Analysis Results:")
        print("Mean:", stats['mean'])
        print("Median:", stats['median'])
        print("Min:", stats['min'])
        print("Max:", stats['max'])
        print("Std:", stats['std'])

        return original_data, plot_data, stats, metadata

    except Exception as e:
        raise Exception(f"Error in SAR analysis: {str(e)}")



@app.route('/classify', methods=['POST'])
def classify_drone_audio():
    """
    Classify drone audio files using your trained model
    Expected: WAV file upload
    Returns: Classification results with confidence
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_audio_file(file.filename):
        return jsonify({'error': 'Invalid file type. Please upload a WAV file.'}), 400
    
    try:
        # Save file temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
        
        # Try to use the trained model first
        model_prediction = classify_with_model(temp_path)
        
        if model_prediction:
            # Use model prediction
            result = model_prediction
            result['analysis'] = {
                'model_used': True,
                'prediction_source': 'Trained Model'
            }
        else:
            # Fallback to mock classification if model fails
            import wave
            
            with wave.open(temp_path, 'rb') as wav_file:
                frames = wav_file.getnframes()
                rate = wav_file.getframerate()
                duration = frames / float(rate)
                
                # Read some sample data for mock analysis
                sample_width = wav_file.getsampwidth()
                frames = wav_file.readframes(min(1000, wav_file.getnframes()))
                
                if sample_width == 2:
                    # Convert to numpy array for analysis
                    data = np.frombuffer(frames, dtype=np.int16)
                else:
                    data = np.frombuffer(frames, dtype=np.int8)
            
            # Mock classification based on audio characteristics
            features = {
                'duration': duration,
                'mean_amplitude': np.mean(np.abs(data)),
                'std_amplitude': np.std(data),
                'max_frequency': np.max(np.abs(np.fft.fft(data))),
            }
            
            # Simple mock classifier
            drone_types = ['Drone', 'Bird', 'Noise']
            confidence = np.random.uniform(0.7, 0.98)
            
            # Determine drone type based on features (mock logic)
            if features['duration'] > 5 and features['mean_amplitude'] > 1000:
                label = drone_types[0]  # DJI Phantom
            elif features['max_frequency'] > 5000:
                label = drone_types[1]  # DJI Mavic
            elif features['std_amplitude'] > 500:
                label = drone_types[2]  # Autel Evo
            else:
                label = drone_types[3]  # Custom Quadcopter
            
            result = {
                'label': label,
                'confidence': round(confidence, 3),
                'analysis': {
                    'duration_seconds': round(duration, 2),
                    'sample_rate': rate,
                    'audio_characteristics': {
                        'mean_amplitude': round(float(features['mean_amplitude']), 2),
                        'std_amplitude': round(float(features['std_amplitude']), 2),
                        'max_frequency': round(float(features['max_frequency']), 2)
                    },
                    'model_used': False,
                    'prediction_source': 'Fallback Analysis'
                }
            }
        
        # Clean up temporary file
        os.unlink(temp_path)
        
        return jsonify(result)
        
    except Exception as e:
        # Clean up in case of error
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)
        return jsonify({'error': f'Error processing audio file: {str(e)}'}), 500

@app.route('/sar/analyze', methods=['POST'])
def analyze_sar():
    """
    Analyze SAR images and generate intensity plots using the provided Python code
    Expected: Image file (TIFF, JPG, PNG)
    Returns: Original image, analysis plot, and statistical data
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not allowed_image_file(file.filename):
        return jsonify({'error': 'Invalid file type. Please upload TIFF, JPG, or PNG files.'}), 400
    
    try:
        # Save file temporarily
        file_ext = os.path.splitext(file.filename)[1].lower()
        with tempfile.NamedTemporaryFile(delete=False, suffix=file_ext) as temp_file:
            file.save(temp_file.name)
            temp_path = temp_file.name
        
        # Determine if it's a TIFF file
        is_tiff = file.filename.lower().endswith(('.tif', '.tiff'))
        
        # Analyze the SAR image using the provided Python code
        original_data, plot_data, stats, metadata = analyze_sar_image(temp_path, is_tiff)
        
        # Clean up temporary files
        os.unlink(temp_path)
        
        return jsonify({
            'original_image': f'data:image/png;base64,{original_data}',
            'generated_plot': f'data:image/png;base64,{plot_data}',
            'analysis': stats,
            'metadata': metadata,
            'file_info': {
                'original_name': file.filename,
                'processed_type': 'PNG',
                'is_sar_image': is_tiff
            }
        })
        
    except Exception as e:
        # Clean up in case of error
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)
        return jsonify({'error': f'Error processing SAR image: {str(e)}'}), 500

@app.route('/sar/convert', methods=['POST'])
def convert_tiff():
    """
    Convert TIFF files to PNG format
    """
    if 'file' not in request.files:
        return jsonify({'error': 'No file uploaded'}), 400
    
    file = request.files['file']
    if file.filename == '':
        return jsonify({'error': 'No file selected'}), 400
    
    if not file.filename.lower().endswith(('.tif', '.tiff')):
        return jsonify({'error': 'Please upload a TIFF file for conversion'}), 400
    
    try:
        # Save TIFF temporarily
        with tempfile.NamedTemporaryFile(delete=False, suffix='.tif') as temp_tiff:
            file.save(temp_tiff.name)
            tiff_path = temp_tiff.name
        
        # Convert to PNG using the SAR analysis function
        original_data, _, _, _ = analyze_sar_image(tiff_path, is_tiff=True)
        
        # Clean up
        os.unlink(tiff_path)
        
        return jsonify({
            'converted_image': f'data:image/png;base64,{original_data}',
            'original_filename': file.filename,
            'message': 'TIFF successfully converted to PNG'
        })
        
    except Exception as e:
        if 'tiff_path' in locals() and os.path.exists(tiff_path):
            os.unlink(tiff_path)
        return jsonify({'error': f'Error converting TIFF to PNG: {str(e)}'}), 500


# =============================================================================
# Application Entry Point
# =============================================================================

if __name__ == "__main__":
    print(f"🚀 Starting Multi-Model Medical Analysis Server")
    print(f"📍 Upload directory: {os.path.abspath(UPLOAD_DIR)}")
    print(f"📊 Supported file types: {ALLOWED_EXTENSIONS}")
    print(f"🤖 Models: ECG - {'Loaded' if ecg_model else 'Not loaded'}, EEG - {'Loaded' if eeg_model else 'Not loaded'}")
    print(f"🌐 Web Applications:")
    print(f"   - Main: http://127.0.0.1:5000")
    print(f"   - ECG Analysis: http://127.0.0.1:5000/ecg")
    print(f"   - EEG Analysis: http://127.0.0.1:5000/eeg")
    print(f"🌐 API Health: http://127.0.0.1:5000/api/health")
    
    port = int(os.environ.get("PORT", 5000))
    app.run(debug=True, host='0.0.0.0', port=port)
