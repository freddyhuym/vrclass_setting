const express = require('express');
const router = express.Router();
const {
  EventLookingData,
  LookingData,
  EventData,
  AnimeData,
  LookingRangeData
} = require('../models/vrLegacyData');

/** 設 VR_LOG=1 時在終端機印出每次寫入（筆數多時會洗版，僅建議除錯用） */
function logVrIn(req) {
  if (process.env.VR_LOG !== '1') return;
  const b = req.body || {};
  console.log('[VR 寫入]', req.path, {
    uid: b.uid,
    mission_id: b.mission_id,
    event_id: b.event_id
  });
}

function pickApiKey(body) {
  return body && (body.apikey || body.APIKEY || body.apiKey);
}

/** 若設定 VR_API_KEY 則驗證；未設定則不擋（本機開發） */
function optionalApiKey(req, res, next) {
  const expected = process.env.VR_API_KEY;
  if (!expected || String(expected).trim() === '') return next();
  const got = pickApiKey(req.body);
  if (got !== expected) {
    return res.status(403).json({ error: 'apikey rejected' });
  }
  next();
}

/** 寫入 DB 前複製 body；不存 apikey（舊 Keystone 文件通常不含此欄） */
function bodyDoc(body) {
  const o = Object.assign({}, body);
  delete o.apikey;
  delete o.APIKEY;
  delete o.apiKey;
  return o;
}

// ---------- 上傳（與 Unity UpDataToNode / 場景路徑一致）----------

router.post('/Updatas_Event_Looking', optionalApiKey, async (req, res, next) => {
  try {
    await EventLookingData.create(bodyDoc(req.body));
    logVrIn(req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/Updatas_Looking', optionalApiKey, async (req, res, next) => {
  try {
    await LookingData.create(bodyDoc(req.body));
    logVrIn(req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/Updatas_Event', optionalApiKey, async (req, res, next) => {
  try {
    await EventData.create(bodyDoc(req.body));
    logVrIn(req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/Updatas_Anime', optionalApiKey, async (req, res, next) => {
  try {
    await AnimeData.create(bodyDoc(req.body));
    logVrIn(req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

router.post('/Updatas_LookingRange', optionalApiKey, async (req, res, next) => {
  try {
    await LookingRangeData.create(bodyDoc(req.body));
    logVrIn(req);
    res.json({ success: true });
  } catch (e) { next(e); }
});

// ---------- 下載（Unity PointDownload_Web 用 POST + 期望 JSON message[]）----------

function toLookingMessage(rows) {
  return rows.map((r) => ({
    _id: String(r._id),
    mission_time: r.mission_time != null ? String(r.mission_time) : '',
    z: r.z != null ? String(r.z) : '',
    y: r.y != null ? String(r.y) : '',
    x: r.x != null ? String(r.x) : '',
    point: r.point != null ? String(r.point) : '',
    event_id: r.event_id != null ? String(r.event_id) : '',
    mission_id: r.mission_id != null ? String(r.mission_id) : '',
    uid: r.uid != null ? String(r.uid) : '',
    __v: r.__v != null ? String(r.__v) : '0'
  }));
}

function filterBySession(q, uid, mission_id, event_id) {
  if (uid) q.uid = uid;
  if (mission_id) q.mission_id = mission_id;
  if (event_id) q.event_id = event_id;
}

router.post('/Get_LookingRangeData', optionalApiKey, async (req, res, next) => {
  try {
    const { uid, mission_id, event_id } = req.body;
    const q = {};
    filterBySession(q, uid, mission_id, event_id);
    const rows = await LookingRangeData.find(q).sort({ _id: 1 }).lean();
    res.json({ message: toLookingMessage(rows) });
  } catch (e) { next(e); }
});

function toPointMessage(rows) {
  return rows.map((r) => ({
    _id: String(r._id),
    mission_time: r.mission_time != null ? String(r.mission_time) : '',
    uid: r.uid != null ? String(r.uid) : '',
    track: r.track != null ? String(r.track) : '',
    mission_id: r.mission_id != null ? String(r.mission_id) : '',
    event_id: r.event_id != null ? String(r.event_id) : '',
    point_x: r.point_x != null ? String(r.point_x) : '',
    point_y: r.point_y != null ? String(r.point_y) : '',
    point_z: r.point_z != null ? String(r.point_z) : '',
    point: r.point != null ? String(r.point) : '',
    seat_number: r.seat_number != null ? String(r.seat_number) : '',
    trigger: r.trigger != null ? String(r.trigger) : '',
    function_name: r.function_name != null ? String(r.function_name) : ''
  }));
}

router.post('/Get_EventLookingData_partial', optionalApiKey, async (req, res, next) => {
  try {
    const { uid, mission_id, event_id } = req.body;
    const q = {};
    filterBySession(q, uid, mission_id, event_id);
    const rows = await EventLookingData.find(q).sort({ _id: 1 }).lean();
    const withPoint = rows.filter((r) => r.point_x || r.point_y || r.point_z);
    res.json({ message: toPointMessage(withPoint.length ? withPoint : rows) });
  } catch (e) { next(e); }
});

function toAnimeMessage(rows) {
  return rows.map((r) => ({
    id: String(r._id),
    uid: r.uid != null ? String(r.uid) : '',
    mission_id: r.mission_id != null ? String(r.mission_id) : '',
    event_id: r.event_id != null ? String(r.event_id) : '',
    seat_number: r.seat_number != null ? String(r.seat_number) : '',
    anime_tag: r.anime_tag != null ? String(r.anime_tag) : '',
    time_scale: r.time_scale != null ? String(r.time_scale) : '',
    mission_time: r.mission_time != null ? String(r.mission_time) : '',
    mission_time_sec: r.mission_time_sec != null ? String(r.mission_time_sec) : '',
    function_name: r.function_name != null ? String(r.function_name) : ''
  }));
}

router.post('/Get_AnimeData', optionalApiKey, async (req, res, next) => {
  try {
    const { uid, mission_id, event_id } = req.body;
    const q = {};
    filterBySession(q, uid, mission_id, event_id);
    const rows = await AnimeData.find(q).sort({ _id: 1 }).lean();
    res.json({ message: toAnimeMessage(rows) });
  } catch (e) { next(e); }
});

module.exports = router;
