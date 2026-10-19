# 10단계 배포 준비 검증 결과 (개발자 팀 없이)

- 날짜: 2026-10-19
- 브랜치: `feat/release`(기준 `feat/settings`)
- 환경: Xcode 27.0(macOS SDK 26, iOS SDK 26), 시뮬레이터 iPhone 17 Pro Max(440pt), iPhone SE 3세대(375pt, 이 점검을 위해 만듦)
- 하지 못한 것: 서명한 빌드, 실기기 설치, TestFlight, macOS 공증, App Store Connect 업로드 검증. 모두 Apple 개발자 팀이 필요하다(사용자 결정으로 보류). 절차는 `docs/release/checklist.md`.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` / `test` | 통과, 42개 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 90개(`SyncDiscovery.text` 테스트 추가) |
| `xcodebuild archive -configuration Release -destination 'generic/platform=macOS' CODE_SIGNING_ALLOWED=NO` | 성공, 경고 0 |
| `xcodebuild archive -configuration Release -destination 'generic/platform=iOS' CODE_SIGNING_ALLOWED=NO` | 성공, 경고 0 |
| `plutil -lint App/PrivacyInfo.xcprivacy` | OK |

## archive 내용

| 항목 | macOS | iOS |
|---|---|---|
| `CFBundleShortVersionString` / `CFBundleVersion` | 0.1.0 / 1 | 0.1.0 / 1 |
| 아이콘 | `AppIcon.icns`, `Assets.car`, `CFBundleIconName = AppIcon` | `Assets.car`의 `IconImageStack` 라이트·다크·틴트, 다크용 `graph-dark` 벡터, `CFBundleIcons` |
| `PrivacyInfo.xcprivacy` | 있음 | 있음 |
| `NOTICE`, `Morrow-Apache-2.0.txt`, `Editor/THIRD_PARTY_LICENSES.txt` | 있음 | 있음 |
| App Intents 메타데이터 | `Metadata.appintents` | `Metadata.appintents`, 문구 "Add a quick note in ${applicationName}" |
| `MinimumOSVersion` | — | 26.0 |
| `NSAccentColorName` | AccentColor | AccentColor |

## 고친 것

1. **버전이 세 곳**: Info.plist가 1.0·1로 고정되어 About이 "1.0 (1)"을 보였다. Info.plist와 편집기 번들이 `project.yml`의 값을 쓴다.
2. **편집기 번들이 다시 빌드되지 않을 수 있음**: `build-editor.sh`가 `web/sampleRenames.ts`(9단계 가이드 수정)와 `project.yml` 변경을 보지 않았다. 감시 목록에 더했다.
3. **Release 경고**: `PDFExporter`의 `UIWindow(frame:)`(iOS 26 deprecated)를 앱 scene의 `UIWindow(windowScene:)`로, `SyncDiscovery`의 `String(cString:)`을 null 앞까지 읽는 `String(decoding:as:)`로.
4. **iPhone SE에서 Quick Note 제목이 "Quick N…"으로 잘림**: iOS 확인 버튼을 Add로 줄였다(VoiceOver는 "Add to Today").
5. **좁은 iPhone의 도구 막대**: 저장 상태를 compact 폭에서는 아이콘만 보인다. SE(375pt)에서 검색·집중·페이지 메뉴·검사기·저장 상태가 한 줄에 들어간다.

## iPhone 점검 (시뮬레이터)

| 항목 | 결과 | 비고 |
|---|---|---|
| 도구 막대 | 통과 | Pro Max는 "Saved" 글까지, SE는 아이콘만 |
| 첫 실행 | 통과 | SE에서 New Folder on This Device → 가이드 17페이지, 홈 카드 한 줄 배치 |
| 가이드 페이지, 커버 | 통과 | 커버 높이, Change cover, 아이콘이 커버에 걸침, 본문 줄바꿈 |
| Quick Note | 통과 | `synapsenote://capture` → 시트(키보드와 함께 큰 크기) → 한글 "우유 사기" → `Journal/2026-10-19.md`에 `**오후 08:31** 우유 사기` |
| 설정 시트 | 통과 | 강조색은 다음 줄로 내려감. New Quick Note가 설정을 닫고 Quick Note를 연다 |

## 앱 아이콘 (Icon Composer)

- 레이어 SVG(`design/app-icon/`)를 `scripts/make-icon.swift`가 그리고, Icon Composer에서 `App/AppIcon.icon`으로 묶었다. 그룹은 앞에서부터 Writing(그래프, 글줄)과 Page(페이지)다. Icon Composer는 사이드바 위쪽 그룹을 앞에 그린다.
- "Add Layer"와 색 선택은 펼침 메뉴라 백그라운드 조작이 되지 않아, 레이어와 색 값은 `icon.json`에 쓰고 Icon Composer로 열어 미리보기로 확인한 뒤 Icon Composer로 다시 저장했다. `icon.json` 키 이름은 Apple 명세가 없어 커뮤니티 분석([icon-composer-template](https://github.com/peterpoliwoda/icon-composer-template))을 참고했고, 기본 `fill`이 있으면 다크 `fill-specializations`가 무시되는 것을 확인해 기본값도 specialization 배열에 넣었다.
- 다크 모양: iPhone 17 Pro Max 시뮬레이터 홈 화면을 Customize > Dark로 바꿔 시스템 앱과 비교했다. 시스템 앱은 무채색 검정 배경에 주 도형이 브랜드 색을 유지한다(Messages는 라이트의 초록 배경이 다크에서 초록 말풍선이 된다). 처음 만든 남색 배경·회색 페이지는 이와 달라, 배경을 `system-dark`로, 페이지를 브랜드 그러데이션으로, 글줄과 그래프를 흰색으로 바꿨다.
- archive: `Assets.car`에 `IconImageStack` 라이트·다크·틴트(`ISAppearanceTintable`)와 그룹·벡터 레이어가 들어 있다. macOS는 `AppIcon.icns`도 만들어진다.

## 사용자 확인 요청

1. 앱 아이콘을 쓸지 정한다. Icon Composer로 `App/AppIcon.icon`을 열면 기본·다크·모노 모양을 볼 수 있다.
2. 수출 규정 값(`ITSAppUsesNonExemptEncryption`)을 정한다. 판단 자료는 `docs/release/checklist.md`.
3. 개발자 팀이 생기면 체크리스트의 "팀이 생긴 뒤"와 "실기기에서 확인할 것"을 진행한다.
