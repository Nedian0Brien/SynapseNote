# SynapseNote 배포 가이드

## 현재 런타임

SynapseNote의 active 런타임은 다음 두 서비스다.

| 서비스 | 설명 | 포트 |
|--------|------|------|
| `synapsenote-api` | FastAPI 백엔드 | `127.0.0.1:8000` |
| `synapsenote-web` | Vite 정적 빌드 + Nginx 서빙 프론트엔드 | `127.0.0.1:3002 -> 3000` |

프론트엔드는 `frontend/Dockerfile`의 `runner` 스테이지에서 빌드한 정적 번들을
Nginx로 제공합니다. `/api` 및 `/auth` 요청은 `synapsenote-api`로 프록시합니다.

개발모드 배포(`web-dev`)는 `docker-compose.dev.yml`을 추가로 사용해
`services/web/frontend`를 컨테이너에 bind mount하고, Vite dev server를 띄웁니다.
이 모드에서는 코드 변경이 HMR로 반영되므로 프론트엔드를 다시 배포할 필요가 없습니다.

## 공식 배포 명령

```bash
# 프로젝트 루트에서 실행
bash deploy/deploy.sh          # api + web 전체 배포
bash deploy/deploy.sh api      # 백엔드만
bash deploy/deploy.sh web      # 프론트엔드만
bash deploy/deploy.sh web-dev  # 프론트엔드만 개발모드
FORCE_REBUILD=1 bash deploy/deploy.sh  # 캐시 없이 강제 재빌드
bash deploy/deploy.sh --no-cache       # 캐시 없이 강제 재빌드
```

`bash deploy/deploy.sh web` 또는 `web-dev` 실행 시, 현재 compose에서 실행 중인 `synapsenote-api`가
없으면 스크립트가 API도 함께 재배포합니다.

## 빌드 캐시 정책

기본 배포는 Docker 레이어 캐시를 사용한다. 백엔드와 프론트엔드 Dockerfile은
`requirements.txt`, `package*.json`, 소스 `COPY`를 분리해 두었기 때문에 의존성이 바뀌지
않은 배포에서는 캐시를 재사용하는 편이 빠르고 디스크 증가도 적다.

캐시가 의심되는 운영 장애, 베이스 이미지 갱신 확인, 의존성 레이어 재생성이 필요한 경우에는
다음 중 하나로 강제 재빌드한다.

```bash
FORCE_REBUILD=1 bash deploy/deploy.sh
bash deploy/deploy.sh --no-cache
```

배포 스크립트는 빌드 시 현재 git commit을 이미지 라벨
`org.opencontainers.image.revision`에 기록하고, 컨테이너 교체 후 각 서비스의 revision을
출력한다. 변경사항이 반영되지 않은 것처럼 보이면 먼저 이 revision이 현재 커밋과 맞는지
확인한다.

> 직접 `docker compose build`를 실행하지 말 것. 서비스 선택, API 의존성 동기화, revision
> 확인을 포함한 공식 경로는 `bash deploy/deploy.sh`다.

## 주요 환경 변수

- `SYNAPSENOTE_USER_ID`
- `SYNAPSENOTE_USER_PASSWORD`
- `SYNAPSENOTE_SESSION_SECRET`
- `SYNAPSENOTE_CHAT_STORE`
- `VAULT_ROOT`
- `RUNTIME_ROOT`

개발모드 배포(`web-dev`) 추가 변수:

- `SYNAPSENOTE_WEB_BUILD_TARGET` (권장값: `dev`, 기본: `runner`)
- `SYNAPSENOTE_DEV_DOMAIN` (기본: `synapse.lawdigest.cloud`)
- `SYNAPSENOTE_DEV_HOST` (기본: `0.0.0.0`)
- `SYNAPSENOTE_DEV_PORT` (기본: `3000`)
- `SYNAPSENOTE_DEV_UPSTREAM` (기본: `http://synapsenote-api:8000`)

## 권장 배포 순서

```bash
git add -A
git commit -m "fix: ..."
git push

bash deploy/deploy.sh

curl -s -o /dev/null -w "%{http_code}" http://localhost:3002/
curl -s -o /dev/null -w "%{http_code}" http://localhost:8000/health
```

정상 결과:

- 프론트엔드 `200`
- API `200`

## 트러블슈팅

### 변경사항이 반영되지 않을 때

배포 완료 후 출력되는 `Image revisions`가 현재 git commit과 같은지 먼저 확인한다. revision이
맞는데도 브라우저에서 이전 화면이 보이면 브라우저·CDN·Nginx 캐시를 확인한다. revision이
다르면 다음 명령으로 강제 재빌드한다.

```bash
FORCE_REBUILD=1 bash deploy/deploy.sh
```

### CouchDB 연결 오류

별도 스택으로 운영 중인 `couchdb` 컨테이너가 있으면 배포 스크립트가 API 컨테이너를
해당 네트워크에 연결한다. 실패 시 수동으로 API 컨테이너를 연결한다.

### 포트 충돌

로컬에 이미 `3002` 또는 `8000`을 점유한 프로세스가 있으면 프론트엔드 또는 API가 올라오지
않는다. 충돌 프로세스를 먼저 정리한 뒤 재배포한다.
