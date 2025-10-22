# =============================================================================
# Fix matplotlib backend to avoid tkinter threading issues
# =============================================================================
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from flask import Flask, request, jsonify, send_file, render_template, send_from_directory, request
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
from scipy import signal
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
from transformers import AutoProcessor, AutoModelForAudioClassification

from voice_model import ECAPA_gender
import torch.nn.functional as F
import  torchaudio,torchaudio.functional as F
from typing import Optional

from model_detect_antialiasing import predict_label

# Import your model functions
try:
    from model import get_model
except ImportError:
    # Fallback for production
    def get_model(n_classes, last_layer):
        # You might need to implement a fallback or ensure model.py is included
        pass

app = Flask(__name__)
# Allow all origins for development
CORS(app)

# =============================================================================
# Configuration
# =============================================================================
UPLOAD_DIR = "uploads"
PROCESSED_FOLDER = "processed"
MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
ALLOWED_EXTENSIONS = {'npy', 'npz', 'csv', 'txt'}

# Configuration of drone and sar
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max file size
ALLOWED_AUDIO_EXTENSIONS = {'wav', 'mp3', 'm4a', 'flac', 'aac'}
ALLOWED_IMAGE_EXTENSIONS = {'tif', 'tiff', 'jpg', 'jpeg', 'png'}

# Create directories
os.makedirs(UPLOAD_DIR, exist_ok=True)
os.makedirs(PROCESSED_FOLDER, exist_ok=True)
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

# Load Drone Model
try:
    MODEL_NAME = "preszzz/drone-audio-detection-05-17-trial-0"
    print(f"🚀 Loading drone model: {MODEL_NAME}")
    processor = AutoProcessor.from_pretrained(MODEL_NAME)
    model = AutoModelForAudioClassification.from_pretrained(MODEL_NAME)
    print("✅ Drone model loaded successfully")
    print(f"📋 Available drone classes: {list(model.config.id2label.values())}")
except Exception as e:
    print(f"❌ Error loading drone model: {e}")
    processor = None
    model = None


# doppler model
# Define upload and processed folders for downsampling
DOPPLER_DOWNSAMPLING_UPLOAD_FOLDER = 'uploads/doppler_downsampling'
DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER = 'processed/doppler_downsampling'

# Create directories if they don't exist
os.makedirs(DOPPLER_DOWNSAMPLING_UPLOAD_FOLDER, exist_ok=True)
os.makedirs(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, exist_ok=True)
# =============================================================================
# Helper Functions
# =============================================================================

def allowed_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def allowed_audio_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_AUDIO_EXTENSIONS

def allowed_image_file(filename):
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_IMAGE_EXTENSIONS

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

def validate_audio_file(audio_path):
    """Validate audio file before processing"""
    try:
        # Check file exists and has content
        if not os.path.exists(audio_path):
            raise ValueError("Audio file does not exist")
        
        file_size = os.path.getsize(audio_path)
        if file_size < 100:
            raise ValueError(f"Audio file too small ({file_size} bytes)")
        
        # Try to load and get basic info
        waveform, sr = librosa.load(audio_path, sr=None, duration=1)  # Load just 1 second for validation
        
        if len(waveform) < 400:
            raise ValueError(f"Audio too short: {len(waveform)} samples")
        
        if sr < 8000:
            raise ValueError(f"Sample rate too low: {sr} Hz")
            
        print(f"✅ Audio validation passed - SR: {sr} Hz, Samples: {len(waveform)}")
        return True
        
    except Exception as e:
        print(f"❌ Audio validation failed: {e}")
        raise ValueError(f"Invalid audio file: {str(e)}")

def predict_drone(audio_path):
    try:
        print(f"🔊 Loading audio from: {audio_path}")
        
        # Load with librosa - ensure we get enough samples
        waveform, sr = librosa.load(
            audio_path, 
            sr=16000,
            mono=True,
            duration=5.0  # Ensure minimum 5 seconds
        )
        
        print(f"✅ Audio loaded - SR: {sr} Hz, Samples: {len(waveform)}, Duration: {len(waveform)/sr:.2f}s")
        
        # Validate minimum length - need at least 1 second for processing
        min_samples = 16000  # 1 second at 16kHz
        if len(waveform) < min_samples:
            print(f"⚠️ Audio too short ({len(waveform)} samples), padding to {min_samples}")
            # Pad with zeros to reach minimum length
            padded_waveform = np.zeros(min_samples)
            padded_waveform[:len(waveform)] = waveform
            waveform = padded_waveform
        
        print(f"🎯 Final waveform shape: {waveform.shape}, Min: {waveform.min():.4f}, Max: {waveform.max():.4f}")
        
        # Convert to torch tensor - ensure correct shape for processor
        # The processor expects a 1D array for single audio
        waveform_tensor = torch.from_numpy(waveform).float()
        print(f"🎯 Tensor shape: {waveform_tensor.shape}")
        
        # Model input - use the raw waveform, not unsqueezed
        print("🧠 Preparing model input...")
        inputs = processor(
            waveform_tensor,  # Use 1D tensor, processor will handle batching
            sampling_rate=16000, 
            return_tensors="pt", 
            padding=True
        )
        
        print(f"✅ Inputs prepared: {inputs.keys()}")
        print(f"   - input_values shape: {inputs['input_values'].shape}")

        with torch.no_grad():
            logits = model(**inputs).logits
            pred_id = torch.argmax(logits, dim=-1).item()
            label = model.config.id2label[pred_id]
            
            # Calculate confidence scores
            probabilities = torch.nn.functional.softmax(logits, dim=1)
            confidence = probabilities[0][pred_id].item()
            
            print(f"✅ Drone classification: {label} (confidence: {confidence:.3f})")
        
        return label, confidence
        
    except Exception as e:
        print(f"❌ Error in predict_drone: {str(e)}")
        traceback.print_exc()
        raise e
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


# Drone Downsampling Endpoints - ADD THESE ROUTES
# =============================================================================

@app.route("/drone-downsampling")
def drone_downsampling_page():
    """Serve drone downsampling analysis page"""
    try:
        return send_file("drone-downsampling.html")
    except FileNotFoundError:
        return "Drone downsampling page not found", 404

@app.route("/api/drone-downsample/upload", methods=["POST"])
def upload_drone_audio():
    """Upload audio file for downsampling analysis"""
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        if not allowed_audio_file(file.filename):
            return jsonify({"error": f"Invalid file type. Allowed: {ALLOWED_AUDIO_EXTENSIONS}"}), 400

        # Save with timestamp
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')
        safe_filename = secure_filename(file.filename)
        filename = f"{timestamp}_{safe_filename}"
        file_path = os.path.join(UPLOAD_DIR, filename)
        file.save(file_path)

        # Get audio info
        y, sr = librosa.load(file_path, sr=None)
        duration = len(y) / sr

        return jsonify({
            "success": True,
            "filename": filename,
            "audio_info": {
                "original_sample_rate": sr,
                "duration_seconds": round(duration, 2),
                "samples": len(y),
                "file_size": os.path.getsize(file_path)
            }
        })

    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@app.route("/api/drone-downsample/process", methods=["POST"])
def drone_downsample():
    """Downsample audio and get real-time predictions"""
    try:
        data = request.get_json()

        if not data or "filename" not in data or "sample_rate" not in data:
            return jsonify({"error": "Missing 'filename' or 'sample_rate'"}), 400

        filename = os.path.basename(data["filename"])
        new_sr = int(data["sample_rate"])

        if new_sr < 3000 or new_sr > 16000:
            return jsonify({"error": "Sample rate must be between 3000-16000 Hz"}), 400

        # Use your existing UPLOAD_DIR
        in_path = os.path.join(UPLOAD_DIR, filename)
        if not os.path.exists(in_path):
            return jsonify({"error": "File not found"}), 404

        # Load and downsample audio
        waveform, orig_sr = torchaudio.load(in_path)
        
        print(f"🔄 Downsampling: {orig_sr}Hz → {new_sr}Hz")
        
        # Resample using torchaudio
        downsampled = F.resample(waveform, orig_freq=orig_sr, new_freq=new_sr)

        # Save processed audio with unique name
        out_filename = f"downsampled_{new_sr}hz_{filename}"
        out_path = os.path.join(PROCESSED_FOLDER, out_filename)
        torchaudio.save(out_path, downsampled, new_sr)

        # Use your EXISTING predict_drone function
        label, confidence = predict_drone(out_path)

        return jsonify({
            "success": True,
            "sample_rate": new_sr,
            "label": label,
            "confidence": round(confidence, 4),
            "confidence_percent": round(confidence * 100, 1),
            "audio_url": f"/api/drone-downsample/audio/{out_filename}",
            "message": f"Analysis at {new_sr}Hz completed"
        })

    except Exception as e:
        print(f"❌ Downsampling error: {str(e)}")
        return jsonify({"error": f"Processing failed: {str(e)}"}), 500

@app.route("/api/drone-downsample/audio/<filename>")
def serve_processed_audio(filename):
    """Serve processed audio files"""
    try:
        safe_filename = os.path.basename(filename)
        return send_from_directory(PROCESSED_FOLDER, safe_filename)
    except FileNotFoundError:
        return jsonify({"error": "Audio file not found"}), 404

# =============================================================================
# Voice Gender Classification - ECAPA-TDNN Integration
# =============================================================================

# Load Voice Gender Classification Model
try:
    # Load the model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    voice_model = ECAPA_gender(C=1024)
    
    # Load the trained weights
    model_path = "gender_classifier.model"
    if os.path.exists(model_path):
        voice_model.load_state_dict(torch.load(model_path, map_location=device))
        voice_model.to(device)
        voice_model.eval()
        print("✅ ECAPA-TDNN Voice Gender Classification Model loaded successfully")
        print(f"✅ Model device: {device}")
    else:
        print(f"❌ Model file not found: {model_path}")
        voice_model = None
        
except Exception as e:
    print(f"❌ Error loading voice gender model: {e}")
    traceback.print_exc()
    voice_model = None

def preprocess_audio_for_ecapa(audio_path, target_sr=16000, duration=3.0):
    """Preprocess audio for ECAPA-TDNN model"""
    try:
        print(f"🔄 Preprocessing audio: {audio_path}")
        
        # Load audio using torchaudio (matching your model's load_audio method)
        audio, sr = torchaudio.load(audio_path)
        print(f"✅ Audio loaded - original shape: {audio.shape}, sample rate: {sr}")
        
        # Resample if necessary
        if sr != target_sr:
            print(f"🔄 Resampling from {sr}Hz to {target_sr}Hz")
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=target_sr)
            audio = resampler(audio)
        
        # Convert to mono
        if audio.shape[0] > 1:
            print("🔄 Converting stereo to mono")
            audio = audio.mean(dim=0, keepdim=True)
        
        # Ensure minimum length
        min_samples = int(target_sr * 1.0)  # At least 1 second
        current_samples = audio.shape[1]
        print(f"📊 Current samples: {current_samples}, Min required: {min_samples}")
        
        if current_samples < min_samples:
            # Pad with zeros
            padding = min_samples - current_samples
            print(f"🔄 Padding audio with {padding} zeros")
            audio = torch.nn.functional.pad(audio, (0, padding))
        else:
            # Take first 3 seconds
            max_samples = int(target_sr * duration)
            if current_samples > max_samples:
                print(f"🔄 Truncating audio to {max_samples} samples ({duration}s)")
                audio = audio[:, :max_samples]
        
        print(f"✅ Final audio shape: {audio.shape}")
        return audio
        
    except Exception as e:
        print(f"❌ Audio preprocessing failed: {str(e)}")
        traceback.print_exc()
        raise Exception(f"Audio preprocessing failed: {str(e)}")
    
def predict_voice_gender_ecapa(audio_path):
    """Predict voice gender using ECAPA-TDNN model"""
    try:
        if voice_model is None:
            raise Exception("Voice model not loaded")
        
        print(f"🎯 Starting voice prediction for: {audio_path}")
        
        # Preprocess audio
        audio_tensor = preprocess_audio_for_ecapa(audio_path)
        print(f"✅ Audio preprocessed - shape: {audio_tensor.shape}")
        
        # Move to appropriate device
        audio_tensor = audio_tensor.to(device)
        print(f"✅ Audio moved to device: {device}")
        
        # Run inference
        with torch.no_grad():
            print("🧠 Running model inference...")
            outputs = voice_model(audio_tensor)
            print(f"✅ Model output shape: {outputs.shape}")
            print(f"✅ Raw outputs: {outputs}")
            
            probabilities = torch.nn.functional.softmax(outputs, dim=1)
            print(f"✅ Probabilities: {probabilities}")
            
            confidence, prediction = torch.max(probabilities, dim=1)
            print(f"✅ Prediction: {prediction.item()}, Confidence: {confidence.item()}")
            
            gender = "male" if prediction.item() == 0 else "female"
            confidence_value = confidence.item()
            
            # Get probabilities for both classes
            male_prob = probabilities[0][0].item()
            female_prob = probabilities[0][1].item()
            
            print(f"🎯 Final prediction: {gender} (confidence: {confidence_value:.4f})")
        
        return {
            "gender": gender,
            "confidence": round(float(confidence_value), 4),
            "probabilities": {
                "male": round(float(male_prob), 4),
                "female": round(float(female_prob), 4)
            },
            "raw_output": {
                "male_score": float(outputs[0][0].item()),
                "female_score": float(outputs[0][1].item())
            }
        }
        
    except Exception as e:
        print(f"❌ Prediction failed with error: {str(e)}")
        print(f"❌ Error type: {type(e).__name__}")
        traceback.print_exc()
        raise Exception(f"Prediction failed: {str(e)}")
    
# =============================================================================

# Main Routes - Serve All HTML Pages
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
    """Serve EEG analysis page"""
    return send_file("eeg.html")

@app.route("/doppler-analysis")
def doppler_analysis():
    """Serve Doppler analysis page"""
    return send_file("doppler-analysis.html")

@app.route("/spectro")
def spectro():
    """Serve spectrogram analysis page"""
    return send_file("spectro.html")

@app.route("/drone-sar-analysis")
def drone_sar_analysis():
    """Serve drone and SAR analysis page"""
    return send_file("drone-sar-analysis.html")

# Serve any other HTML pages you have
@app.route("/<page_name>.html")
def serve_html(page_name):
    """Serve any HTML page by name"""
    try:
        return send_file(f"{page_name}.html")
    except FileNotFoundError:
        return f"Page {page_name}.html not found", 404

# =============================================================================
# Static File Serving
# =============================================================================

@app.route('/js/<path:filename>')
def serve_js(filename):
    """Serve JavaScript files"""
    return send_from_directory('js', filename)

@app.route('/css/<path:filename>')
def serve_css(filename):
    """Serve CSS files"""
    return send_from_directory('css', filename)

@app.route('/images/<path:filename>')
def serve_images(filename):
    """Serve image files"""
    return send_from_directory('images', filename)

@app.route('/icons/<path:filename>')
def serve_icons(filename):
    """Serve icon files"""
    return send_from_directory('icons', filename)

# Serve any other static files
@app.route('/<path:filename>')
def serve_static_files(filename):
    """Serve any static files (fallback)"""
    try:
        return send_from_directory('.', filename)
    except FileNotFoundError:
        return "File not found", 404

# =============================================================================
# Health Check & System Info
# =============================================================================

@app.route("/api/health", methods=["GET"])
def api_health():
    """Health check endpoint"""
    return jsonify({
        "status": "healthy",
        "message": "Multi-Model Medical Analysis API is running",
        "timestamp": datetime.now().isoformat(),
        "models_loaded": {
            "ecg_model": ecg_model is not None,
            "eeg_model": eeg_model is not None,
            "drone_model": model is not None,
            "voice_gender_model": voice_model is not None
        }
    })

@app.route('/health', methods=["GET"])


def health_check():
    return jsonify({
        "message": "Multi-Model Medical Analysis API is running",
        "status": "healthy",
        "models_loaded": {
            "ecg_model": ecg_model is not None,
            "eeg_model": eeg_model is not None,

            "drone_model": model is not None,

            "drone_model": model is not None,
            "voice_gender_model": voice_model is not None

        },
        "upload_directory": UPLOAD_DIR,
        "supported_applications": [
            "ECG Analysis", 
            "EEG Classification", 
            "Doppler Analysis",
            "Drone Audio Classification",
            "EEG Downsampling Analysis", 
            "SAR Image Analysis",
            "Voice Gender Classification (ECAPA-TDNN)"

        ],
         "eeg_downsampling_endpoints": [  # Add this section
            "/api/classify_eeg_downsampled (POST)",
            "/api/compare_eeg_analysis (POST)"
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


         # Get undersampling parameters from frontend
        original_sampling_rate = int(request.form.get("original_sr", 250))
        target_sampling_rate = int(request.form.get("target_sr", 250))
        exaggerate_effects = request.form.get("exaggerate_effects", "false").lower() == "true"



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

        # Apply undersampling if requested
        if target_sampling_rate < original_sampling_rate:
            print(f"🔄 Applying undersampling: {original_sampling_rate}Hz → {target_sampling_rate}Hz")
            ecg_array = apply_ecg_undersampling(ecg_array, original_sampling_rate, target_sampling_rate, exaggerate_effects)

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

        original_confidence = float(probs[0][best_index])
        
        # Calculate aliasing impact on classification confidence
        aliasing_impact = calculate_aliasing_impact(target_sampling_rate)
        adjusted_confidence = adjust_confidence_for_aliasing(original_confidence, aliasing_impact)
        
        print(f"📊 Classification - Original: {original_confidence:.3f}, Adjusted: {adjusted_confidence:.3f}")
        print(f"📊 Aliasing Impact: {aliasing_impact['level']} (risk: {aliasing_impact['risk']})")

        return jsonify({
            "normal_abnormal": normal_abnormal,
            "best_class": ecg_labels[best_index],
            "best_prob": float(probs[0][best_index]),
            "all_probabilities": {ecg_labels[i]: float(probs[0][i]) for i in range(len(ecg_labels))},
            "adjusted_confidence": adjusted_confidence,
            "aliasing_impact": aliasing_impact,
            "all_probabilities": {ecg_labels[i]: float(probs[0][i]) for i in range(len(ecg_labels))},
            "sampling_info": {
                "original_sr": original_sampling_rate,
                "target_sr": target_sampling_rate,
                "undersampled": target_sampling_rate < original_sampling_rate
                }
            })

            


    except Exception as e:
        return jsonify({"error": str(e)}), 500


def apply_ecg_undersampling(ecg_signal, original_sr, target_sr, exaggerate=False):
    """
    Apply undersampling to ECG signal with optional exaggerated effects
    """
    downsampling_factor = original_sr / target_sr
    
    if downsampling_factor <= 1:
        return ecg_signal  # No undersampling needed
    
    processed_signal = []
    
    if exaggerate and target_sr < 50:
        # EXAGGERATED EFFECTS: Make aliasing much more obvious
        print("🎭 Applying exaggerated undersampling effects")
        
        for i in range(0, len(ecg_signal), int(downsampling_factor)):
            original_index = min(i, len(ecg_signal) - 1)
            sample = ecg_signal[original_index].copy()
            
            # Add dramatic aliasing effects based on sampling rate
            if target_sr < 30:
                # CRITICAL ALIASING: Severe distortion
                for ch in range(sample.shape[0]):
                    # Add high-frequency noise that aliases down
                    high_freq_noise = np.sin(i * 2) * 0.2
                    medium_freq_noise = np.cos(i * 1.5) * 0.15
                    random_noise = (np.random.random() - 0.5) * 0.1
                    
                    sample[ch] += high_freq_noise + medium_freq_noise + random_noise
            elif target_sr < 50:
                # SEVERE ALIASING: Moderate distortion
                for ch in range(sample.shape[0]):
                    alias_noise = np.sin(i * 1.2) * 0.15
                    random_noise = (np.random.random() - 0.5) * 0.05
                    sample[ch] += alias_noise + random_noise
            elif target_sr < 100:
                # MILD ALIASING: Subtle distortion
                for ch in range(sample.shape[0]):
                    subtle_noise = np.sin(i * 0.8) * 0.08
                    sample[ch] += subtle_noise
            
            processed_signal.append(sample)
    else:
        # NORMAL EFFECTS: Simple decimation only
        print("📊 Applying normal undersampling (simple decimation)")
        for i in range(0, len(ecg_signal), int(downsampling_factor)):
            processed_signal.append(ecg_signal[min(i, len(ecg_signal) - 1)])
    
    processed_signal = np.array(processed_signal)
    print(f"📊 Undersampling applied: {len(ecg_signal)} → {len(processed_signal)} samples")
    return processed_signal

def calculate_aliasing_impact(sampling_rate):
    """
    Calculate the impact of aliasing on classification reliability
    """
    nyquist_freq = sampling_rate / 2
    ecg_bandwidth = 40  # Typical ECG bandwidth in Hz
    
    if nyquist_freq < 15:
        return {
            "level": "critical",
            "confidence_reduction": 0.7,  # 70% reduction in confidence
            "risk": "Very High",
            "effect": "Complete waveform distortion",
            "false_negatives": ["Ventricular Tachycardia", "Bundle Branch Blocks", "All high-frequency abnormalities"],
            "false_positives": ["Artifactual PVCs", "False ST elevation", "Pseudodepolarization"]
        }
    elif nyquist_freq < 25:
        return {
            "level": "severe",
            "confidence_reduction": 0.5,  # 50% reduction
            "risk": "High",
            "effect": "Major features lost",
            "false_negatives": ["Atrial Flutter", "RBBB/LBBB", "P-wave abnormalities"],
            "false_positives": ["False ischemia", "Artifactual notching", "Pseudobradycardia"]
        }
    elif nyquist_freq < ecg_bandwidth:
        return {
            "level": "moderate",
            "confidence_reduction": 0.3,  # 30% reduction
            "risk": "Medium",
            "effect": "High-frequency details lost",
            "false_negatives": ["Subtle ST changes", "Early repolarization", "P-wave morphology"],
            "false_positives": ["Minor ST artifacting", "False axis deviation", "Pseudoarrhythmia"]
        }
    elif nyquist_freq < 100:
        return {
            "level": "mild",
            "confidence_reduction": 0.1,  # 10% reduction
            "risk": "Low",
            "effect": "Minor distortions",
            "false_negatives": ["Very subtle abnormalities", "Minor conduction defects"],
            "false_positives": ["Minimal artifacting", "Borderline case errors"]
        }
    else:
        return {
            "level": "minimal",
            "confidence_reduction": 0.0,  # No reduction
            "risk": "Very Low",
            "effect": "Reliable classification",
            "false_negatives": ["None expected"],
            "false_positives": ["None expected"]
        }

def adjust_confidence_for_aliasing(original_confidence, aliasing_impact):
    """
    Adjust classification confidence based on aliasing impact
    """
    reduction = aliasing_impact["confidence_reduction"]
    adjusted = original_confidence * (1 - reduction)
    return max(0.0, min(1.0, adjusted))  # Clamp between 0 and 1

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
# EEG Downsampling Analysis Endpoints
# =============================================================================

@app.route('/api/classify_eeg_downsampled', methods=['POST'])
def classify_eeg_downsampled():
    """Classify EEG signals with downsampling option"""
    try:
        if eeg_model is None:
            return jsonify({'error': 'EEG Model not loaded'}), 500

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Empty filename'}), 400

        # Get downsampling rate from request (default to 128Hz - no downsampling)
        downsampling_rate = request.form.get('downsampling_rate', 128, type=int)
        print(f"🎯 Downsampling rate requested: {downsampling_rate} Hz")

        # Secure and temporarily save file
        filename = secure_filename(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), filename)
        file.save(temp_path)
        print(f"📁 Uploaded EEG file saved to: {temp_path}")

        # Load signal
        signal = np.load(temp_path, allow_pickle=True)
        print(f"📊 Loaded EEG signal shape: {signal.shape}")

        # Apply downsampling if requested rate is different from original
        if downsampling_rate < 128:
            signal = apply_downsampling_to_signal(signal, downsampling_rate)
            print(f"📉 Downsampled signal shape: {signal.shape}")

        # Preprocess
        tensor = preprocess_eeg_signal(signal)

        # Run model inference
        results = run_eeg_model_inference(tensor)

        # Clean up
        os.remove(temp_path)

        # Return JSON response with downsampling info
        return jsonify({
            'prediction': results['prediction'],
            'confidence': results['confidence'],
            'probabilities': results['all_probabilities'],
            'downsampling_rate': downsampling_rate,
            'original_rate': 128,
            'signal_shape_after_downsampling': list(signal.shape)
        })

    except Exception as e:
        print(f"❌ EEG Downsampled Classification Error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def apply_downsampling_to_signal(signal, target_rate):
    """
    Apply Nyquist downsampling to EEG signal
    Args:
        signal: numpy array of EEG data
        target_rate: target sampling rate (Hz)
    Returns:
        downsampled_signal: numpy array with reduced sampling rate
    """
    original_rate = 128  # Your original sampling rate
    downsampling_factor = original_rate // target_rate
    
    print(f"🔧 Downsampling: {original_rate}Hz -> {target_rate}Hz (factor: {downsampling_factor})")
    
    if signal.ndim == 3:
        # Shape: (trials, channels, samples) or (trials, samples, channels)
        if signal.shape[-1] == 19:  # (trials, samples, 19)
            # Transpose to (trials, 19, samples) for consistent processing
            signal = np.transpose(signal, (0, 2, 1))
        
        # Apply downsampling to each trial and channel
        downsampled_trials = []
        for trial in signal:
            downsampled_trial = []
            for channel in trial:
                # Take every nth sample
                downsampled_channel = channel[::downsampling_factor]
                downsampled_trial.append(downsampled_channel)
            downsampled_trials.append(np.array(downsampled_trial))
        
        downsampled_signal = np.array(downsampled_trials)
        
    elif signal.ndim == 2:
        # Shape: (channels, samples) or (samples, channels)
        if signal.shape[0] == 19:  # (19, samples)
            downsampled_signal = signal[:, ::downsampling_factor]
        elif signal.shape[1] == 19:  # (samples, 19)
            downsampled_signal = signal[::downsampling_factor, :]
        else:
            # Assume (samples, channels) and downsample along time axis
            downsampled_signal = signal[::downsampling_factor, :]
    
    else:
        # 1D signal - simple downsampling
        downsampled_signal = signal[::downsampling_factor]
    
    print(f"✅ Downsampled shape: {downsampled_signal.shape}")
    return downsampled_signal

@app.route('/api/compare_eeg_analysis', methods=['POST'])
def compare_eeg_analysis():
    """Compare analysis of original vs downsampled EEG signals"""
    try:
        if eeg_model is None:
            return jsonify({'error': 'EEG Model not loaded'}), 500

        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '':
            return jsonify({'error': 'Empty filename'}), 400

        # Get downsampling rate from request
        downsampling_rate = request.form.get('downsampling_rate', 64, type=int)
        print(f"🔄 Comparing analysis: Original vs {downsampling_rate}Hz")

        # Secure and temporarily save file
        filename = secure_filename(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), filename)
        file.save(temp_path)

        # Load original signal
        original_signal = np.load(temp_path, allow_pickle=True)
        
        # Create downsampled signal
        downsampled_signal = apply_downsampling_to_signal(original_signal.copy(), downsampling_rate)

        # Analyze original signal
        original_tensor = preprocess_eeg_signal(original_signal)
        original_results = run_eeg_model_inference(original_tensor)

        # Analyze downsampled signal
        downsampled_tensor = preprocess_eeg_signal(downsampled_signal)
        downsampled_results = run_eeg_model_inference(downsampled_tensor)

        # Clean up
        os.remove(temp_path)

        # Return comparison results
        return jsonify({
            'original_analysis': {
                'prediction': original_results['prediction'],
                'confidence': original_results['confidence'],
                'probabilities': original_results['all_probabilities'],
                'signal_shape': list(original_signal.shape)
            },
            'downsampled_analysis': {
                'prediction': downsampled_results['prediction'],
                'confidence': downsampled_results['confidence'],
                'probabilities': downsampled_results['all_probabilities'],
                'signal_shape': list(downsampled_signal.shape),
                'downsampling_rate': downsampling_rate
            },
            'comparison': {
                'prediction_changed': original_results['prediction'] != downsampled_results['prediction'],
                'confidence_difference': round(original_results['confidence'] - downsampled_results['confidence'], 4),
                'original_rate': 128,
                'downsampled_rate': downsampling_rate
            }
        })

    except Exception as e:
        print(f"❌ EEG Comparison Error: {str(e)}")
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500
    


    # =============================================================================
# Voice Gender Classification - ECAPA-TDNN Integration
# =============================================================================

# Load Voice Gender Classification Model
try:
    # Load the model
    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    voice_model = ECAPA_gender(C=1024)
    
    # Load the trained weights
    model_path = "gender_classifier.model"
    if os.path.exists(model_path):
        voice_model.load_state_dict(torch.load(model_path, map_location=device))
        voice_model.to(device)
        voice_model.eval()
        print("✅ ECAPA-TDNN Voice Gender Classification Model loaded successfully")
        print(f"✅ Model device: {device}")
    else:
        print(f"❌ Model file not found: {model_path}")
        voice_model = None
        
except Exception as e:
    print(f"❌ Error loading voice gender model: {e}")
    traceback.print_exc()
    voice_model = None

def preprocess_audio_for_ecapa(audio_path, target_sr=16000, duration=3.0):
    """Preprocess audio for ECAPA-TDNN model"""
    try:
        print(f"🔄 Preprocessing audio: {audio_path}")
        
        # Load audio using torchaudio (matching your model's load_audio method)
        audio, sr = torchaudio.load(audio_path)
        print(f"✅ Audio loaded - original shape: {audio.shape}, sample rate: {sr}")
        
        # Resample if necessary
        if sr != target_sr:
            print(f"🔄 Resampling from {sr}Hz to {target_sr}Hz")
            resampler = torchaudio.transforms.Resample(orig_freq=sr, new_freq=target_sr)
            audio = resampler(audio)
        
        # Convert to mono
        if audio.shape[0] > 1:
            print("🔄 Converting stereo to mono")
            audio = audio.mean(dim=0, keepdim=True)
        
        # Ensure minimum length
        min_samples = int(target_sr * 1.0)  # At least 1 second
        current_samples = audio.shape[1]
        print(f"📊 Current samples: {current_samples}, Min required: {min_samples}")
        
        if current_samples < min_samples:
            # Pad with zeros
            padding = min_samples - current_samples
            print(f"🔄 Padding audio with {padding} zeros")
            audio = torch.nn.functional.pad(audio, (0, padding))
        else:
            # Take first 3 seconds
            max_samples = int(target_sr * duration)
            if current_samples > max_samples:
                print(f"🔄 Truncating audio to {max_samples} samples ({duration}s)")
                audio = audio[:, :max_samples]
        
        print(f"✅ Final audio shape: {audio.shape}")
        return audio
        
    except Exception as e:
        print(f"❌ Audio preprocessing failed: {str(e)}")
        traceback.print_exc()
        raise Exception(f"Audio preprocessing failed: {str(e)}")
    
def predict_voice_gender_ecapa(audio_path):
    """Predict voice gender using ECAPA-TDNN model"""
    try:
        if voice_model is None:
            raise Exception("Voice model not loaded")
        
        print(f"🎯 Starting voice prediction for: {audio_path}")
        
        # Preprocess audio
        audio_tensor = preprocess_audio_for_ecapa(audio_path)
        print(f"✅ Audio preprocessed - shape: {audio_tensor.shape}")
        
        # Move to appropriate device
        audio_tensor = audio_tensor.to(device)
        print(f"✅ Audio moved to device: {device}")
        
        # Run inference
        with torch.no_grad():
            print("🧠 Running model inference...")
            outputs = voice_model(audio_tensor)
            print(f"✅ Model output shape: {outputs.shape}")
            print(f"✅ Raw outputs: {outputs}")
            
            probabilities = torch.nn.functional.softmax(outputs, dim=1)
            print(f"✅ Probabilities: {probabilities}")
            
            confidence, prediction = torch.max(probabilities, dim=1)
            print(f"✅ Prediction: {prediction.item()}, Confidence: {confidence.item()}")
            
            gender = "male" if prediction.item() == 0 else "female"
            confidence_value = confidence.item()
            
            # Get probabilities for both classes
            male_prob = probabilities[0][0].item()
            female_prob = probabilities[0][1].item()
            
            print(f"🎯 Final prediction: {gender} (confidence: {confidence_value:.4f})")
        
        return {
            "gender": gender,
            "confidence": round(float(confidence_value), 4),
            "probabilities": {
                "male": round(float(male_prob), 4),
                "female": round(float(female_prob), 4)
            },
            "raw_output": {
                "male_score": float(outputs[0][0].item()),
                "female_score": float(outputs[0][1].item())
            }
        }
        
    except Exception as e:
        print(f"❌ Prediction failed with error: {str(e)}")
        print(f"❌ Error type: {type(e)._name_}")
        traceback.print_exc()
        raise Exception(f"Prediction failed: {str(e)}")

# =============================================================================
# Voice Analysis Endpoints
# =============================================================================

@app.route("/voice-analysis")
def voice_analysis_page():
    """Serve voice analysis page"""
    try:
        return send_file("voice-analysis.html")
    except FileNotFoundError:
        return "Voice analysis page not found", 404

@app.route("/api/classify-voice", methods=["POST", "OPTIONS"])
def classify_voice():
    """Classify voice gender from audio file using ECAPA-TDNN"""
    try:
        print("🎯 Voice classification endpoint called")
        
        # Handle CORS preflight
        if request.method == 'OPTIONS':
            response = jsonify({'status': 'ok'})
            response.headers.add('Access-Control-Allow-Origin', '*')
            response.headers.add('Access-Control-Allow-Headers', 'Content-Type')
            response.headers.add('Access-Control-Allow-Methods', 'POST, OPTIONS')
            return response

        if voice_model is None:
            return jsonify({"error": "Voice gender model not loaded"}), 500

        if "file" not in request.files:
            return jsonify({"error": "No audio file uploaded"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        # Check file type
        if not allowed_audio_file(file.filename):
            return jsonify({"error": f"Invalid file type. Allowed: {ALLOWED_AUDIO_EXTENSIONS}"}), 400

        # Save file temporarily
        filename = secure_filename(file.filename)
        temp_path = os.path.join(UPLOAD_DIR, f"voice_{filename}")
        file.save(temp_path)
        
        print(f"📁 Saved voice file to: {temp_path}")
        print(f"📊 File size: {os.path.getsize(temp_path)} bytes")

        try:
            # Validate audio file
            print("🔍 Validating audio file...")
            validate_audio_file(temp_path)
            
            # Get audio info for frontend display
            y, sr = librosa.load(temp_path, sr=None)
            duration = len(y) / sr
            print(f"✅ Audio validated - Duration: {duration:.2f}s, Sample rate: {sr}Hz")
            
            # Classify gender using ECAPA-TDNN
            print("🎯 Starting gender classification...")
            result = predict_voice_gender_ecapa(temp_path)
            
            # Clean up
            os.remove(temp_path)
            
            print("✅ Voice classification completed successfully")
            
            # Return the complete result with CORS headers
            response_data = {
                "success": True,
                "gender": result["gender"],
                "confidence": result["confidence"],
                "probabilities": result["probabilities"],
                "raw_output": result.get("raw_output", {}),
                "audio_info": {
                    "duration": round(duration, 2),
                    "sample_rate": sr,
                    "samples": len(y)
                },
                "model_info": {
                    "model_type": "ECAPA-TDNN",
                    "architecture": "Deep Speaker Embedding",
                    "device": str(device)
                },
                "message": "Voice gender classification successful",
                "timestamp": datetime.now().isoformat()
            }
            
            response = jsonify(response_data)
            response.headers.add('Access-Control-Allow-Origin', '*')
            return response
            
        except Exception as e:
            # Clean up on error
            if os.path.exists(temp_path):
                os.remove(temp_path)
            print(f"❌ Error during classification: {str(e)}")
            traceback.print_exc()
            response = jsonify({"error": f"Classification failed: {str(e)}"})
            response.headers.add('Access-Control-Allow-Origin', '*')
            return response, 500

    except Exception as e:
        print(f"❌ Voice classification endpoint error: {str(e)}")
        traceback.print_exc()
        response = jsonify({"error": f"Voice classification failed: {str(e)}"})
        response.headers.add('Access-Control-Allow-Origin', '*')
        return response, 500

@app.route("/api/voice-model-status", methods=["GET"])
def voice_model_status():
    """Get voice model status"""
    print("🔍 Voice model status endpoint called")
    return jsonify({
        "model_loaded": voice_model is not None,
        "system_ready": voice_model is not None,
        "model_type": "ECAPA-TDNN",
        "model_architecture": "Deep Speaker Embedding Network",
        "input_requirements": "16kHz audio, 80-band Mel-spectrogram",
        "device": str(device) if voice_model else "None",
        "timestamp": datetime.now().isoformat()
    })

# Simple test endpoint
@app.route("/api/voice-test", methods=["GET"])
def voice_test():
    """Simple test endpoint for voice analysis"""
    return jsonify({
        "message": "Voice analysis endpoint is working!",
        "endpoint": "/api/voice-test",
        "model_loaded": voice_model is not None,
        "available_endpoints": [
            "/api/voice-model-status (GET)",
            "/api/classify-voice (POST)", 
            "/voice-analysis (GET)"
        ],
        "timestamp": datetime.now().isoformat()
    })
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

# =============================================================================
# Doppler Analysis Endpoints
# =============================================================================

@app.route('/simulate', methods=['POST'])
def simulate():
    data = request.get_json()
    sig_type = int(data['type'])
    f_engine = float(data['freq'])
    v_car = float(data['speed'])
    d_perp = float(data['dist'])

    fs = int(data.get('fs', 44000))
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




# ==================== DOWNSAMPLING ROUTES ====================

# =============================================================================
# Doppler Downsampling Routes
# =============================================================================

@app.route("/doppler-downsampling-upload", methods=["POST"])
def upload_doppler_downsampling_audio():
    """Upload audio file for downsampling"""
    try:
        if "file" not in request.files:
            return jsonify({"error": "No file uploaded"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        # Validate file type
        if not file.filename.lower().endswith('.wav'):
            return jsonify({"error": "Only WAV files are supported for downsampling"}), 400

        # Secure filename and save
        filename = secure_filename(file.filename)
        file_path = os.path.join(DOPPLER_DOWNSAMPLING_UPLOAD_FOLDER, filename)
        file.save(file_path)
        
        print(f"📁 Doppler downsampling file saved: {file_path}")
        return jsonify({"filename": filename})
        
    except Exception as e:
        return jsonify({"error": f"Upload failed: {str(e)}"}), 500

@app.route("/doppler-downsampling", methods=["POST"])
def doppler_downsample():
    """Downsample audio to target sample rate"""
    try:
        data = request.get_json()
        if not data or "filename" not in data or "sample_rate" not in data:
            return jsonify({"error": "Missing 'filename' or 'sample_rate'"}), 400

        filename = os.path.basename(data["filename"])
        new_sr = int(data["sample_rate"])

        if new_sr <= 0:
            return jsonify({"error": "Invalid sample rate"}), 400

        in_path = os.path.join(DOPPLER_DOWNSAMPLING_UPLOAD_FOLDER, filename)
        if not os.path.exists(in_path):
            return jsonify({"error": "File not found"}), 404

        # Load and resample audio
        waveform, orig_sr = torchaudio.load(in_path)
        aliased = F.resample(waveform, orig_freq=orig_sr, new_freq=new_sr)

        # Save processed file
        out_filename = f"{new_sr}_{filename}"
        out_path = os.path.join(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, out_filename)
        torchaudio.save(out_path, aliased, new_sr)

        return jsonify({
            "sample_rate": new_sr,
            "audio_url": f"/doppler-downsampling-processed/{out_filename}",
            "filename": out_filename
        })

    except Exception as e:
        print(f"❌ Downsampling error: {str(e)}")
        return jsonify({"error": str(e)}), 500

@app.route("/doppler-downsampling-processed/<filename>")
def serve_doppler_downsampling_audio(filename):
    """Serve processed downsampled audio"""
    return send_from_directory(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, filename)

@app.route("/doppler-downsampling-download/<filename>")
def download_dopple_downsampling_audio(filename):
    """Download processed downsampled audio"""
    safe_name = os.path.basename(filename)
    file_path = os.path.join(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, safe_name)
    if not os.path.exists(file_path):
        return jsonify({"error": "File not found"}), 404
    return send_from_directory(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, safe_name, as_attachment=True)

@app.route("/doppler-downsampling-waveform/<filename>")
def get_doppler_downsampling_waveform(filename):
    """Get waveform data for visualization"""
    try:
        safe_name = os.path.basename(filename)
        file_path = os.path.join(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, safe_name)
        if not os.path.exists(file_path):
            return jsonify({"error": "File not found"}), 404

        waveform, sr = torchaudio.load(file_path)
        data = waveform[0].tolist()
        
        # Downsample waveform for efficient frontend rendering
        max_points = 2000
        step = max(1, len(data) // max_points)
        downsampled = data[::step]

        return jsonify({
            "sample_rate": sr,
            "waveform": downsampled
        })
    except Exception as e:
        return jsonify({"error": f"Waveform extraction failed: {str(e)}"}), 500
        
        
# # ⬆️ رفع ملف الصوت
# @app.route("/doppler-downsampling-upload", methods=["POST"])
# def upload_doppler_downsampling_audio():
#     file = request.files["file"]
#     file_path = os.path.join(DOPPLER_DOWNSAMPLING_UPLOAD_FOLDER, file.filename)
#     file.save(file_path)
#     return jsonify({"filename": file.filename})


# # 🎚️ تنفيذ عملية الـ downsampling
# @app.route("/doppler-downsampling", methods=["POST"])
# def doppler_downsample():
#     try:
#         data = request.get_json()
#         if not data or "filename" not in data or "sample_rate" not in data:
#             return jsonify({"error": "Missing 'filename' or 'sample_rate'"}), 400

#         filename = os.path.basename(data["filename"])
#         new_sr = int(data["sample_rate"])

#         if new_sr <= 0:
#             return jsonify({"error": "Invalid sample rate"}), 400

#         in_path = os.path.join(DOPPLER_DOWNSAMPLING_UPLOAD_FOLDER, filename)
#         if not os.path.exists(in_path):
#             return jsonify({"error": "File not found"}), 404

#         waveform, orig_sr = torchaudio.load(in_path)
#         aliased = F.resample(waveform, orig_freq=orig_sr, new_freq=new_sr)

#         out_path = os.path.join(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, f"{new_sr}_{filename}")
#         torchaudio.save(out_path, aliased, new_sr)

#         return jsonify({
#             "sample_rate": new_sr,
#             "audio_url": f"/doppler-downsampling-processed/{new_sr}_{filename}"
#         })

#     except Exception as e:
#         return jsonify({"error": str(e)}), 500


# # 🔊 تقديم الملف الناتج لتشغيله
# @app.route("/doppler-downsampling-processed/<filename>")
# def serve_doppler_downsampling_audio(filename):
#     return send_from_directory(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, filename)


# # 💾 تحميل الملف الناتج
# @app.route("/doppler-downsampling-download/<filename>")
# def download_dopple_downsampling_audio(filename):
#     safe_name = os.path.basename(filename)
#     file_path = os.path.join(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, safe_name)
#     if not os.path.exists(file_path):
#         return jsonify({"error": "File not found"}), 404
#     return send_from_directory(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, safe_name, as_attachment=True)


# # 📈 رسم شكل الموجة
# @app.route("/doppler-downsampling-waveform/<filename>")
# def get_doppler_downsampling_waveform(filename):
#     safe_name = os.path.basename(filename)
#     file_path = os.path.join(DOPPLER_DOWNSAMPLING_PROCESSED_FOLDER, safe_name)
#     if not os.path.exists(file_path):
#         return jsonify({"error": "File not found"}), 404

#     waveform, sr = torchaudio.load(file_path)
#     data = waveform[0].tolist()
#     max_points = 2000
#     step = max(1, len(data) // max_points)
#     downsampled = data[::step]

#     return jsonify({
#         "sample_rate": sr,
#         "waveform": downsampled
#     })

# # =============================================================================
# # Drone Analysis Endpoints
# # =============================================================================

# @app.route("/drone-test", methods=["GET"])
# def drone_test():
#     """Test endpoint for drone analysis"""
#     return jsonify({
#         "message": "Drone analysis endpoint is working",
#         "model_loaded": model is not None,
#         "processor_loaded": processor is not None,
#         "endpoints": {
#             "test": "/drone-test (GET)",
#             "predict": "/predict (POST)",
#             "health": "/api/health (GET)"
#         },
#         "instructions": "Send a POST request to /predict with an audio file"
#     })

# @app.route("/test-audio", methods=["POST"])
# def test_audio():
#     """Test endpoint to check if audio files are valid"""
#     if "file" not in request.files:
#         return jsonify({"error": "No file uploaded"}), 400

#     file = request.files["file"]
#     if file.filename == "":
#         return jsonify({"error": "No file selected"}), 400

#     try:
#         # Save file temporarily
#         temp_path = os.path.join(UPLOAD_DIR, f"test_{secure_filename(file.filename)}")
#         file.save(temp_path)
        
#         # Get file info
#         file_size = os.path.getsize(temp_path)
        
#         # Test loading with librosa
#         waveform, sr = librosa.load(temp_path, sr=None)
#         duration = len(waveform) / sr
        
#         # Clean up
#         os.remove(temp_path)
        
#         return jsonify({
#             "valid": True,
#             "file_size_bytes": file_size,
#             "sample_rate": sr,
#             "samples": len(waveform),
#             "duration_seconds": round(duration, 2),
#             "message": "Audio file is valid"
#         })
        
#     except Exception as e:
#         if 'temp_path' in locals() and os.path.exists(temp_path):
#             try:
#                 os.remove(temp_path)
#             except:
#                 pass
#         return jsonify({
#             "valid": False,
#             "error": str(e),
#             "message": "Audio file is invalid or corrupted"
#         }), 400


# @app.route("/predict/status", methods=["GET"])
# def predict_status():
#     """Get current prediction system status"""
#     return jsonify({
#         "model_loaded": model is not None,
#         "processor_loaded": processor is not None,
#         "system_ready": model is not None and processor is not None,
#         "available_classes": list(model.config.id2label.values()) if model else [],
#         "timestamp": datetime.now().isoformat()
#     })      
# =============================================================================
# Drone Prediction Endpoint
# =============================================================================

@app.route("/predict", methods=["POST"])
def predict():
    """Main endpoint for drone audio classification"""
    try:
        if model is None or processor is None:
            return jsonify({"error": "Drone model not loaded"}), 500

        if "file" not in request.files:
            return jsonify({"error": "No audio file uploaded"}), 400

        file = request.files["file"]
        if file.filename == "":
            return jsonify({"error": "No file selected"}), 400

        if not allowed_audio_file(file.filename):
            return jsonify({"error": f"Invalid file type. Allowed: {ALLOWED_AUDIO_EXTENSIONS}"}), 400

        # Save file temporarily
        temp_path = os.path.join(UPLOAD_DIR, f"drone_{secure_filename(file.filename)}")
        file.save(temp_path)
        
        print(f"📁 Saved uploaded file to: {temp_path}")

        try:
            # Validate audio file first
            validate_audio_file(temp_path)
            
            # Run prediction
            label, confidence = predict_drone(temp_path)
            
            # Get all class probabilities for better frontend display
            waveform, sr = librosa.load(temp_path, sr=16000, mono=True, duration=10.0)
            if len(waveform) < 16000:
                target_length = 16000
                repeats = (target_length // len(waveform)) + 1
                waveform = np.tile(waveform, repeats)[:target_length]
            
            audio_list = waveform.tolist()
            inputs = processor(audio_list, sampling_rate=16000, return_tensors="pt", padding=True)
            
            with torch.no_grad():
                outputs = model(**inputs)
                logits = outputs.logits
                probabilities = torch.nn.functional.softmax(logits, dim=1)
                
                # Get all class probabilities
                all_probs = {}
                for i, class_name in model.config.id2label.items():
                    all_probs[class_name] = round(probabilities[0][i].item(), 4)
            
            # Clean up
            os.remove(temp_path)
            
            return jsonify({
                "success": True,
                "prediction": label,
                "confidence": round(confidence, 4),
                "all_probabilities": all_probs,
                "message": "Classification successful",
                "timestamp": datetime.now().isoformat()
            })
            
        except Exception as e:
            # Clean up on error
            if os.path.exists(temp_path):
                os.remove(temp_path)
            raise e

    except Exception as e:
        print(f"❌ Prediction error: {str(e)}")
        traceback.print_exc()
        return jsonify({
            "success": False,
            "error": f"Prediction failed: {str(e)}"
        }), 500
    
# =============================================================================
# SAR Analysis Endpoints
# =============================================================================

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
# Add this to your Flask app (before the if __name__ == "__main__": section)
@app.route("/debug/routes")
def debug_routes():
    """Debug endpoint to show all available routes"""
    routes = []
    for rule in app.url_map.iter_rules():
        routes.append({
            'endpoint': rule.endpoint,
            'methods': list(rule.methods),
            'path': str(rule)
        })
    return jsonify({
        'total_routes': len(routes),
        'routes': routes
    })

if __name__ == "__main__":
    print(f"🚀 Starting Multi-Model Medical Analysis Server")
    print(f"📍 Upload directory: {os.path.abspath(UPLOAD_DIR)}")
    print(f"📊 Supported file types: {ALLOWED_EXTENSIONS}")

    print(f"🤖 Models: ECG - {'Loaded' if ecg_model else 'Not loaded'}, EEG - {'Loaded' if eeg_model else 'Not loaded'}, Drone - {'Loaded' if model else 'Not loaded'}, Voice (ECAPA-TDNN) - {'Loaded' if voice_model else 'Not loaded'}")

    print(f"🌐 Web Applications:")
    print(f"   - Main: http://127.0.0.1:5000")
    print(f"   - ECG Analysis: http://127.0.0.1:5000/ecg")
    print(f"   - EEG Analysis: http://127.0.0.1:5000/eeg")
    print(f"   - Doppler Analysis: http://127.0.0.1:5000/doppler-analysis")
    print(f"   - Drone & SAR Analysis: http://127.0.0.1:5000/drone-sar-analysis")


    print(f"   - Voice Analysis: http://127.0.0.1:5000/voice-analysis")

    print(f"   - Spectrogram Analysis: http://127.0.0.1:5000/spectro")
    print(f"🌐 API Health: http://127.0.0.1:5000/api/health")
    
@app.before_request
def log_request_info():
    print(f"📥 Incoming request: {request.method} {request.path}")
    if request.files:
        print(f"📁 Files: {list(request.files.keys())}")

@app.after_request
def log_response_info(response):
    print(f"📤 Outgoing response: {response.status_code}")
    return response
    # Run the app


port = int(os.environ.get("PORT", 5000))
app.run(debug=True, host='0.0.0.0', port=port)