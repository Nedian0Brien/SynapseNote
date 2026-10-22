# Spec: 9단계 설정, 모양, 커버, 빠른 메모, 첫 실행 가이드

상위 intent: `intent_morrow-full-port.md` (수락됨). 기준은 Morrow a2daae1의 다음 파일이다.

- `src/app/components/Dialogs.tsx`(`SettingsDialog`, `AttachmentsSection`, `CustomCssSetting`), `src/app/platform/preferences.ts`, `src/app/customCss.ts`
- `src/app/components/Cover.tsx`, `PageView.tsx` 140~190행, `Home.tsx`(`PageCard`)
- `src/app/components/CaptureDialog.tsx`, `operations.ts`(`captureToToday`), `electron/main.cts` 119~133행(전역 단축키)
- `src/core/sample.ts`(`sampleCommands`), `src/main.tsx` 55~70행(첫 실행에 가이드 넣기)
- `src/app/actions.ts`의 `view.theme`(Mod+Shift+L), `capture`

## 설계 결정

- **설정은 네이티브 화면이다.** macOS는 `Settings` 장면의 탭(General, Appearance, Data, Sync, About), iOS·iPadOS는 시트 하나의 `Form`(구역은 같고 Sync는 그 안의 링크)이다. Morrow 문구를 쓰되 "computer"처럼 Apple 기기에 맞지 않는 말은 "device"로 바꾼다.
- **설정 값은 앱이 가진다.** 이름, 테마, 글꼴, 폭, 강조색, 색 있는 페이지는 `UserDefaults`에 두고, 바뀔 때마다 편집기에 `preferences` 메시지로 보낸다. 편집기는 Morrow의 `setPreferences`에 넣고 루트의 `data-accent`·`data-colorful`을 바꾼다. 페이지의 `font-*`·`width-*` 클래스는 `usePreferences()`에서 읽는다(지금은 `font-sans width-comfortable` 고정).
- **테마는 창 전체에 적용한다.** macOS는 `NSApp.appearance`, iOS는 `preferredColorScheme`. 편집기는 지금처럼 `colorScheme`을 따라 `theme` 메시지를 받는다. ⇧⌘L은 Morrow처럼 지금 보이는 테마의 반대로 바꾼다.
- **사용자 CSS는 vault의 `.morrow/style.css`다.** Morrow의 `loadCustomCss`를 vault를 열 때 부르고, 편집기가 읽은 내용을 앱에 알린다. 설정의 편집 시트는 입력하는 대로 미리 보이고(`previewCustomCss`), Save는 `saveCustomCss`, Discard는 저장된 것으로 되돌린다. 네이티브 화면(사이드바 등)에는 적용되지 않고 페이지에만 적용된다는 것을 설명 문구에 쓴다.
- **커버는 Morrow 컴포넌트를 그대로 쓴다.** 페이지 머리에 `CoverBanner`, Add cover(`CoverPicker`, 그러데이션 12개와 이미지). 홈의 카드는 `page.cover`가 있으면 그 그러데이션이나 이미지(vault 파일)를 보인다.
- **빠른 메모는 네이티브 시트다.** Morrow `CaptureDialog`의 문구(Quick note, Add to today, ⌘↩)를 쓰고, 편집기의 `captureToToday`에 넘긴다. 들어가면 Morrow 알림 "Added to today's note."가 뜬다.
  - 앱 안: 동작 `capture`(⌥⌘M).
  - macOS 전역 단축키 ⌥⌘M: Carbon `RegisterEventHotKey`. 손쉬운 사용 권한 없이 샌드박스에서 동작한다([M. Tsai 2012](https://mjtsai.com/blog/2012/05/17/hotkeys-and-the-mac-app-store/), [rcmd 사례](https://mjtsai.com/blog/2021/12/29/rcmd-vs-the-mac-app-store)). Morrow처럼 창을 앞으로 가져오고 시트를 연다. General에서 끌 수 있다(Morrow에는 없는 설정, 다른 앱의 ⌥⌘M을 가져가므로 둔다).
  - iOS·iPadOS: URL `synapsenote://capture`와 App Intent "Quick Note"(`supportedModes = .foreground(.immediate)`, iOS 26에서 `openAppWhenRun`을 대신함, [Apple 문서](https://developer.apple.com/documentation/appintents/appintent/supportedmodes)). macOS에서도 같은 Intent를 쓴다.
- **첫 실행 가이드를 넣는다.** vault가 처음 열리고(`session.firstRun`) 동기화 복사본이 아니면 `sampleCommands`를 넣는다. 가이드 문장은 빌드할 때 `RENAMED`로 고친다: 이름 Morrow → SynapseNote, Windows·Linux 단축키 표를 Apple 단축키 한 열로, Ctrl·Alt 단축키를 이 앱의 단축키로(⌘N, ⇧⌘D, ⌘K, ⇧⌘G, ⌥⌘T, ⇧⌘R, ⇧⌘F, ⌃⌘S, ⌥⌘M, ⇧⌘L, ⌘,), 이 앱에서 다르게 하는 조작(사이드바의 + 버튼, 가운데 클릭, 휠 확대)을 이 앱의 조작으로. "Free and open source" 문장은 이 저장소의 라이선스가 정해지지 않았으므로 빼고 다른 사실로 바꾼다. vitest로 가이드에 Morrow, Ctrl, Alt, Windows가 남지 않았는지 확인한다.
- **About은 이 앱의 라이선스를 주장하지 않는다.** 버전, "no accounts, no tracking, no ads and no AI features", Morrow(Apache License 2.0)를 바탕으로 한다는 것, Morrow 라이선스·NOTICE·번들 라이선스(`THIRD_PARTY_LICENSES.txt`)를 보는 시트.

## 요구사항

1. General: Your name(홈 인사 "Good morning, 이름."), macOS 전역 빠른 메모 켜고 끄기.
2. Appearance: Theme(System/Light/Dark), Writing font(Serif/Sans/Mono), Page width(Comfortable/Wide), Accent colour 8개, Colourful pages, Custom CSS.
3. Data: vault 위치와 Show(macOS)/Open another, Save a backup, Restore a backup, Export as Markdown, Import Markdown(Morrow 설명 문구), Images and files(개수·크기, Remove N unused).
4. 커버 추가·바꾸기·지우기, 홈 카드에 커버.
5. 빠른 메모: 앱 안 ⌥⌘M, macOS 전역 ⌥⌘M, iOS URL과 Intent. vault가 아직 열리지 않았으면 열린 뒤에 시트를 연다.
6. 첫 실행 가이드, 테마 바꾸기 ⇧⌘L.

## 받아들이는 기준

- vitest: 가이드 문장 검사, 설정 메시지 적용. Swift 테스트: 설정 저장·읽기, URL 해석.
- iPad 시뮬레이터에서 설정 변경이 페이지와 창에 보이고, 커버·빠른 메모·가이드가 동작하는 것을 확인해 `docs/verification/phase9-settings.md`에 적는다. macOS 전역 단축키는 화면이 잠겨 있으면 빌드·테스트까지만 확인했다고 적는다.

## 범위 밖

- 편집기 안의 글쓰기 단축키 목록 변경(Morrow 편집기 그대로), 위젯
