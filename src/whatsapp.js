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
    browser: Browsers.macOS('Desktop'),
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
    connectTimeoutMs: 60000,
    defaultQueryTimeoutMs: undefined
  });

  sock.ev.on('creds.update', saveCreds);

  // Request pairing code immediately after socket creation (official Baileys pattern)
  if (phoneNumber && !state.creds.registered) {
    const cleanNumber = phoneNumber.replace(/[^0-9]/g, '');
    emitStatus('connecting');
    try {
      const code = await sock.requestPairingCode(cleanNumber);
      console.log('📱 Pairing code generated:', code);
      emitStatus('pairing_code', { code });
    } catch (err) {
      console.error('Pairing code error:', err.message);
      emitStatus('error', { message: 'Failed to generate pairing code. Try again.' });
    }
  }

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'open') {
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
      await sock.sendMessage('status@broadcast', { text: caption });
    } else if (mediaType === 'image') {
      const imageBuffer = fs.readFileSync(mediaPath);
      await sock.sendMessage('status@broadcast', { image: imageBuffer, caption });
    } else if (mediaType === 'video') {
      const videoBuffer = fs.readFileSync(mediaPath);
      await sock.sendMessage('status@broadcast', { video: videoBuffer, caption });
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
