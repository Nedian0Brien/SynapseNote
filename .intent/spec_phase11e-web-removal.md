# Spec: 11e 웹 계층 제거

상위: `intent_morrow-full-port.md`(수락됨). 앞 단계: 11c(Swift 세션이 파일을 씀, 명령은 양쪽 적용), 11d(모든 화면과 편집기가 네이티브, 11d-5c-2부터 기본).

## 지금 웹에 남은 것

- **상태 소유**: 명령은 웹 `WorkspaceSession`이 먼저 적용하고 Swift로 보낸다(11c). 사이드바 등이 읽는 `workspace`(페이지 정보, 잠긴 페이지, 저장 상태)도 웹이 보낸다. 저장 시점(웹 저장 큐), 외부 편집을 받아들일지(웹 `isDirty`)도 웹이 정한다.
- **Morrow 작업**(`app/operations.ts`): 새 페이지, 오늘 노트·빠른 기록, 템플릿, 휴지통 안내, Markdown 내보내기(zip), 전체 내보내기, 웹사이트 게시, 백업·자동 백업·복원, 가져오기(zip 포함), 안 쓰는 파일 지우기, 기록 복원, PDF(웹 화면 인쇄). 알림(toast)과 그 단추(Undo, Open)도 웹이 만든다.
- **그 밖**: 사용자 CSS(`.morrow/style.css`, 웹 화면에만 적용), 웹 번들과 Xcode 빌드 전 node 빌드(`scripts/build-editor.sh`).

## 나누기

| 단계 | 내용 | 받아들이는 기준 |
|---|---|---|
| 11e-1 | Morrow 작업을 Swift로: 위 작업 전부를 11a~11d 이식(`Templates`, `Daily`, `Portability`, `Importer`, `Site`)으로 하고, 알림과 그 단추는 네이티브. 명령은 이 단계까지 웹을 거쳐 양쪽이 같은 상태를 유지한다. zip 읽기·쓰기(fflate 대신, 아래). PDF는 Swift가 만든 HTML(아래) | 작업 결과가 Morrow와 같음: 내보낸 Markdown·zip 안 파일, 게시 파일, 백업 JSON(시각 고정), 가져오기·복원 계획을 node 비교 자료와 비교. zip은 Swift가 쓴 것을 node `fflate`가 읽고, fflate가 쓴 것을 Swift가 읽음. iPad 확인, DEBUG 세션 비교 차이 0 |
| 11e-2 | 상태 소유를 Swift로, 웹 제거: 명령은 Swift 세션만 적용, 저장 시점은 Swift `SaveQueue` 타이머(300ms 묶음, Morrow 재시도), 외부 편집은 Swift가 열린 편집기를 먼저 저장하고 받아들임, `workspace`·저장 상태는 Swift 상태에서. 웹 페이지·브리지·RPC·번들·node 빌드 단계 삭제. web 폴더는 비교 자료를 만드는 개발 도구로만 남김 | 앱 빌드에 node가 필요 없음. 11c의 시나리오(편집, 이름 바꾸기, 이동, 휴지통·복원, 잠그기·열기, 기록 복원, 복습 평가, 첨부 파일, 외부 편집)를 iPad에서 다시 확인 |

## 결정

- **zip**: iOS·macOS에 공개 zip API가 없다(Foundation·AppleArchive는 zip을 읽고 쓰지 않음). `Compression` 프레임워크의 `COMPRESSION_ZLIB`(raw DEFLATE, [문서](https://developer.apple.com/documentation/compression/compression_algorithm/compression_zlib))로 압축하고, CRC-32와 zip 머리(로컬·중앙 디렉터리·끝 레코드, UTF-8 이름 표시)는 직접 쓴다. 읽기는 저장(0)·deflate(8) 방식만, zip64는 받지 않고 안내한다. fflate와 바이트까지 같을 필요는 없고 안의 파일이 같으면 된다.
- **PDF**: 웹 화면이 없어지면 Morrow처럼 편집기 화면을 인쇄할 수 없다. Swift `Site.docToHtml`(11d-1, Morrow `site.ts`)로 만든 페이지 HTML과 게시 사이트 스타일을 지금의 `PDFExporter`(A4, 여백 0.6인치)로 인쇄한다. 수식은 Morrow 게시처럼 KaTeX `output: 'mathml'`(JavaScriptCore에서). 모양은 Morrow 게시 사이트의 한 페이지와 같아지고 Morrow 데스크톱 PDF와는 다르다.
- **알림**: Morrow 문구와 단추를 그대로 네이티브 알림으로. 단추 동작은 Swift 함수.
- **사용자 CSS**: 웹 화면에만 적용되던 기능이라 웹 제거와 함께 쓸 곳이 없어진다. 사용자 결정(2026-10-21): 설정의 CSS 편집기를 뺀다. vault의 `.morrow/style.css`는 읽지도 지우지도 않고 그대로 둔다(Morrow에서 열면 그대로 적용된다).
- **편집기가 열 수 없는 문서**(11e-2): Morrow가 아는 노드만 있지만 ProseMirror 규칙으로 열리지 않는 문서(빈 text 노드 등)는 지금 웹 편집기가 받는다. 웹이 없어지면 모르는 내용이 있는 페이지와 같이 읽기 전용 안내와 평문으로 보여 주고 바꾸지 않는다. Morrow(TipTap)는 이런 문서를 빈 문서로 열어 덮어쓸 수 있다. Morrow와 다른 점으로 적는다.
- **페이지를 연 시각**(11e-2): 웹 `Page`가 하던 `page.markOpened`(캔버스는 빼고)를 Swift가 보여 줄 페이지가 바뀔 때 한다.
- **열 때 읽지 못한 항목 알림**(11e-2): Morrow `main.tsx`처럼 "N items could not be read and were left untouched."를 오류 알림(12초)으로 보인다. 지금 웹은 보이지 않았다.

## 범위 밖

동기화 실기기 두 대 확인, 서명·TestFlight·수출 규정·라이선스(사용자 결정).
