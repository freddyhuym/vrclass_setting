"""openSMILE eGeMAPSv02 聲學特徵與高喚醒分數（本地運算，不外送雲端）。"""

import numpy as np
import opensmile

_smile = None

FEATURE_MAP = {
    "F0_mean": "F0semitoneFrom27.5Hz_sma3nz_amean",
    "F0_max": "F0semitoneFrom27.5Hz_sma3nz_percentile80.0",
    "F0_range": "F0semitoneFrom27.5Hz_sma3nz_pctlrange0-2",
    "loudness_mean": "loudness_sma3_amean",
    "loudness_max": "loudness_sma3_percentile80.0",
    "jitter": "jitterLocal_sma3nz_amean",
    "shimmer": "shimmerLocaldB_sma3nz_amean",
    "spectral_flux": "spectralFlux_sma3_amean",
    "HNR": "HNRdBACF_sma3nz_amean",
}


def get_smile():
    global _smile
    if _smile is None:
        _smile = opensmile.Smile(
            feature_set=opensmile.FeatureSet.eGeMAPSv02,
            feature_level=opensmile.FeatureLevel.Functionals,
        )
    return _smile


def extract_emotion_features(row) -> dict:
    result = {}
    for key, col in FEATURE_MAP.items():
        val = row.get(col, np.nan)
        result[key] = float(val) if val is not None and not np.isnan(val) else None
    return result


def compute_arousal_score(features: dict) -> float:
    """啟發式高喚醒分數（0~1），供初期測試；正式研究應換成分類器。"""
    scores = []

    f0 = features.get("F0_mean")
    if f0 is not None:
        scores.append(min(max(f0 / 40.0, 0.0), 1.0))

    loudness = features.get("loudness_mean")
    if loudness is not None:
        scores.append(min(max(loudness / 0.5, 0.0), 1.0))

    jitter = features.get("jitter")
    if jitter is not None:
        scores.append(min(max(jitter * 100, 0.0), 1.0))

    if not scores:
        return 0.0

    return float(np.mean(scores))


def analyze_audio_path(audio_path: str) -> dict:
    features_df = get_smile().process_file(audio_path)
    row = features_df.iloc[0]
    features = extract_emotion_features(row)
    arousal = compute_arousal_score(features)

    return {
        "arousal_score": round(arousal, 3),
        "features": features,
        "feature_count": int(features_df.shape[1]),
        "status": "ok",
        "tool": "openSMILE",
        "origin": "Germany/audEERING",
        "feature_set": "eGeMAPSv02",
    }
