# 모바일 포비에이티드 그래프 자연 레이아웃 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 노드 탭 시 spring_layout 방향을 보존한 자연스러운 자식 재배치와 부드러운 애니메이션으로 모바일 최적화 그래프 탐색 경험 구현

**Architecture:** 각 노드에 dispX/dispY(표시 좌표)를 별도 관리하여 world 좌표와 분리. 포커스 변경 시 spring_layout 방향 보존 + 거리 정규화 + 반발력으로 자식 target 위치 계산. 매 rAF 프레임마다 LERP로 부드럽게 이동.

**Tech Stack:** React(JSX), Canvas 2D API, requestAnimationFrame

---

## 작업 전 체크리스트 (거시적 목표)

- [ ] 포커스 노드가 화면 중앙에 명확히 자리잡음
- [ ] 자식 노드들이 자연스럽게 주변에 퍼져 읽기 쉬움
- [ ] 노드 이동이 부드럽고 자연스러움 (끊김, 팝핑 없음)
- [ ] 배경 노드들이 방해 없이 물러남
- [ ] 모바일에서 터치 조작이 불편함 없음
- [ ] 레이블이 겹치지 않고 읽힘

---

## 파일 구조

| 파일 경로 | 변경 종류 | 책임 |
|---|---|---|
| `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx` | 수정 | dispX/dispY 기반 렌더링, 자연 배치 알고리즘, 카메라 zoom-to-fit, 시각 품질 개선 |
| `services/web-editor/frontend/src/components/graph2/FoveatedGraphView.jsx` | 수정 (최소) | 하단 네비 바 높이 prop 전달 (navBarHeight) |

---

## Task 0: 초기 overview 카메라 scale 설정 — 전체 그래프 fitAll

**파일:** `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx`

### 배경

nodes 첫 로드 시 focusedId가 없는 경우 전체 그래프가 화면에 들어오도록 초기 카메라 scale을 계산한다. focusedId useEffect가 이후에 zoom-to-fit으로 덮어쓰므로, overview 상태에서만 적용된다.

### 구현

nodes useEffect 내부에서 초기 로드 시 fitAll scale 계산을 추가한다:

```js
// nodes 로드 완료 후 초기 scale 계산 (overview)
// focusedId useEffect가 이후에 zoom-to-fit 덮어씀
const ws = wsRef.current;
const W = canvasRef.current?.width ?? width;
const H = canvasRef.current?.height ?? height;
// 모든 노드의 bounding box 계산
const xs = nodes.filter(n => n.x != null).map(n => n.x * ws);
const ys = nodes.filter(n => n.x != null).map(n => n.y * ws);
if (xs.length) {
  const spanX = Math.max(...xs) - Math.min(...xs) || 1;
  const spanY = Math.max(...ys) - Math.min(...ys) || 1;
  const fitScale = Math.min(W / spanX, H / spanY) * 0.8;
  if (!focusedId) {
    tgtRef.current.scale = Math.min(fitScale, 1.0);
  }
}
```

### 커밋

```bash
git add services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx
git commit -m "feat: 초기 overview 카메라 scale fitAll 계산 추가"
```

---

## Task 1: displayPositions ref 관리 — dispX/dispY 초기화 및 LERP 루프

**파일:** `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx`

### 배경

현재 렌더링은 `n.x * ws`, `n.y * ws`를 직접 사용한다. 포커스 변경 시 자식 노드들의 표시 위치(dispX/dispY)를 world 좌표와 분리하여, target 위치로 부드럽게 LERP 이동하도록 변경한다.

### 구현

파일 상단 상수 블록에 다음을 추가한다:

```js
// ── 표시 좌표 상수 ────────────────────────────────────────────────
const DISP_LERP       = 0.09;   // 노드 표시 좌표 LERP 속도
const CAM_LERP        = 0.10;   // 카메라 LERP 속도 (기존 LERP 상수 이름 변경)
const NAV_BAR_H       = 80;     // 모바일 하단 네비 바 높이(px), 카메라 오프셋 보정용
```

기존 `const LERP = 0.10;` 을 제거하고 위 상수로 대체한다. 이후 `LERP` 참조를 모두 `CAM_LERP` 로 교체한다.

`GraphCanvas` 컴포넌트 내부에 다음 ref를 추가한다:

```js
// 표시 좌표 (dispX, dispY): 렌더링에 사용되는 실제 화면 위치
// key: node.id, value: { dispX, dispY, tgtX, tgtY }
const dispRef = useRef(new Map());
```

nodes가 변경될 때 새 노드는 world 좌표로 초기화하고, 기존 노드는 유지한다:

```js
useEffect(() => {
  nodesRef.current = nodes;
  const ws = wsRef.current;
  const disp = dispRef.current;
  for (const n of nodes) {
    if (n.x == null) continue;
    if (!disp.has(n.id)) {
      // 첫 로드: world 좌표로 초기화 (팝핑 없음)
      disp.set(n.id, {
        dispX: n.x * ws,
        dispY: n.y * ws,
        tgtX:  n.x * ws,
        tgtY:  n.y * ws,
      });
    }
  }
  // 삭제된 노드 제거
  const idSet = new Set(nodes.map(n => n.id));
  for (const id of disp.keys()) {
    if (!idSet.has(id)) disp.delete(id);
  }
  dirtyRef.current = true;
}, [nodes]);
```

worldScale 변경 시에도 dispRef를 리셋해 world 좌표 기준으로 재초기화한다:

```js
useEffect(() => {
  wsRef.current = worldScale ?? 1;
  const ws = worldScale ?? 1;
  const disp = dispRef.current;
  // worldScale 재계산 시 모든 노드 tgt 갱신 (disp는 현재값 유지 → LERP로 수렴)
  for (const n of nodesRef.current) {
    if (n.x == null) continue;
    const entry = disp.get(n.id);
    if (entry) {
      entry.tgtX = n.x * ws;
      entry.tgtY = n.y * ws;
    } else {
      disp.set(n.id, { dispX: n.x * ws, dispY: n.y * ws, tgtX: n.x * ws, tgtY: n.y * ws });
    }
  }
  dirtyRef.current = true;
}, [worldScale]);
```

render 함수 내 카메라 LERP 블록 뒤에 노드 표시 좌표 LERP를 추가한다:

```js
// 노드 표시 좌표 LERP
let nodeMoving = false;
for (const entry of dispRef.current.values()) {
  const ddx = entry.tgtX - entry.dispX;
  const ddy = entry.tgtY - entry.dispY;
  if (Math.abs(ddx) > 0.1 || Math.abs(ddy) > 0.1) {
    entry.dispX += ddx * DISP_LERP;
    entry.dispY += ddy * DISP_LERP;
    nodeMoving = true;
  }
}
if (nodeMoving) dirtyRef.current = true;
```

렌더링 시 `n.x * ws`, `n.y * ws` 를 모두 `dispRef.current.get(n.id)?.dispX ?? n.x * ws` 형태로 교체한다.

엣지 렌더링:
```js
const srcDisp  = dispRef.current.get(e.source);
const tgt2Disp = dispRef.current.get(e.target);
if (!src || !tgt2 || !srcDisp || !tgt2Disp) continue;
// moveTo/lineTo 에 srcDisp.dispX, srcDisp.dispY 사용
ctx.moveTo(srcDisp.dispX, srcDisp.dispY);
ctx.lineTo(tgt2Disp.dispX, tgt2Disp.dispY);
```

노드 렌더링:
```js
const nd = dispRef.current.get(n.id);
if (!nd) continue;
const x = nd.dispX;
const y = nd.dispY;
```

### 검증

```bash
# Playwright 스크린샷으로 그래프 로드 후 노드가 정상 렌더링되는지 확인
npx playwright screenshot --browser=chromium http://localhost:3002 /tmp/task1-graph.png
```

### 커밋

```bash
git add services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx
git commit -m "feat: 그래프 노드 dispX/dispY 표시 좌표 분리 및 LERP 루프 추가"
```

---

## Task 2: 자연스러운 자식 배치 알고리즘 — 방향 보존 + 거리 정규화 + 반발력

**파일:** `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx`

### 배경

포커스 변경 시 near 노드들의 tgtX/tgtY를 재계산한다. spring_layout의 parent→child 방향(각도)을 보존하고, 거리는 화면 기준으로 정규화한다. 반발력 iteration으로 겹침을 제거한다.

### 상수 추가

```js
const NEAR_DIST_PX    = 130;   // 포커스-이웃 간 목표 거리 (390px 뷰포트 기준)
const REPULSE_ITER    = 6;     // 반발력 반복 횟수
const REPULSE_MIN_PX  = 56;    // 노드 간 최소 거리 (px)
const REPULSE_STRENGTH = 0.45; // 반발력 강도 (0~1)
```

### 함수 추가 (GraphCanvas 컴포넌트 밖, buildLodSets 아래)

```js
/**
 * 포커스 노드를 중심(0,0)으로, near 노드들을 spring_layout 방향 보존하며
 * 거리 정규화 + 반발력 적용하여 배치 위치(dispX, dispY 기준 offset)를 반환.
 *
 * @param {Object} focusNode   - { x, y } (world 좌표)
 * @param {Array}  nearNodes   - [{ id, x, y }] (world 좌표)
 * @param {number} ws          - worldScale
 * @returns {Map<string, {offsetX, offsetY}>} id → focusNode 기준 offset
 */
function computeNearTargets(focusNode, nearNodes, ws) {
  const result = new Map();
  if (!nearNodes.length) return result;

  // 1) spring_layout 방향(각도) 계산
  const angles = nearNodes.map(n => {
    const dx = (n.x - focusNode.x) * ws;
    const dy = (n.y - focusNode.y) * ws;
    return { id: n.id, angle: Math.atan2(dy, dx) };
  });

  // 2) 방향 보존, 거리는 NEAR_DIST_PX로 정규화
  const positions = new Map();
  for (const { id, angle } of angles) {
    positions.set(id, {
      x: Math.cos(angle) * NEAR_DIST_PX,
      y: Math.sin(angle) * NEAR_DIST_PX,
    });
  }

  // 3) 반발력 반복으로 겹침 제거
  for (let iter = 0; iter < REPULSE_ITER; iter++) {
    const ids = [...positions.keys()];
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions.get(ids[i]);
        const b = positions.get(ids[j]);
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.hypot(dx, dy) || 0.001;
        if (dist < REPULSE_MIN_PX) {
          const overlap = (REPULSE_MIN_PX - dist) * REPULSE_STRENGTH;
          const nx = (dx / dist) * overlap * 0.5;
          const ny = (dy / dist) * overlap * 0.5;
          // immutable update: 새 객체 생성
          positions.set(ids[i], { x: a.x - nx, y: a.y - ny });
          positions.set(ids[j], { x: b.x + nx, y: b.y + ny });
        }
      }
    }
  }

  // 4) 화면 중앙 기준 offset (카메라 translate 전 좌표계, 즉 world-disp 좌표)
  //    focusNode의 dispX/dispY + offset
  for (const [id, pos] of positions) {
    result.set(id, { offsetX: pos.x, offsetY: pos.y });  // focusDisp 기준 offset
  }
  return result;
}
```

### applyFocusTargets 함수 추가 (GraphCanvas 컴포넌트 밖, computeNearTargets 아래)

`computeNearTargets` 로직을 독립 함수로 추출하여 focusedId useEffect와 worldScale useEffect 양쪽에서 재사용한다:

```js
/**
 * 포커스 노드 기준으로 near 노드들의 tgt를 radial 배치로 설정한다.
 * worldScale 변경 시에도 재호출하여 radial 레이아웃을 복원한다.
 *
 * @param {string|null} focusedId
 * @param {number}      ws
 * @param {Map}         nodeMap   - nodeMapRef.current
 * @param {object}      dispRef   - dispRef
 * @param {object}      nearRef   - nearRef
 * @param {object}      nodesRef  - nodesRef
 */
function applyFocusTargets(focusedId, ws, nodeMap, dispRef, nearRef, nodesRef) {
  const focusNode = nodeMap.get(focusedId);
  const disp = dispRef.current;
  const near = nearRef.current;

  if (focusNode?.x != null) {
    // near 노드 world 좌표 목록
    const nearNodes = [...near]
      .map(id => nodeMap.get(id))
      .filter(n => n?.x != null);

    // 자연 배치 계산 (offset 기준)
    const offsets = computeNearTargets(focusNode, nearNodes, ws);

    // focusNode: tgt = world 좌표 (카메라 pan으로 화면 중앙에 맞춤)
    const focusEntry = disp.get(focusNode.id);
    if (focusEntry) {
      focusEntry.tgtX = focusNode.x * ws;
      focusEntry.tgtY = focusNode.y * ws;
    }

    // near 노드: focusNode world 좌표 + offset
    for (const n of nearNodes) {
      const offset = offsets.get(n.id);
      const entry = disp.get(n.id);
      if (entry && offset) {
        entry.tgtX = focusNode.x * ws + offset.offsetX;
        entry.tgtY = focusNode.y * ws + offset.offsetY;
      }
    }

    // mid/far 노드: world 좌표로 복원 (포커스 해제 시 원위치)
    for (const n of nodesRef.current) {
      if (n.x == null) continue;
      if (n.id === focusNode.id) continue;
      if (near.has(n.id)) continue;
      const entry = disp.get(n.id);
      if (entry) {
        entry.tgtX = n.x * ws;
        entry.tgtY = n.y * ws;
      }
    }
  }
}
```

### 포커스 변경 시 tgt 재계산 (기존 focusedId useEffect 수정)

기존 `focusedId, worldScale` useEffect를 다음으로 교체한다:

```js
// 포커스 변경 → LOD 갱신 + near 노드 target 재계산
useEffect(() => {
  focusedIdRef.current = focusedId;
  const { near, mid } = buildLodSets(focusedId, edgesRef.current);
  nearRef.current = near;
  midRef.current  = mid;

  const ws = wsRef.current;
  applyFocusTargets(focusedId, ws, nodeMapRef.current, dispRef, nearRef, nodesRef);

  dirtyRef.current = true;
}, [focusedId]);
```

> 주의: 위 useEffect에서 `focusedId` prop을 직접 사용한다. 이전 코드의 `focusId` 오타를 제거하고 `focusedId` 로 통일한다.

### 검증

```bash
# 노드 탭 후 이웃들이 자연스럽게 퍼지는지 Playwright로 확인
# (자동화 어려우므로 수동 확인 + 스크린샷 비교)
npx playwright screenshot --browser=chromium http://localhost:3002 /tmp/task2-before.png
# 모바일 뷰포트로 확인
npx playwright screenshot --browser=chromium --viewport-size=390,844 http://localhost:3002 /tmp/task2-mobile.png
```

### 커밋

```bash
git add services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx
git commit -m "feat: spring_layout 방향 보존 자연 배치 알고리즘 구현 (반발력 포함)"
```

---

## Task 3: 카메라 zoom-to-fit — 하단 네비 보정 포함

**파일:** `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx`

### 배경

현재 카메라 target은 `tgtRef.current.x = -node.x * ws` 로 단순 world 좌표를 사용한다. Task 2 이후에는 near 노드들이 world 좌표와 다른 disp 좌표를 가지므로, zoom-to-fit 계산도 disp 좌표 기준으로 바꾸어야 한다. 또한 하단 네비바(80px)를 보정하여 포커스 노드가 시각적 중앙에 오도록 한다.

### 기존 worldScale useEffect 교체

기존 `[worldScale, focusedId, width, height]` useEffect를 다음으로 교체한다:

```js
// worldScale 또는 size 변경 → 카메라 target 재계산
useEffect(() => {
  wsRef.current = worldScale ?? 1;
  // worldScale 변경 시 dispRef tgt도 갱신 (우선 world 좌표로 리셋)
  const ws = worldScale ?? 1;
  const disp = dispRef.current;
  for (const n of nodesRef.current) {
    if (n.x == null) continue;
    const entry = disp.get(n.id);
    if (entry) {
      entry.tgtX = n.x * ws;
      entry.tgtY = n.y * ws;
    } else {
      disp.set(n.id, { dispX: n.x * ws, dispY: n.y * ws, tgtX: n.x * ws, tgtY: n.y * ws });
    }
  }
  // focusedId가 있으면 radial 레이아웃 복원 (worldScale 변경으로 붕괴 방지)
  if (focusedIdRef.current) {
    applyFocusTargets(focusedIdRef.current, ws, nodeMapRef.current, dispRef, nearRef, nodesRef);
  }
  dirtyRef.current = true;
}, [worldScale]);

// 포커스 + size → 카메라 pan/zoom target
useEffect(() => {
  const ws = wsRef.current;
  const node = nodeMapRef.current.get(focusedIdRef.current);
  if (!node?.x != null && node?.x == null) return;
  if (!node) return;

  const W = canvasRef.current?.width  ?? width;
  const H = canvasRef.current?.height ?? height;

  // 하단 네비바 보정: 시각적 중앙이 화면 중앙보다 NAV_BAR_H/2 위에 위치
  const visualCenterOffsetY = NAV_BAR_H / 2;

  // 카메라 pan: focusNode를 시각적 중앙으로
  tgtRef.current.x = -node.x * ws;

  // zoom-to-fit: near 노드들의 disp tgt 기준으로 scale 계산
  const near = nearRef.current;
  const disp = dispRef.current;
  const nearEntries = [...near]
    .map(id => disp.get(id))
    .filter(Boolean);

  const focusDisp = disp.get(node.id);
  const fx = focusDisp?.tgtX ?? node.x * ws;
  const fy = focusDisp?.tgtY ?? node.y * ws;

  if (nearEntries.length > 0) {
    // near 노드와 focusNode 간 disp 거리의 최대값
    const maxDX = Math.max(...nearEntries.map(e => Math.abs(e.tgtX - fx)), 1);
    const maxDY = Math.max(...nearEntries.map(e => Math.abs(e.tgtY - fy)), 1);
    // 화면의 38% 이내에 near가 들어오도록 (하단 네비 보정으로 유효 영역 축소)
    const fitX = (W * 0.38) / maxDX;
    const fitY = ((H - NAV_BAR_H) * 0.38) / maxDY;
    tgtRef.current.scale = Math.min(fitX, fitY, MAX_SCALE * 0.7);
  } else {
    tgtRef.current.scale = 2.5;
  }

  // pan의 y 보정을 실제 scale 기준으로 재계산
  tgtRef.current.y = -node.y * ws + visualCenterOffsetY / tgtRef.current.scale;

  dirtyRef.current = true;
}, [focusedId, width, height]);
```

### 검증

```bash
npx playwright screenshot --browser=chromium --viewport-size=390,844 http://localhost:3002 /tmp/task3-zoom.png
# 포커스 노드가 화면 하단 네비바 위 시각적 중앙에 위치하는지 육안 확인
```

### 커밋

```bash
git add services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx
git commit -m "fix: 카메라 zoom-to-fit을 disp 좌표 기준으로 변경 + 하단 네비바 보정"
```

---

## Task 4: 렌더링 수정 — dispX/dispY 전면 적용 및 hit test 수정

**파일:** `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx`

### 배경

Task 1에서 dispRef를 도입했지만 렌더링의 모든 `n.x * ws` 참조를 교체해야 한다. 또한 hit test도 disp 좌표 기준으로 수정해야 터치/클릭이 정확히 동작한다.

### 렌더링 함수 전체 수정

render 함수 내에서 엣지와 노드를 그리기 전, disp map을 지역 변수로 캐싱한다:

```js
const disp = dispRef.current;
```

엣지 그리기 루프:

```js
for (const e of es) {
  const src  = nodeMapRef.current.get(e.source);
  const tgt2 = nodeMapRef.current.get(e.target);
  if (!src || !tgt2) continue;
  const srcD  = disp.get(e.source);
  const tgt2D = disp.get(e.target);
  if (!srcD || !tgt2D) continue;

  const lodA = getLod(e.source, fid, near, mid);
  const lodB = getLod(e.target, fid, near, mid);
  const lod  = Math.min(lodA, lodB);

  if (lod === LOD_FAR) continue;

  ctx.globalAlpha = lod === LOD_FOCUS ? 0.65 : lod === LOD_NEAR ? 0.40 : 0.12;
  ctx.strokeStyle = e.edge_type === 'directory' ? '#8b5cf6' : '#6366f1';
  ctx.lineWidth   = (lod <= LOD_NEAR ? 1.0 : 0.5) / s;
  if (e.edge_type === 'wikilink') ctx.setLineDash([3 / s, 5 / s]);
  else ctx.setLineDash([]);

  ctx.beginPath();
  ctx.moveTo(srcD.dispX, srcD.dispY);
  ctx.lineTo(tgt2D.dispX, tgt2D.dispY);
  ctx.stroke();
}
```

노드 그리기 루프:

```js
for (const n of ns) {
  if (n.x == null) continue;
  const nd = disp.get(n.id);
  if (!nd) continue;
  const lod = getLod(n.id, fid, near, mid);
  const x = nd.dispX;
  const y = nd.dispY;
  // 이하 기존 코드 동일 (r, isDir, glow, 원, 아이콘, 라벨)
}
```

### hit test 수정

현재 hit test는 `(ex - W/2) / s - px` 로 screen → world 변환 후 `n.x`/`n.y` 와 비교한다. dispX/dispY 사용 후에는 disp 좌표와 비교해야 한다.

카메라 변환은 `translate(W/2, H/2) → scale(s,s) → translate(px, py)` 이므로 screen 좌표 `(ex, ey)` → disp 좌표 변환은:

```
dispX = (ex - W/2) / s - px
dispY = (ey - H/2) / s - py
```

hitTest 함수를 다음으로 교체한다:

```js
const hitTest = useCallback((ex, ey) => {
  const W  = canvasRef.current?.width  ?? 0;
  const H  = canvasRef.current?.height ?? 0;
  const s  = camRef.current.scale;
  const px = camRef.current.x;
  const py = camRef.current.y;

  // screen → disp 좌표 (= dispX/dispY 와 같은 공간)
  const hitDispX = (ex - W / 2) / s - px;
  const hitDispY = (ey - H / 2) / s - py;

  const fid  = focusedIdRef.current;
  const near = nearRef.current;
  const mid  = midRef.current;
  const disp = dispRef.current;

  let best = null, bestD2 = Infinity;
  for (const n of nodesRef.current) {
    if (n.x == null) continue;
    const nd = disp.get(n.id);
    if (!nd) continue;
    const lod = getLod(n.id, fid, near, mid);
    // hit 반지름: 화면 픽셀 기준 (R[lod] + 6) / s
    const hitR = (R[lod] + 6) / s;
    const d2 = (nd.dispX - hitDispX) ** 2 + (nd.dispY - hitDispY) ** 2;
    if (d2 < hitR ** 2 && d2 < bestD2) { bestD2 = d2; best = n; }
  }
  return best;
}, []);
```

### 검증

```bash
npx playwright screenshot --browser=chromium --viewport-size=390,844 http://localhost:3002 /tmp/task4-render.png
# 엣지가 노드 중심에서 출발/도착하는지 확인
# 노드 탭 시 올바른 노드가 선택되는지 확인
```

### 커밋

```bash
git add services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx
git commit -m "fix: 렌더링 및 hit test를 dispX/dispY 좌표 기준으로 전면 교체"
```

---

## Task 5: 시각 품질 개선 — LOD_FAR dim, 포커스 glow, 레이블 위치

**파일:** `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx`

### 배경

배경 노드(LOD_FAR)가 너무 밝아 포커스 영역 집중을 방해한다. 포커스 노드 glow가 약하다. 레이블이 노드와 겹친다.

### 변경 내용

**1) LOD_FAR 노드 극도로 dim**

```js
if (lod === LOD_FAR) {
  ctx.globalAlpha = 0.08;  // 기존 0.30 → 0.08
  ctx.fillStyle   = isDir ? '#7c3aed' : '#3b82f6';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  continue;
}
```

**2) LOD_MID 노드 alpha 조정**

```js
ctx.globalAlpha = lod === LOD_FOCUS ? 1.0 : lod === LOD_NEAR ? 0.85 : 0.35; // LOD_MID 0.60 → 0.35
```

**3) 포커스 노드 glow 강화**

```js
if (lod === LOD_FOCUS) {
  // 외부 대형 glow
  const glow = ctx.createRadialGradient(x, y, 0, x, y, r * 5.0 / s);
  glow.addColorStop(0, 'rgba(167,139,250,0.30)');
  glow.addColorStop(0.5, 'rgba(167,139,250,0.10)');
  glow.addColorStop(1, 'rgba(167,139,250,0)');
  ctx.globalAlpha = 1;
  ctx.fillStyle   = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 5.0 / s, 0, Math.PI * 2);
  ctx.fill();
  // 내부 ring glow
  const ring = ctx.createRadialGradient(x, y, r * 0.8 / s, x, y, r * 1.6 / s);
  ring.addColorStop(0, 'rgba(196,181,253,0.0)');
  ring.addColorStop(0.5, 'rgba(196,181,253,0.35)');
  ring.addColorStop(1, 'rgba(196,181,253,0.0)');
  ctx.fillStyle = ring;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.6 / s, 0, Math.PI * 2);
  ctx.fill();
}
```

**4) 레이블 위치 — 노드 아래 충분한 간격 확보**

```js
if (lod <= LOD_NEAR) {
  const title = n.title ?? n.id ?? '';
  const label = title.length > 22 ? title.slice(0, 21) + '…' : title;
  const fontSize = (lod === LOD_FOCUS ? 13 : 10) / s;
  // 레이블을 노드 원 바깥 + 아이콘 크기 고려하여 충분히 아래에 배치
  const labelOffsetY = (r + (lod === LOD_FOCUS ? 18 : 14)) / s;
  ctx.font         = `${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.fillStyle    = lod === LOD_FOCUS
    ? (isDir ? '#ede9fe' : '#dbeafe')
    : isDir ? '#c4b5fd' : '#93c5fd';
  ctx.textAlign    = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.globalAlpha  = lod === LOD_FOCUS ? 0.95 : 0.80;
  ctx.fillText(label, x, y + labelOffsetY);
}
```

**5) LOD_FAR 엣지 완전 숨김 (이미 skip 처리되어 있으나 명시적으로 주석 추가)**

```js
// LOD_FAR 엣지는 그리지 않음 — 배경 노이즈 최소화
if (lod === LOD_FAR) continue;
```

### 검증

```bash
npx playwright screenshot --browser=chromium --viewport-size=390,844 http://localhost:3002 /tmp/task5-visual.png
# 포커스 노드 glow가 명확히 보이는지
# 배경 노드들이 거의 안 보이는지
# 레이블이 노드와 겹치지 않는지
```

### 커밋

```bash
git add services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx
git commit -m "feat: 그래프 시각 품질 개선 - LOD_FAR dim, 포커스 glow 강화, 레이블 간격 조정"
```

---

## 전체 완료 후 배포

```bash
# 린트 먼저 확인
cd services/web-editor/frontend && npm run lint

# 문제 없으면 배포
bash /home/ubuntu/project/SynapseNote/deploy/deploy.sh web
```

---

## 상수 요약

| 상수 | 값 | 설명 |
|---|---|---|
| `DISP_LERP` | `0.09` | 노드 표시 좌표 LERP 속도 |
| `CAM_LERP` | `0.10` | 카메라 LERP 속도 |
| `NAV_BAR_H` | `80` | 하단 네비 바 높이 (px) |
| `NEAR_DIST_PX` | `130` | 포커스-이웃 목표 거리 (390px 뷰포트 기준) |
| `REPULSE_ITER` | `6` | 반발력 반복 횟수 |
| `REPULSE_MIN_PX` | `56` | 노드 간 최소 거리 (px) |
| `REPULSE_STRENGTH` | `0.45` | 반발력 강도 |

---

## 주의사항

1. Task 2의 `computeNearTargets` 반환값은 focusNode world 좌표 기준 offset이다. tgt를 설정할 때 반드시 `focusNode.x * ws + offset.offsetX` 형태로 더해야 한다.
2. `dispRef` 초기화는 `nodes` useEffect에서 처리하며, worldScale 변경 시에는 tgt만 갱신한다 (disp는 LERP로 수렴).
3. 포커스 변경 시 mid/far 노드의 tgt는 world 좌표로 복원하여 이전 포커스 시 변경된 위치가 원위치로 돌아오도록 한다.
4. 모든 크기 수치(NEAR_DIST_PX, REPULSE_MIN_PX 등)는 390px 뷰포트 기준이다. 데스크탑에서는 더 크게 보일 수 있으나 기능적으로 문제없음.
5. hit test의 hitR은 `/ws` 제거 후 `/s` 만 나누는 것이 맞다. dispX/dispY는 이미 `n.x * ws` 스케일이 적용된 좌표이므로 ws 나눗셈 불필요.
