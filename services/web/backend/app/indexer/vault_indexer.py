from __future__ import annotations

import json
import logging
import os
import posixpath
import re
import sqlite3
from datetime import datetime
from pathlib import Path

import networkx as nx

from app.db.connection import get_db
from app.services.markdown_chunks import build_markdown_chunks

IGNORED_DIRS = {".git", ".obsidian", "__pycache__", ".pytest_cache", ".synapsenote"}
WIKILINK_PATTERN = re.compile(r"\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]")
EMBED_PATTERN = re.compile(r"!\[\[([^\]|#]+)(?:#[^\]|]*)?\|?[^\]]*\]\]")
MARKDOWN_LINK_PATTERN = re.compile(r"(?<!!)\[[^\]]+\]\(([^)#?]+\.md)(?:#[^)]*)?\)")
TITLE_PATTERN = re.compile(r"^#\s+(.+)$", re.MULTILINE)
TAG_PATTERN = re.compile(r"(?<![\w/])#([a-zA-Z0-9][a-zA-Z0-9_-]*)")
FRONTMATTER_PATTERN = re.compile(r"\A---\s*\n(.*?)\n---\s*(?:\n|\Z)", re.DOTALL)
CALLOUT_MARKER_PATTERN = re.compile(r"^\[![^\]]+\]\s*")

logger = logging.getLogger(__name__)


class VaultIndexer:
    def __init__(self) -> None:
        self.vault_root = Path(os.environ.get("VAULT_ROOT", "/vault"))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def full_rebuild(self) -> dict[str, int]:
        """vault 전체를 스캔해 SQLite를 원자적으로 재빌드.

        반환: {"nodes": N, "edges": M}
        """
        if not self.vault_root.exists():
            logger.warning("vault_root %s does not exist — skipping rebuild", self.vault_root)
            return {"nodes": 0, "edges": 0}

        # 1. rglob로 전체 파일 목록 수집
        all_paths: list[Path] = []
        for path in sorted(self.vault_root.rglob("*")):
            if self._should_ignore(path):
                continue
            if path.is_dir() or path.is_file():
                all_paths.append(path)

        # 2. 각 파일 1회 읽어 node 정보 파싱
        # vault root 자체를 "." id로 먼저 추가 (모든 최상위 항목의 parent)
        parsed: list[dict] = [
            {
                "id": ".",
                "title": self.vault_root.name,
                "type": "Directory",
                "summary": "Vault root",
                "tags": [],
                "updated_at": datetime.fromtimestamp(self.vault_root.stat().st_mtime).isoformat(),
                "wikilinks": [],
            }
        ]
        for path in all_paths:
            try:
                parsed.append(self._parse_file(path))
            except Exception as exc:
                logger.warning("Failed to parse %s: %s", path, exc)

        # 3. tag node 추가
        tag_names = sorted({
            tag
            for node in parsed
            if node["type"] == "Document"
            for tag in node["tags"]
        })
        for tag in tag_names:
            parsed.append(self._tag_node(tag))

        # 4. stem_index 구성 (wikilink 해석용: stem → node id)
        stem_index: dict[str, list[str]] = {}
        for node in parsed:
            if node["type"] == "Document":
                self._add_stem_index_entry(stem_index, Path(node["id"]).stem, node["id"])
                if node["id"].endswith(".md"):
                    self._add_stem_index_entry(stem_index, node["id"][:-3], node["id"])
                self._add_stem_index_entry(stem_index, node["id"], node["id"])

        # 5. 엣지 계산
        node_id_set = {node["id"] for node in parsed}
        edges: list[tuple[str, str, str, float]] = []
        unresolved_links: list[tuple[str, str, str, str]] = []

        for node in parsed:
            node_id = node["id"]

            # directory 엣지: 부모 디렉터리 → 자식 노드
            if node_id == ".":
                pass  # vault root는 parent 없음
            elif "/" in node_id:
                parent_dir = node_id.rsplit("/", 1)[0]
                if parent_dir in node_id_set:
                    edges.append((parent_dir, node_id, "directory", 1.0))
            else:
                # 최상위 항목 → vault root(".")에 연결
                edges.append((".", node_id, "directory", 1.0))

            # wikilink 엣지: Document의 [[링크]] → 대상 노드
            if node["type"] == "Document":
                source_dir = node_id.rsplit("/", 1)[0] if "/" in node_id else ""
                seen: set[str] = set()
                for wl_stem in node["wikilinks"]:
                    resolved = self._resolve_wikilink(wl_stem, stem_index, source_dir)
                    if resolved and resolved != node_id and resolved not in seen:
                        seen.add(resolved)
                        edges.append((node_id, resolved, "wikilink", 1.0))
                    elif not resolved:
                        unresolved_links.append((node_id, wl_stem, "wikilink", wl_stem))
                for link_target in node["markdown_links"]:
                    resolved = self._resolve_markdown_link(link_target, source_dir, node_id_set)
                    if resolved and resolved != node_id and resolved not in seen:
                        seen.add(resolved)
                        edges.append((node_id, resolved, "markdown_link", 1.0))
                    elif not resolved:
                        unresolved_links.append((node_id, link_target, "markdown_link", link_target))
                for embed_target in node["embeds"]:
                    resolved = self._resolve_attachment(embed_target, source_dir, node_id_set)
                    if resolved and resolved != node_id and resolved not in seen:
                        seen.add(resolved)
                        edges.append((node_id, resolved, "attachment", 1.0))
                    elif not resolved:
                        unresolved_links.append((node_id, embed_target, "attachment", embed_target))
                for tag in node["tags"]:
                    edges.append((node_id, self._tag_id(tag), "tag", 1.0))

        # 6. 단일 트랜잭션으로 nodes + edges 전체 교체
        conn = get_db()
        with conn:
            conn.execute("DELETE FROM edges")
            conn.execute("DELETE FROM unresolved_links")
            conn.execute("DELETE FROM chunks")
            conn.execute("DELETE FROM nodes")

            conn.executemany(
                "INSERT INTO nodes (id, title, type, summary, tags, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?)",
                [
                    (
                        node["id"],
                        node["title"],
                        node["type"],
                        node["summary"],
                        json.dumps(node["tags"], ensure_ascii=False),
                        node["updated_at"],
                    )
                    for node in parsed
                ],
            )

            conn.executemany(
                "INSERT OR REPLACE INTO edges (source, target, edge_type, weight) "
                "VALUES (?, ?, ?, ?)",
                edges,
            )
            conn.executemany(
                "INSERT OR REPLACE INTO unresolved_links (source, target, link_type, raw_target) "
                "VALUES (?, ?, ?, ?)",
                unresolved_links,
            )
            self._replace_chunks(conn, parsed)

        # 7. 레이아웃 계산 후 x, y 저장
        positions = self._compute_layout(
            node_ids=[n["id"] for n in parsed],
            edges=edges,
        )
        with conn:
            conn.executemany(
                "UPDATE nodes SET x = ?, y = ? WHERE id = ?",
                [(pos[0], pos[1], node_id) for node_id, pos in positions.items()],
            )

        result = {"nodes": len(parsed), "edges": len(edges)}
        logger.info("full_rebuild complete — nodes=%d edges=%d", result["nodes"], result["edges"])
        return result

    def update_node(self, path: Path) -> None:
        """단일 파일 변경 시 증분 업데이트.

        - node row upsert
        - 해당 node의 outgoing edges 삭제 후 재계산
        - 해당 node가 directory면 directory edges도 업데이트
        """
        if self._should_ignore(path):
            return

        try:
            node = self._parse_file(path)
        except Exception as exc:
            logger.warning("update_node: failed to parse %s: %s", path, exc)
            return

        node_id = node["id"]
        conn = get_db()

        with conn:
            # 기존 좌표 보존: 이미 위치가 있으면 유지, 신규 노드면 부모 근처 배치
            existing_pos = conn.execute(
                "SELECT x, y FROM nodes WHERE id = ?", (node_id,)
            ).fetchone()

            if existing_pos and existing_pos[0] is not None:
                x, y = existing_pos[0], existing_pos[1]
            else:
                x, y = self._initial_position(node_id, conn)

            # node upsert
            conn.execute(
                "INSERT OR REPLACE INTO nodes (id, title, type, summary, tags, updated_at, x, y) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (
                    node_id,
                    node["title"],
                    node["type"],
                    node["summary"],
                    json.dumps(node["tags"], ensure_ascii=False),
                    node["updated_at"],
                    x,
                    y,
                ),
            )

            # outgoing edges 삭제 후 재계산
            conn.execute("DELETE FROM edges WHERE source = ?", (node_id,))
            conn.execute("DELETE FROM unresolved_links WHERE source = ?", (node_id,))
            conn.execute("DELETE FROM chunks WHERE path = ?", (node_id,))

            for tag in node["tags"]:
                self._upsert_tag_node(conn, tag)

            stem_index = self._build_stem_index(conn)
            node_ids = self._all_node_ids(conn)
            new_edges: list[tuple[str, str, str, float]] = []
            unresolved_links: list[tuple[str, str, str, str]] = []

            # directory 엣지: 이 노드의 부모 → 이 노드
            if node_id != ".":
                if "/" in node_id:
                    parent_dir = node_id.rsplit("/", 1)[0]
                    if parent_dir in node_ids:
                        conn.execute(
                            "INSERT OR REPLACE INTO edges (source, target, edge_type, weight) "
                            "VALUES (?, ?, ?, ?)",
                            (parent_dir, node_id, "directory", 1.0),
                        )
                else:
                    # 최상위 항목 → vault root
                    conn.execute(
                        "INSERT OR REPLACE INTO edges (source, target, edge_type, weight) "
                        "VALUES (?, ?, ?, ?)",
                        (".", node_id, "directory", 1.0),
                    )

            # wikilink 엣지
            if node["type"] == "Document":
                source_dir = node_id.rsplit("/", 1)[0] if "/" in node_id else ""
                seen: set[str] = set()
                for wl_stem in node["wikilinks"]:
                    resolved = self._resolve_wikilink(wl_stem, stem_index, source_dir)
                    if resolved and resolved != node_id and resolved not in seen:
                        seen.add(resolved)
                        new_edges.append((node_id, resolved, "wikilink", 1.0))
                    elif not resolved:
                        unresolved_links.append((node_id, wl_stem, "wikilink", wl_stem))
                for link_target in node["markdown_links"]:
                    resolved = self._resolve_markdown_link(link_target, source_dir, node_ids)
                    if resolved and resolved != node_id and resolved not in seen:
                        seen.add(resolved)
                        new_edges.append((node_id, resolved, "markdown_link", 1.0))
                    elif not resolved:
                        unresolved_links.append((node_id, link_target, "markdown_link", link_target))
                for embed_target in node["embeds"]:
                    resolved = self._resolve_attachment(embed_target, source_dir, node_ids)
                    if resolved and resolved != node_id and resolved not in seen:
                        seen.add(resolved)
                        new_edges.append((node_id, resolved, "attachment", 1.0))
                    elif not resolved:
                        unresolved_links.append((node_id, embed_target, "attachment", embed_target))
                for tag in node["tags"]:
                    new_edges.append((node_id, self._tag_id(tag), "tag", 1.0))

            if new_edges:
                conn.executemany(
                    "INSERT OR REPLACE INTO edges (source, target, edge_type, weight) "
                    "VALUES (?, ?, ?, ?)",
                    new_edges,
                )
            if unresolved_links:
                conn.executemany(
                    "INSERT OR REPLACE INTO unresolved_links (source, target, link_type, raw_target) "
                    "VALUES (?, ?, ?, ?)",
                    unresolved_links,
                )
            self._replace_chunks(conn, [node])

            # directory 노드인 경우 자식들의 directory 엣지도 갱신
            if node["type"] == "Directory":
                children = [
                    nid for nid in node_ids
                    if nid != node_id
                    and "/" in nid
                    and nid.rsplit("/", 1)[0] == node_id
                ]
                child_edges = [(node_id, child, "directory", 1.0) for child in children]
                if child_edges:
                    conn.executemany(
                        "INSERT OR REPLACE INTO edges (source, target, edge_type, weight) "
                        "VALUES (?, ?, ?, ?)",
                        child_edges,
                    )

        logger.debug("update_node: %s upserted", node_id)

    def delete_node(self, path: Path) -> None:
        """파일/디렉터리 삭제 시 node + 관련 edges 제거."""
        if self._should_ignore(path):
            return

        try:
            node_id = self._path_to_id(path)
        except ValueError as exc:
            logger.warning("delete_node: %s", exc)
            return

        conn = get_db()
        with conn:
            conn.execute("DELETE FROM nodes WHERE id = ?", (node_id,))
            conn.execute(
                "DELETE FROM edges WHERE source = ? OR target = ?",
                (node_id, node_id),
            )
            conn.execute(
                "DELETE FROM unresolved_links WHERE source = ? OR target = ?",
                (node_id, node_id),
            )
            conn.execute("DELETE FROM chunks WHERE path = ?", (node_id,))

        logger.debug("delete_node: %s removed", node_id)

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _parse_file(self, path: Path) -> dict:
        """파일 1회 읽어 node 정보 + wikilink targets 반환.

        반환: {id, title, type, summary, tags, updated_at, wikilinks: [stem, ...]}
        """
        node_id = self._path_to_id(path)
        updated_at = datetime.fromtimestamp(path.stat().st_mtime).isoformat()

        if path.is_dir():
            return {
                "id": node_id,
                "title": path.name,
                "type": "Directory",
                "summary": "Directory container",
                "tags": [],
                "updated_at": updated_at,
                "wikilinks": [],
                "markdown_links": [],
                "embeds": [],
                "chunks": [],
            }

        if path.suffix.lower() != ".md":
            return {
                "id": node_id,
                "title": path.name,
                "type": "Attachment",
                "summary": "Attachment",
                "tags": [],
                "updated_at": updated_at,
                "wikilinks": [],
                "markdown_links": [],
                "embeds": [],
                "chunks": [],
            }

        # Markdown 파일 — 1회만 읽기
        content = path.read_text(encoding="utf-8", errors="replace")
        frontmatter, body = self._split_frontmatter(content)

        title_match = TITLE_PATTERN.search(body)
        title = (
            str(frontmatter.get("title") or title_match.group(1).strip())
            if title_match
            else str(frontmatter.get("title") or path.stem.replace("-", " ").strip() or path.stem)
        )

        lines = self._summary_lines(body)
        summary = lines[0][:180] if lines else ""

        frontmatter_tags = frontmatter.get("tags") or []
        if isinstance(frontmatter_tags, str):
            frontmatter_tags = [frontmatter_tags]
        tags = sorted(set([*frontmatter_tags, *TAG_PATTERN.findall(body)]))[:20]

        wikilinks = [m.group(1).strip() for m in WIKILINK_PATTERN.finditer(body)]
        markdown_links = [m.group(1).strip() for m in MARKDOWN_LINK_PATTERN.finditer(body)]
        embeds = [m.group(1).strip() for m in EMBED_PATTERN.finditer(body)]

        return {
            "id": node_id,
            "title": title,
            "type": "Document",
            "summary": summary,
            "tags": tags,
            "updated_at": updated_at,
            "wikilinks": wikilinks,
            "markdown_links": markdown_links,
            "embeds": embeds,
            "chunks": build_markdown_chunks(node_id, body),
        }

    def _split_frontmatter(self, content: str) -> tuple[dict[str, object], str]:
        match = FRONTMATTER_PATTERN.match(content)
        if not match:
            return {}, content

        return self._parse_frontmatter(match.group(1)), content[match.end():]

    def _parse_frontmatter(self, raw: str) -> dict[str, object]:
        data: dict[str, object] = {}
        current_key: str | None = None
        for line in raw.splitlines():
            stripped = line.strip()
            if not stripped:
                continue
            if current_key and stripped.startswith("- "):
                current = data.setdefault(current_key, [])
                if isinstance(current, list):
                    current.append(stripped[2:].strip().strip('"\''))
                continue
            if ":" not in line:
                current_key = None
                continue
            key, value = line.split(":", 1)
            key = key.strip()
            value = value.strip()
            current_key = key
            if not value:
                data[key] = []
            elif value.startswith("[") and value.endswith("]"):
                data[key] = [
                    item.strip().strip('"\'')
                    for item in value[1:-1].split(",")
                    if item.strip()
                ]
            else:
                data[key] = value.strip('"\'')
        return data

    def _summary_lines(self, body: str) -> list[str]:
        lines: list[str] = []
        for raw_line in body.splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#"):
                continue
            if line.startswith(">"):
                line = line.lstrip(">").strip()
                line = CALLOUT_MARKER_PATTERN.sub("", line).strip()
                if not line:
                    continue
            lines.append(line)
        return lines

    def _resolve_wikilink(
        self,
        stem: str,
        stem_index: dict[str, list[str]],
        source_dir: str,
    ) -> str | None:
        """stem → node id 해석. 동일 stem 여러 개면 same-dir 우선."""
        candidates = stem_index.get(stem) or stem_index.get(stem.lower())
        if not candidates:
            # 대소문자 무시 탐색
            lower_stem = stem.lower()
            candidates = next(
                (v for k, v in stem_index.items() if k.lower() == lower_stem),
                None,
            )
        if not candidates:
            return None
        if len(candidates) == 1:
            return candidates[0]
        # same-dir 우선
        for cand in candidates:
            if cand.rsplit("/", 1)[0] == source_dir:
                return cand
        return candidates[0]

    def _resolve_markdown_link(self, target: str, source_dir: str, node_ids: set[str]) -> str | None:
        if "://" in target:
            return None

        normalized = target.lstrip("/")
        if not target.startswith("/") and source_dir:
            normalized = posixpath.normpath(f"{source_dir}/{target}")
        else:
            normalized = posixpath.normpath(normalized)

        if normalized in node_ids:
            return normalized
        return None

    def _resolve_attachment(self, target: str, source_dir: str, node_ids: set[str]) -> str | None:
        normalized = target.lstrip("/")
        candidates = []
        if not target.startswith("/") and source_dir:
            candidates.append(posixpath.normpath(f"{source_dir}/{target}"))
        candidates.append(posixpath.normpath(normalized))

        target_stem = Path(target).stem.lower()
        for candidate in candidates:
            if candidate in node_ids:
                return candidate

        for node_id in node_ids:
            if Path(node_id).stem.lower() == target_stem:
                return node_id
        return None

    @staticmethod
    def _tag_id(tag: str) -> str:
        return f"tag:{tag}"

    def _tag_node(self, tag: str) -> dict:
        return {
            "id": self._tag_id(tag),
            "title": f"#{tag}",
            "type": "Tag",
            "summary": "Tag",
            "tags": [],
            "updated_at": datetime.fromtimestamp(self.vault_root.stat().st_mtime).isoformat(),
            "wikilinks": [],
            "markdown_links": [],
            "embeds": [],
            "chunks": [],
        }

    def _upsert_tag_node(self, conn: sqlite3.Connection, tag: str) -> None:
        node = self._tag_node(tag)
        conn.execute(
            "INSERT OR IGNORE INTO nodes (id, title, type, summary, tags, updated_at) "
            "VALUES (?, ?, ?, ?, ?, ?)",
            (
                node["id"],
                node["title"],
                node["type"],
                node["summary"],
                json.dumps(node["tags"], ensure_ascii=False),
                node["updated_at"],
            ),
        )
        conn.execute(
            "INSERT OR REPLACE INTO edges (source, target, edge_type, weight) "
            "VALUES (?, ?, ?, ?)",
            (".", node["id"], "directory", 1.0),
        )

    def _replace_chunks(self, conn: sqlite3.Connection, nodes: list[dict]) -> None:
        rows = []
        for node in nodes:
            if node["type"] != "Document":
                continue
            for chunk in node.get("chunks", []):
                rows.append((
                    chunk["id"],
                    chunk["path"],
                    chunk["heading"],
                    chunk["anchor"],
                    chunk["ordinal"],
                    chunk["content"],
                    chunk["content_hash"],
                    node["updated_at"],
                ))

        if rows:
            conn.executemany(
                "INSERT OR REPLACE INTO chunks "
                "(id, path, heading, anchor, ordinal, content, content_hash, updated_at) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                rows,
            )

    def _build_stem_index(self, conn: sqlite3.Connection) -> dict[str, list[str]]:
        """현재 SQLite에서 stem → [id, ...] 맵 생성."""
        index: dict[str, list[str]] = {}
        rows = conn.execute(
            "SELECT id FROM nodes WHERE type = 'Document'"
        ).fetchall()
        for row in rows:
            node_id: str = row[0]
            self._add_stem_index_entry(index, Path(node_id).stem, node_id)
            if node_id.endswith(".md"):
                self._add_stem_index_entry(index, node_id[:-3], node_id)
            self._add_stem_index_entry(index, node_id, node_id)
        return index

    @staticmethod
    def _add_stem_index_entry(index: dict[str, list[str]], key: str, node_id: str) -> None:
        bucket = index.setdefault(key, [])
        if node_id not in bucket:
            bucket.append(node_id)

    def _all_node_ids(self, conn: sqlite3.Connection) -> set[str]:
        rows = conn.execute("SELECT id FROM nodes").fetchall()
        return {row[0] for row in rows}

    def _path_to_id(self, path: Path) -> str:
        """절대 경로 → vault 상대 경로(node id)."""
        resolved = path.resolve()
        try:
            return resolved.relative_to(self.vault_root.resolve()).as_posix()
        except ValueError:
            raise ValueError(
                f"Path {path} is not inside vault_root {self.vault_root}"
            )

    def _compute_layout(
        self,
        node_ids: list[str],
        edges: list[tuple[str, str, str, float]],
        scale: float = 1200.0,
    ) -> dict[str, tuple[float, float]]:
        """networkx spring_layout으로 전체 노드 좌표 계산.

        - Fruchterman-Reingold 알고리즘 (d3-force와 유사)
        - seed=42로 재현성 보장
        - scale=1200 → 캔버스 좌표계와 호환
        """
        import random
        G = nx.Graph()
        G.add_nodes_from(node_ids)
        for src, tgt, _etype, _w in edges:
            if src in G and tgt in G:
                G.add_edge(src, tgt)

        if len(G.nodes) == 0:
            return {}

        import numpy as np

        # vault "."를 원점에 고정한 채 layout 실행 → 자식들이 사방으로 균등 배치
        initial_pos = {nid: np.random.default_rng(42 + i).uniform(-1, 1, 2)
                       for i, nid in enumerate(node_ids)}
        initial_pos["."] = np.array([0.0, 0.0])

        pos = nx.spring_layout(
            G,
            k=2.5 / (len(G.nodes) ** 0.5),
            iterations=200,
            seed=42,
            pos=initial_pos,
            fixed=["."] if "." in G else None,
        )

        # scale 정규화: vault를 원점 유지하면서 최대 좌표를 scale 값으로 맞춤
        if "." in pos:
            offset = pos["."].copy()
            for nid in pos:
                pos[nid] = pos[nid] - offset
            max_abs = max(
                max(abs(float(xy[0])), abs(float(xy[1]))) for xy in pos.values()
            ) or 1.0
            factor = scale / max_abs
            for nid in pos:
                pos[nid] = pos[nid] * factor

        return {node_id: (float(xy[0]), float(xy[1])) for node_id, xy in pos.items()}

    def _initial_position(
        self,
        node_id: str,
        conn: sqlite3.Connection,
    ) -> tuple[float, float]:
        """신규 노드 초기 위치: 부모 노드 근처, 없으면 원점 근처."""
        import random
        parent_id = node_id.rsplit("/", 1)[0] if "/" in node_id else None
        if parent_id:
            row = conn.execute(
                "SELECT x, y FROM nodes WHERE id = ?", (parent_id,)
            ).fetchone()
            if row and row[0] is not None:
                jitter = 60.0
                return (
                    row[0] + random.uniform(-jitter, jitter),
                    row[1] + random.uniform(-jitter, jitter),
                )
        return (
            random.uniform(-100.0, 100.0),
            random.uniform(-100.0, 100.0),
        )

    def _should_ignore(self, path: Path) -> bool:
        return any(part in IGNORED_DIRS for part in path.parts)
