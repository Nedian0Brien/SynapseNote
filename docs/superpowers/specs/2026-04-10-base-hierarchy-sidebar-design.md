# 프론트엔드 재구성 & Base 계층 구조 통합 설계

**Date:** 2026-04-10
**Status:** Draft
**Author:** Minjae Park + Claude

## 1. 개요

### 1.1 범위

이 스펙은 두 가지 작업을 통합한다:

1. **프론트엔드 재구성** — `docs/main-ui-preview.html` + `docs/design-system-preview.html`을 타겟 디자인으로 삼아, 현재 프론트엔드를 전면 재구성
2. **Base 계층 도입** — 사이드바에 Base 개념을 추가하여 그래프 복잡성을 관리

### 1.2 문제

- 현재 프론트엔드(ExplorerPanel, NavigationRail 등)가 목업 디자인과 상당한 괴리가 있음
- 디자인 토큰, 컴포넌트 스타일이 일관되지 않음 (lucide-react 아이콘 vs Material Symbols 등)
- 지식 베이스가 커지면 전체 그래프 탐색이 어려워짐

### 1.3 해결 방향

- `main-ui-preview.html`의 레이아웃, 인터랙션 패턴을 실제 React 컴포넌트로 구현
- `design-system-preview.html`의 디자인 토큰을 CSS 변수로 통일
- **Base** 개념을 도입: 사용자가 관련 폴더들을 묶어 형성하는 그룹 단위로, 그래프를 의미 있는 도메인 영역으로 분할
- 사이드바가 Base 계층 탐색의 primary UI가 되고, 그래프 뷰가 시각적으로 연동

## 2. 타겟 디자인 참조

### 2.1 디자인 시스템 (`design-system-preview.html`)

| 항목 | 내용 |
|------|------|
| 색상 팔레트 | 따뜻한 베이지/에스프레소 (라이트), 세피아 다크 |
| 폰트 | Headline: Lexend, Body: Inter |
| 아이콘 | Material Symbols Outlined (lucide-react에서 전환) |
| 라운딩 | sm:7px, md:10px, lg:14px, xl:18px, full:100px |
| 그림자 | sm/md/lg 3단계 |
| 애니메이션 | ease, ease-spring, ease-snap + dur 120/200/320ms |

### 2.2 메인 UI 레이아웃 (`main-ui-preview.html`)

```
┌──────────┬────────────────────────────────┐
│ Sidebar  │          Workspace             │
│ (200px)  │ ┌────────────────────────────┐ │
│ ┌──────┐ │ │ Topbar (breadcrumb)        │ │
│ │Brand │ │ ├────────────────────────────┤ │
│ │Search│ │ │                            │ │
│ │Tree  │ │ │   Stage (Graph SVG)        │ │
│ │      │ │ │                            │ │
│ │      │ │ │  ┌─────┐ ┌──────────────┐ │ │
│ │      │ │ │  │CtxMgr│ │  Chat Panel  │ │ │
│ │      │ │ │  └─────┘ └──────────────┘ │ │
│ │Footer│ │ │  ┌──────────────────────┐  │ │
│ └──────┘ │ │  │    Dock (선택 노드)   │  │ │
│          │ │  └──────────────────────┘  │ │
│          │ └────────────────────────────┘ │
└──────────┴────────────────────────────────┘
```

**주요 UI 패턴:**
- **Sidebar**: 접기/펼치기, 검색, 트리, 푸터 (새 노트 / 가져오기)
- **Stage**: 그래프 SVG가 전체 캔버스, 위에 플로팅 UI 레이어
- **Panel Stack**: 하단 float-cluster (Context Manager + Chat) + Dock
- **Context Manager**: 고정됨/포함됨/추천됨 3섹션, 토큰 사용량 표시
- **Chat**: 플로팅 또는 우측 도킹, 컨텍스트 스트립 연동
- **Dock**: 선택 노드 상세정보, 컨텍스트 추가 버튼
- **Card View**: 폴더 클릭 시 카드 그리드 보기 (masonry)

### 2.3 정보 계층 (Base)

```
전체 그래프 (Global)
  └─ Base (사용자 정의 그룹)
       └─ Folder (파일시스템 폴더)
            └─ Node (Document, 마크다운 문서)
```

## 3. 설계 결정 요약

| 결정 항목 | 선택 | 근거 |
|-----------|------|------|
| Base 생성 방식 | 사용자 직접 생성 (이름 지정 후 폴더 추가) | 자동 그룹핑보다 사용자 통제권 우선 |
| 폴더-Base 소속 | 크로스 태깅 (여러 Base 동시 소속 가능) | Base가 "소유자"가 아닌 "관점(lens)" 역할 |
| Base 포커스 동작 | 해당 Base 강조 + 나머지 dim 처리 | 드릴다운보다 컨텍스트 유지에 유리 |
| 노드 렌더링 | 실제 렌더링 (Canvas 점) + LOD | 시각적 밀도감 유지하면서 성능 확보 |
| Base 관리 진입점 | 사이드바 "+" 버튼 + 폴더 우클릭 메뉴 둘 다 | 두 워크플로우 모두 지원 |
| 데이터 저장 | `.synapsenote/bases.json` (파일 시스템) | DB는 동기화/백업 용도로 한정, 파일이 source of truth |
| 구현 전략 | 사이드바 중심, 그래프 보조 연동 | 단계적 확장 가능, 모바일 경험 보장 |

## 4. 데이터 구조

### 4.1 `.synapsenote/bases.json` 스키마

```json
{
  "version": 1,
  "bases": [
    {
      "id": "base_ai_ml",
      "name": "AI / ML",
      "color": "#6c8fff",
      "folders": ["llm-research", "ml-ops", "papers"],
      "createdAt": "2026-04-10T00:00:00Z"
    },
    {
      "id": "base_product",
      "name": "Product",
      "color": "#a78bfa",
      "folders": ["features", "user-research", "papers"]
    }
  ]
}
```

- `id`: 고유 식별자 (`base_` 접두사 + slugified name)
- `folders`: KB 루트 기준 상대 경로 배열 (KB 루트 = 백엔드 `VAULT_ROOT` 환경 변수가 가리키는 디렉토리)
- 동일 폴더가 여러 Base의 `folders`에 중복 등장 가능 (크로스 태깅)
- 크로스 태깅 시 **primary Base**: `folders` 배열에 해당 폴더를 가장 먼저 포함한 Base (즉, 가장 먼저 추가한 Base). View B에서 노드 색상 결정에 사용
- 파일이 source of truth, DB는 이 파일을 읽어 인덱스 동기화
- `.synapsenote/` 디렉토리는 KB 루트 하위에 위치 (경로: `{VAULT_ROOT}/.synapsenote/bases.json`)
- **필수 구현**: `web-editor/app.py`의 `IGNORED_DIRS`에 `.synapsenote` 추가. 이 디렉토리가 파일 목록 API 응답이나 그래프 노드로 노출되지 않아야 함

### 4.2 프론트엔드 상태

```
baseStore: {
  bases: Base[],                   // bases.json에서 로드
  activeFocusId: string | null     // View A에서 포커스된 Base
}
```

### 4.3 네비게이션 체계 위치

현재 앱에는 두 가지 네비게이션 체계가 있다:
- **`AppShell.jsx`**: React Router 기반 페이지 네비게이션 (Chat / Graph / Library / Learn)
- **`LeftSidebar.jsx` + `NavigationRail.jsx`**: 에디터 페이지 내 패널 전환 (Explorer / Search / Graph)

Base UI는 **`LeftSidebar` 체계에 속한다**. ExplorerPanel을 Base 계층으로 개편하며, `AppShell`의 상위 네비게이션은 변경하지 않는다. 사용자가 `AppShell`에서 Graph 탭을 클릭하면 전체 그래프 페이지(`/graph`)로 이동하고, 그곳에서 View A/B 전환이 가능하다.

## 5. 사이드바 UI 구조

### 5.1 ExplorerPanel → Sidebar 재구성

```
┌─────────────────────────────┐
│  EXPLORER          [+Base]  │  ← 헤더 (Base 생성 버튼 추가)
├─────────────────────────────┤
│  ◉ 전체 그래프              │  ← Zone 1: 전역 진입점
├─────────────────────────────┤
│  ● AI / ML                  │  ← Zone 2: Base 목록
│    ▶ llm-research           │    (접기/펼치기, 소속 폴더 트리)
│      · attention-mechanisms │
│    ▶ ml-ops                 │
│                             │
│  ● Product                  │
│    ▶ features               │
│    ▶ user-research          │
├─────────────────────────────┤
│  ○ 미분류 폴더              │  ← Zone 3: 어떤 Base에도 미소속
│    ▶ inbox                  │
└─────────────────────────────┘
```

### 5.2 인터랙션

| 액션 | 결과 |
|------|------|
| Base 이름 클릭 | 해당 Base 폴더 트리 펼침/접음 |
| Base 색상 점 클릭 | 그래프 View A에서 해당 Base 포커스 |
| 폴더 우클릭 | 컨텍스트 메뉴에 "Base에 추가/제거" 항목 추가 |
| `[+Base]` 버튼 | 이름 입력 모달 → 빈 Base 생성 |
| Base 우클릭 | 이름 변경 / 색상 변경 / 삭제 메뉴 |

### 5.3 컴포넌트 분리

- `Sidebar` — 신규, 목업의 `.sidebar` 구현 (Brand, Search, Tree, Footer)
- `SidebarTree` — 3존 트리 렌더링 (전체 그래프 / Base 목록 / 미분류)
- `BaseSection` — Base 1개의 헤더 + 소속 폴더 트리 (신규)
- `UnassignedSection` — 미분류 폴더 그룹 (신규)
- `BaseContextMenu` — Base 우클릭 메뉴 (신규)
- `TreeItem` — 목업의 `.tree-item` 패턴 구현, Material Symbols 아이콘
- 기존 `ExplorerPanel`, `NavigationRail`, `LeftSidebar` → 제거 (Sidebar로 대체)

## 6. 워크스페이스 & Stage 구조

### 6.1 앱 레이아웃 재구성

현재 `AppShell.jsx`의 React Router 탭 네비게이션(Chat/Graph/Library/Learn)을 제거하고, 목업의 2컬럼 레이아웃으로 전환:

```
grid-template-columns: auto 1fr
├── Sidebar (200px, 접기 시 44px)
└── Workspace
    ├── Topbar (42px, breadcrumb)
    └── Stage (flex:1, 전체 캔버스)
        ├── Graph SVG/Canvas (absolute, inset:0)
        ├── Toolbar (absolute, 좌/우 상단)
        ├── Search Bar (absolute, 상단 중앙)
        ├── Panel Stack (absolute, 하단)
        │   ├── Float Cluster (Context Manager + Chat)
        │   └── Dock Wrap (선택 노드 상세)
        └── Card View (absolute overlay)
```

### 6.2 컴포넌트 매핑

| 목업 클래스 | React 컴포넌트 | 역할 |
|------------|---------------|------|
| `.app` | `App.jsx` | 루트 grid 레이아웃 |
| `.sidebar` | `Sidebar.jsx` | 좌측 사이드바 (신규) |
| `.workspace` | `Workspace.jsx` | 우측 작업 영역 (신규) |
| `.topbar` | `Topbar.jsx` | breadcrumb + 테마 토글 (신규) |
| `.stage` | `Stage.jsx` | 그래프 캔버스 영역 (신규) |
| `.fp-ctx` | `ContextPanel.jsx` | 컨텍스트 매니저 패널 (신규) |
| `.fp-chat` | `ChatPanel.jsx` | 채팅 패널 (기존 ChatWorkspace 리팩터) |
| `.dock` | `NodeDock.jsx` | 선택 노드 상세 독 (신규) |
| `.card-view` | `CardView.jsx` | 카드 그리드 뷰 (신규) |

### 6.3 디자인 토큰 통일

`design-system-preview.html`의 CSS 변수를 `globals.css`로 옮김:

- 색상: `--bg`, `--surface`, `--surface-low`, `--surface-high`, `--on-surface`, `--on-variant`, `--muted`, `--primary` 등
- 다크 모드: `[data-theme="dark"]` 셀렉터
- 폰트: `--font-headline: Lexend`, `--font-body: Inter`
- 아이콘: lucide-react 제거 → Material Symbols Outlined 전환
- 라운딩/그림자/애니메이션: 디자인 시스템 토큰 그대로 사용

## 7. 그래프 뷰 연동

### 7.1 View A — Base Overview

- 각 Base가 독립된 영역 (둥근 모서리 점선 사각형)
- Base 내부 노드를 Canvas 점으로 실제 렌더링
- Base 간 노드 연결: 점선으로만 표시, 엣지 인력 미적용
- 중앙에 루트 허브 노드

**Base 포커스 동작:**
- 사이드바에서 Base 색상 점 클릭 → `baseStore.activeFocusId` 설정
- 해당 Base: 100% opacity, 원래 색상 유지
- 나머지 Base: 20% opacity로 dim 처리
- 포커스된 Base와 연결된 cross-base 점선만 강조

### 7.2 View B — Full Graph

- Base 구분 없이 전체 노드를 하나의 force-directed 그래프로
- 노드 색상은 소속 Base 색상으로 착색 (크로스 태깅 시 primary Base 색상)
- 동일 Canvas 렌더러 공유, LOD 전략도 동일 적용

### 7.3 뷰 전환

- 그래프 상단 세그먼트 컨트롤: `[Base Overview]` / `[Full Graph]`
- 전환 시 노드 위치 애니메이션 (Base 영역 → force 위치로 morph, 300ms)
- 사이드바 `전체 그래프` 항목 클릭 시 View A가 기본

## 8. API 설계

### 8.1 엔드포인트

| Method | Path | 동작 |
|--------|------|------|
| `GET` | `/api/bases` | bases.json 읽어서 반환 |
| `PUT` | `/api/bases` | bases.json 전체 덮어쓰기 |
| `POST` | `/api/bases` | 새 Base 생성 |
| `POST` | `/api/bases/{id}/folders` | 특정 Base에 폴더 추가 |
| `DELETE` | `/api/bases/{id}/folders?path={encoded_path}` | Base에서 폴더 제거 (경로는 query parameter로 전달, 특수문자 안전) |
| `DELETE` | `/api/bases/{id}` | Base 삭제 |

### 8.2 파일 관리 흐름

```
사용자 액션 → 프론트엔드 → API → 파일시스템(.synapsenote/bases.json) 읽기/쓰기
                                 ↓
                          DB 인덱스 비동기 동기화 (선택적)
```

- API는 매 요청마다 `bases.json`을 직접 읽고 씀 (파일이 source of truth)
- 파일이 없으면 `{"version": 1, "bases": []}` 로 자동 생성
- **동시성 제어**: 쓰기 작업 시 `fcntl.flock` (file lock)으로 race condition 방지. 단일 사용자 앱이므로 파일 락으로 충분

### 8.3 미분류 폴더 계산

서버에서 처리:
1. `GET /api/files?recursive=true`로 전체 폴더 목록 취득
2. `bases.json`에서 모든 Base의 `folders` 합집합 추출
3. 전체 폴더 - 합집합 = 미분류 폴더

## 9. 성능 최적화 전략

### 9.1 Canvas 렌더링

현재 `D3GraphPanel.jsx`는 순수 SVG + D3 force 기반이다. Base Overview에서는 Canvas 2D 기반 **신규 컴포넌트** `BaseGraphCanvas.jsx`를 작성한다. 기존 `D3GraphPanel.jsx`는 에디터 페이지 내 미니 그래프 용도로 유지하되, 전체 그래프 페이지(`/graph`)에서는 신규 Canvas 컴포넌트가 대체한다.

- **Base 내부 노드**: Canvas 2D로 일괄 렌더링 (SVG DOM 노드 생성 제거)
- **Base 영역 경계**: Canvas 위에 얹은 단일 SVG 레이어 (점선 사각형 + 라벨)
- **Cross-base 점선**: 같은 SVG 레이어에서 처리

> **참고**: 이는 기존 D3GraphPanel의 수정이 아니라 사실상 신규 컴포넌트 작성이다. 관련 파일 목록에 반영.

### 9.2 LOD (Level of Detail)

| 줌 레벨 | 노드 표현 | 라벨 표시 |
|---------|----------|----------|
| 0~30% | 2px 점 | 없음 |
| 30~60% | 4px 점 | 없음 |
| 60~80% | 6px 원 | hover 시 |
| 80~100% | 8px + 아이콘 | 상시 |

### 9.3 뷰포트 컬링

- 화면 밖 노드는 렌더링 스킵 (quadtree 기반 공간 인덱싱)
- 사용자 패닝/줌 시 requestAnimationFrame 단위로 가시 영역만 재계산

### 9.4 Force 시뮬레이션 최적화

- **View A**: Base 내부 노드끼리만 force 적용, cross-base 엣지에는 인력 미적용
- **View B**: 전체 force 적용하되, `alpha` 감쇠를 빠르게 설정
- 노드 500개 초과 시 Web Worker에서 force 계산 분리

### 9.5 전환 애니메이션

- View A ↔ View B: 노드 위치를 lerp interpolation으로 morph (300ms)
- Base 포커스/해제: opacity 트랜지션만 (GPU 가속, 60fps 보장)

## 10. 에러 처리 & 엣지 케이스

### 10.1 파일시스템

| 상황 | 처리 |
|------|------|
| `bases.json` 없음 | 첫 Base 생성 시 자동 생성 |
| `bases.json` 파싱 실패 | 백업 생성 후 초기값으로 리셋, 토스트 알림 |
| Base에 등록된 폴더가 삭제됨 | 사이드바에 경고 아이콘, 사용자가 제거 결정 |
| 폴더 이름 변경됨 | 기존 경로 불일치 → 삭제된 폴더와 동일하게 경고 |

### 10.2 Base 관련

| 상황 | 처리 |
|------|------|
| Base 이름 중복 | 생성 시 거부, 에러 메시지 |
| Base 0개 상태 | 모든 폴더가 미분류에 표시, 전체 그래프 정상 동작 |
| 폴더를 마지막 Base에서 제거 | 해당 폴더는 미분류로 이동, 빈 Base 유지 |
| 빈 Base 삭제 | 확인 모달 없이 즉시 삭제 |
| 소속 폴더 있는 Base 삭제 | 확인 모달 → 소속 폴더는 미분류로 이동 |

### 10.3 그래프 관련

| 상황 | 처리 |
|------|------|
| 노드 수 2000+ | Web Worker force 자동 전환 + LOD 강제 최저 단계 |
| 크로스 태깅 노드 (View A) | 각 Base 영역에 복제 표시, 연결선으로 동일 노드 암시 |
| Base 간 연결 0개 | 점선 없이 독립 영역으로만 표시 |

## 11. 관련 파일

### 제거 대상 (기존 → 대체)
- `services/web-editor/frontend/src/components/ExplorerPanel.jsx` → `Sidebar.jsx`
- `services/web-editor/frontend/src/components/NavigationRail.jsx` → 제거 (Sidebar에 통합)
- `services/web-editor/frontend/src/components/LeftSidebar.jsx` → 제거 (Sidebar로 대체)
- `services/web-editor/frontend/src/components/shell/AppShell.jsx` → `App.jsx` 재구성

### 신규 생성 — 쉘 & 레이아웃
- `services/web-editor/frontend/src/components/Sidebar.jsx` (사이드바 전체)
- `services/web-editor/frontend/src/components/SidebarTree.jsx` (3존 트리)
- `services/web-editor/frontend/src/components/TreeItem.jsx` (트리 항목)
- `services/web-editor/frontend/src/components/Workspace.jsx` (우측 작업 영역)
- `services/web-editor/frontend/src/components/Topbar.jsx` (breadcrumb)
- `services/web-editor/frontend/src/components/Stage.jsx` (그래프 캔버스 영역)

### 신규 생성 — Base 기능
- `services/web-editor/frontend/src/components/BaseSection.jsx`
- `services/web-editor/frontend/src/components/UnassignedSection.jsx`
- `services/web-editor/frontend/src/components/BaseContextMenu.jsx`
- `services/web-editor/frontend/src/hooks/useBaseStore.js`
- `services/web-editor/base_routes.py` (Flask Blueprint)

### 신규 생성 — Stage 내부 패널
- `services/web-editor/frontend/src/components/graph/BaseGraphCanvas.jsx` (Canvas 기반 그래프)
- `services/web-editor/frontend/src/components/ContextPanel.jsx` (컨텍스트 매니저)
- `services/web-editor/frontend/src/components/ChatPanel.jsx` (채팅, 기존 ChatWorkspace 리팩터)
- `services/web-editor/frontend/src/components/NodeDock.jsx` (선택 노드 독)
- `services/web-editor/frontend/src/components/CardView.jsx` (카드 그리드 뷰)

### 수정 대상
- `services/web-editor/frontend/src/index.css` → 디자인 토큰 전면 교체 (design-system-preview 기반)
- `services/web-editor/frontend/index.html` → Material Symbols 폰트 링크 추가
- `services/web-editor/app.py` → `IGNORED_DIRS`에 `.synapsenote` 추가, Base Blueprint 등록
- lucide-react → Material Symbols 아이콘 전환 대상:
  - `services/web-editor/frontend/src/components/EditorPanel.jsx`
  - `services/web-editor/frontend/src/components/EditorToolbar.jsx`
  - `services/web-editor/frontend/src/components/SearchPanel.jsx`
  - `services/web-editor/frontend/src/components/RecentFilesPanel.jsx`
  - `services/web-editor/frontend/src/components/GraphPanel.jsx`
  - `services/web-editor/frontend/src/components/Login.jsx`

### 유지 (변경 없음)
- `services/web-editor/frontend/src/components/graph/D3GraphPanel.jsx` — 에디터 내 미니 그래프용

### 시각 참고
- `docs/main-ui-preview.html` — 타겟 메인 UI 목업
- `docs/design-system-preview.html` — 디자인 시스템 가이드
- `docs/archive/2026-04-legacy-cleanup/previews/base-hierarchy-concept.html` — archive된 Base 계층 개념 목업
