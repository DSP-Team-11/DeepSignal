# library to load model & processor
from transformers import AutoProcessor, AutoModelForAudioClassification
# torchaudio >to read .wav files
# torch      >pytorch library to run model on CPU OR GPU
# os         >to handle file_paths
import torchaudio, torch, os
# includes softmax func.: to calculate confidence
import torch.nn.functional as F
# === 1. Load model once ===
MODEL_NAME = "preszzz/drone-audio-detection-05-17-trial-0"
print("Loading model...")
# to convert .wav audio into the right input format for the model
processor = AutoProcessor.from_pretrained(MODEL_NAME)
# loads the model
model = AutoModelForAudioClassification.from_pretrained(MODEL_NAME)
device = "cuda" if torch.cuda.is_available() else "cpu"
# Moves the model to that device.
model = model.to(device)
# Use when you are testing or predicting (no learning, stable output)
model.eval()
print("Model loaded successfully.\n")

# === 2. Prediction helper ===
def predict_label(audio_path):
    # load audio file, returning audio signal,sr
    waveform, sr = torchaudio.load(audio_path)
    if waveform.size(0) > 1:
        waveform = torch.mean(waveform, dim=0, keepdim=True)
    if sr != 16000:
        waveform = torchaudio.functional.resample(waveform, sr, 16000)
        sr = 16000
    # Converts the waveform into tensors that the model can understand.
    # Moves all tensors to the same device (CPU/GPU) as the model
    inputs = processor(waveform.squeeze(), sampling_rate=sr, return_tensors="pt", padding=True)
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        # torch.no_grad() disables gradient calculation (faster inference).
        # logits are raw model outputs before softmax.
        logits = model(**inputs).logits
        # softmax converts logits into probabilities for each class.
        probs = F.softmax(logits, dim=-1)
        # softmax converts logits into probabilities for each class.
        pred_id = torch.argmax(logits, dim=-1).item()
        # confidence stores the probability of that predicted class
        confidence = probs[0, pred_id].item() 
        # label converts the class index into its text label (e.g., “drone” or “background”).
        label = model.config.id2label[pred_id]
    return label, confidence

# === 3. Compare both files ===
def compare_predictions(original_file, downsampled_file):
    print(f"🔊 Original file: {original_file}")
    label1, conf1 = predict_label(original_file)
    print(f" → Prediction: {label1} ({conf1*100:.2f}%)")

    print(f"\n🎧 Downsampled file: {downsampled_file}")
    label2, conf2 = predict_label(downsampled_file)
    print(f" → Prediction: {label2} ({conf2*100:.2f}%)")

    print("\n✅ Comparison result:")
    if label1 == label2:
        print(f"Model gave SAME label for both files: {label1} — confidences {conf1*100:.1f}% vs {conf2*100:.1f}%")
    else:
        print(f"Model CHANGED label — Original: {label1} ({conf1*100:.1f}%), Downsampled: {label2} ({conf2*100:.1f}%)")


# === 4. Run comparison ===
if __name__ == "__main__":
    base_path = r"C:\\VsProjectTemplate\\radar\\Drone_detection"
    original = os.path.join(base_path, "mixed_membo_56-membo_003_.wav")
    downsampled = os.path.join(base_path, "aliasing_step_1_8000Hz.wav")

    compare_predictions(original, downsampled)
    
