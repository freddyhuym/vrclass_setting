const express = require('express');
const router = express.Router();
const PersonalData = require('../models/PersonalData');
const Scale = require('../models/Scale');
const PromptSetting = require('../models/PromptSetting');

// ========== 個人資料 CRUD ==========
router.get('/personal', async (req, res, next) => {
  try {
    const { userId } = req.query;
    const query = userId ? { userId } : {};
    const list = await PersonalData.find(query).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (e) { next(e); }
});

router.post('/personal', async (req, res, next) => {
  try {
    const { userId, name, email, role, metadata } = req.body;
    if (!userId) return res.status(400).json({ success: false, message: '缺少 userId' });
    const doc = await PersonalData.findOneAndUpdate(
      { userId },
      { $set: { name, email, role, metadata, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.get('/personal/:userId', async (req, res, next) => {
  try {
    const doc = await PersonalData.findOne({ userId: req.params.userId }).lean();
    if (!doc) return res.status(404).json({ success: false, message: '找不到個人資料' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.put('/personal/:userId', async (req, res, next) => {
  try {
    const doc = await PersonalData.findOneAndUpdate(
      { userId: req.params.userId },
      { $set: { ...req.body, updatedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: '找不到個人資料' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.delete('/personal/:userId', async (req, res, next) => {
  try {
    const result = await PersonalData.deleteOne({ userId: req.params.userId });
    if (!result.deletedCount) return res.status(404).json({ success: false, message: '找不到個人資料' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// 從 SurveyJS 的 surveyJson 產生 items 陣列（相容舊 API / 紀錄用）
function itemsFromSurveyJson(surveyJson) {
  if (!surveyJson || !surveyJson.pages || !Array.isArray(surveyJson.pages)) return undefined;
  const items = [];
  let order = 0;
  for (const page of surveyJson.pages) {
    const elements = page.elements || [];
    for (const el of elements) {
      let type = 'text';
      if (el.type === 'radiogroup' || el.type === 'dropdown') type = 'single';
      else if (el.type === 'checkbox') type = 'multiple';
      else if (el.type === 'rating') type = 'likert';
      const options = (el.choices || []).map(c => (typeof c === 'string' ? c : (c.value || c.text)));
      items.push({
        question: el.title || el.name || '',
        type,
        options: options.length ? options : undefined,
        required: el.isRequired !== false,
        order: order++
      });
    }
  }
  return items.length ? items : undefined;
}

// ========== 量表問卷 CRUD ==========
router.get('/scales', async (req, res, next) => {
  try {
    const list = await Scale.find().sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (e) { next(e); }
});

router.post('/scales', async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.surveyJson) {
      const items = itemsFromSurveyJson(body.surveyJson);
      if (items) body.items = items;
    }
    const doc = await Scale.create(body);
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.get('/scales/:id', async (req, res, next) => {
  try {
    const doc = await Scale.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: '找不到量表' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.put('/scales/:id', async (req, res, next) => {
  try {
    const body = { ...req.body };
    if (body.surveyJson) {
      const items = itemsFromSurveyJson(body.surveyJson);
      if (items) body.items = items;
    }
    const doc = await Scale.findByIdAndUpdate(
      req.params.id,
      { $set: { ...body, updatedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: '找不到量表' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.delete('/scales/:id', async (req, res, next) => {
  try {
    const doc = await Scale.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: '找不到量表' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ========== Prompt 設定 CRUD（虛擬學生人格、互動風格、情緒回應規則等）==========
router.get('/prompts', async (req, res, next) => {
  try {
    const list = await PromptSetting.find().sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (e) { next(e); }
});

router.post('/prompts', async (req, res, next) => {
  try {
    const doc = await PromptSetting.create(req.body);
    res.status(201).json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.get('/prompts/:id', async (req, res, next) => {
  try {
    const doc = await PromptSetting.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: '找不到 Prompt 設定' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.put('/prompts/:id', async (req, res, next) => {
  try {
    const doc = await PromptSetting.findByIdAndUpdate(
      req.params.id,
      { $set: { ...req.body, updatedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: '找不到 Prompt 設定' });
    res.json({ success: true, data: doc });
  } catch (e) { next(e); }
});

router.delete('/prompts/:id', async (req, res, next) => {
  try {
    const doc = await PromptSetting.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: '找不到 Prompt 設定' });
    res.json({ success: true });
  } catch (e) { next(e); }
});

module.exports = router;
