require('dotenv').config();
const express = require('express');
const path = require('path');
const cors = require('cors');
const connectDB = require('./config/db');

const app = express();
const PORT = process.env.PORT || 3000;

connectDB();

app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
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

// 實驗入口：自動導向第一個步驟（預設流程）
app.get('/experiment', async (req, res, next) => {
  try {
    const ExperimentStep = require('./models/ExperimentStep');
    const first = await ExperimentStep.findOne({ flowKey: 'default', active: true })
      .sort({ order: 1, updatedAt: -1 })
      .lean();
    if (!first) {
      return res.status(404).send('尚未設定實驗流程。');
    }
    res.redirect(`/experiment/${encodeURIComponent(first.key)}`);
  } catch (e) {
    next(e);
  }
});

// 實驗執行頁（依步驟 key 顯示內容）
app.get('/experiment/:key', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'experiment.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, message: err.message || '伺服器錯誤' });
});

app.listen(PORT, () => {
  console.log(`AI × IVR 師資生情緒管理訓練系統 - Node.js 後端運行於 http://localhost:${PORT}`);
});
