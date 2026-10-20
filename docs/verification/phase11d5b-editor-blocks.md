# 11d-5b단계 링크·표·구조 블록 검증 결과

- 날짜: 2026-10-21
- 브랜치: `feat/swift-editor-blocks`(기준 `feat/swift-editor`)
- 환경: Xcode 27.0, macOS 27.0, iPad Pro 13-inch (M5) 시뮬레이터(iOS 27.0, 앱 컨테이너의 시험 vault), 실행 인자 `-nativeEditor YES`
- 비교 기준: Morrow a2daae1의 `src/app/editor/{PageLink,Structure,Blocks,Extras,BlockHandle,MarkdownPaste,SlashCommand,EditorMenus}.ts(x)`, prosemirror-tables

## 바뀐 것

네이티브 편집기가 그리는 노드에 `pageLink`(끼워 넣기 제외), `dateMention`, 표 네 종류, `callout`, `details` 세 종류, `columns`·`column`, `tableOfContents`를 더했다. 끼워 넣기(`![[`)가 있는 페이지는 5c까지 웹 편집기로 연다.

- **글 안 원자**(`EditorAtoms.swift`): 페이지 링크는 페이지 아이콘·제목(별칭, `제목 › 제목줄`), 없는 페이지는 취소선, 아직 없는 대상은 회색으로 PageLink 노드 뷰처럼 그린다. 날짜는 `@` + `describeDate`, 오늘은 배경, 지난 날은 흐리게. SwiftUI로 그린 그림을 `NSTextAttachment`로 넣는다. 누르면 페이지·그날 노트를 열고, 아직 없는 대상은 맨 위에 만들어 연다(`createFromTarget`).
- **#태그**: Morrow `TAG_PATTERN`으로 찾아 강조색, colorful 설정이면 태그 색으로. ⌘를 누른 채 누르면 태그 화면.
- **메뉴**: `[[`(어디서나, `findPagesByTitle` 8개, 자기 자신 제외, 없는 제목이면 "New subpage “…”"), `@`(줄 처음·공백 뒤, `dateSuggestions` + 페이지 5개, 30자 넘으면 없음). `![[`는 끼워 넣기 노드를 만든다.
- **구조 블록**(`EditorStructureViews.swift`): 표(칸마다 블록 목록, 머리 칸 굵게, 표 막대: 행·열 추가와 삭제, 머리 행, 표 삭제), 콜아웃(종류 이모지와 이름 버튼으로 tone 순환, 제목 칸, 접기), 접기(요약 줄과 내용, `open`), 단(나란히), 목차(제목 목록, 누르면 그 제목으로).
- **편집**(`EditorBlockEdits.swift`, `EditorStore+Blocks.swift`): 캐럿 자리에 블록 넣기(ProseMirror replaceSelectionWith), 표 명령(prosemirror-tables), Tab·Shift-Tab으로 칸 이동(마지막 칸에서 행 추가, 목록 항목이 먼저), 콜아웃·접기 감싸기, 블록 메뉴(BlockHandle의 movableBlock·moveBlock, 복제, 삭제, 바꾸기, 콜아웃 tone), Markdown 붙여넣기(looksLikeMarkdown, `pageIdByTitle`로 `[[링크]]`, 앞뒤 문단 합침).
- **슬래시 메뉴**: Callout, Toggle, Table, Database, Canvas(하위 페이지와 링크), 2·3 columns, Table of contents, Date·Embed·Link(각 메뉴의 시작 글자를 입력).

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 175개(11d-5a 168개 + `EditorBlockEditsTests` 7개, `newPage` 명령 모양) |

`EditorBlockEditsTests`: 캐럿 자리 블록 넣기(빈 블록 대신, 가운데서 나눔, 뒤에 문단), 원자 넣기, 콜아웃·접기 JSON, 표 행·열 추가·삭제·머리 행·칸 이동, 블록 메뉴, 붙여넣기 합치기, 날짜 표시·제안. 변형 확인: 머리 행에 더한 칸을 보통 칸으로, 머리 열에 더한 행의 칸을 보통 칸으로, 붙여넣을 때 앞 글을 버리게 바꿔 보았고 셋 다 실패했다(되돌림). 머리 열 경우는 처음에 통과해, 그것을 확인하는 검사를 더했다.

## iPad에서 확인한 것

| 동작 | 결과 |
|---|---|
| 시험 페이지(링크·없는 링크·날짜·태그·콜아웃·접기·단·목차·표) 열기 | 모두 네이티브로 그려짐 |
| 접기 화살표 | 내용이 열림 |
| 표 칸에서 Tab | 다음 칸의 글이 선택됨, 마지막 칸에서 새 행 |
| `[[Hom` + Enter | 메뉴 "Link to page"(Home, New subpage “Hom”), `[[Home]]` 저장 |
| `@tom` + Enter | `[[2026-10-22]]`(Tomorrow) 저장 |
| Home 칩 누르기 | Home 페이지 열림 |
| Tomorrow 칩 누르기 | 2026-10-22 일간 노트가 템플릿으로 만들어져 열림 |
| Markdown 붙여넣기(⌘V) | `## 제목`, 목록, `**굵게**`, `[링크](…)`, `> 인용`이 블록과 마크로 |
| `/callout`, `/2 col`, `/table` | 콜아웃, 두 단, 머리 행이 있는 3×3 표와 표 막대 |
| 표의 블록 손잡이 → Move up | 표가 위 문단 앞으로 |

## 함께 고친 것

- **인라인 예측과 메뉴**: `@tom` 뒤 Return이 회색 예측("orrow")을 받아, 메뉴가 날짜를 넣은 뒤에 "orrow"가 붙었다. 메뉴가 열린 블록은 인라인 예측을 끄고, 메뉴 검색어는 캐럿이 움직일 때마다 글에서 다시 읽는다.
- **붙여넣기 권한 창**: 처음에는 붙여넣기에서 대지를 직접 읽어 iOS가 권한을 물었다. 이제 iOS는 `UITextPasteDelegate`로 시스템이 넘기는 글을 받는다. 시뮬레이터에서 Mac의 대지를 붙일 때 시스템 자체의 권한 창은 그대로 뜬다.
- **표 너비**: 가로 스크롤 안에서 첫 열만 넓어져, 열이 페이지 폭을 나누게 했다.

## Morrow와 다른 점

- **블록 손잡이**: Morrow는 마우스를 올린 블록 옆에 보인다. 터치에는 올리기가 없어 캐럿이 있는 블록 옆에 보이고, 끌어서 옮기기 대신 Move up·down을 쓴다(Alt-Shift-↑↓ 단축키 포함).
- **표 열 너비**: 열 너비 조절(`colwidth`)은 하지 않고 페이지 폭을 나눈다(Morrow도 `resizable: false`). 넓은 표는 가로로 스크롤되지 않고 칸 안에서 줄을 바꾼다.
- **접기 상태**: `open`은 문서에만 있고 Markdown에 쓰이지 않아 다시 열면 닫혀 있다(Morrow와 같음).
- **`@` 날짜 입력**: "12/25"처럼 해가 없는 숫자 날짜는 V8이 읽지만 Swift `JSDate.parse`는 읽지 않아 제안되지 않는다. 이름(today, fri 등)과 `oct 25`, `2026-12-25`는 된다.

## 알려진 한계

- 확인하지 않은 것: `[[`의 New subpage 만들기, 슬래시 Database·Canvas, 바꾸기 메뉴, 콜아웃 tone 메뉴, 태그 ⌘ 누르기, 목차 누르기(편집 변환은 단위 테스트로 확인).
- 한글 조합 입력과 macOS 앱은 5a와 같은 이유로 확인하지 못했다.
- 끼워 넣기(`![[`), 그림, 수식, 원문 블록이 있는 페이지는 5c까지 웹 편집기다.
