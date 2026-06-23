const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const AUTH_FOLDER = path.join(__dirname, '../auth_info');
let sock = null;
let connectionStatus = 'disconnected'; // disconnected | connecting | connected
let currentPairingCode = null;
let io = null; // socket.io instance, set externally

function setIO(socketIO) {
  io = socketIO;
}

function getStatus() {
  return connectionStatus;
}

function getSock() {
  return sock;
}

function emitStatus(status, extra = {}) {
  connectionStatus = status;
  if (io) io.emit('wa_status', { status, ...extra });
}

async function connectWhatsApp(phoneNumber = null) {
  // Ensure auth folder exists
  if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  sock = makeWASocket({
    version,
    auth: state,
    logger,
    printQRInTerminal: false,
    browser: ['WA TV Poster', 'Chrome', '1.0.0'],
    generateHighQualityLinkPreview: false
  });

  // Save credentials whenever they update
  sock.ev.on('creds.update', saveCreds);

  // Handle connection updates
  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      // QR fallback (shouldn't happen if pairing code is used)
      emitStatus('qr', { qr });
    }

    if (connection === 'open') {
      currentPairingCode = null;
      emitStatus('connected');
      console.log('✅ WhatsApp connected successfully');
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('❌ Connection closed. Reason:', reason);

      // If logged out, clear auth and notify
      if (reason === DisconnectReason.loggedOut) {
        clearAuth();
        emitStatus('logged_out');
      } else {
        emitStatus('disconnected');
        // Auto-reconnect after 5s (not if logged out)
        setTimeout(() => {
          console.log('🔄 Reconnecting...');
          connectWhatsApp();
        }, 5000);
      }
    }

    if (connection === 'connecting') {
      emitStatus('connecting');
    }
  });

  // Request pairing code if phone number provided and not registered
  if (phoneNumber && !state.creds.registered) {
    emitStatus('connecting');
    // Small delay to let socket initialize
    await new Promise(r => setTimeout(r, 2000));
    try {
      // Format: remove +, spaces, dashes
      const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
      const code = await sock.requestPairingCode(cleanNumber);
      currentPairingCode = code;
      console.log('📱 Pairing code generated:', code);
      emitStatus('pairing_code', { code });
      return code;
    } catch (err) {
      console.error('Pairing code error:', err.message);
      emitStatus('error', { message: 'Failed to generate pairing code. Try again.' });
      return null;
    }
  }

  return null;
}

function clearAuth() {
  if (fs.existsSync(AUTH_FOLDER)) {
    fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
    console.log('🗑️ Auth cleared');
  }
  sock = null;
}

async function postStatus(mediaPath, caption, mediaType) {
  if (!sock || connectionStatus !== 'connected') {
    throw new Error('WhatsApp is not connected');
  }

  try {
    if (mediaType === 'text') {
      // Text-only status
      await sock.sendMessage('status@broadcast', {
        text: caption
      });
    } else if (mediaType === 'image') {
      const imageBuffer = require('fs').readFileSync(mediaPath);
      await sock.sendMessage('status@broadcast', {
        image: imageBuffer,
        caption: caption
      });
    } else if (mediaType === 'video') {
      const videoBuffer = require('fs').readFileSync(mediaPath);
      await sock.sendMessage('status@broadcast', {
        video: videoBuffer,
        caption: caption
      });
    }

    console.log('✅ Status posted successfully');
    return true;
  } catch (err) {
    console.error('❌ Post status error:', err.message);
    throw err;
  }
}

function disconnect() {
  if (sock) {
    sock.logout();
    clearAuth();
    emitStatus('disconnected');
  }
}

module.exports = {
  connectWhatsApp,
  postStatus,
  getStatus,
  getSock,
  setIO,
  clearAuth,
  disconnect
};
