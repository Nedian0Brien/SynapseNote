# Spec: 7단계 가져오기·내보내기·백업·게시·Markdown 소스 편집

상위 intent: `intent_morrow-full-port.md` (수락됨). 기준은 Morrow a2daae1의 다음 파일이다.

- `app/operations.ts`: `exportPageMarkdown`, `exportPagePdf`, `exportBackup`, `exportAllMarkdown`, `publishSite`, `importMarkdown`, `restoreBackup`, `deleteUnusedFiles`, `writeAutoBackup`
- `app/actions.ts`(Page·Data 그룹), `components/pageMenu.ts`, `components/Home.tsx`(빈 vault의 Import), `components/SourceEditor.tsx`, `PageView.tsx`(소스 모드)
- `electron/main.cts`: PDF(A4, 여백 0.6인치, 배경 인쇄), 자동 백업(20개 유지, 임시 파일 뒤 이름 변경)

## 설계 결정

- **파일 저장은 호스트가 한다.** `WebPage`에는 다운로드 API가 없다(SDK의 `WebKit.swiftinterface`에서 확인). Morrow `platform/files.ts`를 `host/files.ts`로 바꿔, `saveFile`은 내용을 base64로 앱에 보낸다. 앱은 시스템 저장 대화상자(`fileExporter`)를 띄운다. base64 전달은 vault RPC가 첨부 파일에서 이미 쓰는 방식이다.
- **파일 고르기는 Morrow의 `<input type=file>`을 그대로 쓴다.** 앱의 `FileInputPresenter`(WebPage.DialogPresenting)가 시스템 선택기를 띄우고 임시 복사본을 넘긴다. 앱 메뉴에서 시작한 호출도 선택기가 뜨는지 조작으로 확인하고, 막히면 호스트 요청으로 바꾼다.
- **알림(toast)은 앱이 그린다.** 홈·작업 같은 앱 화면이 WebView를 덮고 있으면 웹의 알림이 보이지 않는다. 웹은 Morrow `ui.toasts`를 앱에 보내고, 앱이 모든 화면 위에 그린다. 동작 버튼(Undo 등)은 누르면 웹에 돌려보낸다. 웹의 `<Toasts />`는 그리지 않는다.
- **PDF는 편집기의 페이지 DOM을 인쇄한다.** Morrow는 Electron `printToPDF`로 보이는 페이지를 A4로 나눠 인쇄한다. `WebPage.exported(as: .pdf())`는 긴 한 쪽만 만든다. 그래서 웹이 페이지 본문 HTML과 문서의 스타일시트 링크를 넘기고, 앱은 화면 밖 `WKWebView`(같은 `synapse-editor`·`synapse-vault` 스킴 처리기)에 불러와 페이지를 나눠 인쇄한다.
  - macOS: `printOperation(with:)`, 저장 처리. 화면이 잠긴 상태에서도 5쪽 PDF가 나오는 것을 시험으로 확인했다.
  - iOS: `UIPrintPageRenderer` + `viewPrintFormatter()`
- **자동 백업은 macOS만 한다.** Morrow도 데스크톱에서만 한다. 30초 뒤 한 번, 그 뒤 10분마다, 앱 종료 전 저장 때 쓴다. 위치는 앱 지원 폴더의 `Backups`이고 20개를 유지한다. vault 모드라 첨부 파일은 넣지 않는다(Morrow와 같다).
- **이름**: 사용자에게 보이는 Morrow 이름(내보내기 폴더명, 사이트 제목 기본값, 백업 파일명, 오류 문구, 사이트 `generator` 메타)은 빌드 시 SynapseNote로 바꾼다. 백업 JSON의 `format: "morrow-backup"`은 파일 형식이라 그대로 둔다.

## 요구사항

1. **내보내기**: 페이지 Markdown(첨부가 있으면 zip), 페이지 PDF(캔버스 제외), 전체 Markdown zip, 백업 JSON. 암호화된 페이지는 Morrow 안내와 함께 거절한다.
2. **게시**: 전체 또는 이 페이지와 하위 페이지를 정적 사이트 zip으로 만든다.
3. **가져오기**: `.md`·`.txt`·`.zip`(Notion 내보내기 포함), 페이지 메뉴의 "Import Markdown here"는 그 페이지 아래로. 홈의 빈 vault 화면에 Import 버튼을 둔다.
4. **백업 복원**: 백업의 페이지를 더하고 기존 페이지는 덮어쓰지 않는다.
5. **쓰지 않는 파일 지우기**: Morrow 설정의 동작을 메뉴에 둔다.
6. **Markdown 소스 편집**: 페이지 메뉴 "Edit as Markdown" ↔ "Back to the editor". Morrow 안내 띠와 `SourceEditor`를 쓴다. workspace 메시지에 `sourceMode`를 더한다.
7. **메뉴**: 동작 표(Page·Data), 페이지 메뉴(`pageMenu.ts` 86~99행 순서), 메뉴 막대 File > Import/Export.

## 받아들이는 기준

- 웹·Swift 테스트 통과: 새 메시지와 명령 형식, `files.ts` 계약, 알림 전달, macOS PDF 쪽수, 백업 쓰기와 20개 유지.
- iPad에서 조작하고 vault와 내보낸 파일로 결과를 확인해 `docs/verification/phase7-import-export.md`에 적는다. 화면이 잠긴 macOS는 자동 테스트로 확인한 것과 조작하지 못한 것을 나눠 적는다.

## 범위 밖

- 설정 창의 "Your data" 구역과 백업 폴더 보기 단추: 9단계 설정 창에서
- 동기화: 8단계
