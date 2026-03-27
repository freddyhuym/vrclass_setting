const mongoose = require('mongoose');

const baseRecordSchema = {
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, index: true },
  timestamp: { type: Date, default: Date.now, required: true },
  source: String,
  metadata: mongoose.Schema.Types.Mixed
};

const emotionFeedbackSchema = new mongoose.Schema({
  ...baseRecordSchema,
  type: { type: String, default: 'emotion_feedback' },
  emotionLabel: String,
  intensity: Number,
  context: String,
  value: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const scaleResponseSchema = new mongoose.Schema({
  ...baseRecordSchema,
  type: { type: String, default: 'scale_response' },
  scaleId: { type: mongoose.Schema.Types.ObjectId, ref: 'Scale', required: true },
  responses: [{ questionIndex: Number, value: mongoose.Schema.Types.Mixed }],
  completedAt: Date
}, { timestamps: true });

const decisionRecordSchema = new mongoose.Schema({
  ...baseRecordSchema,
  type: { type: String, default: 'decision' },
  decision: String,
  options: [String],
  chosenOption: String,
  reasoning: String,
  step: Number
}, { timestamps: true });

const physiologicalSchema = new mongoose.Schema({
  ...baseRecordSchema,
  type: { type: String, default: 'physiological' },
  pupilDiameter: Number,
  gsr: Number,
  heartRate: Number,
  raw: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const processLogSchema = new mongoose.Schema({
  ...baseRecordSchema,
  type: { type: String, default: 'process' },
  action: String,
  target: String,
  duration: Number,
  details: mongoose.Schema.Types.Mixed
}, { timestamps: true });

emotionFeedbackSchema.index({ userId: 1, timestamp: 1 });
scaleResponseSchema.index({ userId: 1, scaleId: 1, timestamp: 1 });
decisionRecordSchema.index({ userId: 1, timestamp: 1 });
physiologicalSchema.index({ userId: 1, timestamp: 1 });
processLogSchema.index({ userId: 1, timestamp: 1 });

module.exports = {
  EmotionFeedback: mongoose.model('EmotionFeedback', emotionFeedbackSchema),
  ScaleResponse: mongoose.model('ScaleResponse', scaleResponseSchema),
  DecisionRecord: mongoose.model('DecisionRecord', decisionRecordSchema),
  Physiological: mongoose.model('Physiological', physiologicalSchema),
  ProcessLog: mongoose.model('ProcessLog', processLogSchema)
};
