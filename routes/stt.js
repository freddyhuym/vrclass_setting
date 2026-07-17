const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');

const localStt = require('../providers/localSttClient');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const upload = multer({ dest: UPLOAD_DIR });

function isConnError(msg) {
  return msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('連線逾時');
}

/** 本地 STT 服務是否有在跑（給 Unity 開機自檢用） */
router.get('/health', async (_req, res) => {
  const health = await localStt.checkHealth();
  res.json({ apiUrl: localStt.getApiUrl(), ...health });
});

/** POST /api/stt/transcribe  (multipart: audio) -> faster-whisper 本地語音辨識文字 */
router.post('/transcribe', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '請上傳音檔（欄位名稱: audio）' });
  }

  try {
    const audioBuf = await fs.readFile(req.file.path);
    const result = await localStt.transcribeBuffer(audioBuf, req.file.originalname || 'audio.wav');
    res.json({ success: true, text: result.text, language: result.language });
  } catch (err) {
    const msg = err.message || String(err);
    res.status(isConnError(msg) ? 503 : 500).json({
      success: false,
      message: isConnError(msg)
        ? `無法連線本地 STT 服務（${localStt.getApiUrl()}）。請先啟動 npm run stt-api`
        : msg,
    });
  } finally {
    await fs.unlink(req.file.path).catch(() => {});
  }
});

module.exports = router;
