# 🎙️ MicNet — Remote Background Audio Recording & Live Streaming System

MicNet is a complete system consisting of an Android/iOS mobile application, a signaling server, and a web dashboard. It allows you to record audio using the phone's **built-in microphone only**, manage recordings, stream live audio in real-time, and control the microphone remotely via a password-secured web panel.

---

## 📁 Project Structure

The project code is fully consolidated within this repository:

*   **`src/` & `App.tsx` (Mobile App)**: Expo-based mobile app that handles local audio recording, real-time PCM streaming via WebSockets, storage management, and remote-control command handling.
*   **`server/` (Signaling Server)**: Node.js WebSocket & Express server that manages connections, relays audio streams/commands between the web dashboard and mobile app, and stores uploaded recording files.
*   **`web/` (Web Dashboard)**: Modern single-page web dashboard using CSS glassmorphism, featuring password login, real-time waveform visualization (Web Audio API), and controls to trigger recording or live listening.
*   **`docs/` (Project Docs)**: Contains detailed documentation, including:
    *   [Implementation Plan](file:///c:/political-demography-mobile/docs/implementation_plan.md)
    *   [Walkthrough & Features](file:///c:/political-demography-mobile/docs/walkthrough.md)
    *   [Task Checklist](file:///c:/political-demography-mobile/docs/task.md)

---

## 🚀 Getting Started

### 1. Run the Signaling Server
Make sure you have Node.js installed. Navigate to the `server` directory, install dependencies, and start the server with your custom security token:

```powershell
cd server
npm install
$env:AUTH_TOKEN="your-secure-password"
node server.js
```
The server will run on port `3001` (both HTTP API and WebSocket signaling).

### 2. Configure the Mobile App
Get the local IP address of your machine running the server (e.g. `192.168.1.100`):
```powershell
ipconfig | Select-String "IPv4"
```
Launch the mobile app in your Expo development environment:
```powershell
npm install
npm run android # or npm run ios / npx expo start
```
Go to the **Settings** tab in the mobile app and configure:
*   **WebSocket URL**: `ws://<your-pc-ip>:3001`
*   **HTTP Server URL**: `http://<your-pc-ip>:3001`
*   **Security Token**: `your-secure-password`

### 3. Open the Web Dashboard
Open `web/index.html` in your browser (or visit `http://localhost:3001` once the server is running).
1. Enter the server's WebSocket and HTTP URLs.
2. Enter the same **Security Token** (`your-secure-password`).
3. View the list of connected phones, start remote recording, or trigger a live audio stream!

---

## ☁️ Public Cloud Deployment (Railway)

For remote control across different networks, deploy the server to a cloud provider like Railway:

1. Push the `server/` directory to a GitHub repository.
2. Connect the repository to [Railway](https://railway.app).
3. Set the Environment Variable:
   *   `AUTH_TOKEN` = `your-secure-password`
4. Update URLs on your mobile app and web dashboard to use the public Railway domain (e.g. `wss://your-app.up.railway.app` and `https://your-app.up.railway.app`).

For detailed instructions, see [DEPLOY.md](file:///c:/political-demography-mobile/server/DEPLOY.md).

---

## 🔒 Security & Privacy Notice
*   **Authentication**: Connection is secured using the `AUTH_TOKEN`. Ensure you change the default token for any public deployments.
*   **Internal Mic Only**: The application is explicitly configured to record only from the phone's built-in microphone (bypassing Bluetooth/connected external devices).
*   **Background Notification**: Due to Android OS privacy restrictions, background audio recording requires a persistent system notification which cannot be hidden.
