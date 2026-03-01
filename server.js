const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');
const express = require('express');
const os    = require('os');
const { ExpressPeerServer } = require('peer');

/* ------------------------------------------------------------------ */
/*  Configuration (env vars or defaults)                                */
/* ------------------------------------------------------------------ */
const MODE = process.env.MODE || 'local';          // 'local' or 'remote'
const PORT = Number(process.env.PORT) || 3000;

// TURN server (needed for internet / cross-NAT WebRTC)
const TURN_URL    = process.env.TURN_URL    || '';  // e.g. turn:YOUR_IP:3478
const TURN_USER   = process.env.TURN_USER   || '';
const TURN_PASS   = process.env.TURN_PASS   || '';

const app = express();

/* ------------------------------------------------------------------ */
/*  API: /api/config – tells the frontend how to connect               */
/* ------------------------------------------------------------------ */
app.get('/api/config', (_req, res) => {
  const iceServers = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  if (TURN_URL) {
    iceServers.push({
      urls: TURN_URL,
      username: TURN_USER,
      credential: TURN_PASS,
    });
  }
  res.json({
    mode: MODE,
    iceServers,
  });
});

/* ------------------------------------------------------------------ */
/*  Keep-alive (prevents Render free tier from sleeping)              */
/* ------------------------------------------------------------------ */
app.get('/api/health', (_req, res) => res.json({ status: 'ok', uptime: process.uptime() }));

if (MODE === 'remote') {
  const PING_INTERVAL = 14 * 60 * 1000; // 14 minutes
  setInterval(() => {
    const url = `http://localhost:${PORT}/api/health`;
    http.get(url, (res) => {
      res.resume();
      console.log(`  [keep-alive] pinged at ${new Date().toISOString()}`);
    }).on('error', () => {});
  }, PING_INTERVAL);
  console.log('  [keep-alive] self-ping every 14 min (Render anti-sleep)');
}

// Serve static files from /public
app.use(express.static(path.join(__dirname, 'public')));

/* ------------------------------------------------------------------ */
/*  Create server (HTTPS for local, HTTP for remote behind Caddy)      */
/* ------------------------------------------------------------------ */
let server;
if (MODE === 'local') {
  const sslOptions = {
    key:  fs.readFileSync(path.join(__dirname, 'certs', 'key.pem')),
    cert: fs.readFileSync(path.join(__dirname, 'certs', 'cert.pem')),
  };
  server = https.createServer(sslOptions, app);
} else {
  // Remote mode: plain HTTP — Caddy handles SSL termination
  server = http.createServer(app);
}

/* ------------------------------------------------------------------ */
/*  PeerJS signaling server                                             */
/* ------------------------------------------------------------------ */
const peerServer = ExpressPeerServer(server, {
  debug: true,
  path: '/',
  allow_discovery: false,
});
app.use('/peerjs', peerServer);

peerServer.on('connection', (client) => {
  console.log(`  [PeerJS] peer connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
  console.log(`  [PeerJS] peer disconnected: ${client.getId()}`);
});

/* ------------------------------------------------------------------ */
/*  Start                                                               */
/* ------------------------------------------------------------------ */
server.listen(PORT, '0.0.0.0', () => {
  const proto = MODE === 'local' ? 'https' : 'http';
  console.log(`\n🏠 HomeCast server running in ${MODE.toUpperCase()} mode\n`);
  console.log(`  ${proto}://localhost:${PORT}`);

  if (MODE === 'local') {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`  ${proto}://${iface.address}:${PORT}`);
        }
      }
    }
  }

  if (TURN_URL) {
    console.log(`\n  TURN: ${TURN_URL}`);
  } else if (MODE === 'remote') {
    console.log('\n  ⚠  No TURN server configured — cross-NAT calls may fail.');
    console.log('     Set TURN_URL, TURN_USER, TURN_PASS env vars.');
  }

  console.log(`\n  PeerJS signaling: /peerjs\n`);
});
