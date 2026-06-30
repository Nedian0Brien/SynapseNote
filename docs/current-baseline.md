# 현재 배포 기준

작성일: 2026-06-30

이 문서는 SynapseNote의 다음 작업 기준점을 고정하기 위한 기록이다. 제품 판단의 기준은 현재 운영 중인 SynapseNote UI다.

## 운영 상태

- 운영 URL: `https://synapse.lawdigest.kr/`
- 확인 경로: `/`, `/login`, `/home`
- 확인 결과: 세 경로 모두 `200`
- 운영 방식: `.worktrees/appflowy-cloud`의 Docker compose에서 SynapseNote Web 이미지를 교체

## Web 기준

- 작업 위치: `.worktrees/appflowy-web/`
- 브랜치: `synapsenote-branding`
- 기준 커밋: `5752135591e93be985fd9b0a419803e0a6a0aba2`
- 기준 이미지: `synapsenote/web:local`
- 배포 이미지 digest: `sha256:15a589d4da28ff7238bbe388dcf6dd8f498491c8a9d6c222923dbf6fedbc15d6`
- 컨테이너 재생성 시각: `2026-06-30T11:46:40Z`

## Cloud 기준

- 작업 위치: `.worktrees/appflowy-cloud/`
- 실행 컨테이너명: `synapsenote-runtime-cloud`, `synapsenote-runtime-web`, `synapsenote-runtime-worker`, `synapsenote-runtime-auth`, `synapsenote-runtime-postgres`, `synapsenote-runtime-redis`, `synapsenote-runtime-minio`, `synapsenote-runtime-nginx`
- 현재 문서 저장 원본: upstream collab/Postgres/MinIO 계층
- 현재 파일 기반 vault: 운영 원본이 아님

## 호환 이름

compose service key와 일부 `APPFLOWY_*` 환경변수는 upstream 바이너리와 compose 내부 DNS 계약 때문에 유지한다. 제품·배포 표면에서는 SynapseNote 이미지명과 컨테이너명을 우선 사용한다.

## Agent WIP 분리

미완성 Agent 변경은 현재 기준점에서 분리했다.

- `.worktrees/appflowy-web`: stash `wip: Agent Codex CLI bridge`
- `.worktrees/appflowy-cloud`: stash `wip: Agent Codex CLI compose override`

이 변경은 향후 Agent 작업에서 다시 검토한다. 현재 기준점에는 포함하지 않는다.

## 배포 확인 명령

```bash
cd /home/ubuntu/project/SynapseNote/.worktrees/appflowy-cloud
docker compose ps
docker logs --tail=50 synapsenote-runtime-web

curl -s -o /dev/null -w "%{http_code}\n" https://synapse.lawdigest.kr/
curl -s -o /dev/null -w "%{http_code}\n" https://synapse.lawdigest.kr/login
curl -s -o /dev/null -w "%{http_code}\n" https://synapse.lawdigest.kr/home
```
