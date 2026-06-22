# Frontend Graph Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Foveated Canvas 렌더러를 완전히 폐기하고 D3.js SVG force layout 기반 그래프를 구현한다. 노드 클릭 시 우측 패널이 슬라이드인되며 detail→editor/context로 전환된다.

**Architecture:** `GraphWorkspace`가 `GraphView`를 마운트하고, `GraphView`가 패널 상태(`collapsed/detail/editor/context`)를 관리한다. `D3GraphPanel`은 SVG D3 force simulation만 담당하며 노드 클릭 이벤트를 위로 전달한다. `SidePanel`은 패널 너비 transition 컨테이너이고, 내부 콘텐츠는 `motion`의 `AnimatePresence`로 crossfade된다.

**Tech Stack:** React 19, D3 v7, motion (AnimatePresence), Vite, vitest + jsdom

---

## 사전 지식

### 기존 컴포넌트 재사용
- `components/graph/NodeDetailPanel.jsx` — 버튼 텍스트/핸들러만 교체해 재사용
- `hooks/useGraphData.js` — 이미 `/api/graph` 실제 API와 연동됨. `graphData.nodes`, `graphData.links` 반환
- `utils/buildHierarchy.js` — 노드에 초기 `x`, `y` 위치(동심원) + `depth`, `childCount` 등 부가 데이터 추가. D3 초기 위치로 활용 가능

### 노드 데이터 형태 (enriched)
```js
{
  id: "notes/hello.md",
  title: "Hello",
  type: "Document" | "Directory",
  summary: "...",
  tags: [...],
  updatedAt: "...",
  x: 300,        // buildHierarchy가 계산한 초기 위치
  y: -120,
  depth: 2,
  childCount: 0,
  isLeaf: true,
  parentId: "notes",
}
```

### 링크 데이터 형태
```js
{ source: "notes", target: "notes/hello.md", edge_type: "directory", weight: 1 }
```

### 기존 그래프 폴더 구조
`components/graph/` 에 다음 파일이 있음 — 모두 **교체 대상**:
- `GraphCanvas.jsx` → 삭제 (Canvas 기반 d3-force 렌더러)
- `GraphFilterBar.jsx` → 삭제 (기존 필터 바, 새 구현에서 불필요)
- `GraphTab.jsx` → 삭제
- `NodeDetailPanel.jsx` → 이 플랜에서 재작성 (버튼 변경)

### CSS 토큰
`styles/tokens.css`에 이미 동일 색상이 다른 변수명으로 정의되어 있음:
- `--primary-container: #7c3aed`
- `--primary: #d2bbff`
- `--secondary-container: #0566d9`
- `--surface-low: #1c1b1b`

새 `--color-*` 토큰은 추가하지 않음 — 기존 토큰을 그대로 사용.

---

## File Map

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `services/web/frontend/package.json` | 수정 | `d3@^7`, `motion` 추가 |
| `components/graph/GraphCanvas.jsx` | 삭제 | Canvas 렌더러 폐기 |
| `components/graph/GraphFilterBar.jsx` | 삭제 | 불필요 |
| `components/graph/GraphTab.jsx` | 삭제 | 불필요 |
| `components/graph2/FoveatedGraphView.jsx` | 삭제 | Foveated 렌더러 폐기 |
| `components/graph2/GraphCanvas.jsx` | 삭제 | Foveated Canvas 폐기 |
| `components/graph2/mockData.js` | 삭제 | Mock 데이터 폐기 |
| `components/graph/NodeDetailPanel.jsx` | 재작성 | 버튼 "에디터에서 편집" / "컨텍스트에 추가"로 변경 |
| `components/graph/D3GraphPanel.jsx` | 신규 | D3 SVG force simulation 렌더러 |
| `components/graph/SidePanel.jsx` | 신규 | 우측 패널 너비 transition 컨테이너 |
| `components/graph/NodeEditorPanel.jsx` | 신규 | 패널 내 에디터 뷰 |
| `components/graph/NodeContextPanel.jsx` | 신규 | 패널 내 컨텍스트 추가 뷰 |
| `components/graph/GraphView.jsx` | 신규 | 패널 상태 관리 + 레이아웃 |
| `components/workspace/GraphWorkspace.jsx` | 수정 | GraphView 사용하도록 교체 |

---

## 테스트 실행 방법

```bash
cd services/web/frontend
npm test
```

---

### Task 1: 의존성 설치

**Files:**
- Modify: `services/web/frontend/package.json`

- [ ] **Step 1: d3와 motion 설치**

```bash
cd services/web/frontend
npm install d3@^7 motion@^11
```

- [ ] **Step 2: 설치 확인**

```bash
node -e "import('d3').then(d => console.log('d3 ok:', Object.keys(d).length))"
node -e "import('motion').then(m => console.log('motion ok:', typeof m.motion))"
```

Expected: 에러 없이 출력

- [ ] **Step 3: 커밋**

```bash
git add services/web/frontend/package.json services/web/frontend/package-lock.json
git commit -m "chore: d3@7, motion 의존성 추가"
```

---

### Task 2: 기존 그래프 파일 폐기

**Files:**
- Delete: `components/graph2/FoveatedGraphView.jsx`
- Delete: `components/graph2/GraphCanvas.jsx`
- Delete: `components/graph2/mockData.js`
- Delete: `components/graph/GraphCanvas.jsx`
- Delete: `components/graph/GraphFilterBar.jsx`
- Delete: `components/graph/GraphTab.jsx`

- [ ] **Step 1: graph2 디렉토리 삭제**

```bash
rm services/web/frontend/src/components/graph2/FoveatedGraphView.jsx
rm services/web/frontend/src/components/graph2/GraphCanvas.jsx
rm services/web/frontend/src/components/graph2/mockData.js
```

- [ ] **Step 2: graph/ 구 파일 삭제**

```bash
rm services/web/frontend/src/components/graph/GraphCanvas.jsx
rm services/web/frontend/src/components/graph/GraphFilterBar.jsx
rm services/web/frontend/src/components/graph/GraphTab.jsx
```

- [ ] **Step 3: 커밋**

```bash
git add -A services/web/frontend/src/components/graph2/ \
           services/web/frontend/src/components/graph/
git commit -m "refactor: Foveated Canvas 렌더러 및 구 그래프 파일 폐기"
```

---

### Task 3: NodeDetailPanel 재작성 (버튼 변경)

**Files:**
- Rewrite: `services/web/frontend/src/components/graph/NodeDetailPanel.jsx`

기존 `NodeDetailPanel`에서 "Open Full Synapse" 버튼을 "에디터에서 편집" / "컨텍스트에 추가" 두 버튼으로 교체한다. 나머지 레이아웃/스타일은 유지.

- [ ] **Step 1: NodeDetailPanel.jsx 버튼 섹션 교체**

파일 전체를 다음으로 교체 (`PanelContent` 내 액션 버튼 섹션만 변경, 나머지 동일):

액션 버튼 부분 (`onOpen` 버튼이 있던 자리)을 찾아 다음으로 교체:

```jsx
{/* 액션 버튼 */}
<div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
  <button
    onClick={() => onOpenEditor?.(node)}
    style={{
      padding: '12px 16px', borderRadius: 10, width: '100%',
      background: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
      color: '#fff', fontWeight: 600, fontSize: 14,
      border: 'none', cursor: 'pointer',
      boxShadow: '0 4px 18px rgba(124,58,237,0.38)',
      transition: 'opacity 0.15s',
    }}
    onMouseEnter={e => { e.currentTarget.style.opacity = '0.88'; }}
    onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
  >
    에디터에서 편집
  </button>

  <button
    onClick={() => onAddToContext?.(node)}
    style={{
      padding: '10px 16px', borderRadius: 10, width: '100%',
      background: 'rgba(255,255,255,0.05)', color: '#9ca3af',
      fontWeight: 500, fontSize: 13,
      border: '1px solid rgba(255,255,255,0.08)',
      cursor: 'pointer', transition: 'background 0.12s',
    }}
    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.09)'; }}
    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
  >
    컨텍스트에 추가
  </button>
</div>
```

export 시그니처도 변경:
```jsx
// 변경 전
export function NodeDetailPanel({ node, isMobile, onClose, onOpen, onAddToChat, onNodeSelect })
// 변경 후
export function NodeDetailPanel({ node, isMobile, onClose, onOpenEditor, onAddToContext, onNodeSelect })
```

- [ ] **Step 2: 커밋**

```bash
git add services/web/frontend/src/components/graph/NodeDetailPanel.jsx
git commit -m "feat: NodeDetailPanel 버튼 '에디터에서 편집' / '컨텍스트에 추가'로 교체"
```

---

### Task 4: D3GraphPanel 구현

**Files:**
- Create: `services/web/frontend/src/components/graph/D3GraphPanel.jsx`

D3 force simulation + SVG 렌더러. 성능 최적화(RAF throttle, 백그라운드 수렴, 간선 LOD, 뷰포트 컬링) 포함.

- [ ] **Step 1: D3GraphPanel.jsx 생성**

```jsx
// services/web/frontend/src/components/graph/D3GraphPanel.jsx
import { useEffect, useRef, useCallback } from 'react';
import * as d3 from 'd3';

// ── 상수 ────────────────────────────────────────────────────────
const WARMUP_TICKS = 300;   // 백그라운드 수렴 틱 수
const MIN_SCALE    = 0.08;
const MAX_SCALE    = 4.0;

// 노드 반지름 계산 (degree 비례)
function nodeRadius(node, degree) {
  if (node.type === 'Directory') {
    return Math.max(20, Math.min(36, 20 + degree * 1.2));
  }
  if (degree >= 5) {
    return Math.max(14, Math.min(26, 14 + degree * 0.8));
  }
  return 8;
}

// 간선 색상
function linkColor(edge_type) {
  return edge_type === 'wikilink'
    ? 'rgba(124,58,237,0.4)'
    : 'rgba(74,68,85,0.3)';
}

export function D3GraphPanel({ nodes, links, selectedNodeId, onNodeClick, width, height }) {
  const svgRef       = useRef(null);
  const gRef         = useRef(null);
  const simRef       = useRef(null);
  const zoomRef      = useRef(null);
  const rafRef       = useRef(null);
  const currentScale = useRef(1);

  // ── 틱 핸들러 (RAF throttle) ─────────────────────────────────
  const scheduleTick = useCallback(() => {
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      const gNode = gRef.current;
      if (!gNode) return;
      const g = d3.select(gNode);  // DOM 노드 → D3 selection

      const scale = currentScale.current;

      // 간선 LOD
      const showAllLinks  = scale >= 0.3;
      const showSomeLinks = scale >= 0.15;

      g.selectAll('line.graph-link')
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
        .style('display', d => {
          if (!showSomeLinks) return 'none';
          if (!showAllLinks && d.weight < 1.0) return 'none';
          return null;
        });

      g.selectAll('g.graph-node')
        .attr('transform', d => `translate(${d.x},${d.y})`);
    });
  }, []);

  // ── 시뮬레이션 + SVG 초기화 ──────────────────────────────────
  useEffect(() => {
    if (!svgRef.current || !nodes.length || !width || !height) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // degree 계산
    const degreeMap = new Map();
    for (const n of nodes) degreeMap.set(n.id, 0);
    for (const l of links) {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      degreeMap.set(sid, (degreeMap.get(sid) ?? 0) + 1);
      degreeMap.set(tid, (degreeMap.get(tid) ?? 0) + 1);
    }

    // 노드/링크 복사 (D3가 객체를 mutate하므로)
    const simNodes = nodes.map(n => ({ ...n }));
    const simLinks = links.map(l => ({ ...l }));

    // 시뮬레이션
    const sim = d3.forceSimulation(simNodes)
      .force('link', d3.forceLink(simLinks).id(d => d.id).distance(120))
      .force('charge', d3.forceManyBody().strength(-400))
      .force('center', d3.forceCenter(0, 0))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d, degreeMap.get(d.id) ?? 0) + 8))
      .alphaDecay(0.03)
      .velocityDecay(0.4)
      .stop();

    // 백그라운드 수렴
    for (let i = 0; i < WARMUP_TICKS; i++) sim.tick();

    simRef.current = sim;

    // SVG 구성
    const g = svg.append('g');
    gRef.current = g.node() ?? null;  // DOM 노드 저장 (D3 selection 아님)

    // 줌
    const zoom = d3.zoom()
      .scaleExtent([MIN_SCALE, MAX_SCALE])
      .on('zoom', (event) => {
        currentScale.current = event.transform.k;
        g.attr('transform', event.transform);
        // LOD 업데이트
        scheduleTick();
      });
    svg.call(zoom);
    zoomRef.current = zoom;

    // 초기 카메라: 전체 노드가 보이도록 fit
    const xs = simNodes.map(n => n.x);
    const ys = simNodes.map(n => n.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const spanX = Math.max(...xs) - Math.min(...xs) || 1;
    const spanY = Math.max(...ys) - Math.min(...ys) || 1;
    const initScale = Math.min(
      (width * 0.75) / spanX,
      (height * 0.75) / spanY,
      MAX_SCALE
    );
    svg.call(zoom.transform, d3.zoomIdentity
      .translate(width / 2, height / 2)
      .scale(initScale)
      .translate(-cx, -cy)
    );

    // 배경 클릭 → 선택 해제
    svg.on('click', () => onNodeClick(null));

    // 간선 레이어
    g.append('g').selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('class', 'graph-link')
      .attr('stroke', d => linkColor(d.edge_type))
      .attr('stroke-width', d => Math.max(0.5, Math.sqrt(d.weight ?? 1)))
      .attr('x1', d => d.source.x)
      .attr('y1', d => d.source.y)
      .attr('x2', d => d.target.x)
      .attr('y2', d => d.target.y);

    // 노드 레이어
    const drag = d3.drag()
      .on('start', (event, d) => {
        if (!event.active) sim.alphaTarget(0.2).restart();
        d.fx = d.x; d.fy = d.y;
      })
      .on('drag', (event, d) => {
        d.fx = event.x; d.fy = event.y;
        scheduleTick();
      })
      .on('end', (event, d) => {
        if (!event.active) sim.alphaTarget(0);
        d.fx = null; d.fy = null;
      });

    const nodeG = g.append('g').selectAll('g')
      .data(simNodes)
      .join('g')
      .attr('class', 'graph-node')
      .attr('transform', d => `translate(${d.x},${d.y})`)
      .style('cursor', 'pointer')
      .call(drag)
      .on('click', (event, d) => {
        event.stopPropagation();
        onNodeClick(d);
      });

    nodeG.append('circle')
      .attr('r', d => nodeRadius(d, degreeMap.get(d.id) ?? 0))
      .attr('fill', d => d.type === 'Directory'
        ? 'rgba(124,58,237,0.7)'
        : degreeMap.get(d.id) >= 5
          ? 'rgba(5,102,217,0.7)'
          : 'rgba(74,68,85,0.7)'
      )
      .attr('stroke', d => d.type === 'Directory' ? '#d2bbff' : '#adc6ff')
      .attr('stroke-width', d => d.type === 'Directory' ? 2 : 1)
      .attr('stroke-opacity', 0.3);

    // 폴더 아이콘 (Directory만)
    nodeG.filter(d => d.type === 'Directory')
      .append('text')
      .attr('class', 'material-symbols-outlined')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'central')
      .attr('fill', 'white')
      .attr('font-size', '18px')
      .style('pointer-events', 'none')
      .text('folder');

    // 레이블
    nodeG.append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', d => nodeRadius(d, degreeMap.get(d.id) ?? 0) + 14)
      .attr('fill', '#d2bbff')
      .attr('font-size', d => d.type === 'Directory' ? '12px' : '10px')
      .attr('font-family', 'Inter, sans-serif')
      .style('pointer-events', 'none')
      .text(d => d.title?.slice(0, 20) || d.id.split('/').pop());

    // 시뮬레이션 tick (노드 드래그 중에만 동작)
    sim.on('tick', scheduleTick);

    // 뷰포트 컬링: zoom 이벤트에서 처리됨 (scheduleTick 호출로 커버)

    return () => {
      sim.stop();
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, links, width, height]);

  // ── 선택 노드 하이라이트 ──────────────────────────────────────
  useEffect(() => {
    const gNode = gRef.current;
    if (!gNode) return;

    const sel = d3.select(gNode);  // DOM 노드 → D3 selection

    if (!selectedNodeId) {
      sel.selectAll('g.graph-node').style('opacity', 1);
      sel.selectAll('circle').attr('stroke-opacity', 0.3);
      return;
    }

    // 1-hop 이웃 계산
    const neighbors = new Set([selectedNodeId]);
    for (const l of links) {
      const sid = typeof l.source === 'object' ? l.source.id : l.source;
      const tid = typeof l.target === 'object' ? l.target.id : l.target;
      if (sid === selectedNodeId) neighbors.add(tid);
      if (tid === selectedNodeId) neighbors.add(sid);
    }

    sel.selectAll('g.graph-node')
      .style('opacity', d => neighbors.has(d.id) ? 1 : 0.15);

    sel.selectAll('g.graph-node circle')
      .attr('stroke-opacity', d => d.id === selectedNodeId ? 1.0 : 0.3)
      .attr('stroke-width', d => d.id === selectedNodeId ? 3 : 1);

    // 선택 노드 중심으로 카메라 이동
    const svg = d3.select(svgRef.current);
    const zoom = zoomRef.current;
    if (!svg || !zoom) return;

    const simNodes = simRef.current?.nodes() ?? [];
    const target = simNodes.find(n => n.id === selectedNodeId);
    if (!target) return;

    const panelWidth = 380;
    const availableW = width - panelWidth;
    svg.transition().duration(800).ease(d3.easeCubicInOut)
      .call(zoom.transform, d3.zoomIdentity
        .translate(panelWidth + availableW / 2, height / 2)
        .scale(1.2)
        .translate(-target.x, -target.y)
      );

    // 부분 재시뮬레이션 (1-hop에만 radial force)
    const sim = simRef.current;
    if (!sim) return;
    sim.force('radial', d3.forceRadial(180, target.x, target.y)
      .strength(d => neighbors.has(d.id) && d.id !== selectedNodeId ? 0.6 : 0));
    sim.alpha(0.2).restart();
    setTimeout(() => { sim.force('radial', null); }, 1500);

  }, [selectedNodeId, links, width, height]);

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      {/* 배경 glow */}
      <div style={{
        position: 'absolute', top: '25%', left: '33%',
        width: 384, height: 384,
        background: 'rgba(124,58,237,0.06)',
        borderRadius: '50%', filter: 'blur(120px)',
        pointerEvents: 'none',
      }} />
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ display: 'block' }}
      />
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add services/web/frontend/src/components/graph/D3GraphPanel.jsx
git commit -m "feat: D3 SVG force layout 그래프 패널 구현"
```

---

### Task 5: SidePanel, NodeEditorPanel, NodeContextPanel 구현

**Files:**
- Create: `services/web/frontend/src/components/graph/SidePanel.jsx`
- Create: `services/web/frontend/src/components/graph/NodeEditorPanel.jsx`
- Create: `services/web/frontend/src/components/graph/NodeContextPanel.jsx`

- [ ] **Step 1: SidePanel.jsx 생성**

우측 패널 컨테이너. 너비 CSS transition + AnimatePresence 내부 crossfade.

```jsx
// services/web/frontend/src/components/graph/SidePanel.jsx
import { AnimatePresence, motion } from 'motion';

const PANEL_WIDTHS = {
  collapsed: 0,
  detail:    380,
  editor:    600,
  context:   380,
};

export function SidePanel({ panelState, children }) {
  const width = PANEL_WIDTHS[panelState] ?? 0;

  return (
    <div style={{
      width,
      minWidth: width,
      height: '100%',
      overflow: 'hidden',
      transition: 'width 300ms cubic-bezier(0.4,0,0.2,1), min-width 300ms cubic-bezier(0.4,0,0.2,1)',
      position: 'relative',
      background: 'rgba(13,11,22,0.96)',
      backdropFilter: 'blur(22px)',
      WebkitBackdropFilter: 'blur(22px)',
      borderLeft: width > 0 ? '1px solid rgba(167,139,250,0.14)' : 'none',
      flexShrink: 0,
    }}>
      <AnimatePresence mode="wait">
        {width > 0 && (
          <motion.div
            key={panelState}
            initial={{ opacity: 0, x: 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 12 }}
            transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
            style={{ width: '100%', height: '100%', overflow: 'hidden' }}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
```

- [ ] **Step 2: NodeEditorPanel.jsx 생성**

패널 내 에디터 뷰. `EditorPanel`을 AppShell 없이 임베드.

```jsx
// services/web/frontend/src/components/graph/NodeEditorPanel.jsx
import { useState, useEffect, useRef } from 'react';
import { AuthProvider } from '../../contexts/AuthContext.jsx';

export function NodeEditorPanel({ nodeId, onClose, onBackToDetail }) {
  const [EditorPanelComponent, setEditorPanelComponent] = useState(null);
  const [currentFile, setCurrentFile] = useState(nodeId);
  const [isDirty, setIsDirty] = useState(false);
  const [showUnsavedWarning, setShowUnsavedWarning] = useState(false);
  const pendingNodeId = useRef(null);

  useEffect(() => {
    import('../EditorPanel').then(m => setEditorPanelComponent(() => m.default));
  }, []);

  // 외부에서 nodeId가 바뀌면 (다른 노드 클릭)
  useEffect(() => {
    if (nodeId === currentFile) return;
    if (isDirty) {
      pendingNodeId.current = nodeId;
      setShowUnsavedWarning(true);
    } else {
      setCurrentFile(nodeId);
      setIsDirty(false);
    }
  }, [nodeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleDiscard() {
    setCurrentFile(pendingNodeId.current);
    setIsDirty(false);
    setShowUnsavedWarning(false);
    pendingNodeId.current = null;
  }

  function handleKeep() {
    setShowUnsavedWarning(false);
    pendingNodeId.current = null;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)',
        flexShrink: 0,
      }}>
        <button
          onClick={onBackToDetail}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(196,181,253,0.6)', fontSize: 13,
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>arrow_back</span>
          디테일 보기
        </button>
        <button
          onClick={onClose}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            color: 'rgba(156,163,175,0.7)',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
        </button>
      </div>

      {/* 미저장 경고 배너 */}
      {showUnsavedWarning && (
        <div style={{
          padding: '10px 16px', background: 'rgba(234,88,12,0.15)',
          borderBottom: '1px solid rgba(234,88,12,0.3)',
          fontSize: 12, color: '#fb923c',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <span>저장하지 않은 변경이 있습니다.</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={handleDiscard} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fb923c', fontSize: 12, textDecoration: 'underline' }}>버리기</button>
            <button onClick={handleKeep} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#fb923c', fontSize: 12, fontWeight: 600 }}>유지</button>
          </div>
        </div>
      )}

      {/* 에디터 */}
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <AuthProvider>
          {EditorPanelComponent && (
            <EditorPanelComponent
              currentFile={currentFile}
              setCurrentFile={setCurrentFile}
              refreshKey={currentFile}
              isMobile={false}
              leftOpen={false}
              setLeftOpen={() => {}}
              onDirtyChange={setIsDirty}
            />
          )}
        </AuthProvider>
      </div>
    </div>
  );
}
```

> **필수 처리:** `EditorPanel`은 현재 `onDirtyChange` prop을 지원하지 않는다. 따라서 `NodeEditorPanel`에서 dirty 상태 관련 코드(`isDirty`, `showUnsavedWarning`, `pendingNodeId`, `handleDiscard`, `handleKeep`)를 **제거**하고, `useEffect` 내에서 노드 전환 시 조건 없이 `setCurrentFile(nodeId)` 만 호출하도록 단순화한다. 미저장 경고 배너 UI도 제거한다.

- [ ] **Step 3: NodeContextPanel.jsx 생성**

패널 내 컨텍스트 추가 뷰.

```jsx
// services/web/frontend/src/components/graph/NodeContextPanel.jsx

export function NodeContextPanel({ node, onClose }) {
  if (!node) return null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* 헤더 */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '22px 20px 0', flexShrink: 0,
      }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'linear-gradient(135deg, #0566d9 0%, #1e40af 100%)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 20px rgba(5,102,217,0.4)', flexShrink: 0,
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#bfdbfe' }}>hub</span>
        </div>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: '50%',
            background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: '#9ca3af',
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>
        </button>
      </div>

      <div style={{ padding: '14px 20px 0' }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: '#f3f4f6', marginBottom: 6 }}>
          컨텍스트에 추가
        </h2>
        <p style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6 }}>
          <strong style={{ color: '#adc6ff' }}>{node.title || node.id}</strong>을(를) 현재 채팅 세션의 컨텍스트에 추가합니다.
        </p>
      </div>

      <div style={{ flex: 1, padding: '16px 20px 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* 노드 정보 */}
        <div style={{
          padding: '12px 14px', borderRadius: 10,
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: '#adc6ff' }}>
              {node.type === 'Directory' ? 'folder' : 'description'}
            </span>
            <div>
              <div style={{ fontSize: 13, color: '#e5e7eb', fontWeight: 500 }}>{node.title || node.id}</div>
              <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>{node.id}</div>
            </div>
          </div>
        </div>

        <button
          onClick={() => {
            // TODO: chat context API 연동 (POST /api/context 또는 채팅 세션에 nodeId 추가)
            // 현재는 콘솔 출력 + 닫기
            console.log('[context] adding node to context:', node.id);
            onClose();
          }}
          style={{
            padding: '12px 16px', borderRadius: 10, width: '100%',
            background: 'linear-gradient(135deg, #0566d9 0%, #1e40af 100%)',
            color: '#fff', fontWeight: 600, fontSize: 14,
            border: 'none', cursor: 'pointer',
            boxShadow: '0 4px 18px rgba(5,102,217,0.35)',
          }}
        >
          컨텍스트에 추가
        </button>
      </div>
    </div>
  );
}
```

> **참고:** 컨텍스트 추가 실제 API 연동은 `context_router.py`의 `/api/context` 엔드포인트 확인 후 구현. 현재 플랜 범위에서는 UI와 콘솔 로그만 구현하고 TODO 주석 남김.

- [ ] **Step 4: 커밋**

```bash
git add services/web/frontend/src/components/graph/SidePanel.jsx \
        services/web/frontend/src/components/graph/NodeEditorPanel.jsx \
        services/web/frontend/src/components/graph/NodeContextPanel.jsx
git commit -m "feat: SidePanel, NodeEditorPanel, NodeContextPanel 구현"
```

---

### Task 6: GraphView 구현 (패널 상태 관리)

**Files:**
- Create: `services/web/frontend/src/components/graph/GraphView.jsx`

- [ ] **Step 1: GraphView.jsx 생성**

```jsx
// services/web/frontend/src/components/graph/GraphView.jsx
import { useState, useRef, useEffect, useCallback } from 'react';
import { useGraphData } from '../../hooks/useGraphData';
import { D3GraphPanel } from './D3GraphPanel';
import { SidePanel } from './SidePanel';
import { NodeDetailPanel } from './NodeDetailPanel';
import { NodeEditorPanel } from './NodeEditorPanel';
import { NodeContextPanel } from './NodeContextPanel';

export function GraphView({ onUnauthorized }) {
  const containerRef = useRef(null);
  const [size, setSize] = useState({ w: 800, h: 600 });

  const [panelState, setPanelState] = useState('collapsed'); // collapsed | detail | editor | context
  const [selectedNode, setSelectedNode] = useState(null);
  const [editorNodeId, setEditorNodeId] = useState(null);

  const { graphData, loading, error, refetch } = useGraphData({ onUnauthorized });

  // 컨테이너 크기 감지
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    if (width > 0 && height > 0) setSize({ w: Math.round(width), h: Math.round(height) });

    const ro = new ResizeObserver(entries => {
      const { width: w, height: h } = entries[0].contentRect;
      if (w > 0 && h > 0) setSize({ w: Math.round(w), h: Math.round(h) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 노드 클릭 핸들러
  const handleNodeClick = useCallback((node) => {
    if (!node) {
      // 배경 클릭
      if (panelState === 'context') setPanelState('collapsed');
      // editor 상태에서는 배경 클릭 무시 (실수 방지)
      if (panelState === 'detail') setPanelState('collapsed');
      setSelectedNode(null);
      return;
    }

    setSelectedNode(node);

    if (panelState === 'editor') {
      // 에디터 열린 상태에서 다른 노드 클릭 → 에디터 파일 교체 (NodeEditorPanel이 dirty 처리)
      setEditorNodeId(node.id);
    } else {
      setPanelState('detail');
    }
  }, [panelState]);

  function handleOpenEditor(node) {
    setEditorNodeId(node.id);
    setPanelState('editor');
  }

  function handleAddToContext(node) {
    setPanelState('context');
  }

  function handleClose() {
    setPanelState('collapsed');
    setSelectedNode(null);
  }

  function handleBackToDetail() {
    setPanelState('detail');
  }

  // 패널 내용
  function renderPanelContent() {
    if (panelState === 'detail' && selectedNode) {
      return (
        <NodeDetailPanel
          node={selectedNode}
          isMobile={false}
          onClose={handleClose}
          onOpenEditor={handleOpenEditor}
          onAddToContext={handleAddToContext}
          onNodeSelect={(n) => { setSelectedNode(n); setPanelState('detail'); }}
        />
      );
    }
    if (panelState === 'editor') {
      return (
        <NodeEditorPanel
          nodeId={editorNodeId}
          onClose={handleClose}
          onBackToDetail={handleBackToDetail}
        />
      );
    }
    if (panelState === 'context' && selectedNode) {
      return (
        <NodeContextPanel
          node={selectedNode}
          onClose={handleClose}
        />
      );
    }
    return null;
  }

  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(196,181,253,0.4)' }}>
        <div style={{ width: 28, height: 28, border: '2px solid rgba(124,58,237,0.2)', borderTopColor: '#7c3aed', borderRadius: '50%', animation: 'kspin 0.75s linear infinite' }} />
        <style>{`@keyframes kspin{to{transform:rotate(360deg)}}`}</style>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#f87171', gap: 12 }}>
        <span className="material-symbols-outlined" style={{ fontSize: 36 }}>error</span>
        <p style={{ fontSize: 14 }}>{error}</p>
        <button onClick={refetch} style={{ padding: '8px 16px', borderRadius: 8, background: 'rgba(124,58,237,0.2)', border: '1px solid rgba(124,58,237,0.4)', color: '#d2bbff', cursor: 'pointer' }}>
          다시 시도
        </button>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      style={{ width: '100%', height: '100%', display: 'flex', overflow: 'hidden', position: 'relative' }}
    >
      {/* 그래프 영역 */}
      <div style={{ flex: 1, minWidth: 0, height: '100%' }}>
        <D3GraphPanel
          nodes={graphData.nodes}
          links={graphData.links}
          selectedNodeId={selectedNode?.id ?? null}
          onNodeClick={handleNodeClick}
          width={size.w}
          height={size.h}
        />
      </div>

      {/* 우측 패널 */}
      <SidePanel panelState={panelState}>
        {renderPanelContent()}
      </SidePanel>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add services/web/frontend/src/components/graph/GraphView.jsx
git commit -m "feat: GraphView 패널 상태 머신 구현 (collapsed/detail/editor/context)"
```

---

### Task 7: GraphWorkspace 교체

**Files:**
- Modify: `services/web/frontend/src/components/workspace/GraphWorkspace.jsx`

- [ ] **Step 1: GraphWorkspace.jsx 교체**

```jsx
// services/web/frontend/src/components/workspace/GraphWorkspace.jsx
import { useNavigate } from 'react-router-dom';
import { AppShell } from '../shell/AppShell';
import { GraphView } from '../graph/GraphView';

export function GraphWorkspace() {
  const navigate = useNavigate();

  return (
    <AppShell topbarTitle="Graph">
      <div style={{ height: 'calc(100vh - var(--topbar-h))', position: 'relative' }}>
        <GraphView onUnauthorized={() => navigate('/')} />
      </div>
    </AppShell>
  );
}
```

- [ ] **Step 2: 빌드 확인**

```bash
cd services/web/frontend
npm run build 2>&1 | tail -20
```

Expected: 빌드 성공, 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add services/web/frontend/src/components/workspace/GraphWorkspace.jsx
git commit -m "feat: GraphWorkspace를 D3 SVG 그래프로 교체"
```

---

### Task 8: 테스트

**Files:**
- Create: `services/web/frontend/src/components/graph/GraphView.test.jsx`

- [ ] **Step 1: GraphView 패널 상태 전환 테스트 작성**

```jsx
// services/web/frontend/src/components/graph/GraphView.test.jsx
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { GraphView } from './GraphView';

// useGraphData mock
vi.mock('../../hooks/useGraphData', () => ({
  useGraphData: () => ({
    graphData: {
      nodes: [
        { id: 'a.md', title: 'Node A', type: 'Document', x: 0, y: 0, depth: 0, childCount: 0, isLeaf: true, parentId: null, tags: [], summary: '' },
        { id: 'b.md', title: 'Node B', type: 'Document', x: 100, y: 0, depth: 0, childCount: 0, isLeaf: true, parentId: null, tags: [], summary: '' },
      ],
      links: [{ source: 'a.md', target: 'b.md', edge_type: 'wikilink', weight: 1 }],
    },
    stats: null,
    loading: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

// D3GraphPanel mock (SVG 렌더 생략)
vi.mock('./D3GraphPanel', () => ({
  D3GraphPanel: ({ onNodeClick }) => (
    <div data-testid="graph-panel">
      <button data-testid="click-node-a" onClick={() => onNodeClick({ id: 'a.md', title: 'Node A', type: 'Document', tags: [], summary: '' })}>
        click node a
      </button>
      <button data-testid="click-background" onClick={() => onNodeClick(null)}>
        click background
      </button>
    </div>
  ),
}));

function renderGraphView() {
  return render(
    <MemoryRouter>
      <GraphView onUnauthorized={() => {}} />
    </MemoryRouter>
  );
}

describe('GraphView 패널 상태 전환', () => {
  it('초기 상태: 패널이 없다', () => {
    renderGraphView();
    expect(screen.queryByText('에디터에서 편집')).toBeNull();
    expect(screen.queryByText('컨텍스트에 추가')).toBeNull();
  });

  it('노드 클릭 → detail 패널이 열린다', async () => {
    renderGraphView();
    await act(async () => {
      screen.getByTestId('click-node-a').click();
    });
    expect(screen.getByText('에디터에서 편집')).toBeInTheDocument();
    expect(screen.getByText('컨텍스트에 추가')).toBeInTheDocument();
  });

  it('detail → "에디터에서 편집" → editor 패널', async () => {
    renderGraphView();
    await act(async () => {
      screen.getByTestId('click-node-a').click();
    });
    await act(async () => {
      screen.getByText('에디터에서 편집').click();
    });
    expect(screen.getByText('디테일 보기')).toBeInTheDocument();
  });

  it('detail → "컨텍스트에 추가" → context 패널', async () => {
    renderGraphView();
    await act(async () => {
      screen.getByTestId('click-node-a').click();
    });
    await act(async () => {
      screen.getByText('컨텍스트에 추가').click();
    });
    expect(screen.getByText('컨텍스트에 추가', { selector: 'button' })).toBeInTheDocument();
  });

  it('detail → 배경 클릭 → collapsed', async () => {
    renderGraphView();
    await act(async () => { screen.getByTestId('click-node-a').click(); });
    await act(async () => { screen.getByTestId('click-background').click(); });
    expect(screen.queryByText('에디터에서 편집')).toBeNull();
  });
});
```

- [ ] **Step 2: 테스트 실행**

```bash
cd services/web/frontend
npm test -- --reporter=verbose GraphView
```

Expected: 5개 모두 PASS

- [ ] **Step 3: 커밋**

```bash
git add services/web/frontend/src/components/graph/GraphView.test.jsx
git commit -m "test: GraphView 패널 상태 전환 테스트 추가"
```

---

### Task 9: 전체 빌드 및 최종 확인

- [ ] **Step 1: 전체 테스트 실행**

```bash
cd services/web/frontend
npm test 2>&1 | tail -20
```

Expected: 모든 테스트 PASS

- [ ] **Step 2: 프로덕션 빌드 확인**

```bash
npm run build 2>&1 | tail -10
```

Expected: 빌드 성공

- [ ] **Step 3: lint 확인**

```bash
npm run lint 2>&1 | head -20
```

Expected: 에러 없음 (warning은 무방)
