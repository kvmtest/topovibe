#!/bin/bash
# TopoVibe — AWS Lightsail plan-C bootstrap (paste into "Launch script" when
# creating a Lightsail instance, Amazon Linux 2023 blueprint).
# AFTER boot: edit /home/ec2-user/topovibe/.env and insert your QLOO_API_KEY,
# then: cd /home/ec2-user/topovibe && sudo systemctl restart topovibe
set -e

# Node.js 22
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs git

# App
cd /home/ec2-user
git clone https://github.com/kvmtest/topovibe.git
cd topovibe
npm install
npm run build

# Environment — paste your key here (or edit .env later and restart)
cat > .env <<'EOF'
QLOO_API_KEY=PASTE_YOUR_HACKATHON_KEY_HERE
QLOO_BASE_URL=https://hackathon.api.qloo.com
PORT=4173
DEMO_CITIES=Austin,New York City,Tokyo
EOF
chmod 600 .env
chown -R ec2-user:ec2-user /home/ec2-user/topovibe

# systemd service
cat > /etc/systemd/system/topovibe.service <<'EOF'
[Unit]
Description=TopoVibe — cultural-intelligence globe & MCP oracle
After=network.target

[Service]
Type=simple
User=ec2-user
WorkingDirectory=/home/ec2-user/topovibe
ExecStart=/usr/bin/npm start
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now topovibe

# Open the port (Lightsail firewall: also open 4173 in the console Networking tab)
echo "TopoVibe bootstrap done. Open port 4173 in the Lightsail Networking tab."
