const mongoose = require('mongoose');

const personalDataSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  name: String,
  email: String,
  role: { type: String, default: '師資生' },
  metadata: mongoose.Schema.Types.Mixed,
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('PersonalData', personalDataSchema);
