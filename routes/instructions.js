const express = require('express');
const router = express.Router();
const Instruction = require('../models/Instruction');

// 取得全部或依 key/name 關鍵字查詢
router.get('/', async (req, res, next) => {
  try {
    const { q } = req.query;
    const filter = q
      ? { $or: [{ name: new RegExp(q, 'i') }, { key: new RegExp(q, 'i') }] }
      : {};
    const list = await Instruction.find(filter).sort({ updatedAt: -1 }).lean();
    res.json({ success: true, data: list });
  } catch (e) {
    next(e);
  }
});

// 新增指導語
router.post('/', async (req, res, next) => {
  try {
    const { name, key, html, description } = req.body;
    if (!name || !html) {
      return res.status(400).json({ success: false, message: '需要 name 與 html' });
    }
    const doc = await Instruction.create({ name, key, html, description });
    res.status(201).json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
});

// 取得單一指導語（by id）
router.get('/:id', async (req, res, next) => {
  try {
    const doc = await Instruction.findById(req.params.id).lean();
    if (!doc) return res.status(404).json({ success: false, message: '找不到指導語' });
    res.json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
});

// 依 key 取得指導語（實驗頁可以用這個）
router.get('/by-key/:key', async (req, res, next) => {
  try {
    const doc = await Instruction.findOne({ key: req.params.key }).lean();
    if (!doc) return res.status(404).json({ success: false, message: '找不到對應 key 的指導語' });
    res.json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
});

// 更新指導語
router.put('/:id', async (req, res, next) => {
  try {
    const { name, key, html, description } = req.body;
    const doc = await Instruction.findByIdAndUpdate(
      req.params.id,
      { $set: { name, key, html, description, updatedAt: new Date() } },
      { new: true }
    );
    if (!doc) return res.status(404).json({ success: false, message: '找不到指導語' });
    res.json({ success: true, data: doc });
  } catch (e) {
    next(e);
  }
});

// 刪除指導語
router.delete('/:id', async (req, res, next) => {
  try {
    const doc = await Instruction.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: '找不到指導語' });
    res.json({ success: true });
  } catch (e) {
    next(e);
  }
});

module.exports = router;

