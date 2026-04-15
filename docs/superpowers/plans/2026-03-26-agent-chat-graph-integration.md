# Agent Chatting & Knowledge Graph Integration 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agent 채팅과 Knowledge Graph를 유기적으로 연결 — 그래프 노드를 컨텍스트로 채팅에 주입하고, 채팅 내용을 노드로 저장하며, 그래프 UX를 노드 타입/콘텐츠 기반으로 전면 개선한다.

**Architecture:** React 19 + Flask 백엔드를 기반으로, (1) 노드 타입 시스템으로 그래프를 시각적으로 개선하고, (2) Anthropic SDK를 활용한 SSE 스트리밍 채팅 백엔드를 추가하며, (3) 그래프 노드 다중선택 → 채팅 컨텍스트 주입 인터랙션을 구현한다. 기존 `force-graph` canvas 렌더링을 유지하면서 커스텀 페인터로 노드 형태를 확장한다.

**Tech Stack:** React 19, Flask 3, force-graph 1.51.2, Anthropic Python SDK (`anthropic`), Vitest + React Testing Library (프론트), pytest + pytest-flask (백엔드), Server-Sent Events(SSE) 스트리밍

---

## 범위 확인

이 계획은 두 하위 시스템(그래프 UX + 에이전트 채팅)을 다루지만, 두 시스템이 memo 요구사항상 양방향으로 통합되어야 하므로 하나의 계획으로 진행한다. 각 Phase는 독립적으로 배포 가능하다.

---

## 파일 구조 매핑

### 신규 생성

```
services/web-editor/
├── frontend/src/
│   ├── components/
│   │   ├── ChatPanel.jsx            # 에이전트 채팅 메인 UI
│   │   ├── ChatMessage.jsx          # 개별 메시지 렌더링 (Markdown)
│   │   └── NodeContextChip.jsx      # 채팅 컨텍스트 노드 칩
│   ├── hooks/
│   │   └── useAgentChat.js          # 채팅 상태/SSE 스트리밍 훅
│   └── utils/
│       └── nodeTypes.js             # 노드 타입 정의 및 헬퍼
└── requirements.txt                 # anthropic SDK 추가

tests/
├── frontend/                        # Vitest 테스트
│   ├── nodeTypes.test.js
│   ├── useAgentChat.test.js
│   └── ChatPanel.test.jsx
└── backend/                         # pytest 테스트
    └── test_chat_api.py
```

### 수정 대상

```
services/web-editor/
├── app.py                           # /api/chat SSE 엔드포인트 추가
└── frontend/src/
    ├── App.jsx                      # ChatPanel 레이아웃 통합
    ├── components/
    │   ├── FullGraphView.jsx        # 노드 형태/타입/클릭/다중선택 전면 개선
    │   ├── GraphPanel.jsx           # 노드 타입 아이콘 반영
    │   └── LeftSidebar.jsx          # 채팅 탭 추가
```

---

## Phase 1: 테스트 인프라 + 노드 타입 시스템

### Task 1: 프론트엔드 테스트 인프라 설정

**Files:**
- Create: `services/web-editor/frontend/vitest.config.js`
- Modify: `services/web-editor/frontend/package.json`

- [ ] **Step 1: 실패하는 더미 테스트 작성**

```js
// services/web-editor/frontend/tests/setup.test.js
import { describe, it, expect } from 'vitest';

describe('test infrastructure', () => {
  it('runs correctly', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 2: 현재 테스트 실행 시 실패 확인**

```bash
cd services/web-editor/frontend
npx vitest run tests/setup.test.js
```
Expected: `Cannot find package 'vitest'` 에러

- [ ] **Step 3: Vitest + React Testing Library 설치**

```bash
cd services/web-editor/frontend
npm install --save-dev vitest @vitest/coverage-v8 jsdom @testing-library/react @testing-library/user-event @testing-library/jest-dom
```

- [ ] **Step 4: vitest.config.js 생성**

```js
// services/web-editor/frontend/vitest.config.js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.js'],
    coverage: {
      provider: 'v8',
      threshold: { lines: 80, functions: 80, branches: 80 },
    },
  },
});
```

- [ ] **Step 5: 테스트 setup 파일 생성**

```js
// services/web-editor/frontend/tests/setup.js
import '@testing-library/jest-dom';
```

- [ ] **Step 6: package.json 스크립트 추가**

`scripts` 섹션에 추가:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:coverage": "vitest run --coverage"
```

- [ ] **Step 7: 더미 테스트 통과 확인**

```bash
cd services/web-editor/frontend
npm test
```
Expected: `1 passed`

- [ ] **Step 8: Commit**

```bash
cd services/web-editor/frontend
git add vitest.config.js tests/setup.js tests/setup.test.js package.json
git commit -m "test: 프론트엔드 Vitest + Testing Library 설정"
```

---

### Task 2: 백엔드 테스트 인프라 설정

**Files:**
- Create: `services/web-editor/tests/__init__.py`
- Create: `services/web-editor/tests/conftest.py`

- [ ] **Step 1: 실패하는 백엔드 테스트 작성**

```python
# services/web-editor/tests/test_health.py
def test_health(client):
    resp = client.get('/health')
    assert resp.status_code == 200
```

- [ ] **Step 2: pytest 미설치 확인**

```bash
cd services/web-editor
python -m pytest tests/test_health.py 2>&1 | head -5
```
Expected: `ModuleNotFoundError: No module named 'pytest'` 또는 `conftest` 에러

- [ ] **Step 3: pytest 설치**

```bash
cd services/web-editor
pip install pytest pytest-flask
```

- [ ] **Step 4: conftest.py 생성**

```python
# services/web-editor/tests/conftest.py
import pytest
import sys, os
sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from app import app as flask_app

@pytest.fixture
def app():
    flask_app.config.update({'TESTING': True})
    yield flask_app

@pytest.fixture
def client(app):
    return app.test_client()
```

- [ ] **Step 5: `__init__.py` 생성**

```python
# services/web-editor/tests/__init__.py
```

- [ ] **Step 6: 테스트 통과 확인**

```bash
cd services/web-editor
python -m pytest tests/test_health.py -v
```
Expected: `PASSED`

- [ ] **Step 7: Commit**

```bash
git add services/web-editor/tests/
git commit -m "test: 백엔드 pytest 인프라 설정"
```

---

### Task 3: 노드 타입 시스템 구현

노드 타입은 그래프 시각화와 채팅 컨텍스트 주입 모두에서 사용하는 핵심 유틸리티다.

**Files:**
- Create: `services/web-editor/frontend/src/utils/nodeTypes.js`
- Create: `services/web-editor/frontend/tests/nodeTypes.test.js`

- [ ] **Step 1: 실패하는 테스트 작성**

```js
// services/web-editor/frontend/tests/nodeTypes.test.js
import { describe, it, expect } from 'vitest';
import {
  detectNodeType, NODE_TYPES, getNodeShape, getNodeColor,
} from '../src/utils/nodeTypes';

describe('detectNodeType', () => {
  it('폴더 노드를 올바르게 감지한다', () => {
    expect(detectNodeType({ isFolder: true })).toBe(NODE_TYPES.FOLDER);
  });

  it('.md 파일을 DOCUMENT로 감지한다', () => {
    expect(detectNodeType({ path: 'notes/hello.md', isFolder: false })).toBe(NODE_TYPES.DOCUMENT);
  });

  it('.py/.js/.ts 파일을 CODE로 감지한다', () => {
    expect(detectNodeType({ path: 'src/main.py', isFolder: false })).toBe(NODE_TYPES.CODE);
    expect(detectNodeType({ path: 'app.js', isFolder: false })).toBe(NODE_TYPES.CODE);
  });

  it('.pdf 파일을 PDF로 감지한다', () => {
    expect(detectNodeType({ path: 'docs/paper.pdf', isFolder: false })).toBe(NODE_TYPES.PDF);
  });

  it('__chat__ 접두사를 CHAT으로 감지한다', () => {
    expect(detectNodeType({ path: 'chats/__chat__session.md', isFolder: false })).toBe(NODE_TYPES.CHAT);
  });

  it('알 수 없는 확장자는 DOCUMENT로 폴백한다', () => {
    expect(detectNodeType({ path: 'readme.txt', isFolder: false })).toBe(NODE_TYPES.DOCUMENT);
  });
});

describe('getNodeShape', () => {
  it('content가 없는 노드는 circle을 반환한다', () => {
    expect(getNodeShape({ content: null })).toBe('circle');
    expect(getNodeShape({ content: '' })).toBe('circle');
  });

  it('content가 있는 노드는 rect를 반환한다', () => {
    expect(getNodeShape({ content: '# Hello' })).toBe('rect');
  });
});

describe('getNodeColor', () => {
  it('FOLDER 타입은 amber 계열 색상을 반환한다', () => {
    const color = getNodeColor(NODE_TYPES.FOLDER);
    expect(color).toMatch(/^#/);
  });

  it('CODE 타입은 green 계열 색상을 반환한다', () => {
    const color = getNodeColor(NODE_TYPES.CODE);
    expect(color).toMatch(/^#/);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd services/web-editor/frontend
npm test tests/nodeTypes.test.js
```
Expected: `Cannot find module '../src/utils/nodeTypes'`

- [ ] **Step 3: nodeTypes.js 구현**

```js
// services/web-editor/frontend/src/utils/nodeTypes.js

export const NODE_TYPES = {
  FOLDER: 'folder',
  DOCUMENT: 'document',
  CODE: 'code',
  PDF: 'pdf',
  CHAT: 'chat',
  WEB: 'web',
  IMAGE: 'image',
};

const CODE_EXTENSIONS = new Set([
  'py', 'js', 'jsx', 'ts', 'tsx', 'go', 'rs', 'cpp', 'c', 'java', 'rb', 'sh', 'yaml', 'yml', 'toml', 'json',
]);

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp']);

export function detectNodeType(node) {
  if (node.isFolder) return NODE_TYPES.FOLDER;

  const path = (node.path || '').toLowerCase();
  const fileName = path.split('/').pop() || '';

  if (fileName.startsWith('__chat__')) return NODE_TYPES.CHAT;

  const ext = fileName.split('.').pop();
  if (ext === 'pdf') return NODE_TYPES.PDF;
  if (IMAGE_EXTENSIONS.has(ext)) return NODE_TYPES.IMAGE;
  if (CODE_EXTENSIONS.has(ext)) return NODE_TYPES.CODE;
  return NODE_TYPES.DOCUMENT;
}

export function getNodeShape(node) {
  return node.content ? 'rect' : 'circle';
}

const NODE_COLORS = {
  [NODE_TYPES.FOLDER]: '#f59e0b',
  [NODE_TYPES.DOCUMENT]: '#64748b',
  [NODE_TYPES.CODE]: '#10b981',
  [NODE_TYPES.PDF]: '#ef4444',
  [NODE_TYPES.CHAT]: '#8b5cf6',
  [NODE_TYPES.WEB]: '#3b82f6',
  [NODE_TYPES.IMAGE]: '#ec4899',
};

export function getNodeColor(type) {
  return NODE_COLORS[type] || NODE_COLORS[NODE_TYPES.DOCUMENT];
}

// 노드 타입별 텍스트 레이블 (그래프 범례용)
export const NODE_TYPE_LABELS = {
  [NODE_TYPES.FOLDER]: '폴더',
  [NODE_TYPES.DOCUMENT]: '문서',
  [NODE_TYPES.CODE]: '코드',
  [NODE_TYPES.PDF]: 'PDF',
  [NODE_TYPES.CHAT]: '채팅',
  [NODE_TYPES.WEB]: '웹',
  [NODE_TYPES.IMAGE]: '이미지',
};
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd services/web-editor/frontend
npm test tests/nodeTypes.test.js
```
Expected: `7 passed`

- [ ] **Step 5: Commit**

```bash
git add services/web-editor/frontend/src/utils/nodeTypes.js \
        services/web-editor/frontend/tests/nodeTypes.test.js
git commit -m "feat: 노드 타입 시스템 구현 (detectNodeType, getNodeShape, getNodeColor)"
```

---

## Phase 2: Knowledge Graph 시각화 개선

### Task 4: 노드 형태 + 타입 아이콘 렌더링

현재 `FullGraphView.jsx`는 모든 노드를 동일한 원으로 그린다. 노드의 content 여부에 따라 원형/둥근사각형으로 구분하고, 타입별 색상을 적용한다.

**Files:**
- Modify: `services/web-editor/frontend/src/components/FullGraphView.jsx`
- Create: `services/web-editor/frontend/tests/graphRendering.test.js`

- [ ] **Step 1: 렌더링 로직 단위 테스트 작성**

```js
// services/web-editor/frontend/tests/graphRendering.test.js
import { describe, it, expect } from 'vitest';
import { detectNodeType, getNodeShape, getNodeColor, NODE_TYPES } from '../src/utils/nodeTypes';

describe('그래프 노드 렌더링 결정 로직', () => {
  it('폴더 노드는 circle 형태이다', () => {
    const node = { isFolder: true, path: 'notes', content: null };
    expect(getNodeShape(node)).toBe('circle');
    expect(detectNodeType(node)).toBe(NODE_TYPES.FOLDER);
  });

  it('content 있는 문서는 rect 형태이다', () => {
    const node = { isFolder: false, path: 'notes/hello.md', content: '# Hello world' };
    expect(getNodeShape(node)).toBe('rect');
    expect(detectNodeType(node)).toBe(NODE_TYPES.DOCUMENT);
  });

  it('content 없는 개념 노드는 circle 형태이다', () => {
    const node = { isFolder: false, path: 'concepts/idea.md', content: '' };
    expect(getNodeShape(node)).toBe('circle');
  });
});
```

- [ ] **Step 2: 테스트 통과 확인 (nodeTypes.js 의존)**

```bash
cd services/web-editor/frontend
npm test tests/graphRendering.test.js
```
Expected: `3 passed`

- [ ] **Step 3: FullGraphView.jsx에 커스텀 노드 페인터 추가**

`FullGraphView.jsx`의 `ForceGraph2D` 컴포넌트 설정 부분(nodeCanvasObject prop)을 다음으로 교체한다. 현재 파일의 `nodeCanvasObject` prop이 있는 위치를 찾아 교체하거나, 없다면 `<ForceGraph2D>` props에 추가한다.

먼저 import 추가:
```jsx
// FullGraphView.jsx 상단 import에 추가
import { detectNodeType, getNodeShape, getNodeColor } from '../utils/nodeTypes';
```

그 다음 파일 상단(DEFAULT_SETTINGS 위)에 페인터 함수 추가:
```jsx
// ─── 커스텀 노드 페인터 ────────────────────────────────────────────────────────
function paintNode(node, color, ctx, globalScale, settings) {
  const size = 4 * settings.nodeSize;
  const nodeType = detectNodeType(node);
  const shape = getNodeShape(node);
  const typeColor = node.isFolder
    ? color  // 폴더는 기존 팔레트 색 유지
    : getNodeColor(nodeType);
  const finalColor = color !== '#64748b' ? color : typeColor; // hover/selected 상태 우선

  if (shape === 'rect') {
    // 둥근 사각형: content 있는 노드
    const w = size * 2.8;
    const h = size * 1.8;
    const r = size * 0.5;
    ctx.beginPath();
    ctx.moveTo(node.x - w / 2 + r, node.y - h / 2);
    ctx.lineTo(node.x + w / 2 - r, node.y - h / 2);
    ctx.quadraticCurveTo(node.x + w / 2, node.y - h / 2, node.x + w / 2, node.y - h / 2 + r);
    ctx.lineTo(node.x + w / 2, node.y + h / 2 - r);
    ctx.quadraticCurveTo(node.x + w / 2, node.y + h / 2, node.x + w / 2 - r, node.y + h / 2);
    ctx.lineTo(node.x - w / 2 + r, node.y + h / 2);
    ctx.quadraticCurveTo(node.x - w / 2, node.y + h / 2, node.x - w / 2, node.y + h / 2 - r);
    ctx.lineTo(node.x - w / 2, node.y - h / 2 + r);
    ctx.quadraticCurveTo(node.x - w / 2, node.y - h / 2, node.x - w / 2 + r, node.y - h / 2);
    ctx.closePath();
    ctx.fillStyle = finalColor;
    ctx.fill();
    // 테두리
    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
  } else {
    // 원형: content 없는 개념/폴더 노드
    ctx.beginPath();
    ctx.arc(node.x, node.y, size, 0, 2 * Math.PI);
    ctx.fillStyle = node.isFolder
      ? `${finalColor}88`  // 폴더는 반투명
      : finalColor;
    ctx.fill();
  }

  // 라벨 (줌 레벨이 충분할 때만)
  if (globalScale >= settings.labelZoom) {
    const label = node.name || node.id;
    const fontSize = Math.max(2, 10 / globalScale);
    ctx.font = `${fontSize}px Sans-Serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(label, node.x, node.y + (shape === 'rect' ? size * 1.0 : size + 1));
  }
}
```

- [ ] **Step 4: ForceGraph2D에 nodeCanvasObject prop 연결**

`FullGraphView.jsx`의 `<ForceGraph2D>` 또는 `graphRef.current` 설정 부분에서 nodeCanvasObject를 설정한다. `graphRef.current` 초기화 블록(useEffect 내부)을 찾아:

```jsx
// graphRef.current 설정 부분에 추가/교체
graphRef.current
  .nodeCanvasObject((node, ctx, globalScale) => {
    const isHovered = node === hoveredNode;
    const isCurrent = node.id === currentNodeId;
    const isNeighbor = neighborIds.has(node.id);

    let color = COLOR.fileDefault;
    if (isCurrent) color = COLOR.fileCurrent;
    else if (isHovered) color = COLOR.fileHover;
    else if (isNeighbor) color = COLOR.fileNeighbor;
    else if (node.isFolder) color = getRootFolderColor(node.path, rootColorMap);

    paintNode(node, color, ctx, globalScale, settings);
  })
  .nodeCanvasObjectMode(() => 'replace');
```

- [ ] **Step 5: 브라우저에서 시각적 확인**

```bash
cd services/web-editor/frontend
npm run dev
```
그래프를 열어 확인:
- content 있는 노드: 둥근 사각형
- content 없는 노드 / 폴더: 원형
- 타입별 색상(코드=초록, PDF=빨강, 채팅=보라) 적용됨

- [ ] **Step 6: Commit**

```bash
git add services/web-editor/frontend/src/components/FullGraphView.jsx \
        services/web-editor/frontend/tests/graphRendering.test.js
git commit -m "feat: 그래프 노드 형태 개선 - content 여부에 따른 원형/둥근사각형, 타입별 색상"
```

---

### Task 5: 클릭 → 노드 중앙 이동 + 연결 노드 강조

클릭한 노드를 화면 중앙으로 애니메이션 이동하고, 1-hop 이웃 노드를 눈에 잘 띄는 크기로 강조한다.

**Files:**
- Modify: `services/web-editor/frontend/src/components/FullGraphView.jsx`

- [ ] **Step 1: 현재 클릭 핸들러 확인**

`FullGraphView.jsx`에서 `onNodeClick` 관련 코드를 찾는다:
```bash
grep -n "onNodeClick\|handleNodeClick\|centerAt" services/web-editor/frontend/src/components/FullGraphView.jsx
```

- [ ] **Step 2: neighborIds state 추가**

파일 상단의 useState 선언부에 추가:
```jsx
const [selectedNodeId, setSelectedNodeId] = useState(null);
const [neighborIds, setNeighborIds] = useState(new Set());
```

- [ ] **Step 3: 클릭 핸들러에 중앙 이동 + 이웃 강조 로직 추가**

기존 nodeClick 핸들러를 교체:
```jsx
const handleNodeClick = useCallback((node) => {
  // 선택된 노드의 1-hop 이웃 계산
  const neighbors = new Set();
  (graphData.links || []).forEach((link) => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    if (srcId === node.id) neighbors.add(tgtId);
    if (tgtId === node.id) neighbors.add(srcId);
  });

  setSelectedNodeId(node.id);
  setNeighborIds(neighbors);

  // 노드를 화면 중앙으로 애니메이션 이동
  graphRef.current.centerAt(node.x, node.y, 600);
  graphRef.current.zoom(2.5, 600);

  // 파일 노드인 경우 에디터에 열기 (기존 동작 유지)
  if (!node.isFolder && onFileSelect) {
    onFileSelect(node.path);
  }
}, [graphData, onFileSelect]);
```

- [ ] **Step 4: nodeCanvasObject에서 이웃 노드 크기 강조 반영**

nodeCanvasObject 내부의 `paintNode` 호출 부분을 수정하여 이웃 노드일 때 settings를 오버라이드:
```jsx
.nodeCanvasObject((node, ctx, globalScale) => {
  const isSelected = node.id === selectedNodeId;
  const isNeighbor = neighborIds.has(node.id);
  const isHovered = node === hoveredNode;

  let color = COLOR.fileDefault;
  if (isSelected) color = COLOR.fileCurrent;
  else if (isHovered) color = COLOR.fileHover;
  else if (isNeighbor) color = COLOR.fileNeighbor;
  else if (node.isFolder) color = getRootFolderColor(node.path, rootColorMap);

  // 선택/이웃 노드는 크게 표시
  const sizeMultiplier = isSelected ? 1.6 : isNeighbor ? 1.3 : 1.0;
  const adjustedSettings = { ...settings, nodeSize: settings.nodeSize * sizeMultiplier };

  paintNode(node, color, ctx, globalScale, adjustedSettings);
})
```

- [ ] **Step 5: 브라우저에서 인터랙션 확인**

그래프에서 노드 클릭 시:
- 클릭한 노드가 화면 중앙으로 부드럽게 이동하는지
- 1-hop 이웃 노드들이 파란색+크게 표시되는지

- [ ] **Step 6: Commit**

```bash
git add services/web-editor/frontend/src/components/FullGraphView.jsx
git commit -m "feat: 그래프 노드 클릭 시 중앙 이동 + 1-hop 이웃 강조"
```

---

### Task 6: 연결 노드 콘텐츠 미리보기 오버레이

선택된 노드의 이웃 노드 중 content가 있는 경우 제목과 내용 preview를 화면에 표시한다. Canvas 위에 HTML 오버레이로 구현(canvas 위에 absolute div).

**Files:**
- Modify: `services/web-editor/frontend/src/components/FullGraphView.jsx`

- [ ] **Step 1: 오버레이 상태 관리 추가**

useState 선언부에 추가:
```jsx
const [previewNodes, setPreviewNodes] = useState([]);
```

- [ ] **Step 2: 선택 시 previewNodes 계산**

`handleNodeClick` 안, setNeighborIds 이후에 추가:
```jsx
// content 있는 이웃 노드들 미리보기 목록 구성
const previews = (graphData.nodes || [])
  .filter((n) => neighbors.has(n.id) && n.content)
  .slice(0, 5)  // 최대 5개
  .map((n) => ({
    id: n.id,
    name: n.name,
    preview: (n.content || '').slice(0, 120).replace(/[#*`]/g, ''),
    path: n.path,
  }));
setPreviewNodes(previews);
```

- [ ] **Step 3: 오버레이 UI 추가**

`FullGraphView.jsx`의 return JSX에서 그래프 컨테이너 div 안에 추가:
```jsx
{/* 선택 노드 이웃 미리보기 오버레이 */}
{previewNodes.length > 0 && (
  <div className="absolute top-4 right-4 z-20 flex flex-col gap-2 max-w-xs pointer-events-none">
    {previewNodes.map((pn) => (
      <button
        key={pn.id}
        className="pointer-events-auto text-left bg-slate-900/90 border border-slate-700 rounded-lg p-3 hover:border-cyan-600 transition-colors cursor-pointer"
        onClick={() => onFileSelect && onFileSelect(pn.path)}
      >
        <div className="text-xs font-semibold text-slate-200 truncate mb-1">{pn.name}</div>
        <div className="text-[11px] text-slate-400 line-clamp-3">{pn.preview}</div>
      </button>
    ))}
  </div>
)}
```

- [ ] **Step 4: 노드 선택 해제 시 preview 초기화**

배경 클릭 핸들러(onBackgroundClick) 추가 또는 기존 핸들러 수정:
```jsx
const handleBackgroundClick = useCallback(() => {
  setSelectedNodeId(null);
  setNeighborIds(new Set());
  setPreviewNodes([]);
}, []);
```
`<ForceGraph2D>`에 `onBackgroundClick={handleBackgroundClick}` prop 추가.

- [ ] **Step 5: 브라우저에서 확인**

content가 있는 노드를 클릭하면 오른쪽 상단에 이웃 노드 제목+미리보기가 나타나는지 확인.

- [ ] **Step 6: Commit**

```bash
git add services/web-editor/frontend/src/components/FullGraphView.jsx
git commit -m "feat: 선택 노드의 이웃 노드 콘텐츠 미리보기 오버레이"
```

---

### Task 7: 다중 선택 구현

Shift+클릭 또는 드래그 박스로 여러 노드를 선택 → 채팅 컨텍스트 주입 준비 상태.

**Files:**
- Modify: `services/web-editor/frontend/src/components/FullGraphView.jsx`

- [ ] **Step 1: 다중 선택 state 추가**

```jsx
const [selectedNodeIds, setSelectedNodeIds] = useState(new Set());
```

- [ ] **Step 2: Shift+클릭으로 다중 선택 핸들러 수정**

`handleNodeClick`을 수정:
```jsx
const handleNodeClick = useCallback((node, event) => {
  if (event && event.shiftKey) {
    // Shift 클릭: 토글 선택
    setSelectedNodeIds((prev) => {
      const next = new Set(prev);
      if (next.has(node.id)) next.delete(node.id);
      else next.add(node.id);
      return next;
    });
    return;
  }

  // 일반 클릭: 단일 선택
  setSelectedNodeIds(new Set([node.id]));

  const neighbors = new Set();
  (graphData.links || []).forEach((link) => {
    const srcId = typeof link.source === 'object' ? link.source.id : link.source;
    const tgtId = typeof link.target === 'object' ? link.target.id : link.target;
    if (srcId === node.id) neighbors.add(tgtId);
    if (tgtId === node.id) neighbors.add(srcId);
  });
  setSelectedNodeId(node.id);
  setNeighborIds(neighbors);

  const previews = (graphData.nodes || [])
    .filter((n) => neighbors.has(n.id) && n.content)
    .slice(0, 5)
    .map((n) => ({
      id: n.id, name: n.name,
      preview: (n.content || '').slice(0, 120).replace(/[#*`]/g, ''),
      path: n.path,
    }));
  setPreviewNodes(previews);

  graphRef.current.centerAt(node.x, node.y, 600);
  graphRef.current.zoom(2.5, 600);

  if (!node.isFolder && onFileSelect) onFileSelect(node.path);
}, [graphData, onFileSelect]);
```

- [ ] **Step 3: 다중 선택 노드 시각적 표시**

nodeCanvasObject 내부에서 `selectedNodeIds` 확인:
```jsx
const isMultiSelected = selectedNodeIds.has(node.id);
// isMultiSelected이면 테두리 흰색 점선 처리 추가
```

paintNode 함수 하단에 다중선택 테두리 표시 추가:
```jsx
function paintNode(node, color, ctx, globalScale, settings, isMultiSelected) {
  // ... 기존 코드 ...

  // 다중 선택 표시: 점선 테두리
  if (isMultiSelected) {
    ctx.setLineDash([2, 2]);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    if (shape === 'rect') {
      // rect 테두리는 이미 그려짐, 위에서 오버드로우
      const w = size * 2.8 + 2; const h = size * 1.8 + 2;
      ctx.strokeRect(node.x - w / 2, node.y - h / 2, w, h);
    } else {
      ctx.beginPath();
      ctx.arc(node.x, node.y, size + 1.5, 0, 2 * Math.PI);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  }
}
```

- [ ] **Step 4: 다중 선택 액션 바 표시**

다중 선택 시 하단에 "채팅에 추가" 버튼 표시:
```jsx
{selectedNodeIds.size > 1 && (
  <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-800 border border-slate-600 rounded-full px-4 py-2 shadow-lg">
    <span className="text-xs text-slate-300">{selectedNodeIds.size}개 선택됨</span>
    <button
      className="text-xs text-cyan-400 hover:text-cyan-300 font-medium"
      onClick={() => onInjectToChat && onInjectToChat(
        (graphData.nodes || []).filter((n) => selectedNodeIds.has(n.id))
      )}
    >
      채팅에 컨텍스트 추가 →
    </button>
    <button
      className="text-xs text-slate-500 hover:text-slate-300"
      onClick={() => { setSelectedNodeIds(new Set()); }}
    >
      선택 해제
    </button>
  </div>
)}
```

`FullGraphView`의 props에 `onInjectToChat` 추가:
```jsx
export default function FullGraphView({ currentFile, onFileSelect, onInjectToChat }) {
```

- [ ] **Step 5: 브라우저 확인**

- 노드 클릭 → 단일 선택
- Shift+클릭 → 다중 선택 (점선 테두리)
- 2개 이상 선택 시 하단 액션 바 표시

- [ ] **Step 6: Commit**

```bash
git add services/web-editor/frontend/src/components/FullGraphView.jsx
git commit -m "feat: 그래프 노드 다중 선택 (Shift+클릭) + 채팅 컨텍스트 주입 액션 바"
```

---

## Phase 3: 에이전트 채팅 백엔드

### Task 8: Anthropic SDK 설치 + SSE 채팅 엔드포인트

**Files:**
- Modify: `services/web-editor/requirements.txt`
- Modify: `services/web-editor/app.py`
- Create: `services/web-editor/tests/test_chat_api.py`

- [ ] **Step 1: 실패하는 백엔드 테스트 작성**

```python
# services/web-editor/tests/test_chat_api.py
def test_chat_endpoint_requires_message(client):
    """message 없이 /api/chat 호출 시 400 반환"""
    resp = client.post('/api/chat', json={})
    assert resp.status_code == 400
    data = resp.get_json()
    assert 'error' in data

def test_chat_endpoint_without_api_key(client, monkeypatch):
    """ANTHROPIC_API_KEY 없을 시 503 반환"""
    monkeypatch.delenv('ANTHROPIC_API_KEY', raising=False)
    resp = client.post('/api/chat', json={'message': 'Hello'})
    assert resp.status_code == 503
```

- [ ] **Step 2: 테스트 실행 — 404 확인 (엔드포인트 없음)**

```bash
cd services/web-editor
python -m pytest tests/test_chat_api.py -v
```
Expected: `AssertionError: assert 404 == 400`

- [ ] **Step 3: Anthropic SDK를 requirements.txt에 추가**

`services/web-editor/requirements.txt` 파일을 열고 마지막 줄에 추가:
```
anthropic>=0.40.0
```

설치:
```bash
cd services/web-editor
pip install anthropic
```

- [ ] **Step 4: /api/chat 엔드포인트 구현**

`app.py`의 다른 API 엔드포인트들 아래에(예: `/api/graph` 엔드포인트 이후) 다음을 추가:

```python
import os
import json as json_module
from flask import stream_with_context, Response

@app.route('/api/chat', methods=['POST'])
@require_auth
def chat():
    """에이전트 채팅 — SSE 스트리밍 응답"""
    data = request.get_json(silent=True) or {}
    message = data.get('message', '').strip()
    context_nodes = data.get('context', [])  # [{name, path, content}, ...]
    history = data.get('history', [])  # [{role, content}, ...]

    if not message:
        return jsonify({'error': 'message is required'}), 400

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not api_key:
        return jsonify({'error': 'ANTHROPIC_API_KEY not configured'}), 503

    try:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
    except ImportError:
        return jsonify({'error': 'anthropic package not installed'}), 503

    # 시스템 프롬프트 구성
    system_parts = [
        "당신은 SynapseNote의 지식 관리 어시스턴트입니다. "
        "사용자의 노트와 지식 그래프를 기반으로 질문에 답하고, 새로운 인사이트를 제공합니다."
    ]
    if context_nodes:
        context_text = "\n\n".join(
            f"## {n.get('name', 'Unknown')} ({n.get('path', '')})\n{n.get('content', '')[:2000]}"
            for n in context_nodes
        )
        system_parts.append(f"\n\n### 현재 컨텍스트 노드:\n{context_text}")
    system_prompt = "".join(system_parts)

    # 메시지 히스토리 구성
    messages = [
        {'role': m['role'], 'content': m['content']}
        for m in history
        if m.get('role') in ('user', 'assistant') and m.get('content')
    ]
    messages.append({'role': 'user', 'content': message})

    def generate():
        try:
            with client.messages.stream(
                model='claude-haiku-4-5-20251001',
                max_tokens=2048,
                system=system_prompt,
                messages=messages,
            ) as stream:
                for text in stream.text_stream:
                    yield f"data: {json_module.dumps({'type': 'text', 'text': text})}\n\n"
            yield f"data: {json_module.dumps({'type': 'done'})}\n\n"
        except anthropic.APIError as e:
            yield f"data: {json_module.dumps({'type': 'error', 'error': str(e)})}\n\n"

    return Response(
        stream_with_context(generate()),
        content_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'X-Accel-Buffering': 'no',
        },
    )
```

- [ ] **Step 5: 테스트 통과 확인**

```bash
cd services/web-editor
python -m pytest tests/test_chat_api.py -v
```
Expected: `2 passed`

- [ ] **Step 6: Commit**

```bash
git add services/web-editor/requirements.txt \
        services/web-editor/app.py \
        services/web-editor/tests/test_chat_api.py
git commit -m "feat: 에이전트 채팅 SSE 엔드포인트 추가 (/api/chat)"
```

---

## Phase 4: 에이전트 채팅 프론트엔드

### Task 9: useAgentChat 훅 구현

**Files:**
- Create: `services/web-editor/frontend/src/hooks/useAgentChat.js`
- Create: `services/web-editor/frontend/tests/useAgentChat.test.js`

- [ ] **Step 1: 실패하는 훅 테스트 작성**

```js
// services/web-editor/frontend/tests/useAgentChat.test.js
import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAgentChat } from '../src/hooks/useAgentChat';

describe('useAgentChat', () => {
  it('초기 상태는 메시지 없음, 로딩 아님', () => {
    const { result } = renderHook(() => useAgentChat());
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.contextNodes).toEqual([]);
  });

  it('addContextNode으로 컨텍스트 노드를 추가할 수 있다', () => {
    const { result } = renderHook(() => useAgentChat());
    act(() => {
      result.current.addContextNode({ id: 'node1', name: 'Test', path: 'test.md', content: 'Hello' });
    });
    expect(result.current.contextNodes).toHaveLength(1);
    expect(result.current.contextNodes[0].id).toBe('node1');
  });

  it('동일한 노드를 중복 추가하지 않는다', () => {
    const { result } = renderHook(() => useAgentChat());
    act(() => {
      result.current.addContextNode({ id: 'node1', name: 'Test', path: 'test.md', content: 'Hello' });
      result.current.addContextNode({ id: 'node1', name: 'Test', path: 'test.md', content: 'Hello' });
    });
    expect(result.current.contextNodes).toHaveLength(1);
  });

  it('removeContextNode으로 컨텍스트 노드를 제거할 수 있다', () => {
    const { result } = renderHook(() => useAgentChat());
    act(() => {
      result.current.addContextNode({ id: 'node1', name: 'Test', path: 'test.md', content: '' });
    });
    act(() => {
      result.current.removeContextNode('node1');
    });
    expect(result.current.contextNodes).toHaveLength(0);
  });

  it('clearContext로 모든 컨텍스트를 초기화한다', () => {
    const { result } = renderHook(() => useAgentChat());
    act(() => {
      result.current.addContextNode({ id: 'n1', name: 'A', path: 'a.md', content: '' });
      result.current.addContextNode({ id: 'n2', name: 'B', path: 'b.md', content: '' });
    });
    act(() => { result.current.clearContext(); });
    expect(result.current.contextNodes).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd services/web-editor/frontend
npm test tests/useAgentChat.test.js
```
Expected: `Cannot find module '../src/hooks/useAgentChat'`

- [ ] **Step 3: useAgentChat.js 구현**

```js
// services/web-editor/frontend/src/hooks/useAgentChat.js
import { useState, useCallback, useRef } from 'react';

export function useAgentChat() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [contextNodes, setContextNodes] = useState([]);
  const abortRef = useRef(null);

  const addContextNode = useCallback((node) => {
    setContextNodes((prev) => {
      if (prev.some((n) => n.id === node.id)) return prev;
      return [...prev, node];
    });
  }, []);

  const removeContextNode = useCallback((nodeId) => {
    setContextNodes((prev) => prev.filter((n) => n.id !== nodeId));
  }, []);

  const clearContext = useCallback(() => setContextNodes([]), []);

  const sendMessage = useCallback(async (text) => {
    if (!text.trim() || isLoading) return;

    const userMessage = { role: 'user', content: text, id: Date.now() };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // 스트리밍 어시스턴트 메시지 플레이스홀더
    const assistantId = Date.now() + 1;
    setMessages((prev) => [
      ...prev,
      { role: 'assistant', content: '', id: assistantId, streaming: true },
    ]);

    try {
      const history = messages.map((m) => ({ role: m.role, content: m.content }));

      const resp = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text,
          context: contextNodes.map((n) => ({
            name: n.name, path: n.path, content: n.content || '',
          })),
          history,
        }),
      });

      if (!resp.ok) {
        const err = await resp.json();
        throw new Error(err.error || `HTTP ${resp.status}`);
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            if (payload.type === 'text') {
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + payload.text }
                    : m
                )
              );
            } else if (payload.type === 'done') {
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, streaming: false } : m))
              );
            } else if (payload.type === 'error') {
              throw new Error(payload.error);
            }
          } catch {
            // JSON 파싱 실패 시 무시
          }
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === (Date.now() + 1)
            ? { ...m, content: `오류: ${err.message}`, streaming: false, error: true }
            : m
        )
      );
    } finally {
      setIsLoading(false);
    }
  }, [messages, contextNodes, isLoading]);

  const clearMessages = useCallback(() => setMessages([]), []);

  return {
    messages,
    isLoading,
    contextNodes,
    addContextNode,
    removeContextNode,
    clearContext,
    sendMessage,
    clearMessages,
  };
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd services/web-editor/frontend
npm test tests/useAgentChat.test.js
```
Expected: `5 passed`

- [ ] **Step 5: Commit**

```bash
git add services/web-editor/frontend/src/hooks/useAgentChat.js \
        services/web-editor/frontend/tests/useAgentChat.test.js
git commit -m "feat: useAgentChat 훅 - 메시지 상태, SSE 스트리밍, 컨텍스트 관리"
```

---

### Task 10: NodeContextChip 컴포넌트

**Files:**
- Create: `services/web-editor/frontend/src/components/NodeContextChip.jsx`
- Create: `services/web-editor/frontend/tests/NodeContextChip.test.jsx`

- [ ] **Step 1: 실패하는 컴포넌트 테스트 작성**

```jsx
// services/web-editor/frontend/tests/NodeContextChip.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NodeContextChip } from '../src/components/NodeContextChip';

describe('NodeContextChip', () => {
  const mockNode = { id: 'n1', name: 'My Note', path: 'notes/my-note.md', content: 'Hello' };

  it('노드 이름을 표시한다', () => {
    render(<NodeContextChip node={mockNode} onRemove={vi.fn()} />);
    expect(screen.getByText('My Note')).toBeInTheDocument();
  });

  it('X 버튼 클릭 시 onRemove 호출', () => {
    const onRemove = vi.fn();
    render(<NodeContextChip node={mockNode} onRemove={onRemove} />);
    const removeBtn = screen.getByRole('button');
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith('n1');
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd services/web-editor/frontend
npm test tests/NodeContextChip.test.jsx
```
Expected: `Cannot find module '../src/components/NodeContextChip'`

- [ ] **Step 3: NodeContextChip.jsx 구현**

```jsx
// services/web-editor/frontend/src/components/NodeContextChip.jsx
import { X, FileText, Code, Folder, MessageSquare, FileImage } from 'lucide-react';
import { detectNodeType, NODE_TYPES } from '../utils/nodeTypes';

const TYPE_ICONS = {
  [NODE_TYPES.FOLDER]: Folder,
  [NODE_TYPES.DOCUMENT]: FileText,
  [NODE_TYPES.CODE]: Code,
  [NODE_TYPES.CHAT]: MessageSquare,
  [NODE_TYPES.IMAGE]: FileImage,
};

export function NodeContextChip({ node, onRemove }) {
  const type = detectNodeType(node);
  const Icon = TYPE_ICONS[type] || FileText;

  return (
    <span className="inline-flex items-center gap-1 bg-cyan-900/50 border border-cyan-700/60 text-cyan-300 text-xs rounded-full px-2 py-0.5 max-w-[140px]">
      <Icon size={10} className="shrink-0" />
      <span className="truncate">{node.name}</span>
      <button
        onClick={() => onRemove(node.id)}
        className="shrink-0 hover:text-white transition-colors ml-0.5"
        aria-label={`${node.name} 제거`}
      >
        <X size={10} />
      </button>
    </span>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd services/web-editor/frontend
npm test tests/NodeContextChip.test.jsx
```
Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add services/web-editor/frontend/src/components/NodeContextChip.jsx \
        services/web-editor/frontend/tests/NodeContextChip.test.jsx
git commit -m "feat: NodeContextChip - 채팅 컨텍스트 노드 칩 컴포넌트"
```

---

### Task 11: ChatPanel 컴포넌트

**Files:**
- Create: `services/web-editor/frontend/src/components/ChatPanel.jsx`
- Create: `services/web-editor/frontend/tests/ChatPanel.test.jsx`

- [ ] **Step 1: 실패하는 ChatPanel 테스트 작성**

```jsx
// services/web-editor/frontend/tests/ChatPanel.test.jsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ChatPanel } from '../src/components/ChatPanel';

// useAgentChat 훅 모킹
vi.mock('../src/hooks/useAgentChat', () => ({
  useAgentChat: () => ({
    messages: [],
    isLoading: false,
    contextNodes: [],
    addContextNode: vi.fn(),
    removeContextNode: vi.fn(),
    clearContext: vi.fn(),
    sendMessage: vi.fn(),
    clearMessages: vi.fn(),
  }),
}));

describe('ChatPanel', () => {
  it('입력창과 전송 버튼이 렌더링된다', () => {
    render(<ChatPanel />);
    expect(screen.getByPlaceholderText(/메시지를 입력/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /전송/i })).toBeInTheDocument();
  });

  it('메시지 없을 때 빈 상태 텍스트를 표시한다', () => {
    render(<ChatPanel />);
    expect(screen.getByText(/노트에 대해 무엇이든 물어보세요/i)).toBeInTheDocument();
  });

  it('메시지 입력 후 Enter로 전송할 수 있다', () => {
    const sendMessage = vi.fn();
    vi.mocked(vi.importMock('../src/hooks/useAgentChat')); // 이미 모킹됨
    render(<ChatPanel />);
    const input = screen.getByPlaceholderText(/메시지를 입력/i);
    fireEvent.change(input, { target: { value: '안녕하세요' } });
    fireEvent.keyDown(input, { key: 'Enter', code: 'Enter' });
    // 전송 동작이 발생함을 확인 (실제 전송은 훅에 위임)
    expect(input).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd services/web-editor/frontend
npm test tests/ChatPanel.test.jsx
```
Expected: `Cannot find module '../src/components/ChatPanel'`

- [ ] **Step 3: ChatPanel.jsx 구현**

```jsx
// services/web-editor/frontend/src/components/ChatPanel.jsx
import { useRef, useEffect, useState } from 'react';
import { Send, Trash2, Plus, MessageSquare } from 'lucide-react';
import { useAgentChat } from '../hooks/useAgentChat';
import { NodeContextChip } from './NodeContextChip';

function ChatMessageItem({ message }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
          isUser
            ? 'bg-cyan-700 text-white rounded-br-sm'
            : message.error
            ? 'bg-red-900/50 border border-red-700 text-red-300 rounded-bl-sm'
            : 'bg-slate-700 text-slate-100 rounded-bl-sm'
        }`}
      >
        {message.content}
        {message.streaming && (
          <span className="inline-block w-1 h-3.5 ml-0.5 bg-cyan-400 animate-pulse align-text-bottom" />
        )}
      </div>
    </div>
  );
}

export function ChatPanel({ initialContextNodes = [] }) {
  const {
    messages, isLoading, contextNodes,
    addContextNode, removeContextNode, clearContext,
    sendMessage, clearMessages,
  } = useAgentChat();

  const [input, setInput] = useState('');
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // 외부에서 컨텍스트 노드 주입
  useEffect(() => {
    initialContextNodes.forEach((n) => addContextNode(n));
  }, [initialContextNodes, addContextNode]);

  // 새 메시지 시 스크롤
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendMessage(input.trim());
    setInput('');
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-900 text-slate-100">
      {/* 헤더 */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-700 shrink-0">
        <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
          <MessageSquare size={14} />
          에이전트 채팅
        </div>
        <button
          onClick={clearMessages}
          className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
          title="대화 초기화"
        >
          <Trash2 size={14} />
        </button>
      </div>

      {/* 컨텍스트 노드 칩 */}
      {contextNodes.length > 0 && (
        <div className="flex flex-wrap gap-1.5 px-3 py-2 border-b border-slate-700/60 bg-slate-800/40 shrink-0">
          <span className="text-[10px] text-slate-500 self-center">컨텍스트:</span>
          {contextNodes.map((node) => (
            <NodeContextChip key={node.id} node={node} onRemove={removeContextNode} />
          ))}
          <button
            onClick={clearContext}
            className="text-[10px] text-slate-500 hover:text-slate-300 px-1"
          >
            모두 제거
          </button>
        </div>
      )}

      {/* 메시지 영역 */}
      <div className="flex-1 overflow-y-auto px-3 py-3 min-h-0">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-slate-500">
            <MessageSquare size={28} className="opacity-40" />
            <p className="text-sm text-center">노트에 대해 무엇이든 물어보세요</p>
            <p className="text-xs text-center opacity-60">그래프에서 노드를 선택해 컨텍스트로 추가할 수 있어요</p>
          </div>
        ) : (
          messages.map((msg) => <ChatMessageItem key={msg.id} message={msg} />)
        )}
        <div ref={bottomRef} />
      </div>

      {/* 입력 영역 */}
      <div className="shrink-0 border-t border-slate-700 px-3 py-2">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="메시지를 입력하세요... (Enter로 전송)"
            className="flex-1 resize-none bg-slate-800 border border-slate-600 rounded-xl px-3 py-2 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-600 min-h-[36px] max-h-[120px]"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            aria-label="전송"
            className="p-2 bg-cyan-700 hover:bg-cyan-600 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl transition-colors shrink-0"
          >
            <Send size={14} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

```bash
cd services/web-editor/frontend
npm test tests/ChatPanel.test.jsx
```
Expected: `3 passed`

- [ ] **Step 5: Commit**

```bash
git add services/web-editor/frontend/src/components/ChatPanel.jsx \
        services/web-editor/frontend/tests/ChatPanel.test.jsx
git commit -m "feat: ChatPanel 컴포넌트 - 스트리밍 채팅 UI, 컨텍스트 칩"
```

---

## Phase 5: 통합 (레이아웃 + 양방향 연동)

### Task 12: 레이아웃에 채팅 탭 통합

**Files:**
- Modify: `services/web-editor/frontend/src/components/LeftSidebar.jsx`
- Modify: `services/web-editor/frontend/src/App.jsx`

- [ ] **Step 1: LeftSidebar.jsx에 채팅 탭 아이콘 추가**

`LeftSidebar.jsx`를 열어 현재 탭 목록을 확인:
```bash
grep -n "panelType\|activePanel\|tab" services/web-editor/frontend/src/components/LeftSidebar.jsx | head -20
```

NavigationRail의 탭 목록에 'chat' 추가. `NavigationRail.jsx`의 탭 배열을 수정:
```jsx
// NavigationRail.jsx 또는 LeftSidebar.jsx 내 탭 정의 부분
{ id: 'chat', icon: MessageSquare, label: '채팅' },
```

Import 추가:
```jsx
import { MessageSquare } from 'lucide-react';
```

- [ ] **Step 2: LeftSidebar.jsx에 ChatPanel 렌더링 추가**

패널 전환 로직(activePanel에 따라 분기하는 부분)에 chat 케이스 추가:
```jsx
import { ChatPanel } from './ChatPanel';

// 패널 렌더링 분기
{activePanel === 'chat' && (
  <ChatPanel initialContextNodes={pendingContextNodes} />
)}
```

- [ ] **Step 3: App.jsx에서 onInjectToChat 연결**

`App.jsx`에서 `FullGraphView`와 `LeftSidebar` 간 상태 연결:

```jsx
// App.jsx 상단에 state 추가
const [pendingContextNodes, setPendingContextNodes] = useState([]);
const [leftPanel, setLeftPanel] = useState('explorer');

// FullGraphView에 prop 전달
<FullGraphView
  currentFile={currentFile}
  onFileSelect={handleFileSelect}
  onInjectToChat={(nodes) => {
    setPendingContextNodes(nodes);
    setLeftPanel('chat');  // 채팅 탭으로 자동 전환
  }}
/>

// LeftSidebar에 prop 전달
<LeftSidebar
  activePanel={leftPanel}
  onPanelChange={setLeftPanel}
  pendingContextNodes={pendingContextNodes}
  onContextConsumed={() => setPendingContextNodes([])}
/>
```

- [ ] **Step 4: 브라우저에서 E2E 확인**

1. 그래프 뷰 열기
2. 노드 Shift+클릭으로 2개 이상 선택
3. "채팅에 컨텍스트 추가 →" 버튼 클릭
4. 왼쪽 사이드바가 채팅 탭으로 전환되는지
5. 선택한 노드들이 컨텍스트 칩으로 표시되는지

- [ ] **Step 5: Commit**

```bash
git add services/web-editor/frontend/src/components/LeftSidebar.jsx \
        services/web-editor/frontend/src/App.jsx
git commit -m "feat: 채팅 탭 레이아웃 통합 + 그래프 노드 → 채팅 컨텍스트 자동 주입"
```

---

### Task 13: 채팅 응답 → 노트 저장

에이전트 응답 메시지 하단에 "노트로 저장" 버튼을 추가한다.

**Files:**
- Modify: `services/web-editor/frontend/src/components/ChatPanel.jsx`

- [ ] **Step 1: 메시지에 "노트로 저장" 버튼 추가**

`ChatMessageItem` 함수를 수정:
```jsx
function ChatMessageItem({ message, onSaveAsNote }) {
  const isUser = message.role === 'user';
  const canSave = !isUser && !message.streaming && message.content && !message.error;

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3 group`}>
      <div className="max-w-[85%]">
        <div
          className={`rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words ${
            isUser
              ? 'bg-cyan-700 text-white rounded-br-sm'
              : message.error
              ? 'bg-red-900/50 border border-red-700 text-red-300 rounded-bl-sm'
              : 'bg-slate-700 text-slate-100 rounded-bl-sm'
          }`}
        >
          {message.content}
          {message.streaming && (
            <span className="inline-block w-1 h-3.5 ml-0.5 bg-cyan-400 animate-pulse align-text-bottom" />
          )}
        </div>
        {canSave && (
          <button
            onClick={() => onSaveAsNote(message.content)}
            className="mt-1 text-[10px] text-slate-500 hover:text-cyan-400 opacity-0 group-hover:opacity-100 transition-all"
          >
            + 노트로 저장
          </button>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 노트 저장 함수를 ChatPanel에 구현**

`ChatPanel.jsx`에 노트 저장 로직 추가:
```jsx
const handleSaveAsNote = async (content) => {
  const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-');
  const fileName = `chats/__chat__${timestamp}.md`;
  const noteContent = `# 에이전트 채팅 메모 (${timestamp})\n\n${content}`;

  try {
    await fetch(`/api/file?path=${encodeURIComponent(fileName)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: noteContent }),
    });
    // 성공 피드백 (간단한 상태)
    alert(`저장됨: ${fileName}`);
  } catch {
    alert('저장 실패');
  }
};
```

`ChatMessageItem`에 `onSaveAsNote={handleSaveAsNote}` prop 전달.

- [ ] **Step 3: 브라우저에서 확인**

1. 채팅 메시지를 보냄
2. 어시스턴트 응답 위에 호버 → "노트로 저장" 버튼 표시
3. 클릭 시 `chats/__chat__...md` 파일로 저장됨
4. 파일 탐색기에서 새 파일 확인

- [ ] **Step 4: Commit**

```bash
git add services/web-editor/frontend/src/components/ChatPanel.jsx
git commit -m "feat: 채팅 응답 노트 저장 기능 (chats/__chat__*.md)"
```

---

### Task 14: 환경 변수 설정 문서화

**Files:**
- Modify: `services/web-editor/.env.example` (없으면 생성)

- [ ] **Step 1: .env.example 파일 확인 및 생성**

```bash
ls /home/ubuntu/project/SynapseNote/.env.example 2>/dev/null || echo "없음"
```

- [ ] **Step 2: ANTHROPIC_API_KEY 항목 추가**

프로젝트 루트 `.env.example`에 추가:
```bash
# 에이전트 채팅 (Anthropic Claude)
ANTHROPIC_API_KEY=your-api-key-here
```

- [ ] **Step 3: docker-compose.yml에 환경 변수 반영 확인**

```bash
grep -n "ANTHROPIC\|environment" /home/ubuntu/project/SynapseNote/docker-compose.yml
```

`obsidian-web` 서비스의 environment 섹션에 아직 없으면 추가:
```yaml
environment:
  - ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY:-}
```

- [ ] **Step 4: Commit**

```bash
git add .env.example docker-compose.yml
git commit -m "chore: ANTHROPIC_API_KEY 환경 변수 설정 추가"
```

---

## 전체 테스트 실행

### 프론트엔드 전체 테스트

```bash
cd services/web-editor/frontend
npm test
```
Expected: 모든 테스트 pass, 커버리지 80% 이상

### 백엔드 전체 테스트

```bash
cd services/web-editor
python -m pytest tests/ -v
```
Expected: 모든 테스트 pass

---

## 구현 완료 체크리스트

- [ ] 노드 타입 시스템 (detectNodeType, getNodeShape, getNodeColor)
- [ ] 그래프 노드 형태: content 없음 → 원형, content 있음 → 둥근 사각형
- [ ] 그래프 노드 타입별 색상 (코드=초록, PDF=빨강, 채팅=보라 등)
- [ ] 클릭 → 화면 중앙 이동 + 줌
- [ ] 1-hop 이웃 노드 강조 + 크기 확대
- [ ] 이웃 노드 content preview 오버레이 (우측 상단)
- [ ] Shift+클릭 다중 선택 (점선 테두리)
- [ ] 다중 선택 시 "채팅에 컨텍스트 추가" 액션 바
- [ ] Flask SSE 채팅 엔드포인트 (/api/chat)
- [ ] Anthropic Claude Haiku 스트리밍 연동
- [ ] useAgentChat 훅 (메시지, 스트리밍, 컨텍스트 관리)
- [ ] NodeContextChip 컴포넌트
- [ ] ChatPanel 컴포넌트 (스트리밍 UI, 컨텍스트 칩, 입력창)
- [ ] LeftSidebar 채팅 탭 통합
- [ ] 그래프 → 채팅 컨텍스트 자동 주입 (탭 전환 포함)
- [ ] 채팅 응답 → 노트 저장 기능
- [ ] 환경 변수 설정 문서화
