# SynapseNote Design Quality Plan

## 목표

SynapseNote의 기본 구조는 AppFlowy Web을 유지하되, 제품 인상은 조용하고 정교한 문서 도구로 정리한다. 기준은 과장된 브랜드 장식이 아니라 매일 오래 써도 피로하지 않은 편집 경험이다.

## 원칙

- 화면은 흰색 계열 surface를 기본으로 두고, 상태와 선택에만 제한적으로 색을 쓴다.
- 둥근 모서리와 pill 형태는 핵심 정체성으로 유지하되, 모든 요소에 기계적으로 강제하지 않는다.
- 문서 편집 영역은 가장 조용해야 한다. 장식, 그림자, 배경 대비는 사이드바와 떠 있는 메뉴에만 집중한다.
- 정보 밀도는 낮추지 않는다. 여백은 정돈을 위해 쓰고, 기능을 숨기기 위해 쓰지 않는다.
- 사용자에게 보이는 문구는 짧은 라벨, 상태, 명령 중심으로 유지한다.

## Phase 1: Foundation

1. 토큰 정리
   - `--sn-bg`, `--sn-surface`, `--sn-outline`, `--sn-shadow-*`, radius 토큰을 단일 기준으로 유지한다.
   - 기존 semantic token과 SynapseNote token의 역할을 문서화한다.
   - 베이지/브라운, 보라/블루 gradient 계열은 기본 배경에서 금지한다.

2. 흰색 계열 surface 체계
   - App background: near-white
   - Document surface: pure white
   - Sidebar surface: soft gray-white
   - Floating surface: white with subtle border and shadow
   - Selection/hover: black alpha 6-8%
   - Initial theme: light, with dark mode only through explicit user choice or URL override

3. 타이포그래피
   - 제목, 본문, 캡션의 크기와 line-height를 화면별로 고정한다.
   - 문서 본문은 가독성을 우선하고, 사이드바/툴바는 더 조밀하게 둔다.

## Phase 2: Core Surfaces

1. Editor
   - 문서 본문 폭, title spacing, block hover affordance를 정리한다.
   - placeholder, slash command, selection toolbar를 같은 radius/shadow 체계로 통합한다.

2. Sidebar
   - workspace switcher, search, outline item, active item 상태를 한 규칙으로 통일한다.
   - hover/active/drag 상태가 모두 같은 fill scale을 쓰게 한다.

3. Header
   - blur 배경은 유지하되 border와 opacity를 낮춰 문서 위에 얹힌 느낌을 줄인다.
   - breadcrumb, lock badge, share/actions 사이 여백을 재정렬한다.

4. Graph View
   - 문서 앱과 같은 white surface token을 사용한다.
   - 노드 타입별 색은 배경색이 아니라 stroke, icon, label weight로 구분한다.

## Phase 3: Interaction Quality

1. Floating UI
   - menu, popover, dialog, command palette, toast의 radius, border, shadow를 한 세트로 맞춘다.
   - 애니메이션은 120-180ms opacity/scale만 사용한다.

2. Controls
   - icon button은 정사각형 hit area, pill button은 명령형 action에만 쓴다.
   - input은 iOS 확대 방지를 위해 16px 이상을 유지한다.

3. Empty/loading/error
   - 빈 상태는 설명문보다 다음 행동을 바로 제시한다.
   - loading은 skeleton 또는 compact spinner로 통일한다.
   - error는 개발 용어 대신 사용자가 할 수 있는 행동만 보여준다.

## Phase 4: Screen-by-screen Pass

1. Login
2. Workspace shell
3. Editor document
4. Database grid/board/calendar
5. Search and command palette
6. Share/publish panels
7. Settings
8. Graph view
9. Mobile editor

각 화면은 desktop, tablet, 375px, 320px에서 텍스트 넘침, 겹침, 버튼 줄바꿈, 가로 스크롤을 확인한다.

## Quality Gate

- `pnpm run type-check`
- `pnpm run build`
- 대표 화면 Playwright screenshot
- light/dark token contrast spot check
- live URL에서 AppFlowy 문구와 레거시 팔레트 재발 여부 검색

## 우선순위

1. White surface token 정리
2. Editor와 Sidebar visual pass
3. Floating UI 통합
4. Graph view white theme pass
5. Mobile editor polish
