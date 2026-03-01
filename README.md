# 🏠 HomeCast

**Turn any phone into a security camera. Watch the live feed from any other device.**

A peer-to-peer CCTV web app powered by WebRTC — encrypted, real-time, and free.

[![Live Demo](https://img.shields.io/badge/🌐_Live_Demo-homecast--apn.onrender.com-22d3ee?style=for-the-badge)](https://homecast-apn.onrender.com)
![License](https://img.shields.io/badge/license-MIT-blue?style=flat-square)
![Node](https://img.shields.io/badge/node-16%2B-success?style=flat-square)

---

## Try It Now (No Install Needed)

HomeCast is hosted free at:

### 👉 **https://homecast-apn.onrender.com**

1. Open the link on **Device A** (phone) → tap **"Act as Camera"** → allow camera → note the **4-digit PIN**
2. Open the same link on **Device B** (laptop/phone) → tap **"Viewer Dashboard"** → enter the PIN → tap **Connect**
3. You're watching the live feed!

> **⚠️ Important:** Both devices must be on the **same Wi-Fi / hotspot network**. The video stream goes directly between the two devices (peer-to-peer), which requires them to be able to reach each other on the same local network.

> **💡 Tip:** If you're not on the same network, you can set up your own server — see [Self-Hosting](#self-hosting) below.

### Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `F` | Toggle fullscreen (camera or viewer screen) |
| `Enter` | Submit PIN on the viewer screen |

---

## Features

- **Camera Mode** — Stream your device's camera (720p, rear-facing preferred)
- **Viewer Mode** — Watch the live feed by entering a 4-digit PIN
- **Peer-to-peer** — Video goes directly between devices via WebRTC (DTLS-SRTP encrypted)
- **Self-hosted signaling** — Own PeerJS server, no external dependencies
- **Wake Lock** — Prevents the camera device from sleeping
- **Fullscreen mode** — On both camera and viewer (click button or press `F`)
- **Mobile-first dark UI** — Tailwind CSS, viewport-fitted, no scrolling
- **Stats overlay** — Resolution, FPS, elapsed time, viewer count
- **Google Sans typography** — Clean, modern font throughout

---

## How It Works

```
┌──────────┐    signaling     ┌──────────┐    signaling     ┌──────────┐
│  Camera  │ ──────────────►  │  Server  │  ◄────────────── │  Viewer  │
│ (phone)  │                  │ (PeerJS) │                  │ (laptop) │
└────┬─────┘                  └──────────┘                  └────┬─────┘
     │                                                           │
     │              direct peer-to-peer video stream             │
     └───────────────────────────────────────────────────────────┘
                         (WebRTC, encrypted)
```

1. **Camera** registers on the PeerJS signaling server with a random 4-digit PIN
2. **Viewer** connects to the camera's peer ID via a data channel
3. **Camera** calls the viewer back with the real video stream
4. Video flows **directly between devices** — the server never sees it

The server only handles the initial handshake (signaling). All video is end-to-end encrypted.

---

## Self-Hosting

Want to run your own HomeCast server? Two options:

### Option A — Local Network (Your PC)

Run it on your computer for devices on the same Wi-Fi.

#### Prerequisites

- **Node.js** v16+ (v18+ recommended)
- **mkcert** — for locally-trusted SSL certificates (browsers require HTTPS for camera access)

#### 1. Clone & install

```bash
git clone https://github.com/apon12934/HomeCast.git
cd HomeCast
npm install
```

#### 2. Generate SSL certificates

Install mkcert:

| OS | Command |
|----|---------|
| Windows | `winget install -e --id FiloSottile.mkcert` |
| macOS | `brew install mkcert` |
| Linux | `sudo apt install mkcert` |

Then:
```bash
mkcert -install
mkdir certs
mkcert -cert-file certs/cert.pem -key-file certs/key.pem localhost 127.0.0.1 YOUR_LOCAL_IP
```

> Replace `YOUR_LOCAL_IP` with your LAN IP (find it with `ipconfig` on Windows or `ip addr` on Linux/Mac), e.g. `192.168.1.100`.

#### 3. Start

```bash
npm start
```

```
🏠 HomeCast server running in LOCAL mode

  https://localhost:3000
  https://192.168.1.100:3000

  PeerJS signaling: /peerjs
```

#### 4. Use it

Open the **Network URL** (e.g. `https://192.168.1.100:3000`) on both devices.

> **⚠️ Both devices must be on the same Wi-Fi / LAN network.** The video stream is peer-to-peer and requires local network connectivity.

---

### Option B — Render.com (Free Internet Hosting)

Deploy to the cloud so anyone can access it. No credit card needed.

1. Push this repo to your GitHub
2. Go to [render.com](https://render.com) → sign up with GitHub
3. Click **"New +" → "Web Service"** → connect your HomeCast repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
   - **Instance Type:** Free
5. Add environment variable: `MODE` = `remote`
6. Click **"Create Web Service"** — deployed in ~2 min

Your URL will be `https://your-app.onrender.com`. The server includes a self-ping keep-alive to prevent Render's free tier from sleeping.

> **Note:** Render doesn't support TURN servers, so both devices need to be on the same network for the peer-to-peer video stream. For most home/mobile use, this works perfectly.

---

### Option C — VPS with TURN Server (Advanced)

For full cross-network support (viewer and camera on different networks), deploy on a VPS with a TURN relay server.

A `setup-cloud.sh` script is included for automated deployment on Ubuntu VMs (Oracle Cloud, Azure, AWS, etc.):

```bash
sudo ./setup-cloud.sh your-domain.duckdns.org
```

This installs Node.js, Caddy (auto HTTPS), and coturn (TURN relay), and sets up everything as systemd services.

See the script source for details.

---

## Project Structure

```
HomeCast/
├── public/
│   ├── index.html        # UI — Tailwind CSS dark theme
│   └── app.js            # Client logic — PeerJS / WebRTC
├── server.js             # Express + PeerJS signaling + keep-alive
├── render.yaml           # Render.com blueprint (one-click deploy)
├── setup-cloud.sh        # VPS deployment automation
├── package.json
├── .gitignore
└── README.md
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODE` | `local` | `local` = HTTPS with mkcert · `remote` = HTTP (behind reverse proxy) |
| `PORT` | `3000` | Server port (Render sets this automatically) |
| `TURN_URL` | — | TURN server URL, e.g. `turn:1.2.3.4:3478` |
| `TURN_USER` | — | TURN username |
| `TURN_PASS` | — | TURN credential |

## Security

- **End-to-end encrypted** — WebRTC uses DTLS-SRTP. The server never touches your video.
- **Signaling only** — The server is a matchmaker. Video flows directly between peers.
- **No accounts, no tracking** — No login, no cookies, no analytics.
- **Open source** — Read every line of code yourself.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Tailwind CSS · Google Sans · PeerJS client |
| Backend | Node.js · Express · PeerJS server |
| Streaming | WebRTC (peer-to-peer) |
| Hosting | Render.com (free tier) |

---

## License

MIT — free to use, modify, and distribute.

Built by [@apon12934](https://github.com/apon12934)
