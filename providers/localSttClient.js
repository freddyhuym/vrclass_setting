const BASE_URL = (process.env.LOCAL_STT_API_URL || 'http://127.0.0.1:8001').replace(/\/$/, '');
const HEALTH_TIMEOUT_MS = Number(process.env.LOCAL_STT_HEALTH_TIMEOUT_MS) || 3000;
const TRANSCRIBE_TIMEOUT_MS = Number(process.env.LOCAL_STT_TRANSCRIBE_TIMEOUT_MS) || 30000;

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

module.exports = { isConfigured, getApiUrl, checkHealth, transcribeBuffer };
