#!/bin/sh
set -e

# Clean up existing crontab
> /etc/crontabs/root

echo "${BACKUP_LOCAL_CRON:-0 */6 * * *} /app/backup.sh local >> /var/log/backup.log 2>&1" >> /etc/crontabs/root
echo "${BACKUP_GDRIVE_CRON:-0 3 * * *} /app/backup.sh gdrive >> /var/log/backup.log 2>&1" >> /etc/crontabs/root

touch /var/log/backup.log
echo "[$(date)] Starting crond..."
crond -b -l 8

exec tail -f /var/log/backup.log
