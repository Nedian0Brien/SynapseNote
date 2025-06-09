# AppFlowy Web Deployment Guide

This guide provides information about deploying and configuring AppFlowy Web with AppFlowy-Cloud-Premium backend services.

## Table of Contents

- [Environment Configuration Reference](#environment-configuration-reference)
  - [`deploy.env` - Production Deployment](#deployenv---production-deployment)
  - [`dev.env` - Development Environment](#devenv---development-environment)
- [Configuration Alignment](#configuration-alignment)
- [Creating Custom Configurations](#creating-custom-configurations)

## Environment Configuration Reference

### `deploy.env` - Production Deployment

**AppFlowy-Web Configuration:**
```bash
AF_BASE_URL=http://localhost
AF_GOTRUE_URL=http://localhost/gotrue
AF_WS_URL=ws://localhost/ws/v1
```

**When to use:**
- ✅ Production deployments with Docker Compose
- ✅ Using nginx reverse proxy (default setup)
- ✅ All services accessed through localhost (port 80)

**How it works:**
- All requests go through nginx reverse proxy
- Backend services run in Docker containers
- Single entry point at `http://localhost`

---

### `dev.env` - Development Environment

**AppFlowy-Web Configuration:**
```bash
AF_BASE_URL=http://localhost:8000
AF_GOTRUE_URL=http://localhost:9999
AF_WS_URL=ws://localhost:8000/ws/v1
AF_WS_V2_URL=ws://localhost:8000/ws/v2
```

**When to use:**
- ✅ Local development setup
- ✅ Direct connection to services (no nginx)
- ✅ Each service on its own port

**How it works:**
- Direct connections to individual services
- AppFlowy Cloud API on port 8000
- GoTrue authentication on port 9999
- WebSocket connections directly to port 8000

---

## Configuration Alignment

The configuration files must match between AppFlowy-Cloud-Premium and AppFlowy-Web:

**Production Setup:**
```bash
# AppFlowy-Cloud-Premium
cd appflowy-cloud-premium/
cp deploy.env .env
docker compose up -d

# AppFlowy-Web
cd ../appflowy-web/
cp deploy.env .env
pnpm run dev
```

**Development Setup:**
```bash
# AppFlowy-Cloud-Premium
cd appflowy-cloud-premium/
cp dev.env .env
docker compose --file ./docker-compose-dev.yml up -d

# AppFlowy-Web
cd ../appflowy-web/
cp dev.env .env
pnpm run dev
```

> **⚠️ Important:** Always use matching configuration files (both `deploy.env` or both `dev.env`).

---

## Creating Custom Configurations

### Remote Production Deployment
```bash
AF_BASE_URL=https://your-domain.com
AF_GOTRUE_URL=https://your-domain.com/gotrue
AF_WS_URL=wss://your-domain.com/ws/v1
```

### Custom Development Ports
```bash
AF_BASE_URL=http://localhost:8001
AF_GOTRUE_URL=http://localhost:9998
AF_WS_URL=ws://localhost:8001/ws/v1
AF_WS_V2_URL=ws://localhost:8001/ws/v2
```

---

## Available Environment Variables

- `AF_BASE_URL` - AppFlowy Cloud API base URL
- `AF_GOTRUE_URL` - Authentication service URL  
- `AF_WS_URL` - WebSocket connection URL (v1)
- `AF_WS_V2_URL` - WebSocket connection URL (v2, future use)

---

## Troubleshooting

**Connection Issues:**
- Verify backend services are running on expected ports
- Check that environment files match between backend and frontend
- Ensure WebSocket URLs use correct protocol (`ws://` or `wss://`)

**Configuration Validation:**
```bash
# Check your current configuration
cat .env

# Verify backend is running
docker compose ps
```

---

## Next Steps

- [AppFlowy-Cloud-Premium Repository](https://github.com/AppFlowy-IO/AppFlowy-Cloud-Premium) - Backend setup
- [AppFlowy Web README](../README.md) - Frontend quick start guide
- [AppFlowy Documentation](https://appflowy.com/docs) - Official documentation 