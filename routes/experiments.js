const express = require('express');
const router = express.Router();
const ExperimentStep = require('../models/ExperimentStep');

// 取得指定流程的全部步驟（預設 flowKey = default）
router.get('/flow', async (req, res, next) => {
  try {
    const flowKey = req.query.flowKey || 'default';
    const steps = await ExperimentStep.find({ flowKey, active: true })
      .sort({ order: 1, updatedAt: -1 })
      .lean();
    res.json({ success: true, data: steps });
  } catch (e) {
    next(e);
  }
});

// 以整個陣列方式儲存流程（排序與內容一起更新）
// body: { flowKey?: string, steps: [{ key, name, type, refKey?, customPath?, order? }, ...] }
router.post('/flow', async (req, res, next) => {
  try {
    const flowKey = req.body.flowKey || 'default';
    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
    // 先移除舊的
    await ExperimentStep.deleteMany({ flowKey });
    if (!steps.length) {
      return res.json({ success: true, data: [] });
    }
    // 重新建立
    const docs = await ExperimentStep.insertMany(
      steps.map((s, idx) => ({
        flowKey,
        key: s.key,
        name: s.name,
        type: s.type,
        refKey: s.refKey,
        customPath: s.customPath,
        order: typeof s.order === 'number' ? s.order : idx
      }))
    );
    res.json({ success: true, data: docs });
  } catch (e) {
    next(e);
  }
});

// 建立單一步驟
router.post('/steps', async (req, res, next) => {
  try {
    const body = req.body || {};
    const step = await ExperimentStep.create({
      flowKey: body.flowKey || 'default',
      key: body.key,
      name: body.name,
      type: body.type,
      refKey: body.refKey,
      customPath: body.customPath,
      order: body.order || 0
    });
    res.status(201).json({ success: true, data: step });
  } catch (e) {
    next(e);
  }
});

// 取得單一步驟（by key）
router.get('/steps/:key', async (req, res, next) => {
  try {
    const step = await ExperimentStep.findOne({ key: req.params.key }).lean();
    if (!step) return res.status(404).json({ success: false, message: '找不到實驗步驟' });
    res.json({ success: true, data: step });
  } catch (e) {
    next(e);
  }
});

// 更新單一步驟（by key）
router.put('/steps/:key', async (req, res, next) => {
  try {
    const body = req.body || {};
    const step = await ExperimentStep.findOneAndUpdate(
      { key: req.params.key },
      {
        $set: {
          name: body.name,
          type: body.type,
          refKey: body.refKey,
          customPath: body.customPath,
          order: body.order,
          flowKey: body.flowKey || 'default',
          active: typeof body.active === 'boolean' ? body.active : true,
          updatedAt: new Date()
        }
      },
      { new: true }
    );
    if (!step) return res.status(404).json({ success: false, message: '找不到實驗步驟' });
    res.json({ success: true, data: step });
  } catch (e) {
    next(e);
  }
});

// 刪除步驟（by key）
router.delete('/steps/:key', async (req, res, next) => {
  try {
    const step = await ExperimentStep.findOneAndDelete({ key: req.params.key });
    if (!step) return res.status(404).json({ success: false, message: '找不到實驗步驟' });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

