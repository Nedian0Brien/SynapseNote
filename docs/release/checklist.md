# 배포 체크리스트

10단계(2026-10-19)에서 개발자 팀 없이 할 수 있는 준비를 마쳤다. 아래 "팀이 생긴 뒤" 항목은 Apple Developer Program 가입과 Team ID가 있어야 한다.

## 이미 된 것

| 항목 | 위치 |
|---|---|
| 버전 한 곳: `MARKETING_VERSION`(0.1.0), `CURRENT_PROJECT_VERSION`(1) | `project.yml` → Info.plist, 편집기 번들 `__APP_VERSION__` |
| 개인정보 매니페스트: 추적·수집 없음, 파일 시각 C617.1·3B52.1·DDA9.1, UserDefaults CA92.1 | `App/PrivacyInfo.xcprivacy` |
| 앱 아이콘(임시안), AccentColor | `App/Assets.xcassets`, 다시 그리기: `swift scripts/make-icon.swift` |
| 로컬 네트워크 권한 문구, Bonjour 서비스, `NSAllowsLocalNetworking` | `project.yml` info |
| macOS 샌드박스 entitlements(네트워크 client·server, 사용자가 고른 파일, 북마크), Hardened Runtime | `App/SynapseNote-macOS.entitlements`, `project.yml` |
| URL scheme `synapsenote`, App Intent "Quick Note" | `project.yml`, `App/Sources/QuickNote/` |
| 라이선스 고지: NOTICE, Morrow Apache 2.0, 번들 라이선스 | 앱 리소스, 설정 > About > Licences |
| Release archive(서명 없이) macOS·iOS 성공, 경고 0 | `docs/verification/phase10-release-prep.md` |

제한 entitlement는 필요 없다. iOS는 UDP 브로드캐스트(`com.apple.developer.networking.multicast`) 대신 Bonjour를 쓴다(8단계 결정).

## 사용자가 정할 것

1. **앱 아이콘**: 지금 아이콘은 임시안이다(Ocean→Violet 그러데이션, 세 점이 이어진 페이지). 바꾸려면 `scripts/make-icon.swift`를 고치거나 `App/Assets.xcassets/AppIcon.appiconset`의 PNG를 바꾼다.
2. **수출 규정(`ITSAppUsesNonExemptEncryption`)**: Info.plist에 넣지 않았다. 넣지 않으면 App Store Connect가 업로드마다 묻는다.
   - Apple 기준([Complying with Encryption Export Regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations)): 앱(링크한 라이브러리 포함)이 암호를 쓰지 않거나 문서 제출이 면제되는 암호만 쓰면 `NO`, 아니면 `YES`. OS에 들어 있는 암호를 쓰는 것은 보통 문서 제출이 면제되고, 독자 암호는 면제되지 않는다. 면제되는 암호만 써도 미국 정부에 연말 자기 분류 보고서를 내야 할 수 있다.
   - 이 앱의 암호: 페이지 암호화는 WebKit의 WebCrypto(AES-256-GCM, PBKDF2-SHA256), 기기 간 동기화는 CryptoKit(AES-256-GCM, HKDF-SHA256)과 CommonCrypto(PBKDF2-SHA256). 모두 OS가 제공하는 표준 알고리즘이고, 목적은 사용자 데이터의 기밀성이다(인증만을 위한 것이 아니다).
   - 법적 판단이므로 값을 정하지 않았다. 판단한 뒤 `project.yml` info properties에 `ITSAppUsesNonExemptEncryption: false` 또는 `true`(그리고 받은 코드는 `ITSEncryptionExportComplianceCode`)를 넣는다.
3. **저장소 라이선스**: 아직 정하지 않았다(README). About과 첫 실행 가이드는 이 앱의 라이선스를 말하지 않는다.

## 팀이 생긴 뒤

1. Apple Developer Program 가입, Team ID 확인.
2. `project.yml`
   - 두 target(`SynapseNote`, `SynapseNoteTests`)의 `CODE_SIGN_STYLE: Manual`, `CODE_SIGN_IDENTITY: "-"`를 지우고 `CODE_SIGN_STYLE: Automatic`, `DEVELOPMENT_TEAM: <Team ID>`를 넣는다.
   - `xcodegen generate`.
3. Certificates, Identifiers & Profiles에서 bundle ID `com.synapsenote.native`(iOS·macOS 같은 ID, Universal Purchase)를 등록한다. 따로 켤 capability는 없다(App Sandbox와 Hardened Runtime은 Xcode가 서명할 때 넣는다).
4. App Store Connect에서 앱 기록을 만든다(iOS, macOS). 설명·키워드·개인정보 라벨은 `docs/release/app-store.md` 초안을 쓴다.
5. archive: Xcode Organizer, 또는 `xcodebuild archive -scheme SynapseNote -configuration Release -destination 'generic/platform=iOS'`(macOS도 같다). archive 기계에 node 20.19 이상이 있어야 한다(편집기 번들을 만드는 pre-build script, `scripts/build-editor.sh`).
6. 업로드와 검증: Organizer의 Validate·Distribute, 또는 `xcodebuild -exportArchive`(`method: app-store-connect`). 업로드 검증에서 아이콘·매니페스트·entitlement 문제가 나오면 여기서 고친다.
7. TestFlight 내부 테스트, 실기기 확인(아래).
8. (선택) App Store 밖에서 macOS 배포: Developer ID 서명과 `notarytool` 공증.

## 실기기에서 확인할 것

시뮬레이터로 대신하지 못한 것들이다.

- 로컬 네트워크 권한 묻기, iPhone·iPad·Mac 사이 Bonjour 페어링과 동기화, Mac 브로드캐스트로 Morrow 데스크톱과 페어링
- Files 앱의 vault(iCloud Drive 폴더 포함), 다른 앱이 고친 파일 감지
- 한글 입력(물리 키보드, 소프트웨어 키보드), Apple Pencil 캔버스 그리기
- PDF 내보내기와 공유, 백업 저장·복원
- macOS 전역 ⌥⌘M, 설정 창, 메뉴 막대 단축키
- 단축어 앱·Siri의 "Quick Note"
- 큰 vault(수천 페이지)에서 여는 시간과 검색
