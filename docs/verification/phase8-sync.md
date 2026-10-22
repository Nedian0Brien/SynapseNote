# 8단계 기기 간 동기화 검증 결과

- 날짜: 2026-10-19
- 브랜치: `feat/sync`(기준 `feat/export`)
- 환경: Xcode 27.0, iOS 27.0 시뮬레이터 두 대(iPad Pro 13-inch (M5), iPhone 17 Pro Max). 두 시뮬레이터는 같은 Mac의 네트워크를 쓴다.
- 시험 vault: iPad 앱 문서 폴더의 시험 vault, iPhone의 On My iPhone에 만든 빈 시험 폴더 `SyncCopy`.
- macOS는 화면이 잠겨 있어 조작하지 못했다. macOS 앱 코드는 단위 테스트와 루프백 통합 테스트로 확인했다.
- Morrow 데스크톱 앱과 실제로 주고받는 것은 시험하지 않았다. 대신 같은 입력에서 Morrow의 TS 코어와 node 암호 함수가 낸 값과 비교했다(아래).

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run sync-fixtures` | Morrow `planPull`(사례 14개), `conflictName`, `isSyncedPath`, `node:crypto`의 HKDF·PBKDF2·AES-256-GCM 값을 `App/Tests/Fixtures/sync-fixtures.json`에 씀 |
| `npm --prefix web run typecheck` / `test` | 통과, 37개 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 82개 |

새 Swift 테스트:

- **Morrow와 같은 계획**: 사례 14개의 동작과 기준이 Morrow `planPull`과 같다. 받기, 지우기, 충돌(큰 해시가 이름을 가짐), 편집이 삭제를 이김, `.morrow/workspace.json`·`review.json`, 숨김·임시 파일 제외, 충돌 사본 이름이 겹칠 때 `Laptop 2`, 빈 기기 이름. Morrow의 양쪽 동기화 테스트 세 개(`core/organize.test.ts`)도 같은 결과다.
- **Morrow 데스크톱과 같은 암호**: 상대 키(HKDF-SHA256), 페어링 키(PBKDF2-SHA256 20만 회)가 node 값과 바이트 단위로 같다. 같은 nonce로 봉한 결과가 node와 같고, node가 봉한 것을 연다. 오래된 메시지, 다시 보낸 메시지, 다른 키의 메시지를 거부한다.
- **볼트**: 매니페스트(SHA-256, 공유하지 않는 파일 제외), `vault.json` 형식(Morrow `JSON.stringify(…, null, 1)`과 같은 글자), 동기화 기준, 예상 해시가 다르면 쓰지 않음, 빈 폴더만 복사본이 됨.
- **루프백 통합**: 한 프로세스 안의 두 서비스가 127.0.0.1로 코드 페어링, pull(파일 2개), 양쪽 수정의 충돌 사본, 세 번 주고받은 뒤 두 vault가 같아짐, pull 요청을 받은 쪽이 가져감, 다른 vault id 거부(Morrow 문구), 틀린 코드 거부("That code is not right."), 기다리지 않는 기기 거부.

## 기능 (시뮬레이터 두 대)

| 항목 | 결과 | 확인 방법 · 비고 |
|---|---|---|
| Bonjour로 서로 찾기 | 통과 | 페어링 시트를 연 iPad가 iPhone 목록에, iPhone이 iPad 목록에 나타남 |
| 코드 페어링 | 통과 | iPhone이 코드를 보이고 iPad가 목록에서 iPhone을 골라 코드를 입력 → 양쪽 기기 목록에 상대가 "On this network · never synced"로 나타남. iPhone의 페어링 시트는 스스로 닫힘 |
| 다른 vault 거부 | 통과 | 서로 다른 vault로 Sync Now → "iPad Pro 13-inch (M5) has a different vault open (SynapseNote). Open the same vault on both, or copy it over first." |
| Copy Its Vault Here | 통과 | iPhone에서 빈 폴더 선택 → 그 폴더가 열리고 iPad vault의 공유 파일 23개가 받아짐. 해시로 비교해 23개 모두 같음. `.obsidian`, `.morrow/recent.json`, 히스토리는 받지 않음(Morrow 규칙) |
| 수정이 저절로 건너감 | 통과 | iPhone에서 새 페이지 → 약 15초 뒤(저장 12초 뒤 동기화 + pull 요청) iPad vault에 `Untitled 3.md`가 생기고, iPad 홈의 페이지 수가 19에서 20으로 바뀜 |
| 충돌 사본 | 루프백 테스트만 | 시뮬레이터에서는 조작하지 않음 |
| macOS 브로드캐스트·Morrow 데스크톱과 페어링 | 미확인 | 화면 잠김, Morrow 데스크톱 없음 |

## 고친 문제

1. **Bonjour 알림 실패가 서버를 멈춤.** 처음에는 알림을 서버의 `NWListener.service`로 붙였다. 알림이 실패하면(이 시험에서는 권한이 없는 테스트 호스트) 리스너 전체가 실패해 다른 기기의 요청이 "Connection refused"가 됐다. 알림을 `DNSServiceRegister`로 서버와 떼어 등록하고, 서버는 스스로 멈추면 다시 시작한다.
2. **iOS에서 Copy Its Vault Here의 폴더 선택기가 뜨지 않음.** 동기화 시트가 떠 있는 동안 그 아래 뷰는 선택기를 띄우지 못한다. 시트를 닫은 뒤 선택기를 연다.

## 기록해 둘 동작

- iOS·iPadOS는 브로드캐스트를 쓰지 않는다(제한 entitlement, spec 참고). SynapseNote 기기끼리는 Bonjour로 찾는다. Morrow 데스크톱과는 주소를 입력해 페어링하고, 그 뒤에는 Morrow처럼 마지막 주소로 요청한다.
- 페어링 비밀값은 키체인에 두고 `sync.json`에는 두지 않는다. Morrow는 `sync.json`에 둔다.
- 앱이 앞에 있을 때만 서버가 돈다(iOS 제약). Morrow와 같이 90초마다, 저장 12초 뒤, 상대의 요청이 올 때 동기화한다.
- 기기 이름 기본값은 iOS에서 기기 종류(예: iPad Pro 13-inch (M5))다. 설정에서 바꿀 수 있다.

## 사용자 확인 요청

1. macOS에서 Settings > Sync를 켜고 iPhone·iPad와 페어링한다. macOS가 로컬 네트워크 권한을 물으면 허용한다.
2. Morrow 데스크톱이 있다면 macOS SynapseNote와 페어링해 본다(Morrow는 브로드캐스트로 찾는다). iPhone·iPad에서는 Morrow 데스크톱의 주소를 입력해 페어링한다.
3. 두 기기에서 같은 페이지를 고친 뒤 Sync Now를 눌러 "conflict from" 사본이 생기는지 본다.
