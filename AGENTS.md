# SynapseNote — AI Agent 가이드

## 커밋 메시지 규칙

- `{tag}: {message}` 형식 사용
- tag: `feat`, `fix`, `refactor`, `docs`, `chore` 등
- message는 반드시 **한글**로 작성

## 현재 기준

- 현재 SynapseNote 제품 기준은 운영 중인 SynapseNote UI다.
- SynapseNote Web 작업 위치: `.worktrees/appflowy-web/`
- SynapseNote self-host 작업 위치: `.worktrees/appflowy-cloud/`
- 이전 FastAPI/Vite Markdown vault 구현은 `legacy/markdown-vault/`에 보관한다.
- `legacy/markdown-vault/`는 참고용 레거시이며 현재 배포 기준이 아니다. 파일 기반 전환에 필요한 backend, parser, indexer, test 자산만 재사용 후보로 본다.
- 현재 운영 기준점은 `docs/current-baseline.md`를 우선 확인한다.
- Markdown vault 전환 기준은 `docs/markdown-vault-transition.md`를 우선 확인한다.
- 현재 방향은 레거시 UI 복귀가 아니라 현재 배포 UI 유지 + 문서 원본 저장소 전환이다.

## 작업 규칙

- 코드 변경 완료 후 커밋·푸시를 자동으로 수행
- 사용자가 배포를 명시하지 않은 문서/조사 작업은 배포하지 않는다.
- 운영 UI나 런타임을 바꾸는 작업은 완료 전 배포 여부를 사용자에게 묻거나, 사용자가 이미 배포를 요청한 경우 끝까지 검증한다.
- 원본 upstream으로 푸시하지 않는다.
- 미완성 실험 변경은 기준 브랜치에 섞지 않는다. 필요하면 stash 또는 별도 브랜치로 분리하고 완료 보고에 위치를 적는다.

## 배포

현재 운영 배포는 SynapseNote compose runtime의 web 서비스를 교체하는 방식으로 진행한다. compose 내부 service key에는 upstream 호환 이름이 남아 있을 수 있지만, 배포 이미지와 실행 컨테이너명은 SynapseNote 이름을 쓴다.

```bash
cd /home/ubuntu/project/SynapseNote/.worktrees/appflowy-web
docker build -f docker/Dockerfile -t synapsenote/web:local .

cd /home/ubuntu/project/SynapseNote/.worktrees/appflowy-cloud
docker compose up -d --no-deps --force-recreate appflowy_web
```

배포 확인:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/
curl -s -o /dev/null -w "%{http_code}\n" https://synapse.lawdigest.kr/
```
