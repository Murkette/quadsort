#!/bin/sh
# Daily cron: consistent SQLite snapshot, keep 14.
set -e
mkdir -p /var/backups/quadsort
sqlite3 /var/lib/quadsort/quadsort.db ".backup /var/backups/quadsort/$(date +%F).db"
ls -1t /var/backups/quadsort/*.db | tail -n +15 | xargs -r rm --
