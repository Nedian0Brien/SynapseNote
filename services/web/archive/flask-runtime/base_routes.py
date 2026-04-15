import datetime
import fcntl
import json
import re
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
        if any(b["name"] == name for b in data["bases"]):
            return jsonify({"error": "duplicate name"}), 409
        base_id = "base_" + re.sub(r"[^a-z0-9]+", "_", name.lower()).strip("_")
        new_base = {
            "id": base_id,
            "name": name,
            "color": color,
            "folders": [],
            "createdAt": datetime.datetime.utcnow().isoformat() + "Z",
        }
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
