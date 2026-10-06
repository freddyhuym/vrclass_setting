const express = require('express');
const path = require('path');
const fsp = require('fs/promises');
const router = express.Router();
const ExperimentStep = require('../models/ExperimentStep');
const ExperimentConfig = require('../models/ExperimentConfig');

function compareFlowStepsInMemory(a, b) {
  const oa = a.order != null ? Number(a.order) : 0;
  const ob = b.order != null ? Number(b.order) : 0;
  if (oa !== ob) return oa - ob;
  const m1 = /^step(\d+)$/i.exec(String(a.key || ''));
  const m2 = /^step(\d+)$/i.exec(String(b.key || ''));
  const na = m1 ? parseInt(m1[1], 10) : 1e9;
  const nb = m2 ? parseInt(m2[1], 10) : 1e9;
  if (na !== nb) return na - nb;
  return String(a.key || '').localeCompare(String(b.key || ''), 'en', { numeric: true });
}

/**
 * 遞迴列出 public 子目錄內可透過 /setting/{segment}/... 存取的 .html
 */
async function listPublicHtmlDir(absRoot, urlPrefix) {
  async function walk(rel) {
    const full = path.join(absRoot, rel);
    const out = [];
    let entries;
    try {
      entries = await fsp.readdir(full, { withFileTypes: true });
    } catch (e) {
      if (e && e.code === 'ENOENT') return [];
      throw e;
    }
    for (const ent of entries) {
      const relPath = rel ? rel + '/' + ent.name : ent.name;
      if (ent.isDirectory()) {
        out.push(...(await walk(relPath)));
      } else if (ent.isFile() && /\.(html|htm)$/i.test(ent.name)) {
        const webPath = urlPrefix + '/' + relPath.split(/[/\\]+/).join('/');
        out.push({ path: webPath, name: relPath });
      }
    }
    return out;
  }
  return walk('');
}

// 可選之自訂實驗頁（public/custom 內 .html）
router.get('/custom-pages', async (req, res, next) => {
  try {
    const list = await listPublicHtmlDir(
      path.join(__dirname, '..', 'public', 'custom'),
      '/setting/custom'
    );
    list.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    res.json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
});

// 可選之 GPT 回饋頁（與 custom 分開，目錄 public/gptfeedback）
router.get('/gptfeedback-pages', async (req, res, next) => {
  try {
    const list = await listPublicHtmlDir(
      path.join(__dirname, '..', 'public', 'gptfeedback'),
      '/setting/gptfeedback'
    );
    list.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    res.json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
});

// 取得指定流程的全部步驟（預設 flowKey = default）
router.get('/flow', async (req, res, next) => {
  try {
    const flowKey = req.query.flowKey || 'default';
    const list = await ExperimentStep.find({ flowKey, active: true }).lean();
    list.sort(compareFlowStepsInMemory);
    res.json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
});

// 以整個陣列方式儲存流程（排序與內容一起更新）
// body: { flowKey?: string, steps: [{ key, name, type, refKey?, customPath?, gptPrompt?, order? }, ...] }
router.post('/flow', async (req, res, next) => {
  try {
    const flowKey = req.body.flowKey || 'default';
    const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      const k = s && s.key != null ? String(s.key).trim() : '';
      if (k.length > 120) {
        return res.status(400).json({
          success: false,
          message: `第 ${i + 1} 步的「步驟 key」過長。請用簡短識別碼（如 step3），不要貼上整段提示詞。`
        });
      }
      if (s && (s.type === 'gptfeedback' || s.type === 'gptrealtime') && s.customPath) {
        const cp = String(s.customPath).trim();
        if (cp && !cp.startsWith('/')) {
          return res.status(400).json({
            success: false,
            message: `第 ${i + 1} 步 (${s.type})：「對應路徑」須為 / 開頭的 HTML 位址（例：/setting/${s.type}/vr-uid-gpt.html）。長段內文請寫在 gptPrompt，不要貼在路徑欄。`
          });
        }
      }
    }
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
        gptPrompt: s.gptPrompt,
        order: idx
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
      gptPrompt: body.gptPrompt,
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
    const requested = String(req.params.key || '');
    const step = await ExperimentStep.findOne({ key: requested }).lean();
    if (!step) {
      const all = await ExperimentStep.find()
        .select('key flowKey')
        .lean()
        .then((list) => list || []);
      const byFlow = {};
      for (const s of all) {
        const fk = s.flowKey || 'default';
        if (!byFlow[fk]) byFlow[fk] = [];
        if (s.key) byFlow[fk].push(s.key);
      }
      for (const fk of Object.keys(byFlow)) {
        byFlow[fk].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));
      }
      console.warn('[experiments] GET /steps 找不到實驗步驟', { requested, keysByFlow: byFlow, count: all.length });
      return res.status(404).json({
        success: false,
        message: '找不到實驗步驟',
        debug: {
          requestedKey: requested,
          keysByFlow: byFlow,
          totalSteps: all.length,
          hint: '比對此 URL 最後一段的 key 與「實驗流程」內的步驟 key；並確認已按儲存流程、Mongo 連到同一臺。'
        }
      });
    }
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
          gptPrompt: body.gptPrompt,
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

// 可選之即時語音辨識頁（與 custom、gptfeedback 分開，目錄 public/gptrealtime）
router.get('/gptrealtime-pages', async (req, res, next) => {
  try {
    const list = await listPublicHtmlDir(
      path.join(__dirname, '..', 'public', 'gptrealtime'),
      '/setting/gptrealtime'
    );
    list.sort((a, b) => a.path.localeCompare(b.path, 'en'));
    res.json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
});

// 取得實驗設定（目前包含 experimentCode）
router.get('/config', async (req, res, next) => {
  try {
    let cfg = await ExperimentConfig.findOne({ key: 'default' }).lean();
    if (!cfg) {
      const created = await ExperimentConfig.create({ key: 'default', experimentCode: 'study-001', updatedAt: new Date() });
      cfg = created.toObject();
    }
    res.json({ success: true, data: cfg });
  } catch (e) {
    next(e);
  }
});

// 更新實驗設定
router.put('/config', async (req, res, next) => {
  try {
    const experimentCode = String(req.body?.experimentCode || '').trim();
    if (!experimentCode) {
      return res.status(400).json({ success: false, message: 'experimentCode 不可為空' });
    }
    const cfg = await ExperimentConfig.findOneAndUpdate(
      { key: 'default' },
      { $set: { experimentCode, updatedAt: new Date() } },
      { upsert: true, new: true }
    );
    res.json({ success: true, data: cfg });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

