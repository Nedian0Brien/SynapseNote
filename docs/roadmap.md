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
| 4 | 데이터베이스: 다섯 가지 뷰, 속성 9종, 필터·정렬·그룹, 페이지 안 데이터베이스 | |
| 5 | 캔버스·그래프 | |
| 6 | 페이지 히스토리, 암호화 페이지, 플래시카드 | |
| 7 | 가져오기·내보내기·백업·정적 사이트 게시·Markdown 소스 편집 | |
| 8 | 기기 간 동기화 | |
| 9 | 빠른 캡처, 테마·글꼴·커버·사용자 CSS, 첫 실행 가이드 | |
| 10 | 배포 준비: 서명, 실기기 검증, TestFlight | |
| 11 | 전환: 편집기와 데이터 코어를 Swift로 | |

## 전환 단계(11)에서 볼 것

- 홈, 명령 팔레트, 인스펙터는 1단계 화면처럼 `EditorController`를 직접 받는다. 조회와 명령은 `WorkspaceService`에 있지만 화면 이동(`go(to:)`, `openInNewTab`)은 아직 프로토콜 밖에 있다. Swift 코어로 바꿀 때 이 경계를 먼저 정리한다.
