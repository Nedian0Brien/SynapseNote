# Spec: 10단계 배포 준비 (개발자 팀 없이 할 수 있는 것)

상위 intent: `intent_morrow-full-port.md` (수락됨). 사용자 결정(2026-10-19): Apple 개발자 팀이 아직 없으므로 서명·TestFlight는 미루고, 팀 없이 할 수 있는 준비부터 한다.

## 범위

할 것:

1. **버전 한 곳**: `project.yml`의 `MARKETING_VERSION`·`CURRENT_PROJECT_VERSION`을 Info.plist(`$(MARKETING_VERSION)`, `$(CURRENT_PROJECT_VERSION)`)와 편집기 번들(`__APP_VERSION__`)이 함께 쓴다. 지금 Info.plist는 1.0·1로 고정이라 About이 "1.0 (1)"을 보인다.
2. **편집기 번들 다시 빌드 조건**: `scripts/build-editor.sh`가 `web/sampleRenames.ts` 변경을 보지 못해 가이드 수정이 앱에 들어가지 않을 수 있다. 감시 목록에 더한다.
3. **개인정보 매니페스트** `PrivacyInfo.xcprivacy`: 추적 없음, 수집하는 데이터 없음, 사유가 필요한 API 두 가지([Apple 사유 코드 문서](https://developer.apple.com/documentation/bundleresources/app-privacy-configuration/nsprivacyaccessedapitypes/nsprivacyaccessedapitypereasons)).
   - 파일 시각(`creationDate`, `contentModificationDate`): C617.1(앱 문서 폴더 vault), 3B52.1(사용자가 고른 폴더), DDA9.1(페이지의 수정 시각이 파일 mtime에서 오고 "N분 전"으로 보인다. Morrow `core/vault/load.ts` 217행). 동기화는 해시만 보내므로 시각이 기기 밖으로 나가지 않는다.
   - UserDefaults: CA92.1(앱 자신의 설정만).
4. **앱 아이콘**: 지금 asset catalog가 없다. Icon Composer 형식 `App/AppIcon.icon`(레이어 분리, 기본·다크·틴트 모양, 사용자 요청 2026-10-19)과 `App/Assets.xcassets`의 AccentColor(Ocean). 레이어는 `scripts/make-icon.swift`로 그려 다시 만들 수 있게 한다. 디자인은 사용자가 출시 전에 정한다.
5. **Release 구성**: macOS·iOS Release 빌드와 서명 없는 archive(`CODE_SIGNING_ALLOWED=NO`)가 성공하고, archive 안에 버전·아이콘·매니페스트·NOTICE·라이선스·App Intents 메타데이터가 들어 있는지 확인한다. 경고(`PDFExporter.swift`의 `UIWindow(frame:)` deprecation)를 없앤다.
6. **iPhone 좁은 화면 점검**: 7~9단계는 iPad에서 확인했다. iPhone 시뮬레이터에서 도구 막대(항목 5개), 설정 시트, Quick Note 시트(키보드), 커버를 본다. 실기기 검증을 대신하는 가장 가까운 확인이다.
7. **배포 문서** `docs/release/`: 팀이 생긴 뒤의 절차(Team ID, 자동 서명, 프로비저닝, macOS 공증, TestFlight, archive 기계에 node 필요), App Store 설명·개인정보 라벨("Data Not Collected") 초안, App Review 메모(로컬 네트워크 권한, `synapsenote://`, 두 기기로 동기화 시험, 계정 없음).
8. **수출 규정**: `ITSAppUsesNonExemptEncryption`은 정하지 않는다. 법적 판단이라 사용자가 정한다. Apple 기준([Complying with Encryption Export Regulations](https://developer.apple.com/documentation/security/complying-with-encryption-export-regulations))과 이 앱의 암호(페이지 암호화: WebCrypto AES-GCM·PBKDF2, 동기화: CryptoKit AES-GCM·HKDF, CommonCrypto PBKDF2. 모두 OS가 제공)를 문서에 적고 두 값의 뜻을 제시한다.

미루는 것(팀 필요): 서명, 실기기 설치, macOS 공증, App Store Connect 등록·업로드·검증, TestFlight.

## 받아들이는 기준

- 웹 검사와 macOS 테스트 통과, macOS·iOS Release archive 성공, archive 내용 확인.
- iPhone 시뮬레이터 점검 결과와 고친 것을 `docs/verification/phase10-release-prep.md`에 적는다. 하지 못한 것(서명·기기·TestFlight·공증·업로드 검증)을 그대로 적는다.
- 로드맵 10단계는 "준비 완료, 팀 필요 항목 보류"로 적는다.
