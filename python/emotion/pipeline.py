"""合併 openSMILE 與 MERaLiON-SER 分析。"""

import time
from concurrent.futures import ThreadPoolExecutor

from analyze import analyze_audio_path as analyze_opensmile
from meralion_analyze import analyze_meralion_path, is_enabled as meralion_enabled


def _run_opensmile(audio_path: str) -> tuple[dict, str | None, int]:
    t0 = time.perf_counter()
    try:
        return analyze_opensmile(audio_path), None, round((time.perf_counter() - t0) * 1000)
    except Exception as exc:
        return {"status": "error", "error": str(exc)}, str(exc), round(
            (time.perf_counter() - t0) * 1000
        )


def _run_meralion(audio_path: str) -> tuple[dict, str | None, int]:
    t0 = time.perf_counter()
    try:
        return analyze_meralion_path(audio_path), None, round((time.perf_counter() - t0) * 1000)
    except Exception as exc:
        return {"status": "error", "error": str(exc)}, str(exc), round(
            (time.perf_counter() - t0) * 1000
        )


def analyze_full(audio_path: str) -> dict:
    timing = {}
    errors = {}
    wall_start = time.perf_counter()

    with ThreadPoolExecutor(max_workers=2) as pool:
        f_os = pool.submit(_run_opensmile, audio_path)
        f_mer = pool.submit(_run_meralion, audio_path) if meralion_enabled() else None

        opensmile, err_os, timing["opensmile_ms"] = f_os.result()
        if err_os:
            errors["opensmile"] = err_os

        meralion = None
        if f_mer is not None:
            meralion, err_mer, timing["meralion_ms"] = f_mer.result()
            if err_mer:
                errors["meralion"] = err_mer

    timing["total_ms"] = round((time.perf_counter() - wall_start) * 1000)

    out = {
        "status": "ok" if not errors else "partial",
        "opensmile": opensmile,
        "timing_ms": timing,
    }
    if meralion is not None:
        out["meralion"] = meralion
    if errors:
        out["errors"] = errors

    if opensmile.get("status") == "ok":
        out["arousal_score"] = opensmile.get("arousal_score")
        out["features"] = opensmile.get("features")
        out["tool"] = opensmile.get("tool")
        out["feature_set"] = opensmile.get("feature_set")

    return out
