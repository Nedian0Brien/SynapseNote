# Obsidian 웹 편집기 + 백업 운영 계획

## 목적
- Obsidian Vault(`obsidian-vault`)를 웹에서 Markdown 기준으로 조회/편집 가능한 인터페이스로 운영한다.
- 변경은 `livesync-bridge`를 통해 CouchDB와 양방향 동기화되도록 유지한다.
- 삭제/오류 대응을 위해 웹 휴지통·버전관리·백업(로컬 + Google Drive)을 구축한다.

---

## 최종 정책(확정)
- 동기화 정책: 양방향 (파일 삭제 포함)
- 로컬 백업 주기: **6시간마다**
- Google Drive 백업 주기: **매일 1회**
- 로컬 백업 보존: **총량 1GiB 초과 시 오래된 백업부터 삭제**
- Google Drive 백업 보존: **무제한 누적**
- 휴지통 보존: **30일**
- 버전 보존: **파일당 최근 20개**

---

## 핵심 설계

### 1) 동기화 레이어
- 대상: `livesync-bridge/dat/config.json`
- 변경 항목:
  - `sendDelete: false` → `sendDelete: true`
  - `ignorePaths` 유지: `.git`, `.obsidian`
  - 운영 메타 제외 추가:
    - `.obsidian-web-trash`
    - `.obsidian-web-versions`
- `scanOfflineChanges`는 기존 설정( true ) 유지하여 브릿지 다운타임 중 이벤트도 복원

### 2) 웹 편집 API (`web-editor/app.py`)
- 기존 API:
  - `/api/files` (목록)
  - `/api/file` (읽기/저장/삭제)
- 추가 API:
  - `GET /api/versions?path=...`
  - `POST /api/versions/revert`
  - `GET /api/trash`
  - `POST /api/trash/restore`
- 동작 방식:
  - `DELETE /api/file`: 즉시 물리 삭제하지 않고 `.obsidian-web-trash/`로 이동
  - `PUT /api/file`: 저장 전 기존 파일이 있으면 버전으로 아카이브 후 덮어쓰기
  - 경로 보안 검사: `..`, 절대경로, 무시 디렉터리 접근 차단
- 응답 에러 스키마 통일:
  - `invalid_path`, `path_not_found`, `forbidden`, `io_error`

### 3) 웹 UI (`web-editor/public/index.html`)
- 기본 기능:
  - 폴더/파일 트리 보기
  - Markdown 읽기/편집/저장
  - 파일 삭제(휴지통 이동)
  - 버전 목록 조회 및 특정 버전으로 복원
  - 휴지통 목록 조회 및 복원
- 인증:
  - 기본 인증(Basic Auth) 유지
  - 토큰/로그인 없는 접근은 401 처리

### 4) 백업 시스템
- 로컬 백업 엔진:
  - `obsidian-vault` 전체를 주기 스냅샷으로 아카이빙
  - 대상 제외: `.git`, `.obsidian`, `.obsidian-web-trash`, `.obsidian-web-versions`
  - 보존 정책: 누적 용량 1GiB 초과 시 오래된 파일 삭제
- Google Drive 업로드:
  - `rclone` 기반 업로드
  - 로컬 백업 생성 후 업로드(append 방식)
- 실행 주기:
  - 로컬: `*/6 * * * *`
  - GDrive: `0 3 * * *` (매일 03:00)

---

## 구현 순서

1. `livesync-bridge/dat/config.json` 동기화 정책 변경
2. `web-editor/app.py` API 확장(휴지통/버전)
3. `web-editor/public/index.html` 웹 UI 추가/확장
4. 백업 스크립트 추가 (`backup.sh`, `entrypoint.sh` 또는 cron wrapper)
5. `docker-compose.yml`에 백업 서비스 추가
6. `.env.example` / `.env`에 백업 변수 추가
7. `README.md`에 운영/복구 절차 반영
8. 통합 테스트:
   - 웹 수정/삭제/복원
   - 휴지통 복원
   - 버전 복원
   - CouchDB/모바일 동기화 확인
   - 로컬 백업 용량 삭제 검증
   - Drive 업로드 검증

---

## 환경변수(예정)
- `BACKUP_RETENTION_BYTES` = `1073741824`
- `BACKUP_LOCAL_CRON` = `"*/6 * * * *"`
- `BACKUP_GDRIVE_CRON` = `"0 3 * * *"`
- `BACKUP_LOCAL_DIR` = `/backups/obsidian-vault`
- `BACKUP_SOURCE_DIR` = `/vault`
- `BACKUP_KEEP_DAYS_TRASH` = `30`
- `BACKUP_KEEP_VERSIONS` = `20`
- `RCLONE_REMOTE_NAME` = `gdrive`
- `RCLONE_REMOTE_PATH` = `obsidian-vault-backups/obsidian-vault`

---

## 검증 기준
- 웹에서 파일 편집 후 모바일/데스크톱 동기화 확인
- 삭제 파일이 휴지통으로 이동하고 복원 가능
- 버전 복구로 임의 시점으로 되돌리기 가능
- 로컬 백업 크기 1GiB 초과 시 오래된 백업 삭제 확인
- GDrive에 매일 1회 백업 파일 적재 확인
- `.git`, `.obsidian`, `.obsidian-web-*` 경로 직접 접근이 차단됨

---

## 운영 메모
- 장기 보존은 GDrive를 기준으로 하고, 로컬은 빠른 복구용 1GiB 캐시로 운용
- sendDelete를 true로 변경한 뒤, 1차에는 휴지통 정책을 함께 켜서 삭제 실수 위험 완화

