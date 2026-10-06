/**
 * 雲端語音辨識（OpenAI Audio Transcriptions API），給 video-review 複盤頁的逐句字幕用。
 *
 * 用 whisper-1，不是 gpt-4o-transcribe：官方 API 目前只有 whisper-1 支援
 * response_format=verbose_json + timestamp_granularities=segment（逐句起訖秒數）；
 * gpt-4o-transcribe / gpt-4o-mini-transcribe 只回純文字，沒有逐句時間戳。
 * 這裡要的是「逐句 + 音軌時間」，所以選 whisper-1；純粹只要文字正確、不需要時間戳的話可以再考慮換。
 */
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_STT_MODEL || 'whisper-1';
const LANGUAGE = process.env.OPENAI_STT_LANGUAGE || 'zh';
const TIMEOUT_MS = Number(process.env.OPENAI_STT_TIMEOUT_MS) || 10 * 60 * 1000; // 單次上傳(一個音檔或一個切片)的逾時
// whisper-1 官方文件明講：no_speech_prob 高代表這段「很可能沒人在講話」，模型卻硬吐出一句話，
// 是雲端 Whisper 系列在靜音/雜訊時常見的腦補現象；門檻抓保守一點，避免誤丟真的小聲講話。
const NO_SPEECH_PROB_THRESHOLD = Number(process.env.OPENAI_STT_NO_SPEECH_THRESHOLD) || 0.6;

function isConfigured() {
  return !!OPENAI_API_KEY;
}

/**
 * @param {Buffer} audioBuffer
 * @param {string} [filename]
 * @returns {Promise<{segments: Array<{text:string,start:number,end:number,noSpeechProb?:number,avgLogprob?:number}>, language?:string}>}
 */
async function transcribeSegmentsBuffer(audioBuffer, filename = 'audio.mp3') {
  if (!OPENAI_API_KEY) {
    throw new Error('未設定 OPENAI_API_KEY，無法使用雲端語音辨識');
  }

  const form = new FormData();
  form.append('file', new Blob([audioBuffer]), filename);
  form.append('model', MODEL);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  if (LANGUAGE) form.append('language', LANGUAGE);

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_API_KEY}` },
      body: form,
      signal: ctrl.signal
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error((data.error && data.error.message) || `HTTP ${res.status}`);
    }

    const rawSegments = Array.isArray(data.segments) ? data.segments : [];
    const segments = rawSegments
      .filter((s) => s && typeof s.text === 'string' && s.text.trim())
      .filter((s) => s.no_speech_prob == null || Number(s.no_speech_prob) < NO_SPEECH_PROB_THRESHOLD)
      .map((s) => ({
        text: s.text.trim(),
        start: Number(s.start) || 0,
        end: Number(s.end) || 0,
        noSpeechProb: s.no_speech_prob != null ? Number(s.no_speech_prob) : undefined,
        avgLogprob: s.avg_logprob != null ? Number(s.avg_logprob) : undefined
      }));

    return { segments, language: data.language };
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`OpenAI 語音辨識逾時（${TIMEOUT_MS}ms）`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { isConfigured, transcribeSegmentsBuffer, MODEL };
