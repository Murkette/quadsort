# One-time droplet setup (Ubuntu 24.04, 1 vCPU / 1 GB)

Point `quadsort.com` and `www` A records at the droplet first, so Caddy can get a certificate.

```bash
# 1 GB swap so npm never OOMs
fallocate -l 1G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# packages
apt update && apt install -y caddy sqlite3 git build-essential python3
curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt install -y nodejs

# app
adduser --system --group --home /opt/quadsort quadsort
git clone https://github.com/Murkette/quadsort.git /opt/quadsort
mkdir -p /var/lib/quadsort && chown quadsort:quadsort /var/lib/quadsort
cp /opt/quadsort/deploy/quadsort.service /etc/systemd/system/
cp /opt/quadsort/deploy/Caddyfile /etc/caddy/Caddyfile
cp /opt/quadsort/deploy/backup.sh /etc/cron.daily/quadsort-backup && chmod +x /etc/cron.daily/quadsort-backup
sh /opt/quadsort/deploy/deploy.sh      # npm ci + restart
systemctl enable quadsort && systemctl reload caddy

# firewall: ssh + web only
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw --force enable
```

Every later release: `ssh root@droplet sh /opt/quadsort/deploy/deploy.sh`
