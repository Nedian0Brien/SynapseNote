# 11d-5c-1단계 그림·첨부 파일·수식·원문·코드 강조 검증 결과

- 날짜: 2026-10-21
- 브랜치: `feat/swift-editor-media`(기준 `feat/swift-editor-blocks`)
- 환경: Xcode 27.0, macOS 27.0, iPad Pro 13-inch (M5) 시뮬레이터(iOS 27.0, 앱 컨테이너의 시험 vault), 실행 인자 `-nativeEditor YES`
- 비교 기준: Morrow a2daae1의 `src/app/editor/{Media,Extras,SlashCommand}.ts`, `src/app/components/SourceDialog.tsx`, `src/app/platform/attachments.ts`, `features.css`·`blocks.css`·`editor.css`, `@tiptap/extension-mathematics`·`@tiptap/extension-code-block-lowlight`·`@tiptap/core`(insertContentAt, 입력 규칙) 3.32

## 바뀐 것

네이티브 편집기가 그리는 노드에 `image`, `fileAttachment`, `rawBlock`, `inlineMath`, `blockMath`를 더했다. 코드 블록은 강조와 Mermaid 그림을 그린다. 끼워 넣기(`![[`)가 있는 페이지만 5c-2까지 웹 편집기로 연다.

- **렌더러 배포 파일**(`App/Renderers`, `web/scripts/vendor-renderers.ts`): web이 쓰는 katex 0.18.10(js·css·woff2 글꼴), mermaid 12.2.0, lowlight와 highlight.js common 언어를 묶은 `highlight.js`. 저장소에 넣어 11e에서 node 빌드를 없애도 남는다. 묶인 패키지의 라이선스는 `App/Renderers/THIRD_PARTY_LICENSES.txt`.
- **코드 강조**(`Core/Editor/CodeHighlight.swift`): JavaScriptCore에서 lowlight를 돌려 code-block-lowlight와 같게 언어가 있으면 `highlight`, 모르거나 없으면 `highlightAuto`. 분류(`hljs-*`)의 색과 기울임·굵기는 `features.css` 규칙을 CSS 우선순위대로 적용한다. 언어 목록은 Morrow `CODE_LANGUAGES`.
- **수식·Mermaid**(`Editor/WebRenderer.swift`): 창 안 앱 화면 뒤에 둔 `WKWebView` 하나에서 KaTeX(Morrow의 옵션 `throwOnError: false`, `strict: false`)와 Mermaid(Morrow `configureMermaid` 색)를 그리고 `takeSnapshot`으로 그림을 받아 보관한다. 글 안 수식은 첨부물로 글의 기준선에, 수식 블록은 가운데, 넓으면 옆으로 스크롤.
- **수식 편집**: 수식을 누르면 SourceDialog처럼 원문과 미리보기, ⌘Return 저장, 비우면 삭제. 입력 규칙 `$$x$$`(InlineMath), `$$$x$$$`(BlockMath), `$x$`(Morrow InlineMathDollar, `$5`처럼 가격은 글로 남음). 코드 마크 옆에서는 TipTap처럼 입력 규칙을 쓰지 않는다.
- **그림·첨부 파일**(`Editor/EditorMediaViews.swift`): vault 그림(80% 화면 높이까지), 없는 그림 안내, 웹 그림은 Load image를 눌러야 받음, 첨부 파일 이름·크기(`formatBytes`)·Save a copy, 소리는 재생·위치·길이 줄, 영상은 AVKit, PDF는 PDFKit로 페이지 안에서.
- **파일 넣기**: 슬래시 Image·File(파일 고르기), 붙여넣기(파일, 글이 없는 그림), 페이지에 끌어 놓기. Morrow storeFiles처럼 100MB 넘는 파일은 빼고 안내하며, 저장된 뒤 insertContentAt 규칙으로 블록과 빈 문단을 넣는다.
- **원문 블록**: "Kept as written"과 원문, 두 번 누르면 Edit as written.
- **슬래시 메뉴**: Image, File, Formula, Inline formula를 Morrow 순서에 더했다. Table of contents와 Diagram은 Morrow처럼 insertContent로 넣는다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개 |
| `npm --prefix web run editor-fixtures` | `highlight.json`: code-block-lowlight 플러그인이 markdown 비교 자료의 코드 블록 전부와 몇 개 더(모두 308개)에 준 장식, 언어 목록 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 182개(11d-5b 175개 + `CodeHighlightTests` 3개 + `EditorMediaEditsTests` 4개) |

- `CodeHighlightTests`: 308개 블록의 강조 범위와 분류가 lowlight 결과와 모두 같음, 언어 목록, CSS 우선순위.
- `EditorMediaEditsTests`: 빈 문단·끝·가운데·처음에 파일 넣기(node의 ProseMirror `replaceWith` 결과와 같음), `mediaNodes`, `mediaKind`, `formatBytes`와 `toFixed`(동률은 큰 쪽), 수식 입력 규칙(node에서 규칙 코드로 낸 값), `$$$` 블록, 글 안 수식 바꾸기·삭제.
- 변형 확인: 언어를 넘기지 않기, CSS 동률 순서 뒤집기, 빈 블록 대체 빼기, 앞 `$` 검사 빼기, `toFixed` 동률 내림을 넣어 보았고 모두 실패했다(되돌림).

## iPad에서 확인한 것

| 동작 | 결과 |
|---|---|
| 시험 페이지(글 안 수식, 수식 블록, 그림, PDF, 소리, 웹 그림, js 코드, Mermaid, HTML 원문) 열기 | 모두 네이티브로 그려짐, 수식은 KaTeX 글꼴로 기준선에 |
| 코드 블록 | 키워드·숫자·주석(기울임)·문자열·함수 이름이 Morrow 색 |
| Mermaid | 그림이 있으면 코드가 접힘, Edit diagram·Hide code, 코드를 고치면 다시 그림, 틀리면 "This diagram has a mistake: Parse error on line 2:" |
| `$\pi r^2$` 입력 | 글 안 수식이 되고 `$\pi r^2$`로 저장 |
| 글 안 수식 누르기 → 고치기 → ⌘Return | 미리보기가 따라가고 `$\pi r^2 + 1$`로 저장 |
| `/formula` + Enter | 빈 수식 블록과 편집 창(입력 칸에 포커스), 저장하면 `$$` 블록, 비우고 저장하면 블록 삭제 |
| 원문 블록 편집 창 | 고친 글이 그대로 저장(아래 참고) |
| `/file` + 파일 고르기 | `attachments/Broken.md`로 저장되고 이름·크기(41 B) 블록, 캐럿은 뒤 빈 문단 |
| Save a copy | 시스템 저장 창에 파일 이름 |
| 소리 재생 | 재생 단추로 끝까지 재생, 위치와 길이 0:02 |
| 사진 앱에서 복사한 그림 ⌘V | `attachments/paste-me.png`로 저장되고 그림 블록 |

## 함께 고친 것

- **글 안 수식이 비어 보임**: 웹 뷰의 스크롤 뷰가 창의 안전 영역만큼 내용을 내려, 작은 그림의 찍는 영역에 내용이 없었다. `contentInsetAdjustmentBehavior = .never`.
- **KaTeX 글꼴**: 글꼴이 `font-display: block`이라 불러오는 동안 글이 안 그려진다. 페이지를 열 때 글꼴을 모두 불러 두고, 그릴 때마다 배치 뒤 `document.fonts.ready`와 두 프레임을 기다린다.
- **파일을 골라도 들어가지 않음**: 파일 고르기 창이 닫힐 때 SwiftUI가 `isPresented` 바인딩으로 고른 자리를 먼저 지웠다. 창 표시 여부와 넣을 자리를 따로 둔다.
- **그림만 있는 대지**: UITextView가 글이 없는 대지에서 붙여넣기를 막아, 그림·URL이 있으면 허용하고 붙여넣기 설정에 그림과 파일 URL을 더했다.
- **TipTap 입력 규칙과 코드 마크**: 5a·5b의 입력 규칙도 코드 마크 옆에서 돌았다. TipTap `run$1`처럼 모두 멈춘다.

## Morrow와 다른 점

- **수식 그림**: Morrow는 KaTeX HTML을 페이지에 넣고, 여기서는 같은 KaTeX가 그린 결과의 그림을 넣는다. 그림이 준비되기 전에는 원문이 흐리게 보인다. 수식 글자를 선택해 복사할 수는 없다.
- **Mermaid 글꼴**: Morrow의 `Inter Variable`이 앱에 없어 시스템 글꼴로 그린다.
- **편집 창 미리보기**: 입력이 150ms 멈춘 뒤 그리고, 높이 120pt 칸에서 크면 스크롤한다(시트 크기가 열릴 때 정해짐).
- **끌어 놓기 자리**: Morrow는 떨어뜨린 자리에 넣고, 여기서는 캐럿 자리(없으면 맨 끝)에 넣는다.
- **소리**: 브라우저 `<audio controls>` 대신 재생·위치·길이 줄. 음량 조절은 기기 음량을 쓴다.

## 알려진 한계

- 확인하지 않은 것: 끌어 놓기(시뮬레이터 자동화로 끌 수 없음), 슬래시 Image, 영상 재생, Load image(바깥 서버 접속이라 하지 않음), 100MB 넘는 파일 안내.
- 두 번 누르기(원문 블록, Mermaid 그림)는 자동화 도구가 두 번 누를 때 약 1초 간격이라 인식되지 않아, 확인용으로 한 번 누르기로 바꾼 빌드에서 편집 창을 확인하고 되돌렸다(11d-4와 같은 방식). 여러 파일 고르기도 고르기 창의 Open 단추를 자동화로 누르지 못해 한 개 고르기 빌드에서 확인하고 되돌렸다.
- 시험 중 첨부한 `.md` 파일은 다시 열면 core의 Markdown 읽기에 따라 페이지 링크(`[[attachments/Broken]]`)가 된다. Morrow core와 같은 동작이다.
- 한글 조합 입력과 macOS 앱은 5a와 같은 이유로 확인하지 못했다. macOS에서 웹 렌더러는 창의 내용 뷰 아래에 투명하게 둔다.
- 끼워 넣기(`![[`), 행 속성 줄, 기록 창은 11d-5c-2.
