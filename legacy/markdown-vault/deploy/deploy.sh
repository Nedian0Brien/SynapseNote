#!/bin/bash
# deploy/deploy.sh — SynapseNote 배포 스크립트
#
# 사용법:
#   bash deploy/deploy.sh              # api + web 전체 배포
#   bash deploy/deploy.sh api          # 백엔드만 배포
#   bash deploy/deploy.sh web          # 프론트엔드만 배포
#   bash deploy/deploy.sh web-dev      # 프론트엔드만 개발모드 배포
#   bash deploy/deploy.sh api web      # 둘 다 명시적으로 배포
#   FORCE_REBUILD=1 bash deploy/deploy.sh  # 캐시 없이 강제 재빌드
#   bash deploy/deploy.sh --no-cache       # 캐시 없이 강제 재빌드

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$PROJECT_ROOT"
DEPLOY_FRONTEND_DEV=false
FORCE_REBUILD="${FORCE_REBUILD:-0}"
COMPOSE_FILES=(-f docker-compose.yml)
BUILD_COMMIT="$(git rev-parse --short=12 HEAD 2>/dev/null || echo unknown)"

is_truthy() {
  case "${1:-}" in
    1|true|TRUE|yes|YES|on|ON) return 0 ;;
    *) return 1 ;;
  esac
}

# ── 배포 대상 결정 ────────────────────────────────────────────────────────────
if [ $# -eq 0 ]; then
  SERVICES=("synapsenote-api" "synapsenote-web")
else
  SERVICES=()
  for arg in "$@"; do
    case "$arg" in
      --no-cache|--force-rebuild) FORCE_REBUILD=1 ;;
      --cache) FORCE_REBUILD=0 ;;
      api) SERVICES+=("synapsenote-api") ;;
      web) SERVICES+=("synapsenote-web") ;;
      web-dev)
        SERVICES+=("synapsenote-web")
        DEPLOY_FRONTEND_DEV=true
        ;;
      *)   SERVICES+=("$arg") ;;   # 서비스명 직접 지정도 허용
    esac
  done
  if [ "${#SERVICES[@]}" -eq 0 ]; then
    SERVICES=("synapsenote-api" "synapsenote-web")
  fi
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
  API_CONTAINER_ID="$(docker compose "${COMPOSE_FILES[@]}" ps -q synapsenote-api 2>/dev/null || true)"
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
echo "  Build Cache: $(is_truthy "$FORCE_REBUILD" && echo disabled || echo enabled)"
echo "=========================================="

if [ "$DEPLOY_FRONTEND_DEV" = true ]; then
  COMPOSE_FILES+=(-f docker-compose.dev.yml)
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

BUILD_ARGS=(--build-arg "SYNAPSENOTE_BUILD_COMMIT=$BUILD_COMMIT")
if is_truthy "$FORCE_REBUILD"; then
  BUILD_ARGS=(--no-cache "${BUILD_ARGS[@]}")
fi

# ── 빌드 ──────────────────────────────────────────────────────────────────────
# 기본은 Docker 레이어 캐시를 사용한다. 캐시가 의심되는 운영 장애나 베이스 이미지
# 갱신 확인이 필요한 경우에만 FORCE_REBUILD=1 또는 --no-cache를 사용한다.
echo ""
echo "▶ Building ($(is_truthy "$FORCE_REBUILD" && echo --no-cache || echo cached), commit $BUILD_COMMIT)..."
env "${COMPOSE_BUILD_ENV[@]}" docker compose "${COMPOSE_FILES[@]}" build "${BUILD_ARGS[@]}" "${SERVICES[@]}"

# ── 컨테이너 교체 (다른 서비스는 유지) ────────────────────────────────────────
echo ""
echo "▶ Restarting containers..."
env "${COMPOSE_BUILD_ENV[@]}" docker compose "${COMPOSE_FILES[@]}" up -d --no-deps --force-recreate "${SERVICES[@]}"

# ── CouchDB 네트워크 연결 (레거시 별도 스택 운영 시) ──────────────────────────
if docker inspect couchdb >/dev/null 2>&1; then
  API_CONTAINER="$(env "${COMPOSE_BUILD_ENV[@]}" docker compose "${COMPOSE_FILES[@]}" ps -q synapsenote-api 2>/dev/null || true)"
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
env "${COMPOSE_BUILD_ENV[@]}" docker compose "${COMPOSE_FILES[@]}" ps "${SERVICES[@]}"

echo ""
echo "▶ Image revisions:"
for svc in "${SERVICES[@]}"; do
  container_id="$(env "${COMPOSE_BUILD_ENV[@]}" docker compose "${COMPOSE_FILES[@]}" ps -q "$svc" 2>/dev/null || true)"
  if [ -z "$container_id" ]; then
    echo "  - $svc: container not found"
    continue
  fi

  revision="$(docker inspect -f '{{ index .Config.Labels "org.opencontainers.image.revision" }}' "$container_id" 2>/dev/null || true)"
  if [ -z "$revision" ] || [ "$revision" = "<no value>" ]; then
    revision="unknown"
  fi
  echo "  - $svc: $revision"
done

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
