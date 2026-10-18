# Plan: 3단계 일상 기록

spec: `spec_phase3-daily.md`. 브랜치 `feat/daily`(기준 `feat/navigation`), 워크트리 `.worktree/daily`.

## 순서

1. **웹** (`queries.ts`, `bridge.ts`, `main.tsx`, `EditorApp.tsx`, `host/router.ts`)
   - 조회 추가: `tags`(태그, 페이지 수, Morrow `tagColor`), `tagPages(tag)`, `tasks`(전체 `TaskRef`), `templates`(Templates 페이지 id와 템플릿 id), `counts`(열린 작업 수, 태그 수)
   - 받는 메시지 추가
     - `openToday`: 선택 인자로 날짜 키를 받는다.
     - `createFromTemplate {templateId, parentId}`
     - `newTemplate`: TemplateDialog의 "Make a template"과 같은 동작이다.
     - `openTemplates`: `createTemplatesPage`를 부른다.
     - `saveAsTemplate {pageId}`
   - 보내는 메시지 추가: `openView {view: 'tasks'|'tags'|'tag', tag?}`. 호스트 `navigate`가 tag·tags·tasks 경로를 이 메시지로 바꾼다.
   - `EditorApp`: `openDate`는 `openToday(date)`, `openTag`는 `navigate({name:'tag'})`로 연결한다. 제목 아래에 Morrow `PageTags`를 둔다(데이터베이스 제외, 편집 가능 조건은 Morrow와 같다).
   - 테스트: `queries.test.ts`, `bridge.test.ts`
2. **Swift 데이터** (`WorkspaceQueries.swift`, `WorkspaceService.swift`, `EditorBridge.swift`, `Workspace.swift`, `Navigation.swift`)
   - 조회 타입과 메서드를 추가한다.
   - `EditorCommand`에 위 메시지를, `EditorEvent`에 `openView`를 추가한다.
   - `PageInfo`에 `dailyDate`를 추가한다.
   - `Destination`에 tasks, tags, tag를 추가한다.
   - 테스트: 디코딩, 명령 JSON, 기존 탭 JSON 복원
3. **화면**
   - `TasksView.swift`, `TagsView.swift`(태그 칩 흐름 배치, 태그 하나의 화면), `TemplatePicker.swift` 신규
   - `Sidebar`: Today·Tasks·Tags 행과 개수, 아이콘 규칙
   - `HomeView`: 작업 칸을 누를 수 있게 한다.
   - `TabStrip`: 제목과 아이콘을 추가한다.
   - `ContentView`: 겹치는 화면을 추가한다. 2단계처럼 `NavigationStack` 없이 일반 뷰로 둔다.
4. **동작 표** (`AppAction.swift`)
   - 추가: Open Today's Note(⇧⌘D), New Page from Template…(⌥⌘T), Go to Templates, Go to Tasks, Go to Tags
   - 페이지 메뉴에 Save as Template를 추가한다.
5. **검증**: 테스트, macOS·iPad·iPhone 조작, `docs/verification/phase3-daily.md`, 로드맵 갱신, 푸시, PR #4(기준 `feat/navigation`)

## 검증 명령

- `npm --prefix web test && npm --prefix web run typecheck`
- `xcodegen generate` 후 `xcodebuild test -scheme SynapseNote -destination 'platform=macOS'`
- iOS 시뮬레이터 빌드·설치. 앱 컨테이너 안의 테스트 vault만 쓴다.
