# SynapseNote

SynapseNote의 현재 작업 기준은 AppFlowy Web 기반 구현이다. 루트 저장소는 현행 작업
위치를 안내하고, 이전 Markdown vault 기반 구현은 `legacy/markdown-vault/`에 보관한다.

## 현재 기준

```txt
.
├─ .worktrees/
│  ├─ appflowy-web/     # SynapseNote UI/기능을 이식 중인 AppFlowy Web
│  └─ appflowy-cloud/   # self-host AppFlowy Cloud compose/runtime
├─ legacy/
│  └─ markdown-vault/   # 이전 FastAPI/Vite Markdown vault 구현
├─ AGENTS.md
└─ README.md
```

## 작업 위치

- 프론트엔드 브랜딩, 그래프 뷰, AppFlowy Web UI 변경:
  `.worktrees/appflowy-web/`
- self-host compose, 인증/백엔드 런타임 설정:
  `.worktrees/appflowy-cloud/`
- 이전 Markdown vault 앱 참고:
  `legacy/markdown-vault/`

루트의 `legacy/markdown-vault/`는 현재 배포 기준이 아니다. 예전 기능을 참고할 때만 읽고,
새 구현은 AppFlowy 기반 워크트리에서 진행한다.

## 배포 기준

현재 운영 도메인 `https://synapse.lawdigest.kr/`는 AppFlowy Cloud compose의
`appflowy_web` 서비스를 통해 제공된다.

최근 사용한 웹 배포 절차:

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

