const express = require('express');
const fs = require('fs/promises');
const path = require('path');
const router = express.Router();
const { COLLECTIONS, EventLookingData } = require('../models/vrLegacyData');
const { VideoReviewTranscriptSegment } = require('../models/VideoReviewTranscript');
const openaiStt = require('../providers/openaiSttClient');
const { convertToCompressedMono, splitAudioIntoChunks } = require('../utils/audio');

const LEGACY_BY_KEY = Object.fromEntries(COLLECTIONS.map(({ key, Model }) => [key, Model]));

// video-review.html 播放的 computer{uid}.wav / microphone{uid}.wav 就放在這裡（見 server.js 的
// /setting/video-review-data 靜態掛載，同一個資料夾）。
const VIDEO_DIR = path.join(__dirname, '..', 'video');
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const TRANSCRIBE_SOURCES = [
  { source: 'computer', fileName: (uid) => `computer${uid}.wav` },
  { source: 'microphone', fileName: (uid) => `microphone${uid}.wav` }
];
// 同一個 uid+音軌正在轉錄中就先跳過，避免複盤頁被連續整理兩次時重複觸發、對同一個檔案做兩次語音辨識。
const transcribeInFlight = new Set();

// OpenAI /audio/transcriptions 單檔上限 25MB，這裡抓 24MB 當安全線。壓成 16k mono 48kbps mp3後，
// 24MB 大約對應 1 小時多語音，一般 VR session 長度都在線內；真的超過才切段(見下面 CHUNK_SEGMENT_SEC)。
const MAX_UPLOAD_BYTES = 24 * 1024 * 1024;
// 保底用：切段長度 20 分鐘，48kbps 下一段約 7.2MB，遠低於上限，超長錄音也能切成好幾段分批送。
const CHUNK_SEGMENT_SEC = 20 * 60;

async function cleanupFiles(paths) {
  await Promise.all([...new Set(paths)].map((p) => fs.unlink(p).catch(() => {})));
}

/** 把 uid 這個音軌轉成逐句存進資料庫；已經轉過的 uid+source 不會重跑，回傳目前狀態。 */
async function transcribeSourceIfNeeded(uid, source, fileName) {
  const lockKey = uid + ':' + source;

  const existing = await VideoReviewTranscriptSegment.countDocuments({ uid, source });
  if (existing > 0) {
    return { source, status: 'cached', count: existing };
  }
  if (transcribeInFlight.has(lockKey)) {
    return { source, status: 'in_progress' };
  }

  if (!openaiStt.isConfigured()) {
    return { source, status: 'error', message: '伺服器未設定 OPENAI_API_KEY，無法使用雲端語音辨識' };
  }

  const filePath = path.join(VIDEO_DIR, fileName);
  try {
    await fs.access(filePath);
  } catch {
    return { source, status: 'missing', message: '找不到音檔: ' + fileName };
  }

  transcribeInFlight.add(lockKey);
  const cleanupPaths = [];
  try {
    await fs.mkdir(TEMP_DIR, { recursive: true });
    const compressedPath = path.join(TEMP_DIR, `${source}${uid}.mp3`);
    await convertToCompressedMono(filePath, compressedPath);
    cleanupPaths.push(compressedPath);

    const stat = await fs.stat(compressedPath);
    let chunkPaths = [compressedPath];
    let chunkOffsetsSec = [0];
    if (stat.size > MAX_UPLOAD_BYTES) {
      chunkPaths = await splitAudioIntoChunks(compressedPath, TEMP_DIR, CHUNK_SEGMENT_SEC);
      cleanupPaths.push(...chunkPaths);
      chunkOffsetsSec = chunkPaths.map((_, i) => i * CHUNK_SEGMENT_SEC);
    }

    // 依序(不平行)送每個切片給 OpenAI，避免同一個 uid 短時間內灌爆 API rate limit；
    // 反正這支請求本來就是背景跑，慢一點沒差。
    const allSegments = [];
    let language;
    for (let i = 0; i < chunkPaths.length; i++) {
      const buf = await fs.readFile(chunkPaths[i]);
      const result = await openaiStt.transcribeSegmentsBuffer(buf, path.basename(chunkPaths[i]));
      language = language || result.language;
      const offset = chunkOffsetsSec[i];
      for (const seg of result.segments || []) {
        allSegments.push({ ...seg, start: seg.start + offset, end: seg.end + offset });
      }
    }

    const docs = allSegments
      .map((seg, i) => ({
        uid,
        source,
        fileName, // 這句是從哪個檔案辨識出來的，例如 computer43.wav / microphone43.wav
        seq: i,
        text: String(seg.text || '').trim(),
        startSec: Number(seg.start) || 0,
        endSec: Number(seg.end) || 0,
        language,
        noSpeechProb: seg.noSpeechProb,
        avgLogprob: seg.avgLogprob
      }))
      .filter((d) => d.text);

    if (docs.length > 0) {
      // 唯一索引在 uid+source+seq 上；ordered:false 讓極少數的重複衝突(例如剛好兩邊同時觸發)
      // 只擋掉重複的那幾筆，不影響其他已成功寫入的筆數。
      await VideoReviewTranscriptSegment.insertMany(docs, { ordered: false }).catch((err) => {
        if (err && err.code !== 11000) throw err;
      });
    }
    return { source, status: 'done', count: docs.length, chunks: chunkPaths.length };
  } finally {
    transcribeInFlight.delete(lockKey);
    await cleanupFiles(cleanupPaths);
  }
}

/** 依 collection 讀取 VR 舊版文件（路徑白名單，防任意查表） */
router.get('/legacy-records', async (req, res, next) => {
  try {
    const key = String(req.query.collection || '');
    const Model = LEGACY_BY_KEY[key];
    if (!Model) {
      return res.status(400).json({ success: false, message: '不支援的 collection' });
    }
    const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
    const uid = (req.query.uid || '').trim();
    const q = {};
    if (uid) q.uid = uid;
    const data = await Model.find(q).sort({ _id: -1 }).limit(limit).lean();
    res.json({ success: true, data, collection: key });
  } catch (e) {
    next(e);
  }
});

/** 開發用：查各 legacy collection 筆數與最近幾筆 */
router.get('/summary', async (req, res, next) => {
  try {
    const byCollection = {};
    for (const { key, Model } of COLLECTIONS) {
      byCollection[key] = await Model.countDocuments();
    }

    const recentChunks = await Promise.all(
      COLLECTIONS.map(({ key, Model }) =>
        Model.find()
          .sort({ _id: -1 })
          .limit(5)
          .select('_id uid mission_id event_id createdAt test_marker')
          .lean()
          .then((docs) =>
            docs.map((d) => ({
              collection: key,
              _id: d._id,
              uid: d.uid,
              mission_id: d.mission_id,
              event_id: d.event_id,
              createdAt: d.createdAt,
              test_marker: d.test_marker
            }))
          )
      )
    );
    const recent = recentChunks
      .flat()
      .sort((a, b) => {
        const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        if (tb !== ta) return tb - ta;
        return String(b._id).localeCompare(String(a._id));
      })
      .slice(0, 15);

    res.json({ success: true, byCollection, recent });
  } catch (e) {
    next(e);
  }
});

/**
 * 影片複盤頁（public/custom/video-review.html）用的時間軸資料。
 * judge 欄位（Unity Up_Event_Looking 寫入，UpDataToNode.cs 的 UpData_List[29]）本身
 * 就是可讀的中文語意標籤（例如「推論-結束」「整體認知負荷-開始」），直接拿來當標籤內容，
 * 不比照舊版 Strapi controller 那套針對固定劇本命名寫死的 tag 規則。
 */
router.get('/review-timeline/:uid', async (req, res, next) => {
  try {
    const uid = String(req.params.uid || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, message: '缺少 uid' });
    }
    const rows = await EventLookingData.find({ uid })
      .sort({ mission_time_sec: 1 })
      .lean();
    const labels = rows
      .filter((r) => r.judge && String(r.judge).trim())
      .map((r) => ({
        content: String(r.judge).trim(),
        mission_time_sec: Number(r.mission_time_sec) || 0
      }));
    // 「學生N開始」到下一位「學生N開始」之間都沒有「覺察正確」= 這位學生被漏掉了，
    // 在下一位學生開始前補一個「未覺察」標籤（Unity 端不另外送）。
    const isStudentStart = (c) => /^學生\d+開始/.test(c);
    const missed = [];
    labels.forEach((l, i) => {
      if (!isStudentStart(l.content)) return;
      const next = labels.findIndex((n, j) => j > i && isStudentStart(n.content));
      if (next < 0) return;
      const between = labels.slice(i + 1, next);
      if (!between.some((b) => b.content === '覺察正確')) {
        missed.push({
          content: '未覺察',
          mission_time_sec: Math.max(l.mission_time_sec, labels[next].mission_time_sec - 0.5)
        });
      }
    });
    const events = labels
      .concat(missed)
      .sort((a, b) => a.mission_time_sec - b.mission_time_sec)
      .map((l, i) => ({ id: i + 1, ...l }));
    res.json({ success: true, data: events });
  } catch (e) {
    next(e);
  }
});

/**
 * 影片複盤頁一開啟就觸發：把這個 uid 的 computer{uid}.wav（電腦/AI 聲音）跟 microphone{uid}.wav
 * （受試者麥克風）各自做一次語音辨識（雲端 OpenAI whisper-1，見 providers/openaiSttClient.js；
 * 要準確度優先，原始 wav 太大就先壓成 16k mono mp3、必要時再切段，繞過 API 25MB 單檔上限），
 * 逐句(含起訖秒數)存進 VideoReviewTranscriptSegment。已經轉錄過的 uid+音軌不會重跑，直接回傳 cached。
 * 音檔可能長達數十分鐘，這支請求會等到轉錄完才回應；前端(video-review.html)是 fire-and-forget呼叫，
 * 不等回應也不影響播放，所以慢沒關係。
 */
router.post('/review-transcript/:uid', async (req, res, next) => {
  try {
    const uid = String(req.params.uid || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, message: '缺少 uid' });
    }
    const results = await Promise.all(
      TRANSCRIBE_SOURCES.map(({ source, fileName }) =>
        transcribeSourceIfNeeded(uid, source, fileName(uid)).catch((err) => ({
          source,
          status: 'error',
          message: err.message || String(err)
        }))
      )
    );
    res.json({ success: true, uid, results });
  } catch (e) {
    next(e);
  }
});

/**
 * 查詢某 uid 已經轉錄好的逐句結果（給複盤頁之後要顯示字幕/逐字稿用）。
 * 依 startSec 排序（不分 computer/microphone），這樣電腦(AI/老師)跟麥克風(受試者)兩軌交錯
 * 讀出來就是一來一往的對話順序，不是各音軌各自成一段。
 */
router.get('/review-transcript/:uid', async (req, res, next) => {
  try {
    const uid = String(req.params.uid || '').trim();
    if (!uid) {
      return res.status(400).json({ success: false, message: '缺少 uid' });
    }
    const rows = await VideoReviewTranscriptSegment.find({ uid })
      .sort({ startSec: 1, seq: 1 })
      .lean();
    res.json({ success: true, data: rows });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
