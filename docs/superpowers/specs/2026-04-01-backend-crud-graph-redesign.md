# SynapseNote 재구성 설계 스펙

**날짜:** 2026-04-01  
**범위:** 백엔드 완전한 CRUD API + 프론트엔드 그래프 뷰 재설계  
**상태:** 승인됨

---

## 1. 배경 및 목표

### 백엔드
- CouchDB/LiveSync 의존성은 이미 제거된 상태 (`_archives/livesync-bridge/`에 보관됨)
- 현재 백엔드는 SQLite + Vault 파일시스템 기반으로 동작 중
- 문서 CRUD에서 읽기/쓰기만 존재 — 생성/삭제/이동 엔드포인트 부재
- **목표**: 완전한 파일시스템 CRUD API 제공

### 프론트엔드
- 기존 `graph2/` Foveated Canvas 렌더러는 폐기
- D3.js force simulation + SVG 기반으로 완전 재설계
- 레퍼런스: `references/synapse-note-graph-sample.zip` (Material You 다크 테마)
- **목표**: 600노드/1500간선 규모에서도 60fps 유지, 다른 워크스페이스와 유기적 연동

---

## 2. 백엔드: 완전한 CRUD API

### 2-1. 새 엔드포인트

| 메서드 | 경로 | 동작 |
|--------|------|------|
| `POST` | `/api/documents` | 새 파일 생성 |
| `DELETE` | `/api/documents/{node_id:path}` | 파일 삭제 |
| `POST` | `/api/documents/{node_id:path}/move` | 파일 이동/이름변경 |

기존 엔드포인트 유지:
- `GET /api/documents/{node_id:path}` — 파일 읽기
- `PUT /api/documents/{node_id:path}` — 파일 쓰기(내용 업데이트)

### 2-2. 인증
모든 신규 엔드포인트에 기존과 동일한 세션 인증 적용.
`request.session.get("user_id")` 없으면 `401 unauthorized`.

### 2-3. 요청/응답 스키마

**POST `/api/documents`**
```json
// Request
{ "path": "folder/new-note.md", "content": "# New Note\n" }

// Response 201
{ "success": true, "data": { "id": "folder/new-note.md", "title": "New Note", "updatedAt": "..." }, "meta": {} }

// 에러: 파일 이미 존재
{ "status": 409, "detail": "document_already_exists" }

// 에러: 잘못된 경로 (.md 아님, path traversal)
{ "status": 400, "detail": "..." }
```

**DELETE `/api/documents/{node_id:path}`**
```json
// Response 200
{ "success": true, "data": { "id": "folder/note.md" }, "meta": {} }

// 에러: 파일 없음
{ "status": 404, "detail": "document_not_found" }
```

**POST `/api/documents/{node_id:path}/move`**
```json
// Request
{ "new_path": "new-folder/renamed-note.md" }

// Response 200
{ "success": true, "data": { "id": "new-folder/renamed-note.md", "title": "...", "updatedAt": "..." }, "meta": {} }

// 에러: 원본 없음
{ "status": 404, "detail": "document_not_found" }

// 에러: 대상 경로에 파일 이미 존재 (덮어쓰기 불허)
{ "status": 409, "detail": "destination_already_exists" }
```

`move`는 이름변경과 디렉토리 이동을 동일 엔드포인트로 처리 (`new_path`에 다른 디렉토리 경로 포함 가능).

### 2-4. document_service.py 추가 함수

- `create_document(path: str, content: str) -> dict`
  - `_validate_path()` 적용
  - 파일 존재 시 `FileExistsError` raise → 라우터에서 409
  - 부모 디렉토리 없으면 자동 생성

- `delete_document(node_id: str) -> dict`
  - `_validate_path()` 적용
  - vault root 경계 검사
  - 파일 삭제 후, 빈 부모 디렉토리는 정리하지 않음 (안전성 우선)

- `move_document(node_id: str, new_path: str) -> dict`
  - 원본과 대상 모두 `_validate_path()` 적용
  - 대상 경로 파일 존재 시 `FileExistsError` raise → 409
  - `shutil.move` 사용, 대상 부모 디렉토리 없으면 자동 생성

**`_validate_path()` 책임** (기존 함수 그대로, 모든 엔드포인트에 공통 적용):
1. `..` 세그먼트 포함 시 `ValueError("path traversal not allowed")`
2. `.md` 확장자가 아닌 경우 `ValueError("only markdown (.md) files are supported")`

추가로 resolve 후 vault root 경계 재검사:
```python
file_path = (vault_root / node_id).resolve()
if not str(file_path).startswith(str(vault_root)):
    raise ValueError("path traversal not allowed")
```
`move_document`는 원본(`node_id`)과 대상(`new_path`) 양쪽 모두 `_validate_path()` 적용.

### 2-5. 인덱서 연동 — 최종 일관성 허용

파일 CRUD 후 `VaultWatcher`(watchdog)가 파일 변경을 감지해 SQLite를 비동기 갱신한다.
**API 레벨에서 동기 재색인을 하지 않는다** — 이유: watchdog 이벤트가 수십ms 내 발생하므로 실용적 지연이 미미하고, 동기 재색인은 API 응답 지연을 초래한다.

프론트엔드 전략:
- 파일 생성/삭제/이동 직후 `useGraphData.refetch()` 호출 (500ms 디바운스)
- 그래프가 stale할 수 있음을 UI에서 허용 (Obsidian 원본과 동일한 접근)

### 2-6. schemas.py 추가
```python
class DocumentCreatePayload(BaseModel):
    path: str
    content: str = ""

class DocumentMovePayload(BaseModel):
    new_path: str
```

---

## 3. 프론트엔드: 그래프 뷰 재설계

### 3-1. 폐기 대상
`services/web/frontend/src/components/graph2/` 디렉토리 전체 삭제:
- `FoveatedGraphView.jsx`
- `GraphCanvas.jsx`
- `mockData.js`

### 3-2. 의존성 추가

현재 `package.json` 상태:
- `d3-force` ^3.0.0 — 이미 있음
- `d3` 전체 패키지 — **없음, 추가 필요** (`d3-zoom`, `d3-drag`, `d3-selection` 등 필요)
- `motion` / `framer-motion` — **없음, 추가 필요**

추가할 패키지:
```bash
npm install d3@^7 motion
```

`d3-force`는 `d3`에 포함되므로 별도 항목 유지 불필요 (제거 또는 유지 모두 무방).

### 3-3. 컴포넌트 구조

실제 파일 경로: `services/web/frontend/src/`

```
components/workspace/GraphWorkspace.jsx   ← 기존 파일, GraphView로 내부 교체
components/graph/GraphView.jsx            ← 신규: 패널 상태 관리
components/graph/D3GraphPanel.jsx         ← 신규: D3 SVG 그래프
components/graph/SidePanel.jsx            ← 신규: 우측 패널 컨테이너 (너비 transition)
components/graph/NodeDetailPanel.jsx      ← 신규: 디테일 뷰
components/graph/NodeEditorPanel.jsx      ← 신규: 에디터 뷰
components/graph/NodeContextPanel.jsx     ← 신규: 컨텍스트 추가 뷰
```

기존 `components/graph/` 폴더 내 파일들(`GraphCanvas.jsx`, `NodeDetailPanel.jsx` 등)은
새 구현으로 덮어쓰거나 대체.

### 3-4. 패널 상태 머신

**상태 정의:**

| 상태 | 패널 너비 | 설명 |
|------|-----------|------|
| `collapsed` | 0px | 패널 없음, 그래프 전체화면 |
| `detail` | 380px | 노드 디테일 패널 |
| `editor` | 600px | 에디터 패널 (detail에서 확장) |
| `context` | 380px | 컨텍스트 추가 패널 |

**전환 규칙:**

```
collapsed
  ─[노드 클릭]──────────────────→  detail
  
detail
  ─[닫기 버튼 / 배경 클릭]────→  collapsed
  ─["에디터에서 편집" 클릭]────→  editor      (너비 380→600px 애니메이션, 내용 crossfade)
  ─["컨텍스트에 추가" 클릭]───→  context     (내용 crossfade, 너비 유지 380px)
  ─[다른 노드 클릭]────────────→  detail      (선택 노드 교체)

editor
  ─[닫기 버튼]─────────────────→  collapsed   (너비 600→0px)
  ─[그래프 배경 클릭]──────────→  editor 유지  (에디터 중 실수 방지, 배경 클릭 무시)
  ─[다른 노드 클릭]────────────→  editor      (에디터 파일 교체, unsaved 경고 표시)
  ─["디테일 보기" 버튼]────────→  detail      (너비 600→380px, 내용 crossfade)

context
  ─[닫기 버튼]─────────────────→  collapsed
  ─[그래프 배경 클릭]──────────→  collapsed   (context는 일시적 뷰이므로 배경 클릭으로 닫힘)
  ─[다른 노드 클릭]────────────→  detail      (새 노드 디테일로 복귀)
  ─["에디터에서 편집" 클릭]────→  editor      (unsaved 없으므로 경고 없이 전환)
```

**Unsaved changes 처리:**
- `editor` 상태에서 다른 노드 클릭 시: 미저장 변경이 있으면 인라인 경고 배너 표시, 사용자가 "버리기" 또는 "저장 후 이동" 선택
- `context → editor` 전환: context는 읽기 전용 뷰이므로 unsaved 상태가 없음, 경고 없이 전환
- `editor → detail` 전환("디테일 보기" 클릭): 미저장 변경이 있으면 동일하게 인라인 경고 표시

### 3-5. D3GraphPanel 성능 최적화

**문제**: 600노드/1500간선에서 매 tick DOM 업데이트 시 심각한 성능 저하 (기존 경험)

**해결 전략:**

**① 백그라운드 수렴 후 첫 렌더**
```js
// UI 없이 simulation 수렴 완료 후 한 번에 렌더
simulation.stop();
for (let i = 0; i < 300; i++) simulation.tick(); // alphaMin 도달까지
// 수렴된 좌표로 SVG 첫 렌더 → 노드 튀는 현상 없음
```

**② RAF throttle**
```js
let rafPending = false;
simulation.on('tick', () => {
  if (rafPending) return;
  rafPending = true;
  requestAnimationFrame(() => {
    updatePositions(); // DOM 업데이트
    rafPending = false;
  });
});
```

**③ 뷰포트 컬링**
현재 zoom transform 기준 뷰포트 bbox 계산.
bbox 밖 노드 그룹은 `visibility: hidden` 처리 (DOM 유지, 페인트 스킵).

**④ 간선 LOD (Level of Detail)**
- zoom scale < 0.3: `weight < 1.0` 간선 `display: none`
- zoom scale < 0.15: 모든 간선 숨김

**⑤ 노드 선택 시 부분 재시뮬레이션**
```js
// 전체 alpha(1) 재시작 금지
simulation.alpha(0.2).restart(); // 선택 노드와 1-hop에만 radial force 추가
```

**D3 Force 파라미터 (600노드 기준 튜닝값):**
```js
d3.forceSimulation(nodes)
  .force('link', d3.forceLink(links).id(d => d.id).distance(120))
  .force('charge', d3.forceManyBody().strength(-400))
  .force('center', d3.forceCenter(w/2, h/2))
  .force('collision', d3.forceCollide().radius(30))
  .alphaDecay(0.03)      // 기본 0.0228보다 느리게 수렴 (레이아웃 품질)
  .velocityDecay(0.4)    // 기본 0.4 유지
```

### 3-6. 그래프 데이터 연동

`useGraphData.js`는 이미 실제 `/api/graph` API에 연동되어 있음 (Mock 없음).
반환 형태: `{ nodes: enriched[], links[] }` — D3 nodes/links 포맷과 호환.

`D3GraphPanel`은 `useGraphData`를 직접 사용하지 않고,
`GraphView`에서 데이터를 받아 props로 전달 (단방향 데이터 흐름 유지).

### 3-7. 노드 시각화

노드 크기는 **degree(연결 수)에 비례**해 동적 결정:

| 타입 | 반지름 범위 | 기본 색상 | 아이콘 (SVG foreignObject) |
|------|------------|-----------|--------------------------|
| `Directory` | min 20, max 36 | `#7c3aed` | Material Symbol `folder` |
| `Document` degree ≥ 5 | min 14, max 26 | `#0566d9` | 없음 |
| `Document` degree < 5 | 8 (고정) | `#4a4455` | 없음 |

간선 색상:
- `wikilink`: `rgba(124, 58, 237, 0.4)`
- `directory`: `rgba(74, 68, 85, 0.3)`

### 3-8. 디자인 시스템

**`tokens.css`에 추가할 색상 토큰:**
```css
--color-primary: #d2bbff;
--color-primary-container: #7c3aed;
--color-secondary: #adc6ff;
--color-secondary-container: #0566d9;
--color-tertiary: #ffb784;
--color-outline-variant: #4a4455;
--color-surface-container-low: #1c1b1b;
--color-surface-container-high: #2a2a2a;
--color-surface-container-highest: #353534;
--color-surface-container-lowest: #0e0e0e;
```

**추가 유틸리티 클래스 (기존 CSS 파일에 추가):**
```css
.glass-panel {
  background: rgba(19, 19, 19, 0.7);
  backdrop-filter: blur(20px);
}
.synapse-glow {
  box-shadow: 0 0 15px rgba(124, 58, 237, 0.4);
}
```

**폰트:** Google Fonts `Lexend` + `Inter` — `index.html`에 `<link>` 추가.

---

## 4. 파일 변경 목록

모든 경로는 `services/web/frontend/src/` 기준.

### 백엔드 수정 (`services/web/backend/app/`)
- `services/document_service.py` — `create_document`, `delete_document`, `move_document` 추가
- `routers/document_router.py` — POST, DELETE, POST/move 엔드포인트 추가
- `schemas.py` — `DocumentCreatePayload`, `DocumentMovePayload` 추가

### 프론트엔드 삭제
- `components/graph2/FoveatedGraphView.jsx`
- `components/graph2/GraphCanvas.jsx`
- `components/graph2/mockData.js`

### 프론트엔드 신규
- `components/graph/GraphView.jsx`
- `components/graph/D3GraphPanel.jsx`
- `components/graph/SidePanel.jsx`
- `components/graph/NodeDetailPanel.jsx`
- `components/graph/NodeEditorPanel.jsx`
- `components/graph/NodeContextPanel.jsx`

### 프론트엔드 수정
- `components/workspace/GraphWorkspace.jsx` — `GraphView` 사용하도록 교체
- `styles/tokens.css` — 색상 토큰 추가
- `../../index.html` — Google Fonts 링크 추가
- `../../package.json` — `d3@^7`, `motion` 추가

---

## 5. 의존성

### 프론트엔드 추가
```bash
npm install d3@^7 motion
```
- `d3-force` (기존) → `d3` 패키지에 포함되므로 별도 항목 유지해도 무방
- `motion` — AnimatePresence crossfade 및 패널 너비 전환

### 백엔드 추가 없음
기존 FastAPI, watchdog, SQLite로 충분.

---

## 6. 테스트 전략

### 백엔드
`services/web/tests/test_document_crud.py` 추가:
- `create_document` happy path
- `create_document` 중복 생성 → 409
- `delete_document` happy path
- `delete_document` 없는 파일 → 404
- `move_document` happy path (이름변경)
- `move_document` happy path (디렉토리 이동)
- `move_document` 대상 존재 → 409
- `create/delete/move` path traversal → 400
- `create/delete/move` `.md` 확장자 아닌 경로 → 400 (`.md` 확장자 검증은 `_validate_path()` 내부에서 수행, 모든 엔드포인트 공통 적용)
- `move_document` 원본 없음 → 404
- 인증 없는 요청 → 401 (세 엔드포인트 각각 테스트)

### 프론트엔드
vitest + jsdom:
- `D3GraphPanel` 마운트 렌더 테스트 (nodes/links props)
- `GraphView` 패널 상태 전환: `collapsed → detail → editor → collapsed`
- `GraphView` 패널 상태 전환: `detail → context → collapsed`
- `NodeEditorPanel` unsaved changes 경고 표시 테스트
