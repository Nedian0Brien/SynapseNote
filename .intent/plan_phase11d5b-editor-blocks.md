# Plan: 11d-5b 링크·표·구조 블록

spec: `spec_phase11d-native-screens.md`(11d-5 나눔). 브랜치 `feat/swift-editor-blocks`(기준 `feat/swift-editor`), 워크트리 `.worktree/swift-editor-blocks`, PR 기준 `feat/swift-editor`.

1. **글 안 원자**: `pageLink`(끼워 넣기가 아닌 것)와 `dateMention`을 글 안의 첨부물(`NSTextAttachment`)로 그린다. 페이지 링크는 아이콘·제목, 없는 페이지와 아직 없는 대상(`target`)은 Morrow 표시대로, 누르면 페이지를 열고 없는 대상은 만든 뒤 연다(`createFromTarget`). 날짜는 `@` + `describeDate`, 누르면 그날 노트. 제목은 워크스페이스에서, 대상 찾기는 core `Search.resolveLinkTarget`.
2. **제안 메뉴**: `[[`(페이지 찾기 8개, 자기 자신 제외, 없는 제목이면 "New subpage"), `@`(Morrow `dateSuggestions` + 페이지 5개). 고르면 원자와 공백을 넣는다. `![[`는 끼워 넣기 노드를 만든다(그리기는 5c).
3. **태그**: 글의 `#태그`(Morrow `TAG_PATTERN`, 코드·링크 마크 제외)를 태그 색으로 표시, ⌘ 누르기로 태그 화면.
4. **구조 블록**: 표(`table`·`tableRow`·`tableHeader`·`tableCell`, 칸마다 블록 목록, 표 막대: 행·열 추가와 삭제, 표 삭제, Tab으로 다음 칸·마지막 칸에서 행 추가), 콜아웃(종류 버튼으로 tone 순환, 제목, 접기), 접기(`details`: 요약 글 블록과 내용, `open` 저장), 단(`columns` 2~4), 목차(제목 목록, 누르면 그 제목으로).
5. **블록 메뉴**: 맨 위 블록마다 손잡이. 바꾸기(문단·제목·목록·인용·코드), 위·아래로, 복제, 삭제, 콜아웃 tone. 끌어서 옮기기.
6. **Markdown 붙여넣기**: 일반 글이 Morrow `looksLikeMarkdown`에 맞으면 core `MarkdownParse`로 블록을 만들어 캐럿 자리에 넣는다(앞뒤 문단은 합쳐짐).
7. **슬래시 메뉴**: Callout, Toggle, Table, Database·Canvas(하위 페이지와 링크), 2·3 columns, Table of contents, Date(`@`), Link to page(`[[`), Embed a page(`![[`).
8. **편집 변환**(`EditorEdits`): 표 행·열 추가·삭제, 칸 이동, 단 만들기, 콜아웃·접기 감싸기, 블록 이동·복제·삭제, 블록 끼워 넣기(붙여넣기), 원자 넣기. 단위 테스트와 변형 확인.
9. **화면 선택**: `EditorScreen.nodes`에 위 노드를 더한다(끼워 넣기 `pageLink`는 제외).
10. **확인**: 단위 테스트, iPad 확인, 문서·로드맵·PR.
