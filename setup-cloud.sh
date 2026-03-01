#!/bin/bash
# ─────────────────────────────────────────────────────────────────────
# HomeCast — Oracle Cloud VM Setup Script
# Run this on a fresh Ubuntu 22.04+ VM (Oracle Cloud Free Tier)
#
# Usage:
#   chmod +x setup-cloud.sh
#   sudo ./setup-cloud.sh YOUR_DOMAIN
#
# Example:
#   sudo ./setup-cloud.sh homecast.duckdns.org
# ─────────────────────────────────────────────────────────────────────

set -e

DOMAIN="${1:?Usage: sudo ./setup-cloud.sh YOUR_DOMAIN}"
APP_DIR="/opt/homecast"

echo ""
echo "🏠 HomeCast Cloud Setup"
echo "   Domain: $DOMAIN"
echo ""

# ── 1. System packages ──────────────────────────────────────────────
echo "▶ Installing system packages..."
apt-get update -y
apt-get install -y curl git coturn

# ── 2. Node.js 18 ───────────────────────────────────────────────────
if ! command -v node &> /dev/null || [[ $(node -v | cut -d. -f1 | tr -d v) -lt 18 ]]; then
  echo "▶ Installing Node.js 18..."
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi
echo "  Node: $(node -v)"

# ── 3. Caddy (auto HTTPS) ───────────────────────────────────────────
if ! command -v caddy &> /dev/null; then
  echo "▶ Installing Caddy..."
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | tee /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y
  apt-get install -y caddy
fi

# ── 4. Clone / update HomeCast ──────────────────────────────────────
if [ -d "$APP_DIR" ]; then
  echo "▶ Updating HomeCast..."
  cd "$APP_DIR" && git pull
else
  echo "▶ Cloning HomeCast..."
  git clone https://github.com/apon12934/HomeCast.git "$APP_DIR"
fi

cd "$APP_DIR"
npm install --production

# ── 5. Generate TURN credentials ────────────────────────────────────
TURN_USER="homecast"
TURN_PASS=$(openssl rand -hex 16)
echo "▶ TURN credentials: $TURN_USER / $TURN_PASS"

# Get public IP
PUBLIC_IP=$(curl -s https://api.ipify.org)
echo "  Public IP: $PUBLIC_IP"

# ── 6. Configure coturn (TURN server) ───────────────────────────────
echo "▶ Configuring coturn..."
cat > /etc/turnserver.conf <<EOF
# HomeCast TURN server
listening-port=3478
tls-listening-port=5349
realm=$DOMAIN
server-name=$DOMAIN
fingerprint
lt-cred-mech
user=$TURN_USER:$TURN_PASS
total-quota=100
stale-nonce=600
no-multicast-peers
# Use the public IP
external-ip=$PUBLIC_IP
EOF

# Enable and start coturn
sed -i 's/^#TURNSERVER_ENABLED=1/TURNSERVER_ENABLED=1/' /etc/default/coturn 2>/dev/null || true
systemctl enable coturn
systemctl restart coturn

# ── 7. Configure Caddy (reverse proxy + auto HTTPS) ─────────────────
echo "▶ Configuring Caddy..."
cat > /etc/caddy/Caddyfile <<EOF
$DOMAIN {
    reverse_proxy localhost:3000
}
EOF

systemctl enable caddy
systemctl restart caddy

# ── 8. Create HomeCast systemd service ───────────────────────────────
echo "▶ Creating systemd service..."
cat > /etc/systemd/system/homecast.service <<EOF
[Unit]
Description=HomeCast CCTV Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
Environment=MODE=remote
Environment=PORT=3000
Environment=TURN_URL=turn:$PUBLIC_IP:3478
Environment=TURN_USER=$TURN_USER
Environment=TURN_PASS=$TURN_PASS
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable homecast
systemctl start homecast

# ── 9. Open firewall ports ───────────────────────────────────────────
echo "▶ Opening firewall ports..."
# iptables rules (Oracle Cloud Ubuntu images use iptables)
iptables -I INPUT -p tcp --dport 80 -j ACCEPT
iptables -I INPUT -p tcp --dport 443 -j ACCEPT
iptables -I INPUT -p tcp --dport 3478 -j ACCEPT
iptables -I INPUT -p udp --dport 3478 -j ACCEPT
iptables -I INPUT -p tcp --dport 5349 -j ACCEPT
iptables -I INPUT -p udp --dport 49152:65535 -j ACCEPT

# Save iptables rules
netfilter-persistent save 2>/dev/null || iptables-save > /etc/iptables.rules

echo ""
echo "════════════════════════════════════════════════════════════"
echo "  ✅ HomeCast is deployed!"
echo ""
echo "  🌐 URL:  https://$DOMAIN"
echo ""
echo "  TURN:    turn:$PUBLIC_IP:3478"
echo "  TURN user: $TURN_USER"
echo "  TURN pass: $TURN_PASS"
echo ""
echo "  Services:"
echo "    systemctl status homecast"
echo "    systemctl status caddy"
echo "    systemctl status coturn"
echo ""
echo "  ⚠  ALSO open these ports in Oracle Cloud Console:"
echo "     Security List → Ingress Rules:"
echo "     - TCP 80, 443 (HTTP/HTTPS)"
echo "     - TCP+UDP 3478, 5349 (TURN)"
echo "     - UDP 49152-65535 (TURN relay)"
echo "════════════════════════════════════════════════════════════"
