# MicNet Server — Railway Deployment

## Quick Deploy

[![Deploy on Railway](https://railway.app/button.svg)](https://railway.app/new/template)

## Manual Steps

1. **Create a GitHub repo** and push the `server/` folder to it:
   ```bash
   # From c:\political-demography-mobile\server
   git init
   git add .
   git commit -m "MicNet server"
   git remote add origin https://github.com/YOUR_USER/micnet-server.git
   git push -u origin main
   ```

2. **Deploy on Railway:**
   - Go to [railway.app](https://railway.app)
   - Click "New Project" → "Deploy from GitHub repo"
   - Select your repo
   - Railway auto-detects Node.js

3. **Set Environment Variables** in Railway dashboard:
   | Variable | Value | Notes |
   |----------|-------|-------|
   | `AUTH_TOKEN` | `your-secret-password` | **Required** — change this! |
   | `PORT` | (auto-set by Railway) | Do not set manually |

4. **Get your public URL** from Railway dashboard (e.g. `https://micnet-abc123.up.railway.app`)

5. **Configure the mobile app:**
   - Open Settings tab
   - WS URL: `wss://micnet-abc123.up.railway.app`
   - HTTP URL: `https://micnet-abc123.up.railway.app`
   - Auth Token: `your-secret-password`

6. **Open the web dashboard:**
   - Go to `https://micnet-abc123.up.railway.app`
   - Enter same Auth Token, WS URL (`wss://...`), HTTP URL (`https://...`)

## Alternative: Render.com

1. Go to [render.com](https://render.com)
2. New Web Service → connect GitHub repo
3. Build command: `npm install`
4. Start command: `node server.js`
5. Add env var: `AUTH_TOKEN=your-secret`
6. Free tier available (spins down after 15min inactivity)

## Local Testing (Same Network)

```powershell
# Start server
cd c:\political-demography-mobile\server
$env:AUTH_TOKEN="mypassword"
node server.js

# Find your IP
ipconfig | Select-String "IPv4"
# Example: 192.168.1.100

# Mobile app settings:
# WS URL:   ws://192.168.1.100:3001
# HTTP URL: http://192.168.1.100:3001
# Token:    mypassword
```
