# Plan: 8단계 기기 간 동기화

spec: `spec_phase8-sync.md`. 브랜치 `feat/sync`(기준 `feat/export`), 워크트리 `.worktree/sync`.

## 순서

1. **비교 자료** (`App/Tests/Fixtures/sync/`): node 스크립트(`scripts/sync-fixtures.mjs`)가 `node:crypto`로 HKDF·PBKDF2·AES-GCM 봉투 값을, vite-node가 Morrow `planPull`로 계획 사례를 만든다.
2. **코어** (`App/Sources/Sync/`)
   - `SyncPlan.swift`: `planPull`, `conflictName`, `isSyncedPath`
   - `SyncCrypto.swift`: 상대 키, 페어링 키, `seal`/`open`(시각 차, nonce 재사용), 페어링 코드
   - `SyncVault.swift`: 매니페스트(SHA-256, 크기·수정 시각 캐시, 1GB 제외), `vault.json`, `.morrow/sync/<peer>.json`, 받은 파일 쓰기(예상 해시 확인, 원자적 쓰기), 볼트 복사 준비
3. **네트워크**
   - `SyncServer.swift`: NWListener TCP, 작은 HTTP/1.1 파서(Content-Length, Connection: close), `GET /morrow/v1/id`, `POST /morrow/v1`(페어링·요청)
   - `SyncDiscovery.swift`: macOS BSD 소켓 브로드캐스트(47611, SO_BROADCAST·SO_REUSEADDR·SO_REUSEPORT), Bonjour 알림(NWListener service, TXT `id`·`pairing`)과 탐색(NWBrowser)
   - `SyncClient`: URLSession POST, Bonjour 상대는 고를 때 주소로 바꾼다
4. **서비스** (`SyncService.swift`, @Observable): 설정(`sync.json`+키체인), 상태(상대, 기다리는 기기, 코드), `syncWith`, `syncAll`, 자동 동기화, 볼트 복사, 알림
5. **연결**: `EditorController`(저장 끝내기, 바뀐 파일 알림, 저장 상태 구독), Info.plist(`NSLocalNetworkUsageDescription`, `NSBonjourServices`, `NSAllowsLocalNetworking`), macOS entitlement `network.server`
6. **화면**: `SyncSettingsView.swift`, `PairSheet.swift`, macOS `Settings` 장면, iOS 시트, 동작 `sync.settings`·`sync.now`
7. **테스트**: `SyncPlanTests`, `SyncCryptoTests`, `SyncVaultTests`, `SyncLoopbackTests`
8. **검증**: iPad·iPhone 시뮬레이터 페어링과 동기화, 검증 문서, 로드맵, 푸시, PR #9(기준 `feat/export`)
