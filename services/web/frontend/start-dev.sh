#!/bin/sh
set -eu

APP_ROOT="/app"
LOCKFILE="$APP_ROOT/package-lock.json"
STAMPFILE="$APP_ROOT/node_modules/.package-lock.hash"

current_hash="$(sha256sum "$LOCKFILE" | awk '{print $1}')"
installed_hash=""

if [ -f "$STAMPFILE" ]; then
  installed_hash="$(cat "$STAMPFILE")"
fi

if [ ! -x "$APP_ROOT/node_modules/.bin/vite" ] || [ ! -d "$APP_ROOT/node_modules/pixi.js" ] || [ "$current_hash" != "$installed_hash" ]; then
  echo "▶ Syncing frontend dependencies..."
  npm install --include=dev --ignore-scripts
  printf '%s' "$current_hash" > "$STAMPFILE"
fi

exec npm run dev -- --host 0.0.0.0 --port 3000 --strictPort
