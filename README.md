# SynapseNote

SynapseNote는 로컬 vault를 탐색하고 편집하는 지식관리용 웹 애플리케이션이다. 현재 active
런타임은 `FastAPI` 백엔드와 `Vite build + nginx` 프론트엔드로 구성된다.

## Active 구조

```txt
.
├─ services/
│  ├─ backup/
│  └─ web/
│     ├─ backend/
│     └─ frontend/
├─ deploy/
├─ docs/
│  ├─ design-system-preview.html
│  ├─ main-ui-preview.html
│  └─ archive/
├─ docker-compose.yml
└─ README.md
```

## 현재 기준 문서

- `docs/design-system-preview.html`
- `docs/main-ui-preview.html`

과거 프리뷰, 진행 로그, 실험 산출물은 `docs/archive/`로 이동 중이며 active 기준 문서가 아니다.

## 실행과 배포

개발/운영용 공식 배포 진입점은 다음 하나다.

```bash
bash deploy/deploy.sh
```

세부 배포 절차와 검증은 [deploy/README.md](/home/ubuntu/project/SynapseNote/deploy/README.md)를
따른다.

## 환경 변수

대표 변수:

- `SYNAPSENOTE_USER_ID`
- `SYNAPSENOTE_USER_PASSWORD`
- `SYNAPSENOTE_SESSION_SECRET`
- `SYNAPSENOTE_CHAT_STORE`
- `VAULT_ROOT`
- `RUNTIME_ROOT`

## 운영 원칙

- 이 레포는 소스 중심이다.
- 운영 데이터와 임시 산출물은 레포 밖에 둔다.
- generated cache, preview 산출물, 폐기 예정 런타임 자산은 active 경로에 두지 않는다.

## 백업/복구

백업은 기본적으로 `${RUNTIME_ROOT}/backups`에 생성된다.

복구 절차:

1. 로컬 아카이브를 해제해 `${VAULT_ROOT}`를 복원한다.
2. 필요하면 원격 백업을 내려받아 동일 경로로 복원한다.
3. 애플리케이션 레벨 복구 절차는 해당 기능이 active 경로에서 다시 정리된 뒤 문서화한다.
