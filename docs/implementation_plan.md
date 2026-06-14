# 🎙️ Remote Audio Recording System — Implementation Plan

## Overview

Build a two-part system:

1. **Mobile App** (Expo / React Native) — records external audio using the phone's **built-in microphone only**, manages recordings locally, and can be remotely controlled via WebSocket.
2. **Web Dashboard** (standalone HTML/CSS/JS) — remotely trigger mic recording on connected phones, live-listen to the audio stream in real-time, and view/download recorded files.
3. **Signaling Server** (Node.js + WebSocket) — bridges the mobile app and the web dashboard.

---

## User Review Required

> [!IMPORTANT]
> **Privacy & Legal**: This app can activate a phone's microphone remotely from a website. Please ensure you only use this on **your own devices** or with **explicit consent** from device owners. Covert monitoring of others is illegal in most jurisdictions.

> [!IMPORTANT]
> **Backend hosting**: The signaling server needs to run somewhere accessible from both the phone and the web browser. Options:
> - **Local network only** (simplest): Run the server on your PC; phone and browser must be on same Wi-Fi.
> - **Public cloud** (e.g., Railway, Render, Fly.io): Both phone and browser can connect from anywhere.
>
> **Which do you prefer?** (This affects how we configure server URLs.)

> [!WARNING]
> **Background recording on Android**: Background mic recording shows a **persistent system notification** (Android OS requirement). This cannot be hidden — it's a privacy protection by Android.

---

## Open Questions

1. **Server hosting**: Local Wi-Fi only, or publicly hosted?
2. **Authentication**: Should the website require a password to connect to a phone, or is open access fine for now?
3. **Recording storage**: Should recorded files be saved only on the phone, or uploaded to a server too?
4. **Live streaming format**: Real-time PCM stream (low latency, no file) vs. chunked upload (saved + playable)?
5. **Multiple devices**: Should the website manage multiple phones simultaneously?

---

## Architecture

```
┌─────────────────┐         WebSocket          ┌──────────────────────┐
│   Mobile App    │◄──────────────────────────►│  Signaling Server    │
│  (Expo/RN)      │                            │  (Node.js + WS)      │
│                 │         WebSocket          │                      │
│  • Internal mic │◄──────────────────────────►│  Web Dashboard       │
│  • Background   │   (audio PCM chunks)       │  (HTML/CSS/JS)       │
│    recording    │                            │                      │
│  • Manage files │                            │  • Remote trigger    │
│└─────────────────┘                            │  • Live listen       │
│                                               │  • File download     │
│                                               └──────────────────────┘
```

**Flow:**
1. Mobile app starts and connects to WebSocket server with a device ID.
2. Web dashboard opens and lists connected devices.
3. User clicks "Start Remote Recording" or "Live Listen" on dashboard.
4. Server relays command to phone.
5. Phone starts mic → streams PCM audio chunks back via WebSocket.
6. Web dashboard receives chunks, decodes them with Web Audio API, plays live.
7. Optionally saves as downloadable audio file.

---

## Proposed Changes

### 1. Signaling Server (NEW — `server/` folder inside workspace)

#### [NEW] `server/server.js`
- Node.js WebSocket server using `ws` package
- Tracks connected mobile devices by device ID
- Relays commands: `start_recording`, `stop_recording`, `start_stream`, `stop_stream`
- Relays audio PCM chunks from phone → web dashboard
- REST endpoint: `GET /devices` — list connected devices
- REST endpoint: `GET /recordings/:deviceId/:file` — serve recorded files

#### [NEW] `server/package.json`
- Dependencies: `ws`, `express`, `cors`, `uuid`

---

### 2. Mobile App (MODIFY existing Expo project)

#### [MODIFY] `app.json`
- Add `expo-audio` plugin with:
  - `microphonePermission`: custom message
  - `enableBackgroundRecording: true`
  - `enableBackgroundPlayback: false`
- Add `android.permissions`: `RECORD_AUDIO`, `INTERNET`

#### [MODIFY] `package.json`
- Add: `expo-audio`, `expo-file-system`, `expo-av` (for playback)

#### [NEW] `src/services/WebSocketService.ts`
- Manages WebSocket connection to server
- Sends: `device_hello`, `audio_chunk`, `recording_saved`
- Receives: `start_recording`, `stop_recording`, `start_stream`, `stop_stream`
- Auto-reconnect logic

#### [NEW] `src/services/AudioService.ts`
- Uses `expo-audio` `useAudioRecorder` + `useAudioStream`
- Records using **internal microphone only** (default mic source, not Bluetooth)
- Supports background recording via `setAudioModeAsync`
- Manages file naming, timestamps, duration tracking

#### [NEW] `src/screens/HomeScreen.tsx`
- Main recording control screen
- Mic waveform animation during recording
- Record / Pause / Stop buttons
- Recording timer display
- "Connected to server" status indicator

#### [NEW] `src/screens/RecordingsScreen.tsx`
- List of all local recordings
- Play, rename, delete, share functions
- Duration, date, file size display

#### [NEW] `src/screens/SettingsScreen.tsx`
- Server URL configuration
- Device name/ID setting
- Audio quality presets (HIGH / LOW)
- Background recording toggle

#### [MODIFY] `App.tsx`
- Replace current content with tab navigator
- Tabs: Home (Record), Recordings, Settings

---

### 3. Web Dashboard (NEW — `web/` folder inside workspace)

#### [NEW] `web/index.html`
- Single-page dark-theme dashboard
- Device list panel (left sidebar)
- Main control panel (center)
- Live audio visualizer (waveform bars)

#### [NEW] `web/styles.css`
- Dark glassmorphism design
- Animated waveform bars
- Pulsing "LIVE" indicator
- Smooth transitions

#### [NEW] `web/app.js`
- WebSocket client connecting to server
- Web Audio API for live playback of PCM chunks
- Device selection and command dispatch
- Recordings list fetch + download links
- Real-time waveform visualizer using `AnalyserNode`

---

## Technology Choices

| Component | Technology | Reason |
|-----------|-----------|--------|
| Mobile | Expo SDK 56 + `expo-audio` | Matches existing project, best RN audio support |
| Recording | `useAudioRecorder` (HIGH_QUALITY preset) | Internal mic, M4A format |
| Live stream | `useAudioStream` (PCM chunks) | Real-time, low latency |
| Mic source | Default (phone's built-in mic) | Android & iOS use built-in mic by default when Bluetooth not selected |
| Server | Node.js + `ws` + `express` | Simple, lightweight |
| Web | Vanilla HTML/CSS/JS | No framework needed, Web Audio API built-in |
| Live audio | Web Audio API `AudioContext` | Decode PCM, schedule playback buffer |

---

## File Structure After Implementation

```
c:\political-demography-mobile\
├── server/
│   ├── package.json
│   └── server.js
├── web/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── src/
│   ├── services/
│   │   ├── AudioService.ts
│   │   └── WebSocketService.ts
│   └── screens/
│       ├── HomeScreen.tsx
│       ├── RecordingsScreen.tsx
│       └── SettingsScreen.tsx
├── App.tsx          (modified)
├── app.json         (modified)
└── package.json     (modified)
```

---

## Verification Plan

### Automated Tests
- None required (UI-heavy app)

### Manual Verification
1. Start server → verify `ws://localhost:3001` responds
2. Open `web/index.html` → verify device list shows "No devices connected"
3. Start Expo app on Android device → verify device appears in web dashboard
4. Click "Start Remote Recording" on web → verify phone shows recording notification + recording starts
5. Click "Live Listen" → verify audio plays in browser with <1s latency
6. Stop recording → verify file appears in phone's Recordings tab
7. Background test: Lock phone screen → verify recording continues (notification persists)
8. Play recording on phone → verify playback works

---

## Implementation Order

1. ✅ Server (`server/server.js`) — foundation for everything
2. ✅ Web Dashboard (`web/`) — test server independently
3. ✅ Mobile WebSocket service
4. ✅ Mobile Audio service
5. ✅ Mobile screens + UI
6. ✅ Integration test
