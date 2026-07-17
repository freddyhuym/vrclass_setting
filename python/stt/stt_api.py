"""本地語音辨識 API：faster-whisper（FastAPI，預設 port 8001）。

取代 VRCLASS 原本每輪對話都要上傳錄音到 OpenAI Whisper 雲端 API 的做法，改在本機 GPU 做語音辨識，
省掉「上傳錄音、排隊、等雲端處理」這段網路來回時間。faster-whisper 是開源專案（CTranslate2 實作），
不是中國模型。
"""

import os
import sys
import tempfile
from pathlib import Path

def _add_nvidia_dll_dirs():
    """`pip install nvidia-cublas-cu12 nvidia-cudnn-cu12` 裝好的 DLL 不會自動加進系統 PATH，
    CTranslate2（faster-whisper 底層）在 Windows 上找不到就會直接報錯。這裡要把目錄加進**環境變數
    PATH**才有用——`os.add_dll_directory()` 只有 Python 自己用 ctypes 載入 DLL 時才會生效，
    CTranslate2 的原生載入機制不吃這個，只認 PATH。"""
    if sys.platform != "win32":
        return
    added = []
    for module_name in ("nvidia.cublas", "nvidia.cudnn"):
        try:
            # 這兩個套件是沒有 __init__.py 的 namespace package，__file__ 會是 None，
            # 要用 __path__ 才能拿到實際安裝路徑。
            module = __import__(module_name, fromlist=["_"])
            bin_dir = os.path.join(list(module.__path__)[0], "bin")
            if os.path.isdir(bin_dir):
                added.append(bin_dir)
        except Exception as exc:
            print(f"[stt-api] 找不到 {module_name} 的 DLL 目錄（{exc}），GPU 可能無法使用", flush=True)

    if added:
        os.environ["PATH"] = os.pathsep.join(added) + os.pathsep + os.environ.get("PATH", "")


_add_nvidia_dll_dirs()

from dotenv import load_dotenv

# 這支服務是獨立行程啟動（npm run stt-api），不會自動讀到 vrclass_setting/.env
# （那份只有 Node 後端的 dotenv 會載入），所以這裡手動載入同一份 .env。
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

# 預設離線：模型第一次啟動時已經連網下載並快取在本機，huggingface_hub 之後每次啟動預設還是會
# 連線去檢查有沒有新版本，這台機器連線不穩會卡在這一步。設成離線模式後一律直接用本機快取，不再連網。
# 要換 STT_MODEL_SIZE 需要重新下載新模型時，暫時設 STT_HF_OFFLINE=0 關掉這個限制即可。
if os.environ.get("STT_HF_OFFLINE", "1").strip().lower() in ("1", "true", "yes"):
    os.environ.setdefault("HF_HUB_OFFLINE", "1")

from fastapi import FastAPI, File, UploadFile
from fastapi.responses import JSONResponse

app = FastAPI(title="Local STT API (faster-whisper)", version="1.0.0")

MODEL_SIZE = os.environ.get("STT_MODEL_SIZE", "small")
# 空字串 = 自動偵測語言；固定填 zh 可以省下語言偵測的時間、也比較不會誤判成其他語言
LANGUAGE = os.environ.get("STT_LANGUAGE", "zh")
DEVICE_PREFERENCE = os.environ.get("STT_DEVICE", "cuda")
# 預設關閉：VAD 濾靜音第一次用會另外向 Hugging Face 下載模型，這台機器連線不穩會整個卡住；
# Unity 錄音端已經有做過 RemoveSilentParts 去除靜音，伺服器端不需要再做一次。
VAD_FILTER = os.environ.get("STT_VAD_FILTER", "0").strip().lower() in ("1", "true", "yes")

_model = None
_model_info = {}


def get_model():
    """延遲載入模型，第一次呼叫（或 startup warmup）才真的載入到 GPU/CPU。"""
    global _model, _model_info
    if _model is not None:
        return _model

    from faster_whisper import WhisperModel

    device = DEVICE_PREFERENCE
    compute_type = "int8_float16" if device == "cuda" else "int8"
    try:
        _model = WhisperModel(MODEL_SIZE, device=device, compute_type=compute_type)
        _model_info = {"device": device, "compute_type": compute_type}
    except Exception as exc:
        # 常見原因：這台機器沒有可用的 CUDA/cuDNN，退回 CPU 至少還能動（但會慢很多）
        print(f"[stt-api] 用 {device} 載入模型失敗（{exc}），改用 CPU")
        device = "cpu"
        compute_type = "int8"
        _model = WhisperModel(MODEL_SIZE, device=device, compute_type=compute_type)
        _model_info = {"device": device, "compute_type": compute_type}

    print(
        f"[stt-api] faster-whisper 模型已載入: size={MODEL_SIZE} "
        f"device={_model_info['device']} compute_type={_model_info['compute_type']}"
    )
    return _model


@app.on_event("startup")
def startup():
    if os.environ.get("STT_WARMUP", "1").strip().lower() in ("1", "true", "yes"):
        try:
            get_model()
        except Exception as exc:
            print(f"[stt-api] 模型預載失敗（辨識時會再試一次）: {exc}")


@app.get("/")
def root():
    return {
        "status": "ok",
        "service": "Local STT API (faster-whisper)",
        "endpoints": ["/health", "/transcribe (POST)", "/docs"],
    }


@app.get("/health")
def health():
    try:
        get_model()
        return {
            "status": "ok",
            "model_size": MODEL_SIZE,
            "language": LANGUAGE or "auto",
            **_model_info,
        }
    except Exception as exc:
        return JSONResponse(status_code=503, content={"status": "error", "error": str(exc)})


@app.post("/transcribe")
async def transcribe(file: UploadFile = File(...)):
    suffix = ".wav"
    if file.filename and "." in file.filename:
        ext = file.filename.rsplit(".", 1)[-1].lower()
        if ext in ("wav", "mp3", "m4a", "ogg", "flac", "webm"):
            suffix = f".{ext}"

    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name

    try:
        model = get_model()
        segments, info = model.transcribe(
            tmp_path,
            language=(LANGUAGE or None),
            vad_filter=VAD_FILTER,
        )
        text = "".join(seg.text for seg in segments).strip()
        return {
            "status": "ok",
            "text": text,
            "language": info.language,
            "language_probability": info.language_probability,
        }
    except Exception as exc:
        return JSONResponse(status_code=500, content={"status": "error", "error": str(exc)})
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass
