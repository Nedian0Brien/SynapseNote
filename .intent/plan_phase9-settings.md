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
5. **테스트**: vitest(가이드, 설정 적용), Swift(`AppPreferencesTests`, URL 해석)
6. **검증**: iPad 시뮬레이터, 검증 문서, 로드맵, 푸시, PR #10(기준 `feat/sync`)
