# Plan: 2단계 탐색

spec: `spec_phase2-navigation.md`. 브랜치 `feat/navigation`(기준 `feat/page-management`), 워크트리 `.worktree/navigation`.

## 순서

1. **웹 조회·메시지** (`web/src/queries.ts` 신규, `bridge.ts`, `main.tsx`, `EditorApp.tsx`)
   - `queries.ts`: 상태를 받아 결과를 돌려주는 순수 함수(`search`, `recent`, `home`, `backlinks`, `mentions`, `outline`). Morrow의 `searchWorkspace`, `insights`, `links`, `collectTasks`를 그대로 부른다.
   - `window.synapse.query(name, params)`: 결과를 `JSON.stringify`해서 돌려준다. 준비되지 않았으면 `null`. `linkSelection`은 편집기에 선택한 글이 있을 때 링크 편집을 열고 `true`를 돌려준다.
   - 받는 메시지:
     - `show`에 `find` 추가
     - `scrollToHeading {index}`
     - `find`(찾기 막대 열기)
   - 보내는 메시지:
     - `openPage`에 `newTab`, `find` 추가
     - `shortcut {id}`(편집기가 받은 Esc)
   - `Page`가 바뀔 때 `page.markOpened`를 실행한다. `EditorApp`에는 `find` 처리를 옮긴다. ⌘/Ctrl-클릭한 `[data-page-id]`는 `newTab`으로 보낸다.
   - 테스트: `queries.test.ts`(memory vault 기준 결과 형태), `bridge.test.ts`에 새 메시지 추가.
2. **Swift 조회 계층** (`WorkspaceQueries.swift` 신규, `WorkspaceService.swift`, `EditorController.swift`, `EditorBridge.swift`)
   - Codable 타입: `SearchHit`, `HomeFacts`, `Backlink`, `Mention`, `Heading`, `PageRef`
   - `query<T>(_:_:)`: `callJavaScript`로 받은 문자열을 디코딩한다.
   - `WorkspaceCommand.setTaskChecked`, `PageInfo.lastOpenedAt`·`updatedAt` 추가
   - 테스트: 고정 JSON 디코딩, 명령 JSON
3. **목적지와 탭** (`Navigation.swift` 신규)
   - `Destination { home, page(id), trash }`
   - `TabList`: open, close, activate, step, move, 상한 20, Codable
   - 컨트롤러의 `selection`/`showingTrash`는 열린 탭의 목적지로 바꾸고, `sidebarItem`도 목적지에 맞춘다. vault별로 저장한다.
   - 테스트: `TabListTests`
4. **홈** (`HomeView.swift` 신규): `workspace` 이벤트가 오면 0.3초 묶어서 다시 조회한다. `Sidebar`에 Home 행을 추가한다.
5. **빌드 확인 1회**: macOS에서 WebView에 포커스가 있을 때 ⌘K, ⇧⌘F, ⌘/, ⌘W가 메뉴로 넘어가는지 확인하고, 결과를 spec "단축키 처리"에 반영한다.
6. **동작 표와 메뉴** (`AppAction.swift` 신규, `SynapseNoteApp.swift`의 `PageCommands` 교체)
7. **명령 팔레트** (`CommandPalette.swift` 신규): 오버레이, `@FocusState`, `onKeyPress`, 요청 순번
8. **탭 막대** (`TabStrip.swift` 신규)와 `PageMenu`의 "Open in New Tab"
9. **인스펙터** (`PageInspector.swift` 신규): `.inspector(isPresented:)`
10. **집중 모드**: `NavigationSplitView(columnVisibility:preferredCompactColumn:)`. 시그니처는 SDK 인터페이스에서 확인한다.
11. **단축키 안내** (`ShortcutsView.swift` 신규)
12. **검증**: 테스트, 시뮬레이터 3종과 macOS 조작, `docs/verification/phase2-navigation.md`, `docs/roadmap.md` 갱신, 푸시, PR #3(기준 `feat/page-management`)

## 검증 명령

- `npm --prefix web test && npm --prefix web run typecheck`
- `xcodegen generate` 후 `xcodebuild test -scheme SynapseNote -destination 'platform=macOS'`
- 시뮬레이터: iPad, iPhone. 테스트 vault는 앱 컨테이너 안의 것만 쓴다.
