# 🏠 HomeCast

A **local network CCTV** web app that turns any phone/laptop into a security camera and lets you watch the live feed from another device on the same network — all running on your own machine, no cloud required.

Built with **Node.js**, **Express**, **PeerJS (WebRTC)**, and **Tailwind CSS**.

![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- **Camera Mode** — Stream your device's camera (720p, rear-facing preferred)
- **Viewer Mode** — Watch the live feed by entering a 4-digit PIN
- **Peer-to-peer** — Video streams directly between devices via WebRTC (end-to-end encrypted)
- **Self-hosted signaling** — No dependency on external PeerJS cloud servers
- **HTTPS with local certificates** — Required for camera access on modern browsers
- **Wake Lock** — Prevents the camera device from sleeping
- **Fullscreen mode** — On both camera and viewer
- **Mobile-optimized** — Dark UI, fits viewport, no scrolling
- **Stats overlay** — Resolution, FPS, elapsed time, viewer count

---

## Prerequisites

- **Node.js** v16+ (v18+ recommended)
- **mkcert** — for generating locally-trusted SSL certificates

---

## Quick Start

### 1. Clone & install

```bash
git clone https://github.com/apon12934/HomeCast.git
cd HomeCast
npm install
```

### 2. Install mkcert & generate certificates

**Windows:**
```bash
winget install -e --id FiloSottile.mkcert
```

**macOS:**
```bash
brew install mkcert
```

**Linux:**
```bash
sudo apt install mkcert   # or see https://github.com/FiloSottile/mkcert#installation
```

Then set up the local CA (you may need to accept a system prompt):
```bash
mkcert -install
```

Generate certificates (replace `YOUR_LOCAL_IP` with your machine's LAN IP, e.g. `192.168.1.100`):
```bash
mkdir certs
mkcert -cert-file certs/cert.pem -key-file certs/key.pem localhost 127.0.0.1 YOUR_LOCAL_IP
```

> **Tip:** Find your local IP with `ipconfig` (Windows) or `ifconfig` / `ip addr` (Mac/Linux).

### 3. Start the server

```bash
node server.js
```

You'll see output like:
```
🏠 HomeCast HTTPS Server is running!

  Local:   https://localhost:3000
  Network: https://192.168.1.100:3000

  PeerJS signaling: /peerjs
```

### 4. Use it

1. Open the **Network URL** on **Device A** (phone) → tap **"Act as Camera"** → grant camera permission → note the 4-digit PIN
2. Open the same URL on **Device B** (laptop/phone) → tap **"Viewer Dashboard"** → enter the PIN → tap **Connect**

Both devices must be on the **same local network** (Wi-Fi/LAN).

---

## Project Structure

```
HomeCast/
├── certs/              # Generated SSL certs (git-ignored)
│   ├── cert.pem
│   └── key.pem
├── public/             # Static frontend
│   ├── index.html      # UI (Tailwind CSS)
│   └── app.js          # Client-side logic (PeerJS/WebRTC)
├── server.js           # HTTPS Express + PeerJS signaling server
├── package.json
└── .gitignore
```

---

## Security Notes

- **LAN only** — The server binds to `0.0.0.0` but is only reachable within your local network (unless you explicitly port-forward, which you shouldn't).
- **End-to-end encrypted** — WebRTC streams use DTLS-SRTP encryption between peers. The server only handles signaling (peer discovery), never the video data.
- **No cloud** — Everything stays on your network. No data leaves your LAN.
- **mkcert certs are local** — They are signed by a CA that only your machine trusts. Other users must generate their own certs.

---

## License

MIT — free to use, modify, and distribute.
