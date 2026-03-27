const mongoose = require('mongoose');

const experimentStepSchema = new mongoose.Schema({
  // 此步驟在流程中的唯一 key（也是 URL 片段 /experiment/:key）
  key: { type: String, required: true, index: true, unique: true },
  // 顯示名稱（給研究者看的中文名稱）
  name: { type: String, required: true },
  // 步驟類型：survey 問卷、instruction 指導語、custom 自訂 HTML
  type: { type: String, enum: ['survey', 'instruction', 'custom'], required: true },
  // 依類型不同，對應的 key 或路徑：
  // - survey: 對應某個量表或情境的 key
  // - instruction: 指導語 Instruction.key
  // - custom: 自訂 HTML 路徑（例如 /custom/intro.html）
  refKey: { type: String },
  customPath: { type: String },
  // 所屬流程 key，預設 'default'，之後可擴充多個流程
  flowKey: { type: String, default: 'default', index: true },
  // 排序用 index，數字越小越前面
  order: { type: Number, default: 0 },
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ExperimentStep', experimentStepSchema);

