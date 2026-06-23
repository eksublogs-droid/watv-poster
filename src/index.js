require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const path = require('path');

const routes = require('./routes');
const { connectWhatsApp, setIO, getStatus } = require('./whatsapp');
const { startScheduler } = require('./scheduler');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, '../public')));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// API routes
app.use('/api', routes);

// Socket.IO — real-time WhatsApp status updates to browser
io.on('connection', (socket) => {
  console.log('🖥️ Dashboard connected');
  // Send current status immediately on connect
  socket.emit('wa_status', { status: getStatus() });
});

// Pass socket.io to whatsapp module
setIO(io);

// Connect to MongoDB
async function start() {
  try {
    if (!MONGODB_URI) throw new Error('MONGODB_URI not set in .env');

    await mongoose.connect(MONGODB_URI);
    console.log('✅ MongoDB connected');

    // Start scheduler
    startScheduler();

    // Try to reconnect WhatsApp if session exists
    connectWhatsApp();

    server.listen(PORT, () => {
      console.log(`🚀 WA TV Poster running at http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error('❌ Startup error:', err.message);
    process.exit(1);
  }
}

start();
