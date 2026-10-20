# 11d-5a단계 글 블록 편집기 검증 결과

- 날짜: 2026-10-21
- 브랜치: `feat/swift-editor`(기준 `feat/swift-canvas`)
- 환경: Xcode 27.0, macOS 27.0, iPad Pro 13-inch (M5) 시뮬레이터(iOS 27.0, 앱 컨테이너의 시험 vault), 실행 인자 `-nativeEditor YES`
- 비교 기준: Morrow a2daae1의 `src/app/editor/*`, TipTap 3.32(`@tiptap/*`), prosemirror-model·commands

## 바뀐 것

글 블록 페이지를 네이티브 편집기로 쓸 수 있다. 이 단계는 실행 인자 `-nativeEditor YES`가 있을 때만 켜지고, 문서의 노드·마크 종류가 모두 이 단계 목록(문단·제목·목록 셋·할 일·인용·코드·구분선·줄바꿈, 마크 8종)에 있는 페이지만 가져온다. 나머지는 지금까지처럼 웹 편집기다. 5c에서 기본을 바꾼다.

- **편집기 기술**: SwiftUI `TextEditor` 문서에 첨부물과 글 안의 뷰가 없어, 블록마다 TextKit 2 텍스트 뷰(`UITextView`·`NSTextView`)를 쓴다. 목록·인용·코드는 SwiftUI 컨테이너다.
- **문서 모델**(`Core/Editor/EditorSchema.swift`): Morrow `createExtensions`의 TipTap 스키마(노드 속성 순서와 기본값, 마크 순위)와 ProseMirror `nodeFromJSON().toJSON()` 정규화를 옮겼다. 편집 뒤 저장 문서는 TrailingNode처럼 문단으로 끝난다.
- **편집 텍스트**(`InlineText.swift`): 글 블록 내용 ↔ `NSAttributedString`. 마크는 속성, 줄바꿈은 U+2028, 글 안 원자는 U+FFFC.
- **편집 변환**(`EditorEdits.swift`): Enter(splitBlock·splitListItem·liftEmptyBlock·코드 블록 세 번 Enter), Backspace(joinBackward·ListKeymap·clearNodes), Delete, Tab·Shift-Tab(sink/liftListItem), 블록 종류, 목록 바꾸기(toggleList), 인용, 구분선, TipTap 입력 규칙, 마크(addToSet·toggleMark·extendMarkRange).
- **화면**(`App/Sources/Editor/`): 서식 막대(굵게·기울임·밑줄·취소선·코드·형광·색 9+9·링크·제목 1~3), 링크 막대, 슬래시 메뉴(이 단계 블록, Morrow `filterBlocks` 순위), 찾기·바꾸기 막대, 자리 표시 글, 코드 언어 고르기, 페이지 단위 되돌리기(500ms 묶음, 시스템 Undo 메뉴·단축키와 연결).
- **저장**: Morrow처럼 마지막 변경 250ms 뒤 문서 전체를 `page.setDoc`으로 보낸다. 바깥 변경은 기다리는 저장이 없을 때 다시 읽는다.
- **앱 연결**: 개요의 제목으로 가기, ⌘F, ⌘K(선택이 없으면 검색), 검색 결과 단어 선택, 맨 위 줄에서 위 화살표로 제목 칸. 웹은 네이티브가 보여 주는 페이지에 편집기를 열지 않는다(`nativeEditor` 메시지).

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개(`nativeEditor` 메시지 읽기 포함) |
| `npm --prefix web run editor-fixtures` | `getSchema(createExtensions(...))`로 스키마와 문서 1527개의 정규화 결과를 `editor.json`에 씀 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 168개(11d-4 150개 + `EditorSchemaTests` 5개 + `EditorEditsTests` 13개) |

- `EditorSchemaTests`: 스키마가 TipTap과 같음. `markdown.json`·`markdown-fuzz.json`의 문서 1527개를 정규화한 JSON이 TipTap 결과와 모두 같음. 그 안의 글 블록 전부(1000개 이상)가 텍스트 뷰 왕복 뒤 그대로임.
- `EditorEditsTests`: Enter·Backspace·Delete·Tab·목록·블록 종류·입력 규칙·마크를 저장될 JSON으로 확인.
- 변형 확인: 빈 `content` 쓰기, 글 합치기 빼기, 원자 속성 버리기, 새 할 일 체크 유지, 번호 다시 매기기, 앞 목록과 합치기 빼기를 넣어 보았고 모두 실패했다(되돌림). 이 과정에서 Shift-Tab으로 나뉜 번호 목록이 번호를 이어 가도록 쓴 처음 구현이 ProseMirror(나뉜 쪽이 원래 속성을 그대로 복사)와 달라 고쳤다.

## iPad에서 확인한 것

| 동작 | 결과 |
|---|---|
| 시험 페이지 열기(제목·마크 6종·목록 셋·중첩·할 일·인용·코드·구분선) | 네이티브로 그려짐, 목록 기호가 첫 줄에 맞음 |
| 문단 끝에 입력 | 파일에 저장, 다른 줄은 그대로 |
| 입력 규칙 `## `, `- `, `[ ] `, `[x] ` | 제목·글머리표·할 일·체크된 할 일로 바뀜 |
| 목록에서 Enter, 빈 항목에서 Enter | 새 항목, 목록 밖 문단 |
| 목록 첫 문단에서 `1. `·`> ` | 바뀌지 않음(TipTap과 같음) |
| 위 동작을 쉬지 않고 빠르게 입력 | 글자 유실 없음(아래 고친 것 참고) |
| `/h` | 슬래시 메뉴(Heading 1~3이 먼저, 키워드가 맞는 것 다음), 아래 자리가 없으면 캐럿 위 |
| `/quo` + Enter, 인용에서 Enter 두 번 | 인용, 인용 밖 문단 |
| 단어 선택 | 서식 막대가 선택 위에, ⌘B로 `**word**` |
| 빈 문단 맨 앞에서 Backspace, ⌘Z | 앞 문단과 합쳐짐, 되돌리기로 나뉨 |
| Tab·Shift-Tab | 하위 항목, 목록 밖 |
| ⌘F `task` | 찾기 막대 "1 of 4", 일치 표시 |
| 다른 앱이 파일 수정 | 화면에 바로 반영 |
| DEBUG 세션 비교 | 25분 동안 173번, 차이 0 |

## 함께 고친 것

iPad에서 처음 확인했을 때 빠르게 친 글이 사라지거나 다른 블록에 들어갔다. 원인과 고친 방법:

- **포커스가 옮겨 가는 사이**: Enter나 입력 규칙 뒤 새 블록이 아직 포커스를 받기 전에 친 글은 이전 텍스트 뷰로 들어갔다. 이제 그 글과 Enter는 갈 블록으로 보내고(`typeAhead`), 입력 규칙도 적용한다.
- **포커스 요청을 두 번 적용**: 같은 요청을 다음 갱신에서 또 적용해 캐럿이 예전 자리로 돌아갔다. 텍스트 뷰마다 한 요청은 한 번만 적용한다.
- **오래된 글을 다시 보냄**: Enter·Backspace가 텍스트 뷰의 글을 먼저 저장소로 보냈는데, 그 글이 저장소보다 오래된 경우가 있었다. 한글 조합 중이라 아직 보내지 않은 글만 보낸다.
- **자동 수정과 Return**: 자동 수정이 기다리고 있을 때 Return은 "단어\n" 한 번으로 온다. 줄바꿈이 섞인 입력은 Enter로 나눈다.
- **뷰가 바뀜**: 문단이 제목이 되면 SwiftUI가 다른 뷰를 만들어 포커스를 잃었다. 문단과 제목을 같은 뷰로 그린다.
- **TextKit 2 초기화**: `UITextView(usingTextLayoutManager:)`가 Swift 저장 속성 초기값을 돌리지 않아 앱이 멈췄다(`EXC_BAD_ACCESS`). 그 속성을 `lazy`로 바꿨다.

## Morrow와 다른 점

- **글 선택**: 한 블록 안에서만 된다. 여러 블록 선택은 5b의 블록 손잡이로 한다.
- **되돌리기**: ProseMirror 기록 대신 페이지 문서 상태 기록(500ms 묶음, 100개).
- **코드 강조·Mermaid 그림**: 아직 없다(고정폭 글). 5c에서 방식을 정한다.
- **`` ` `` 입력 규칙**: TipTap 정규식은 앞 글자 하나를 함께 지울 수 있어, 백틱과 그 사이만 바꾼다.
- **자동 대문자**: iPad 키보드가 새 블록 첫 글자를 대문자로 바꾼다(웹 편집기와 같은 시스템 동작).

## 알려진 한계

- **한글 조합 입력**: 자동화 도구가 US 자판 문자만 보낼 수 있고 시뮬레이터 하드웨어 자판의 입력 언어를 바꾸지 못해, 이번에도 확인하지 못했다. 조합 중에는 텍스트 뷰 글을 읽지도 바꾸지도 않게 했으나 실기기 확인이 필요하다.
- **macOS 앱**: macOS 빌드와 단위 테스트는 통과했으나, 샌드박스 앱이 고른 폴더만 열 수 있어 실제 사용자 폴더를 쓰지 않으려고 앱을 돌려 보지 않았다(11d-2부터 같은 이유).
- **시험 환경**: 다른 세션의 시뮬레이터 때문에 부하 평균이 600~1000이었다. 사용자 동의로 그 시뮬레이터를 종료한 뒤 확인했다. 첫 실행에 웹 내용 프로세스가 늦게 떠 로딩 화면에 머무는 일이 몇 번 있었고, 다시 실행하면 정상이었다.
- 사용자 CSS는 이 화면에도 적용되지 않는다(11d-2 기록과 같음).
- PDF 내보내기는 웹 편집기 화면을 인쇄하는데, 네이티브로 연 페이지에서 웹은 빈 화면을 그린다. 실행 인자를 켠 상태에서는 그 페이지의 PDF가 비어 나오며, 11e에서 Swift가 인쇄할 HTML을 만든다.
