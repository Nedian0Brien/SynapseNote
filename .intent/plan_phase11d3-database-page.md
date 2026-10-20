# Plan: 11d-3 데이터베이스 페이지

spec: `spec_phase11d-native-screens.md`(11d-3 수정 포함). 브랜치 `feat/swift-db`(기준 `feat/swift-chrome`), 워크트리 `.worktree/swift-db`, PR 기준 `feat/swift-chrome`.

1. **화면 소유**: `PageScreen.database(editable:)`. 세션 호스트가 데이터베이스 페이지를 네이티브 화면으로 고르고(`editable`은 폴더 노트를 읽었는지), 웹 `Page()`는 데이터베이스 페이지에 빈 화면을 그린다. `markOpened`는 그대로 웹에서.
2. **읽기**: 호스트 `databaseScreen(id)` 한 번에 데이터베이스 PageMeta, `rowsOf` 행, 행마다 문서에서만 알 수 있는 첫 그림(최상위 `image`의 `fileId`)과 할 일 진행, 행의 관계 값마다 찾은 페이지(id·제목·아이콘)를 돌려준다. `revision`마다 다시 읽고, 필터·정렬·묶기는 화면에서 11d-1 이식 함수로.
3. **명령**: `WorkspaceCommand`에 `setDatabase`, `setProperties`, `createPage`(Morrow `createRow` 모양). 종류 바꾸기는 `database.set`과 행마다 `page.setProperties`를 한 번에(`runAll`) 보내야 해서 웹에 `commands` 메시지(JSON 배열)를 더한다. id는 Morrow `newId`(`crypto.randomUUID`)와 같은 형식의 소문자 UUID.
4. **편집 변환** (`Core/Database/DatabaseEdits.swift`, 순수 함수, 단위 테스트·변형 확인): 보기 이름·레이아웃·복제·삭제, 필터 추가·속성 바꾸기·값, 정렬 추가·바꾸기·오름차순 하나로, 속성 이름 검사·추가·삭제(모든 보기에서 지움)·종류 바꾸기 명령, 옵션 만들기(`ensureOption`), 보드 열의 값, 행 수 문구.
5. **화면** (`App/Sources/Database/`): `DatabaseScreenView`(머리·보기 탭·도구 막대·행 수, 빈 보기면 표 보기 하나 만들기, 고른 보기는 UserDefaults `morrow.view.<id>`), `DatabaseTableView`, `DatabaseBoardView`, `DatabaseCalendarView`(월요일 시작 6주, 끌어 놓기), `DatabaseCards`(목록·갤러리·카드), `PropertyEditors`(값 편집 9종, 표시, 옵션·관계 선택), `DatabasePanels`(필터·정렬·묶기·속성·속성 설정·보기 설정·수식). 머리는 11d-2 `PageHeaderView`에서 태그를 뺀 것.
6. **확인**: 단위 테스트와 변형 확인. iPad에서 새 데이터베이스, 보기 바꾸기·추가, 속성 추가·이름·종류 바꾸기(값 변환)·삭제, 옵션 만들기, 필터·정렬·숨기기, 보드·달력 끌어 놓기, 표·보드·달력에서 새 행, 갤러리 커버, 관계와 열기, 읽지 못한 폴더 노트, DEBUG 비교. 문서·로드맵·PR.
