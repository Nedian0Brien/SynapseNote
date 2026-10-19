# Spec: 8단계 기기 간 동기화

상위 intent: `intent_morrow-full-port.md` (수락됨). 기준은 Morrow a2daae1의 다음 파일이다.

- `src/core/sync.ts`(`planPull`, `conflictName`, `isSyncedPath`), `src/app/sync.ts`(한 번의 pull, 자동 동기화, 볼트 복사)
- `electron/sync.cts`(발견, 페어링, 암호화, HTTP 요청), `electron/vault.cts` 418~540행(매니페스트, `writeSyncedFile`, `vault.json`, 동기화 기준)
- `src/app/components/SyncSettings.tsx`(설정 구역, 페어링 대화상자)

## 설계 결정

- **Morrow 프로토콜을 그대로 옮긴다.** Morrow 데스크톱과 SynapseNote 기기가 서로 동기화할 수 있어야 하므로 포트(47610, 대체 47612·47613·임의), 경로(`/morrow/v1`), 키 유도(HKDF-SHA256 `morrow-sync-v1`, PBKDF2-SHA256 20만 회 `morrow-pair:<기기 id>`), 봉투(`{iv, data=암호문‖태그}`, 안쪽 `{ts, nonce, payload}`, 5분 시각 차, 재사용 거부), 요청(`hello`·`manifest`·`get`·`pull`), 오류 문구를 같게 한다. 이 문자열들은 파일·통신 형식이라 이름을 바꾸지 않는다.
- **기기 찾기는 Bonjour를 함께 쓴다(사용자 결정, 2026-10-19).**
  - iOS·iPadOS에서 UDP 브로드캐스트를 보내거나 받으려면 Apple 승인이 필요한 제한 entitlement `com.apple.developer.networking.multicast`가 필요하다([Apple entitlement 문서](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.developer.networking.multicast), [Apple 개발자 포럼](https://developer.apple.com/forums/thread/655920)).
  - macOS: Morrow처럼 47611 브로드캐스트를 보내고 받으며, Bonjour `_synapsenote-sync._tcp`도 알린다.
  - iOS·iPadOS: Bonjour로 SynapseNote 기기를 찾는다. Morrow 데스크톱과는 주소를 입력해 페어링한다(Morrow 페어링 대화상자에도 있는 방법). 페어링 뒤에는 Morrow처럼 마지막 주소로 요청한다.
- **동기화 엔진은 Swift에서 돈다.** 네트워크·암호·파일 작업이 모두 앱 쪽이다. `planPull`·`conflictName`·`isSyncedPath`를 Swift로 옮기고, TS 코어를 node로 돌린 결과와 같은지 테스트한다. pull 전에 편집기의 저장을 끝내고(`window.synapse.flush`), pull 뒤에는 바뀐 파일을 편집기에 바로 알린다(iOS의 감시자는 같은 앱의 쓰기를 보지 못한다).
- **비밀값은 키체인에 둔다.** Morrow는 `sync.json`에 페어링 비밀값을 둔다. 여기서는 기기 이름·id·켜짐·상대 목록은 앱 지원 폴더의 `sync.json`에, 상대별 32바이트 비밀값은 키체인에 둔다. 백업이나 복사본에 비밀값이 섞이지 않게 하려는 것이다.
- **설정 화면**: macOS `Settings` 장면에 Sync 탭을 만든다(9단계에서 다른 탭을 더한다). iOS·iPadOS는 볼트 메뉴와 동작 표에서 시트로 연다.

## 요구사항

1. 설정: 이 네트워크에서 동기화(켜고 끄기), 이 기기 이름, 페어링한 기기 목록(이 네트워크에 있음/최근에 보이지 않음, 마지막 동기화), Sync now, Copy its vault here, Forget.
2. 페어링: 이 기기의 코드(XXXX-XXXX-XXXX-XXXX, 10분, 5회), 코드를 보여 주는 기기 목록, 주소 입력, 코드 입력. Morrow 안내 문구를 쓴다.
3. 동기화: Morrow `pullFrom`과 같은 순서(hello로 같은 볼트인지 확인 → 저장 끝내기 → 매니페스트 → 계획 → 받기·지우기·충돌 사본 → 기준 저장 → 상대에게 pull 요청). 충돌 파일 이름, 알림 문구가 Morrow와 같다.
4. 자동: 시작 5초 뒤, 90초마다, 저장 12초 뒤, 상대의 pull 요청을 받을 때.
5. 볼트 복사: 비어 있는 폴더를 상대 볼트의 복사본으로 준비해 열고 pull 한다.
6. 서버는 앱이 앞에 있을 때만 돈다(iOS 백그라운드 제약).

## 받아들이는 기준

- 테스트: 암호(node로 만든 값과 양방향 비교), `planPull` 일치(Morrow 테스트 사례와 node로 만든 사례), 매니페스트·`isSyncedPath`, 한 프로세스 안의 두 서비스가 루프백으로 페어링·pull·충돌·pull 요청을 주고받는 통합 테스트.
- iPad와 iPhone 시뮬레이터로 페어링하고 양쪽 vault 파일이 같아지는 것을 확인해 `docs/verification/phase8-sync.md`에 적는다. Morrow 데스크톱과 실제로 주고받는 것은 시험하지 않았음을 적는다.

## 범위 밖

- 인터넷을 거치는 동기화(Morrow에도 없다), iOS 백그라운드 동기화
