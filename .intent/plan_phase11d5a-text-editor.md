# Plan: 11d-5a 글 블록 편집기

spec: `spec_phase11d-native-screens.md`(11d-5 나눔 수정 포함). 브랜치 `feat/swift-editor`(기준 `feat/swift-canvas`), 워크트리 `.worktree/swift-editor`, PR 기준 `feat/swift-canvas`.

1. **스키마와 정규화** (`Core/Editor/EditorSchema.swift`): Morrow `createExtensions`의 TipTap 스키마를 옮긴다. 노드마다 속성 순서와 기본값, 마크 순위(link, bold, code, italic, strike, underline, highlight, textColor). `normalize(doc)`는 ProseMirror `nodeFromJSON().toJSON()`과 같다: 속성은 스키마 순서로 채우고 모르는 속성은 버림, 속성이 없으면 `attrs` 생략, 마크는 순위대로, 이웃한 같은 마크 글은 합침, 키 순서는 type·attrs·content·marks·text. `trailingParagraph(doc)`는 TrailingNode처럼 마지막 블록이 문단이 아니면 빈 문단을 붙인다(편집 후 저장 때). 비교 자료: `web/scripts/editor-fixtures.ts`가 `getSchema(createExtensions(...))`로 스키마와 `markdown.json`·`markdown-fuzz.json` 문서의 정규화 결과를 쓴다(`App/Tests/Fixtures/core/expected/editor.json`).
2. **편집 텍스트** (`Core/Editor/InlineText.swift`): 글 블록의 inline 내용 ↔ `NSAttributedString`. 글은 그대로, 마크는 `editorMarks` 속성(마크 객체 목록), `hardBreak`는 U+2028, 그 밖의 글 안 원자는 U+FFFC와 `editorAtom` 속성(노드 그대로). 왕복은 정규화한 inline 내용과 같다(위 자료 전체로 테스트).
3. **편집 변환** (`Core/Editor/EditorEdits.swift`, 순수 함수): 블록 경로(`[Int]`)로 주소를 정한다. 글 바꾸기, 나누기(Enter: 빈 목록 항목이면 밖으로, 코드 블록 안에서는 줄바꿈), 앞 블록과 합치기(Backspace: 목록 항목은 밖으로, 제목·인용·코드는 문단으로), 블록 종류 바꾸기(문단·제목 1~3·코드), 목록 감싸기·풀기(글머리표·번호·할 일), 들여쓰기·내어쓰기(Tab·Shift-Tab), 인용 감싸기, 구분선 넣기, 할 일 체크, 마크 켜기·끄기(범위, 저장된 마크), 링크, 색. 입력 규칙은 TipTap 정규식 그대로(`# `~`### `, `- `·`+ `·`* `, `1. `, `[ ] `·`[x] `, `> `, ```` ```lang ````, `---`, `**`·`*`·`__`·`_`·`~~`·`` ` ``·`==`). 단위 테스트와 변형 확인.
4. **화면** (`App/Sources/Editor/`): `EditorStore`(문서·포커스 블록·선택·저장 250ms·바깥 변경·되돌리기 기록), `PageEditorView`(블록 목록, 목록·인용은 SwiftUI 컨테이너), `BlockTextView`(iOS `UITextView`, macOS `NSTextView`, TextKit 2, 높이는 내용에 맞춤), 서식 막대(선택이 있을 때: 굵게·기울임·밑줄·취소선·코드·형광·색·링크·제목 1~3), 링크 막대, 슬래시 메뉴(이 단계 블록만, Morrow `filterBlocks` 순위), 찾기 막대(⌘F), 자리 표시 글, 코드 블록 언어 고르기.
5. **화면 선택**: `PageScreen.editor`. 문서의 노드·마크 종류가 모두 5a 목록에 있고 실행 인자 `-nativeEditor YES`가 있을 때만 고른다. 웹 편집기가 기본으로 남아 5b·5c 블록(표·콜아웃·그림 등)을 넣는 기능이 이 단계에서 빠지지 않게 한다. 5c에서 기본을 바꾼다.
6. **확인**: 단위 테스트, iPad에서 입력·Enter·Backspace·목록·Tab·마크·슬래시·입력 규칙·한글 조합 입력·되돌리기·찾기·바깥 변경, 파일 내용(Markdown), macOS 앱(스크래치 패드의 시험 vault 사본), DEBUG 비교. 문서·로드맵·PR.

Morrow와 다른 점(예정): 글 선택은 한 블록 안에서만. 되돌리기는 페이지 단위 문서 기록. 코드 강조와 Mermaid 그림은 5c에서 정한다(이 단계는 고정폭 글).
