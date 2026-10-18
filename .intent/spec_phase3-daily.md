# Spec: 3단계 일상 기록

상위 intent: `intent_morrow-full-port.md` (수락됨). 기준은 Morrow a2daae1의 다음 파일이다.

- `core/daily.ts`, `core/templates.ts`, `core/tags.ts`, `core/tasks.ts`
- `app/operations.ts` (`ensureToday`, `openToday`, `createFromTemplate`, `createTemplatesPage`, `saveAsTemplate`)
- `TagsView.tsx` (`TagsView`, `TagView`, `PageTags`), `Views.tsx` (`TasksView`), `TemplateDialog.tsx`, `Sidebar.tsx` 탐색 항목, `actions.ts`, `pageMenu.ts`

## 요구사항

1. **데일리 노트**
   - Today(사이드바 항목, 동작 "Open Today's Note")는 오늘 노트를 열고, 없으면 만든다. Morrow `openToday`를 그대로 쓴다.
     - 노트는 Journal 아래에 최신순으로 들어간다.
     - 제목은 긴 날짜 형식이다.
     - "Daily note" 템플릿이 있으면 그 내용·아이콘·태그로 만든다.
   - 오늘 노트를 보고 있으면 Today 항목이 선택된 것으로 보인다.
   - 사이드바와 탭에서 데일리 노트는 달력 아이콘, Journal은 책 아이콘, Templates는 템플릿 아이콘으로 보인다.
2. **`@날짜`**: 편집기의 날짜 칩을 누르면 그 날짜의 데일리 노트를 열고, 없으면 만든다(Morrow `openDate` → `openToday(date)`). 지금은 "not available yet" 안내만 나온다.
3. **템플릿**
   - "New Page from Template…": 템플릿 목록 시트를 연다. 고르면 Morrow `createFromTemplate`로 `{{title}}`·`{{date}}`·`{{time}}`을 채운 새 페이지를 만들고 연다.
   - 템플릿이 없으면 시트에 설명과 "Make a Template" 버튼을 보여 준다. Templates 페이지가 있으면 그 아래 "New template"을 만들고, 없으면 Templates 페이지를 만든다.
   - "Go to Templates": Templates 페이지를 열고, 없으면 만든다.
   - 페이지 메뉴 "Save as Template": 일반 페이지에서만 보인다. 페이지를 Templates 아래로 복사한다.
4. **태그**
   - 사이드바 Tags 항목에 태그 개수를 표시한다.
   - 태그 화면: 모든 태그를 Morrow 색으로 칩으로 보여 주고 페이지 수를 함께 표시한다. 태그는 페이지 속성 태그와 본문 `#tag`를 합친 것이고, `#a/b`는 `#a`에도 센다.
   - 태그 하나의 화면: 그 태그가 붙은 페이지를 최근 수정 순으로 보여 준다(제목, 경로, 수정 시각).
   - 편집기 제목 아래에 페이지 태그를 보여 준다(Morrow `PageTags`). 추가·삭제할 수 있고, 태그를 누르면 태그 화면으로 간다. 본문의 `#tag`를 눌러도 태그 화면으로 간다.
5. **작업**
   - 사이드바 Tasks 항목에 열린 작업 수를 표시한다.
   - 작업 화면: Open, Done, All로 거른다. 페이지별로 묶어 보여 주고, 체크하면 `task.setChecked`가 실행된다. 작업 문구를 누르면 그 문구를 찾을 문자열로 해서 페이지를 연다.
   - 홈의 "open tasks" 칸을 누르면 작업 화면으로 간다.
6. **목적지와 탭**: `Destination`에 tasks, tags, tag(이름)를 추가한다. 탭 제목과 아이콘도 Morrow `TabBar`와 같이 둔다. 저장된 탭 형식은 기존 것과 호환된다.
7. **조회**: `tags`, `tagPages`, `tasks`, `templates`, `counts` 조회를 추가한다. 화면은 2단계처럼 TS 코어 계산 결과를 받는다.

## 받아들이는 기준

- 웹·Swift 단위 테스트가 통과한다. 조회 결과 형태, 새 메시지, 목적지 저장 호환을 테스트한다.
- macOS와 iPad·iPhone 시뮬레이터에서 다음을 조작하고 결과 파일을 확인해 `docs/verification/phase3-daily.md`에 기록한다.
  - Today로 노트 생성, `Journal/` 아래 파일 위치
  - Daily note 템플릿 적용
  - 템플릿으로 페이지 만들기
  - Save as Template
  - 태그 화면과 태그 하나의 화면, 페이지 태그 추가·삭제
  - 작업 화면 체크
- 도구 제약으로 조작하지 못한 항목은 "미확인"으로 적는다.

## 범위 밖

- 빠른 캡처: 9단계
- 데이터베이스·캔버스 하위 페이지 만들기(`createChild`): 4·5단계
- 태그 이름 바꾸기: Morrow에도 없다.
