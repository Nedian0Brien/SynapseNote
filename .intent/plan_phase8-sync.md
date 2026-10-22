# Plan: 8단계 기기 간 동기화

spec: `spec_phase8-sync.md`. 브랜치 `feat/sync`(기준 `feat/export`), 워크트리 `.worktree/sync`.

## 순서

1. **비교 자료** (`App/Tests/Fixtures/sync-fixtures.json`): `web/scripts/sync-fixtures.ts`를 rolldown으로 묶어 node로 돌린다(`npm run sync-fixtures`). Morrow `planPull`·`conflictName`·`isSyncedPath`의 결과와 `node:crypto`의 HKDF·PBKDF2·AES-GCM 값을 쓴다.
2. **코어** (`App/Sources/Sync/`)
   - `SyncPlan.swift`: `planPull`, `conflictName`, `isSyncedPath`
   - `SyncCrypto.swift`: 상대 키, 페어링 키, `seal`/`open`(시각 차, nonce 재사용), 페어링 코드
   - `SyncVault.swift`: 매니페스트(SHA-256, 크기·수정 시각 캐시, 1GB 제외), `vault.json`, `.morrow/sync/<peer>.json`, 받은 파일 쓰기(예상 해시 확인, 원자적 쓰기), 볼트 복사 준비
3. **네트워크**
   - `SyncHTTP.swift`: NWListener TCP, 작은 HTTP/1.1 파서(Content-Length, Connection: close), `GET /morrow/v1/id`, `POST /morrow/v1`(페어링·요청)
   - `SyncDiscovery.swift`: macOS BSD 소켓 브로드캐스트(47611, SO_BROADCAST·SO_REUSEADDR·SO_REUSEPORT), Bonjour 알림(`DNSServiceRegister`, TXT `id`·`pairing`)과 탐색(NWBrowser)
     - Bonjour 알림을 서버의 NWListener에 붙이면 알림이 실패할 때 서버까지 멈췄다. 알림을 서버와 떼어 dns_sd로 등록하고, 서버는 스스로 멈추면 다시 시작한다.
   - 요청은 `SyncService`의 URLSession POST. Bonjour로 찾은 기기는 IPv4로 한 번 연결해 주소를 알아 둔다.
4. **서비스** (`SyncService.swift`, @Observable): 설정(`sync.json`+키체인), 상태(상대, 기다리는 기기, 코드), `syncWith`, `syncAll`, 자동 동기화, 볼트 복사, 알림
5. **연결**: `EditorController`(저장 끝내기, 바뀐 파일 알림, 저장 상태 구독), Info.plist(`NSLocalNetworkUsageDescription`, `NSBonjourServices`, `NSAllowsLocalNetworking`), macOS entitlement `network.server`
6. **화면**: `SyncSettingsView.swift`(PairSheet 포함), macOS `Settings` 장면, iOS 시트, 동작 `sync.settings`·`sync.now`
   - iOS에서 Copy Its Vault Here는 시트를 닫은 뒤(`onDismiss`) 폴더 선택기를 연다. 시트 아래의 뷰는 다른 표시를 띄우지 못한다.
   - 문구의 "computers"는 iPhone·iPad도 있으므로 "devices"로 쓴다.
7. **테스트**: `SyncTests.swift`(`SyncPlanTests`, `SyncCryptoTests`, `SyncHTTPParserTests`, `SyncVaultTests`, `SyncLoopbackTests`). 루프백 테스트는 발견을 끄고(`usesDiscovery`) 127.0.0.1로만 주고받는다.
8. **검증**: iPad·iPhone 시뮬레이터 페어링과 동기화, 검증 문서, 로드맵, 푸시, PR #9(기준 `feat/export`)
