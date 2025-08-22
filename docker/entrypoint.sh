#!/bin/sh
set -e

# Check required environment variables
if [ -z "${APPFLOWY_BASE_URL}" ]; then
  echo "ERROR: APPFLOWY_BASE_URL environment variable is required but not set"
  echo "Please set APPFLOWY_BASE_URL to your AppFlowy backend URL (e.g., https://your-backend.example.com)"
  exit 1
fi

if [ -z "${APPFLOWY_GOTRUE_BASE_URL}" ]; then
  echo "ERROR: APPFLOWY_GOTRUE_BASE_URL environment variable is required but not set"
  echo "Please set APPFLOWY_GOTRUE_BASE_URL to your GoTrue authentication service URL (e.g., https://your-backend.example.com/gotrue)"
  exit 1
fi

if [ -z "${APPFLOWY_WS_BASE_URL}" ]; then
  echo "ERROR: APPFLOWY_WS_BASE_URL environment variable is required but not set"
  echo "Please set APPFLOWY_WS_BASE_URL to your WebSocket URL (e.g., wss://your-backend.example.com/ws/v2)"
  exit 1
fi

# Create inline config script
CONFIG_SCRIPT="<script>window.__APP_CONFIG__={APPFLOWY_BASE_URL:'${APPFLOWY_BASE_URL}',APPFLOWY_GOTRUE_BASE_URL:'${APPFLOWY_GOTRUE_BASE_URL}',APPFLOWY_WS_BASE_URL:'${APPFLOWY_WS_BASE_URL}'};</script>"

# Inject the config script into index.html right before </head>
sed -i "s|</head>|${CONFIG_SCRIPT}</head>|g" /usr/share/nginx/html/index.html

echo "Runtime configuration injected:"
echo "  APPFLOWY_BASE_URL: ${APPFLOWY_BASE_URL}"
echo "  APPFLOWY_GOTRUE_BASE_URL: ${APPFLOWY_GOTRUE_BASE_URL}"
echo "  APPFLOWY_WS_BASE_URL: ${APPFLOWY_WS_BASE_URL}"

# Start nginx
exec nginx -g 'daemon off;'