const mongoose = require('mongoose');

// Saved Captions
const captionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  label: { type: String, required: true }, // short name e.g. "Ad promo"
  createdAt: { type: Date, default: Date.now }
});

// Status History
const statusHistorySchema = new mongoose.Schema({
  caption: { type: String, default: '' },
  mediaType: { type: String, enum: ['image', 'video', 'text'], default: 'text' },
  mediaPath: { type: String, default: null },
  postedAt: { type: Date, default: Date.now },
  status: { type: String, enum: ['success', 'failed'], default: 'success' },
  error: { type: String, default: null }
});

// Scheduled Posts
const scheduledSchema = new mongoose.Schema({
  caption: { type: String, default: '' },
  mediaType: { type: String, enum: ['image', 'video', 'text'], default: 'text' },
  mediaPath: { type: String, default: null },
  scheduledFor: { type: Date, required: true },
  status: { type: String, enum: ['pending', 'posted', 'failed'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
});

module.exports = {
  Caption: mongoose.model('Caption', captionSchema),
  StatusHistory: mongoose.model('StatusHistory', statusHistorySchema),
  Scheduled: mongoose.model('Scheduled', scheduledSchema)
};
