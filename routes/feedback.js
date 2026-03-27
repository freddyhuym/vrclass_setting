const express = require('express');
const router = express.Router();
const EmotionAnnotation = require('../models/EmotionAnnotation');
const Reflection = require('../models/Reflection');
const {
  EmotionFeedback,
  ScaleResponse,
  DecisionRecord,
  Physiological,
  ProcessLog
} = require('../models/Record');

// ========== 情緒標註 ==========
router.post('/emotion-annotation', async (req, res, next) => {
  try {
    const doc = await EmotionAnnotation.create({
      ...req.body,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date()
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.get('/emotion-annotations', async (req, res, next) => {
  try {
    const { userId, sessionId, from, to } = req.query;
    const query = {};
    if (userId) query.userId = userId;
    if (sessionId) query.sessionId = sessionId;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    const list = await EmotionAnnotation.find(query).sort({ timestamp: -1 }).limit(200).lean();
    res.json({ success: true, data: list });
  } catch (e) { next(e); }
});

// ========== 多模態指標反饋（彙整情緒、決策、生理、歷程等）==========
router.get('/multimodal-summary', async (req, res, next) => {
  try {
    const { userId, sessionId, from, to } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: '需要 userId' });
    const query = { userId };
    if (sessionId) query.sessionId = sessionId;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    const [emotions, decisions, physiological, processLogs, annotations] = await Promise.all([
      EmotionFeedback.find(query).sort({ timestamp: -1 }).limit(500).lean(),
      DecisionRecord.find(query).sort({ timestamp: -1 }).limit(200).lean(),
      Physiological.find(query).sort({ timestamp: -1 }).limit(500).lean(),
      ProcessLog.find(query).sort({ timestamp: -1 }).limit(200).lean(),
      EmotionAnnotation.find({ ...query }).sort({ timestamp: -1 }).limit(200).lean()
    ]);
    res.json({
      success: true,
      data: {
        emotions,
        decisions,
        physiological,
        processLogs,
        annotations
      }
    });
  } catch (e) { next(e); }
});

// ========== 情緒察覺反思 ==========
router.post('/reflection', async (req, res, next) => {
  try {
    const doc = await Reflection.create({
      ...req.body,
      timestamp: req.body.timestamp ? new Date(req.body.timestamp) : new Date()
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.get('/reflections', async (req, res, next) => {
  try {
    const { userId, sessionId } = req.query;
    const query = {};
    if (userId) query.userId = userId;
    if (sessionId) query.sessionId = sessionId;
    const list = await Reflection.find(query).sort({ timestamp: -1 }).limit(100).lean();
    res.json({ success: true, data: list });
  } catch (e) { next(e); }
});

// 供外部 ChatGPT 分析呼叫的介面：取得使用者資料用於分析
router.get('/for-analysis', async (req, res, next) => {
  try {
    const { userId, sessionId, from, to } = req.query;
    if (!userId) return res.status(400).json({ success: false, message: '需要 userId' });
    const query = { userId };
    if (sessionId) query.sessionId = sessionId;
    if (from || to) {
      query.timestamp = {};
      if (from) query.timestamp.$gte = new Date(from);
      if (to) query.timestamp.$lte = new Date(to);
    }
    const [emotions, annotations, reflections, decisions] = await Promise.all([
      EmotionFeedback.find(query).sort({ timestamp: 1 }).lean(),
      EmotionAnnotation.find(query).sort({ timestamp: 1 }).lean(),
      Reflection.find(query).sort({ timestamp: 1 }).lean(),
      DecisionRecord.find(query).sort({ timestamp: 1 }).lean()
    ]);
    res.json({
      success: true,
      data: { emotions, annotations, reflections, decisions }
    });
  } catch (e) { next(e); }
});

module.exports = router;
