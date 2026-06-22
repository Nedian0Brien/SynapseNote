# SynapseNote — AI Agent 가이드

## 커밋 메시지 규칙

- `{tag}: {message}` 형식 사용
- tag: `feat`, `fix`, `refactor`, `docs`, `chore` 등
- message는 반드시 **한글**로 작성

## 현재 기준

- 현재 SynapseNote 구현 기준은 AppFlowy Web 기반이다.
- AppFlowy Web 작업 위치: `.worktrees/appflowy-web/`
- AppFlowy Cloud/self-host 작업 위치: `.worktrees/appflowy-cloud/`
- 이전 FastAPI/Vite Markdown vault 구현은 `legacy/markdown-vault/`에 보관한다.
- `legacy/markdown-vault/`는 참고용 레거시이며 현재 배포 기준이 아니다.

## 작업 규칙

- 코드 작업을 시작할 때는 먼저 `codebase-onboarding` 스킬을 사용하여 코드베이스를 파악할 것
  (`npx codesight --wiki 실행 → .codesight/wiki/ 문서 참고)
- 코드 변경 완료 후 커밋·푸시를 자동으로 수행
- 작업 마무리 시 배포 여부를 사용자에게 질문
- 원본 AppFlowy upstream으로 푸시하지 않는다.

## 배포

현재 운영 배포는 AppFlowy Cloud compose의 `appflowy_web` 서비스를 교체하는 방식으로 진행한다.

```bash
cd /home/ubuntu/project/SynapseNote/.worktrees/appflowy-web
docker build -f docker/Dockerfile -t synapsenote/appflowy-web:local .

cd /home/ubuntu/project/SynapseNote/.worktrees/appflowy-cloud
docker compose up -d --no-deps --force-recreate appflowy_web
```

배포 확인:

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:18080/
curl -s -o /dev/null -w "%{http_code}\n" https://synapse.lawdigest.kr/
```

