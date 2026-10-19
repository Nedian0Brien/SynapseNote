# Plan: 9단계 설정, 모양, 커버, 빠른 메모, 첫 실행 가이드

spec: `spec_phase9-settings.md`. 브랜치 `feat/settings`(기준 `feat/sync`), 워크트리 `.worktree/settings`.

## 순서

1. **편집기** (`web/src`)
   - `main.tsx`: 메시지 `preferences`(Morrow `setPreferences`와 루트 dataset), `previewCss`·`saveCss`, `capture`(`captureToToday` + Morrow 알림), `openVault`의 `guide`(첫 실행에 `sampleCommands`), vault를 연 뒤 `loadCustomCss`와 `customCss` 알림, 쿼리 `files`(개수·크기·안 쓰는 파일 수)
   - `font-*`·`width-*`를 `usePreferences()`로(`main.tsx`, `EditorApp.tsx`, `DatabasePage.tsx`)
   - `PageHeader.tsx`: Add cover와 `CoverPicker`, 페이지들에 `CoverBanner`와 `has-cover`
   - `vite.config.ts`: `core/sample.ts`의 `RENAMED`. `src/guide.test.ts`: 가이드 문장 검사
2. **앱 설정** (`App/Sources/Settings/`)
   - `AppPreferences.swift`(@Observable, `UserDefaults`), 편집기로 보내는 명령 `preferences`, 테마 적용(macOS `NSApp.appearance`, iOS `preferredColorScheme`)
   - `SettingsView.swift`: macOS 탭과 iOS 시트가 같은 구역 뷰를 쓴다. `CustomCSSSheet`, `LicensesSheet`
   - 홈 인사에 이름, `PageInfo.cover`와 홈 카드 커버
3. **빠른 메모**
   - `QuickNoteSheet.swift`, `EditorController.showingQuickNote`(vault가 열릴 때까지 기다림), 동작 `capture`(⌥⌘M), `view.theme`(⇧⌘L), `settings`
   - `GlobalHotKey.swift`(macOS, Carbon), `QuickNoteIntent.swift`(AppIntent + AppShortcutsProvider), `project.yml`의 URL scheme `synapsenote`
4. **첫 실행**: `EditorBridge.openVault`에 `guide`, 동기화 복사본이면 false
   - 가이드가 말하는 페이지의 `•••` 메뉴가 이 앱에는 사이드바(길게 누르기)와 메뉴 막대에만 있었다. 페이지 위 도구 막대에 페이지 메뉴 버튼을 더하고(`PageActionItems`, 메뉴 막대의 Page 메뉴와 같은 항목, 단축키는 메뉴 막대만), 단어 수 문장은 검사기 안내로 바꾼다.
   - iOS 설정 시트는 `.presentationSizing(.page)`, 사용자 CSS 시트는 설정 화면 최상위에서 띄운다(폼 구역 안의 `.sheet`는 설정 시트를 닫았다). 파일 대화상자를 여는 데이터 동작은 설정 시트를 닫은 뒤 실행한다(`closeSettings`).
5. **테스트**: vitest(가이드, 설정 적용), Swift(`AppPreferencesTests`, URL 해석)
6. **검증**: iPad 시뮬레이터, 검증 문서, 로드맵, 푸시, PR #10(기준 `feat/sync`)
