# Backend Document CRUD Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** FastAPI 백엔드에 파일 생성/삭제/이동 엔드포인트를 추가해 Vault 파일시스템 완전한 CRUD를 지원한다.

**Architecture:** 기존 `document_service.py`에 `create_document`, `delete_document`, `move_document` 함수를 추가하고, `document_router.py`에 POST/DELETE/POST(move) 엔드포인트를 추가한다. 인증은 기존 세션 패턴을 그대로 따른다.

**Tech Stack:** Python 3.10+, FastAPI, Pydantic v2, pytest, `pathlib`, `shutil`

---

## File Map

| 파일 | 변경 유형 | 역할 |
|------|-----------|------|
| `services/web/backend/app/schemas.py` | 수정 | `DocumentCreatePayload`, `DocumentMovePayload` 추가 |
| `services/web/backend/app/services/document_service.py` | 수정 | `create_document`, `delete_document`, `move_document` 추가 |
| `services/web/backend/app/routers/document_router.py` | 수정 | POST, DELETE, POST/move 엔드포인트 추가 |
| `services/web/tests/test_document_crud.py` | 신규 | CRUD 전체 테스트 |

---

## 테스트 실행 방법

```bash
cd services/web
SYNAPSENOTE_USER_PASSWORD=secret-pass pytest tests/test_document_crud.py -v
```

> 기존 테스트 패턴: `test_api_app.py` 참고. `TestClient(create_app())`으로 앱 생성, `client.post("/auth/login", ...)` 로 세션 취득.
> `VAULT_ROOT` 환경변수가 없으면 `/vault`를 사용하므로, 테스트에서는 `tmp_path` fixture로 임시 디렉토리를 vault로 지정해야 한다.

---

### Task 1: 스키마 추가

**Files:**
- Modify: `services/web/backend/app/schemas.py`

- [ ] **Step 1: `DocumentCreatePayload`, `DocumentMovePayload` 추가**

`schemas.py` 파일 맨 아래에 다음을 추가한다:

```python
class DocumentCreatePayload(BaseModel):
    path: str
    content: str = ""


class DocumentMovePayload(BaseModel):
    new_path: str
```

- [ ] **Step 2: 커밋**

```bash
git add services/web/backend/app/schemas.py
git commit -m "feat: DocumentCreatePayload, DocumentMovePayload 스키마 추가"
```

---

### Task 2: `document_service.py` — create_document

**Files:**
- Modify: `services/web/backend/app/services/document_service.py`
- Test: `services/web/tests/test_document_crud.py`

- [ ] **Step 1: 테스트 파일 생성 (실패 확인용)**

`services/web/tests/test_document_crud.py` 를 아래 내용으로 생성:

```python
from __future__ import annotations

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def create_test_client(vault_root: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("VAULT_ROOT", str(vault_root))
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")
    # thread-local DB 연결 해제 (각 테스트가 새 vault_root를 사용하므로)
    import app.db.connection as conn_mod
    conn_mod.close_db()
    from app.main import create_app
    return TestClient(create_app())


def sign_in(client: TestClient) -> None:
    r = client.post("/auth/login", json={"userId": "solo", "password": "secret-pass"})
    assert r.status_code == 200


# ── create_document ────────────────────────────────────────────────

def test_create_document_returns_201(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    r = client.post("/api/documents", json={"path": "notes/hello.md", "content": "# Hello\n"})

    assert r.status_code == 201
    data = r.json()["data"]
    assert data["id"] == "notes/hello.md"
    assert data["title"] == "Hello"
    assert (tmp_path / "notes" / "hello.md").read_text() == "# Hello\n"


def test_create_document_conflict_returns_409(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "existing.md").write_text("already here")

    r = client.post("/api/documents", json={"path": "existing.md", "content": ""})

    assert r.status_code == 409
    assert r.json()["detail"] == "document_already_exists"


def test_create_document_non_md_returns_400(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    r = client.post("/api/documents", json={"path": "notes/data.txt", "content": ""})

    assert r.status_code == 400


def test_create_document_path_traversal_returns_400(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    r = client.post("/api/documents", json={"path": "../outside.md", "content": ""})

    assert r.status_code == 400


def test_create_document_unauthorized_returns_401(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    # sign_in 호출 안 함

    r = client.post("/api/documents", json={"path": "note.md", "content": ""})

    assert r.status_code == 401
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd services/web
SYNAPSENOTE_USER_PASSWORD=secret-pass pytest tests/test_document_crud.py::test_create_document_returns_201 -v
```

Expected: FAIL (`ImportError` 또는 `404`)

- [ ] **Step 3: `create_document` 구현**

`services/web/backend/app/services/document_service.py` 맨 아래에 추가:

```python
def create_document(path: str, content: str = "") -> dict[str, str]:
    """Vault에 새 마크다운 파일을 생성한다.

    Raises FileExistsError if the file already exists.
    Raises ValueError for invalid paths.
    """
    _validate_path(path)
    vault_root = get_vault_root()
    file_path = (vault_root / path).resolve()

    if not str(file_path).startswith(str(vault_root)):
        raise ValueError("path traversal not allowed")

    if file_path.exists():
        raise FileExistsError(f"document already exists: {path}")

    file_path.parent.mkdir(parents=True, exist_ok=True)
    file_path.write_text(content, encoding="utf-8")

    stem = file_path.stem
    title = _extract_title(content, stem)
    updated_at = datetime.fromtimestamp(file_path.stat().st_mtime).isoformat()

    return {
        "id": path,
        "title": title,
        "updatedAt": updated_at,
    }
```

- [ ] **Step 4: `document_router.py`에 POST 엔드포인트 추가**

`document_router.py` import에 추가:
```python
from app.schemas import DocumentCreatePayload, DocumentMovePayload, DocumentWritePayload
from app.services.document_service import (
    create_document,
    delete_document,
    move_document,
    read_document,
    write_document,
)
```

라우터 함수 추가:
```python
@router.post("/documents", status_code=201)
async def post_document(
    payload: DocumentCreatePayload,
    request: Request,
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        data = create_document(payload.path, payload.content)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="document_already_exists")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": data, "meta": {}}
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

```bash
cd services/web
SYNAPSENOTE_USER_PASSWORD=secret-pass pytest tests/test_document_crud.py::test_create_document_returns_201 tests/test_document_crud.py::test_create_document_conflict_returns_409 tests/test_document_crud.py::test_create_document_non_md_returns_400 tests/test_document_crud.py::test_create_document_path_traversal_returns_400 tests/test_document_crud.py::test_create_document_unauthorized_returns_401 -v
```

Expected: 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add services/web/backend/app/services/document_service.py \
        services/web/backend/app/routers/document_router.py \
        services/web/tests/test_document_crud.py
git commit -m "feat: 문서 생성 API (POST /api/documents) 추가"
```

---

### Task 3: `document_service.py` — delete_document

**Files:**
- Modify: `services/web/backend/app/services/document_service.py`
- Modify: `services/web/backend/app/routers/document_router.py`
- Test: `services/web/tests/test_document_crud.py`

- [ ] **Step 1: 테스트 추가**

`test_document_crud.py` 맨 아래에 추가:

```python
# ── delete_document ────────────────────────────────────────────────

def test_delete_document_removes_file(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "to-delete.md").write_text("# Delete me\n")

    r = client.delete("/api/documents/to-delete.md")

    assert r.status_code == 200
    assert r.json()["data"]["id"] == "to-delete.md"
    assert not (tmp_path / "to-delete.md").exists()


def test_delete_document_not_found_returns_404(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    r = client.delete("/api/documents/ghost.md")

    assert r.status_code == 404
    assert r.json()["detail"] == "document_not_found"


def test_delete_document_path_traversal_returns_400(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    # HTTP 클라이언트가 "../" 를 정규화하므로 퍼센트 인코딩 사용
    r = client.delete("/api/documents/..%2Foutside.md")

    assert r.status_code == 400


def test_delete_document_unauthorized_returns_401(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)

    r = client.delete("/api/documents/note.md")

    assert r.status_code == 401
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd services/web
SYNAPSENOTE_USER_PASSWORD=secret-pass pytest tests/test_document_crud.py::test_delete_document_removes_file -v
```

Expected: FAIL (`404` — 엔드포인트 없음)

- [ ] **Step 3: `delete_document` 서비스 구현**

`document_service.py` 맨 아래에 추가:

```python
def delete_document(node_id: str) -> dict[str, str]:
    """Vault에서 마크다운 파일을 삭제한다.

    Raises FileNotFoundError if the file does not exist.
    Raises ValueError for invalid paths.
    """
    _validate_path(node_id)
    vault_root = get_vault_root()
    file_path = (vault_root / node_id).resolve()

    if not str(file_path).startswith(str(vault_root)):
        raise ValueError("path traversal not allowed")

    if not file_path.exists():
        raise FileNotFoundError(f"document not found: {node_id}")

    if file_path.is_dir():
        raise ValueError(f"not a file: {node_id}")

    file_path.unlink()

    return {"id": node_id}
```

- [ ] **Step 4: DELETE 엔드포인트 추가**

`document_router.py`에 추가:

```python
@router.delete("/documents/{node_id:path}")
async def delete_document_endpoint(
    node_id: str,
    request: Request,
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        data = delete_document(node_id)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="document_not_found")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": data, "meta": {}}
```

- [ ] **Step 5: 테스트 실행 — 통과 확인**

```bash
cd services/web
SYNAPSENOTE_USER_PASSWORD=secret-pass pytest tests/test_document_crud.py -k "delete" -v
```

Expected: 4개 모두 PASS

- [ ] **Step 6: 커밋**

```bash
git add services/web/backend/app/services/document_service.py \
        services/web/backend/app/routers/document_router.py \
        services/web/tests/test_document_crud.py
git commit -m "feat: 문서 삭제 API (DELETE /api/documents/{id}) 추가"
```

---

### Task 4: `document_service.py` — move_document

**Files:**
- Modify: `services/web/backend/app/services/document_service.py`
- Modify: `services/web/backend/app/routers/document_router.py`
- Test: `services/web/tests/test_document_crud.py`

- [ ] **Step 1: 테스트 추가**

`test_document_crud.py` 맨 아래에 추가:

```python
# ── move_document ──────────────────────────────────────────────────

def test_move_document_renames_file(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "old-name.md").write_text("# Old\n")

    r = client.post(
        "/api/documents/old-name.md/move",
        json={"new_path": "new-name.md"},
    )

    assert r.status_code == 200
    data = r.json()["data"]
    assert data["id"] == "new-name.md"
    assert not (tmp_path / "old-name.md").exists()
    assert (tmp_path / "new-name.md").exists()


def test_move_document_to_subdirectory(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "note.md").write_text("# Note\n")

    r = client.post(
        "/api/documents/note.md/move",
        json={"new_path": "subdir/note.md"},
    )

    assert r.status_code == 200
    assert (tmp_path / "subdir" / "note.md").exists()


def test_move_document_source_not_found_returns_404(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    r = client.post(
        "/api/documents/ghost.md/move",
        json={"new_path": "new.md"},
    )

    assert r.status_code == 404
    assert r.json()["detail"] == "document_not_found"


def test_move_document_destination_exists_returns_409(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "src.md").write_text("source")
    (tmp_path / "dst.md").write_text("destination")

    r = client.post(
        "/api/documents/src.md/move",
        json={"new_path": "dst.md"},
    )

    assert r.status_code == 409
    assert r.json()["detail"] == "destination_already_exists"


def test_move_document_path_traversal_returns_400(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "note.md").write_text("x")

    # new_path의 traversal은 request body에 있으므로 퍼센트 인코딩 불필요
    # (서비스 레이어에서 _validate_path가 ".." 세그먼트를 검사)
    r = client.post(
        "/api/documents/note.md/move",
        json={"new_path": "../outside.md"},
    )

    assert r.status_code == 400


def test_move_document_unauthorized_returns_401(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)

    r = client.post("/api/documents/note.md/move", json={"new_path": "new.md"})

    assert r.status_code == 401
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

```bash
cd services/web
SYNAPSENOTE_USER_PASSWORD=secret-pass pytest tests/test_document_crud.py::test_move_document_renames_file -v
```

Expected: FAIL

- [ ] **Step 3: `move_document` 서비스 구현**

`document_service.py`에 `import shutil` 추가 (파일 상단), 그리고 맨 아래에 추가:

```python
def move_document(node_id: str, new_path: str) -> dict[str, str]:
    """Vault 내에서 마크다운 파일을 이동하거나 이름을 변경한다.

    Raises FileNotFoundError if source does not exist.
    Raises FileExistsError if destination already exists.
    Raises ValueError for invalid paths.
    """
    _validate_path(node_id)
    _validate_path(new_path)
    vault_root = get_vault_root()

    src_path = (vault_root / node_id).resolve()
    dst_path = (vault_root / new_path).resolve()

    if not str(src_path).startswith(str(vault_root)):
        raise ValueError("path traversal not allowed")
    if not str(dst_path).startswith(str(vault_root)):
        raise ValueError("path traversal not allowed")

    if not src_path.exists():
        raise FileNotFoundError(f"document not found: {node_id}")

    if dst_path.exists():
        raise FileExistsError(f"destination already exists: {new_path}")

    dst_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.move(str(src_path), str(dst_path))

    content = dst_path.read_text(encoding="utf-8", errors="replace")
    stem = dst_path.stem
    title = _extract_title(content, stem)
    updated_at = datetime.fromtimestamp(dst_path.stat().st_mtime).isoformat()

    return {
        "id": new_path,
        "title": title,
        "updatedAt": updated_at,
    }
```

- [ ] **Step 4: move 엔드포인트 추가**

`document_router.py`에 추가:

```python
@router.post("/documents/{node_id:path}/move")
async def move_document_endpoint(
    node_id: str,
    payload: DocumentMovePayload,
    request: Request,
) -> dict[str, object]:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="unauthorized")

    try:
        data = move_document(node_id, payload.new_path)
    except FileNotFoundError:
        raise HTTPException(status_code=404, detail="document_not_found")
    except FileExistsError:
        raise HTTPException(status_code=409, detail="destination_already_exists")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    return {"success": True, "data": data, "meta": {}}
```

- [ ] **Step 5: 전체 테스트 실행 — 통과 확인**

```bash
cd services/web
SYNAPSENOTE_USER_PASSWORD=secret-pass pytest tests/test_document_crud.py -v
```

Expected: 모든 테스트 PASS (15개 이상)

- [ ] **Step 6: 기존 테스트 회귀 확인**

```bash
cd services/web
SYNAPSENOTE_USER_PASSWORD=secret-pass pytest tests/ -v --ignore=tests/test_agent_runtime.py
```

Expected: 기존 테스트 모두 통과

- [ ] **Step 7: 커밋**

```bash
git add services/web/backend/app/services/document_service.py \
        services/web/backend/app/routers/document_router.py \
        services/web/tests/test_document_crud.py
git commit -m "feat: 문서 이동/이름변경 API (POST /api/documents/{id}/move) 추가"
```
