# Plan: 7단계 가져오기·내보내기·백업·게시·Markdown 소스 편집

spec: `spec_phase7-import-export.md`. 브랜치 `feat/export`(기준 `feat/history`), 워크트리 `.worktree/export`.

## 순서

1. **전달 경로** (`web/vite.config.ts`, `web/src/host/files.ts` 신규, `contract.ts`, `bridge.ts`)
   - `HOST_MODULES['platform/files.ts']`. `saveFile` → `{type:'saveFile', name, mime, data}`. `pickFiles`·`newId`·`stamp`는 Morrow 것을 다시 내보낸다.
   - RENAMED: `operations.ts`(폴더명, 제목 기본값, 파일명), `core/site.ts`(generator), `core/portability.ts`(오류 문구)
   - Swift: `EditorEvent.saveFile` → macOS `NSSavePanel`, iOS `fileExporter`(`ExportDocument`)
     - iOS의 `fileExporter`는 별도 배경 뷰에 둔다. 가져오기 두 개와 같은 뷰에 두면 창이 터치를 받지 않았다.
   - 웹 파일 선택기의 `fileImporter`는 완료·취소 처리기에서만 답한다. 바인딩이 완료보다 먼저 false로 바뀌어, 고른 파일 대신 취소가 전달되던 문제를 고친다.
2. **알림** (`main.tsx`, Swift `ToastOverlay.swift` 신규)
   - `ui.toasts`가 바뀌면 `{type:'toasts', toasts:[{id, message, tone, action}]}`
   - 앱: Morrow처럼 아래 가운데, 모든 화면 위. 동작 버튼 → `toastAction {id}`, 닫기 → `dismissToast {id}`
3. **동작** (`main.tsx` 메시지 처리, Swift 명령)
   - `exportMarkdown {pageId}`, `publish {pageId|null}`, `exportAll`, `backup`, `restore`, `importMarkdown {parentId|null}`, `deleteUnusedFiles`, `setSourceMode {pageId|null}`
4. **소스 모드** (`main.tsx` `Page`): `ui.sourceMode === pageId`이면 머리글 + `source-banner` + `SourceEditor`. workspace 메시지에 `sourceMode`.
5. **PDF**
   - 웹: `pdfSnapshot(pageId)` 호출 → `{title, head, body, accent, colorful}`. 본문은 화면의 `.page`를 복제한 것이고, 스타일시트는 문서의 `<link>`·`<style>`이다.
   - Swift `PDFExporter.swift` 신규: 스킴 처리기 어댑터(`WKURLSchemeHandler`), 화면 밖 `WKWebView`, macOS `printOperation`, iOS `UIPrintPageRenderer`. A4, 여백 0.6인치.
     - 배경 인쇄(`shouldPrintBackgrounds`, Electron `printBackground`와 같음), 글꼴과 그림을 기다린 뒤 인쇄
     - 복제한 본문에는 입력 칸의 현재 값(체크 상태, 콜아웃 제목)을 옮기고, 늦게 불러오는 그림을 바로 불러오게 한다
6. **자동 백업** (macOS): `main.tsx` 타이머(30초, 10분) → `{type:'autoBackup', json}`. 종료 전 저장 때도 보낸다. Swift `AutoBackup.swift`: `Backups/synapsenote-backup-<시각>.json`, 임시 파일 뒤 이름 변경, 20개 유지.
   - 자동 백업을 열어 볼 길이 있어야 하므로 macOS File 메뉴에 Show Automatic Backups in Finder를 둔다.
7. **메뉴** (`AppAction.swift`, `Sidebar.swift` 페이지 메뉴, `SynapseNoteApp.swift`, `HomeView.swift` 빈 화면 Import)
8. **테스트**: `bridge.test.ts`, 알림·소스 모드 메시지, Swift 명령 JSON, `DataExportTests`(macOS PDF 쪽수·용지 크기, 백업 이름과 20개 유지, 파일 이름 규칙)
9. **검증**: iPad 조작(Files 앱 폴더에서 `unzip -l`로 확인), 검증 문서, 로드맵, 푸시, PR #8(기준 `feat/history`)
