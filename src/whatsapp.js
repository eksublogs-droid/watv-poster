const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const path = require('path');
const fs = require('fs');

const AUTH_FOLDER = path.join(__dirname, '../auth_info');
let sock = null;
let connectionStatus = 'disconnected';
let currentPairingCode = null;
let io = null;

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
  if (!fs.existsSync(AUTH_FOLDER)) fs.mkdirSync(AUTH_FOLDER, { recursive: true });

  const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
  const { version } = await fetchLatestBaileysVersion();

  const logger = pino({ level: 'silent' });

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    browser: Browsers.baileys('Desktop'),
    generateHighQualityLinkPreview: false,
    syncFullHistory: false
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
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

      if (reason === DisconnectReason.loggedOut) {
        clearAuth();
        emitStatus('logged_out');
      } else {
        emitStatus('disconnected');
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

  if (phoneNumber && !state.creds.registered) {
    emitStatus('connecting');
    await new Promise(r => setTimeout(r, 3000));
    try {
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
