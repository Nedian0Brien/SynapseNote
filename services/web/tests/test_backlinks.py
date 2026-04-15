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

    from app.main import create_app
    from app.testing import create_sync_test_client

    return create_sync_test_client(create_app())


def sign_in(client) -> None:
    response = client.post(
        "/auth/login",
        json={"userId": "solo", "password": "secret-pass"},
    )
    assert response.status_code == 200


def test_backlinks_endpoint_returns_sources(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))
    (tmp_path / "a.md").write_text("[[b]]\n", encoding="utf-8")
    (tmp_path / "b.md").write_text("# B\n", encoding="utf-8")
    run_vault_index()

    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    response = client.get("/api/nodes/b.md/backlinks")

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["data"] == [
        {"id": "a.md", "title": "a", "edge_type": "wikilink"},
    ]


def test_backlinks_endpoint_returns_empty_list(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))
    (tmp_path / "solo.md").write_text("# Solo\n", encoding="utf-8")
    run_vault_index()

    client = create_test_client(tmp_path, monkeypatch)
    sign_in(client)

    response = client.get("/api/nodes/solo.md/backlinks")

    assert response.status_code == 200
    assert response.json()["data"] == []


def test_backlinks_endpoint_requires_auth(tmp_path, monkeypatch):
    monkeypatch.setenv("VAULT_ROOT", str(tmp_path))
    (tmp_path / "b.md").write_text("# B\n", encoding="utf-8")
    run_vault_index()

    client = create_test_client(tmp_path, monkeypatch)

    response = client.get("/api/nodes/b.md/backlinks")

    assert response.status_code == 401
