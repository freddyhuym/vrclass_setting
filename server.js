require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const { createServer } = require('http');
const connectDB = require('./config/db');
const apiDebugLog = require('./utils/apiDebugLog');

const app = express();
const server = createServer(app);
const PORT = process.env.PORT || 4000;
/** 預設綁 0.0.0.0 才會接受區網 IP（頭戴顯示器從同 Wi‑Fi 連到電腦）；僅本機可設 HOST=127.0.0.1 */
const HOST = process.env.HOST || '0.0.0.0';

connectDB();

// J 追蹤「VR對話資料為什麼沒存進資料庫」：這個middleware擺在express.json()之前、所有路由最前面，
// 只要TCP連線真的建立、請求真的送進Express，這裡就一定會印一筆。如果Unity那邊記錄「送出失敗
// ConnectionError」的那個時間點，這裡完全沒有對應的一筆，代表問題出在請求根本沒送到(網路層/防火牆/
// 這台機器當下忙到連accept都來不及)，不是Express或MongoDB處理慢——這樣可以直接把範圍縮小一半。
app.use((req, res, next) => {
  if (req.path.startsWith('/api/recording')) {
    apiDebugLog.append(`[REQUEST-IN] ${req.method} ${req.originalUrl} content-length=${req.headers['content-length'] || '?'} from=${req.ip}`);
  }
  next();
});

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
// 影片複盤頁（video-review.html）用的影片/音檔由 VRCLASS 直接寫入 video/（不放 public，避免進版控），
// 掛在跟舊路徑相同的網址上，video-review.html 不用改
app.use('/setting/video-review-data', express.static(path.join(__dirname, 'video')));
// 靜態網站統一掛在 /setting 底下
app.use('/setting', express.static(path.join(__dirname, 'public')));

// 資料編輯與紀錄模組
app.use('/api/editing', require('./routes/editing'));
app.use('/api/recording', require('./routes/recording'));
// 使用者操作與資料反饋模組
app.use('/api/feedback', require('./routes/feedback'));
// 指導語設定模組
app.use('/api/instructions', require('./routes/instructions'));
// 實驗流程模組
app.use('/api/experiments', require('./routes/experiments'));
// VR 教室相容 API（與 Unity 路徑一致：/auth/api/vr_classsroom/...）
app.use('/auth/api/vr_classsroom', require('./routes/vrClassroom'));
// VR 上傳紀錄筆數（本機除錯用）
app.use('/api/vr-classroom', require('./routes/vrClassroomSummary'));
// uid 彙整 VR 五表後送 OpenAI 分析
app.use('/api/gpt-vr', require('./routes/gptVr'));
// VR 音檔情緒辨識：Azure 語音辨識、openSMILE 聲音情緒、Azure 文字情緒
app.use('/api/vr-emotion', require('./routes/vrEmotion'));
// 本地語音辨識（faster-whisper），取代語音對話原本每輪都要上傳到 OpenAI Whisper 雲端的做法
app.use('/api/stt', require('./routes/stt'));
// gptrealtime 步驟：受試者/施測者即時語音辨識（OpenAI Realtime transcription，瀏覽器端 WebRTC）
app.use('/api/realtime-transcribe', require('./routes/realtimeTranscribe'));
// VR 即時語音辨識（WebSocket）：ws://<host>:<port>/ws/vr-emotion/stt
require('./routes/vrEmotionStream').attach(server);

// 根路徑：顯示入口選擇頁（前往 setting 或 experiment）
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'root.html'));
});

// /setting 首頁
app.get('/setting', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 其餘頁面不帶 .html 的路由
app.get('/setting/editing', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'editing.html'));
});

app.get('/setting/recording', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'recording.html'));
});

app.get('/setting/feedback', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'feedback.html'));
});

app.get('/setting/survey-editor', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'survey-editor.html'));
});

app.get('/setting/instruction', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'instruction.html'));
});

// 實驗流程編輯頁
app.get('/setting/experiment-flow', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'experiment-flow.html'));
});

// 實驗編號設定頁
app.get('/setting/experiment-id', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'experiment-id.html'));
});

// 資料瀏覽頁
app.get('/data', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'data-browser.html'));
});

// 實驗入口：先進入受試者編號頁
app.get('/experiment', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'experiment-entry.html'));
});

// 實驗執行頁（依步驟 key 顯示內容）
app.get('/experiment/:key', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'experiment.html'));
});

// 實驗結束頁
app.get('/end', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'end.html'));
});

// 情緒辨識測試頁（openSMILE 聲音情緒 + Azure 文字情緒）
app.get('/emotion-test', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'emotion-test.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || '伺服器錯誤' });
});

server.listen(PORT, HOST, () => {
  console.log(`AI × IVR 師資生情緒管理訓練系統 - Node.js 後端運行於 http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}（對外可改用本機區網 IP :${PORT}）`);
});
