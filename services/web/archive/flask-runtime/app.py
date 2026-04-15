import base64
import hmac
import os
import re
import shutil
from datetime import datetime
from pathlib import Path, PurePosixPath
from typing import Any
from urllib.parse import unquote

import networkx as nx

from flask import Flask, Response, jsonify, request, send_from_directory


import secrets

app = Flask(__name__)
app.secret_key = os.environ.get("FLASK_SECRET_KEY", secrets.token_hex(32))

VAULT_ROOT = Path(os.environ.get("VAULT_ROOT", "/vault")).resolve()
BASIC_AUTH_USER = os.environ.get("BASIC_AUTH_USER", "admin")
BASIC_AUTH_PASSWORD = os.environ.get("BASIC_AUTH_PASSWORD", "admin")
PORT = int(os.environ.get("PORT", "3000"))
IGNORED_DIRS = {
    ".git",
    ".obsidian",
    ".obsidian-web-trash",
    ".obsidian-web-versions",
    ".pytest_cache",
    ".synapsenote",
}

TRASH_DIR = VAULT_ROOT / ".obsidian-web-trash"
VERSION_DIR = VAULT_ROOT / ".obsidian-web-versions"
MAX_VERSIONS = int(os.environ.get("BACKUP_KEEP_VERSIONS", "20"))
WIKI_LINK_PATTERN = re.compile(r"\[\[([^\[\]]+)\]\]")
MARKDOWN_LINK_PATTERN = re.compile(r"(?<!!)\[[^\]]+\]\(([^)]+)\)")
EXTERNAL_LINK_SCHEMES = ("http://", "https://", "mailto:", "tel:")


def auth_failed() -> Response:
    return Response(
        "Unauthorized",
        401,
        # Remove WWW-Authenticate header to prevent browser's native login window
        {"Content-Type": "application/json"}
    )


from flask import session

def require_auth(func):
    def wrapper(*args, **kwargs):
        if session.get("user"):
            return func(*args, **kwargs)

        # 2. Fallback to Basic Auth (for API clients/backward compatibility)
        auth = request.authorization
        if not auth:
            raw = request.headers.get("Authorization", "")
            if raw.startswith("Basic "):
                try:
                    decoded = base64.b64decode(raw.split(" ", 1)[1]).decode("utf-8")
                    u, p = decoded.split(":", 1)
                    auth = type("Auth", (), {"username": u, "password": p})
                except Exception:
                    auth = None

        if auth and hmac.compare_digest(auth.username, BASIC_AUTH_USER) and hmac.compare_digest(auth.password, BASIC_AUTH_PASSWORD):
            return func(*args, **kwargs)

        return auth_failed()

    wrapper.__name__ = func.__name__
    return wrapper


def normalize_path(path: str | None) -> Path:
    rel = (path or "").strip().lstrip("/")
    if rel.startswith("..") or "/../" in rel:
        raise ValueError("Invalid path")
    candidate = (VAULT_ROOT / rel).resolve()
    if not str(candidate).startswith(str(VAULT_ROOT)):
        raise ValueError("Invalid path")
    return candidate


def is_ignored(path: Path) -> bool:
    return any(part in IGNORED_DIRS for part in path.parts)


def list_entries(base: Path, recursive: bool = False) -> list[dict[str, Any]]:
    base = base.resolve()
    results: list[dict[str, Any]] = []
    if recursive:
        iterator = base.rglob("*")
    else:
        iterator = base.iterdir()

    for item in iterator:
        if item.is_dir():
            if is_ignored(item):
                continue
            if not recursive:
                results.append(
                    {
                        "path": str(item.relative_to(VAULT_ROOT)).replace("\\", "/"),
                        "type": "dir",
                    }
                )
            continue

        if is_ignored(item):
            continue
        if item.suffix.lower() != ".md":
            continue

        rel = item.relative_to(VAULT_ROOT).as_posix()
        stat = item.stat()
        results.append(
            {
                "path": rel,
                "type": "file",
                "size": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat(),
            }
        )

    results.sort(key=lambda x: (x["type"] != "dir", x["path"].lower()))
    return results


def save_version(file_path: Path):
    if not file_path.exists():
        return
    rel_path = file_path.relative_to(VAULT_ROOT)
    v_dir = VERSION_DIR / rel_path.parent
    v_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    v_file = v_dir / f"{file_path.name}.{ts}"
    shutil.copy2(file_path, v_file)
    # clean up old versions
    try:
        versions = sorted(v_dir.glob(f"{file_path.name}.*"), key=lambda x: x.stat().st_mtime)
        while len(versions) > MAX_VERSIONS:
            oldest = versions.pop(0)
            oldest.unlink()
    except Exception:
        pass


def move_to_trash(file_path: Path):
    if not file_path.exists():
        return
    rel_path = file_path.relative_to(VAULT_ROOT)
    t_dir = TRASH_DIR / rel_path.parent
    t_dir.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d%H%M%S")
    t_file = t_dir / f"{file_path.name}.{ts}"
    shutil.move(file_path, t_file)


def normalize_graph_target(
    raw_target: str,
    source_path: str,
    known_paths: set[str],
    stem_lookup: dict[str, list[str]],
) -> str | None:
    target = (raw_target or "").strip()
    if not target:
        return None

    if target.startswith("<") and target.endswith(">"):
        target = target[1:-1].strip()

    target = unquote(target).replace("\\", "/")

    if "|" in target:
        target = target.split("|", 1)[0].strip()

    if "#" in target:
        target = target.split("#", 1)[0].strip()

    if not target:
        return None

    lowered_target = target.lower()
    if target.startswith("#") or lowered_target.startswith(EXTERNAL_LINK_SCHEMES):
        return None

    source_parent = PurePosixPath(source_path).parent
    candidate_path = PurePosixPath(target.lstrip("/")) if target.startswith("/") else source_parent / target

    normalized_parts: list[str] = []
    for part in candidate_path.parts:
        if part in {"", "."}:
            continue
        if part == "..":
            if not normalized_parts:
                return None
            normalized_parts.pop()
            continue
        normalized_parts.append(part)

    if not normalized_parts:
        return None

    normalized_path = "/".join(normalized_parts)
    if normalized_path in known_paths:
        return normalized_path

    if not normalized_path.lower().endswith(".md"):
        md_candidate = f"{normalized_path}.md"
        if md_candidate in known_paths:
            return md_candidate

    if "/" not in normalized_path and not normalized_path.lower().endswith(".md"):
        stem_matches = stem_lookup.get(normalized_path.lower(), [])
        if len(stem_matches) == 1:
            return stem_matches[0]

    return None


def extract_links_from_markdown(
    content: str,
    source_path: str,
    known_paths: set[str],
    stem_lookup: dict[str, list[str]],
) -> set[str]:
    links: set[str] = set()

    for match in WIKI_LINK_PATTERN.findall(content):
        normalized = normalize_graph_target(match, source_path, known_paths, stem_lookup)
        if normalized and normalized != source_path:
            links.add(normalized)

    for raw_target in MARKDOWN_LINK_PATTERN.findall(content):
        normalized = normalize_graph_target(raw_target, source_path, known_paths, stem_lookup)
        if normalized and normalized != source_path:
            links.add(normalized)

    return links


def build_graph_payload() -> dict[str, Any]:
    entries = list_entries(VAULT_ROOT, recursive=True)
    file_paths = [entry["path"] for entry in entries if entry.get("type") == "file"]
    known_paths = set(file_paths)

    stem_lookup: dict[str, list[str]] = {}
    for path in file_paths:
        stem_lookup.setdefault(Path(path).stem.lower(), []).append(path)

    # Collect all unique directories from file paths
    all_dirs: set[str] = set()
    for path in file_paths:
        parts = Path(path).parts
        for i in range(1, len(parts)):
            all_dirs.add("/".join(parts[:i]))

    outbound_links: dict[str, set[str]] = {path: set() for path in file_paths}
    inbound_counts: dict[str, int] = {path: 0 for path in file_paths}

    for path in file_paths:
        try:
            file_path = normalize_path(path)
            content = file_path.read_text(encoding="utf-8", errors="replace")
            outbound_links[path] = extract_links_from_markdown(content, path, known_paths, stem_lookup)
        except Exception:
            outbound_links[path] = set()

    edges: list[dict[str, Any]] = []

    # Wikilink edges
    for source, targets in outbound_links.items():
        for target in sorted(targets):
            inbound_counts[target] += 1
            edges.append({"source": source, "target": target, "edge_type": "wikilink"})

    # Directory structure edges: dir→subdir and dir→file
    for d in sorted(all_dirs):
        parent = Path(d).parent.as_posix()
        if parent == ".":
            parent = ""
        if parent and parent in all_dirs:
            edges.append({"source": parent, "target": d, "edge_type": "directory"})

    for path in file_paths:
        directory = Path(path).parent.as_posix()
        if directory == ".":
            directory = ""
        if directory in all_dirs:
            edges.append({"source": directory, "target": path, "edge_type": "directory"})

    # Build nodes: directories + documents
    nodes: list[dict[str, Any]] = []
    for d in sorted(all_dirs):
        nodes.append(
            {
                "id": d,
                "path": d,
                "name": Path(d).name,
                "directory": Path(d).parent.as_posix() if Path(d).parent.as_posix() != "." else "",
                "type": "Directory",
                "inbound": 0,
                "outbound": 0,
            }
        )

    for path in file_paths:
        directory = Path(path).parent.as_posix()
        if directory == ".":
            directory = ""
        nodes.append(
            {
                "id": path,
                "path": path,
                "name": Path(path).stem,
                "directory": directory,
                "type": "Document",
                "inbound": inbound_counts[path],
                "outbound": len(outbound_links[path]),
            }
        )

    nodes.sort(key=lambda node: node["path"].lower())

    orphan_nodes = sum(
        1
        for node in nodes
        if node["type"] == "Document" and node["inbound"] == 0 and node["outbound"] == 0
    )

    # Compute spring_layout positions via networkx
    G = nx.Graph()
    node_ids = [n["id"] for n in nodes]
    G.add_nodes_from(node_ids)
    for e in edges:
        weight = 2.0 if e["edge_type"] == "directory" else 1.0
        G.add_edge(e["source"], e["target"], weight=weight)

    import math
    k = max(4.0, 12.0 / math.sqrt(len(node_ids))) if node_ids else 4.0
    pos = nx.spring_layout(G, k=k, iterations=120, seed=42, scale=1200)
    for node in nodes:
        xy = pos.get(node["id"])
        if xy is not None:
            node["x"] = round(float(xy[0]), 2)
            node["y"] = round(float(xy[1]), 2)

    return {
        "nodes": nodes,
        "edges": edges,
        "stats": {
            "nodes": len(nodes),
            "edges": len(edges),
            "orphan_nodes": orphan_nodes,
        },
    }


@app.route("/", defaults={"path": ""})
@app.route("/<path:path>")
def catch_all(path):
    # Serve static files from public directory if they exist
    if path and (Path("public") / path).exists():
        return send_from_directory("public", path)
    # Give precedence to API routes (though they are registered separately and matched before this if defined first... wait)
    # Actually, Flask matches routes top-to-bottom for same URL rules, but explicit routes match before catch-alls.
    return send_from_directory("public", "index.html")


@app.route("/api/auth/login", methods=["POST"])
def api_login():
    data = request.get_json()
    username = data.get("username")
    password = data.get("password")

    if not username or not password:
        return jsonify({"error": "Missing credentials"}), 400

    if hmac.compare_digest(username, BASIC_AUTH_USER) and hmac.compare_digest(password, BASIC_AUTH_PASSWORD):
        session["user"] = username
        return jsonify({"ok": True, "user": username})

    return jsonify({"error": "Invalid credentials"}), 401

@app.route("/api/auth/logout", methods=["POST"])
def api_logout():
    session.pop("user", None)
    return jsonify({"ok": True})

@app.route("/api/auth/me")
def api_me():
    user = session.get("user")
    if user:
        return jsonify({"user": user})
    return jsonify({"user": None}), 401

@app.route("/health")
def health():
    return {"ok": True, "vault_root": str(VAULT_ROOT)}


@app.route("/api/files")
@require_auth
def api_files():
    req_path = request.args.get("path", "")
    recursive = request.args.get("recursive", "false").lower() in ("1", "true", "yes")
    try:
        base = normalize_path(req_path)
        if not base.exists() or not base.is_dir():
            return jsonify({"error": "path_not_found", "path": req_path}), 404
        return jsonify(list_entries(base, recursive=recursive))
    except ValueError:
        return jsonify({"error": "invalid_path"}), 400


@app.route("/api/file", methods=["GET", "PUT", "DELETE"])
@require_auth
def api_file():
    path = request.args.get("path", "")
    if not path:
        return jsonify({"error": "path_required"}), 400
    try:
        file_path = normalize_path(path)
    except ValueError:
        return jsonify({"error": "invalid_path"}), 400

    if is_ignored(file_path):
        return jsonify({"error": "ignored_path"}), 403

    if request.method == "GET":
        if not file_path.exists():
            return jsonify({"error": "not_found"}), 404
        return jsonify(
            {
                "path": path,
                "content": file_path.read_text(encoding="utf-8", errors="replace"),
            }
        )

    if request.method == "PUT":
        body = request.get_json(silent=True) or {}
        content = body.get("content", "")
        if file_path.exists():
            save_version(file_path)
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")
        return jsonify({"ok": True, "path": path})

    if request.method == "DELETE":
        if file_path.exists():
            move_to_trash(file_path)
            return jsonify({"ok": True, "path": path, "deleted": True})
        return jsonify({"error": "not_found"}), 404


@app.route("/api/file/move", methods=["POST"])
@require_auth
def api_move_file():
    body = request.get_json(silent=True) or {}
    source_path = body.get("source_path", "")
    target_path = body.get("target_path", "")

    if not source_path:
        return jsonify({"error": "missing_params", "field": "source_path"}), 400

    if not isinstance(source_path, str) or not isinstance(target_path, str):
        return jsonify({"error": "invalid_params"}), 400

    source_path = source_path.strip()
    target_path = target_path.strip()

    try:
        source = normalize_path(source_path)
    except ValueError:
        return jsonify({"error": "invalid_source_path"}), 400

    if is_ignored(source):
        return jsonify({"error": "ignored_path"}), 403

    if not source.exists():
        return jsonify({"error": "not_found", "path": source_path}), 404

    if target_path in {"", "/"}:
        target = VAULT_ROOT
    else:
        try:
            target = normalize_path(target_path)
        except ValueError:
            return jsonify({"error": "invalid_target_path"}), 400

    if is_ignored(target):
        return jsonify({"error": "ignored_path"}), 403

    if not target.exists():
        return jsonify({"error": "target_not_found", "path": target_path}), 404

    if not target.is_dir():
        return jsonify({"error": "target_not_directory", "path": target_path}), 400

    try:
        source_resolved = source.resolve()
        target_resolved = target.resolve()
        if source_resolved == target_resolved:
            return jsonify({"error": "invalid_move", "reason": "cannot_move_to_self"}), 400
        if str(target_resolved).startswith(str(source_resolved) + os.sep):
            return jsonify({"error": "invalid_move", "reason": "cannot_move_into_descendant"}), 400
    except Exception:
        return jsonify({"error": "invalid_move"}), 400

    destination = target / source.name
    if destination.exists():
        return jsonify({"error": "conflict", "path": str(destination.relative_to(VAULT_ROOT).as_posix())}), 409

    try:
        shutil.move(str(source), str(destination))
    except Exception as e:
        return jsonify({"error": "move_failed", "details": str(e)}), 500

    new_path = str(destination.relative_to(VAULT_ROOT).as_posix())
    if new_path.startswith("./"):
        new_path = new_path[2:]

    return jsonify({"ok": True, "path": new_path, "target": str(target.relative_to(VAULT_ROOT).as_posix())})


@app.route("/api/file/rename", methods=["POST"])
@require_auth
def api_rename_file():
    body = request.get_json(silent=True) or {}
    source_path = body.get("source_path", "")
    new_name = body.get("new_name", "")

    if not source_path or not new_name:
        return jsonify({"error": "missing_params"}), 400

    if not isinstance(source_path, str) or not isinstance(new_name, str):
        return jsonify({"error": "invalid_params"}), 400

    # Remove extension if provided in new_name, we enforce .md
    if new_name.lower().endswith(".md"):
        new_name = new_name[:-3]
    
    # Basic validation for new_name
    if not new_name or "/" in new_name or "\\" in new_name:
        return jsonify({"error": "invalid_new_name"}), 400

    try:
        source = normalize_path(source_path)
    except ValueError:
        return jsonify({"error": "invalid_source_path"}), 400

    if not source.exists():
        return jsonify({"error": "not_found", "path": source_path}), 404

    destination = source.parent / f"{new_name}.md"
    
    if destination.exists():
        return jsonify({"error": "conflict", "path": str(destination.relative_to(VAULT_ROOT).as_posix())}), 409

    try:
        shutil.move(str(source), str(destination))
    except Exception as e:
        return jsonify({"error": "rename_failed", "details": str(e)}), 500

    new_path = str(destination.relative_to(VAULT_ROOT).as_posix())
    if new_path.startswith("./"):
        new_path = new_path[2:]

    return jsonify({"ok": True, "path": new_path})


@app.route("/api/versions", methods=["GET"])
@require_auth
def api_get_versions():
    path = request.args.get("path", "")
    if not path:
        return jsonify({"error": "path_required"}), 400
    try:
        normalize_path(path)
    except ValueError:
        return jsonify({"error": "invalid_path"}), 400

    rel_path = path.lstrip("/")
    v_dir = VERSION_DIR / Path(rel_path).parent
    filename = Path(rel_path).name
    
    results = []
    if v_dir.exists():
        for item in v_dir.glob(f"{filename}.*"):
            if not item.is_file(): continue
            stat = item.stat()
            # extract ts
            ts = item.suffix[1:]
            results.append({
                "ts": ts,
                "size": stat.st_size,
                "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
    results.sort(key=lambda x: x["ts"], reverse=True)
    return jsonify(results)


@app.route("/api/versions/revert", methods=["POST"])
@require_auth
def api_revert_version():
    body = request.get_json(silent=True) or {}
    path = body.get("path", "")
    ts = body.get("ts", "")
    if not path or not ts:
        return jsonify({"error": "missing_params"}), 400
    
    try:
        file_path = normalize_path(path)
    except ValueError:
        return jsonify({"error": "invalid_path"}), 400
        
    rel_path = path.lstrip("/")
    v_file = VERSION_DIR / Path(rel_path).parent / f"{Path(rel_path).name}.{ts}"
    
    if not v_file.exists():
        return jsonify({"error": "version_not_found"}), 404
        
    if file_path.exists():
        save_version(file_path)
    
    file_path.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(v_file, file_path)
    
    return jsonify({"ok": True, "path": path, "reverted_to": ts})


@app.route("/api/trash", methods=["GET"])
@require_auth
def api_get_trash():
    results = []
    if TRASH_DIR.exists():
        for item in TRASH_DIR.rglob("*"):
            if item.is_file():
                rel = item.relative_to(TRASH_DIR)
                orig_name = item.stem
                ts = item.suffix[1:]
                orig_path = str(rel.parent / orig_name).replace("\\", "/")
                if orig_path.startswith("./"):
                    orig_path = orig_path[2:]
                elif orig_path == ".":
                    orig_path = orig_name
                
                stat = item.stat()
                results.append({
                    "orig_path": orig_path,
                    "ts": ts,
                    "size": stat.st_size,
                    "mtime": datetime.fromtimestamp(stat.st_mtime).isoformat(),
                    "trash_path": str(rel).replace("\\", "/")
                })
    results.sort(key=lambda x: x["ts"], reverse=True)
    return jsonify(results)


@app.route("/api/trash/restore", methods=["POST"])
@require_auth
def api_restore_trash():
    body = request.get_json(silent=True) or {}
    trash_path = body.get("trash_path", "")
    if not trash_path:
        return jsonify({"error": "missing_params"}), 400
        
    try:
        t_file = (TRASH_DIR / trash_path).resolve()
        if not str(t_file).startswith(str(TRASH_DIR)):
            return jsonify({"error": "invalid_path"}), 400
    except Exception:
        return jsonify({"error": "invalid_path"}), 400
        
    if not t_file.exists():
        return jsonify({"error": "trash_not_found"}), 404
        
    rel = t_file.relative_to(TRASH_DIR)
    orig_name = t_file.stem
    orig_rel_path = rel.parent / orig_name
    target_path = VAULT_ROOT / orig_rel_path
    
    target_path.parent.mkdir(parents=True, exist_ok=True)
    if target_path.exists():
        save_version(target_path)
        
    shutil.move(t_file, target_path)
    return jsonify({"ok": True, "restored_path": str(orig_rel_path).replace("\\", "/")})


@app.route("/api/version")
@require_auth
def api_version():
    v_file = Path("version.txt")
    if v_file.exists():
        return jsonify({"commit": v_file.read_text(encoding="utf-8").strip()})
    return jsonify({"commit": "unknown"})


@app.route("/api/graph", methods=["GET"])
@require_auth
def api_graph():
    try:
        return jsonify(build_graph_payload())
    except Exception as e:
        return jsonify({"error": "graph_build_failed", "details": str(e)}), 500


@app.route("/api/resolve-link", methods=["GET"])
@require_auth
def api_resolve_link():
    """위키링크 타겟을 실제 파일 경로로 해석합니다.

    Query params:
      target: 위키링크 타겟 문자열 (예: "문서이름", "folder/문서이름")
      from:   (선택) 소스 파일 경로 - 상대경로 해석에 사용
    """
    target = request.args.get("target", "").strip()
    source_path = request.args.get("from", "").strip()

    if not target:
        return jsonify({"error": "target_required"}), 400

    try:
        known_paths, stem_lookup = _build_path_index()
        resolved = normalize_graph_target(target, source_path or "", known_paths, stem_lookup)
        if resolved:
            return jsonify({"path": resolved})
        return jsonify({"path": None, "error": "not_found"}), 404
    except Exception as e:
        return jsonify({"error": "resolve_failed", "details": str(e)}), 500


def _build_path_index():
    """모든 .md 파일의 경로 집합과 stem → path 매핑 반환."""
    entries = list_entries(VAULT_ROOT, recursive=True)
    known_paths = set()
    stem_lookup: dict[str, list[str]] = {}
    for entry in entries:
        if entry.get("type") == "file" and entry["path"].endswith(".md"):
            p = entry["path"]
            known_paths.add(p)
            stem = Path(p).stem.lower()
            stem_lookup.setdefault(stem, []).append(p)
    return known_paths, stem_lookup


from base_routes import register as register_bases
register_bases(app, VAULT_ROOT)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=PORT)
