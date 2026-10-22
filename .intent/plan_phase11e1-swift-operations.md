# Plan: 11e-1 Morrow 작업을 Swift로

spec: `spec_phase11e-web-removal.md`(11e-1). 브랜치 `feat/swift-operations`(기준 `feat/swift-editor-embeds`), 워크트리 `.worktree/swift-operations`, PR 기준 `feat/swift-editor-embeds`.

명령은 이 단계까지 `perform`으로 웹을 거쳐 양쪽에 적용한다. 작업은 Swift 세션 상태(`SessionHost`)를 읽어 Morrow `operations.ts`와 같은 명령을 만들고, 알림은 네이티브로 낸다.

1. **명령**: `WorkspaceCommand`에 Morrow `page.create`의 모든 필드(아이콘, 태그, dailyDate, index, doc, database)와 `pages.insert`(페이지와 문서)를 더한다. 세션 상태 읽기 `SessionHost.state()`.
2. **알림 단추**: 네이티브 알림에 단추와 Swift 동작(Undo, Open)을 둔다.
3. **페이지 작업**(`Operations/PageOperations.swift`): createPage(열고 제목 칸으로, 부모 펼침), ensureToday·openToday(저널·일간 템플릿·삽입 자리), captureToToday(시각, 할 일 줄, 빈 첫 문단 대체), 템플릿(createTemplatesPage, createFromTemplate, saveAsTemplate와 Open 알림), trash(Undo 알림, 보던 페이지면 부모나 홈으로), restore(Open 알림).
4. **zip**(`Core/Export/Zip.swift`): 쓰기(deflate, CRC-32, UTF-8 이름), 읽기(저장·deflate, 중첩 zip 두 단계까지는 Importer 쪽 `unzipAll`). node 비교: Swift가 쓴 zip을 fflate가 읽고, fflate가 쓴 zip을 Swift가 읽는다.
5. **데이터 작업**(`Operations/DataOperations.swift`): 페이지 Markdown 내보내기(첨부 있으면 zip), 전체 Markdown zip, 웹사이트 게시 zip(수식은 JavaScriptCore의 KaTeX `output: 'mathml'`), 백업 JSON과 자동 백업, 백업 복원(파일 먼저 저장 후 `pages.insert`), 가져오기(.md·.txt·.zip, 500MB 제한), 안 쓰는 파일 지우기, 암호 페이지 안내 등 Morrow 문구 그대로.
6. **PDF**: `Site.docToHtml`로 만든 페이지 HTML(제목, 행 속성은 게시 사이트처럼)과 게시 스타일을 `PDFExporter`로 인쇄. 웹 화면을 그리던 11d-5c-2의 임시 경로를 없앤다.
7. **브리지 정리**: 위 작업의 웹 메시지(`createPage`, `trashPage`, `capture`, `openToday`, 템플릿, 내보내기·게시·백업·복원·가져오기·지우기, `autoBackup`, `saveFile` 경로)를 앱이 더는 보내지 않게 한다. 웹 쪽 처리 코드는 11e-2에서 웹과 함께 지운다.
8. **확인**: 단위 테스트(명령 모양, 캡처 블록, 일간 노트 자리, zip 왕복과 fflate 비교, 작업이 만든 파일 목록), iPad 확인, DEBUG 세션 비교, 문서·로드맵·PR.
