const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const { Caption, StatusHistory, Scheduled } = require('./models');
const { connectWhatsApp, postStatus, getStatus, disconnect } = require('./whatsapp');

// Uploads folder
const UPLOADS_DIR = path.join(__dirname, '../uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 30 * 1024 * 1024 }, // 30MB max
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|mp4|3gp|mov/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext || mime) cb(null, true);
    else cb(new Error('Only images and videos are allowed'));
  }
});

// ─── CONNECTION ─────────────────────────────────────────────────────────────

// Get current connection status
router.get('/status', (req, res) => {
  res.json({ status: getStatus() });
});

// Request pairing code with phone number
router.post('/connect', async (req, res) => {
  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Phone number required' });

  try {
    const code = await connectWhatsApp(phone);
    if (code) {
      res.json({ success: true, code });
    } else {
      res.json({ success: true, message: 'Connecting...' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Disconnect and clear session
router.post('/disconnect', (req, res) => {
  try {
    disconnect();
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── POST STATUS ─────────────────────────────────────────────────────────────

// Post status now
router.post('/post-now', upload.single('media'), async (req, res) => {
  const { caption } = req.body;
  const file = req.file;

  let mediaType = 'text';
  let mediaPath = null;

  if (file) {
    const ext = path.extname(file.originalname).toLowerCase();
    mediaType = ['.mp4', '.3gp', '.mov'].includes(ext) ? 'video' : 'image';
    mediaPath = file.path;
  }

  if (!caption && !file) {
    return res.status(400).json({ error: 'Caption or media is required' });
  }

  try {
    await postStatus(mediaPath, caption || '', mediaType);

    // Save to history
    await StatusHistory.create({
      caption: caption || '',
      mediaType,
      mediaPath,
      postedAt: new Date(),
      status: 'success'
    });

    res.json({ success: true, message: 'Status posted!' });
  } catch (err) {
    // Save failed attempt to history
    await StatusHistory.create({
      caption: caption || '',
      mediaType,
      mediaPath,
      postedAt: new Date(),
      status: 'failed',
      error: err.message
    });

    res.status(500).json({ error: err.message });
  }
});

// Schedule a status post
router.post('/schedule', upload.single('media'), async (req, res) => {
  const { caption, scheduledFor } = req.body;
  const file = req.file;

  if (!scheduledFor) return res.status(400).json({ error: 'Schedule time required' });

  const schedDate = new Date(scheduledFor);
  if (isNaN(schedDate.getTime()) || schedDate <= new Date()) {
    return res.status(400).json({ error: 'Schedule time must be in the future' });
  }

  let mediaType = 'text';
  let mediaPath = null;

  if (file) {
    const ext = path.extname(file.originalname).toLowerCase();
    mediaType = ['.mp4', '.3gp', '.mov'].includes(ext) ? 'video' : 'image';
    mediaPath = file.path;
  }

  try {
    const scheduled = await Scheduled.create({
      caption: caption || '',
      mediaType,
      mediaPath,
      scheduledFor: schedDate
    });

    res.json({ success: true, message: 'Post scheduled!', id: scheduled._id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Get pending scheduled posts
router.get('/scheduled', async (req, res) => {
  try {
    const posts = await Scheduled.find({ status: 'pending' }).sort({ scheduledFor: 1 });
    res.json(posts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a scheduled post
router.delete('/scheduled/:id', async (req, res) => {
  try {
    await Scheduled.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── HISTORY ────────────────────────────────────────────────────────────────

router.get('/history', async (req, res) => {
  try {
    const history = await StatusHistory.find().sort({ postedAt: -1 }).limit(10);
    res.json(history);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ─── CAPTIONS ────────────────────────────────────────────────────────────────

// Get all saved captions
router.get('/captions', async (req, res) => {
  try {
    const captions = await Caption.find().sort({ createdAt: -1 });
    res.json(captions);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Save a new caption
router.post('/captions', async (req, res) => {
  const { text, label } = req.body;
  if (!text || !label) return res.status(400).json({ error: 'Label and text required' });

  try {
    const cap = await Caption.create({ text, label });
    res.json({ success: true, caption: cap });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Delete a caption
router.delete('/captions/:id', async (req, res) => {
  try {
    await Caption.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
