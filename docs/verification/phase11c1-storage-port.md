# 11c-1단계 저장소 나머지 이식 검증 결과

- 날짜: 2026-10-20
- 브랜치: `feat/swift-session`(기준 `feat/swift-queries`)
- 환경: Xcode 27.0, macOS 27.0, node(ICU 78.3, 로캘 en-US, `TZ=UTC`)
- 비교 기준: Morrow a2daae1의 `storage/session.ts`, `storage/saveQueue.ts`, `storage/vaultRepository.ts`, `core/crypto.ts`, `core/history.ts`. 새 스크립트 `npm --prefix web run storage-fixtures`가 node에서 Morrow 코드를 돌려 `App/Tests/Fixtures/core/expected/{crypto,save-queue,storage}.json`을 쓰고, Swift 테스트가 같은 입력으로 같은 결과를 내는지 본다. 시계는 단계마다 정한 값으로만 움직이고, 기록 id와 난수 바이트는 고정 수열이다.
- 앱 동작은 바뀌지 않는다. 파일을 쓰는 쪽은 여전히 웹이고, 이번 단계의 Swift 코드는 테스트에서만 돈다. 전환은 11c-2에서 한다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 43개 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 114개(11b 109개 + 암호화 3, 저장 예약 1, 저장소 1) |

## Morrow 결과와의 비교

| 비교 자료 | 내용 | 결과 |
|---|---|---|
| `crypto.json` | 비밀번호(빈 비밀번호, 한글·기호 포함)·salt·iv·평문 4조합의 `encryptPage`, 600,000회 1건과 100,000회 3건 | 같은 파일. 서로가 쓴 파일을 복호화하고, 틀린 비밀번호는 둘 다 거절 |
| `crypto.json` 머리말 | `readEncrypted` 6건(반복 횟수 하한, 다른 암호 방식, 깨진 salt, 일반 페이지) | 같음 |
| `save-queue.json` | 가상 시계에서 묶기, 실패 2번(재시도 1초·2초), 오류 중 새 변경, 삭제, `flush` | 상태·타이머·쓰기 기록 27건(스크립트 단계 15건 포함 42건)이 같은 시각, 같은 순서 |
| `storage.json` | 가이드 vault에서 25단계(아래) | 단계마다 결과, 파일 작업 전부(기록 파일 포함), 외부 편집 패치와 받아들인 id, 페이지·문서, 읽지 못한 페이지, 활동 기록, 저장 상태가 같음. 마지막 파일 전부도 같음 |

`storage.json` 단계: 가이드 생성, 편집(1분·2분·11분 간격으로 기록 생성 여부), 같은 페이지 52번 편집(기록 50개로 정리), 기록 목록, 기록 복원(현재 판을 먼저 보관), 다른 앱의 편집, 자기 쓰기가 감시로 돌아온 경우(무시), 새 파일 3개와 숨은 폴더, 이름 바꾸기(삭제와 생성이 함께 옴), 삭제, 폴더 삭제, 저장 안 된 편집이 있을 때 다른 앱의 편집(거절 후 충돌, 디스크 판을 기록에 보관), 보호(평문 기록 삭제), 암호화된 페이지 편집, 잠그기, 틀린 비밀번호, 열기, 연 뒤 편집(암호화 페이지는 기록을 남기지 않음), 보호 해제, 첨부 파일 5개(이름 겹침, 쓸 수 없는 글자, 확장자 없음, 점으로 시작), 첨부 파일 삭제, 메타 쓰기와 거절되는 이름.

비교가 실제로 일어나는지 보려고 기록 간격을 9분으로, 외부 편집 페이지의 제목 규칙을 다르게 바꿔 보았고, 둘 다 파일 작업과 패치 비교에서 실패했다(되돌림).

## 구현 내용

- `Core/Vault/PageEncryption.swift`: PBKDF2-SHA256은 CommonCrypto `CCKeyDerivationPBKDF`, AES-256-GCM은 CryptoKit. WebCrypto의 출력(암호문 뒤에 16바이트 태그)과 `SealedBox.ciphertext + tag`가 같은 형식이다. base64 해석은 `atob`의 forgiving-base64 규칙을 따른다.
- `Core/Session/SaveQueue.swift`: Morrow 저장 큐의 상태 기계. 타이머는 `SaveTimer`로 주입한다. Swift의 쓰기는 동기 호출이라 쓰기가 겹치지 않는다.
- `Core/Session/VaultWriter*.swift`: 암호화된 페이지 쓰기와 열쇠(메모리에만), 기록 파일 읽기·쓰기·정리, 충돌 때 디스크 판 보관, `readChanges`와 확정, 첨부 파일·메타·활동 기록. `VaultBridge`에 `readText`, `readBytes`, `createFile`, `exists`, `listFiles`를 더했다.
- `Core/Session/CoreSession.swift`: 저장 큐 연결, 기록 시점(10분), 열기·잠그기·보호·해제, 기록 복원·가져오기, 첨부 파일. 외부 편집은 읽기(`readChanges`)·적용(`applyExternal`)·확정(`commitExternal`) 세 단계로 나눴다. 11c-2에서 웹이 받아들일 페이지를 정하고, Swift는 그 페이지만 적용하고 확정한다.

## 알려진 차이

- 11a의 알려진 차이(YAML 특수 태그 등)는 그대로다.
- 암호화 머리말의 `iterations`가 유한한 32비트 정수가 아니면 Morrow(WebCrypto)는 예외를 던지고 Swift는 열쇠를 만들지 못해 열기가 실패한다. 둘 다 페이지를 열지 못한다는 결과는 같다.

## 참고사항

- 비교 자료의 비밀번호는 비교 자료 전용 값이다. 시뮬레이터 시험 vault의 비밀번호는 쓰지 않았다.
- iOS 시뮬레이터 단위 테스트는 11a·11b와 같은 이유로 시작되지 않아 macOS에서만 돌렸다.
