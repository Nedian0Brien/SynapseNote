import base64
import importlib.util
import sys
import tempfile
import unittest
from pathlib import Path

_WEB_EDITOR_ROOT = str(Path(__file__).resolve().parents[1])
_WEB_EDITOR_APP_PATH = Path(_WEB_EDITOR_ROOT) / "app.py"

# Flask app.py는 web-editor 루트가 sys.path에 있어야 base_routes 등을 import할 수 있다.
# 단, FastAPI backend/app/ 패키지보다 낮은 우선순위를 유지하기 위해 append로 추가한다.
if _WEB_EDITOR_ROOT not in sys.path:
    sys.path.append(_WEB_EDITOR_ROOT)

_spec = importlib.util.spec_from_file_location("flask_app", _WEB_EDITOR_APP_PATH)
web_app = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(web_app)


class GraphViewTestCase(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.vault_root = Path(self.temp_dir.name) / "vault"
        self.vault_root.mkdir(parents=True, exist_ok=True)

        web_app.VAULT_ROOT = self.vault_root.resolve()
        web_app.TRASH_DIR = web_app.VAULT_ROOT / ".obsidian-web-trash"
        web_app.VERSION_DIR = web_app.VAULT_ROOT / ".obsidian-web-versions"
        web_app.BASIC_AUTH_USER = "admin"
        web_app.BASIC_AUTH_PASSWORD = "admin"

        web_app.app.config["TESTING"] = True
        self.client = web_app.app.test_client()

        token = base64.b64encode(b"admin:admin").decode("utf-8")
        self.auth_headers = {"Authorization": f"Basic {token}"}

    def tearDown(self):
        self.temp_dir.cleanup()

    def _write_note(self, relative_path: str, content: str):
        note_path = self.vault_root / relative_path
        note_path.parent.mkdir(parents=True, exist_ok=True)
        note_path.write_text(content, encoding="utf-8")

    def test_normalize_graph_target_handles_relative_alias_and_extension(self):
        known_paths = {"notes/source.md", "notes/target.md", "root.md"}
        stem_lookup = {
            "source": ["notes/source.md"],
            "target": ["notes/target.md"],
            "root": ["root.md"],
        }

        result_alias_anchor = web_app.normalize_graph_target(
            "target|별칭#section",
            "notes/source.md",
            known_paths,
            stem_lookup,
        )
        result_relative = web_app.normalize_graph_target(
            "../root",
            "notes/source.md",
            known_paths,
            stem_lookup,
        )

        self.assertEqual(result_alias_anchor, "notes/target.md")
        self.assertEqual(result_relative, "root.md")

    def test_extract_links_from_markdown_filters_external_and_self_links(self):
        source_path = "notes/source.md"
        known_paths = {"notes/source.md", "notes/target.md"}
        stem_lookup = {
            "source": ["notes/source.md"],
            "target": ["notes/target.md"],
        }
        content = "\n".join(
            [
                "[[target]]",
                "[[source]]",
                "[target link](./target.md#header)",
                "[external](https://example.com)",
            ]
        )

        links = web_app.extract_links_from_markdown(content, source_path, known_paths, stem_lookup)

        self.assertEqual(links, {"notes/target.md"})

    def test_api_graph_requires_authentication(self):
        response = self.client.get("/api/graph")
        self.assertEqual(response.status_code, 401)

    def test_api_graph_returns_expected_schema_and_stats(self):
        self._write_note("a.md", "[[b]]\n[c link](c.md)")
        self._write_note("b.md", "[[a]]")
        self._write_note("c.md", "plain text")

        response = self.client.get("/api/graph", headers=self.auth_headers)
        self.assertEqual(response.status_code, 200)

        payload = response.get_json()
        self.assertIn("nodes", payload)
        self.assertIn("edges", payload)
        self.assertIn("stats", payload)

        stats = payload["stats"]
        self.assertEqual(stats["nodes"], 3)
        self.assertEqual(stats["edges"], 3)
        self.assertEqual(stats["orphan_nodes"], 0)

        node_ids = {node["id"] for node in payload["nodes"]}
        self.assertEqual(node_ids, {"a.md", "b.md", "c.md"})

        for node in payload["nodes"]:
            self.assertIn("path", node)
            self.assertIn("name", node)
            self.assertIn("directory", node)
            self.assertIn("inbound", node)
            self.assertIn("outbound", node)

    def test_graph_and_file_listing_ignore_pytest_cache(self):
        pytest_cache = self.vault_root / ".pytest_cache"
        pytest_cache.mkdir()
        (pytest_cache / "README.md").write_text("cache", encoding="utf-8")
        self._write_note("notes/kept.md", "# Kept\n\nreal note")

        entries = web_app.list_entries(self.vault_root, recursive=False)
        payload = web_app.build_graph_payload()

        listed_paths = {entry["path"] for entry in entries}
        node_ids = {node["id"] for node in payload["nodes"]}

        self.assertNotIn(".pytest_cache", listed_paths)
        self.assertNotIn(".pytest_cache", node_ids)
        self.assertNotIn(".pytest_cache/README.md", node_ids)
        self.assertIn("notes/kept.md", node_ids)


if __name__ == "__main__":
    unittest.main()
