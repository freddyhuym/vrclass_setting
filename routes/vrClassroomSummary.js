const express = require('express');
const router = express.Router();
const { COLLECTIONS, EventLookingData } = require('../models/vrLegacyData');

const LEGACY_BY_KEY = Object.fromEntries(COLLECTIONS.map(({ key, Model }) => [key, Model]));

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
    const events = rows
      .filter((r) => r.judge && String(r.judge).trim())
      .map((r, i) => ({
        id: i + 1,
        content: String(r.judge).trim(),
        mission_time_sec: Number(r.mission_time_sec) || 0
      }));
    res.json({ success: true, data: events });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
