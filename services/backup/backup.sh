#!/bin/sh
MODE=$1
DATE=$(date +%Y%m%d%H%M%S)

BACKUP_LOCAL_DIR=${BACKUP_LOCAL_DIR:-/backups/obsidian-vault}
BACKUP_SOURCE_DIR=${BACKUP_SOURCE_DIR:-/vault}
BACKUP_RETENTION_BYTES=${BACKUP_RETENTION_BYTES:-1073741824}

if [ ! -d "$BACKUP_LOCAL_DIR" ]; then
  mkdir -p "$BACKUP_LOCAL_DIR"
fi

echo "[$(date)] Backup Job Started (MODE: $MODE)"

if [ "$MODE" = "local" ] || [ "$MODE" = "both" ]; then
    echo "[$(date)] Starting local backup..."
    ARCHIVE_PATH="$BACKUP_LOCAL_DIR/vault_${DATE}.tar.gz"
    
    tar -czf "$ARCHIVE_PATH" \
        --exclude=".git" \
        --exclude=".obsidian" \
        --exclude=".obsidian-web-trash" \
        --exclude=".obsidian-web-versions" \
        -C "$BACKUP_SOURCE_DIR" .
        
    echo "[$(date)] Local backup created: $ARCHIVE_PATH"
    
    CURRENT_SIZE=$(du -sb "$BACKUP_LOCAL_DIR" | awk '{print $1}')
    if [ -z "$CURRENT_SIZE" ]; then CURRENT_SIZE=0; fi
    
    while [ "$CURRENT_SIZE" -gt "$BACKUP_RETENTION_BYTES" ]; do
        OLDEST_FILE=$(ls -tr "$BACKUP_LOCAL_DIR"/*.tar.gz 2>/dev/null | head -n 1)
        if [ -z "$OLDEST_FILE" ]; then
            break
        fi
        echo "[$(date)] Removing oldest backup $OLDEST_FILE due to retention policy..."
        rm -f "$OLDEST_FILE"
        CURRENT_SIZE=$(du -sb "$BACKUP_LOCAL_DIR" | awk '{print $1}')
    done
fi

if [ "$MODE" = "gdrive" ] || [ "$MODE" = "both" ]; then
    echo "[$(date)] Starting GDrive backup..."
    LATEST_ARCHIVE=$(ls -t "$BACKUP_LOCAL_DIR"/*.tar.gz 2>/dev/null | head -n 1)
    if [ -n "$LATEST_ARCHIVE" ] && [ -n "$RCLONE_REMOTE_NAME" ]; then
        rclone copy "$LATEST_ARCHIVE" "$RCLONE_REMOTE_NAME:$RCLONE_REMOTE_PATH"
        echo "[$(date)] Uploaded to GDrive: $LATEST_ARCHIVE"
    else
        echo "[$(date)] Skip GDrive backup (no local archive or rclone remote not set)"
    fi
fi
echo "[$(date)] Backup Job Finished"
