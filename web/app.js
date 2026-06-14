/**
 * MicNet Web Dashboard — app.js (v2)
 * Password-protected, multi-device, server recordings download
 */

'use strict';

const DEFAULT_SERVER = (() => {
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}`;
})();

const DEFAULT_HTTP = (() => {
  return `${window.location.protocol}//${window.location.host}`;
})();

// ─── State ────────────────────────────────────────────────────────────────────
let ws = null;
let wsReady = false;
let reconnectTimer = null;
let authToken = localStorage.getItem('micnet_token') || '';
let pairingCode = localStorage.getItem('micnet_pairing_code') || '';
let serverWsUrl = DEFAULT_SERVER;
let serverHttpUrl = DEFAULT_HTTP;
let selectedDeviceId = null;
let devices = new Map();
let serverRecordings = new Map(); // deviceId → Array

let audioCtx = null;
let gainNode = null;
let analyserNode = null;
let isListening = false;
let isRemoteRecording = false;
let recordingStartTime = null;
let recordingTimerInterval = null;
let nextPlayTime = 0;
let animFrameId = null;

// ─── DOM ──────────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const $loginOverlay   = $('loginOverlay');
const $loginError     = $('loginError');
const $loginEmail     = $('loginEmail');
const $loginPassword  = $('loginPassword');
const $loginBtn       = $('loginBtn');
const $statusDot      = $('statusDot');
const $statusLabel    = $('statusLabel');
const $deviceList     = $('deviceList');
const $noDevices      = $('noDevices');
const $emptyState     = $('emptyState');
const $controlPanel   = $('controlPanel');
const $deviceAvatar   = $('deviceAvatar');
const $deviceNameDisp = $('deviceNameDisplay');
const $deviceMeta     = $('deviceMeta');
const $liveBadge      = $('liveBadge');
const $visualizerCont = $('visualizerContainer');
const $visLabel       = $('visualizerLabel');
const $canvas         = $('waveformCanvas');
const $streamBtn      = $('streamBtn');
const $recordBtn      = $('recordBtn');
const $recordingTimer = $('recordingTimer');
const $timerDisplay   = $('timerDisplay');
const $volumeSlider   = $('volumeSlider');
const $volumeValue    = $('volumeValue');
const $recList        = $('recordingsList');
const $recBadge       = $('recordingsBadge');
const $serverUrl      = $('serverUrl');
const $reconnectBtn   = $('reconnectBtn');
const $toastCont      = $('toastContainer');
const ctx             = $canvas?.getContext('2d');

// ─── Login ────────────────────────────────────────────────────────────────────
function showLogin() { $loginOverlay.style.display = 'flex'; }
function hideLogin() { $loginOverlay.style.display = 'none'; }

if (!authToken) showLogin();
else {
  hideLogin();
  connect(serverWsUrl, authToken);
  if (pairingCode) showPairingCode(pairingCode);
}

$loginBtn?.addEventListener('click', async () => {
  const email    = $loginEmail.value.trim();
  const password = $loginPassword.value;
  if (!email || !password) { $loginError.textContent = 'Please enter email and password.'; return; }

  try {
    $loginBtn.textContent = 'Logging in...';
    const res = await fetch(`${serverHttpUrl}/api/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    
    if (!res.ok) {
      $loginError.textContent = 'Invalid email or password.';
      $loginBtn.textContent = 'Login →';
      return;
    }

    const data = await res.json();
    authToken = data.sessionToken;
    pairingCode = data.pairingCode;
    
    localStorage.setItem('micnet_token', authToken);
    localStorage.setItem('micnet_pairing_code', pairingCode);
    
    $loginError.textContent = '';
    $loginBtn.textContent = 'Login →';
    
    connect(serverWsUrl, authToken);
    showPairingCode(pairingCode);
  } catch (err) {
    $loginError.textContent = 'Connection to server failed.';
    $loginBtn.textContent = 'Login →';
  }
});

$loginPassword?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $loginBtn.click(); });

function showPairingCode(code) {
  const display = $('pairingCodeDisplay');
  if (display) display.textContent = code;
}

$('showQrBtn')?.addEventListener('click', () => {
  const qrOverlay = $('qrOverlay');
  const qrContainer = $('qrCodeContainer');
  if (qrOverlay && qrContainer) {
    qrContainer.innerHTML = ''; // clear old QR
    
    // QR Code payload
    const payload = JSON.stringify({
      url: serverWsUrl,
      http: serverHttpUrl,
      code: pairingCode
    });
    
    new QRCode(qrContainer, {
      text: payload,
      width: 200,
      height: 200,
      colorDark : "#0f1117",
      colorLight : "#ffffff",
      correctLevel : QRCode.CorrectLevel.H
    });
    
    qrOverlay.style.display = 'flex';
  }
});

function logout() {
  localStorage.removeItem('micnet_token');
  localStorage.removeItem('micnet_pairing_code');
  authToken = '';
  pairingCode = '';
  if (ws) ws.close();
  location.reload();
}

// ─── WebSocket ────────────────────────────────────────────────────────────────
function connect(url, token) {
  if (ws) { try { ws.close(); } catch {} ws = null; }
  clearTimeout(reconnectTimer);
  setStatus('connecting');

  const fullUrl = `${url}?token=${encodeURIComponent(token)}`;

  try { ws = new WebSocket(fullUrl); }
  catch { setStatus('disconnected'); toast('Invalid server URL', 'error'); return; }

  ws.binaryType = 'arraybuffer';

  ws.onopen = () => {
    wsReady = true;
    setStatus('connected');
    hideLogin();
    ws.send(JSON.stringify({ type: 'web_hello' }));
    toast('Connected to server ✓', 'success');
  };

  ws.onclose = (e) => {
    wsReady = false;
    setStatus('disconnected');
    clearDevices();
    if (e.code === 4001) {
      toast('Wrong password — check your token', 'error');
      showLogin();
      $loginError.textContent = 'Authentication failed — check your token.';
      return;
    }
    toast('Disconnected — retrying…', 'error');
    reconnectTimer = setTimeout(() => connect(serverWsUrl, authToken), 4000);
  };

  ws.onerror = () => setStatus('disconnected');

  ws.onmessage = (e) => {
    let msg;
    try { msg = JSON.parse(e.data); } catch { return; }
    handleMsg(msg);
  };
}

function sendCmd(type, extra = {}) {
  if (!wsReady) { toast('Not connected', 'error'); return; }
  ws.send(JSON.stringify({ type, ...extra }));
}

// ─── Message Handler ──────────────────────────────────────────────────────────
function handleMsg(msg) {
  switch (msg.type) {
    case 'device_list':
      updateDeviceList(msg.devices);
      break;

    case 'device_status': {
      const d = devices.get(msg.deviceId);
      if (d) { d.isRecording = msg.isRecording; d.isStreaming = msg.isStreaming; }
      refreshCards();
      if (msg.deviceId === selectedDeviceId) updatePanel();
      break;
    }

    case 'audio_chunk':
      if (msg.deviceId === selectedDeviceId && isListening)
        playChunk(msg.chunk, msg.sampleRate || 16000, msg.channels || 1);
      break;

    case 'recording_saved':
      if (msg.deviceId === selectedDeviceId) {
        toast(`Recording saved: ${msg.filename}`, 'success');
        loadServerRecordings(msg.deviceId);
      }
      break;

    case 'server_recording_saved':
      toast(`☁️ Uploaded: ${msg.filename}`, 'success');
      addServerRecording(msg.deviceId, msg);
      if (msg.deviceId === selectedDeviceId) renderRecordingsList();
      break;

    case 'recordings_list':
      serverRecordings.set(msg.deviceId, msg.recordings || []);
      if (msg.deviceId === selectedDeviceId) renderRecordingsList();
      break;
  }
}

// ─── Device List ──────────────────────────────────────────────────────────────
function updateDeviceList(arr) {
  devices.clear();
  for (const d of arr) devices.set(d.deviceId, d);
  if (selectedDeviceId && !devices.has(selectedDeviceId)) selectDevice(null);
  refreshCards();
}

function clearDevices() { devices.clear(); refreshCards(); }

function refreshCards() {
  $deviceList.querySelectorAll('.device-card').forEach(el => el.remove());
  if (devices.size === 0) { $noDevices.style.display = 'flex'; return; }
  $noDevices.style.display = 'none';

  for (const [id, d] of devices) {
    const card = document.createElement('div');
    card.className = 'device-card' + (id === selectedDeviceId ? ' active' : '');
    card.dataset.deviceId = id;

    let statusText = 'Idle', dotCls = 'idle';
    if (d.isRecording) { statusText = 'Recording…'; dotCls = 'recording'; }
    else if (d.isStreaming) { statusText = 'Streaming…'; dotCls = 'streaming'; }

    card.innerHTML = `
      <div class="device-card-avatar">${esc(d.deviceName[0] || '?').toUpperCase()}</div>
      <div class="device-card-info">
        <div class="device-card-name">${esc(d.deviceName)}</div>
        <div class="device-card-status">
          <span class="mini-dot ${dotCls}"></span>${statusText}
        </div>
      </div>`;
    card.addEventListener('click', () => selectDevice(id));
    $deviceList.appendChild(card);
  }
}

function selectDevice(deviceId) {
  selectedDeviceId = deviceId;
  refreshCards();

  if (!deviceId) {
    $emptyState.removeAttribute('hidden');
    $controlPanel.setAttribute('hidden', '');
    stopListening();
    return;
  }

  $emptyState.setAttribute('hidden', '');
  $controlPanel.removeAttribute('hidden');
  updatePanel();
  loadServerRecordings(deviceId);
}

// ─── Server Recordings ────────────────────────────────────────────────────────
async function loadServerRecordings(deviceId) {
  if (!authToken) return;
  try {
    const res = await fetch(`${serverHttpUrl}/api/recordings/${deviceId}?token=${encodeURIComponent(authToken)}`);
    if (!res.ok) return;
    const data = await res.json();
    serverRecordings.set(deviceId, data.recordings || []);
    if (deviceId === selectedDeviceId) renderRecordingsList();
  } catch {}
}

function addServerRecording(deviceId, rec) {
  const list = serverRecordings.get(deviceId) || [];
  list.unshift(rec);
  serverRecordings.set(deviceId, list);
}

async function deleteServerRecording(deviceId, filename) {
  if (!confirm(`Delete "${filename}"?`)) return;
  try {
    const res = await fetch(`${serverHttpUrl}/api/recordings/${deviceId}/${filename}`, {
      method: 'DELETE',
      headers: { 'x-auth-token': authToken },
    });
    if (res.ok) {
      const list = (serverRecordings.get(deviceId) || []).filter(r => r.filename !== filename);
      serverRecordings.set(deviceId, list);
      renderRecordingsList();
      toast(`Deleted ${filename}`, 'info');
    }
  } catch { toast('Delete failed', 'error'); }
}

function renderRecordingsList() {
  const recs = serverRecordings.get(selectedDeviceId) || [];
  $recBadge.textContent = String(recs.length);

  if (recs.length === 0) {
    $recList.innerHTML = '<div class="no-recordings">No recordings on server yet</div>';
    return;
  }

  $recList.innerHTML = '';
  for (const rec of recs) {
    const item = document.createElement('div');
    item.className = 'recording-item';
    const dur  = rec.duration ? `${Math.round(rec.duration)}s` : '';
    const size = rec.size ? formatBytes(rec.size) : '';
    const downloadUrl = `${serverHttpUrl}${rec.url}?token=${encodeURIComponent(authToken)}`;

    item.innerHTML = `
      <div class="recording-item-icon">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
          <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
        </svg>
      </div>
      <div class="recording-item-info">
        <div class="recording-item-name">${esc(rec.filename)}</div>
        <div class="recording-item-meta">${[dur, size].filter(Boolean).join(' · ')} · ☁️ Server</div>
      </div>
      <div style="display:flex;gap:6px;flex-shrink:0">
        <a href="${downloadUrl}" download="${esc(rec.filename)}" class="rec-btn" title="Download">⬇</a>
        <button class="rec-btn rec-btn-del" onclick="deleteServerRecording('${esc(selectedDeviceId)}','${esc(rec.filename)}')" title="Delete">🗑</button>
      </div>`;
    $recList.appendChild(item);
  }
}

// ─── Control Panel ────────────────────────────────────────────────────────────
function updatePanel() {
  const d = devices.get(selectedDeviceId);
  if (!d) return;
  $deviceAvatar.textContent = (d.deviceName[0] || '?').toUpperCase();
  $deviceNameDisp.textContent = d.deviceName;
  $deviceMeta.textContent = `ID: ${selectedDeviceId}`;

  if (isListening) {
    $streamBtn.classList.add('active');
    $streamBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Stop Listening`;
    $liveBadge.removeAttribute('hidden');
    $visualizerCont.classList.add('active');
    $visLabel.classList.add('hidden');
  } else {
    $streamBtn.classList.remove('active');
    $streamBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg> Start Listening`;
    if (!isRemoteRecording) $liveBadge.setAttribute('hidden', '');
    $visualizerCont.classList.remove('active');
    $visLabel.classList.remove('hidden');
  }

  if (isRemoteRecording) {
    $recordBtn.classList.add('active');
    $recordBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg> Stop Recording`;
    $recordingTimer.removeAttribute('hidden');
    $liveBadge.removeAttribute('hidden');
  } else {
    $recordBtn.classList.remove('active');
    $recordBtn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="6" fill="currentColor"/></svg> Start Recording`;
    $recordingTimer.setAttribute('hidden', '');
    if (!isListening) $liveBadge.setAttribute('hidden', '');
  }
}

// ─── Audio Playback ───────────────────────────────────────────────────────────
function ensureAudioCtx() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = audioCtx.createGain();
    gainNode.gain.value = 1;
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 512;
    gainNode.connect(analyserNode);
    analyserNode.connect(audioCtx.destination);
    nextPlayTime = audioCtx.currentTime;
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function playChunk(b64, sr, ch) {
  ensureAudioCtx();
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

  const int16 = new Int16Array(bytes.buffer);
  const f32   = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) f32[i] = int16[i] / 32768;

  const frames = f32.length / ch;
  const buf    = audioCtx.createBuffer(ch, frames, sr);
  for (let c = 0; c < ch; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < frames; i++) d[i] = f32[i * ch + c];
  }

  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.connect(gainNode);
  const now = audioCtx.currentTime;
  if (nextPlayTime < now + 0.01) nextPlayTime = now + 0.01;
  src.start(nextPlayTime);
  nextPlayTime += buf.duration;
}

function startListening() {
  if (!selectedDeviceId) { toast('No device selected', 'error'); return; }
  ensureAudioCtx();
  isListening = true;
  sendCmd('start_stream', { deviceId: selectedDeviceId });
  startWaveAnim();
  updatePanel();
  toast('Live listening started 🎧', 'info');
}

function stopListening() {
  if (!isListening) return;
  isListening = false;
  if (selectedDeviceId) sendCmd('stop_stream', { deviceId: selectedDeviceId });
  stopWaveAnim();
  updatePanel();
}

function startRemoteRec() {
  if (!selectedDeviceId) { toast('No device selected', 'error'); return; }
  isRemoteRecording = true;
  recordingStartTime = Date.now();
  sendCmd('start_recording', { deviceId: selectedDeviceId });
  startRecTimer();
  updatePanel();
  toast('Remote recording started 🔴', 'info');
}

function stopRemoteRec() {
  if (!isRemoteRecording) return;
  isRemoteRecording = false;
  sendCmd('stop_recording', { deviceId: selectedDeviceId });
  stopRecTimer();
  updatePanel();
  toast('Recording stopped — uploading to server…', 'success');
}

// ─── Waveform ─────────────────────────────────────────────────────────────────
function startWaveAnim() {
  if (animFrameId) return;
  function draw() {
    const W = $canvas.width = $canvas.offsetWidth;
    const H = $canvas.height = $canvas.offsetHeight;
    ctx.clearRect(0, 0, W, H);

    if (analyserNode && isListening) {
      const data = new Uint8Array(analyserNode.frequencyBinCount);
      analyserNode.getByteTimeDomainData(data);
      const grad = ctx.createLinearGradient(0, 0, W, 0);
      grad.addColorStop(0, 'hsla(215,90%,60%,0.2)');
      grad.addColorStop(0.5, 'hsla(215,90%,70%,0.9)');
      grad.addColorStop(1, 'hsla(215,90%,60%,0.2)');
      ctx.lineWidth = 2; ctx.strokeStyle = grad; ctx.beginPath();
      const sw = W / data.length;
      for (let i = 0; i < data.length; i++) {
        const y = (data[i] / 128) * H / 2;
        i === 0 ? ctx.moveTo(i * sw, y) : ctx.lineTo(i * sw, y);
      }
      ctx.stroke();
      ctx.globalAlpha = 0.12; ctx.lineWidth = 8; ctx.stroke(); ctx.globalAlpha = 1;
    } else {
      const t = Date.now() / 1000;
      ctx.lineWidth = 1.5; ctx.strokeStyle = 'hsla(215,90%,60%,0.18)'; ctx.beginPath();
      for (let x = 0; x <= W; x++) {
        const y = H / 2 + Math.sin((x / W) * Math.PI * 5 + t * 1.2) * 7;
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    animFrameId = requestAnimationFrame(draw);
  }
  animFrameId = requestAnimationFrame(draw);
}

function stopWaveAnim() {
  if (animFrameId) { cancelAnimationFrame(animFrameId); animFrameId = null; }
}

// ─── Timer ────────────────────────────────────────────────────────────────────
function startRecTimer() {
  recordingTimerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - recordingStartTime) / 1000);
    $timerDisplay.textContent = `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }, 1000);
}
function stopRecTimer() {
  clearInterval(recordingTimerInterval);
  $timerDisplay.textContent = '00:00';
}

// ─── UI ───────────────────────────────────────────────────────────────────────
function setStatus(s) {
  $statusDot.className = 'status-dot ' + s;
  $statusLabel.textContent = { connected: 'Connected', disconnected: 'Disconnected', connecting: 'Connecting…' }[s] || s;
}

function toast(msg, type = 'info') {
  const icons = { success: '✅', error: '❌', info: '🎙️' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span class="toast-icon">${icons[type]}</span><span>${esc(msg)}</span>`;
  $toastCont.appendChild(el);
  setTimeout(() => { el.style.opacity = '0'; el.style.transform = 'translateX(24px)'; el.style.transition = '300ms'; setTimeout(() => el.remove(), 300); }, 3500);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatBytes(b) {
  if (b < 1024) return `${b}B`;
  if (b < 1048576) return `${(b/1024).toFixed(1)}KB`;
  return `${(b/1048576).toFixed(1)}MB`;
}

// ─── Event Listeners ──────────────────────────────────────────────────────────
$streamBtn?.addEventListener('click', () => isListening ? stopListening() : startListening());
$recordBtn?.addEventListener('click', () => isRemoteRecording ? stopRemoteRec() : startRemoteRec());
$volumeSlider?.addEventListener('input', () => {
  const v = Number($volumeSlider.value);
  $volumeValue.textContent = `${v}%`;
  if (gainNode) gainNode.gain.value = v / 100;
});

// Expose deleteServerRecording globally for onclick handlers
window.deleteServerRecording = deleteServerRecording;

// Idle waveform
startWaveAnim();
