const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const apiDebugLog = require('../utils/apiDebugLog');
const PersonalData = require('../models/PersonalData');
const {
  EmotionFeedback,
  ScaleResponse,
  DecisionRecord,
  Physiological,
  ProcessLog,
  WebEventLog,
  SurveyFinalAnswer,
  VrConversation,
  LiveTranscriptSegment
} = require('../models/Record');
const { VideoReviewTranscriptSegment } = require('../models/VideoReviewTranscript');

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

// ========== 網頁互動歷程（每次行為一筆）==========
router.post('/web-event', async (req, res, next) => {
  try {
    const body = ensureTimestamp(req.body);
    if (!body.userId || !body.eventName) {
      return res.status(400).json({ success: false, message: '需要 userId, eventName' });
    }
    const doc = await WebEventLog.create({
      ...body,
      source: body.source || 'web',
      metadata: {
        userAgent: req.headers['user-agent'],
        referer: req.headers.referer || null,
        ip: req.ip,
        ...(body.metadata || {})
      }
    });
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== 問卷最終送出答案（僅最終，不含歷程）==========
router.post('/survey-final', async (req, res, next) => {
  try {
    const body = ensureTimestamp(req.body);
    if (!body.userId || !body.surveyId || !Array.isArray(body.answers)) {
      return res.status(400).json({ success: false, message: '需要 userId, surveyId, answers[]' });
    }
    const payload = {
      ...body,
      source: body.source || 'web',
      metadata: {
        userAgent: req.headers['user-agent'],
        referer: req.headers.referer || null,
        ip: req.ip,
        ...(body.metadata || {})
      },
      submittedAt: body.submittedAt ? new Date(body.submittedAt) : new Date(),
      answerCount: body.answers.length
    };
    const doc = await SurveyFinalAnswer.create(payload);
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

// ========== VR語音對話紀錄（語音辨識文字/聲音喚醒度/文字情緒/GPT回覆，附時間戳記與uid）==========
router.post('/vr-conversation', async (req, res, next) => {
  const startedAt = Date.now();
  // J 追蹤「VR對話資料為什麼沒存進資料庫」：mongoose.connection.readyState在寫入這一刻的值——
  // 0=disconnected 1=connected 2=connecting 3=disconnecting。如果失敗當下readyState不是1，
  // 就直接證實是MongoDB連線本身的問題，不是這筆資料格式有誤或程式邏輯有bug。
  const readyState = mongoose.connection.readyState;
  apiDebugLog.append(`[VR-CONVERSATION] 開始寫入 uid=${req.body.userId} studentName=${req.body.studentName} mongoState=${readyState}`);
  try {
    const body = ensureTimestamp(req.body);
    if (!body.userId) {
      apiDebugLog.append('[VR-CONVERSATION][警告] 缺少userId，拒絕寫入');
      return res.status(400).json({ success: false, message: '需要 userId (uid)' });
    }
    const doc = await VrConversation.create(body);
    apiDebugLog.append(`[VR-CONVERSATION] 寫入成功 uid=${body.userId} _id=${doc._id} 耗時=${Date.now() - startedAt}ms`);
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    apiDebugLog.append(`[VR-CONVERSATION][失敗] uid=${req.body.userId} mongoState=${mongoose.connection.readyState} 耗時=${Date.now() - startedAt}ms 錯誤=${e.message}`);
    next(e);
  }
});

// ========== 各表筆數（供資料瀏覽頁顯示）==========
router.get('/stats', async (req, res, next) => {
  try {
    const counts = {
      web_event: await WebEventLog.countDocuments(),
      survey_final_answer: await SurveyFinalAnswer.countDocuments(),
      process: await ProcessLog.countDocuments(),
      scale_response: await ScaleResponse.countDocuments(),
      emotion_feedback: await EmotionFeedback.countDocuments(),
      decision: await DecisionRecord.countDocuments(),
      physiological: await Physiological.countDocuments(),
      vr_conversation: await VrConversation.countDocuments(),
      live_transcript: await LiveTranscriptSegment.countDocuments(),
      video_review_transcript: await VideoReviewTranscriptSegment.countDocuments()
    };
    res.json({ success: true, counts });
  } catch (e) {
    next(e);
  }
});

// ========== 查詢紀錄（依 userId / sessionId / 時間範圍）==========
router.get('/records', async (req, res, next) => {
  try {
    const { userId, sessionId, from, to, type, limit = 100 } = req.query;

    // VideoReviewTranscriptSegment 的欄位命名跟下面這些表不同（uid/createdAt，不是 userId/timestamp，
    // 沿用 vrLegacyData 那套慣例，見 models/VideoReviewTranscript.js），query 條件要分開處理，
    // 不能塞進下面共用的 models/query（否則會用不存在的欄位名查，永遠查不到）。
    if (type === 'video_review_transcript') {
      const vquery = {};
      if (userId) vquery.uid = userId;
      if (from || to) {
        vquery.createdAt = {};
        if (from) vquery.createdAt.$gte = new Date(from);
        if (to) vquery.createdAt.$lte = new Date(to);
      }
      // 依音軌裡的起始時間排序(不是 createdAt)，computer/microphone 兩軌交錯排出來就是一來一往的對話順序。
      const list = await VideoReviewTranscriptSegment.find(vquery)
        .sort({ startSec: 1, seq: 1 })
        .limit(Number(limit))
        .lean();
      return res.json({ success: true, data: list });
    }

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
      process: ProcessLog,
      web_event: WebEventLog,
      survey_final_answer: SurveyFinalAnswer,
      vr_conversation: VrConversation,
      live_transcript: LiveTranscriptSegment
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
