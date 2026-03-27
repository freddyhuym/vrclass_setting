const mongoose = require('mongoose');

const emotionAnnotationSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  sessionId: String,
  timestamp: { type: Date, default: Date.now },
  target: { type: String, enum: ['self', 'situation', 'other'], default: 'self' },
  emotionLabel: String,
  intensity: Number,
  note: String,
  metadata: mongoose.Schema.Types.Mixed
}, { timestamps: true });

module.exports = mongoose.model('EmotionAnnotation', emotionAnnotationSchema);
