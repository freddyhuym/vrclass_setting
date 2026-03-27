const express = require('express');
const router = express.Router();
const PersonalData = require('../models/PersonalData');
const {
  EmotionFeedback,
  ScaleResponse,
  DecisionRecord,
  Physiological,
  ProcessLog
} = require('../models/Record');

function ensureTimestamp(body) {
  const timestamp = body.timestamp ? new Date(body.timestamp) : new Date();
  return { ...body, timestamp };
}

// ========== 統一寫入介面：接收多模態研究資料（附時間戳記）==========
router.post('/write', async (req, res, next) => {
  try {
    const { type, payload } = req.body;
    if (!type || !payload) {
      return res.status(400).json({ success: false, message: '需要 type 與 payload' });
    }
    const ts = ensureTimestamp(payload);
    let doc;
    switch (type) {
      case 'personal':
        doc = await PersonalData.findOneAndUpdate(
          { userId: ts.userId },
          { $set: { ...ts, updatedAt: new Date() } },
          { upsert: true, new: true }
        );
        break;
      case 'emotion_feedback':
        doc = await EmotionFeedback.create(ts);
        break;
      case 'scale_response':
        doc = await ScaleResponse.create(ts);
        break;
      case 'decision':
        doc = await DecisionRecord.create(ts);
        break;
      case 'physiological':
        doc = await Physiological.create(ts);
        break;
      case 'process':
        doc = await ProcessLog.create(ts);
        break;
      default:
        return res.status(400).json({ success: false, message: '不支援的 type: ' + type });
    }
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== 個人資料紀錄 ==========
router.post('/personal', async (req, res, next) => {
  try {
    const body = ensureTimestamp(req.body);
    const doc = await PersonalData.findOneAndUpdate(
      { userId: body.userId },
      { $set: { ...body, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== 量表問卷紀錄 ==========
router.post('/scale-response', async (req, res, next) => {
  try {
    const body = ensureTimestamp(req.body);
    if (!body.userId || !body.scaleId) {
      return res.status(400).json({ success: false, message: '需要 userId, scaleId' });
    }
    const doc = await ScaleResponse.create(body);
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== 情緒回饋紀錄 ==========
router.post('/emotion-feedback', async (req, res, next) => {
  try {
    const doc = await EmotionFeedback.create(ensureTimestamp(req.body));
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== 決策歷程紀錄 ==========
router.post('/decision', async (req, res, next) => {
  try {
    const doc = await DecisionRecord.create(ensureTimestamp(req.body));
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== 生理指標紀錄（瞳孔、GSR、心率，附時間戳記）==========
router.post('/physiological', async (req, res, next) => {
  try {
    const body = ensureTimestamp(req.body);
    if (!body.userId) {
      return res.status(400).json({ success: false, message: '需要 userId' });
    }
    const doc = await Physiological.create({
      ...body,
      pupilDiameter: body.pupilDiameter,
      gsr: body.gsr,
      heartRate: body.heartRate,
      raw: body.raw
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== 歷程資料紀錄 ==========
router.post('/process', async (req, res, next) => {
  try {
    const doc = await ProcessLog.create(ensureTimestamp(req.body));
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== 查詢紀錄（依 userId / sessionId / 時間範圍）==========
router.get('/records', async (req, res, next) => {
  try {
    const { userId, sessionId, from, to, type, limit = 100 } = req.query;
    const query = {};
    if (userId) query.userId = userId;
    if (sessionId) query.sessionId = sessionId;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    const models = {
      emotion_feedback: EmotionFeedback,
      scale_response: ScaleResponse,
      decision: DecisionRecord,
      physiological: Physiological,
      process: ProcessLog
    };
    const Model = type ? models[type] : null;
    if (Model) {
      const list = await Model.find(query).sort({ timestamp: -1 }).limit(Number(limit)).lean();
      return res.json({ success: true, data: list });
    }
    const all = await Promise.all(
      Object.entries(models).map(async ([k, M]) => ({
        type: k,
        data: await M.find(query).sort({ timestamp: -1 }).limit(Number(limit)).lean()
      }))
    );
    res.json({ success: true, data: all });
  } catch (e) { next(e); }
});

module.exports = router;
