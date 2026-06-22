#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

echo "[legacy-check] validating runtime references"

if rg -n "services/web/app.py|services/web/base_routes.py|services/web/deploy.sh" \
  README.md deploy docs services/web/frontend services/web/backend \
  --glob '!docs/archive/**' --glob '!docs/superpowers/**'; then
  echo "[legacy-check] stale Flask/runtime references found"
  exit 1
fi

if rg -n "next\\.config|Next\\.js" \
  README.md deploy services/web/frontend \
  --glob '!docs/archive/**'; then
  echo "[legacy-check] stale Next.js references found"
  exit 1
fi

if rg -n "obsidian-web" \
  README.md deploy docs services/web/frontend services/web/backend \
  --glob '!docs/archive/**' --glob '!docs/superpowers/**' --glob '!docs/incidents/**'; then
  echo "[legacy-check] stale obsidian-web references found"
  exit 1
fi

if [ -e "services/web/frontend/next.config.mjs" ]; then
  echo "[legacy-check] next.config.mjs should not exist in active frontend"
  exit 1
fi

if [ -e "services/web/app.py" ] || [ -e "services/web/deploy.sh" ]; then
  echo "[legacy-check] legacy Flask runtime files remain in active path"
  exit 1
fi

if git ls-files '*__pycache__*' '*.pyc' | grep -q .; then
  echo "[legacy-check] tracked Python cache artifacts found"
  exit 1
fi

echo "[legacy-check] OK"
