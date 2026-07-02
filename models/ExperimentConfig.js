const mongoose = require('mongoose');

const experimentConfigSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true, default: 'default' },
  experimentCode: { type: String, default: 'study-001' }, // 例如: study-001 / exp-a1
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: true });

module.exports = mongoose.model('ExperimentConfig', experimentConfigSchema);
