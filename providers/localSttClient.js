const BASE_URL = (process.env.LOCAL_STT_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
const HEALTH_TIMEOUT_MS = Number(process.env.LOCAL_STT_HEALTH_TIMEOUT_MS) || 3000;
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.LOCAL_STT_TRANSCRIBE_TIMEOUT_MS) || 30000;
// /transcribe/segments 專用逾時：整段 VR 錄音可能長達數十分鐘，遠比單輪對話久，不能沿用上面 30 秒。
const SEGMENTS_TIMEOUT_MS = Number(process.env.LOCAL_STT_SEGMENTS_TIMEOUT_MS) || 20 * 60 * 1000;

/** 這裡不需要金鑰，只要 LOCAL_STT_API_URL 指向的 FastAPI 服務有在跑即可 */
function isConfigured() {
  return true;
}

function getApiUrl() {
  return BASE_URL;
}

async function checkHealth() {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: ctrl.signal });
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}` };
    }
    const body = await res.json();
    return { ok: true, ...body };
  } catch (err) {
    const msg =
      err.name === 'AbortError' ? `連線逾時（${HEALTH_TIMEOUT_MS}ms）` : err.message || String(err);
    return { ok: false, error: msg };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * @param {Buffer} audioBuffer
 * @param {string} [filename]
 */
async function transcribeBuffer(audioBuffer, filename = 'audio.wav') {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer]), filename);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TRANSCRIBE_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/transcribe`, {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.detail || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`語音辨識逾時（${TRANSCRIBE_TIMEOUT_MS}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 整段錄音逐句(含每句起訖秒數)。給 video-review 複盤頁的 computer/microphone wav 用，
 * 跟上面 transcribeBuffer(單輪對話、只要合併文字)分開，逾時也長很多。
 * @param {Buffer} audioBuffer
 * @param {string} [filename]
 * @returns {Promise<{status:string, segments:Array<{text:string,start:number,end:number}>, language?:string, language_probability?:number}>}
 */
async function transcribeSegmentsBuffer(audioBuffer, filename = 'audio.wav') {
  const form = new FormData();
  form.append('file', new Blob([audioBuffer]), filename);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEGMENTS_TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE_URL}/transcribe/segments`, {
      method: 'POST',
      body: form,
      signal: ctrl.signal,
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || data.detail || `HTTP ${res.status}`);
    }
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`語音辨識逾時（${SEGMENTS_TIMEOUT_MS}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, getApiUrl, checkHealth, transcribeBuffer, transcribeSegmentsBuffer };
