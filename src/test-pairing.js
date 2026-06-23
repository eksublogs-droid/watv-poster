// Minimal standalone Baileys pairing test.
// This does NOT touch your main app, database, or dashboard.
// It only tests: can Baileys, by itself, complete a phone-number pairing
// on this server right now?

const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  DisconnectReason
} = require('@whiskeysockets/baileys');
const pino = require('pino');

// 👇 PUT YOUR PHONE NUMBER HERE (digits only, with country code, no + or spaces)
const PHONE_NUMBER = '2347043701799';

async function test() {
  console.log('=== Baileys isolated pairing test starting ===');

  const { state, saveCreds } = await useMultiFileAuthState('./test_auth');
  const { version } = await fetchLatestBaileysVersion();
  console.log('Using WA version:', version);

  const logger = pino({ level: 'debug' }); // verbose on purpose for this test

  const sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    logger,
    printQRInTerminal: false,
    browser: Browsers.macOS('Google Chrome'),
    keepAliveIntervalMs: 10000
  });

  sock.ev.on('creds.update', saveCreds);

  let codeRequested = false;

  sock.ev.on('connection.update', async (update) => {
    console.log('--- connection.update ---', JSON.stringify(update));

    if (update.connection === 'connecting' && !state.creds.registered && !codeRequested) {
      codeRequested = true;
      await new Promise((r) => setTimeout(r, 1500));
      try {
        const code = await sock.requestPairingCode(PHONE_NUMBER);
        console.log('================================');
        console.log('PAIRING CODE:', code);
        console.log('================================');
      } catch (err) {
        console.error('PAIRING CODE REQUEST FAILED:', err);
      }
    }

    if (update.connection === 'open') {
      console.log('✅✅✅ SUCCESS: Connection fully opened and registered! ✅✅✅');
    }

    if (update.connection === 'close') {
      console.log('Connection closed. Full error object:');
      console.log(JSON.stringify(update.lastDisconnect?.error, null, 2));
    }
  });
}

test().catch((err) => {
  console.error('FATAL TEST ERROR:', err);
});
