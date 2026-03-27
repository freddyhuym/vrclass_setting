const mongoose = require('mongoose');

const scaleItemSchema = new mongoose.Schema({
  question: { type: String, required: true },
  type: { type: String, enum: ['single', 'multiple', 'likert', 'text'], default: 'single' },
  options: [String],
  required: { type: Boolean, default: true },
  order: Number
}, { _id: true });

const scaleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  category: String,
  // SurveyJS Creator 會以 JSON 格式儲存量表定義
  surveyJson: mongoose.Schema.Types.Mixed,
  items: [scaleItemSchema],
  version: { type: Number, default: 1 },
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('Scale', scaleSchema);
