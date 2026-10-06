const express = require('express');
const https = require('https');
const { LiveTranscriptSegment } = require('../models/Record');

const router = express.Router();

const TRANSCRIBE_MODEL = process.env.OPENAI_TRANSCRIBE_MODEL || 'gpt-4o-transcribe';
const TRANSCRIBE_LANGUAGE = process.env.OPENAI_TRANSCRIBE_LANGUAGE || 'zh';

function postJson(apiPath, body, apiKey) {
  const data = JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: apiPath,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
          'Content-Length': Buffer.byteLength(data, 'utf8')
        }
      },
      (res) => {
        let out = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => { out += chunk; });
        res.on('end', () => {
          let j;
          try {
            j = JSON.parse(out);
          } catch (e) {
            return reject(new Error('解析 OpenAI 回應失敗：' + (e && e.message)));
          }
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error((j && j.error && j.error.message) || out.slice(0, 400) || 'OpenAI 請求失敗'));
          }
          resolve(j);
        });
      }
    );
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * POST /api/realtime-transcribe/token
 * 伺服器用正式 OPENAI_API_KEY 換一組短效 ephemeral client secret（1 小時內有效），
 * 瀏覽器只拿這組短效金鑰直接跟 OpenAI 建 WebRTC 連線做即時語音辨識，
 * 正式金鑰全程不會出現在前端。session.type=transcription，純轉文字、不會有 AI 語音回覆。
 */
router.post('/token', async (req, res, next) => {
  try {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({ success: false, message: '伺服器未設定 OPENAI_API_KEY' });
    }
    const body = {
      expires_after: { anchor: 'created_at', seconds: 3600 },
      session: {
        type: 'transcription',
        audio: {
          input: {
            format: { type: 'audio/pcm', rate: 24000 },
            noise_reduction: { type: 'near_field' },
            transcription: {
              model: TRANSCRIBE_MODEL,
              language: TRANSCRIBE_LANGUAGE,
              prompt: '這是台灣教育研究情境下的對話錄音，說話者為受試者與施測者，內容為繁體中文口語對話，可能包含專有名詞、量表題目用語。'
            },
            turn_detection: { type: 'server_vad', silence_duration_ms: 600 }
          }
        }
      }
    };
    const j = await postJson('/v1/realtime/client_secrets', body, apiKey);
    if (!j || !j.value) {
      return res.status(502).json({ success: false, message: 'OpenAI 未回傳有效的短效金鑰' });
    }
    res.json({ success: true, value: j.value, expires_at: j.expires_at, model: TRANSCRIBE_MODEL });
  } catch (e) {
    next(e);
  }
});

/**
 * POST /api/realtime-transcribe/segment
 * body: { uid, sessionId, seq, text, stepKey?, experimentCode?, levelName? }
 * 每辨識完成一段（一輪講話）前端就送一筆存起來，即使瀏覽器中途關閉、忘記按停止，
 * 已經講完的部分也不會遺失。
 */
router.post('/segment', async (req, res, next) => {
  try {
    const b = req.body || {};
    const uid = b.uid != null ? String(b.uid).trim() : '';
    const sessionId = b.sessionId != null ? String(b.sessionId).trim() : '';
    const text = b.text != null ? String(b.text) : '';
    if (!uid) return res.status(400).json({ success: false, message: '缺少 uid' });
    if (!sessionId) return res.status(400).json({ success: false, message: '缺少 sessionId' });
    if (!text.trim()) return res.status(400).json({ success: false, message: '缺少辨識文字' });

    const seqNum = Number(b.seq);
    const doc = await LiveTranscriptSegment.create({
      userId: uid,
      sessionId,
      experimentCode: b.experimentCode || undefined,
      levelName: b.levelName || undefined,
      stepKey: b.stepKey || undefined,
      seq: Number.isFinite(seqNum) ? seqNum : undefined,
      text,
      source: 'gptrealtime'
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/realtime-transcribe/segments?uid=...&sessionId=...
 * 讀回某位受試者（可選：某次 session）已存的逐字稿，依 seq 排序。
 */
router.get('/segments', async (req, res, next) => {
  try {
    const uid = req.query.uid != null ? String(req.query.uid).trim() : '';
    if (!uid) return res.status(400).json({ success: false, message: '缺少 uid' });
    const q = { userId: uid };
    if (req.query.sessionId) q.sessionId = String(req.query.sessionId).trim();
    const rows = await LiveTranscriptSegment.find(q).sort({ seq: 1, timestamp: 1 }).lean();
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
