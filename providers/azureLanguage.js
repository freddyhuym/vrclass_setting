const SENTIMENT_ZH = {
  positive: '正面',
  negative: '負面',
  neutral: '中立',
  mixed: '混合',
};

const TIMEOUT_MS = Number(process.env.AZURE_LANGUAGE_TIMEOUT_MS) || 15000;
const API_VERSION = process.env.AZURE_LANGUAGE_API_VERSION || '2024-11-01';

function getKey() {
  return (process.env.AZURE_LANGUAGE_KEY || '').trim();
}

function getEndpoint() {
  const custom = (process.env.AZURE_LANGUAGE_ENDPOINT || '').trim();
  if (custom) return custom.replace(/\/$/, '');
  const region = (process.env.AZURE_LANGUAGE_REGION || '').trim();
  if (region) return `https://${region}.api.cognitive.microsoft.com`;
  return '';
}

function usesResourceEndpoint(endpoint) {
  return /\.cognitiveservices\.azure\.com$/i.test(endpoint);
}

function mapLanguage(locale) {
  const loc = (locale || process.env.SPEECH_LOCALE || 'zh-TW').toLowerCase();
  if (loc.startsWith('zh-tw') || loc === 'zh-hant') return 'zh-hant';
  if (loc.startsWith('zh')) return 'zh-hans';
  if (loc.startsWith('en')) return 'en';
  return loc.split('-')[0] || 'zh-hant';
}

function getConfigHint() {
  if (!getKey()) {
    return (
      'Azure Speech 金鑰無法用於文字情緒。請在 Portal 建立「Language」資源，' +
      '設定 AZURE_LANGUAGE_KEY 與 AZURE_LANGUAGE_ENDPOINT（例：https://<資源名>.cognitiveservices.azure.com）'
    );
  }
  if (!getEndpoint()) {
    return '請設定 AZURE_LANGUAGE_ENDPOINT（Language 資源 → Keys and Endpoint 頁面）';
  }
  if (!usesResourceEndpoint(getEndpoint())) {
    return (
      '建議使用 Language 資源專用 endpoint（*.cognitiveservices.azure.com），' +
      '區域型 endpoint 僅適用於舊版多服務帳戶'
    );
  }
  return null;
}

function isConfigured() {
  return Boolean(getKey() && getEndpoint());
}

function normalizeOpinionsLegacy(opinions = []) {
  return opinions.slice(0, 8).map((op) => ({
    target: op.target?.text || '',
    targetSentiment: op.target?.sentiment || '',
    targetSentimentZh: SENTIMENT_ZH[op.target?.sentiment] || op.target?.sentiment || '',
    assessments: (op.assessments || []).slice(0, 5).map((a) => ({
      text: a.text || '',
      sentiment: a.sentiment || '',
      sentimentZh: SENTIMENT_ZH[a.sentiment] || a.sentiment || '',
      isNegated: Boolean(a.isNegated),
    })),
  }));
}

function normalizeOpinionsFromSentences(sentences = []) {
  const out = [];
  for (const sent of sentences) {
    const assessments = sent.assessments || [];
    for (const target of sent.targets || []) {
      const linked = new Set(
        (target.relations || [])
          .filter((r) => r.relationType === 'assessment' && r.ref)
          .map((r) => {
            const m = r.ref.match(/assessments\/(\d+)/);
            return m ? Number(m[1]) : null;
          })
          .filter((n) => n != null)
      );
      const picked =
        linked.size > 0
          ? assessments.filter((_, i) => linked.has(i))
          : assessments.slice(0, 3);
      out.push({
        target: target.text || '',
        targetSentiment: target.sentiment || '',
        targetSentimentZh: SENTIMENT_ZH[target.sentiment] || target.sentiment || '',
        assessments: picked.map((a) => ({
          text: a.text || '',
          sentiment: a.sentiment || '',
          sentimentZh: SENTIMENT_ZH[a.sentiment] || a.sentiment || '',
          isNegated: Boolean(a.isNegated),
        })),
      });
    }
  }
  return out.slice(0, 8);
}

function normalizeDocument(doc, { legacy = false } = {}) {
  if (!doc || doc.error) {
    throw new Error(doc?.error?.message || 'Azure Language 分析失敗');
  }
  const sentiment = doc.sentiment || 'neutral';
  const scores = doc.confidenceScores || {};
  return {
    status: 'ok',
    tool: 'Azure Language Service',
    feature: 'Sentiment + Opinion Mining',
    api: legacy ? 'text-analytics-v3.1' : 'analyze-text-2024',
    sentiment,
    sentiment_zh: SENTIMENT_ZH[sentiment] || sentiment,
    confidenceScores: {
      positive: Number(scores.positive ?? 0),
      neutral: Number(scores.neutral ?? 0),
      negative: Number(scores.negative ?? 0),
    },
    opinions: legacy
      ? normalizeOpinionsLegacy(doc.opinions)
      : normalizeOpinionsFromSentences(doc.sentences),
    sentenceCount: Array.isArray(doc.sentences) ? doc.sentences.length : 0,
  };
}

async function callNewApi(endpoint, key, text, language, opinionMining) {
  const url = `${endpoint}/language/:analyze-text?api-version=${API_VERSION}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      kind: 'SentimentAnalysis',
      parameters: { modelVersion: 'latest', opinionMining },
      analysisInput: {
        documents: [{ id: '1', language, text }],
      },
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message || body?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const doc = body.results?.documents?.[0];
  if (doc?.error) {
    throw new Error(doc.error.message || '文件分析失敗');
  }
  return normalizeDocument(doc, { legacy: false });
}

async function callLegacyApi(endpoint, key, text, language, opinionMining) {
  const url = `${endpoint}/text/analytics/v3.1/sentiment`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Ocp-Apim-Subscription-Key': key,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      documents: [{ id: '1', language, text }],
      opinionMining,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    const msg = body?.error?.message || body?.errors?.[0]?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }
  const doc = body.results?.documents?.[0];
  return normalizeDocument(doc, { legacy: true });
}

async function checkHealth() {
  if (!isConfigured()) {
    return { ok: false, error: getConfigHint() || '未設定 Azure Language' };
  }
  try {
    const result = await analyzeSentiment('服務很好', { language: 'zh-hant' });
    return {
      ok: result.status === 'ok',
      endpoint: getEndpoint(),
      api: result.api,
    };
  } catch (err) {
    return {
      ok: false,
      endpoint: getEndpoint(),
      error: err.message || String(err),
      hint: getConfigHint(),
    };
  }
}

async function analyzeSentiment(text, { language, opinionMining = true } = {}) {
  const trimmed = (text || '').trim();
  if (!trimmed) {
    return { status: 'skip', error: '文字為空' };
  }
  if (!isConfigured()) {
    throw new Error(getConfigHint() || '未設定 Azure Language');
  }

  const endpoint = getEndpoint();
  const key = getKey();
  const lang = language || mapLanguage();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const t0 = Date.now();

  try {
    const run = usesResourceEndpoint(endpoint)
      ? () => callNewApi(endpoint, key, trimmed, lang, opinionMining)
      : () => callLegacyApi(endpoint, key, trimmed, lang, opinionMining);

    const out = await Promise.race([
      run(),
      new Promise((_, reject) => {
        ctrl.signal.addEventListener('abort', () =>
          reject(new Error(`Azure Language 逾時（${TIMEOUT_MS}ms）`))
        );
      }),
    ]);

    out.timing_ms = Date.now() - t0;
    out.textPreview = trimmed.length > 80 ? `${trimmed.slice(0, 80)}…` : trimmed;
    return out;
  } catch (err) {
    if (/invalid subscription key|wrong API endpoint|401/i.test(err.message || '')) {
      throw new Error(
        `${err.message}\n` +
          '提示：Speech 與 Language 為不同 Azure 資源。請到 Portal 建立 Language 資源，' +
          '複製 Keys and Endpoint 到 AZURE_LANGUAGE_KEY、AZURE_LANGUAGE_ENDPOINT。'
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  isConfigured,
  getConfigHint,
  checkHealth,
  analyzeSentiment,
};
