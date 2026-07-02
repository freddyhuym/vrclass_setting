const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const multer = require('multer');

const azureSpeech = require('../providers/azureSpeech');
const opensmile = require('../providers/opensmileClient');
const azureLanguage = require('../providers/azureLanguage');
const { ensureWav16k } = require('../utils/audio');

const router = express.Router();

const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const upload = multer({ dest: UPLOAD_DIR });

function isConnError(msg) {
  return msg.includes('fetch failed') || msg.includes('ECONNREFUSED') || msg.includes('連線逾時');
}

async function cleanupFiles(paths) {
  const unique = [...new Set(paths)];
  await Promise.all(unique.map((p) => fs.unlink(p).catch(() => {})));
}

/** 三個功能是否都設定好了（給 Unity 開機自檢用） */
router.get('/health', async (_req, res) => {
  const [voiceEmotionHealth, textSentimentHealth] = await Promise.all([
    opensmile.checkHealth(),
    azureLanguage.isConfigured()
      ? azureLanguage.checkHealth()
      : Promise.resolve({ ok: false, error: azureLanguage.getConfigHint() }),
  ]);
  res.json({
    speechToText: { configured: azureSpeech.isConfigured() },
    voiceEmotion: { apiUrl: opensmile.getApiUrl(), ...voiceEmotionHealth },
    textSentiment: { configured: azureLanguage.isConfigured(), ...textSentimentHealth },
  });
});

/** POST /api/vr-emotion/stt  (multipart: audio) -> Azure 語音辨識文字 */
router.post('/stt', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '請上傳音檔（欄位名稱: audio）' });
  }
  if (!azureSpeech.isConfigured()) {
    await cleanupFiles([req.file.path]);
    return res
      .status(503)
      .json({ success: false, message: '伺服器未設定 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION' });
  }

  const originalPath = req.file.path;
  let wavPath = originalPath;
  try {
    wavPath = await ensureWav16k(originalPath, TEMP_DIR);
    const result = await azureSpeech.recognizeFile(wavPath);
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || String(err) });
  } finally {
    await cleanupFiles([originalPath, wavPath]);
  }
});

/** POST /api/vr-emotion/voice-emotion  (multipart: audio) -> openSMILE 聲音情緒 */
router.post('/voice-emotion', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '請上傳音檔（欄位名稱: audio）' });
  }

  const originalPath = req.file.path;
  let wavPath = originalPath;
  try {
    wavPath = await ensureWav16k(originalPath, TEMP_DIR);
    const audioBuf = await fs.readFile(wavPath);
    const result = await opensmile.analyzeBuffer(audioBuf, 'audio.wav');
    res.json({ success: true, ...result });
  } catch (err) {
    const msg = err.message || String(err);
    res.status(isConnError(msg) ? 503 : 500).json({
      success: false,
      message: isConnError(msg)
        ? `無法連線 openSMILE 服務（${opensmile.getApiUrl()}）。請先啟動該 FastAPI 服務`
        : msg,
    });
  } finally {
    await cleanupFiles([originalPath, wavPath]);
  }
});

/** POST /api/vr-emotion/text-sentiment  ({ text, language? }) -> Azure 文字情緒 */
router.post('/text-sentiment', async (req, res) => {
  const text = req.body && req.body.text;
  if (!text || !String(text).trim()) {
    return res.status(400).json({ success: false, message: '請提供 text' });
  }
  if (!azureLanguage.isConfigured()) {
    return res.status(503).json({
      success: false,
      message: '未設定 Azure Language。請設定 AZURE_LANGUAGE_KEY 與 AZURE_LANGUAGE_ENDPOINT',
    });
  }
  try {
    const result = await azureLanguage.analyzeSentiment(String(text), {
      language: req.body.language,
      opinionMining: req.body.opinionMining !== false,
    });
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || String(err) });
  }
});

/**
 * POST /api/vr-emotion/analyze  (multipart: audio) -> 一次串接三項
 * 語音辨識與聲音情緒同時平行執行；文字情緒需等辨識出文字後才會啟動（無法平行）。
 */
router.post('/analyze', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: '請上傳音檔（欄位名稱: audio）' });
  }

  const originalPath = req.file.path;
  let wavPath = originalPath;
  try {
    wavPath = await ensureWav16k(originalPath, TEMP_DIR);
    const audioBuf = await fs.readFile(wavPath);

    const sttPromise = azureSpeech.isConfigured()
      ? azureSpeech.recognizeFile(wavPath).catch((err) => ({ error: err.message || String(err) }))
      : Promise.resolve({ error: '未設定 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION' });

    const voiceEmotionPromise = opensmile
      .analyzeBuffer(audioBuf, 'audio.wav')
      .catch((err) => ({ error: err.message || String(err) }));

    const [stt, voiceEmotion] = await Promise.all([sttPromise, voiceEmotionPromise]);

    let textSentiment = null;
    if (stt && stt.text && azureLanguage.isConfigured()) {
      textSentiment = await azureLanguage
        .analyzeSentiment(stt.text)
        .catch((err) => ({ error: err.message || String(err) }));
    }

    res.json({ success: true, stt, voiceEmotion, textSentiment });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message || String(err) });
  } finally {
    await cleanupFiles([originalPath, wavPath]);
  }
});

module.exports = router;
