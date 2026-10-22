# Plan: 11d-5c-1 그림·첨부 파일·수식·원문·코드 강조

spec: `spec_phase11d-native-screens.md`(11d-5c-1, 수식·그림·강조 표시 방식). 브랜치 `feat/swift-editor-media`(기준 `feat/swift-editor-blocks`), 워크트리 `.worktree/swift-editor-media`, PR 기준 `feat/swift-editor-blocks`.

1. **렌더러 배포 파일**: `scripts/vendor-renderers.mjs`가 web의 `katex`(js·css·woff2 글꼴), `mermaid`(`dist/mermaid.min.js`), highlight.js common(rolldown으로 IIFE `hljs`)을 `App/Renderers/`에 쓴다. 저장소에 넣고 `project.yml` 자원에 더한다. 라이선스는 `LICENSES/`와 `NOTICE`에.
2. **코드 강조**(`Core/Editor/CodeHighlight.swift`): JavaScriptCore에서 highlight.js를 돌려 lowlight처럼 언어가 있으면 `highlight`, 없거나 모르면 `highlightAuto`. 결과 HTML의 `hljs-*` 범위를 읽어 Morrow `features.css` 색(밝은·어두운)으로. 언어 목록 `CODE_LANGUAGES`(lowlight common + mermaid, 정렬). node 비교 자료(`editor-fixtures`에 강조 결과와 언어 목록)와 같은지 테스트.
3. **웹 렌더러**(`Editor/WebRenderer.swift`): 창 안의 보이지 않는 `WKWebView` 하나가 KaTeX(`throwOnError: false`, `strict: false`, display 여부)와 Mermaid(Morrow `configureMermaid` 색, 밝은·어두운)를 그려 요소 크기만큼 `takeSnapshot`. 그림은 (종류, 원문, 글자 크기, 어두움)으로 보관한다. 그리는 동안은 불러오는 중 표시, Mermaid 오류는 "This diagram has a mistake: …".
4. **수식**: `inlineMath`(글 안 원자, 그림 첨부물)·`blockMath`(블록). 누르면 편집 창(원문 입력, 미리보기, ⌘Return 저장, 비우면 삭제). `$…$` 입력 규칙(Morrow `InlineMathDollar` 정규식). 슬래시 Formula(빈 블록 수식, 바로 편집 창)·Inline formula(`x^2`).
5. **그림·첨부 파일**: `image`(fileId면 vault 파일 그림, 없으면 "This image is missing from your workspace.", https `src`는 "Image from host"와 Load image, 그 밖은 "Image not found: …"), `fileAttachment`(이름, `formatBytes` 크기, Save a copy; 소리·영상은 AVKit, PDF는 PDFKit로 페이지 안 재생). 슬래시 Image·File(파일 고르기), 끌어 놓기와 붙여넣기(파일·그림, 100MB 넘는 파일 제외 안내), Morrow `mediaNodes` 모양으로 넣고 뒤에 빈 문단.
6. **원문 블록**: "Kept as written" 표시와 원문, 두 번 누르면 "Edit as written" 편집 창.
7. **코드 블록**: 강조 표시, 언어 목록을 `CODE_LANGUAGES`로. Mermaid 언어면 350ms 뒤 그림, 그림이 있으면 코드를 접고 Edit diagram·Hide code 단추, 그림 두 번 누르면 코드. 슬래시 Diagram.
8. **스키마·화면 선택**: 위 노드를 `EditorSchema`·`EditorScreen.draws`에 더한다(끼워 넣기는 5c-2).
9. **편집 변환**: 미디어·수식 블록 넣기, 원자 넣기, 속성 바꾸기, 수식 삭제. 단위 테스트와 변형 확인.
10. **확인**: macOS 단위 테스트, web 테스트, iPad 확인(그림·파일 넣기와 표시, 수식 입력과 편집, 강조, Mermaid, 원문 블록), 문서·로드맵·PR.
