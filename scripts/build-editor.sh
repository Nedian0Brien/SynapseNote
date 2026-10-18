#!/bin/bash
# builds the editor web bundle into App/Resources/Editor, run by the Xcode build before resources are copied
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
WEB="$ROOT/web"
OUT="$ROOT/App/Resources/Editor"
STAMP="$OUT/.build-stamp"

# Xcode runs scripts with a minimal PATH, so look where node is usually installed
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.volta/bin:$PATH"
if ! command -v node >/dev/null 2>&1; then
  echo "error: node is required to build the editor bundle (https://nodejs.org, 20.19 or newer)" >&2
  exit 1
fi

if [ ! -f "$WEB/vendor/morrow/package.json" ]; then
  echo "error: web/vendor/morrow is missing, run: git submodule update --init" >&2
  exit 1
fi

if [ ! -d "$WEB/node_modules" ]; then
  npm --prefix "$WEB" ci --no-audit --no-fund
fi

# rebuild only when a source file is newer than the last build
if [ -f "$STAMP" ] && [ -z "$(find "$WEB/src" "$WEB/scripts" "$WEB/index.html" "$WEB/vite.config.ts" "$WEB/package-lock.json" "$WEB/vendor/morrow/src" -newer "$STAMP" -print -quit)" ]; then
  echo "editor bundle is up to date"
  exit 0
fi

npm --prefix "$WEB" run build
touch "$STAMP"
