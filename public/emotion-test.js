const MERALION_ZH = {
  neutral: '中立', happy: '開心', sad: '難過', angry: '憤怒',
  fearful: '恐懼', disgusted: '厭惡', surprised: '驚訝',
};
const MERALION_ORDER = Object.keys(MERALION_ZH);
const SENTIMENT_ZH = { positive: '正面', negative: '負面', neutral: '中立', mixed: '混合' };
const FEATURE_LABELS = {
  F0_mean: '基頻均值 F0', F0_max: '基頻峰值 F0', F0_range: '基頻範圍',
  loudness_mean: '響度均值', loudness_max: '響度峰值',
  jitter: '頻譜抖動 jitter', shimmer: '強度抖動 shimmer',
  spectral_flux: '頻譜通量', HNR: '諧噪比 HNR',
};

const SAMPLE_RATE = 16000;
const AZURE_TICKS_PER_SEC = 10_000_000;
const MIN_EMOTION_SAMPLES = 8000; // 0.5s @16k，太短的片段不送分析
const STREAM_SAMPLE_WAIT_MS = 250;

const $ = (id) => document.getElementById(id);

let ws = null;
let audioContext = null;
let processor = null;
let mediaStream = null;
let streamPcmChunks = [];
let streamSampleCount = 0;
let emotionHistory = [];
let currentUtterance = null;
let sttOk = false;
let voiceEmotionOk = false;
let meralionOn = false;
let textSentimentOk = false;

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s ?? '';
  return d.innerHTML;
}

function arousalLabel(score) {
  if (score == null || Number.isNaN(score)) return '—';
  if (score < 0.25) return '偏平靜';
  if (score < 0.5) return '中等喚醒';
  if (score < 0.75) return '偏高喚醒';
  return '高喚醒（可能激動/憤怒）';
}

function floatTo16BitPCM(float32Array) {
  const buffer = new ArrayBuffer(float32Array.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < float32Array.length; i++) {
    const s = Math.max(-1, Math.min(1, float32Array[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Int16Array(buffer);
}

function downsampleTo16k(buffer, inputSampleRate) {
  if (inputSampleRate === SAMPLE_RATE) return buffer;
  const ratio = inputSampleRate / SAMPLE_RATE;
  const newLen = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLen);
  for (let i = 0; i < newLen; i++) result[i] = buffer[Math.round(i * ratio)] || 0;
  return result;
}

function azureTicksToSamples(ticks) {
  return Math.max(0, Math.round((Number(ticks) * SAMPLE_RATE) / AZURE_TICKS_PER_SEC));
}

function appendStreamPcm(pcm) {
  streamPcmChunks.push({ pcm, start: streamSampleCount });
  streamSampleCount += pcm.length;
}

function resetStreamPcm() {
  streamPcmChunks = [];
  streamSampleCount = 0;
}

function sliceStreamPcm(startSample, endSample) {
  const start = Math.max(0, Math.min(startSample, streamSampleCount));
  const end = Math.max(start, Math.min(endSample, streamSampleCount));
  const len = end - start;
  if (len <= 0) return new Int16Array(0);
  const out = new Int16Array(len);
  let written = 0;
  for (const { pcm, start: chunkStart } of streamPcmChunks) {
    const chunkEnd = chunkStart + pcm.length;
    if (chunkEnd <= start || chunkStart >= end) continue;
    const sliceStart = Math.max(start, chunkStart) - chunkStart;
    const sliceEnd = Math.min(end, chunkEnd) - chunkStart;
    out.set(pcm.subarray(sliceStart, sliceEnd), written);
    written += sliceEnd - sliceStart;
  }
  return out;
}

function waitForStreamSamples(targetEnd) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      if (streamSampleCount >= targetEnd || performance.now() - t0 >= STREAM_SAMPLE_WAIT_MS) {
        resolve();
        return;
      }
      requestAnimationFrame(tick);
    };
    tick();
  });
}

function pcmToWavBlob(pcm, sampleRate = SAMPLE_RATE) {
  const dataSize = pcm.length * 2;
  const header = new ArrayBuffer(44);
  const view = new DataView(header);
  view.setUint32(0, 0x52494646, false);
  view.setUint32(4, 36 + dataSize, true);
  view.setUint32(8, 0x57415645, false);
  view.setUint32(12, 0x666d7420, false);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  view.setUint32(36, 0x64617461, false);
  view.setUint32(40, dataSize, true);
  return new Blob([header, pcm.buffer], { type: 'audio/wav' });
}

function appendFinalText(prev, segment) {
  const base = (prev || '').trim();
  const seg = (segment || '').trim();
  if (!seg) return base;
  if (!base) return seg;
  return `${base}\n${seg}`;
}

async function loadStatus() {
  const bar = $('status-bar');
  bar.innerHTML = '<span class="badge off">檢查服務狀態中…</span>';
  const res = await fetch('/api/vr-emotion/health');
  const data = await res.json();

  sttOk = Boolean(data.speechToText?.configured);
  voiceEmotionOk = Boolean(data.voiceEmotion?.ok);
  const mer = data.voiceEmotion?.tools?.meralion;
  meralionOn = Boolean(mer?.enabled && mer?.loaded);
  textSentimentOk = Boolean(data.textSentiment?.configured && data.textSentiment?.ok);

  const sttBadge = `<span class="badge ${sttOk ? 'on' : 'off'}">語音辨識(Azure STT)：${sttOk ? '已設定' : '未設定'}</span>`;
  const voiceBadge = `<span class="badge opensmile ${voiceEmotionOk ? 'on' : 'off'}">openSMILE：${voiceEmotionOk ? '已連線' : '未連線'}</span>`;
  const merBadge = mer?.enabled
    ? `<span class="badge meralion ${meralionOn ? 'on' : 'off'}">MERaLiON：${meralionOn ? '已就緒' : mer?.error ? '載入失敗' : '載入中'}</span>`
    : `<span class="badge off">MERaLiON：已停用</span>`;
  const textBadge = `<span class="badge sentiment ${textSentimentOk ? 'on' : 'off'}">文字情緒(Azure)：${textSentimentOk ? '已就緒' : '未設定/未連線'}</span>`;

  bar.innerHTML = sttBadge + voiceBadge + merBadge + textBadge;
  return data;
}

function renderMeralion(mer) {
  const panel = $('meralionPanel');
  if (!mer || mer.status !== 'ok' || !mer.emotions) {
    if (mer?.status === 'error') {
      panel.classList.remove('hidden');
      panel.innerHTML = `<p class="error-msg">MERaLiON-SER：${escapeHtml(mer.error)}</p>`;
    } else {
      panel.classList.add('hidden');
    }
    return;
  }
  panel.classList.remove('hidden');
  const emotions = mer.emotions;
  const sorted = MERALION_ORDER.map((k) => [k, emotions[k] ?? 0]).sort((a, b) => b[1] - a[1]);
  const topKey = mer.top_emotion || sorted[0][0];
  const topZh = mer.top_emotion_zh || MERALION_ZH[topKey] || topKey;
  const topScore = mer.top_score ?? sorted[0][1];
  const dims = mer.dimensions || {};

  const bars = sorted
    .map(([key, score]) => {
      const pct = Math.round(score * 1000) / 10;
      const isTop = key === topKey;
      return `<div class="emotion-bar-row${isTop ? ' is-top' : ''}">
        <span class="bar-label">${escapeHtml(MERALION_ZH[key] || key)}</span>
        <div class="bar-track"><div class="bar-fill${isTop ? ' top' : ''}" style="width:${Math.min(pct, 100)}%"></div></div>
        <span class="bar-pct">${pct.toFixed(1)}%</span>
      </div>`;
    })
    .join('');

  const vadHtml = dims.valence != null
    ? `<div class="meralion-vad">
        <span>Valence（正負向）<strong>${dims.valence.toFixed(3)}</strong></span>
        <span>Arousal（激動）<strong>${dims.arousal?.toFixed(3) ?? '—'}</strong></span>
        <span>Dominance（掌控）<strong>${dims.dominance?.toFixed(3) ?? '—'}</strong></span>
      </div>`
    : '';

  panel.innerHTML = `
    <div class="meralion-top">
      <span class="top-label">${escapeHtml(topZh)}</span>
      <span class="top-score">最高機率 ${(topScore * 100).toFixed(1)}% · MERaLiON-SER</span>
    </div>
    ${vadHtml}
    <div class="emotion-bar-list">${bars}</div>
  `;
}

function renderOpenSmile(os, meta = {}) {
  const strip = $('opensmileStrip');
  const details = $('opensmileDetails');
  const grid = $('featureGrid');
  const hero = $('emotionCard');

  if (!os || os.status !== 'ok') {
    strip.classList.add('hidden');
    details.classList.add('hidden');
    hero.innerHTML = '<p class="score-hint">openSMILE 分析未執行或失敗</p>';
    return;
  }

  const score = os.arousal_score ?? 0;
  const pct = Math.round(score * 100);
  const sentenceLine = meta.sentence
    ? `「${meta.sentence.slice(0, 60)}${meta.sentence.length > 60 ? '…' : ''}」`
    : '';

  strip.classList.remove('hidden');
  strip.innerHTML = `
    <div class="opensmile-strip-head">
      <span class="opensmile-strip-title">openSMILE 高喚醒 arousal</span>
      <span class="opensmile-strip-value">${score.toFixed(3)} · ${escapeHtml(arousalLabel(score))}</span>
    </div>
    <div class="score-bar-wrap"><div class="score-bar opensmile-bar" style="width:${pct}%"></div></div>
  `;

  hero.innerHTML = `
    <p class="score-hint">
      ${sentenceLine ? `${escapeHtml(sentenceLine)} · ` : ''}
      總分析耗時 ${meta.totalMs != null ? `${meta.totalMs} ms` : '—'}
      ${meta.timing ? `（openSMILE ${meta.timing.opensmile_ms ?? '—'} ms${meta.timing.meralion_ms != null ? ` · MERaLiON ${meta.timing.meralion_ms} ms` : ''}）` : ''}
    </p>
  `;

  const features = os.features || {};
  if (Object.keys(features).length) {
    details.classList.remove('hidden');
    grid.innerHTML = Object.entries(features)
      .map(([key, val]) => {
        const label = FEATURE_LABELS[key] || key;
        const display = val == null ? 'N/A' : Number(val).toFixed(4);
        return `<div class="feature-item"><div class="name">${escapeHtml(label)}</div><div class="val">${display}</div></div>`;
      })
      .join('');
  } else {
    details.classList.add('hidden');
  }
}

function renderSentiment(sent) {
  const panel = $('sentimentPanel');
  const details = $('sentimentDetails');
  const opinionsEl = $('sentimentOpinions');

  if (!sent) {
    panel.classList.add('hidden');
    details.classList.add('hidden');
    return;
  }
  if (!sent.success && sent.message) {
    panel.classList.remove('hidden');
    panel.innerHTML = `<p class="error-msg">Azure 文字情緒：${escapeHtml(sent.message)}</p>`;
    details.classList.add('hidden');
    return;
  }
  if (sent.status !== 'ok') {
    panel.classList.add('hidden');
    return;
  }

  const scores = sent.confidenceScores || {};
  const pos = (scores.positive ?? 0) * 100;
  const neu = (scores.neutral ?? 0) * 100;
  const neg = (scores.negative ?? 0) * 100;
  const label = sent.sentiment_zh || SENTIMENT_ZH[sent.sentiment] || sent.sentiment;

  panel.classList.remove('hidden');
  panel.innerHTML = `
    <div class="sentiment-top">
      <span class="top-label">${escapeHtml(label)}</span>
      <span class="top-score">Azure Sentiment${sent.timing_ms != null ? ` · ${sent.timing_ms} ms` : ''}</span>
    </div>
    <div class="sentiment-scores">
      <div class="sentiment-score-row"><span>正面</span><div class="bar-track"><div class="bar-fill positive" style="width:${pos.toFixed(1)}%"></div></div><span>${pos.toFixed(1)}%</span></div>
      <div class="sentiment-score-row"><span>中立</span><div class="bar-track"><div class="bar-fill neutral" style="width:${neu.toFixed(1)}%"></div></div><span>${neu.toFixed(1)}%</span></div>
      <div class="sentiment-score-row"><span>負面</span><div class="bar-track"><div class="bar-fill negative" style="width:${neg.toFixed(1)}%"></div></div><span>${neg.toFixed(1)}%</span></div>
    </div>
  `;

  const opinions = sent.opinions || [];
  if (opinions.length) {
    details.classList.remove('hidden');
    details.open = true;
    opinionsEl.innerHTML = opinions
      .map((op) => {
        const assess = (op.assessments || [])
          .map((a) => `<li>${escapeHtml(a.text)} → ${escapeHtml(a.sentimentZh || a.sentiment)}${a.isNegated ? '（否定）' : ''}</li>`)
          .join('');
        return `<div class="opinion-item">
          <div class="opinion-target">對象「${escapeHtml(op.target)}」· ${escapeHtml(op.targetSentimentZh || op.targetSentiment || '—')}</div>
          ${assess ? `<ul>${assess}</ul>` : ''}
        </div>`;
      })
      .join('');
  } else {
    details.classList.add('hidden');
    opinionsEl.innerHTML = '';
  }
}

function buildHistoryRow(u) {
  const mer = u.voice?.meralion;
  const os = u.voice?.opensmile;
  const sent = u.text;

  const meralionLines = [];
  if (mer?.emotions) {
    const sorted = MERALION_ORDER.map((k) => [k, mer.emotions[k] ?? 0]).sort((a, b) => b[1] - a[1]);
    for (const [k, v] of sorted) meralionLines.push(`${MERALION_ZH[k]} ${(v * 100).toFixed(1)}%`);
  }

  const opensmileLines = [];
  const arousal = os?.arousal_score;
  if (arousal != null) opensmileLines.push(`高喚醒 arousal ${arousal.toFixed(3)}`);

  let textSummary = '';
  if (sent?.status === 'ok') {
    const zh = sent.sentiment_zh || SENTIMENT_ZH[sent.sentiment] || sent.sentiment || '—';
    const scores = sent.confidenceScores || {};
    const pos = scores.positive != null ? `${(scores.positive * 100).toFixed(1)}%` : '—';
    const neu = scores.neutral != null ? `${(scores.neutral * 100).toFixed(1)}%` : '—';
    const neg = scores.negative != null ? `${(scores.negative * 100).toFixed(1)}%` : '—';
    textSummary = `${zh}（正${pos} 中${neu} 負${neg}）`;
  }

  return {
    time: new Date().toLocaleTimeString('zh-TW', { hour12: false }),
    sentence: u.sentence || '',
    meralionLines,
    opensmileLines,
    textSummary,
  };
}

function formatHistoryMultiline(lines) {
  if (!lines?.length) return '—';
  return lines.map((l) => `<span class="hist-line">${escapeHtml(l)}</span>`).join('');
}

function renderEmotionHistory() {
  const el = $('emotionHistory');
  if (!emotionHistory.length) {
    el.classList.add('hidden');
    return;
  }
  el.classList.remove('hidden');
  const rows = [...emotionHistory].reverse().slice(0, 10);
  el.innerHTML = `<h3>歷史句子情緒比較（最近 ${rows.length} 句）</h3>
    <p class="compare-hint">MERaLiON＝7 類聲音情緒＋VAD；openSMILE＝聲學特徵（非情緒分類）；Azure＝STT 文字情感</p>
    <table class="compare-table">
      <thead><tr><th>時間</th><th>句子</th><th>MERaLiON（聲音）</th><th>openSMILE（聲學）</th><th>Azure 文字情緒</th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td>${escapeHtml(r.time)}</td>
        <td class="sentence-cell">${escapeHtml(r.sentence || '—')}</td>
        <td class="cell-multi meralion">${formatHistoryMultiline(r.meralionLines)}</td>
        <td class="cell-multi opensmile">${formatHistoryMultiline(r.opensmileLines)}</td>
        <td class="cell-multi sentiment">${r.textSummary ? escapeHtml(r.textSummary) : '—'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
}

function finalizeUtteranceHistory() {
  const u = currentUtterance;
  if (!u) return;
  const needVoice = voiceEmotionOk;
  const needText = textSentimentOk && u.sentence.trim();
  if (needVoice && !u.voiceDone) return;
  if (needText && !u.textDone) return;

  emotionHistory.push(buildHistoryRow(u));
  renderEmotionHistory();
  currentUtterance = null;
}

async function analyzeTextSentiment(sentence) {
  const text = (sentence || '').trim();
  if (!textSentimentOk || !text) {
    if (currentUtterance?.sentence === sentence) {
      currentUtterance.textDone = true;
      finalizeUtteranceHistory();
    }
    return;
  }
  $('sentimentPanel').classList.remove('hidden');
  $('sentimentPanel').innerHTML = '<p class="loading">文字情緒分析中（Azure Sentiment）…</p>';
  try {
    const res = await fetch('/api/vr-emotion/text-sentiment', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    renderSentiment(data);
    if (currentUtterance && currentUtterance.sentence === text) {
      currentUtterance.text = data;
      currentUtterance.textDone = true;
      finalizeUtteranceHistory();
    }
  } catch (e) {
    renderSentiment({ success: false, message: e.message });
    if (currentUtterance && currentUtterance.sentence === text) {
      currentUtterance.textDone = true;
      finalizeUtteranceHistory();
    }
  }
}

async function analyzeVoiceEmotion(sentence, audioSegment) {
  if (!voiceEmotionOk) return;

  let pcm;
  if (audioSegment?.audioOffsetTicks != null && audioSegment?.audioDurationTicks != null && audioSegment.audioDurationTicks > 0) {
    const start = azureTicksToSamples(audioSegment.audioOffsetTicks);
    const duration = azureTicksToSamples(audioSegment.audioDurationTicks);
    await waitForStreamSamples(start + duration);
    pcm = sliceStreamPcm(start, start + duration);
  } else {
    pcm = sliceStreamPcm(Math.max(0, streamSampleCount - SAMPLE_RATE * 15), streamSampleCount);
  }

  if (pcm.length < MIN_EMOTION_SAMPLES) {
    if (currentUtterance?.sentence === sentence) {
      currentUtterance.voiceDone = true;
      finalizeUtteranceHistory();
    }
    return;
  }

  $('meralionPanel').classList.remove('hidden');
  $('meralionPanel').innerHTML = '<p class="loading">聲音情緒分析中（openSMILE / MERaLiON）…</p>';

  const t0 = performance.now();
  const form = new FormData();
  form.append('audio', pcmToWavBlob(pcm), 'utterance.wav');

  try {
    const res = await fetch('/api/vr-emotion/voice-emotion', { method: 'POST', body: form });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || '聲音情緒分析失敗');
    data.totalMs = Math.round(performance.now() - t0);

    renderOpenSmile(data.opensmile, { sentence, totalMs: data.totalMs, timing: data.timing_ms });
    renderMeralion(data.meralion);

    if (currentUtterance && currentUtterance.sentence === sentence) {
      currentUtterance.voice = data;
      currentUtterance.voiceDone = true;
      finalizeUtteranceHistory();
    }
  } catch (e) {
    $('emotionCard').innerHTML = `<p class="error-msg">${escapeHtml(e.message)}</p>`;
    if (currentUtterance && currentUtterance.sentence === sentence) {
      currentUtterance.voiceDone = true;
      finalizeUtteranceHistory();
    }
  }
}

function beginUtteranceAnalysis(sentence, audioSegment) {
  const text = (sentence || '').trim();
  if (!voiceEmotionOk && !(textSentimentOk && text)) return;

  currentUtterance = {
    sentence: text,
    voice: null,
    text: null,
    voiceDone: !voiceEmotionOk,
    textDone: !textSentimentOk || !text,
  };

  if (voiceEmotionOk) analyzeVoiceEmotion(text, audioSegment);
  if (textSentimentOk && text) analyzeTextSentiment(text);
}

async function refreshMicList() {
  const sel = $('micSelect');
  if (!navigator.mediaDevices?.enumerateDevices) return;
  const devices = await navigator.mediaDevices.enumerateDevices();
  const mics = devices.filter((d) => d.kind === 'audioinput');
  const prev = sel.value;

  sel.innerHTML = mics
    .map((d, i) => {
      const isDefault = d.deviceId === 'default';
      const label = d.label || (isDefault ? '預設麥克風' : `麥克風 ${i + 1}`);
      return `<option value="${escapeHtml(d.deviceId)}">${escapeHtml(label)}${isDefault ? '（系統預設）' : ''}</option>`;
    })
    .join('');

  if (prev && mics.some((d) => d.deviceId === prev)) {
    sel.value = prev;
  } else if (mics.length) {
    sel.value = mics[0].deviceId;
  }
}

navigator.mediaDevices?.enumerateDevices &&
  (navigator.mediaDevices.ondevicechange = () => refreshMicList());

$('micSelect').addEventListener('change', () => {
  if (mediaStream) restartMicrophone().catch((e) => alert(`切換麥克風失敗：${e.message}`));
});

async function stopMicrophoneOnly() {
  if (processor) { processor.disconnect(); processor = null; }
  if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
  if (audioContext) { await audioContext.close(); audioContext = null; }
}

async function restartMicrophone() {
  await stopMicrophoneOnly();
  await startMicrophone();
}

async function startMicrophone() {
  const deviceId = $('micSelect').value;
  mediaStream = await navigator.mediaDevices.getUserMedia({
    audio: {
      deviceId: deviceId ? { exact: deviceId } : undefined,
      echoCancellation: true,
      noiseSuppression: true,
    },
  });
  refreshMicList().catch(() => {});
  audioContext = new AudioContext();
  if (audioContext.state === 'suspended') await audioContext.resume();

  const source = audioContext.createMediaStreamSource(mediaStream);
  processor = audioContext.createScriptProcessor(4096, 1, 1);
  const silent = audioContext.createGain();
  silent.gain.value = 0;
  source.connect(processor);
  processor.connect(silent);
  silent.connect(audioContext.destination);

  processor.onaudioprocess = (e) => {
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    const input = e.inputBuffer.getChannelData(0);
    const down = downsampleTo16k(input, audioContext.sampleRate);
    const pcm = floatTo16BitPCM(down);
    appendStreamPcm(pcm);
    ws.send(pcm.buffer);
  };
}

async function startLive() {
  await loadStatus();
  if (!sttOk) {
    alert('尚未設定 AZURE_SPEECH_KEY / AZURE_SPEECH_REGION，無法語音辨識');
    return;
  }

  resetStreamPcm();
  emotionHistory = [];
  currentUtterance = null;
  $('emotionHistory').classList.add('hidden');
  $('finalTranscript').textContent = '';
  $('partialLine').textContent = '連線中…';
  $('emotionCard').innerHTML = '<p class="score-hint">說完一句話後，這裡會顯示分析結果。</p>';
  $('meralionPanel').classList.add('hidden');
  $('sentimentPanel').classList.add('hidden');
  $('opensmileStrip').classList.add('hidden');

  let finalText = '';

  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${location.host}/ws/vr-emotion/stt`);
  ws.binaryType = 'arraybuffer';

  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }

    if (msg.type === 'ready') {
      $('liveIndicator').classList.remove('hidden');
      $('partialLine').textContent = '請開始說話…';
      startMicrophone().catch((e) => {
        alert(`無法使用麥克風：${e.message}`);
        stopLive();
      });
    }

    if (msg.type === 'partial') {
      $('partialLine').textContent = msg.text || '';
    }

    if (msg.type === 'final') {
      finalText = appendFinalText(finalText, msg.text);
      $('finalTranscript').textContent = finalText;
      $('partialLine').textContent = '';
      beginUtteranceAnalysis(msg.text, {
        audioOffsetTicks: msg.audioOffsetTicks,
        audioDurationTicks: msg.audioDurationTicks,
      });
    }

    if (msg.type === 'error') {
      $('partialLine').textContent = '';
      $('finalTranscript').innerHTML += `\n<span class="error-msg">${escapeHtml(msg.message)}</span>`;
    }
  };

  ws.onerror = () => alert('WebSocket 連線失敗');
  ws.onclose = () => {
    $('btnStart').disabled = false;
    $('btnStop').disabled = true;
    $('liveIndicator').classList.add('hidden');
  };

  $('btnStart').disabled = true;
  $('btnStop').disabled = false;
}

function stopLive() {
  $('liveIndicator').classList.add('hidden');
  if (processor) { processor.disconnect(); processor = null; }
  if (mediaStream) { mediaStream.getTracks().forEach((t) => t.stop()); mediaStream = null; }
  if (audioContext) { audioContext.close(); audioContext = null; }
  if (ws?.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'stop' }));
    setTimeout(() => ws?.close(), 300);
  } else {
    ws?.close();
  }
  ws = null;
  resetStreamPcm();
  $('btnStart').disabled = false;
  $('btnStop').disabled = true;
}

$('btnStart').addEventListener('click', () => startLive().catch((e) => alert(e.message)));
$('btnStop').addEventListener('click', stopLive);

loadStatus().catch((e) => {
  $('status-bar').innerHTML = '<span class="badge off">狀態載入失敗</span>';
  console.error(e);
});

refreshMicList().catch((e) => console.error('無法列出麥克風清單', e));
