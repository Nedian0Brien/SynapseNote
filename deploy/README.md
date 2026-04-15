# SynapseNote 배포 가이드

## 현재 런타임

SynapseNote의 active 런타임은 다음 두 서비스다.

| 서비스 | 설명 | 포트 |
|--------|------|------|
| `synapsenote-api` | FastAPI 백엔드 | `127.0.0.1:8000` |
| `synapsenote-web` | Vite 정적 빌드 + Nginx 서빙 프론트엔드 | `127.0.0.1:3002 -> 3000` |

프론트엔드는 `frontend/Dockerfile`의 `runner` 스테이지에서 빌드한 정적 번들을
Nginx로 제공합니다. `/api` 및 `/auth` 요청은 `synapsenote-api`로 프록시합니다.

## 공식 배포 명령

```bash
# 프로젝트 루트에서 실행
bash deploy/deploy.sh          # api + web 전체 배포
bash deploy/deploy.sh api      # 백엔드만
bash deploy/deploy.sh web      # 프론트엔드만
```

`bash deploy/deploy.sh web` 실행 시, 현재 compose에서 실행 중인 `synapsenote-api`가
없으면 스크립트가 API도 함께 재배포합니다.

## 왜 `--no-cache`가 필수인가

백엔드와 프론트엔드 이미지는 모두 소스 파일을 이미지 내부로 `COPY`해서 빌드한다.
이 구조에서 캐시 빌드를 허용하면, 소스가 바뀌어도 이전 레이어가 재사용되어 변경사항이
반영되지 않은 이미지가 다시 떠오를 수 있다.

`deploy/deploy.sh`는 항상 `docker compose build --no-cache`를 사용해 이 문제를 막는다.

> 절대 하지 말 것: `docker compose build`
> 항상 사용할 것: `bash deploy/deploy.sh`

## 주요 환경 변수

- `SYNAPSENOTE_USER_ID`
- `SYNAPSENOTE_USER_PASSWORD`
- `SYNAPSENOTE_SESSION_SECRET`
- `SYNAPSENOTE_CHAT_STORE`
- `VAULT_ROOT`
- `RUNTIME_ROOT`

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

캐시 빌드 가능성이 가장 크다. `docker compose build` 대신 반드시 `bash deploy/deploy.sh`를
다시 실행한다.

### CouchDB 연결 오류

별도 스택으로 운영 중인 `couchdb` 컨테이너가 있으면 배포 스크립트가 API 컨테이너를
해당 네트워크에 연결한다. 실패 시 수동으로 API 컨테이너를 연결한다.

### 포트 충돌

로컬에 이미 `3002` 또는 `8000`을 점유한 프로세스가 있으면 프론트엔드 또는 API가 올라오지
않는다. 충돌 프로세스를 먼저 정리한 뒤 재배포한다.
