# Plan: 4단계 데이터베이스

spec: `spec_phase4-database.md`. 브랜치 `feat/database`(기준 `feat/daily`), 워크트리 `.worktree/database`.

## 순서

1. **모듈 교체** (`web/vite.config.ts`, `web/src/host/sidebar.tsx` 신규)
   - `hostModules`에 `components/Sidebar.tsx` → `host/sidebar.tsx`를 추가한다.
   - 데이터베이스 컴포넌트가 의존하는 `Menu`, `Popover`, `platform/attachments`가 번들에 들어갈 수 있는지 빌드로 확인한다.
2. **페이지 머리 분리** (`web/src/PageHeader.tsx` 신규, `EditorApp.tsx`)
   - 아이콘, 제목, 태그를 공통 컴포넌트로 뺀다.
   - 행이면 `RowProperties`를 함께 보여 준다.
3. **데이터베이스 페이지** (`web/src/DatabasePage.tsx` 신규, `main.tsx`)
   - kind가 database이면 `PageHeader`와 Morrow `DatabaseView`를 보여 준다. 쓸 수 있는 조건(휴지통 아님, 읽을 수 있음)은 Morrow와 같다.
4. **인라인과 하위 페이지** (`EditorApp.tsx`)
   - `mountEmbed`: 데이터베이스는 `EmbeddedDatabase`로 그린다.
   - `createChild('database')`: Morrow처럼 `createPage({parentId, kind, open: false})`로 만든다. canvas는 5단계까지 안내를 유지한다.
   - 본문 아래에 `Subpages`를 둔다(Morrow `PageView`를 옮긴다).
5. **Swift**
   - `EditorCommand.createPage`에 `kind`를 추가하고, `EditorController.createPage(parent:kind:)`로 받는다.
   - 동작 표에 New Database를, `PageMenu`에 Add Database Inside를 추가한다.
   - `PageIcon`: 암호화된 페이지는 자물쇠로 보인다(Morrow `PageIcon`과 같게).
6. **검증**: 웹·Swift 테스트, iPad·iPhone·macOS 조작, `docs/verification/phase4-database.md`, 로드맵 갱신, 푸시, PR #5(기준 `feat/daily`)

## 검증 명령

- `npm --prefix web test && npm --prefix web run typecheck && npm --prefix web run build`
- `xcodegen generate` 후 `xcodebuild test -scheme SynapseNote -destination 'platform=macOS'`
- iOS 시뮬레이터 빌드·설치. 앱 컨테이너 안의 테스트 vault만 쓴다.
