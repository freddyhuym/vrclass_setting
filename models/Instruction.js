const mongoose = require('mongoose');

const instructionSchema = new mongoose.Schema({
  name: { type: String, required: true }, // 顯示名稱，例如「情境A-前測指導語」
  key: { type: String, index: true },     // 程式用鍵值（可選），例如 "scenarioA_pre"
  html: { type: String, required: true }, // 已含字體大小、顏色與段行的 HTML
  description: String,
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Instruction', instructionSchema);

