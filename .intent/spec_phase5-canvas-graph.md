# Spec: 5단계 캔버스·그래프

상위 intent: `intent_morrow-full-port.md` (수락됨). 기준은 Morrow a2daae1의 다음 파일이다.

- 캔버스: `core/canvas.ts`, `app/components/CanvasView.tsx`, `EmbeddedCanvas.tsx`, `PageView.tsx`(캔버스 분기), `editor/PageEditor.tsx`(`mountEmbed`)
- 그래프: `core/graph.ts`, `app/components/GraphView.tsx`

## 설계 결정

- **캔버스는 편집기 WebView에서 그린다.** 4단계 데이터베이스와 같은 근거다. 캔버스는 페이지 본문이고, 인라인 캔버스는 TipTap 문서 안에 있다. 손글씨, 카드, 연결선, 그룹, 확대·이동 모두 Morrow `CanvasView`를 쓴다.
- **그래프는 SwiftUI로 그린다.** 그래프는 홈처럼 페이지 밖의 앱 화면이다.
  - 노드와 링크는 2단계 조회 경로로 TS 코어(`buildGraph`)가 계산한다.
  - 배치는 Morrow가 쓰는 d3-force 설정을 Swift로 옮긴 시뮬레이션으로 한다.
    - link: 거리 50, 강도 0.6
    - charge: -90, 최대 거리 400
    - center
    - x·y: 0.04
    - collide: 반지름 + 4
    - alpha 감쇠와 속도 감쇠: d3 기본값
  - 이렇게 하면 11단계에서 그래프 화면을 다시 만들 필요가 없다.

## 요구사항

1. **캔버스 페이지**: kind가 canvas인 페이지를 열면 Morrow `CanvasView`를 보여 준다. 지금은 "아직 열 수 없음" 안내가 나온다.
   - 카드(텍스트·페이지·링크·그룹), 연결선과 이름, 손글씨(펜·지우개·색·굵기), 확대·이동, 선택·삭제를 지원한다.
   - 읽을 수 없는 캔버스는 Morrow와 같은 안내를 보여 주고 파일을 건드리지 않는다.
2. **저장 규칙**
   - 사용자가 고칠 때만 Morrow `writeCanvas` 형식으로 저장한다. 열기만 해서는 `.canvas` 파일을 다시 쓰지 않는다.
   - 2단계에서 정한 "캔버스는 열람 기록(`markOpened`)을 남기지 않음"을 유지한다. Morrow는 열람 기록을 남기는데, 그 기록을 저장하면 `.canvas`가 다시 쓰인다.
3. **인라인 캔버스**
   - 문서에 끼워 넣은 캔버스는 Morrow `EmbeddedCanvas`로 그린다.
   - `/` 메뉴의 Canvas는 현재 페이지 아래에 캔버스를 만들어 끼워 넣는다.
4. **새 캔버스**: 동작 표에 New Canvas를, 페이지 메뉴에 Add Canvas Inside를 추가한다.
5. **그래프 화면**
   - 목적지 `graph`(전체)와 `graph(page)`(페이지 주변)를 추가한다.
   - 기능
     - 노드 크기: `3 + √degree × 1.6`, 태그 노드는 3
     - 그룹 색: 최상위 섹션별 Morrow 색. 해시 규칙이 같다.
     - 링크 종류: 하위 페이지·태그 링크는 점선
     - 포인터를 올리면 이웃 강조, 확대 1.1 초과 시 라벨
     - 끌어서 노드 이동(alphaTarget 0.3), 누르면 페이지 또는 태그 화면
     - 이동·확대(0.1~6)
     - 찾기
     - 옵션: Tags, Subpages, Unlinked pages(전체 그래프), Depth 1~3(페이지 주변)과 Whole graph
     - "N pages · M links"
   - 옵션은 Morrow처럼 기억한다(UserDefaults).
   - 동작 표: Open Graph(Morrow `go.graph`), Open Local Graph of This Page(`page.localGraph`). 사이드바에 Graph 행을 둔다. 페이지 메뉴에 Open Local Graph를 둔다.

## 받아들이는 기준

- 웹·Swift 단위 테스트가 통과한다. Swift는 시뮬레이션 한 단계의 힘 계산(d3 공식과 같은 값), 그래프 조회 디코딩, 목적지 저장을 테스트한다.
- 시뮬레이터와 macOS에서 다음을 조작해 `docs/verification/phase5-canvas-graph.md`에 기록한다.
  - 캔버스 열기(파일 그대로), 카드 추가, 손글씨, 저장 결과
  - 인라인 캔버스
  - 그래프 표시, 노드 누르기, 옵션, 페이지 주변 그래프

## 범위 밖

- 캔버스·그래프의 Swift 편집 구현: 11단계(캔버스)
- Apple Pencil 필압: Morrow에도 없다.
