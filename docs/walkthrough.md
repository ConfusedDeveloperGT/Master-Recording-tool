# 🎙️ MicNet — Remote Audio Recording System (v2)

## ✅ What Was Built

A complete **public-hostable**, **password-protected** 3-part remote audio recording system:

| Component | Location | Purpose |
|-----------|----------|---------|
| **Signaling Server** | `server/` | WebSocket bridge + file storage + REST API |
| **Web Dashboard** | `web/` | Password-login remote control + recordings download UI |
| **Mobile App** | Expo project | Records audio, streams live, uploads to server, remote controlled |

---

## 🚀 Local Testing

```powershell
# 1. Start server
cd c:\political-demography-mobile\server
$env:AUTH_TOKEN="mypassword"
node server.js

# 2. Get your PC's local IP
ipconfig | Select-String "IPv4"
# e.g. 192.168.1.100

# 3. Mobile app Settings:
#    WS URL:   ws://192.168.1.100:3001
#    HTTP URL: http://192.168.1.100:3001
#    Token:    mypassword

# 4. Web dashboard:
#    Open http://localhost:3001
#    Enter: WS=ws://localhost:3001, HTTP=http://localhost:3001, Token=mypassword
```

## ☁️ Public Deploy (Railway)

```
1. Push server/ to GitHub
2. railway.app → New Project → Deploy from GitHub
3. Add env var: AUTH_TOKEN=your-secret-password
4. Copy URL: https://micnet-xxx.up.railway.app
5. Mobile: wss://micnet-xxx... / https://micnet-xxx...
6. Web dashboard: same URLs
```

See [DEPLOY.md](file:///c:/political-demography-mobile/server/DEPLOY.md) for full instructions.

---

## 📱 Mobile App Features

| Feature | Description |
|---------|-------------|
| **Local Recording** | Press Record on Home tab, saves .m4a in document folder |
| **Live Streaming** | Press Stream Live, sends PCM audio to web dashboard |
| **Remote Control** | Server can trigger start/stop from web without touching phone |
| **Background Recording** | Continues recording when screen locked (shows notification) |
| **Recordings Tab** | List, play, delete, and share all saved recordings |
| **Internal Mic Only** | Only uses phone's built-in mic, never Bluetooth/external |

---

## 🌐 Web Dashboard Features

| Feature | Description |
|---------|-------------|
| **Device List** | Shows all connected phones in real-time |
| **Live Listen** | Streams audio from phone's mic with Web Audio API |
| **Remote Record** | Commands phone to start/stop recording remotely |
| **Waveform Visualizer** | Real-time audio waveform using Canvas + AnalyserNode |
| **Recording Timer** | Shows elapsed recording time |
| **Volume Control** | Adjust live listen volume |
| **Recent Recordings** | Shows recordings saved during session |
| **Toast Notifications** | Status updates for all actions |
| **Auto-reconnect** | Reconnects to server automatically on disconnect |

---

## 📁 File Structure

```
c:\political-demography-mobile\
├── server/
│   ├── package.json        ← Node.js dependencies
│   └── server.js           ← WebSocket + Express signaling server
│
├── web/
│   ├── index.html          ← Dashboard HTML
│   ├── styles.css          ← Dark glassmorphism styles
│   └── app.js              ← WS client + Web Audio API
│
├── src/
│   ├── services/
│   │   ├── WebSocketService.ts   ← Singleton WS client w/ auto-reconnect
│   │   └── AudioService.ts       ← Recording helpers + PCM streaming
│   └── screens/
│       ├── HomeScreen.tsx        ← Mic orb, record/stream controls
│       ├── RecordingsScreen.tsx  ← File list, playback, delete
│       └── SettingsScreen.tsx    ← Server URL, device name, bg recording
│
├── App.tsx                 ← Tab navigator, bootstrap
└── app.json                ← Expo config with expo-audio plugin
```

---

## 🔌 WebSocket Protocol

```
Mobile → Server:
  device_hello    { deviceId, deviceName }
  audio_chunk     { deviceId, chunk(Base64 PCM), sampleRate, channels }
  recording_saved { deviceId, filename, duration, size }
  stream_started / stream_stopped / recording_started / recording_stopped

Server → Mobile:
  start_stream / stop_stream / start_recording / stop_recording

Web → Server:
  web_hello
  start_stream / stop_stream { deviceId }
  start_recording / stop_recording { deviceId }

Server → Web:
  device_list   { devices: [...] }
  audio_chunk   { deviceId, chunk, sampleRate, channels }
  device_status { deviceId, isRecording, isStreaming }
  recording_saved { deviceId, filename, duration, size }
```

---

## Important Notes

1. **Same Wi-Fi Required** — Phone and PC must be on the same local network
2. **Background recording** shows a notification on Android (OS requirement)
3. **Only internal mic** is used — Bluetooth audio will not be recorded
4. **Expo Go limitation** — Background recording requires a development build, not Expo Go
