# AI × IVR 師資生情緒管理訓練系統（Node.js 後端）

依規格實作 **資料編輯與紀錄模組**、**使用者操作與資料反饋模組**，連接 MongoDB 儲存設定與研究資料。Unity 端僅為參考，本專案不實作。

## 需求

- Node.js 14+
- MongoDB 3.4（預設 `localhost:27017`）

## 安裝與啟動

```bash
npm install
npm start
```

瀏覽器開啟：http://localhost:3000

環境變數（可選）：複製 `.env.example` 為 `.env`，可修改 `PORT`、`MONGODB_URI`。

## 模組與 API

### 1. 資料編輯與紀錄模組 · 編輯功能

- **個人資料**：`GET/POST /api/editing/personal`、`GET/PUT/DELETE /api/editing/personal/:userId`
- **量表問卷**：`GET/POST /api/editing/scales`、`GET/PUT/DELETE /api/editing/scales/:id`
- **Prompt 設定**（虛擬學生人格、互動風格、情緒回應規則等）：`GET/POST /api/editing/prompts`、`GET/PUT/DELETE /api/editing/prompts/:id`

### 2. 資料編輯與紀錄模組 · 紀錄功能

- **統一寫入**：`POST /api/recording/write`，body: `{ "type": "personal|emotion_feedback|scale_response|decision|physiological|process", "payload": { ... } }`，所有紀錄附時間戳記。
- **個別寫入**：`POST /api/recording/personal`、`/scale-response`、`/emotion-feedback`、`/decision`、`/physiological`、`/process`
- **生理指標**：瞳孔直徑、GSR、心率，欄位：`pupilDiameter`、`gsr`、`heartRate`
- **查詢**：`GET /api/recording/records?userId=&type=&from=&to=&limit=`

### 3. 使用者操作與資料反饋模組

- **情緒標註**：`POST /api/feedback/emotion-annotation`、`GET /api/feedback/emotion-annotations`
- **多模態指標反饋**：`GET /api/feedback/multimodal-summary?userId=&sessionId=&from=&to=`
- **情緒察覺反思**：`POST /api/feedback/reflection`、`GET /api/feedback/reflections`
- **供 ChatGPT 分析**：`GET /api/feedback/for-analysis?userId=&sessionId=&from=&to=`

## 資料庫

- 資料庫名稱預設：`vrclass`
- 集合：個人資料、量表、Prompt 設定、情緒回饋、問卷回應、決策紀錄、生理資料、歷程紀錄、情緒標註、反思等。

Unity 或外部程式可透過上述 REST API 讀寫資料。
