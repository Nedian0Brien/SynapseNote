# 프론트엔드 재구성 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `main-ui-preview.html` + `design-system-preview.html`을 타겟으로, 현재 다중 페이지 React 앱을 단일 Stage 기반 앱으로 전면 재구성하고 Base 계층 기능을 통합한다.

**Architecture:** App → Sidebar + Workspace(Topbar + Stage). Stage가 전체 캔버스이며, 그래프 SVG 위에 플로팅 패널(Context, Chat, Dock)이 겹쳐진다. Base 데이터는 `.synapsenote/bases.json`이 source of truth.

**Tech Stack:** React 19, Vite, D3 v7, Tailwind v4, Material Symbols Outlined, Lexend + Inter, Flask (backend)

---

## Phase 1: 디자인 토큰 + 쉘 레이아웃

### Task 1-1: CSS 디자인 토큰 전면 교체

**Files:**
- Modify: `services/web-editor/frontend/src/index.css`

- [ ] **Step 1: 기존 index.css 내용을 design-system-preview 기반 토큰으로 전면 교체**

```css
/* ── 폰트 임포트 ── */
@import url("https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Lexend:wght@300;400;500;600;700;800;900&display=swap");

@import "tailwindcss";

/* ══════════════════════════════════
   DESIGN TOKENS — Light (warm beige/espresso)
══════════════════════════════════ */
:root, [data-theme="light"] {
  color-scheme: light;

  --bg:           #f5f2eb;
  --surface:      #fffdf7;
  --surface-low:  #ede8d8;
  --surface-high: #e8e0cc;
  --on-surface:   #1a1208;
  --on-variant:   #5a4020;
  --muted:        #8a7050;
  --outline:      rgba(60,40,10,0.14);
  --outline-var:  rgba(60,40,10,0.08);

  --primary:      #2a1c08;
  --primary-icon: rgba(245,240,228,0.92);
  --primary-dim:  rgba(42,28,8,0.08);

  --error:        #b91c1c;
  --success:      #15803d;
  --warning:      #b45309;
  --info:         #1d4ed8;

  --shadow-sm: 0 1px 3px rgba(60,40,10,0.07), 0 1px 2px rgba(60,40,10,0.04);
  --shadow-md: 0 4px 12px rgba(60,40,10,0.09), 0 2px 5px rgba(60,40,10,0.05);
  --shadow-lg: 0 10px 28px rgba(60,40,10,0.10), 0 3px 8px rgba(60,40,10,0.06);

  /* graph */
  --g-bg:         #f5f2eb;
  --g-dot:        rgba(60,40,10,0.16);
  --g-dir-fill:   #2a1c08; --g-dir-stroke: #2a1c08; --g-dir-icon: rgba(245,240,228,0.92);
  --g-dir-label:  rgba(20,12,4,0.88);
  --g-hub-fill:   #f0ebe0; --g-hub-stroke: #2a1c08; --g-hub-num: #2a1c08;
  --g-hub-label:  rgba(42,28,8,0.85); --g-hub-sel: rgba(42,28,8,0.55);
  --g-doc-fill:   #f0ebe0; --g-doc-stroke: #c8b89a; --g-doc-num: #a89070;
  --g-doc-label:  rgba(60,40,10,0.48); --g-doc-sel: rgba(60,40,10,0.4);
  --g-doc-icon:   rgba(140,100,60,0.65);
  --g-link-dir:   rgba(60,40,10,0.32);
  --g-link-wiki:  rgba(60,40,10,0.17);
  --g-link-ref:   rgba(60,40,10,0.09);
  --g-dim:        0.1;
}

/* ══════════════════════════════════
   DESIGN TOKENS — Dark (espresso sepia)
══════════════════════════════════ */
[data-theme="dark"] {
  color-scheme: dark;

  --bg:           #100d08;
  --surface:      #1a1510;
  --surface-low:  #141008;
  --surface-high: #261e14;
  --on-surface:   #f0ece2;
  --on-variant:   #c8a878;
  --muted:        #907860;
  --outline:      rgba(200,160,80,0.18);
  --outline-var:  rgba(200,160,80,0.09);

  --primary:      #d4a850;
  --primary-icon: rgba(16,13,8,0.92);
  --primary-dim:  rgba(212,168,80,0.10);

  --error:        #fca5a5;
  --success:      #4ade80;
  --warning:      #fbbf24;
  --info:         #60a5fa;

  --shadow-sm: 0 1px 3px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3);
  --shadow-md: 0 4px 12px rgba(0,0,0,0.45), 0 2px 5px rgba(0,0,0,0.35);
  --shadow-lg: 0 10px 28px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.4);

  /* graph */
  --g-bg:         #100d08;
  --g-dot:        rgba(200,160,80,0.12);
  --g-dir-fill:   #d4a850; --g-dir-stroke: #d4a850; --g-dir-icon: rgba(16,13,8,0.92);
  --g-dir-label:  rgba(240,220,180,0.88);
  --g-hub-fill:   #261e14; --g-hub-stroke: #d4a850; --g-hub-num: #d4a850;
  --g-hub-label:  rgba(200,170,100,0.85); --g-hub-sel: rgba(212,168,80,0.55);
  --g-doc-fill:   #221a12; --g-doc-stroke: #5a4020; --g-doc-num: #7a6040;
  --g-doc-label:  rgba(200,160,80,0.48); --g-doc-sel: rgba(200,160,80,0.4);
  --g-doc-icon:   rgba(160,120,70,0.65);
  --g-link-dir:   rgba(200,160,80,0.35);
  --g-link-wiki:  rgba(200,160,80,0.18);
  --g-link-ref:   rgba(200,160,80,0.09);
  --g-dim:        0.1;
}

/* ══════════════════════════════════
   SPACING, RADIUS, FONT, ANIMATION
══════════════════════════════════ */
:root {
  --r-xs:   4px;
  --r-sm:   7px;
  --r-md:   10px;
  --r-lg:   14px;
  --r-xl:   18px;
  --r-full: 9999px;

  --font-hl:   'Lexend', system-ui, sans-serif;
  --font-bd:   'Inter', system-ui, sans-serif;

  --ease:        cubic-bezier(0.4, 0, 0.2, 1);
  --ease-out:    cubic-bezier(0.22, 1, 0.36, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
  --dur:         200ms;
  --dur-slow:    320ms;
  --dur-fast:    120ms;
}

/* ══════════════════════════════════
   RESET
══════════════════════════════════ */
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
  height: 100%;
  overflow: hidden;
  background: var(--bg);
  color: var(--on-surface);
  font-family: var(--font-bd);
  font-size: 13px;
  -webkit-font-smoothing: antialiased;
}
button { cursor: pointer; border: none; background: none; font: inherit; color: inherit; }
input, textarea { font: inherit; color: inherit; outline: none; border: none; background: none; }
#root { width: 100%; height: 100vh; }

/* ══════════════════════════════════
   MATERIAL SYMBOLS
══════════════════════════════════ */
.icon {
  font-family: 'Material Symbols Outlined';
  font-size: 20px;
  line-height: 1;
  display: inline-block;
  user-select: none;
  vertical-align: middle;
  flex-shrink: 0;
  font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24;
}
.icon--fill { font-variation-settings: 'FILL' 1, 'wght' 600, 'GRAD' 0, 'opsz' 24; }
.icon--sm { font-size: 16px; }
.icon--lg { font-size: 24px; }

/* ══════════════════════════════════
   SCROLLBAR
══════════════════════════════════ */
::-webkit-scrollbar { width: 3px; height: 3px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: var(--outline); border-radius: 9px; }
::-webkit-scrollbar-thumb:hover { background: var(--muted); }
```

- [ ] **Step 2: 앱 실행해서 토큰 적용 확인 (콘솔 에러 없는지)**

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 3: 커밋**

```bash
git add services/web-editor/frontend/src/index.css
git commit -m "feat: 디자인 토큰 전면 교체 (베이지/에스프레소 팔레트, Material Symbols)"
```

---

### Task 1-2: App.jsx — 단일 Stage 구조로 재편

**Files:**
- Modify: `services/web-editor/frontend/src/App.jsx`
- Create: `services/web-editor/frontend/src/components/Sidebar.jsx`
- Create: `services/web-editor/frontend/src/components/Workspace.jsx`
- Create: `services/web-editor/frontend/src/components/Topbar.jsx`
- Create: `services/web-editor/frontend/src/components/Stage.jsx`

- [ ] **Step 1: App.jsx를 단일 레이아웃으로 재작성**

라우팅 제거. `App.jsx`:

```jsx
import { useAuth } from './contexts/AuthContext';
import { lazy, Suspense } from 'react';

const LoginForm = lazy(() => import('./components/auth/LoginForm').then(m => ({ default: m.LoginForm })));
const MainLayout = lazy(() => import('./components/MainLayout'));

const PageLoader = () => (
  <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:'100vh', background:'var(--bg)', color:'var(--muted)' }}>
    <span style={{ fontSize:12 }}>Loading…</span>
  </div>
);

function App() {
  const { currentUser, loading } = useAuth();
  if (loading) return <PageLoader />;
  if (!currentUser) return <Suspense fallback={<PageLoader />}><LoginForm /></Suspense>;
  return <Suspense fallback={<PageLoader />}><MainLayout /></Suspense>;
}

export default App;
```

- [ ] **Step 2: MainLayout.jsx 생성**

`services/web-editor/frontend/src/components/MainLayout.jsx`:

```jsx
import Sidebar from './Sidebar';
import Workspace from './Workspace';
import { useState } from 'react';

export default function MainLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [currentFile, setCurrentFile] = useState(null);

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: sidebarCollapsed ? '44px 1fr' : '200px 1fr',
      width: '100vw',
      height: '100vh',
      transition: `grid-template-columns var(--dur-slow) var(--ease-out)`,
    }}>
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(p => !p)}
        currentFile={currentFile}
        setCurrentFile={setCurrentFile}
      />
      <Workspace currentFile={currentFile} setCurrentFile={setCurrentFile} />
    </div>
  );
}
```

- [ ] **Step 3: Sidebar.jsx 생성 (목업의 `.sidebar` 구현)**

`services/web-editor/frontend/src/components/Sidebar.jsx`:

```jsx
import { useState } from 'react';

export default function Sidebar({ collapsed, onToggleCollapse, currentFile, setCurrentFile }) {
  return (
    <aside style={{
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--surface)',
      borderRight: '1px solid var(--outline)',
      overflow: 'hidden',
      zIndex: 10,
    }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'12px 10px 8px', flexShrink:0 }}>
        {!collapsed && (
          <span style={{ fontFamily:'var(--font-hl)', fontWeight:900, fontSize:15, color:'var(--primary)', letterSpacing:'-0.04em', flex:1, whiteSpace:'nowrap' }}>
            SynapseNote
          </span>
        )}
        <button
          onClick={onToggleCollapse}
          style={{ width:26, height:26, borderRadius:'var(--r-xs)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', transition:`background var(--dur-fast)` }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
          aria-label={collapsed ? '사이드바 펼치기' : '사이드바 접기'}
        >
          <span className="icon" style={{ fontSize:16 }}>{collapsed ? 'chevron_right' : 'chevron_left'}</span>
        </button>
      </div>

      {/* Search */}
      {!collapsed && (
        <div style={{ display:'flex', alignItems:'center', gap:5, margin:'0 8px 8px', padding:'5px 8px', borderRadius:'var(--r-sm)', background:'var(--bg)', border:'1px solid var(--outline)' }}>
          <span className="icon" style={{ fontSize:14, color:'var(--muted)' }}>search</span>
          <input placeholder="검색..." style={{ fontSize:11, flex:1, minWidth:0, color:'var(--on-surface)' }} />
        </div>
      )}

      {/* Tree — Phase 2에서 SidebarTree로 교체 */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 4px 8px' }}>
        {!collapsed && (
          <div style={{ padding:'5px 8px 3px', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.09em', color:'var(--muted)', display:'flex', alignItems:'center', gap:4 }}>
            <span className="icon" style={{ fontSize:12 }}>folder</span>
            파일
          </div>
        )}
      </div>

      {/* Footer */}
      {!collapsed && (
        <div style={{ display:'flex', gap:2, padding:'6px 8px', borderTop:'1px solid var(--outline)', flexShrink:0 }}>
          <button style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', gap:3, padding:5, borderRadius:'var(--r-sm)', fontSize:10, fontWeight:600, color:'var(--muted)', transition:`background var(--dur-fast)` }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
            onMouseLeave={e => e.currentTarget.style.background = 'none'}
          >
            <span className="icon" style={{ fontSize:14 }}>add</span>새 노트
          </button>
        </div>
      )}
    </aside>
  );
}
```

- [ ] **Step 4: Workspace.jsx 생성**

`services/web-editor/frontend/src/components/Workspace.jsx`:

```jsx
import Topbar from './Topbar';
import Stage from './Stage';

export default function Workspace({ currentFile, setCurrentFile }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <Topbar currentFile={currentFile} />
      <Stage currentFile={currentFile} setCurrentFile={setCurrentFile} />
    </div>
  );
}
```

- [ ] **Step 5: Topbar.jsx 생성**

`services/web-editor/frontend/src/components/Topbar.jsx`:

```jsx
import { useState } from 'react';

export default function Topbar({ currentFile }) {
  const [theme, setTheme] = useState(() =>
    document.documentElement.getAttribute('data-theme') || 'light'
  );

  const toggleTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('theme', next);
    setTheme(next);
  };

  return (
    <header style={{
      display:'flex', alignItems:'center', gap:8, height:42, padding:'0 12px',
      flexShrink:0, background:'var(--surface)', borderBottom:'1px solid var(--outline)', zIndex:10,
    }}>
      {/* Breadcrumb */}
      <div style={{ flex:1, display:'flex', alignItems:'center', gap:4, fontSize:12, color:'var(--muted)', fontWeight:500, overflow:'hidden', whiteSpace:'nowrap' }}>
        <span className="icon" style={{ fontSize:14 }}>hub</span>
        <span style={{ color:'var(--on-surface)', fontWeight:600 }}>
          {currentFile ?? 'Graph View'}
        </span>
      </div>

      {/* Theme toggle */}
      <button
        onClick={toggleTheme}
        style={{ width:28, height:28, borderRadius:'var(--r-sm)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)', transition:`background var(--dur-fast)` }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
        aria-label="테마 전환"
      >
        <span className="icon" style={{ fontSize:17 }}>{theme === 'light' ? 'light_mode' : 'dark_mode'}</span>
      </button>
      <button style={{ width:28, height:28, borderRadius:'var(--r-sm)', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--muted)' }}>
        <span className="icon" style={{ fontSize:17 }}>more_vert</span>
      </button>
    </header>
  );
}
```

- [ ] **Step 6: Stage.jsx 생성 (그래프 플레이스홀더)**

`services/web-editor/frontend/src/components/Stage.jsx`:

```jsx
import { lazy, Suspense } from 'react';

const FoveatedGraphView = lazy(() =>
  import('./graph2/FoveatedGraphView').then(m => ({ default: m.FoveatedGraphView }))
);

export default function Stage({ currentFile, setCurrentFile }) {
  return (
    <div style={{ flex:1, position:'relative', overflow:'hidden', background:'var(--g-bg)' }}>
      <Suspense fallback={null}>
        <FoveatedGraphView
          onUnauthorized={() => {}}
          onOpenNode={(nodeId) => setCurrentFile(nodeId)}
        />
      </Suspense>
    </div>
  );
}
```

- [ ] **Step 7: 빌드 확인**

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend && npm run build 2>&1 | tail -30
```

Expected: 빌드 성공, 주요 에러 없음

- [ ] **Step 8: 커밋**

```bash
git add services/web-editor/frontend/src/
git commit -m "feat: 앱 단일 Stage 레이아웃으로 재구성 (Sidebar, Workspace, Topbar, Stage)"
```

---

### Task 1-3: 테마 초기화 스크립트 확인

**Files:**
- Modify: `services/web-editor/frontend/index.html`

- [ ] **Step 1: index.html의 테마 초기화 스크립트를 data-theme 방식으로 수정**

현재 `classList.add(theme)` → `setAttribute('data-theme', theme)`로 변경:

```html
<script>
  (function() {
    try {
      var theme = localStorage.getItem('theme') || 'light';
      document.documentElement.setAttribute('data-theme', theme);
    } catch (e) {}
  })();
</script>
```

- [ ] **Step 2: 빌드 + 커밋**

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend && npm run build 2>&1 | tail -10
git add services/web-editor/frontend/index.html
git commit -m "feat: 테마 초기화를 data-theme attribute 방식으로 통일"
```

---

## Phase 2: 사이드바 SidebarTree + Base 기능

### Task 2-1: 백엔드 Base API (Flask)

**Files:**
- Modify: `services/web-editor/app.py`
- Create: `services/web-editor/base_routes.py`

- [ ] **Step 1: `.synapsenote` IGNORED_DIRS 추가**

`app.py` 25행:
```python
IGNORED_DIRS = {".git", ".obsidian", ".obsidian-web-trash", ".obsidian-web-versions", ".synapsenote"}
```

- [ ] **Step 2: base_routes.py 작성**

```python
import fcntl
import json
import time
from pathlib import Path
from flask import Blueprint, jsonify, request

base_bp = Blueprint("bases", __name__)

def _bases_path(vault_root: Path) -> Path:
    p = vault_root / ".synapsenote"
    p.mkdir(exist_ok=True)
    return p / "bases.json"

def _read_bases(vault_root: Path) -> dict:
    path = _bases_path(vault_root)
    if not path.exists():
        return {"version": 1, "bases": []}
    with open(path, "r", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_SH)
        try:
            return json.load(f)
        except json.JSONDecodeError:
            # 파싱 실패 시 백업 후 초기값
            backup = path.with_suffix(f".backup.{int(time.time())}.json")
            path.rename(backup)
            return {"version": 1, "bases": []}
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

def _write_bases(vault_root: Path, data: dict) -> None:
    path = _bases_path(vault_root)
    with open(path, "w", encoding="utf-8") as f:
        fcntl.flock(f, fcntl.LOCK_EX)
        try:
            json.dump(data, f, ensure_ascii=False, indent=2)
        finally:
            fcntl.flock(f, fcntl.LOCK_UN)

def register(app, vault_root: Path):
    @base_bp.route("/api/bases", methods=["GET"])
    def get_bases():
        return jsonify(_read_bases(vault_root))

    @base_bp.route("/api/bases", methods=["PUT"])
    def put_bases():
        data = request.get_json(force=True)
        if not isinstance(data, dict) or "bases" not in data:
            return jsonify({"error": "invalid payload"}), 400
        _write_bases(vault_root, data)
        return jsonify({"ok": True})

    @base_bp.route("/api/bases", methods=["POST"])
    def create_base():
        body = request.get_json(force=True)
        name = (body.get("name") or "").strip()
        color = body.get("color", "#6c8fff")
        if not name:
            return jsonify({"error": "name required"}), 400
        data = _read_bases(vault_root)
        # 이름 중복 체크
        if any(b["name"] == name for b in data["bases"]):
            return jsonify({"error": "duplicate name"}), 409
        import re, time as t
        base_id = "base_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        new_base = {"id": base_id, "name": name, "color": color, "folders": [], "createdAt": __import__("datetime").datetime.utcnow().isoformat() + "Z"}
        data["bases"].append(new_base)
        _write_bases(vault_root, data)
        return jsonify(new_base), 201

    @base_bp.route("/api/bases/<base_id>", methods=["DELETE"])
    def delete_base(base_id):
        data = _read_bases(vault_root)
        data["bases"] = [b for b in data["bases"] if b["id"] != base_id]
        _write_bases(vault_root, data)
        return jsonify({"ok": True})

    @base_bp.route("/api/bases/<base_id>/folders", methods=["POST"])
    def add_folder(base_id):
        body = request.get_json(force=True)
        folder = (body.get("folder") or "").strip("/")
        if not folder:
            return jsonify({"error": "folder required"}), 400
        data = _read_bases(vault_root)
        for base in data["bases"]:
            if base["id"] == base_id:
                if folder not in base["folders"]:
                    base["folders"].append(folder)
                _write_bases(vault_root, data)
                return jsonify(base)
        return jsonify({"error": "base not found"}), 404

    @base_bp.route("/api/bases/<base_id>/folders", methods=["DELETE"])
    def remove_folder(base_id):
        folder = (request.args.get("path") or "").strip("/")
        data = _read_bases(vault_root)
        for base in data["bases"]:
            if base["id"] == base_id:
                base["folders"] = [f for f in base["folders"] if f != folder]
                _write_bases(vault_root, data)
                return jsonify(base)
        return jsonify({"error": "base not found"}), 404

    app.register_blueprint(base_bp)
```

- [ ] **Step 3: app.py에 Blueprint 등록**

`app.py` 하단 `if __name__ == "__main__":` 직전:
```python
from base_routes import register as register_bases
register_bases(app, VAULT_ROOT)
```

- [ ] **Step 4: 빌드 확인 (Python 문법 오류 없는지)**

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor && python3 -c "import app" 2>&1
```

Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add services/web-editor/app.py services/web-editor/base_routes.py
git commit -m "feat: Base CRUD API 추가 (bases.json 파일 기반, fcntl 동시성 제어)"
```

---

### Task 2-2: useBaseStore 훅

**Files:**
- Create: `services/web-editor/frontend/src/hooks/useBaseStore.js`

- [ ] **Step 1: useBaseStore.js 작성**

```js
import { useState, useEffect, useCallback } from 'react';

export function useBaseStore() {
  const [bases, setBases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFocusId, setActiveFocusId] = useState(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/bases');
      if (res.ok) {
        const data = await res.json();
        setBases(data.bases ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const createBase = useCallback(async (name, color = '#6c8fff') => {
    const res = await fetch('/api/bases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const base = await res.json();
    setBases(prev => [...prev, base]);
    return base;
  }, []);

  const deleteBase = useCallback(async (baseId) => {
    await fetch(`/api/bases/${baseId}`, { method: 'DELETE' });
    setBases(prev => prev.filter(b => b.id !== baseId));
    if (activeFocusId === baseId) setActiveFocusId(null);
  }, [activeFocusId]);

  const addFolder = useCallback(async (baseId, folder) => {
    const res = await fetch(`/api/bases/${baseId}/folders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folder }),
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const updated = await res.json();
    setBases(prev => prev.map(b => b.id === baseId ? updated : b));
  }, []);

  const removeFolder = useCallback(async (baseId, folderPath) => {
    const res = await fetch(`/api/bases/${baseId}/folders?path=${encodeURIComponent(folderPath)}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error((await res.json()).error);
    const updated = await res.json();
    setBases(prev => prev.map(b => b.id === baseId ? updated : b));
  }, []);

  // 어떤 Base에도 속하지 않은 폴더 계산
  const getUnassignedFolders = useCallback((allFolders) => {
    const assigned = new Set(bases.flatMap(b => b.folders));
    return allFolders.filter(f => !assigned.has(f));
  }, [bases]);

  return {
    bases, loading, activeFocusId, setActiveFocusId,
    createBase, deleteBase, addFolder, removeFolder, getUnassignedFolders,
    reload: load,
  };
}
```

- [ ] **Step 2: 커밋**

```bash
git add services/web-editor/frontend/src/hooks/useBaseStore.js
git commit -m "feat: useBaseStore 훅 추가 (Base CRUD, 미분류 폴더 계산)"
```

---

### Task 2-3: SidebarTree — 3존 구조

**Files:**
- Create: `services/web-editor/frontend/src/components/SidebarTree.jsx`
- Create: `services/web-editor/frontend/src/components/BaseSection.jsx`
- Modify: `services/web-editor/frontend/src/components/Sidebar.jsx`

- [ ] **Step 1: BaseSection.jsx 작성**

```jsx
import { useState } from 'react';

export default function BaseSection({ base, currentFile, setCurrentFile, onRemoveFolder, onDeleteBase }) {
  const [open, setOpen] = useState(true);

  return (
    <div style={{ marginBottom: 2 }}>
      {/* Base 헤더 */}
      <div
        style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 8px 3px', cursor:'pointer' }}
        onClick={() => setOpen(p => !p)}
      >
        <div style={{ width:7, height:7, borderRadius:'50%', background:base.color, flexShrink:0 }} />
        <span style={{ fontSize:10, fontWeight:700, letterSpacing:'0.06em', color:base.color, flex:1, textOverflow:'ellipsis', overflow:'hidden', whiteSpace:'nowrap' }}>
          {base.name}
        </span>
        <span className="icon" style={{ fontSize:12, color:'var(--muted)' }}>
          {open ? 'expand_less' : 'expand_more'}
        </span>
      </div>

      {/* 소속 폴더 목록 */}
      {open && base.folders.map(folder => (
        <div
          key={folder}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 8px 4px 20px', borderRadius:'var(--r-sm)', fontSize:11, fontWeight:500, color:'var(--on-variant)', cursor:'pointer', margin:'0 4px' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
          onClick={() => setCurrentFile(folder)}
        >
          <span className="icon icon--fill" style={{ fontSize:14, color:'var(--primary)' }}>folder</span>
          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{folder}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: SidebarTree.jsx 작성**

```jsx
import { useState, useEffect } from 'react';
import BaseSection from './BaseSection';
import { useBaseStore } from '../hooks/useBaseStore';

export default function SidebarTree({ currentFile, setCurrentFile }) {
  const { bases, loading, createBase, deleteBase, addFolder, removeFolder, getUnassignedFolders } = useBaseStore();
  const [allFolders, setAllFolders] = useState([]);
  const [showNewBase, setShowNewBase] = useState(false);
  const [newBaseName, setNewBaseName] = useState('');

  useEffect(() => {
    fetch('/api/files?recursive=true')
      .then(r => r.ok ? r.json() : [])
      .then(files => {
        const folders = [...new Set(files.filter(f => f.type === 'dir').map(f => f.path))];
        setAllFolders(folders);
      })
      .catch(() => {});
  }, []);

  const unassigned = getUnassignedFolders(allFolders);

  const handleCreateBase = async (e) => {
    e.preventDefault();
    if (!newBaseName.trim()) return;
    await createBase(newBaseName.trim());
    setNewBaseName('');
    setShowNewBase(false);
  };

  const sectionLabel = (icon, text) => (
    <div style={{ display:'flex', alignItems:'center', gap:4, padding:'5px 8px 3px', fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.09em', color:'var(--muted)', marginTop:4 }}>
      <span className="icon" style={{ fontSize:12 }}>{icon}</span>
      {text}
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:'auto', padding:'0 4px 8px' }}>
      {/* Zone 1: 전체 그래프 */}
      <div style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 8px', borderRadius:'var(--r-sm)', fontSize:11, fontWeight:500, color:'var(--on-variant)', cursor:'pointer', margin:'2px 0' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
        onMouseLeave={e => e.currentTarget.style.background = 'none'}
      >
        <span className="icon" style={{ fontSize:14 }}>hub</span>
        전체 그래프
      </div>

      {/* Zone 2: Base 목록 */}
      {sectionLabel('layers', 'Bases')}
      {loading ? (
        <div style={{ padding:'4px 8px', fontSize:10, color:'var(--muted)' }}>로딩 중...</div>
      ) : (
        bases.map(base => (
          <BaseSection
            key={base.id}
            base={base}
            currentFile={currentFile}
            setCurrentFile={setCurrentFile}
            onRemoveFolder={(folder) => removeFolder(base.id, folder)}
            onDeleteBase={() => deleteBase(base.id)}
          />
        ))
      )}

      {/* 새 Base 생성 */}
      {showNewBase ? (
        <form onSubmit={handleCreateBase} style={{ padding:'4px 8px', display:'flex', gap:4 }}>
          <input
            autoFocus
            value={newBaseName}
            onChange={e => setNewBaseName(e.target.value)}
            placeholder="Base 이름"
            style={{ flex:1, fontSize:11, padding:'3px 6px', borderRadius:'var(--r-xs)', border:'1px solid var(--outline)', background:'var(--bg)', color:'var(--on-surface)' }}
          />
          <button type="submit" style={{ fontSize:11, padding:'3px 8px', borderRadius:'var(--r-xs)', background:'var(--primary)', color:'var(--primary-icon)' }}>추가</button>
          <button type="button" onClick={() => setShowNewBase(false)} style={{ fontSize:11, color:'var(--muted)' }}>✕</button>
        </form>
      ) : (
        <button
          onClick={() => setShowNewBase(true)}
          style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', fontSize:10, color:'var(--muted)', borderRadius:'var(--r-sm)', margin:'2px 0', width:'100%' }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <span className="icon" style={{ fontSize:13 }}>add</span>새 Base
        </button>
      )}

      {/* Zone 3: 미분류 */}
      {unassigned.length > 0 && (
        <>
          {sectionLabel('folder_off', '미분류')}
          {unassigned.map(folder => (
            <div
              key={folder}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 8px', borderRadius:'var(--r-sm)', fontSize:11, color:'var(--muted)', cursor:'pointer', margin:'0 4px' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--primary-dim)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
              onClick={() => setCurrentFile(folder)}
            >
              <span className="icon" style={{ fontSize:14 }}>folder</span>
              <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{folder}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Sidebar.jsx의 트리 영역을 SidebarTree로 교체**

`Sidebar.jsx`의 `{/* Tree — Phase 2에서 SidebarTree로 교체 */}` 블록을:

```jsx
import SidebarTree from './SidebarTree';
// ...
{/* Tree */}
{!collapsed && (
  <SidebarTree currentFile={currentFile} setCurrentFile={setCurrentFile} />
)}
```

- [ ] **Step 4: 빌드 확인**

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend && npm run build 2>&1 | tail -20
```

- [ ] **Step 5: 커밋**

```bash
git add services/web-editor/frontend/src/components/
git commit -m "feat: 사이드바 3존 트리 구조 구현 (전체 그래프 / Base / 미분류)"
```

---

## Phase 3: Stage 내부 패널

### Task 3-1: NodeDock (선택 노드 상세)

**Files:**
- Create: `services/web-editor/frontend/src/components/NodeDock.jsx`

- [ ] **Step 1: NodeDock.jsx 작성 (목업의 `.dock` 구현)**

```jsx
export default function NodeDock({ node, onClose, onAddToContext }) {
  if (!node) return null;
  return (
    <div style={{
      width: 'min(586px, 100%)',
      background: 'var(--surface)',
      border: '1px solid var(--outline)',
      borderRadius: 'var(--r-xl)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div style={{ display:'flex', alignItems:'center', gap:12, padding:'11px 14px' }}>
        <div style={{ width:34, height:34, borderRadius:8, background:'var(--primary)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span className="icon icon--fill" style={{ color:'var(--primary-icon)', fontSize:16 }}>
            {node.type === 'dir' ? 'folder' : 'article'}
          </span>
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:9, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', color:'var(--muted)', marginBottom:1 }}>
            {node.type === 'dir' ? 'Directory' : 'Document'}
          </div>
          <div style={{ fontFamily:'var(--font-hl)', fontSize:13, fontWeight:700, color:'var(--on-surface)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
            {node.name}
          </div>
        </div>
        <div style={{ width:1, height:26, background:'var(--outline)', flexShrink:0 }} />
        <div style={{ display:'flex', gap:4, flexShrink:0 }}>
          <button
            onClick={onAddToContext}
            style={{ width:30, height:30, borderRadius:'var(--r-sm)', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--surface-low)', border:'1px solid var(--outline)', color:'var(--on-variant)', cursor:'pointer' }}
            title="컨텍스트에 추가"
          >
            <span className="icon" style={{ fontSize:15 }}>layers</span>
          </button>
          <button
            onClick={onClose}
            style={{ width:30, height:30, borderRadius:'var(--r-sm)', display:'flex', alignItems:'center', justifyContent:'center', background:'var(--surface-low)', border:'1px solid var(--outline)', color:'var(--on-variant)', cursor:'pointer' }}
            title="닫기"
          >
            <span className="icon" style={{ fontSize:15 }}>close</span>
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Stage.jsx에 NodeDock 통합**

Stage에 `selectedNode` state를 추가하고, 하단 panel-stack에 NodeDock 렌더링:

```jsx
import { lazy, Suspense, useState } from 'react';
import NodeDock from './NodeDock';
// ...
const [selectedNode, setSelectedNode] = useState(null);
// ...
{/* Panel Stack */}
<div style={{ position:'absolute', bottom:10, left:10, right:10, zIndex:35, display:'flex', flexDirection:'column', alignItems:'center', gap:6, pointerEvents:'none' }}>
  <div style={{ pointerEvents:'all' }}>
    {selectedNode && (
      <NodeDock node={selectedNode} onClose={() => setSelectedNode(null)} onAddToContext={() => {}} />
    )}
  </div>
</div>
```

- [ ] **Step 3: 빌드 + 커밋**

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend && npm run build 2>&1 | tail -10
git add services/web-editor/frontend/src/components/
git commit -m "feat: NodeDock 컴포넌트 추가 (선택 노드 상세 패널)"
```

---

### Task 3-2: ContextPanel (컨텍스트 매니저)

**Files:**
- Create: `services/web-editor/frontend/src/components/ContextPanel.jsx`

- [ ] **Step 1: ContextPanel.jsx 작성 (목업의 `.fp-ctx` 구현)**

```jsx
import { useState } from 'react';

export default function ContextPanel({ items = [], onRemove }) {
  const [open, setOpen] = useState(true);
  const tokenTotal = items.reduce((s, i) => s + (i.tokens ?? 0), 0);
  const maxTokens = 32000;
  const pct = Math.min(tokenTotal / maxTokens, 1);

  return (
    <div style={{
      width: 240,
      background: 'color-mix(in srgb, var(--surface) 92%, transparent)',
      backdropFilter: 'blur(18px)',
      border: '1px solid var(--outline)',
      borderRadius: 'var(--r-xl)',
      boxShadow: 'var(--shadow-lg)',
      overflow: 'hidden',
      height: open ? 300 : 36,
      transition: `height var(--dur-slow) var(--ease-out)`,
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Handle */}
      <div
        style={{ display:'flex', alignItems:'center', gap:6, padding:'8px 11px', cursor:'pointer', flexShrink:0 }}
        onClick={() => setOpen(p => !p)}
      >
        <span className="icon" style={{ fontSize:15, color:'var(--primary)' }}>layers</span>
        <span style={{ fontSize:11, fontWeight:700, color:'var(--on-surface)', fontFamily:'var(--font-hl)', flex:1 }}>Context</span>
        {items.length > 0 && (
          <span style={{ minWidth:16, height:16, borderRadius:'var(--r-full)', background:'var(--primary)', color:'var(--primary-icon)', fontSize:9, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', padding:'0 4px' }}>
            {items.length}
          </span>
        )}
        <span className="icon" style={{ fontSize:14, color:'var(--muted)', transform: open ? 'rotate(180deg)' : 'none', transition:'transform var(--dur) var(--ease)' }}>expand_less</span>
      </div>

      {/* Body */}
      {open && (
        <div style={{ flex:1, overflowY:'auto', padding:'0 8px 8px', display:'flex', flexDirection:'column', gap:5 }}>
          {/* Token bar */}
          <div style={{ padding:'5px 7px', background:'var(--surface-low)', borderRadius:'var(--r-sm)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:8, fontWeight:600, textTransform:'uppercase', letterSpacing:'0.06em', color:'var(--muted)', marginBottom:2 }}>
              <span>Context Window</span>
              <span>{(tokenTotal/1000).toFixed(1)}k / 32k</span>
            </div>
            <div style={{ height:3, borderRadius:'var(--r-full)', background:'var(--surface-high)', overflow:'hidden' }}>
              <div style={{ height:'100%', borderRadius:'var(--r-full)', background:'var(--primary)', width:`${pct*100}%`, transition:'width var(--dur) var(--ease)' }} />
            </div>
          </div>

          {items.length === 0 ? (
            <div style={{ fontSize:11, color:'var(--muted)', textAlign:'center', padding:'16px 0' }}>컨텍스트가 비어있습니다</div>
          ) : (
            items.map(item => (
              <div key={item.id} style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 7px', borderRadius:'var(--r-sm)', background:'var(--bg)', border:'1px solid var(--outline)', fontSize:10, cursor:'pointer' }}
                onMouseEnter={e => e.currentTarget.style.borderColor = 'color-mix(in srgb, var(--primary) 40%, transparent)'}
                onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--outline)'}
              >
                <span className="icon" style={{ fontSize:13, color:'var(--on-variant)' }}>{item.type === 'dir' ? 'folder' : 'article'}</span>
                <span style={{ flex:1, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', color:'var(--on-surface)' }}>{item.name}</span>
                <span style={{ fontSize:9, color:'var(--muted)', fontVariantNumeric:'tabular-nums' }}>{item.tokens ? `${item.tokens}` : ''}</span>
                {onRemove && (
                  <button onClick={() => onRemove(item.id)} style={{ fontSize:11, color:'var(--muted)' }}>✕</button>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Stage.jsx에 ContextPanel 통합**

```jsx
import ContextPanel from './ContextPanel';
// ...
const [contextItems, setContextItems] = useState([]);
// float-cluster에 추가:
<div style={{ display:'flex', alignItems:'flex-end', gap:6, maxWidth:'100%' }}>
  <ContextPanel items={contextItems} onRemove={id => setContextItems(p => p.filter(i => i.id !== id))} />
  {/* ChatPanel — Task 3-3에서 추가 */}
</div>
```

- [ ] **Step 3: 빌드 + 커밋**

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend && npm run build 2>&1 | tail -10
git add services/web-editor/frontend/src/components/
git commit -m "feat: ContextPanel 컴포넌트 추가 (컨텍스트 매니저, 토큰 바)"
```

---

## Phase 4: 그래프 Stage 완성 + 목업 D3 통합

### Task 4-1: Stage에 D3 그래프 연동

기존 `FoveatedGraphView` (graph2/) 또는 `GraphCanvas` (graph/)를 Stage에 직접 마운트하고, 노드 클릭 시 NodeDock 연동.

**Files:**
- Modify: `services/web-editor/frontend/src/components/Stage.jsx`

- [ ] **Step 1: Stage.jsx에서 그래프 선택 이벤트 → NodeDock 연동**

```jsx
// FoveatedGraphView에 onNodeSelect 콜백 추가
<FoveatedGraphView
  onUnauthorized={() => {}}
  onOpenNode={(nodeId) => setCurrentFile(nodeId)}
  onNodeSelect={(node) => setSelectedNode(node)}
/>
```

- [ ] **Step 2: FoveatedGraphView에서 onNodeSelect 콜백 호출**

기존 노드 클릭 핸들러에 `props.onNodeSelect?.(node)` 추가 (FoveatedGraphView 내부 수정).

- [ ] **Step 3: 빌드 + 커밋**

```bash
git add services/web-editor/frontend/src/components/
git commit -m "feat: 그래프 노드 클릭 → NodeDock 연동"
```

---

## Phase 5: 레거시 정리

### Task 5-1: 사용하지 않는 파일 제거

**Files:**
- Delete: `services/web-editor/frontend/src/components/ExplorerPanel.jsx`
- Delete: `services/web-editor/frontend/src/components/NavigationRail.jsx`
- Delete: `services/web-editor/frontend/src/components/LeftSidebar.jsx`
- Delete: `services/web-editor/frontend/src/components/GraphPanel.jsx`
- Delete: `services/web-editor/frontend/src/components/RecentFilesPanel.jsx`
- Delete: `services/web-editor/frontend/src/components/SearchPanel.jsx`
- Delete: `services/web-editor/frontend/src/components/shell/AppShell.jsx`

- [ ] **Step 1: 레거시 파일 제거 + 빌드 에러 수정**

```bash
cd /home/ubuntu/project/SynapseNote/services/web-editor/frontend
rm src/components/ExplorerPanel.jsx src/components/NavigationRail.jsx src/components/LeftSidebar.jsx
rm src/components/GraphPanel.jsx src/components/RecentFilesPanel.jsx src/components/SearchPanel.jsx
npm run build 2>&1 | grep -E "error|Error" | head -20
```

- [ ] **Step 2: 남은 import 에러 수정 후 빌드 성공 확인**

- [ ] **Step 3: 최종 커밋**

```bash
git add -A
git commit -m "chore: 레거시 컴포넌트 제거 (ExplorerPanel, NavigationRail, AppShell 등)"
```
