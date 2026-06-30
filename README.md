# SynapseNote

SynapseNote의 현재 제품 기준은 운영 중인 SynapseNote UI다. 다음 큰 방향은 이 UI를 유지한 채 문서 원본 저장소를 Markdown vault로 옮기는 것이다.

## 현재 기준

```txt
.
├─ .worktrees/
│  ├─ appflowy-web/     # SynapseNote Web UI 작업 위치
│  └─ appflowy-cloud/   # SynapseNote self-host compose/runtime
├─ docs/
│  ├─ current-baseline.md
│  └─ markdown-vault-transition.md
├─ legacy/
│  └─ markdown-vault/   # 이전 FastAPI/Vite Markdown vault 구현
├─ AGENTS.md
└─ README.md
```

## 기준 문서

- 현재 운영 기준점: `docs/current-baseline.md`
- Markdown vault 전환 기준: `docs/markdown-vault-transition.md`
- 에이전트 작업 규칙: `AGENTS.md`

## 작업 위치

- 프론트엔드 브랜딩, 그래프 뷰, SynapseNote Web UI 변경:
  `.worktrees/appflowy-web/`
- self-host compose, 인증/백엔드 런타임 설정:
  `.worktrees/appflowy-cloud/`
- 이전 Markdown vault 앱 참고:
  `legacy/markdown-vault/`

루트의 `legacy/markdown-vault/`는 현재 배포 기준이 아니다. 파일 기반 전환에 필요한 backend, indexer, parser, test 자산을 참고할 때만 읽는다. 레거시 UI로 되돌리는 작업은 현재 방향이 아니다.

## 배포 기준

현재 운영 도메인 `https://synapse.lawdigest.kr/`는 SynapseNote compose runtime의
web 서비스로 제공된다. compose 내부에는 upstream 호환을 위한 service key가 일부 남아 있지만,
배포 이미지와 실행 컨테이너명은 SynapseNote 이름을 쓴다.

최근 사용한 웹 배포 절차:

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

## 다음 작업 방향

1. 현재 배포 UI를 기준점으로 유지한다.
2. upstream collab 저장소 의존을 조사한다.
3. Markdown vault API 계약을 정의한다.
4. 레거시 vault backend 자산을 현재 UI 뒤에 붙일 수 있는 형태로 승격한다.
