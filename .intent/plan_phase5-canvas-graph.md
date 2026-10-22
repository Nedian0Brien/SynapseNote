# Plan: 5단계 캔버스·그래프

spec: `spec_phase5-canvas-graph.md`. 브랜치 `feat/canvas`(기준 `feat/database`), 워크트리 `.worktree/canvas`.

## 순서

1. **캔버스 (웹)**
   - `web/src/CanvasPage.tsx` 신규: Morrow `PageView` 캔버스 분기와 같다. 읽을 수 없으면 안내를, 아니면 `CanvasView`를 보여 준다.
   - `main.tsx`: canvas 분기를 바꾼다. `createPage` 메시지 kind에 canvas를 추가한다.
   - `EditorApp.tsx`: `mountEmbed`에 캔버스(`EmbeddedCanvas`)를, `createChild('canvas')`를 추가한다.
   - 의존 모듈(`platform/preferences`의 캔버스 크기 등)이 번들에 들어가는지 빌드로 확인한다.
2. **그래프 조회 (웹)**: `queries.ts`에 `graph(options)`(Morrow `buildGraph` 결과)를 추가하고 테스트한다.
3. **Swift 데이터**
   - `WorkspaceQuery.graph`, `GraphData` 타입
   - `Destination.graph(String?)`
   - `EditorCommand.createPage`의 종류를 page·database·canvas 열거로 바꾼다.
4. **그래프 화면** (`GraphSimulation.swift`, `GraphView.swift` 신규)
   - `GraphSimulation`: d3-force의 link, manyBody, center, x·y, collide, 적분, alpha를 옮긴다. 노드 수가 수백인 vault를 기준으로 manyBody는 거리 400 이내의 모든 쌍을 계산한다.
   - `GraphView`: `TimelineView`와 `Canvas`로 그린다. 끌기·누르기·이동은 제스처로, 확대는 핀치·스크롤로 한다. 호버(macOS·iPad 포인터), 찾기, 옵션 패널을 둔다.
   - 테스트: 한 단계 힘 계산을 d3 공식으로 손계산한 값과 비교한다.
5. **동작 표·사이드바·메뉴**
   - 동작 표: New Canvas, Open Graph, Open Local Graph
   - 사이드바 Graph 행, 페이지 메뉴 Add Canvas Inside·Open Local Graph
   - 탭 제목·아이콘
6. **검증**: 테스트, iPad·iPhone·macOS 조작, 검증 문서, 로드맵, 푸시, PR #6(기준 `feat/database`)
