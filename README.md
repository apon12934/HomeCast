# 🏠 HomeCast

A **peer-to-peer CCTV** web app that turns any phone or laptop into a security camera. Watch the live feed from any other device — on your local network or over the internet.

Built with **Node.js**, **Express**, **PeerJS (WebRTC)**, and **Tailwind CSS**.

![License](https://img.shields.io/badge/license-MIT-blue)

---

## Features

- **Camera Mode** — Stream your device's camera (720p, rear-facing preferred)
- **Viewer Mode** — Watch the live feed by entering a 4-digit PIN
- **Peer-to-peer** — Video streams directly between devices via WebRTC (DTLS-SRTP encrypted)
- **Self-hosted signaling** — No dependency on external PeerJS cloud servers
- **Two deployment modes** — Local network (HTTPS + mkcert) or Internet (HTTP behind Caddy)
- **TURN relay** — Optional coturn integration for cross-NAT internet connections
- **Wake Lock** — Prevents the camera device from sleeping
- **Fullscreen mode** — On both camera and viewer
- **Mobile-optimized** — Dark UI, viewport-fitted, no scrolling
- **Stats overlay** — Resolution, FPS, elapsed time, viewer count

---

## Option A — Local Network (LAN only)

Use this when all devices are on the same Wi-Fi / LAN. Your PC runs the server.

### Prerequisites

- **Node.js** v16+ (v18+ recommended)
- **mkcert** — for generating locally-trusted SSL certificates

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

Set up the local CA (you may need to accept a system prompt):
```bash
mkcert -install
```

Generate certificates (replace `YOUR_LOCAL_IP` with your LAN IP, e.g. `192.168.1.100`):
```bash
mkdir certs
mkcert -cert-file certs/cert.pem -key-file certs/key.pem localhost 127.0.0.1 YOUR_LOCAL_IP
```

> **Tip:** Find your local IP with `ipconfig` (Windows) or `ifconfig` / `ip addr` (Mac/Linux).

### 3. Start the server

```bash
npm start
```

Output:
```
🏠 HomeCast server running in LOCAL mode

  https://localhost:3000
  https://192.168.1.100:3000

  PeerJS signaling: /peerjs
```

### 4. Use it

1. Open the **Network URL** on **Device A** (phone) → **"Act as Camera"** → grant camera → note the 4-digit PIN
2. Open the same URL on **Device B** → **"Viewer Dashboard"** → enter PIN → **Connect**

Both devices must be on the **same network**.

---

## Option B — Internet Access (Free, Zero Budget)

Access HomeCast from **anywhere in the world** using a free Oracle Cloud VM. No PC needs to stay on.

| Component | Cost | Purpose |
|-----------|------|---------|
| [Oracle Cloud Free Tier](https://www.oracle.com/cloud/free/) | $0 forever | 2 AMD VMs (1 GB RAM each) |
| [DuckDNS](https://www.duckdns.org/) | $0 | Free subdomain → VM public IP |
| [Caddy](https://caddyserver.com/) | $0 (open source) | Reverse proxy + auto HTTPS (Let's Encrypt) |
| [coturn](https://github.com/coturn/coturn) | $0 (open source) | TURN relay for NAT traversal |

### Step 1 — Create Oracle Cloud account

1. Go to <https://www.oracle.com/cloud/free/> and sign up (credit card required for verification — **you will never be charged** on the Always Free tier).
2. Choose a **Home Region** close to you (e.g. `US East (Ashburn)`, `UK South (London)`, `AP Mumbai`).
3. Wait for account activation (~2 min).

### Step 2 — Create a free VM

1. In the Oracle Cloud Console → **Compute → Instances → Create Instance**
2. Set the shape to **VM.Standard.E2.1.Micro** (Always Free eligible)
3. Image: **Ubuntu 22.04** (Canonical)
4. Under **Add SSH keys**, either generate a key pair (download the private key!) or paste your existing public key
5. Click **Create** — wait for status to turn **RUNNING**
6. Note the **Public IP** address

### Step 3 — Register a free domain

1. Go to <https://www.duckdns.org/> and sign in (Google/GitHub)
2. Create a subdomain (e.g. `homecast-yours`) — this gives you `homecast-yours.duckdns.org`
3. Set the IP to your **VM's Public IP** from Step 2
4. Click **Update**

### Step 4 — Open firewall ports in Oracle Console

In the Oracle Cloud Console:

1. Go to **Networking → Virtual Cloud Networks** → click your VCN → **Security Lists** → **Default Security List**
2. Add these **Ingress Rules**:

| Source CIDR | Protocol | Dest Port | Description |
|-------------|----------|-----------|-------------|
| `0.0.0.0/0` | TCP | 80 | HTTP (Caddy redirect) |
| `0.0.0.0/0` | TCP | 443 | HTTPS (Caddy) |
| `0.0.0.0/0` | TCP | 3478 | TURN (coturn TCP) |
| `0.0.0.0/0` | UDP | 3478 | TURN (coturn UDP) |
| `0.0.0.0/0` | TCP | 5349 | TURN TLS |
| `0.0.0.0/0` | UDP | 49152-65535 | TURN relay range |

### Step 5 — Deploy HomeCast on the VM

SSH into your VM:
```bash
ssh -i /path/to/your-key ubuntu@YOUR_VM_PUBLIC_IP
```

Download and run the setup script:
```bash
git clone https://github.com/apon12934/HomeCast.git
cd HomeCast
chmod +x setup-cloud.sh
sudo ./setup-cloud.sh homecast-yours.duckdns.org
```

Replace `homecast-yours.duckdns.org` with your actual DuckDNS domain.

The script will:
- Install Node.js 18, Caddy, and coturn
- Clone/update the HomeCast repo to `/opt/homecast`
- Configure coturn with auto-generated TURN credentials
- Set up Caddy as a reverse proxy with automatic HTTPS
- Create a `homecast` systemd service that starts on boot
- Open OS-level firewall ports (iptables)

When done, you'll see:
```
  ✅ HomeCast is deployed!

  🌐 URL:  https://homecast-yours.duckdns.org
```

### Step 6 — Use it from anywhere

1. Open `https://homecast-yours.duckdns.org` on any phone → **Act as Camera**
2. Open the same URL on any other device, anywhere in the world → **Viewer Dashboard** → enter PIN

Done! The VM runs 24/7 for free and auto-restarts on reboot.

### Managing the server

```bash
# Check status
sudo systemctl status homecast

# View logs
sudo journalctl -u homecast -f

# Restart
sudo systemctl restart homecast

# Update to latest code
cd /opt/homecast && sudo git pull && sudo npm install --production
sudo systemctl restart homecast
```

---

## Project Structure

```
HomeCast/
├── certs/              # Local SSL certs (git-ignored)
│   ├── cert.pem
│   └── key.pem
├── public/             # Static frontend
│   ├── index.html      # UI (Tailwind CSS)
│   └── app.js          # Client logic (PeerJS / WebRTC)
├── server.js           # Express + PeerJS signaling (local or remote mode)
├── setup-cloud.sh      # One-command Oracle Cloud VM deployment
├── package.json
├── .gitignore
└── README.md
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MODE` | `local` | `local` = HTTPS with mkcert certs, `remote` = HTTP behind Caddy |
| `PORT` | `3000` | Server port |
| `TURN_URL` | *(empty)* | TURN server URL, e.g. `turn:1.2.3.4:3478` |
| `TURN_USER` | *(empty)* | TURN username |
| `TURN_PASS` | *(empty)* | TURN password/credential |

---

## Security Notes

- **End-to-end encrypted** — WebRTC streams use DTLS-SRTP encryption. The server only handles signaling, never the video.
- **Signaling server only** — No video data passes through the server. Peers connect directly (or via TURN relay when needed).
- **mkcert certs are local** — They are signed by a CA only your machine trusts. Each user generates their own.
- **TURN credentials** — The setup script generates random credentials. They are stored in the systemd service file on the VM.

---

## License

MIT — free to use, modify, and distribute.
