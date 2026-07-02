"""MERaLiON-SER-v1 語音情緒（7 類 + valence/arousal/dominance，本地推理）。"""

import os

import numpy as np
import soundfile as sf
import torch
import torchaudio

_model = None
_processor = None
_model_error = None

EMOTION_LABELS_ZH = {
    "neutral": "中立",
    "happy": "開心",
    "sad": "難過",
    "angry": "憤怒",
    "fearful": "恐懼",
    "disgusted": "厭惡",
    "surprised": "驚訝",
}

LABEL_ALIASES = {
    "fear": "fearful",
    "disgust": "disgusted",
    "surprise": "surprised",
    "happiness": "happy",
    "sadness": "sad",
    "anger": "angry",
    "neutrality": "neutral",
}


def is_enabled() -> bool:
    v = os.environ.get("MERALION_DISABLED", "").strip().lower()
    return v not in ("1", "true", "yes")


def get_model_id() -> str:
    return os.environ.get("MERALION_MODEL", "MERaLiON/MERaLiON-SER-v1")


def get_device() -> str:
    want = os.environ.get("MERALION_DEVICE", "cpu").strip().lower()
    if want == "cuda" and torch.cuda.is_available():
        return "cuda"
    return "cpu"


def parse_label(raw: str) -> str:
    text = (raw or "").strip()
    if not text:
        return "neutral"
    if text.upper().startswith("LABEL_"):
        return text.lower()
    key = text.lower().replace(" ", "_")
    key = LABEL_ALIASES.get(key, key)
    return key if key in EMOTION_LABELS_ZH else key


def _load_audio_16k(audio_path: str) -> np.ndarray:
    wav, sr = sf.read(audio_path, always_2d=False)
    if wav.ndim > 1:
        wav = wav.mean(axis=1)
    wav = wav.astype(np.float32)
    if sr != 16000:
        t = torch.from_numpy(wav).unsqueeze(0)
        t = torchaudio.functional.resample(t, sr, 16000)
        wav = t.squeeze(0).numpy()
    return wav


def get_model():
    global _model, _processor, _model_error
    if _model is not None:
        return _model, _processor
    if _model_error is not None:
        raise RuntimeError(_model_error)

    try:
        from transformers import AutoModelForAudioClassification, AutoProcessor

        model_id = get_model_id()
        device = get_device()
        _processor = AutoProcessor.from_pretrained(model_id)
        _model = AutoModelForAudioClassification.from_pretrained(
            model_id,
            trust_remote_code=True,
            low_cpu_mem_usage=False,
        ).to(device)
        _model.eval()
        return _model, _processor
    except Exception as exc:
        _model_error = (
            f"{exc}\n"
            "提示：MERaLiON-SER 需 transformers 與 torch。"
            "首次啟動會從 Hugging Face 下載模型（約 800MB）。"
        )
        raise RuntimeError(_model_error) from exc


def warmup():
    if is_enabled():
        get_model()


def _label_map(model) -> dict[int, str]:
    id2label = getattr(model.config, "id2label", None) or {}
    out = {}
    for idx, lab in id2label.items():
        out[int(idx)] = parse_label(str(lab))
    if not out:
        default = [
            "neutral",
            "happy",
            "sad",
            "angry",
            "fearful",
            "disgusted",
            "surprised",
        ]
        out = {i: default[i] for i in range(len(default))}
    return out


def analyze_meralion_path(audio_path: str) -> dict:
    if not is_enabled():
        return {
            "status": "disabled",
            "tool": "MERaLiON-SER",
            "error": "MERALION_DISABLED=1",
        }

    model, processor = get_model()
    device = get_device()
    wav = _load_audio_16k(audio_path)

    inputs = processor(
        wav,
        sampling_rate=16000,
        return_tensors="pt",
        return_attention_mask=True,
    )
    model_inputs = {k: v.to(device) for k, v in inputs.items() if hasattr(v, "to")}

    with torch.inference_mode():
        out = model(**model_inputs)

    logits = out["logits"]
    dims = out["dims"]
    probs = torch.softmax(logits, dim=-1).squeeze(0).cpu().numpy()
    vad = dims.squeeze(0).cpu().numpy()

    label_map = _label_map(model)
    emotions = {}
    for idx, prob in enumerate(probs):
        key = label_map.get(idx, f"label_{idx}")
        if key in EMOTION_LABELS_ZH:
            emotions[key] = max(emotions.get(key, 0.0), float(prob))

    for key in EMOTION_LABELS_ZH:
        emotions.setdefault(key, 0.0)

    ranked = sorted(emotions.items(), key=lambda x: x[1], reverse=True)
    top_key, top_score = ranked[0]

    return {
        "status": "ok",
        "tool": "MERaLiON-SER",
        "origin": "Singapore ITE / MERaLiON",
        "model": get_model_id(),
        "top_emotion": top_key,
        "top_emotion_zh": EMOTION_LABELS_ZH.get(top_key, top_key),
        "top_score": round(top_score, 4),
        "emotions": {k: round(v, 4) for k, v in emotions.items()},
        "emotions_zh": EMOTION_LABELS_ZH,
        "dimensions": {
            "valence": round(float(vad[0]), 4),
            "arousal": round(float(vad[1]), 4),
            "dominance": round(float(vad[2]), 4),
        },
    }
