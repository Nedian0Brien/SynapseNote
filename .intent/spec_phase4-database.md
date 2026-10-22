# Spec: 4단계 데이터베이스

상위 intent: `intent_morrow-full-port.md` (수락됨). 기준은 Morrow a2daae1의 다음 파일이다.

- `core/database.ts`, `core/formula.ts`
- `app/components/database/*`(`DatabaseView`, `EmbeddedDatabase`, `PropertyValue`, `RowProperties`, `data`)
- `PageView.tsx`(데이터베이스 페이지, 행 속성, 하위 페이지), `editor/PageEditor.tsx`(`mountEmbed`)

## 설계 결정: 데이터베이스 화면은 편집기 WebView에서 그린다

- 데이터베이스는 페이지 본문이다. 인라인 데이터베이스는 TipTap 문서 안의 노드로 들어 있어서 편집기 안에서 그려야 한다.
- 상위 intent는 "기능 전체를 A안(WebView 편집기 + Morrow TS 코어)으로 먼저 완성한 뒤 편집기와 데이터 코어를 Swift로 옮긴다"고 정했다.
- 따라서 전체 페이지 데이터베이스와 인라인 데이터베이스 모두 Morrow `DatabaseView`를 편집기 WebView에서 쓴다. 두 곳이 같은 코드로 동작하고, 11단계에서 편집기와 함께 Swift로 옮긴다.
- 사이드바, 메뉴, 팔레트처럼 페이지 밖의 화면은 지금처럼 SwiftUI다.

## 요구사항

1. **데이터베이스 페이지**: kind가 database인 페이지를 열면 지금의 "아직 열 수 없음" 안내 대신 Morrow와 같은 화면을 보여 준다.
   - 머리: 아이콘, 제목
   - 본문: `DatabaseView`
     - 뷰 5종: table, board, calendar, list, gallery
     - 속성 9종: text, number, select, multi-select, date, checkbox, link, relation, formula
     - 필터, 정렬, 그룹, 숨긴 속성, 새 행, 속성 추가·이름 변경·종류 변경·삭제, 보드 끌기
2. **행 페이지**: 데이터베이스의 행인 페이지는 제목 아래에 Morrow `RowProperties`(속성 값 편집)를 보여 준다.
3. **인라인 데이터베이스**
   - 문서에 끼워 넣은 데이터베이스 페이지 링크는 HTML 미리보기 대신 실제 데이터베이스 뷰로 그린다(Morrow `mountEmbed`).
   - 편집기 `/` 메뉴의 Database는 현재 페이지 아래에 데이터베이스를 만들고 끼워 넣는다(`createChild('database')`).
   - 캔버스는 5단계에서 다룬다.
4. **하위 페이지 목록**: 데이터베이스가 아닌 페이지의 본문 아래에 Morrow `Subpages` 목록을 보여 준다.
5. **새 데이터베이스**: 동작 표에 "New Database"를 추가한다(Morrow `page.newDatabase`). 사이드바 페이지 메뉴에는 "Add Database Inside"를 추가한다.
6. **모듈 교체**: Morrow 데이터베이스 컴포넌트는 `components/Sidebar.tsx`에서 `PageIcon`을 불러온다. 이 모듈은 번들에서 금지한 `legacy.ts`까지 불러온다. 따라서 `hostModules`에 `components/Sidebar.tsx` → `web/src/host/sidebar.tsx`(`PageIcon`, `pageIcon`만, Morrow와 같은 구현)를 추가한다.

## 받아들이는 기준

- 웹·Swift 단위 테스트, 번들 검사(금지 모듈, Morrow 이름)가 통과한다.
- 시뮬레이터와 macOS에서 다음을 조작하고 vault 파일(폴더 노트 frontmatter, 행 frontmatter)로 결과를 확인해 `docs/verification/phase4-database.md`에 기록한다.
  - 데이터베이스 만들기, 행 추가, 속성 종류별 값 입력
  - 뷰 전환, 필터·정렬·그룹
  - 행 페이지 속성 편집, 인라인 데이터베이스
- Obsidian식 Markdown·frontmatter 호환은 Morrow 코어 규칙을 그대로 따른다. 열기만 한 데이터베이스는 파일을 다시 쓰지 않는다.

## 범위 밖

- 데이터베이스 화면의 Swift 구현: 11단계
- 캔버스 인라인: 5단계
- CSV 가져오기(`databaseFromTable`): 7단계
