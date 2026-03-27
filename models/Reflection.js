const mongoose = require('mongoose');

const reflectionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sessionId: String,
  timestamp: { type: Date, default: Date.now },
  type: { type: String, default: 'emotion_awareness' },
  content: String,
  prompts: [String],
  responses: mongoose.Schema.Types.Mixed,
  sentimentScore: Number,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('Reflection', reflectionSchema);
