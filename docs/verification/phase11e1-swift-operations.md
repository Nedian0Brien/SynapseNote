# 11e-1단계 Morrow 작업을 Swift로 검증 결과

- 날짜: 2026-10-21
- 브랜치: `feat/swift-operations`(기준 `feat/swift-editor-embeds`)
- 환경: Xcode 27.0, macOS 27.0, iPad Pro 13-inch (M5) 시뮬레이터(iOS 27.0, 앱 컨테이너의 시험 vault)
- 비교 기준: Morrow a2daae1의 `src/app/operations.ts`, `src/app/ui.ts`(toast), `src/app/platform/files.ts`(stamp), web `src/main.tsx`(자동 백업, 캡처 알림), fflate 0.8.3, katex 0.18.10

## 바뀐 것

Morrow `operations.ts`의 작업을 웹 대신 Swift가 한다. Swift 세션 상태를 읽어 같은 명령을 만들고, 명령은 이 단계까지 웹을 거쳐 양쪽에 적용된다(11e-2에서 Swift만).

- **페이지 작업**(`Operations/PageOperations.swift`): 새 페이지·데이터베이스·캔버스(열고 제목 칸으로), 오늘 노트(저널이 없으면 만들고, 일간 템플릿, 날짜 순서 자리), 빠른 기록(굵은 시각, `[ ]`·`[x]` 줄은 할 일, 빈 줄로 나눔, "Added to today's note."), 템플릿(템플릿 페이지 열기·만들기, 새 템플릿, 템플릿에서 새 페이지, 템플릿으로 저장과 Open 알림), 휴지통(보던 페이지면 부모나 홈으로, Undo 알림), 복원(Open 알림).
- **데이터 작업**(`Operations/DataOperations.swift`): 페이지 Markdown(첨부가 있으면 zip), 전체 Markdown zip, 웹사이트 게시 zip(수식 MathML), 백업 JSON, 백업 복원(파일 먼저 저장 후 `pages.insert`), 가져오기(.md·.markdown·.mdown·.txt·.zip, 중첩 zip 두 단계, 500MB 제한), 안 쓰는 파일 지우기, 설정의 파일 요약, macOS 자동 백업(30초 뒤, 10분마다, 앱을 닫기 전, 바뀐 페이지가 있을 때).
- **zip**(`Core/Export/Zip.swift`): Compression의 raw DEFLATE와 직접 쓴 zip 머리. 저장·deflate 읽기, ZIP64·암호 zip은 안내.
- **KaTeX**(`Core/Export/Katex.swift`): JavaScriptCore에서 `renderToString(output: 'mathml')`, 게시와 PDF에 쓴다.
- **PDF**: `Site.printPage`(게시 사이트의 한 페이지에서 내비게이션을 뺀 것, 밝은 색)를 `PDFExporter`로 A4에 인쇄. 11d-5c-2의 "인쇄 동안 웹에 그리기"는 없앴다.
- **알림**: 네이티브 알림에 단추(Undo, Open)와 Swift 동작. 시간은 Morrow처럼 5초, 오류 8초.
- 앱은 위 작업의 웹 메시지와 웹의 자동 백업 메시지를 더는 쓰지 않는다. 웹 쪽 처리 코드는 11e-2에서 지운다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개 |
| `npm --prefix web run zip-fixtures` | fflate가 쓴 zip(레벨 6, 저장, 폴더 항목, 한글 이름, 빈 파일, 바이너리)과 KaTeX MathML 다섯 개(`\dfrac`, `aligned`, 없는 명령 포함)를 `zip.json`·`katex.json`에 씀(시각 고정) |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 194개(11d-5c-2 185개 + `ZipTests` 3 + `OperationsTests` 2 + `DataOperationsTests` 4) |

- `ZipTests`: fflate zip을 Swift가 읽어 내용이 같음, Swift zip 왕복, CRC-32, DOS 시각. Swift가 쓴 zip은 node fflate `unzipSync`와 `unzip -t`로 읽어 다섯 파일이 같음을 따로 확인했다.
- `OperationsTests`: 캡처 문서(시각·줄바꿈·할 일·빈 첫 문단), 캡처 시각(en-US "09:05 AM", ko-KR "오전 09:05", WebKit JavaScriptCore `toLocaleTimeString` 결과와 같게 좁은 공백 대신 공백).
- `DataOperationsTests`: KaTeX MathML이 node와 같음(5개), 중첩 zip, `stamp`·복수형, 인쇄 페이지 HTML.
- 변형 확인은 이 단계의 순수 함수가 대부분 이미 비교 자료로 확인된 core 이식이라 따로 하지 않았다.

## iPad에서 확인한 것

| 동작 | 결과 |
|---|---|
| Open Today’s Note | `Journal/2026-10-21.md`가 일간 템플릿(날짜 채움)으로 만들어져 열림 |
| Quick Note to Today("Called the bank", 빈 줄, "[ ] Send invoice") | `**05:24 AM** Called the bank`와 할 일, 알림 |
| Save Page as Template | `Templates/Wednesday, October 21, 2026.md`, Open 단추가 있는 알림 |
| Move Page to Trash → Undo | 휴지통으로 가고 Journal로 이동, Undo로 돌아와 그 페이지로 |
| Trash 화면 Restore | 파일이 돌아오고 "Restored …" 알림 |
| Export Page as Markdown(Media test) | `Media test.zip`: Markdown과 첨부 세 개 |
| Export Everything / Publish Everything / Save a Backup | Markdown zip, 웹사이트 zip(`style.css`와 페이지 HTML), 백업 JSON(페이지 40, 파일 4) |
| Restore from a Backup(방금 백업) | "Restored 2 pages (38 already present, 4 could not be read)." 아래 참고 |
| Import Markdown Files(Media test.zip) | "Imported 1 page (3 attachments).", 첨부가 새 이름으로 저장되고 페이지가 열림 |
| Delete Unused Files | 안 쓰는 파일 지움과 알림(아래 고친 것 참고) |
| Export Page as PDF(Media test, 명령 팔레트) | 1쪽에 제목, 수식, 파일 이름, 코드, 원문 블록 글 |
| DEBUG 세션 비교 | 30분 동안 513번, 차이 0 |

복원 결과: 백업 뒤 그 사이 저장된 두 페이지는 `updatedAt`이 달라 Morrow `planRestore`대로 "(restored)" 사본이 되었고, 읽지 못한 페이지 네 개(읽을 수 없는 캔버스·노트)는 문서가 없어 "could not be read"로 셌다. 둘 다 node 비교 자료로 맞춘 core 이식의 동작이다.

## 함께 고친 것

- **iOS PDF가 빈 쪽**: 웹 뷰를 불러온 뒤에야 창에 넣어 배치가 안 된 채 인쇄되었다. 불러오기 전에 창에 넣는다. 이전에는 편집기 화면의 글꼴·스타일을 불러오는 시간이 있어 드러나지 않았다.
- **안 쓰는 파일이 노트를 지움**: Morrow는 attachments 폴더 안의 `.md`를 페이지로 읽으면서 파일 목록에도 넣어, 안 쓰는 파일 지우기가 그 노트 파일을 지운다(웹으로 하던 때도 같음). 이 확인에서 시험 노트 `attachments/Broken.md`가 지워졌다(`.morrow/deleted`에 남음). 페이지 파일은 안 쓰는 파일에서 뺀다. Morrow와 다른 점이다.
- **게시 이름**: 처음에는 vault 폴더 이름(`Documents`)을 썼다. 웹처럼 vault 이름을 쓴다.

## Morrow와 다른 점

- **PDF 모양**: Morrow 데스크톱은 편집기 화면을 인쇄한다. 앱은 게시 사이트의 페이지 모양(세리프 본문, 게시 스타일)으로 인쇄하고, 수식은 MathML이다. 하위 페이지와 링크한 페이지 목록은 넣지 않는다.
- **안 쓰는 파일**: 페이지 파일은 지우지 않는다(위).
- **zip**: 내용은 같고 바이트는 fflate와 다르다(압축기와 시각).

## 알려진 한계

- 명령은 아직 웹을 거쳐 양쪽에 적용된다. 상태 소유를 Swift로 옮기고 웹을 지우는 것은 11e-2.
- 확인하지 않은 것: 템플릿에서 새 페이지, 새 템플릿, macOS 자동 백업(macOS 앱을 실제 폴더로 돌리지 않음), 500MB 안내, ZIP64 안내.
- 시뮬레이터 터치가 앱 재설치 뒤 멈추는 일이 두 번 있어 시뮬레이터를 다시 켰다(이 세션의 시뮬레이터만).
