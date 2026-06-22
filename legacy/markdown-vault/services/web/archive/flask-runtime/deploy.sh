#!/bin/bash
# services/web-editor/deploy.sh

# 현재 디렉토리 위치 저장
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$SCRIPT_DIR/../.."

if docker inspect couchdb >/dev/null 2>&1; then
  if [ -z "${COUCHDB_USER:-}" ]; then
    COUCHDB_USER="$(docker inspect couchdb --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^COUCHDB_USER=//p' | tail -n 1)"
    export COUCHDB_USER
  fi

  if [ -z "${COUCHDB_PASSWORD:-}" ]; then
    COUCHDB_PASSWORD="$(docker inspect couchdb --format '{{range .Config.Env}}{{println .}}{{end}}' | sed -n 's/^COUCHDB_PASSWORD=//p' | tail -n 1)"
    export COUCHDB_PASSWORD
  fi
fi

# 1. 최신 커밋 정보 갱신
# 에디터 UI 하단에 표시될 버전 파일을 현재 커밋 메시지로 업데이트합니다.
cd "$PROJECT_ROOT"
git log -1 --pretty=%s > services/web-editor/version.txt

echo "=========================================="
echo "  SynapseNote Frontend/Backend Deployment"
echo "  Commit: $(cat services/web-editor/version.txt)"
echo "=========================================="

# 2. 프론트/백 서비스 빌드
docker compose build synapsenote-api obsidian-web

# 3. 프론트/백 서비스만 교체 (다른 서비스는 유지)
docker compose up -d --no-deps --force-recreate synapsenote-api obsidian-web

# 4. legacy CouchDB 스택이 별도 프로젝트로 운영 중이면 API 컨테이너를 해당 네트워크에 붙인다.
if docker inspect couchdb >/dev/null 2>&1; then
  API_CONTAINER="$(docker compose ps -q synapsenote-api)"
  if [ -z "$API_CONTAINER" ]; then
    API_CONTAINER="$(docker ps -q --filter name='synapsenote-api' --filter status=running | head -n 1)"
  fi

  if [ -n "$API_CONTAINER" ]; then
    for net in $(docker inspect -f '{{range $name, $cfg := .NetworkSettings.Networks}}{{println $name}}{{end}}' couchdb); do
      if ! docker inspect -f "{{json .NetworkSettings.Networks}}" "$API_CONTAINER" | grep -q "\"$net\""; then
        docker network connect --alias couchdb "$net" "$API_CONTAINER" >/dev/null 2>&1 || true
      fi
    done
  fi
fi

echo "------------------------------------------"
echo "  Deployment Complete! (synapsenote-api + obsidian-web updated)"
echo "  Check: http://localhost:3002"
echo "=========================================="
