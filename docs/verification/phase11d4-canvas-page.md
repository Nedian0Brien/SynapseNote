# 11d-4단계 캔버스 페이지 검증 결과

- 날짜: 2026-10-20
- 브랜치: `feat/swift-canvas`(기준 `feat/swift-db`)
- 환경: Xcode 27.0, macOS 27.0, iPad Pro 13-inch (M5) 시뮬레이터(iOS 27.0, 앱 컨테이너의 시험 vault)
- 비교 기준: Morrow a2daae1의 `src/app/components/CanvasView.tsx`

## 바뀐 것

캔버스 페이지를 네이티브가 그린다. 화면 구성은 점 격자 배경, 연결선(화살표·이름표), 노드 여섯 종류(글 카드·페이지·파일과 그림·링크·그룹·그림), 선택·이동·크기·연결 손잡이, 펜·형광펜·지우개와 색·굵기, 카드·페이지·그룹 추가, 되돌리기·다시 하기, 확대·축소·맞추기·두 손가락 확대, 색과 삭제, 하드웨어 키보드 단축키다. 웹은 캔버스 페이지에 빈 화면을 그리고 `CanvasPage.tsx`를 지웠다. 다른 페이지 안에 든 캔버스는 편집기와 함께 11d-5에서 옮긴다.

- 편집 변환(고정점·마주 보는 면·곡선, 맞추기·확대, 노드 추가·이동·크기·연결, 획 마치기·지우개, 색·이름표, 화살표 이동, 되돌리기 100개, `strokePath`·`inkColor`)은 `Core/Model/CanvasEdits.swift`의 순수 함수다.
- 화면 데이터는 세션 호스트가 한 번에 읽는다(`SessionHost.canvas`): 세션 문서, `canvasFromDoc` 결과, 페이지 노드마다 제목·아이콘·글 앞부분(UTF-16 400자).
- 저장은 Morrow처럼 400ms 뒤 `page.setDoc`이다. 원문 편집과 같이 웹 적용을 기다리고(`deliver`), 화면을 떠날 때와 앱 저장 전(`flush`)에 마저 저장한다. 원문·캔버스의 저장 대기는 컨트롤러의 `holdSave`/`releaseSave` 목록 하나로 관리한다.
- 바깥 변경은 Morrow 규칙대로 반영한다: 세션 문서가 마지막으로 저장한 문서와 다르고, 저장 대기와 조작 중이 아닐 때만 바꾼다.
- 파일은 `writeCanvas(canvasFromDoc(doc))`로 쓰므로 탭 들여쓰기 JSON Canvas이고, 페이지 노드는 `"type": "file"`과 페이지 경로로 저장된다.

## 자동 검사

| 명령 | 결과 |
|---|---|
| `npm --prefix web run typecheck` | 통과 |
| `npm --prefix web test` | 통과, 47개 |
| `xcodebuild -scheme SynapseNote -destination 'platform=macOS' test` | 통과, 150개(11d-3 139개 + `CanvasEditsTests` 10개 + 캔버스 화면 읽기·쓰기 1개) |

`CanvasEditsTests`의 `strokePath`·`inkColor` 기대값은 Morrow 함수를 node로 실행해 만든다(`npm --prefix web run canvas-fixtures`, `App/Tests/Fixtures/core/expected/canvas.json`). Morrow 모듈 전체는 `virtual:morrow-emoji`가 있어야 불러올 수 있어서 두 함수의 원문만 잘라 `typescript.transpileModule`로 실행한다. 나머지 변환은 Morrow 코드를 줄마다 옮긴 기대값으로 본다.

변형 확인: 크기 조절 최소 너비 60을 50으로, 획이 그림에 합쳐지는 거리 160을 120으로, 경계 비교 `<`를 `<=`로 바꾸어 보았다. 처음에는 거리 변경이 통과해서 왼쪽·오른쪽 경계 사례를 테스트에 더했고(4e7aba1), 이후 세 변경 모두 실패했다(되돌림).

## iPad에서 확인한 것

| 동작 | 결과 |
|---|---|
| 캔버스 열기 | 그림·카드·점 격자·도구 막대, 맞추기 120% |
| 도구 막대 Add a card, 입력 후 빈 곳 누르기 | 글 저장(`Native card`) |
| 카드 선택 후 하드웨어 리턴 | 편집 시작 |
| 카드 끌기 | x −236, y −221(JS 반올림과 같음) |
| 손잡이에서 다른 카드로 끌기 | 연결선 `{fromSide: right, toSide: top}`, 화살표 |
| 빨강 | `color: "1"` |
| 펜으로 획 | 새 그림 노드로 저장 |
| 지우개로 획 지나기 | 그림 삭제, Undo로 복원 |
| Add a page로 Home | 아이콘·제목·글 앞부분, 파일에 `"type": "file", "file": "Home.md"` |
| 두 손가락 확대 300%, 맞추기 | 120%로 돌아옴 |
| Add a group | 점선 테두리와 `Group` 이름 |
| 다른 앱이 `Board.canvas` 수정 | 화면에 바로 반영(`Idea edited elsewhere`) |
| 깨진 JSON(`Bad board.canvas`) 열기 | "This canvas file could not be read. It has been left untouched on disk." 알림, 파일 내용 그대로 |
| 두 번 누르기: 빈 곳 | 새 카드 생기고 편집 시작, 입력한 `Double tap card` 저장 |
| 두 번 누르기: 그룹 | Group name 입력 알림, `Group Ideas`로 저장 |
| 두 번 누르기: 연결선 | Label 입력 알림, `label: "leads to"` 저장, 두 끝점의 가운데에 표시(Morrow와 같은 위치 계산) |
| DEBUG 세션 비교 | 이 단계 실행 8번에서 47번 비교, 모두 차이 0 |

두 번 누르기 확인 방법: 자동화 도구(axe)는 탭 사이에 0.8–1.0초가 걸려 0.35초 안의 두 번째 탭을 보낼 수 없었다. 임시 로그로 두 탭이 모두 판정 함수에 도달하고 간격만 0.78초임을 확인한 뒤, 판정 간격을 임시로 1.5초로 넓혀 위 세 동작을 확인하고 0.35초로 되돌렸다. 실제 손가락 속도의 두 번 누르기는 실기기나 Device Hub 창에서 확인해야 한다.

## Morrow와 다른 점

- **여러 개 고르기**: 터치에는 Shift가 없어 여러 개 고르기는 하드웨어 키보드 Shift로만 된다.
- **이름표 입력**: 그룹·연결선 이름은 Morrow의 원문 대화상자 대신 입력 알림으로 받는다.
- **두 번 누르기 판정**: 브라우저의 dblclick은 운영체제 설정을 따른다. 여기서는 0.35초 안, 24pt 안의 두 번째 탭을 두 번 누르기로 본다.
- **마우스 휠**: Morrow의 휠 이동·Ctrl(⌘) 휠 확대는 옮기지 않았다(트랙패드·마우스를 붙인 iPad와 macOS에서 차이가 난다). iPad는 두 손가락 확대와 끌기로 움직인다.

Morrow와 같아서 그대로 둔 것:

- 지우개는 획의 점만 검사하고 점 사이 선분은 검사하지 않는다. 점이 듬성한 획은 점을 지나야 지워진다.
- 페이지 고르기 창이 열린 직후, 입력 칸에 포커스가 가기 전 하드웨어 키 입력은 캔버스 단축키(H, E 등)로 처리된다.

## 알려진 한계

- 실제 손가락 속도의 두 번 누르기는 위 이유로 확인하지 못했다.
- 링크 노드와 파일(그림) 노드는 시험 vault에 해당 파일이 없어 단위 테스트와 코드 검토로만 확인했다.
- 처음 시뮬레이터 실행에서 WebContent 연결이 끊겨 앱이 로딩 화면에 머문 적이 한 번 있었다. 앱을 다시 실행하자 정상이었고 다시 나타나지 않았다.
- 한글 입력, macOS 화면은 11d-2와 같은 이유로 확인하지 못했다.
- 사용자 CSS는 이 화면에도 적용되지 않는다(11d-2 기록과 같음).
