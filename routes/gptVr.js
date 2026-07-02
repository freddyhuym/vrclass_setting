const express = require('express');
const https = require('https');
const { COLLECTIONS } = require('../models/vrLegacyData');

const router = express.Router();

const MAX_PER_COLLECTION = parseInt(process.env.GPT_VR_MAX_DOCS || '200', 10);
const MAX_CONTEXT_CHARS = parseInt(process.env.GPT_VR_MAX_CONTEXT_CHARS || '80000', 10);
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

function uidQuery(uid) {
  const s = String(uid).trim();
  if (!s) return null;
  const variants = [s];
  const n = Number(s);
  if (!Number.isNaN(n) && String(n) === s) {
    variants.push(n);
  }
  return { uid: { $in: variants } };
}

function callOpenAIChat({ apiKey, system, user }) {
  const body = JSON.stringify({
    model: OPENAI_MODEL,
    temperature: 0.35,
    max_tokens: 4096,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user }
    ]
  });
  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'api.openai.com',
        path: '/v1/chat/completions',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer ' + apiKey,
          'Content-Length': Buffer.byteLength(body, 'utf8')
        }
      },
      (res) => {
        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          try {
            const j = JSON.parse(data);
            if (j.error) {
              return reject(new Error(j.error.message || 'OpenAI API 錯誤'));
            }
            if (res.statusCode && res.statusCode >= 400) {
              return reject(
                new Error(
                  (j && j.error && j.error.message) || data.slice(0, 400) || 'OpenAI 請求失敗'
                )
              );
            }
            const text =
              j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
            if (text == null) {
              return reject(new Error('OpenAI 回傳內容為空'));
            }
            resolve({ text, usage: j.usage });
          } catch (e) {
            reject(new Error('剖析 OpenAI 回應失敗：' + (e && e.message)));
          }
        });
      }
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

/**
 * POST { uid, prompt? }
 * 以 uid 查五個 VR collection，彙整成文字交給 Chat 完成 API，回傳 { reply, counts, usage }
 */
router.post('/analyze', async (req, res, next) => {
  try {
    const apiKey = (process.env.OPENAI_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(500).json({ success: false, message: '伺服器未設定 OPENAI_API_KEY' });
    }
    const uid = (req.body && req.body.uid != null) ? String(req.body.uid).trim() : '';
    if (!uid) {
      return res.status(400).json({ success: false, message: '缺少 uid' });
    }
    const q = uidQuery(uid);
    if (!q) {
      return res.status(400).json({ success: false, message: 'uid 無效' });
    }
    const analysisPrompt = (req.body && req.body.prompt != null) ? String(req.body.prompt) : '';
    const userTask =
      analysisPrompt.trim() ||
      '請綜合以下與此 uid 相關的 VR 教室上傳資料，分析學習與觀看／事件行為，以繁體中文條列重點、可觀察的趨勢，以及給教學者或受試者的簡短建議。若資料明顯不足請直接說明。';

    const parts = [];
    const counts = {};
    for (const { key, Model } of COLLECTIONS) {
      const total = await Model.countDocuments(q);
      counts[key] = total;
      const rows = await Model.find(q).sort({ _id: -1 }).limit(MAX_PER_COLLECTION).lean();
      const block =
        '### ' +
        key +
        '（本批帶入 ' +
        rows.length +
        ' 筆，符合 uid 之總筆數約 ' +
        total +
        '）\n' +
        (rows.length
          ? rows.map((r, i) => '[#' + (i + 1) + '] ' + JSON.stringify(r)).join('\n')
          : '（此 collection 與此 uid 無列）');
      parts.push(block);
    }

    let dataBundle = parts.join('\n\n');
    const rawLen = dataBundle.length;
    if (dataBundle.length > MAX_CONTEXT_CHARS) {
      dataBundle =
        dataBundle.slice(0, MAX_CONTEXT_CHARS) +
        '\n\n[系統註：總量超過 ' +
        MAX_CONTEXT_CHARS +
        ' 字，已截斷；分析僅基於可見段。]';
    }

    const system =
      '你是協助教育科技與 IVR 教室研究的助理。只根據以下使用者提供之逐筆文件（JSON 字串）作推論，勿捏造未出現的欄位。若幾乎無資料，請清楚說明。回覆使用繁體中文。';

    const user =
      '任務與寫作風格：\n' +
      userTask +
      '\n\n---\n' +
      'uid「' +
      uid +
      '」之彙整資料（依 Mongo collection 分區；每筆一列 JSON，可能欄位不一）：\n\n' +
      dataBundle;

    const { text, usage } = await callOpenAIChat({ apiKey, system, user });
    res.json({
      success: true,
      reply: text,
      usage,
      counts,
      maxDocsPerCollection: MAX_PER_COLLECTION,
      contextChars: dataBundle.length,
      rawContextChars: rawLen,
      truncated: rawLen > MAX_CONTEXT_CHARS
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
