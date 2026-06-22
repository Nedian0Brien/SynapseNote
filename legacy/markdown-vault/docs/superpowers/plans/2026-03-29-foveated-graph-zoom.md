# Foveated Graph Zoom-to-Fit 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 노드를 클릭하면 카메라가 해당 노드와 직접 이웃(LOD_NEAR)이 화면을 채우도록 자동 줌인/줌아웃하며 LERP 애니메이션으로 이동

**Architecture:** GraphCanvas.jsx의 `[worldScale, focusedId]` useEffect에서 카메라 scale target을 고정값 대신 zoom-to-fit 공식으로 계산한다. focusedId의 LOD_NEAR 이웃들의 최대 좌표 거리를 구한 뒤, 화면 크기의 40%를 그 거리로 나눠 scale을 결정한다.

**Tech Stack:** React (JSX), Canvas 2D API, requestAnimationFrame LERP 카메라

---

## 핵심 버그 분석

`GraphCanvas.jsx:88`
```js
// 현재 (잘못됨): 현재 scale 이상으로 절대 줄지 않고, 1.0 이하로 줌인도 안 됨
tgtRef.current.scale = Math.max(camRef.current.scale, 0.9);
```

**원하는 동작:**
- 노드 클릭 → 포커스 노드 + 직접 이웃이 화면을 채우도록 scale 자동 계산
- LOD_NEAR 이웃이 없으면(leaf 노드) scale = 2.5
- 항상 LERP로 부드럽게 이동

**올바른 공식:**
```js
// focusedNode와 LOD_NEAR 이웃들 사이의 최대 거리(world 좌표)를 구하고
// 화면의 40%를 그 거리로 채우는 scale을 계산
const nearNodes = [...nearRef.current]
  .map(id => nodeMapRef.current.get(id))
  .filter(n => n?.x != null);

const ws = worldScale ?? 1;
const W = canvasRef.current?.width ?? width;
const H = canvasRef.current?.height ?? height;

if (nearNodes.length > 0) {
  // 포커스 노드 기준, 이웃들의 최대 X/Y 거리 (canvas 픽셀 기준)
  const maxDX = Math.max(...nearNodes.map(n => Math.abs((n.x - node.x) * ws)), 1);
  const maxDY = Math.max(...nearNodes.map(n => Math.abs((n.y - node.y) * ws)), 1);
  // 화면의 40%를 그 거리로 채우는 scale
  const fitX = (W * 0.40) / maxDX;
  const fitY = (H * 0.40) / maxDY;
  tgtRef.current.scale = Math.min(fitX, fitY, MAX_SCALE * 0.7);
} else {
  // leaf 노드: 고정 배율
  tgtRef.current.scale = 2.5;
}
```

**왜 이 공식인가:**
- `n.x * ws`가 canvas 픽셀 좌표 (worldScale 적용 후)
- 카메라 transform: `translate(W/2,H/2) → scale(s,s) → translate(panX,panY)` → 화면에서 두 노드 사이 픽셀 거리 = `|delta_world_pixel| * s`
- 화면 40%를 채우려면: `maxD * s = W*0.40` → `s = W*0.40 / maxD`

---

## 파일 구조

변경 파일 **1개뿐**:
- **Modify:** `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx:81-91`
  - `[worldScale, focusedId]` useEffect 내부의 scale 계산 로직 교체

추가/생성 파일 없음.

---

## Task 1: zoom-to-fit scale 계산 로직 교체

**Files:**
- Modify: `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx:81-91`

### 변경 전 (현재 코드, 81-91줄)
```js
useEffect(() => {
  wsRef.current = worldScale ?? 1;
  const node = nodeMapRef.current.get(focusedIdRef.current);
  if (node?.x != null) {
    const ws = worldScale ?? 1;
    tgtRef.current.x = -node.x * ws;
    tgtRef.current.y = -node.y * ws;
    tgtRef.current.scale = Math.max(camRef.current.scale, 0.9);  // ← 버그
  }
  dirtyRef.current = true;
}, [worldScale, focusedId]);
```

### 변경 후
```js
useEffect(() => {
  wsRef.current = worldScale ?? 1;
  const node = nodeMapRef.current.get(focusedIdRef.current);
  if (node?.x != null) {
    const ws = worldScale ?? 1;
    tgtRef.current.x = -node.x * ws;
    tgtRef.current.y = -node.y * ws;

    // zoom-to-fit: LOD_NEAR 이웃들이 화면을 채우도록 scale 계산
    const nearNodes = [...nearRef.current]
      .map(id => nodeMapRef.current.get(id))
      .filter(n => n?.x != null);
    const W = canvasRef.current?.width ?? width;
    const H = canvasRef.current?.height ?? height;

    if (nearNodes.length > 0) {
      const maxDX = Math.max(...nearNodes.map(n => Math.abs((n.x - node.x) * ws)), 1);
      const maxDY = Math.max(...nearNodes.map(n => Math.abs((n.y - node.y) * ws)), 1);
      const fitX = (W * 0.40) / maxDX;
      const fitY = (H * 0.40) / maxDY;
      tgtRef.current.scale = Math.min(fitX, fitY, MAX_SCALE * 0.7);
    } else {
      tgtRef.current.scale = 2.5;
    }
  }
  dirtyRef.current = true;
}, [worldScale, focusedId, width, height]);
```

**주의:** `width`, `height` props를 deps에 추가해야 캔버스 크기 변경 시 재계산됨.

- [ ] **Step 1: GraphCanvas.jsx 81-91줄 수정**

  `services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx` 파일을 열어 위 변경 후 코드로 교체.

- [ ] **Step 2: 로컬 빌드 확인 (lint)**

  ```bash
  cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend
  npm run lint 2>&1 | head -50
  ```
  Expected: lint 에러 없음 (warnings 허용)

- [ ] **Step 3: 브라우저 수동 확인 (배포 전)**

  ```bash
  bash /home/ubuntu/project/SynapseNote/deploy/deploy.sh web
  ```
  그리고 http://localhost:3002/graph 접속하여:
  1. 초기 로드: vault root "." 노드가 화면 중앙에 보이고 자식 노드들이 주변에 분포
  2. Directory 노드 클릭: 카메라가 LERP로 해당 노드로 이동, 그 자식/이웃들이 화면을 채움
  3. Document 노드 클릭: 에디터로 이동 (onOpenNode 호출)
  4. 모바일 뷰포트(390px): 동일하게 동작

- [ ] **Step 4: Playwright로 검증**

  ```bash
  cd /home/ubuntu/project/SynapseNote
  npx playwright test --headed 2>&1 | head -30
  ```
  또는 수동으로 playwright 브라우저 열어서 확인:
  ```bash
  node -e "
  const { chromium } = require('playwright');
  (async () => {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('http://localhost:3002/graph');
    await page.waitForTimeout(3000);
    // 스크린샷 저장
    await page.screenshot({ path: '/tmp/graph-before-click.png' });
    // canvas 중앙 클릭
    const canvas = await page.locator('canvas');
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: box.width/2, y: box.height/2 } });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: '/tmp/graph-after-click.png' });
    console.log('Screenshots saved to /tmp/');
    await browser.close();
  })();
  "
  ```

- [ ] **Step 5: 검증 기준 확인**

  `/tmp/graph-after-click.png` 확인:
  - 클릭한 노드와 그 이웃들이 화면 중앙에 크게 보임
  - 전체 그래프가 아주 작게 배경에 점들로 보임
  - 포커스 노드에 glow 효과 표시

- [ ] **Step 6: 커밋**

  ```bash
  cd /home/ubuntu/project/SynapseNote
  git add services/web-editor/frontend/src/components/graph2/GraphCanvas.jsx
  git commit -m "fix: 포비에이티드 그래프 zoom-to-fit 구현 — 노드 클릭 시 이웃이 화면 채우도록 scale 자동 계산"
  ```

---

## 예상 결과

| 상태 | 기대 동작 |
|------|----------|
| 초기 로드 | vault(.) 중심, 자식들 주변 배치, scale ~1.0 (전체 그래프 조망) |
| Directory 클릭 | 해당 dir + 직접 자식들이 화면 40% 채움, LERP로 이동 |
| Leaf Document 클릭 | scale 2.5로 줌인, 에디터로 이동 |
| 모바일 390px | 동일 동작, scale은 W/H 기준 재계산 |

---

## 위험 요소

1. **nearRef.current 시점 문제**: `[worldScale, focusedId]` effect가 LOD effect보다 늦게 실행될 수 있음.
   - **현재 코드 상태**: LOD effect(`[focusedId]`)와 zoom effect(`[worldScale, focusedId]`)가 별개 — React는 동일 render 내 effects를 선언 순서대로 실행하므로, LOD effect가 먼저 실행되어 nearRef가 준비된 상태에서 zoom effect가 실행됨. **안전함.**

2. **nearNodes가 비어있지만 leaf가 아닌 경우**: vault root "."는 이웃이 많으므로 문제없음. Directory 노드도 자식이 있어야 Directory로 인덱싱됨.

3. **매우 큰 maxDX/maxDY**: 이웃이 멀리 있을 경우 scale이 매우 작아질 수 있음. `Math.min(..., MAX_SCALE * 0.7)` 상한은 있지만 하한이 없음. 필요시 `Math.max(fitScale, MIN_SCALE)` 추가 가능 — 그러나 현재 MIN_SCALE=0.08은 충분히 작아 실용적으로 문제 없을 것.
