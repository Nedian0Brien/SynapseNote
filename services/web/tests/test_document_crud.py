from __future__ import annotations

import sys
from pathlib import Path

from conftest import run_vault_index

BACKEND_ROOT = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))


def create_test_client(vault_root: Path, monkeypatch):
    monkeypatch.setenv("VAULT_ROOT", str(vault_root))
    monkeypatch.setenv("SYNAPSENOTE_USER_ID", "solo")
    monkeypatch.setenv("SYNAPSENOTE_USER_PASSWORD", "secret-pass")
    run_vault_index()

    from app.main import create_app
    from app.testing import create_sync_test_client

    return create_sync_test_client(create_app())


def sign_in(client) -> None:
    response = client.post(
        "/auth/login",
        json={"userId": "solo", "password": "secret-pass"},
    )
    assert response.status_code == 200


def test_create_document_returns_201(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    response = client.post(
        "/api/documents",
        json={"path": "notes/hello.md", "content": "# Hello\n"},
    )

    assert response.status_code == 201
    data = response.json()["data"]
    assert data["id"] == "notes/hello.md"
    assert data["title"] == "Hello"
    assert (tmp_path / "notes" / "hello.md").read_text(encoding="utf-8") == "# Hello\n"


def test_create_document_conflict_returns_409(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "existing.md").write_text("already here", encoding="utf-8")

    response = client.post(
        "/api/documents",
        json={"path": "existing.md", "content": ""},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "document_already_exists"


def test_create_document_non_md_returns_400(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    response = client.post(
        "/api/documents",
        json={"path": "notes/data.txt", "content": ""},
    )

    assert response.status_code == 400


def test_create_document_path_traversal_returns_400(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    response = client.post(
        "/api/documents",
        json={"path": "../outside.md", "content": ""},
    )

    assert response.status_code == 400


def test_create_document_unauthorized_returns_401(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)

    response = client.post(
        "/api/documents",
        json={"path": "note.md", "content": ""},
    )

    assert response.status_code == 401


def test_delete_document_removes_file(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "to-delete.md").write_text("# Delete me\n", encoding="utf-8")

    response = client.delete("/api/documents/to-delete.md")

    assert response.status_code == 200
    assert response.json()["data"]["id"] == "to-delete.md"
    assert not (tmp_path / "to-delete.md").exists()


def test_delete_document_not_found_returns_404(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    response = client.delete("/api/documents/ghost.md")

    assert response.status_code == 404
    assert response.json()["detail"] == "document_not_found"


def test_delete_document_path_traversal_returns_400(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    response = client.delete("/api/documents/..%2Foutside.md")

    assert response.status_code == 400


def test_delete_document_unauthorized_returns_401(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)

    response = client.delete("/api/documents/note.md")

    assert response.status_code == 401


def test_move_document_renames_file(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "old-name.md").write_text("# Old\n", encoding="utf-8")

    response = client.post(
        "/api/documents/old-name.md/move",
        json={"new_path": "new-name.md"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["id"] == "new-name.md"
    assert not (tmp_path / "old-name.md").exists()
    assert (tmp_path / "new-name.md").exists()


def test_move_document_to_subdirectory(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "note.md").write_text("# Note\n", encoding="utf-8")

    response = client.post(
        "/api/documents/note.md/move",
        json={"new_path": "subdir/note.md"},
    )

    assert response.status_code == 200
    assert (tmp_path / "subdir" / "note.md").exists()


def test_move_document_source_not_found_returns_404(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    response = client.post(
        "/api/documents/ghost.md/move",
        json={"new_path": "new.md"},
    )

    assert response.status_code == 404
    assert response.json()["detail"] == "document_not_found"


def test_move_document_destination_exists_returns_409(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "src.md").write_text("source", encoding="utf-8")
    (tmp_path / "dst.md").write_text("destination", encoding="utf-8")

    response = client.post(
        "/api/documents/src.md/move",
        json={"new_path": "dst.md"},
    )

    assert response.status_code == 409
    assert response.json()["detail"] == "destination_already_exists"


def test_move_document_path_traversal_returns_400(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)
    (tmp_path / "note.md").write_text("x", encoding="utf-8")

    response = client.post(
        "/api/documents/note.md/move",
        json={"new_path": "../outside.md"},
    )

    assert response.status_code == 400


def test_move_document_unauthorized_returns_401(tmp_path, monkeypatch):
    client = create_test_client(tmp_path, monkeypatch)

    response = client.post(
        "/api/documents/note.md/move",
        json={"new_path": "new.md"},
    )

    assert response.status_code == 401
