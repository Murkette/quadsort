#!/bin/sh
# Run on the droplet as root: update code, install prod deps, restart. Git and npm run as the
# app user, so /opt/quadsort stays owned by it and root never leaves files behind.
set -e
cd /opt/quadsort
sudo -u quadsort git pull --ff-only
sudo -u quadsort npm ci --omit=dev
systemctl restart quadsort
sleep 1
curl -fsS http://127.0.0.1:3000/healthz && echo " deployed"
