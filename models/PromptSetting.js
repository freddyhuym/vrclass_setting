const mongoose = require('mongoose');

const promptSettingSchema = new mongoose.Schema({
  name: { type: String, required: true },
  scenario: String,
  description: String,
  roleParameters: {
    personalityTraits: [String],
    interactionStyle: String,
    emotionalResponseRules: mongoose.Schema.Types.Mixed,
    disturbanceBehaviors: mongoose.Schema.Types.Mixed,
    other: mongoose.Schema.Types.Mixed
  },
  promptText: String,
  active: { type: Boolean, default: true },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PromptSetting', promptSettingSchema);
