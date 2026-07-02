# 情緒分析 Python 服務

## 環境需求

- **Python 3.9 – 3.12**（64-bit）
- Windows 建議使用 Python 3.12

```powershell
py -3.12 -m pip install -r python/emotion/requirements.txt
py -3.12 -m uvicorn emotion_api:app --host 127.0.0.1 --port 8000 --app-dir python/emotion
```

或在專案根目錄：`npm run emotion-install` → `npm run emotion-api`

## 模型

- **MERaLiON-SER-v1**：`MERaLiON/MERaLiON-SER-v1`（預設，含中文訓練）
- **openSMILE**：eGeMAPSv02 聲學特徵 + 啟發式 arousal

首次啟動 MERaLiON 會從 Hugging Face 下載模型（約 800MB）。

## 輸出

### MERaLiON-SER（7 類 + 3 維）

離散：neutral、happy、sad、angry、fearful、disgusted、surprised

連續：valence、arousal、dominance（各 0~1）

### openSMILE

88 個 eGeMAPS 特徵 + `arousal_score`

## 環境變數

```
MERALION_MODEL=MERaLiON/MERaLiON-SER-v1
MERALION_DEVICE=cpu
MERALION_WARMUP=1
MERALION_DISABLED=0
```
