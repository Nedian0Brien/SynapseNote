# 포팅 로드맵

목표: Morrow의 기능 전체를 macOS, iPadOS, iOS용 SwiftUI 앱으로 옮겨, 실제 사용자에게 내놓을 수 있는 상태로 만든다.

## 구조 결정 (2026-10-19, Dennis Park)

1. **A안으로 기능 전체를 먼저 완성한다.** 페이지 본문 편집기는 Morrow의 TipTap 편집기를 SwiftUI `WebView`로 쓰고, 저장·Markdown 코어는 Morrow TS 코드를 그대로 쓴다. 그 밖의 화면은 모두 SwiftUI로 만든다.
2. **완성 후 편집기와 데이터 코어를 단계적으로 Swift로 옮긴다.** 그래서 네이티브 화면은 TS 코어에 직접 기대지 않고 Swift 쪽 인터페이스(워크스페이스 상태, 명령, 조회)를 통해 데이터를 다룬다. 나중에 그 인터페이스 뒤의 구현만 Swift로 바꾸면 된다.

## 단계

각 단계는 `.intent/` 아래 intent → spec → plan을 남기고, 구현·검증 후 PR로 낸다. 상태는 해당 단계 PR과 `docs/verification/`로 확인한다.

| 단계 | 내용 | 상태 |
|---|---|---|
| 0a | WebView 에디터 시제품 | 완료 (PR #1) |
| 0b | vault 열기·편집·저장, 새 페이지, 제목 변경, 휴지통 보내기, 외부 변경 감지 | 완료 (PR #1) |
| 1 | 페이지 관리: Swift → Morrow 명령 경로, 즐겨찾기, 아이콘, 복제, 이동(드래그·Move to), 휴지통 화면, Finder에서 보기, vault 전환, 편집기 프로세스 복구 | 구현 (PR #2, `docs/verification/phase1-page-management.md`) |
| 2 | 탐색: 조회 경로(TS 코어 계산 결과를 Swift로), 전체 검색, 명령 팔레트, 탭, 홈, 백링크·연결 안 된 언급, 아웃라인, 집중 모드, 단축키 안내 | 구현 (PR #3, `docs/verification/phase2-navigation.md`) |
| 3 | 일상 기록: 데일리 노트, `@날짜` 연결, 템플릿, 태그 화면, 작업 화면 | 구현 (PR #4, `docs/verification/phase3-daily.md`) |
| 4 | 데이터베이스: 다섯 가지 뷰, 속성 9종, 필터·정렬·그룹, 페이지 안 데이터베이스 | 구현 (PR #5, `docs/verification/phase4-database.md`) |
| 5 | 캔버스·그래프 | 구현 (PR #6, `docs/verification/phase5-canvas-graph.md`) |
| 6 | 페이지 히스토리, 암호화 페이지, 플래시카드 | 구현 (PR #7, `docs/verification/phase6-history-encryption-review.md`) |
| 7 | 가져오기·내보내기·백업·정적 사이트 게시·Markdown 소스 편집 | 구현 (PR #8, `docs/verification/phase7-import-export.md`) |
| 8 | 기기 간 동기화 | 구현 (PR #9, `docs/verification/phase8-sync.md`) |
| 9 | 빠른 캡처, 테마·글꼴·커버·사용자 CSS, 첫 실행 가이드 | 구현 (PR #10, `docs/verification/phase9-settings.md`) |
| 10 | 배포 준비: 서명, 실기기 검증, TestFlight | 팀 없이 할 수 있는 준비 완료, 서명·실기기·TestFlight 보류 (PR #11, `docs/verification/phase10-release-prep.md`, `docs/release/`) |
| 11 | 전환: 편집기와 데이터 코어를 Swift로 | 11a~11e로 나눔(`.intent/spec_phase11a-swift-data-core.md`) |
| 11a | Swift 데이터 코어: Markdown(markdown-it 이식)·머리말 YAML·vault 읽기·페이지 명령·저장 계획, Morrow 결과와 비교, DEBUG 동시 실행 | 구현 (PR #12, `docs/verification/phase11a-swift-data-core.md`) |
| 11b | 조회(검색·백링크·태그·작업·그래프·홈)를 Swift로, 웹 세션의 거울 상태 | 구현 (PR #13, `docs/verification/phase11b-swift-queries.md`) |
| 11c | 쓰기 권한을 Swift 세션으로: 기록·암호화·외부 편집·저장 예약·첨부 파일 | 11c-1·11c-2로 나눔(`.intent/spec_phase11c-swift-session.md`). 데이터베이스 수식과 캔버스 표시는 웹 화면에서만 쓰여 11d로 옮김 |
| 11c-1 | 저장소 나머지 이식(기록·암호화·외부 편집·저장 예약·첨부 파일·메타), Morrow 결과와 비교. 앱 동작은 그대로 | 구현 (PR #15, `docs/verification/phase11c1-storage-port.md`) |
| 11c-2 | 전환: 명령을 양쪽에서 적용하고 파일은 Swift만 씀, 외부 편집은 Swift가 먼저 읽음 | 구현 (PR #16, `docs/verification/phase11c2-authority-flip.md`) |
| 11d | 네이티브 화면 | 11d-1~11d-5로 나눔(`.intent/spec_phase11d-native-screens.md`). 편집기가 데이터베이스·캔버스를 블록으로 품으므로 편집기를 마지막에 |
| 11d-1 | 화면이 쓰는 core 이식(데이터베이스·수식·diff·게시 HTML·백업·가져오기), Morrow 결과와 비교. 앱 동작은 그대로 | 구현 (PR #17, `docs/verification/phase11d1-core-ports.md`) |
| 11d-2 | 페이지 머리, Markdown 원문 편집, 읽지 못한 페이지 알림(기록 창은 11d-5로) | 구현 (PR #18, `docs/verification/phase11d2-page-chrome.md`) |
| 11d-3 | 데이터베이스 페이지 전체(보기 다섯 가지, 도구 막대, 속성·보기 설정, 값 편집). 다른 페이지 안의 데이터베이스와 행 속성 줄은 11d-5로 | 구현 (PR #19, `docs/verification/phase11d3-database-page.md`) |
| 11d-4 | 캔버스 페이지 전체(노드 여섯 종류, 연결, 잉크, 그룹, 되돌리기, 확대). 다른 페이지 안의 캔버스는 11d-5로 | 구현 (PR #20, `docs/verification/phase11d4-canvas-page.md`) |
| 11d-5 | 블록 편집기 | 5a~5c로 나눔(`.intent/spec_phase11d-native-screens.md`). 5c-2부터 기본, 실행 인자 `-nativeEditor NO`로 웹 편집기(11e에서 제거) |
| 11d-5a | 편집기 모델(TipTap 정규화)과 글 블록: 문단·제목·목록·할 일·인용·코드·구분선, 마크 8종, 입력 규칙, 슬래시 메뉴, 서식·링크·찾기, 되돌리기 | 구현 (PR #21, `docs/verification/phase11d5a-text-editor.md`) |
| 11d-5b | 페이지 링크·날짜·태그, 표, 콜아웃, 접기, 단, 목차, 블록 메뉴, Markdown 붙여넣기 | 구현 (PR #22, `docs/verification/phase11d5b-editor-blocks.md`) |
| 11d-5c | 5c-1·5c-2로 나눔(`.intent/spec_phase11d-native-screens.md`, 2026-10-21) | |
| 11d-5c-1 | 그림·첨부 파일(소리·영상·PDF)·붙여넣기·끌어 놓기, 수식(KaTeX), 원문 블록, 코드 강조(lowlight), Mermaid | 구현 (PR #23, `docs/verification/phase11d5c1-editor-media.md`) |
| 11d-5c-2 | 페이지 끼워 넣기(데이터베이스·캔버스·페이지), 행 속성 줄, 기록 창, 네이티브 편집기를 기본으로 | 구현 (PR #24, `docs/verification/phase11d5c2-editor-embeds.md`) |
| 11e | 웹 계층 제거 | 11e-1·11e-2로 나눔(`.intent/spec_phase11e-web-removal.md`) |
| 11e-1 | Morrow 작업을 Swift로: 페이지 작업, 내보내기·게시·백업·복원·가져오기, zip, PDF, 알림 | 구현 (PR #25, `docs/verification/phase11e1-swift-operations.md`) |
| 11e-2 | 상태 소유를 Swift로, 웹 페이지·브리지·번들·node 빌드 제거 | |

## 전환 단계(11)에서 볼 것

- 캔버스 화면(전체 페이지와 인라인)도 5단계에서 Morrow `CanvasView`를 편집기 WebView에서 그리도록 했다. 그래프 화면은 이미 SwiftUI이고, 그래프 계산(`buildGraph`)만 TS 코어에 있다.
- 8단계 동기화는 이미 Swift다(Morrow `planPull`을 옮기고 TS 결과와 비교하는 테스트가 있다). 편집기를 옮긴 뒤에는 pull 전 저장(`window.synapse.flush`)과 바뀐 파일 알림만 새 편집기에 맞추면 된다.
- 7단계의 PDF 내보내기는 편집기 페이지의 DOM을 화면 밖 `WKWebView`에서 인쇄한다. 편집기를 Swift로 옮기면 인쇄할 HTML을 Swift 쪽에서 만들어야 한다. 알림은 이미 앱이 그린다.
- 페이지 히스토리 대화상자는 6단계에서 Morrow `HistoryDialog`를 편집기 WebView에서 열도록 했다. 암호 입력과 플래시카드 복습은 SwiftUI이고, 암호화·SM-2 일정·카드 수집은 TS 코어에 있다.
- 데이터베이스 화면(전체 페이지와 인라인)은 4단계에서 Morrow `DatabaseView`를 편집기 WebView에서 그리도록 했다. 편집기를 Swift로 옮길 때 함께 옮긴다.
- 홈, 명령 팔레트, 인스펙터는 1단계 화면처럼 `EditorController`를 직접 받는다. 조회와 명령은 `WorkspaceService`에 있지만 화면 이동(`go(to:)`, `openInNewTab`)은 아직 프로토콜 밖에 있다. Swift 코어로 바꿀 때 이 경계를 먼저 정리한다.
- 9단계 사용자 CSS는 편집기 페이지에만 적용된다. 편집기를 Swift로 옮기면 Morrow CSS 변수(`--accent` 등)로 하던 사용자 꾸미기를 어떻게 이어 갈지 정해야 한다. 첫 실행 가이드는 Morrow `sampleCommands`를 빌드 때 고쳐 쓰므로, TS 코어를 걷어낼 때 가이드 내용을 Swift 쪽으로 옮긴다.
