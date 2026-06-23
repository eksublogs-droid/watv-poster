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

// Remember the phone number across reconnects, so pairing can re-trigger
let savedPhoneNumber = null;

// Reconnect control — prevents infinite instant retry loops
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY_MS = 5000; // 5s, doubles each attempt
let reconnectTimer = null;

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

function scheduleReconnect() {
  if (reconnectTimer) return; // already scheduled, don't stack timers

  reconnectAttempts += 1;

  if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
    console.log('🛑 Max reconnect attempts reached. Stopping auto-reconnect.');
    emitStatus('error', {
      message: 'Could not reconnect after several attempts. Please try connecting again manually.'
    });
    reconnectAttempts = 0;
    return;
  }

  // Exponential backoff: 5s, 10s, 20s, 40s, 80s
  const delay = BASE_RECONNECT_DELAY_MS * Math.pow(2, reconnectAttempts - 1);
  console.log(`🔄 Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectWhatsApp(savedPhoneNumber);
  }, delay);
}

async function connectWhatsApp(phoneNumber = null) {
  // Keep using the last known phone number if a reconnect doesn't pass one
  if (phoneNumber) {
    savedPhoneNumber = phoneNumber;
  }

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

  // Track whether we've already requested a pairing code for this socket,
  // so we don't fire it more than once per connection attempt.
  let pairingRequested = false;

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect } = update;

    if (connection === 'connecting') {
      emitStatus('connecting');

      // IMPORTANT: only request the pairing code once the socket has
      // actually reached the 'connecting' state (WebSocket handshake
      // underway). Requesting it immediately after makeWASocket() races
      // the handshake and causes "Connection Closed" (428) errors.
      if (savedPhoneNumber && !state.creds.registered && !pairingRequested) {
        pairingRequested = true;
        const cleanNumber = savedPhoneNumber.replace(/[^0-9]/g, '');

        // Small delay to let the handshake settle before requesting the code
        await new Promise((resolve) => setTimeout(resolve, 1500));

        try {
          const code = await sock.requestPairingCode(cleanNumber);
          console.log('📱 Pairing code generated:', code);
          emitStatus('pairing_code', { code });
        } catch (err) {
          console.error('Pairing code error:', err.message);
          emitStatus('error', { message: 'Failed to generate pairing code. Try again.' });
        }
      }
    }

    if (connection === 'open') {
      emitStatus('connected');
      console.log('✅ WhatsApp connected successfully');
      // Successful connection — reset reconnect counter
      reconnectAttempts = 0;
    }

    if (connection === 'close') {
      const reason = lastDisconnect?.error?.output?.statusCode;
      console.log('❌ Connection closed. Reason:', reason);

      if (reason === DisconnectReason.loggedOut) {
        clearAuth();
        emitStatus('logged_out');
        reconnectAttempts = 0;
        // Don't auto-reconnect after an explicit logout — needs fresh pairing
      } else if (!state.creds.registered) {
        // We were still in the middle of pairing (never successfully linked).
        // Do NOT auto-retry here — repeatedly hammering WhatsApp's pairing
        // endpoint with new codes makes things worse and can trigger rate
        // limiting on the phone number. Stop and let the user manually
        // request a new code when ready.
        console.log('🛑 Connection closed during pairing. Not auto-retrying — request a new code manually when ready.');
        clearAuth();
        emitStatus('error', {
          message: 'Pairing failed. Wait a moment, then request a new code.'
        });
        reconnectAttempts = 0;
        savedPhoneNumber = null;
      } else {
        // We had a previously working session — safe to auto-reconnect.
        emitStatus('disconnected');
        scheduleReconnect();
      }
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
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempts = 0;
  savedPhoneNumber = null;

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
