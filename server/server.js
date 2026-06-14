/**
 * MicNet Signaling + Storage Server
 * ──────────────────────────────────
 * Features:
 *   ● Password-protected WebSocket (x-auth-token header)
 *   ● Multi-device management
 *   ● Server-side audio file storage (multer)
 *   ● REST API for web dashboard
 *   ● Serves web dashboard static files
 *
 * Environment variables:
 *   PORT=3001            (default: 3001)
 *   AUTH_TOKEN=secret    (default: 'micnet-secret-change-me')
 *
 * Deploy to Railway:
 *   1. Push this folder to a GitHub repo
 *   2. New project → Deploy from GitHub → select repo
 *   3. Set AUTH_TOKEN env var in Railway dashboard
 *   4. Note the public URL (e.g. https://micnet-xxx.up.railway.app)
 */

const express  = require('express');
const http     = require('http');
const WebSocket = require('ws');
const cors     = require('cors');
const multer   = require('multer');
const path     = require('path');
const fs       = require('fs');
const { v4: uuidv4 } = require('uuid');

// ─── Config ───────────────────────────────────────────────────────────────────
const PORT             = process.env.PORT || 3001;
const MANAGER_EMAIL    = process.env.MANAGER_EMAIL || 'admin@mic.net';
const MANAGER_PASSWORD = process.env.MANAGER_PASSWORD || 'secret';
const SESSION_TOKEN    = uuidv4(); // Generate a secure token per server run
let pairingCode        = Math.floor(100000 + Math.random() * 900000).toString();
const RECORDINGS_DIR = path.join(__dirname, 'recordings');

// Ensure recordings directory exists
if (!fs.existsSync(RECORDINGS_DIR)) fs.mkdirSync(RECORDINGS_DIR, { recursive: true });

// ─── Express App ─────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());

// Serve web dashboard
app.use(express.static(path.join(__dirname, '..', 'web')));

// Serve recordings directory (for download)
app.use('/recordings', express.static(RECORDINGS_DIR));

// ─── Auth Middleware ──────────────────────────────────────────────────────────
function requireAuth(req, res, next) {
  const token = req.headers['x-auth-token'] || req.query.token;
  if (token !== SESSION_TOKEN && token !== pairingCode) {
    return res.status(401).json({ error: 'Unauthorized — invalid token' });
  }
  next();
}

// ─── Multer (file uploads) ────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const deviceId = req.body.deviceId || req.query.deviceId || 'unknown';
    const deviceDir = path.join(RECORDINGS_DIR, sanitizeDeviceId(deviceId));
    fs.mkdirSync(deviceDir, { recursive: true });
    cb(null, deviceDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.m4a';
    const name = `rec_${Date.now()}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage, limits: { fileSize: 500 * 1024 * 1024 } }); // 500MB max

function sanitizeDeviceId(id) {
  return id.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64);
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
const wss = new WebSocket.Server({ server });

/** @type {Map<string, { ws, deviceId, deviceName, isRecording, isStreaming, connectedAt, recordings[] }>} */
const mobileClients = new Map();

/** @type {Set<WebSocket>} */
const webClients = new Set();

function broadcastToWeb(msg) {
  const p = JSON.stringify(msg);
  for (const ws of webClients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(p);
  }
}

function sendToMobile(deviceId, msg) {
  const c = mobileClients.get(deviceId);
  if (c && c.ws.readyState === WebSocket.OPEN) { c.ws.send(JSON.stringify(msg)); return true; }
  return false;
}

function getDeviceList() {
  return Array.from(mobileClients.values()).map(c => ({
    deviceId:       c.deviceId,
    deviceName:     c.deviceName,
    isRecording:    c.isRecording,
    isStreaming:    c.isStreaming,
    connectedAt:    c.connectedAt,
    recordingCount: c.recordings.length,
  }));
}

function broadcastDeviceList() {
  broadcastToWeb({ type: 'device_list', devices: getDeviceList() });
}

wss.on('connection', (ws, req) => {
  let clientType = null; // 'mobile' | 'web'
  let deviceId   = null;

  // ── Auth check for WebSocket ─────────────────────────────────────────────
  const urlParams = new URL(req.url || '/', `http://localhost`);
  const token = req.headers['x-auth-token'] || urlParams.searchParams.get('token') || '';

  if (token === SESSION_TOKEN) {
    clientType = 'web';
  } else if (token === pairingCode) {
    clientType = 'mobile';
  } else {
    ws.send(JSON.stringify({ type: 'auth_error', message: 'Invalid token' }));
    ws.close(4001, 'Unauthorized');
    console.log(`[WS] Rejected unauthenticated connection from ${req.socket.remoteAddress}`);
    return;
  }

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }

    switch (msg.type) {

      // ── Mobile registers ──────────────────────────────────────────────────
      case 'device_hello': {
        // clientType is already determined, but we'll accept device_hello
        deviceId   = msg.deviceId || uuidv4();
        mobileClients.set(deviceId, {
          ws, deviceId,
          deviceName:  msg.deviceName || `Device-${deviceId.slice(0, 6)}`,
          isRecording: false,
          isStreaming:  false,
          connectedAt: new Date(),
          recordings:  [],
        });
        console.log(`[MOBILE] Connected: ${msg.deviceName} (${deviceId})`);
        broadcastDeviceList();
        break;
      }

      // ── Web dashboard registers ───────────────────────────────────────────
      case 'web_hello': {
        webClients.add(ws);
        console.log('[WEB] Dashboard connected');
        ws.send(JSON.stringify({ type: 'device_list', devices: getDeviceList() }));

        // Send existing recordings for all devices
        for (const [dId] of mobileClients) {
          const recs = listDeviceRecordings(dId);
          if (recs.length > 0) {
            ws.send(JSON.stringify({ type: 'recordings_list', deviceId: dId, recordings: recs }));
          }
        }
        break;
      }

      // ── Audio PCM chunk → relay to web ───────────────────────────────────
      case 'audio_chunk': {
        if (clientType !== 'mobile') break;
        broadcastToWeb({ type: 'audio_chunk', deviceId: msg.deviceId, chunk: msg.chunk, sampleRate: msg.sampleRate || 16000, channels: msg.channels || 1, timestamp: msg.timestamp });
        break;
      }

      // ── Status updates from mobile ────────────────────────────────────────
      case 'stream_started': {
        const c = mobileClients.get(deviceId);
        if (c) c.isStreaming = true;
        broadcastToWeb({ type: 'device_status', deviceId, isRecording: c?.isRecording, isStreaming: true });
        broadcastDeviceList();
        break;
      }
      case 'stream_stopped': {
        const c = mobileClients.get(deviceId);
        if (c) c.isStreaming = false;
        broadcastToWeb({ type: 'device_status', deviceId, isRecording: c?.isRecording, isStreaming: false });
        broadcastDeviceList();
        break;
      }
      case 'recording_started': {
        const c = mobileClients.get(deviceId);
        if (c) c.isRecording = true;
        broadcastToWeb({ type: 'device_status', deviceId, isRecording: true, isStreaming: c?.isStreaming });
        broadcastDeviceList();
        break;
      }
      case 'recording_stopped': {
        const c = mobileClients.get(deviceId);
        if (c) c.isRecording = false;
        broadcastToWeb({ type: 'device_status', deviceId, isRecording: false, isStreaming: c?.isStreaming });
        broadcastDeviceList();
        break;
      }
      case 'recording_saved': {
        const c = mobileClients.get(deviceId);
        if (c) c.recordings.push({ filename: msg.filename, duration: msg.duration, size: msg.size, savedAt: new Date() });
        broadcastToWeb({ type: 'recording_saved', deviceId, filename: msg.filename, duration: msg.duration, size: msg.size });
        break;
      }

      // ── Commands from web → mobile ────────────────────────────────────────
      case 'start_stream':     if (clientType === 'web') sendToMobile(msg.deviceId, { type: 'start_stream' });     break;
      case 'stop_stream':      if (clientType === 'web') sendToMobile(msg.deviceId, { type: 'stop_stream' });      break;
      case 'start_recording':  if (clientType === 'web') sendToMobile(msg.deviceId, { type: 'start_recording' });  break;
      case 'stop_recording':   if (clientType === 'web') sendToMobile(msg.deviceId, { type: 'stop_recording' });   break;

      default: break;
    }
  });

  ws.on('close', () => {
    if (clientType === 'mobile' && deviceId) {
      const name = mobileClients.get(deviceId)?.deviceName;
      mobileClients.delete(deviceId);
      console.log(`[MOBILE] Disconnected: ${name}`);
      broadcastDeviceList();
    } else if (clientType === 'web') {
      webClients.delete(ws);
      console.log('[WEB] Dashboard disconnected');
    }
  });

  ws.on('error', (e) => console.warn('[WS] Error:', e.message));
});

// ─── Helper: list recordings on disk for a device ────────────────────────────
function listDeviceRecordings(deviceId) {
  const dir = path.join(RECORDINGS_DIR, sanitizeDeviceId(deviceId));
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(f => /\.(m4a|3gp|mp3|wav|webm)$/i.test(f))
    .map(f => {
      const full = path.join(dir, f);
      const stat = fs.statSync(full);
      return {
        filename: f,
        url: `/recordings/${sanitizeDeviceId(deviceId)}/${f}`,
        size: stat.size,
        savedAt: stat.mtime,
      };
    })
    .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
}

// ─── REST Endpoints ───────────────────────────────────────────────────────────

/** Web Dashboard Login */
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (email === MANAGER_EMAIL && password === MANAGER_PASSWORD) {
    res.json({ ok: true, sessionToken: SESSION_TOKEN, pairingCode });
  } else {
    res.status(401).json({ error: 'Invalid email or password' });
  }
});

/** Upload audio file from mobile */
app.post('/api/recordings/upload', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const deviceId = req.body.deviceId || 'unknown';
  const sanitized = sanitizeDeviceId(deviceId);

  console.log(`[UPLOAD] ${req.file.filename} from device ${deviceId} (${(req.file.size / 1024).toFixed(1)} KB)`);

  const url = `/recordings/${sanitized}/${req.file.filename}`;

  // Notify web clients
  broadcastToWeb({
    type: 'server_recording_saved',
    deviceId,
    filename: req.file.filename,
    url,
    size: req.file.size,
    savedAt: new Date(),
  });

  res.json({ ok: true, filename: req.file.filename, url });
});

/** List recordings for a device */
app.get('/api/recordings/:deviceId', requireAuth, (req, res) => {
  const recs = listDeviceRecordings(req.params.deviceId);
  res.json({ recordings: recs });
});

/** Delete a recording */
app.delete('/api/recordings/:deviceId/:filename', requireAuth, (req, res) => {
  const file = path.join(RECORDINGS_DIR, sanitizeDeviceId(req.params.deviceId), req.params.filename);
  if (!fs.existsSync(file)) return res.status(404).json({ error: 'Not found' });
  // Prevent path traversal
  if (!file.startsWith(RECORDINGS_DIR)) return res.status(400).json({ error: 'Invalid path' });
  fs.unlinkSync(file);
  console.log(`[DELETE] ${req.params.filename}`);
  res.json({ ok: true });
});

/** Device list */
app.get('/api/devices', requireAuth, (req, res) => {
  res.json({ devices: getDeviceList() });
});

/** Health check */
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', mobileClients: mobileClients.size, webClients: webClients.size, uptime: Math.floor(process.uptime()) });
});

// ─── Start ────────────────────────────────────────────────────────────────────
server.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🎙️  MicNet Server (Manager/User Mode)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`   HTTP/WS   → http://0.0.0.0:${PORT}`);
  console.log(`   Dashboard → http://localhost:${PORT}`);
  console.log(`   Recordings → ${RECORDINGS_DIR}`);
  console.log(`   Manager Email → ${MANAGER_EMAIL}`);
  console.log(`   Pairing Code  → ${pairingCode}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('');
  if (MANAGER_PASSWORD === 'secret') {
    console.warn('⚠️  WARNING: Using default MANAGER_PASSWORD! Set MANAGER_PASSWORD env var before deploying publicly.');
  }
});
