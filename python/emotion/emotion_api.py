"""聲音情緒 API：openSMILE + MERaLiON-SER（FastAPI，預設 port 8000）。"""

import os
import tempfile
from pathlib import Path

from dotenv import load_dotenv

# 這支服務是獨立行程啟動（npm run emotion-api），不會自動讀到
# vrclass_setting/.env（那份只有 Node 後端的 dotenv 會載入），所以這裡
# 手動載入同一份 .env，讓 MERALION_DISABLED 等設定兩邊行為一致。
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

from meralion_analyze import get_model_id, is_enabled as meralion_enabled
from pipeline import analyze_full

app = FastAPI(title="Speech Emotion API", version="3.0.0")


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "Speech Emotion API",
        "endpoints": ["/health", "/analyze (POST)", "/docs"],
    }


@app.on_event("startup")
def startup():
    if os.environ.get("MERALION_WARMUP", "1").strip().lower() in ("1", "true", "yes"):
        if meralion_enabled():
            try:
                from meralion_analyze import warmup

                warmup()
                print(f"[emotion-api] MERaLiON-SER 已載入: {get_model_id()}")
            except Exception as exc:
                print(f"[emotion-api] MERaLiON-SER 預載失敗（分析時會再試）: {exc}")


@app.get("/health")
def health():
    mer = {"enabled": meralion_enabled(), "model": get_model_id()}
    if meralion_enabled():
        try:
            from meralion_analyze import get_model

            get_model()
            mer["loaded"] = True
        except Exception as exc:
            mer["loaded"] = False
            mer["error"] = str(exc)

    return {
        "status": "ok",
        "tools": {
            "opensmile": {
                "tool": "openSMILE",
                "origin": "Germany/audEERING",
                "feature_set": "eGeMAPSv02",
            },
            "meralion": mer,
        },
    }


@app.post("/analyze")
async def analyze_emotion(file: UploadFile = File(...)):
    suffix = ".wav"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext in ("wav", "mp3", "m4a", "ogg", "flac", "webm"):
            suffix = f".{ext}"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        return analyze_full(tmp_path)
    except Exception as exc:
        return JSONResponse(
            status_code=500,
            content={"status": "error", "error": str(exc)},
        )
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
