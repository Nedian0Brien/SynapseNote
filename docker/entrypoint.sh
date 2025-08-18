#!/bin/sh
set -e

# Check required environment variables
if [ -z "${AF_BASE_URL}" ]; then
  echo "ERROR: AF_BASE_URL environment variable is required but not set"
  echo "Please set AF_BASE_URL to your AppFlowy backend URL (e.g., https://your-backend.example.com)"
  exit 1
fi

if [ -z "${AF_GOTRUE_URL}" ]; then
  echo "ERROR: AF_GOTRUE_URL environment variable is required but not set"
  echo "Please set AF_GOTRUE_URL to your GoTrue authentication service URL (e.g., https://your-backend.example.com/gotrue)"
  exit 1
fi

if [ -z "${AF_WS_V2_URL}" ]; then
  echo "ERROR: AF_WS_V2_URL environment variable is required but not set"
  echo "Please set AF_WS_V2_URL to your WebSocket v2 URL (e.g., wss://your-backend.example.com/ws/v2)"
  exit 1
fi

# Create inline config script
CONFIG_SCRIPT="<script>window.__APP_CONFIG__={AF_BASE_URL:'${AF_BASE_URL}',AF_GOTRUE_URL:'${AF_GOTRUE_URL}',AF_WS_V2_URL:'${AF_WS_V2_URL}'};</script>"

# Inject the config script into index.html right before </head>
sed -i "s|</head>|${CONFIG_SCRIPT}</head>|g" /usr/share/nginx/html/index.html

echo "Runtime configuration injected:"
echo "  AF_BASE_URL: ${AF_BASE_URL}"
echo "  AF_GOTRUE_URL: ${AF_GOTRUE_URL}"
echo "  AF_WS_V2_URL: ${AF_WS_V2_URL}"

# Start nginx
exec nginx -g 'daemon off;'