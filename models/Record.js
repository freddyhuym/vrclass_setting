const mongoose = require('mongoose');

const baseRecordSchema = {
  userId: { type: String, required: true, index: true },
  sessionId: { type: String, index: true },
  experimentCode: { type: String, index: true }, // 研究/實驗編號
  levelName: { type: String, index: true }, // 關卡名稱（VRCLASS 選完關卡後帶入）
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

const webEventLogSchema = new mongoose.Schema({
  ...baseRecordSchema,
  type: { type: String, default: 'web_event' },
  pageName: { type: String, index: true },
  pagePath: String,
  stepKey: String,
  contentType: String, // survey / instruction / custom / gptfeedback
  contentName: String, // 量表名稱或指導語名稱（中文）
  surveyId: String,
  surveyName: String,
  surveyPageNo: Number,
  surveyPageTitle: String,
  questionName: String,
  questionTitle: String,
  eventName: { type: String, required: true }, // click / input / change / page_view / submit
  targetType: String,
  targetText: String,
  beforeValue: mongoose.Schema.Types.Mixed,
  afterValue: mongoose.Schema.Types.Mixed,
  valueType: String,
  actionIndex: Number,
  clientTs: Date,
  extra: mongoose.Schema.Types.Mixed
}, { timestamps: true });

const surveyFinalAnswerSchema = new mongoose.Schema({
  ...baseRecordSchema,
  type: { type: String, default: 'survey_final_answer' },
  pageName: { type: String, index: true },
  pagePath: String,
  stepKey: String,
  surveyId: String,
  surveyName: String,
  submittedAt: { type: Date, default: Date.now },
  answers: [{
    pageNo: Number,
    pageTitle: String,
    questionName: String,
    questionTitle: String,
    questionType: String,
    required: Boolean,
    answer: mongoose.Schema.Types.Mixed
  }],
  answerCount: Number,
  extra: mongoose.Schema.Types.Mixed
}, { timestamps: true });

// VR語音對話紀錄：語音辨識文字、openSMILE聲音喚醒度、Azure文字情緒、GPT回覆文字
const vrConversationSchema = new mongoose.Schema({
  ...baseRecordSchema,
  type: { type: String, default: 'vr_conversation' },
  studentName: String,
  sttText: String,
  voiceArousal: Number,
  textSentiment: String,
  gptResponseText: String
}, { timestamps: true });

emotionFeedbackSchema.index({ userId: 1, timestamp: 1 });
scaleResponseSchema.index({ userId: 1, scaleId: 1, timestamp: 1 });
decisionRecordSchema.index({ userId: 1, timestamp: 1 });
physiologicalSchema.index({ userId: 1, timestamp: 1 });
processLogSchema.index({ userId: 1, timestamp: 1 });
webEventLogSchema.index({ userId: 1, sessionId: 1, timestamp: -1 });
webEventLogSchema.index({ userId: 1, surveyId: 1, questionName: 1, timestamp: -1 });
surveyFinalAnswerSchema.index({ userId: 1, sessionId: 1, submittedAt: -1 });
vrConversationSchema.index({ userId: 1, timestamp: -1 });

module.exports = {
  EmotionFeedback: mongoose.model('EmotionFeedback', emotionFeedbackSchema),
  ScaleResponse: mongoose.model('ScaleResponse', scaleResponseSchema),
  DecisionRecord: mongoose.model('DecisionRecord', decisionRecordSchema),
  Physiological: mongoose.model('Physiological', physiologicalSchema),
  ProcessLog: mongoose.model('ProcessLog', processLogSchema),
  WebEventLog: mongoose.model('WebEventLog', webEventLogSchema),
  SurveyFinalAnswer: mongoose.model('SurveyFinalAnswer', surveyFinalAnswerSchema),
  VrConversation: mongoose.model('VrConversation', vrConversationSchema)
};
