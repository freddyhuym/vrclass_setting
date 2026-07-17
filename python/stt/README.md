# 本地語音辨識 Python 服務（faster-whisper）

取代 VRCLASS 語音對話原本每輪都要上傳錄音到 OpenAI Whisper 雲端 API 的做法，改在本機 GPU 辨識，
省下上傳/排隊的網路來回時間。

## 環境需求

- **Python 3.9 – 3.12**（64-bit），Windows 建議用 3.12
- NVIDIA GPU + 驅動（有 CUDA 才會快；沒有的話會自動退回 CPU，但會慢很多）

```powershell
py -3.12 -m pip install -r python/stt/requirements.txt
py -3.12 -m uvicorn stt_api:app --host 127.0.0.1 --port 8001 --app-dir python/stt
```

或在專案根目錄：`npm run stt-install` → `npm run stt-api`

## 模型

預設 `small`（`faster-whisper`，開源 CTranslate2 實作，非中國模型）。第一次啟動會從 Hugging Face
下載模型檔（small 約 500MB），之後會存在本機快取，不用重複下載。

## 環境變數

```
STT_MODEL_SIZE=small   # tiny / base / small / medium / large-v3，越大越準但越慢
STT_LANGUAGE=zh        # 空字串 = 自動偵測語言
STT_DEVICE=cuda        # 沒有可用GPU會自動退回cpu
STT_WARMUP=1           # 啟動時就先載入模型，避免第一次辨識要多等模型載入的時間
STT_VAD_FILTER=0       # 預設關閉：開啟後第一次辨識會另外向 Hugging Face 下載 VAD 模型，網路不穩會卡住；
                        # Unity 錄音端已經有做過靜音去除，通常不需要開這個
STT_HF_OFFLINE=1       # 預設開啟：模型下載過一次後就強制離線模式，不用每次啟動都連網檢查新版本；
                        # 要換 STT_MODEL_SIZE 重新下載新模型時，暫時設成 0
```
