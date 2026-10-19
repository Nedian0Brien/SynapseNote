# 9단계 설정, 모양, 커버, 빠른 메모, 첫 실행 가이드 검증 결과

- 날짜: 2026-10-19
- 브랜치: `feat/settings`(기준 `feat/sync`)
- 환경: Xcode 27.0, iOS 27.0 iPad Pro 13-inch (M5) 시뮬레이터
- 시험 vault: 앱 문서 폴더의 시험 vault, Files의 On My iPad에 새로 만든 빈 폴더(`Expor/untitled folder`)
- macOS 앱은 빌드와 단위 테스트까지 확인했다. 설정 창, 전역 ⌥⌘M, `NSApp.appearance`는 화면에서 조작하지 않았다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 42개 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 89개 |

새 테스트:

- **가이드 문장**(`web/src/guide.test.ts`): vite 설정의 `RENAMED`를 거친 `sampleCommands`의 모든 글에 Morrow, Ctrl, Alt, Windows, Linux, middle click이 없고, 이 앱의 단축키(⌘N, ⌘K, ⇧⌘D, ⌥⌘M, ⇧⌘G, ⌥⌘T, ⇧⌘R, ⇧⌘F, ⇧⌘L, ⌃⌘S)가 있으며, "open source"라고 말하지 않는다. `RENAMED`의 한 쌍이라도 Morrow 원문과 맞지 않으면 빌드가 멈춘다.
- **메시지**(`bridge.test.ts`, `EditorBridgeTests`): `preferences`(Morrow `preferences.ts`가 받는 값만, 이름 60자), `previewCss`·`saveCss`, `capture`, `openVault`의 `guide`, `customCss` 이벤트.
- **설정**(`SettingsTests.swift`): Morrow 기본값, 저장 후 다시 읽기, 모르는 값은 기본값, 이름 다듬기, ⇧⌘L이 보이는 테마의 반대로 바꾸기, `synapsenote://capture` 해석, `gradient-N` 커버 해석.

## 기능 (iPad 시뮬레이터)

| 항목 | 결과 | 확인 방법 · 비고 |
|---|---|---|
| 설정 시트 | 통과 | 사이드바 볼트 메뉴 > Settings…. You, Quick note, Appearance, Your Data, Sync, About |
| 이름 | 통과 | "Dennis" 입력 → 홈 "Good evening, Dennis.", 앱을 다시 실행해도 유지 |
| 테마 | 통과 | Dark → 창(사이드바, 도구 막대, 시트)과 편집기 모두 어둡게 |
| 글꼴·강조색 | 통과 | Serif → 페이지 제목과 본문이 Source Serif, Rose → 가이드 제목이 장미색 |
| 사용자 CSS | 통과 | `.page-title { color: #e5484d; }` 저장 → 행이 On, vault의 `.morrow/style.css`에 같은 글, 다른 vault에는 적용되지 않음 |
| Images and files | 통과 | "1 file, 1 KB" (attachments 파일 1개) |
| 설정에서 백업 저장 | 통과 | Save a backup → 설정 시트가 닫히고 저장 대화상자 → `synapsenote-backup-2026-10-19-2001.json` |
| 커버 | 통과 | Add cover → 그러데이션 12개와 Use an image → gradient-8 선택 → 페이지 위 커버, 터치 화면에서 Change cover 보임, 파일 머리말 `cover: gradient-8`, 홈 카드가 같은 그러데이션 |
| 빠른 메모 | 통과 | `xcrun simctl openurl … synapsenote://capture` → 시스템 확인 → Quick Note 시트(입력 칸에 포커스) → "Buy oat milk" → Add to Today → 알림 "Added to today's note.", `Journal/2026-10-19.md` 끝에 `**07:58 PM** Buy oat milk` |
| 첫 실행 가이드 | 통과 | 빈 폴더를 vault로 열기 → `Welcome to SynapseNote` 아래 10개 장, Reading list 데이터베이스(책 4권), Ideas board 캔버스. vault 전체 파일에 Morrow, Ctrl, Alt, Windows 없음. "Make it yours"에 ⌘ ,, ⇧ ⌘ L, ⌘ T, ⌃ Tab, ⌃ ⌘ S |
| 페이지 메뉴 버튼 | 통과 | 도구 막대의 ⋯ → 메뉴 막대 Page 메뉴와 같은 항목. 홈에서는 비활성 |
| App Intent "Quick Note" | 미확인 | Shortcuts 앱과 Siri에서 실행하지 않았다. URL로 같은 요청 경로(`QuickNoteRequests`)는 확인 |
| macOS 설정 창·전역 ⌥⌘M | 미확인 | 빌드와 테스트만 |

## 고친 문제

1. **Custom CSS 행이 비활성으로 남음.** `style.css`가 비어 있으면 읽은 값이 처음 값('')과 같아 편집기가 앱에 알리지 않았다. vault가 열린 때에도 알린다.
2. **Custom CSS를 누르면 설정 시트가 닫힘.** 폼 구역 안에 붙인 `.sheet`가 열리는 대신 설정 시트를 닫았다. 사용자 CSS 시트를 설정 화면 최상위에서 띄운다.
3. **설정 시트가 작음, 빈 Quick note 구역, vault 위치가 sandbox 경로로 보임.** iOS 설정 시트를 page 크기로, Quick note 구역에 New Quick Note 행, vault는 이름으로 보인다.
4. **가이드의 `•••` 메뉴가 열린 페이지에 없음.** 페이지 동작이 사이드바 길게 누르기와 메뉴 막대에만 있었다. 도구 막대에 페이지 메뉴 버튼을 더했다.

## 기록해 둘 동작

- 사용자 CSS는 편집기 페이지에만 적용된다. 사이드바, 홈, 그래프 같은 네이티브 화면은 SwiftUI라서 적용되지 않는다(설정 설명에 적음).
- macOS 전역 ⌥⌘M은 Morrow처럼 다른 앱의 ⌥⌘M(Finder의 모든 윈도우 최소화 등)을 가져간다. General에서 끌 수 있다(Morrow에는 없는 설정). 다른 앱이 이미 쓰고 있으면 등록되지 않고 앱 안에서만 동작한다.
- 가이드의 하이라이트 단축키(Morrow ⇧⌘H)는 이 앱에서 Go to Home과 겹쳐 가이드에서 뺐다.
- 동기화로 채울 빈 폴더에는 가이드를 넣지 않는다(Morrow와 같음).

## 사용자 확인 요청

1. macOS에서 Settings(⌘,)의 다섯 탭, Theme가 메뉴와 창 전체에 적용되는지 확인한다.
2. 다른 앱이 앞에 있을 때 ⌥⌘M을 눌러 SynapseNote가 앞으로 오고 Quick Note 시트가 열리는지 확인한다.
3. iPhone·iPad의 Shortcuts 앱에서 "Quick Note"를 실행해 본다.
