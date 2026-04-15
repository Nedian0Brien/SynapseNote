#!/bin/bash
# deploy/deploy.sh — SynapseNote 배포 스크립트
#
# 사용법:
#   bash deploy/deploy.sh              # api + web 전체 배포
#   bash deploy/deploy.sh api          # 백엔드만 배포
#   bash deploy/deploy.sh web          # 프론트엔드만 배포
#   bash deploy/deploy.sh web-dev      # 프론트엔드만 개발모드 배포
#   bash deploy/deploy.sh api web      # 둘 다 명시적으로 배포
#
# 주의: Dockerfile이 소스를 이미지에 COPY하므로 반드시 --no-cache로 빌드해야
#       코드 변경사항이 컨테이너에 반영된다. --no-cache 없이 build하면 이전
#       이미지가 그대로 사용되어 배포가 실패한 것처럼 보인다.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"
DEPLOY_FRONTEND_DEV=false

# ── 배포 대상 결정 ────────────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  SERVICES=("synapsenote-api" "synapsenote-web")
else
  SERVICES=()
  for arg in "$@"; do
    case "$arg" in
      api) SERVICES+=("synapsenote-api") ;;
      web) SERVICES+=("synapsenote-web") ;;
      web-dev)
        SERVICES+=("synapsenote-web")
        DEPLOY_FRONTEND_DEV=true
        ;;
      *)   SERVICES+=("$arg") ;;   # 서비스명 직접 지정도 허용
    esac
  done
fi

contains_service() {
  local target="$1"
  local item
  for item in "${SERVICES[@]}"; do
    [ "$item" = "$target" ] && return 0
  done
  return 1
}

# web 배포 시 API가 현재 compose에서 실행 중이 아니면 API도 함께 배포해
# 웹 컨테이너의 nginx 시작 실패(상위 DNS 해석 실패)를 방지한다.
if contains_service "synapsenote-web" && ! contains_service "synapsenote-api"; then
  API_CONTAINER_ID="$(docker compose ps -q synapsenote-api 2>/dev/null || true)"
  if [ -z "$API_CONTAINER_ID" ]; then
    echo "  - 동기화: synapsenote-web은 synapsenote-api 의존성이 있어 API도 함께 재배포합니다."
    SERVICES+=("synapsenote-api")
  fi
fi

DEDUPED_SERVICES=()
for svc in "${SERVICES[@]}"; do
  if [ "$svc" = "" ]; then
    continue
  fi

  exists=false
  for existing in "${DEDUPED_SERVICES[@]}"; do
    if [ "$existing" = "$svc" ]; then
      exists=true
      break
    fi
  done

  if [ "$exists" = false ]; then
    DEDUPED_SERVICES+=("$svc")
  fi
done
SERVICES=("${DEDUPED_SERVICES[@]}")

echo "=========================================="
echo "  SynapseNote Deploy"
echo "  Services: ${SERVICES[*]}"
echo "  Frontend Mode: $([ "$DEPLOY_FRONTEND_DEV" = true ] && echo dev || echo prod)"
echo "  Commit : $(git log -1 --pretty='%h %s' 2>/dev/null || echo 'unknown')"
echo "=========================================="

if [ "$DEPLOY_FRONTEND_DEV" = true ]; then
  COMPOSE_BUILD_ENV=(
    "SYNAPSENOTE_WEB_BUILD_TARGET=dev"
    "SYNAPSENOTE_DEV_HOST=${SYNAPSENOTE_DEV_HOST:-0.0.0.0}"
    "SYNAPSENOTE_DEV_DOMAIN=${SYNAPSENOTE_DEV_DOMAIN:-synapse.lawdigest.cloud}"
    "SYNAPSENOTE_DEV_PORT=${SYNAPSENOTE_DEV_PORT:-3000}"
    "SYNAPSENOTE_DEV_UPSTREAM=${SYNAPSENOTE_DEV_UPSTREAM:-http://synapsenote-api:8000}"
  )
else
  COMPOSE_BUILD_ENV=()
fi

# ── --no-cache 빌드 ───────────────────────────────────────────────────────────
# Dockerfile이 소스를 이미지에 COPY하기 때문에 캐시를 무조건 무효화해야 한다.
echo ""
echo "▶ Building (--no-cache)..."
env "${COMPOSE_BUILD_ENV[@]}" docker compose build --no-cache "${SERVICES[@]}"

# ── 컨테이너 교체 (다른 서비스는 유지) ────────────────────────────────────────
echo ""
echo "▶ Restarting containers..."
env "${COMPOSE_BUILD_ENV[@]}" docker compose up -d --no-deps --force-recreate "${SERVICES[@]}"

# ── CouchDB 네트워크 연결 (레거시 별도 스택 운영 시) ──────────────────────────
if docker inspect couchdb >/dev/null 2>&1; then
  API_CONTAINER="$(docker compose ps -q synapsenote-api 2>/dev/null || true)"
  if [ -z "$API_CONTAINER" ]; then
    API_CONTAINER="$(docker ps -q --filter name='synapsenote-synapsenote-api' --filter status=running | head -n 1)"
  fi

  if [ -n "$API_CONTAINER" ]; then
    for net in $(docker inspect -f '{{range $n, $_ := .NetworkSettings.Networks}}{{println $n}}{{end}}' couchdb 2>/dev/null); do
      docker network connect --alias couchdb "$net" "$API_CONTAINER" >/dev/null 2>&1 || true
    done
  fi
fi

# ── 완료 확인 ─────────────────────────────────────────────────────────────────
echo ""
echo "▶ Container status:"
docker compose ps "${SERVICES[@]}"

echo ""
echo "=========================================="
echo "  Deploy complete!"
if [ "$DEPLOY_FRONTEND_DEV" = true ] && contains_service "synapsenote-web"; then
  echo "  Frontend : https://${SYNAPSENOTE_DEV_DOMAIN:-synapse.lawdigest.cloud} (dev)"
else
  echo "  Frontend : http://localhost:3002"
fi
echo "  API      : http://localhost:8000"
echo "=========================================="
