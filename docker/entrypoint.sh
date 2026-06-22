#!/bin/sh
set -e

# Prefer SynapseNote environment names.
if [ -n "${AF_BASE_URL}" ] && [ -z "${SYNAPSENOTE_BASE_URL}" ]; then
  echo "WARNING: AF_BASE_URL is deprecated. Use SYNAPSENOTE_BASE_URL instead."
  SYNAPSENOTE_BASE_URL="${AF_BASE_URL}"
fi

if [ -n "${AF_GOTRUE_URL}" ] && [ -z "${SYNAPSENOTE_GOTRUE_BASE_URL}" ]; then
  echo "WARNING: AF_GOTRUE_URL is deprecated. Use SYNAPSENOTE_GOTRUE_BASE_URL instead."
  SYNAPSENOTE_GOTRUE_BASE_URL="${AF_GOTRUE_URL}"
fi

# Support older websocket variable names for backward compatibility.
if [ -n "${AF_WS_V2_URL}" ] && [ -z "${SYNAPSENOTE_WS_BASE_URL}" ]; then
  echo "WARNING: AF_WS_V2_URL is deprecated. Use SYNAPSENOTE_WS_BASE_URL instead."
  SYNAPSENOTE_WS_BASE_URL="${AF_WS_V2_URL}"
elif [ -n "${AF_WS_URL}" ] && [ -z "${SYNAPSENOTE_WS_BASE_URL}" ]; then
  echo "WARNING: AF_WS_URL is deprecated. Use SYNAPSENOTE_WS_BASE_URL instead."
  SYNAPSENOTE_WS_BASE_URL="${AF_WS_URL}"
fi

# Check required environment variables (after mapping)
if [ -z "${SYNAPSENOTE_BASE_URL}" ]; then
  echo "ERROR: SYNAPSENOTE_BASE_URL is required but not set"
  echo "Set SYNAPSENOTE_BASE_URL to your SynapseNote backend URL, for example https://synapse.example.com"
  exit 1
fi

if [ -z "${SYNAPSENOTE_GOTRUE_BASE_URL}" ]; then
  echo "ERROR: SYNAPSENOTE_GOTRUE_BASE_URL is required but not set"
  echo "Set SYNAPSENOTE_GOTRUE_BASE_URL to your GoTrue authentication URL, for example https://synapse.example.com/gotrue"
  exit 1
fi

if [ -z "${SYNAPSENOTE_WS_BASE_URL}" ]; then
  echo "ERROR: SYNAPSENOTE_WS_BASE_URL is required but not set"
  echo "Set SYNAPSENOTE_WS_BASE_URL to your websocket URL, for example wss://synapse.example.com/ws/v2"
  exit 1
fi

# Show deprecation summary if any old variables were used
if [ -n "${AF_BASE_URL}" ] || [ -n "${AF_GOTRUE_URL}" ] || [ -n "${AF_WS_V2_URL}" ] || [ -n "${AF_WS_URL}" ]; then
  echo ""
  echo "════════════════════════════════════════════════════════════════════"
  echo "DEPRECATION NOTICE: Old environment variable names detected."
  echo "Please update your configuration to use:"
  echo "  SYNAPSENOTE_BASE_URL"
  echo "  SYNAPSENOTE_GOTRUE_BASE_URL"
  echo "  SYNAPSENOTE_WS_BASE_URL"
  echo "════════════════════════════════════════════════════════════════════"
  echo ""
fi

# Create inline config script.
CONFIG_SCRIPT="<script>window.__APP_CONFIG__={SYNAPSENOTE_BASE_URL:'${SYNAPSENOTE_BASE_URL}',SYNAPSENOTE_GOTRUE_BASE_URL:'${SYNAPSENOTE_GOTRUE_BASE_URL}',SYNAPSENOTE_WS_BASE_URL:'${SYNAPSENOTE_WS_BASE_URL}'};</script>"

# Inject the config script into index.html right before </head>
sed -i "s|</head>|${CONFIG_SCRIPT}</head>|g" /usr/share/nginx/html/index.html

echo "SynapseNote runtime configuration injected:"
echo "  SYNAPSENOTE_BASE_URL: ${SYNAPSENOTE_BASE_URL}"
echo "  SYNAPSENOTE_GOTRUE_BASE_URL: ${SYNAPSENOTE_GOTRUE_BASE_URL}"
echo "  SYNAPSENOTE_WS_BASE_URL: ${SYNAPSENOTE_WS_BASE_URL}"

# Start nginx
exec nginx -g 'daemon off;'
