# SynapseNote Runtime Deployment Audit

**Date**: 2026-06-22
**Branch**: `feature/markdown-vault-transition`
**Deployed commit**: `47c3110 fix: 모바일 입력 확대 방지`

## Runtime

Active SynapseNote runtime is the repo-local web stack.

- `synapsenote-api`: FastAPI, `127.0.0.1:8000`
- `synapsenote-web`: Vite build served by nginx, `127.0.0.1:3002`
- `backup`: vault backup container

`docker-compose.yml` and `deploy/deploy.sh` do not include AppFlowy Cloud services as required dependencies. AppFlowy containers may still exist on the host, but the active `synapse.lawdigest.kr` route no longer points to them.

## Domain Route

`/etc/nginx/sites-available/synapse.lawdigest.kr` now proxies to:

```nginx
proxy_pass http://127.0.0.1:3002;
```

A backup of the previous nginx file was created before the route change. The previous route pointed to `127.0.0.1:18080`.

## Verification

- `bash deploy/deploy.sh`: succeeded for `synapsenote-api` and `synapsenote-web`.
- `bash deploy/deploy.sh api`: succeeded after updating the single-user account env.
- `https://synapse.lawdigest.kr/`: served the SynapseNote Vite bundle.
- `http://127.0.0.1:8000/health`: returned `vault.readable=true` and `vault.writable=true`.
- Live document smoke:
  - login `200`
  - document create `200`
  - hash-based document update `200`
  - document read `200`
  - graph API `200`
  - chunks API `200`
  - SSE endpoint content type `text/event-stream`
- Mobile viewport smoke:
  - iPhone 13 Chromium viewport
  - source editor textarea focused
  - computed textarea font size `16px`
  - `visualViewport.scale` stayed `1`

## Note

API startup currently waits for `VaultIndexer.full_rebuild()`. On the operating vault, startup took roughly one minute. The app recovered, but readiness should be separated from full rebuild in a follow-up.
