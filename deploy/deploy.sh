#!/bin/sh
# Run on the droplet as root: update code, install prod deps, restart.
set -e
cd /opt/quadsort
git pull --ff-only
npm ci --omit=dev
chown -R quadsort:quadsort /opt/quadsort
systemctl restart quadsort
sleep 1
curl -fsS http://127.0.0.1:3000/healthz && echo " deployed"
