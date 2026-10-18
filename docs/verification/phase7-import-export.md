# 7단계 가져오기·내보내기·백업·게시·Markdown 소스 편집 검증 결과

- 날짜: 2026-10-19
- 브랜치: `feat/export`(기준 `feat/history`)
- 환경: Xcode 27.0, iOS 27.0 시뮬레이터(iPad Pro 13-inch (M5)), macOS 테스트 실행
- 시험 vault: 앱 문서 폴더의 시험 vault. 내보낸 파일은 Files 앱의 On My iPad에 만든 시험 폴더에 저장했다.
- macOS는 화면이 잠겨 있어 조작하지 못했다. 자동 테스트로 확인한 것과 나눠 적는다. iPhone은 이 단계에서 조작하지 않았다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` / `test` / `build` | 통과, 웹 테스트 37개. 새 메시지(내보내기·게시·가져오기·복원·소스 모드·알림 동작) 파싱, `pdfSnapshot` 호스트 호출. 빌드의 이름 검사 통과(바꾼 Morrow 문구가 남지 않음) |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 67개. 새 이벤트(`saveFile`·`toasts`·`autoBackup`, workspace의 `sourceMode`)와 명령 형식, 자동 백업 이름과 20개 유지, 파일 이름 규칙, 인쇄 문서 구성, **macOS PDF: 120문단 문서가 A4(595.28×841.89pt) 여러 쪽으로 나뉘고 마지막 문단까지 글자가 들어 있음** |
| iPad 빌드 | 통과 |

## 기능 (iPadOS)

| 항목 | 결과 | 확인 방법 · 비고 |
|---|---|---|
| 페이지 Markdown 내보내기 | 통과 | 저장 시트 → `Secret.md`. 내용은 Morrow `pageMarkdown`대로 `# 제목`과 본문 |
| 전체 Markdown 내보내기 | 통과 | `synapsenote-markdown-<시각>.zip`. `unzip -l`: `SynapseNote/` 아래 페이지 17개와 `attachments/diagram.png` |
| 정적 사이트 게시(전체) | 통과 | "Made a website of 19 pages…" 알림, `SynapseNote-website-<시각>.zip`. `index.html`, 페이지별 html, `files/1-diagram.png`, `generator` 메타가 SynapseNote |
| 백업 저장 | 통과 | "Backup saved…" 알림, `synapsenote-backup-<시각>.json`. `format: morrow-backup`, 페이지 18개, 첨부 1개 |
| 백업 복원 | 통과 | 한 페이지를 더한 백업을 복원 → 홈의 페이지 수 18 → 19, "Restored from backup" 페이지 하나만 더해짐 |
| Markdown 가져오기 | 통과 | 앱 메뉴에서 연 파일 선택기 → `Secret.md` → "Imported 1 page." 알림, vault에 `Secret 2.md`(같은 제목이라 앞머리에 title) |
| Markdown 소스 편집 | 통과 | Edit as Markdown → Morrow 안내 띠와 소스 칸. 입력한 문장과 `## Heading`이 파일에 저장되고, Back to the editor 후 편집기에 제목으로 보임 |
| 페이지 PDF | 통과 | `Home.pdf` 한 쪽, A4. 아이콘 이모지, 콜아웃 배경과 제목, 체크한 할 일, vault 그림, 태그 색이 화면과 같게 인쇄됨 |
| 알림이 앱 화면 위에 보임 | 통과 | 홈 화면에서 가져오기 → "Imported 1 page." |
| 쓰지 않는 파일 지우기 | 미확인 | 팔레트에서 실행까지 했으나 결과 알림을 화면에서 잡지 못함 |
| PDF 저장 뒤 "Saved …" 알림 | 미확인 | 스크린숏 시점에 이미 사라짐 |

## 고친 문제

1. **웹 파일 선택기에서 고른 파일이 버려짐.** `fileImporter`는 선택을 마치면 `isPresented` 바인딩을 완료 처리기보다 먼저 false로 바꾼다. 바인딩에서 취소를 답하고 있어서, 고른 파일 대신 취소가 페이지에 전달됐다. 완료·취소 처리기에서만 답하도록 바꿨다(`fileImporter(…onCompletion:onCancellation:)`). 슬래시 메뉴의 그림 넣기도 같은 경로를 쓴다.
2. **iOS에서 창이 터치를 받지 않음.** 저장 시트(`fileExporter`)를 가져오기 두 개와 같은 뷰에 두자 화면의 모든 터치가 막혔다. 저장 시트를 별도 배경 뷰로 옮겼다.
3. **PDF의 체크 상태·콜아웃 제목이 빠짐.** 마크업 복제는 입력 칸의 현재 값을 담지 않는다. 복제본에 현재 값을 옮긴다.
4. **PDF의 배경과 아이콘이 빠짐.** 배경 인쇄를 켜고(`WKPreferences.shouldPrintBackgrounds`, Electron `printBackground`와 같음), 늦게 불러오는 그림을 바로 불러오게 한 뒤 모든 그림이 끝날 때까지 기다린다.

## 기록해 둘 동작

- 백업 알림("Backup saved…")은 저장 시트가 뜰 때 나온다. Morrow 데스크톱도 내려받기 대화상자보다 먼저 알린다.
- iPad 시뮬레이터에는 iCloud가 없어 Files의 On My iPad 아래에 시험 폴더를 만들어 저장했다. 앱 폴더(vault)에 저장하면 vault 파일이 되므로 시험에서는 피했다.
- PDF는 밝은 테마로 인쇄한다. Morrow의 인쇄 규칙은 배경만 흰색으로 바꾸므로 어두운 테마 글자가 흐려지기 때문이다.
- 자동 백업은 macOS에서만 쓴다(Morrow와 같음). 쓰기와 20개 유지는 테스트로 확인했고, 앱 실행 중 실제로 쓰이는지는 화면이 잠겨 확인하지 못했다.

## 사용자 확인 요청 (macOS)

1. File > Export Everything as Markdown…, Save a Backup…로 저장 대화상자가 Documents에서 열리는지 본다.
2. Page > Export Page as PDF…로 PDF를 만들어 미리보기에서 연다. 긴 페이지가 여러 쪽으로 나뉘는지 본다.
3. 앱을 30초 이상 연 채 페이지를 고친 뒤 File > Show Automatic Backups in Finder에서 백업 파일을 확인한다.
4. Edit as Markdown에서 한글을 입력해 본다.
