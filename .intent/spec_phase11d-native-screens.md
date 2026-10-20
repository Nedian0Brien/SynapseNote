# Spec: 11d 네이티브 화면

상위: `intent_morrow-full-port.md`(수락됨). 11c 뒤에 웹에 남은 것은 화면이다: 블록 편집기(TipTap), 데이터베이스 보기, 캔버스, 페이지 머리(아이콘·커버·태그·하위 페이지), Markdown 원문 편집, 기록 창. 내보내기·게시·가져오기·백업은 웹의 `operations.ts`가 Morrow core로 한다.

## 순서와 이유

편집기는 `pageLink`(embed)로 데이터베이스 보기와 캔버스를 블록 안에 그린다. 그래서 편집기가 온전하려면 그 둘이 먼저 있어야 한다. 매 단계는 그 자체로 완성된 앱이어야 하므로 아래 순서로 간다.

| 단계 | 내용 | 받아들이는 기준 |
|---|---|---|
| 11d-1 | 화면이 쓰는 core 이식: `database.ts`(값·필터·정렬·묶기·형식·변환·표에서 만들기), `formula.ts`, `diff.ts`, `site.ts`(문서 → HTML, 게시와 PDF), `portability.ts`(백업 쓰기·읽기·복원 계획, Markdown 내보내기), `importer.ts`(가져오기 계획, CSV), `migrations.ts`의 `readWorkspace`. 앱 동작은 그대로 | node에서 Morrow로 만든 비교 자료와 JSON·바이트 단위로 같음 |
| 11d-2 | 페이지 머리(커버·아이콘·제목·태그), Markdown 원문 편집, 읽지 못한 페이지 알림을 SwiftUI로. 기록 창은 판을 서식대로 그려야 해서 네이티브 읽기 전용 렌더링이 생기는 11d-5로 옮김(수정 2026-10-20) | iPad 화면, DEBUG 세션 비교 차이 0 |
| 11d-3 | 데이터베이스 페이지 전체(머리, 표·보드·달력·목록·갤러리, 도구 막대, 속성·보기 설정, 값 편집). 다른 페이지 안에 든 데이터베이스와 행 페이지의 속성 줄은 편집기 페이지에 속해 11d-5에서 옮김(수정 2026-10-20) | 보기 계산은 11d-1 비교 자료로 확인됨. 편집 변환 단위 테스트, iPad 확인, DEBUG 세션 비교 차이 0 |
| 11d-4 | 캔버스 페이지(노드·연결·그리기·보기 이동과 확대·되돌리기). 편집기 안에 든 캔버스는 11d-5에서 옮김(수정 2026-10-20) | `CanvasFile` 왕복은 앞 단계에서 확인됨. 편집 변환 단위 테스트, `strokePath` Morrow 비교, iPad 확인, DEBUG 세션 비교 차이 0 |
| 11d-5 | 블록 편집기. 셋으로 나눔(수정 2026-10-20). 호스트는 문서의 노드·마크 종류가 모두 네이티브 지원 목록에 있을 때만 네이티브 편집기를 고르고, 아니면 지금처럼 웹 편집기를 쓴다. 그래서 단계마다 앱이 온전하다 | 아래 11d-5a~c |
| 11d-5a | 편집기 모델(TipTap 스키마대로 문서 정규화, 끝 문단 추가), 글 블록: 문단·제목·글머리표·번호·할 일 목록·인용·코드·구분선·줄바꿈과 마크 8종, 자리 표시 글, 입력 규칙(`# `, `- `, `1. `, `[ ] `, `> `, ```` ``` ````, `---`), 슬래시 명령(이 단계 블록), 서식 단축키와 링크 편집, 찾기, 되돌리기, 250ms 저장, 바깥 변경 반영, 맨 위에서 위 화살표로 제목, ⌘S | `markdown.json`·`markdown-fuzz.json`의 문서를 정규화한 결과가 TipTap(`getSchema` + `nodeFromJSON().toJSON()`)과 JSON으로 같음. 글 블록 ↔ 편집 텍스트 왕복이 입력과 같음. 편집 변환 단위 테스트·변형 확인. iPad·macOS 편집, 한글 조합 입력, DEBUG 세션 비교 차이 0 |
| 11d-5b | 페이지 링크(`[[`)·날짜(`@`)·태그 표시, 표와 표 메뉴, 콜아웃, 접기, 단, 목차, 블록 손잡이와 블록 메뉴, Markdown 붙여넣기 | 같은 기준 |
| 11d-5c | 둘로 나눔(수정 2026-10-21): 5a·5b보다 범위가 커서 | 아래 11d-5c-1·5c-2 |
| 11d-5c-1 | 그림·첨부 파일(소리·영상·PDF 재생 포함)·끌어 놓기와 붙여넣기, 수식(인라인·블록, `$…$` 입력 규칙, 미리보기 편집 창), 원문 블록, 코드 강조와 Mermaid 그림 | 같은 기준. 강조 결과가 lowlight와 같음(node 비교 자료) |
| 11d-5c-2 | 페이지 끼워 넣기(데이터베이스·캔버스·페이지), 행 페이지 속성 줄, 기록 창. 끝나면 모든 `KNOWN_NODE_TYPES`·`KNOWN_MARK_TYPES`가 네이티브이고 네이티브 편집기가 기본 | 같은 기준 |

11e에서 웹 편집기·번들·node 빌드를 없애고, 저장 시점을 Swift `SaveQueue` 타이머로 옮기고, 내보내기·게시·가져오기·백업을 11d-1 이식으로 돌린다.

## 지켜야 할 것

- 11a부터의 JS 규칙(UTF-16, 키 순서, 안정 정렬, `localeCompare`, 로캘 날짜)을 그대로 쓴다.
- 화면 단계는 새 계산을 만들지 않고 11d-1 이식만 부른다.
- 편집기 기술(2026-10-20 확인): SwiftUI `TextEditor(text:selection:)`는 iOS·macOS 26에서 `AttributedString` 서식 편집을 하지만, 문서에 첨부물이나 글 안에 끼우는 뷰에 대한 설명이 없다([TextEditor](https://developer.apple.com/documentation/swiftui/texteditor)). 페이지 링크·날짜·수식은 글 안의 뷰여야 하므로 블록마다 TextKit 2 텍스트 뷰(`UITextView`·`NSTextView`)를 쓰고, 글 안 원자는 `NSTextAttachment`와 `NSTextAttachmentViewProvider`(iOS 15·macOS 12부터, [UIKit](https://developer.apple.com/documentation/uikit/nstextattachmentviewprovider), [AppKit](https://developer.apple.com/documentation/appkit/nstextattachmentviewprovider))로 그린다. 목록·인용·표·단 같은 구조는 SwiftUI 컨테이너다.
- 수식·그림·강조 표시(2026-10-21 확인): Morrow는 화면 수식을 KaTeX로, 게시·PDF 수식도 KaTeX(`operations.ts`의 `renderToString`, `output: 'mathml'`)로 만든다. 그래서 11e 뒤에도 KaTeX JS는 남는다. 네이티브 대안 SwiftMath(iosMath 이식)는 KaTeX와 받는 명령이 달라, 이를 쓰는 MarkdownView는 `\dfrac`, `align`, `cases`, `\boxed`를 SwiftMath에 넘기기 전에 다른 명령으로 바꿔 쓴다([MarkdownView 수식 안내](https://www.mintlify.com/HumanInterfaceDesign/MarkdownView/guides/math-rendering)). Morrow에서 쓰던 수식이 달리 보이지 않도록 화면도 KaTeX로 그린다. Mermaid는 DOM이 있어야 그려지고 Apple 플랫폼에 네이티브 렌더러가 없다. 둘은 앱이 품은 `katex`·`mermaid` 배포 파일을 창 안의 보이지 않는 `WKWebView` 하나에서 그리고 `takeSnapshot(with:)`([문서](https://developer.apple.com/documentation/webkit/wkwebview/takesnapshot(with:completionhandler:)))으로 그림을 받아 첨부물·블록에 넣는다(Morrow처럼 그리는 동안은 불러오는 중 표시). 창 밖 웹 뷰의 스냅숏은 문서가 보장하지 않아 창 안에 둔다. 코드 강조는 lowlight가 highlight.js이므로 highlight.js(common 언어)를 JavaScriptCore에서 돌리고 `hljs-*` 분류를 Morrow `features.css` 색으로 바꾼다. 배포 파일은 node 스크립트로 한 번 만들어 저장소에 넣어, 11e에서 node 빌드를 없애도 남는다.
- 문서(`DocNode`)가 유일한 기준이다. 편집은 `EditorEdits`의 순수 변환으로 문서를 바꾸고, Morrow처럼 문서 전체를 `page.setDoc`으로 보낸다.
- Morrow와 다른 점(예정): 글 선택은 한 블록 안에서만 된다. 여러 블록 선택은 블록 손잡이로 한다(11d-5b). 되돌리기는 페이지 단위 기록(문서 상태)으로 한다.

## 범위 밖

동기화 실기기 두 대 확인, 서명·TestFlight(사용자 결정), 웹 제거(11e).
