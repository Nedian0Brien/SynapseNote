# Obsidian Stack 동기화 이슈 정리

작성일: 2026-02-21  
영역: `SynapseNote`  
범위: web-editor(Obsidian 웹), Mac Obsidian, Livesync Bridge, CouchDB

## 1) 이슈 요약

- **사용자 보고**: macOS(맥)에서 작성한 노트는 웹 에디터에서 보이지만, 웹 에디터에서 작성한 노트가 맥으로 반영되지 않는 증상
- **추가 증상**: 이전에는 WebSocket 실패(접속 차단/흑화면) 및 인증 동작 이슈(여러 번 로그인 팝업), 컨테이너 명칭 혼선, 패스프레이즈 오인입력 등이 반복됨
- **최종 상태**: `content/web-sync-test-live-1771603685.md` 테스트 파일이 웹에서 생성되어 CouchDB에 반영된 뒤, 맥쪽에도 반영 확인되어 이슈 해소 확인됨

## 2) 환경/컴포넌트

- 브리지: `livesync-bridge`
- DB: `CouchDB` (`obsidian_vault_db`)
- 웹 에디터: `obsidian-web` (현재도 개발/운영 중인 경량 Flask 편집기)
- 인증: `obsidian-web` 기본 HTTP Basic Auth + n8n/notes nginx 프록시 인증 정책

## 3) 당시의 주요 관찰 포인트

1. `livesync-bridge`는 CouchDB와 로컬 볼륨(`/home/ubuntu/obsidian-vault`) 사이 양방향 동기화 역할 수행
2. 웹에서 생성한 테스트 파일 경로:
   - `content/web-sync-test-live-1771603685.md`
3. CouchDB 점검 결과:
   - `_changes`/`_all_docs`에 문서 존재 확인
   - `_id`: `content/web-sync-test-live-1771603685.md`
   - `_rev` 및 `path`도 정상 수신
4. 맥쪽 노트 반영 테스트:
   - 위 테스트 파일이 웹에서 작성된 뒤 Mac Obsidian에서 확인됨

## 4) 조치/원인 분석 내역 (시간 순)

### 4-1) 초기 추정 문제
- 웹과 맥 동기화 불일치(특히 "웹 작성만 반영 안 됨")가 반복
- WebSocket, 인증 반복창, 크롬 계열 접속 이슈 등 클라이언트/프록시 레이어 우선 점검
- 패스프레이즈/암호화 관련 이슈 가능성(기기 설정값 vs DB 내 이력 데이터) 존재

### 4-2) 브리지 설정 정합성 점검
- `.env`
  - `LIVESYNC_PASSPHRASE=<configured_value>`
  - `LIVESYNC_OBFUSCATE_PASSPHRASE=`(비어 있음)
- `services/livesync-bridge/dat/config.json`
  - `passphrase`/`obfuscatePassphrase` 비어 있는 상태지만, 브리지 런타임에서 환경변수 오버라이드 로직으로 반영되도록 동작 확인 필요
- 브리지 코드에 대해 환경변수 존재 여부 처리 방식 조정(패스프레이즈 미입력 시 빈 문자열 명시 처리) 및 빌드 재시작 적용

### 4-3) 실증 확인
- 웹 에디터에서 파일 생성
- Bridge 로그에서 감지/저장 확인
- CouchDB 조회로 `_id`/`path` 존재 확인
- 맥 클라이언트 반영 확인

## 5) 최종 판단

- **현재 테스트 케이스 기준으로 동기화는 정상 동작**함이 확인됨
- 과거 장애는 설정/환경변수 반영 방식 + 클라이언트 동작환경(WebSocket/브라우저 인증 캐시 등) 요인 조합이었고, 핵심 데이터 경로(`web-sync` 테스트 파일)는 정상 복원 확인됨
- “일시적/부분 실패”가 다시 재발할 수 있으므로, 정식 전환 전 최소 2~3회 반복 테스트 필요

## 6) 잔여 위험요소 및 점검 포인트

- macOS Obsidian 플러그인(LiveSync) 설정과 `usePathObfuscation`/암호화 플래그의 일치 유지
- 웹 편집기에서 저장 이벤트 누락이 없는지(네트워크/세션/캐시) 주기 체크
- 브리지 예외(예: `getDBEntryMeta` 관련 스택) 재발 여부 모니터링
- 향후 변경 시 `obsidian_vault_db` 무결성 검증 체크리스트 선행

## 7) 운영 메모

- 이번 건은 파괴적 조치(DB 삭제/볼륨 삭제/컨테이너 강제 초기화)는 수행하지 않음
- 추후 작업 시 AGENTS 정책(파괴적 작업 사전 승인) 준수 필요

## 8) 다음 액션 제안

1. 동일 절차로 실제 운영 파일 3건에서 `웹 작성 -> Mac 반영` 반복 검증
2. 동기화 성공 스냅샷 1개(시간, 파일명, CouchDB seq, Mac 반영 확인 시각) 기록
3. 동일 증상 재발 시 `CouchDB path 규칙`, `브릿지 재시작 로그`, `맥 플러그인 노드 정보`를 한 세트로 저장
