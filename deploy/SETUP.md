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
cat > /etc/quadsort.env <<'ENV'
RESEND_API_KEY=paste-your-key-here
MAIL_FROM=Quadsort <hello@quadsort.com>
ENV
chmod 600 /etc/quadsort.env   # secrets live here only: never in git, never in the code
cp /opt/quadsort/deploy/quadsort.service /etc/systemd/system/
cp /opt/quadsort/deploy/Caddyfile /etc/caddy/Caddyfile
cp /opt/quadsort/deploy/backup.sh /etc/cron.daily/quadsort-backup && chmod +x /etc/cron.daily/quadsort-backup
sh /opt/quadsort/deploy/deploy.sh      # npm ci + restart
systemctl enable quadsort && systemctl reload caddy

# firewall: ssh + web only
ufw allow OpenSSH && ufw allow 80,443/tcp && ufw --force enable
```

## Email (Resend)

Password reset is the only email the site sends. In Resend, add and verify the domain `quadsort.com` (Domains, then Add). Resend shows a few DNS records, usually SPF and DKIM, to add wherever the domain's DNS is managed. Until the domain shows as verified, Resend only lets `onboarding@resend.dev` send, and only to your own address, so real users would never get the email.

Without `RESEND_API_KEY` the site still runs. In production a reset request logs a clear error and the visitor sees the normal "check your inbox" message. Check the logs with `journalctl -u quadsort -e` if emails do not arrive.

## Share previews

In production the site pins its address to `https://quadsort.com` for canonical links and share images, so nothing needs configuring. To run it under another address (a staging box), set `SITE_URL=https://staging.example` in `/etc/quadsort.env`.

After the first deploy, paste a puzzle link into each platform's preview checker to confirm the card appears, since they cache what they first see:
the Facebook Sharing Debugger, the LinkedIn Post Inspector, and the X card validator. WhatsApp, iMessage, Slack and Discord pick it up with no setup.

The share image is `public/og.png`. It is rendered from `design/assets.html` (instructions inside).

## Making yourself an admin

Sign up on the site first, then on the droplet:

```bash
sudo -u quadsort env DB_PATH=/var/lib/quadsort/quadsort.db node /opt/quadsort/scripts/make-admin.js yourusername
```

Admin lives at `/admin`. It is a 404 to everyone else. Add `--remove` to take the rights away again.

Every later release: `ssh root@droplet sh /opt/quadsort/deploy/deploy.sh`
