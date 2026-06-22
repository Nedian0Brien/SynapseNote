from __future__ import annotations

from app.services.markdown_chunks import build_markdown_chunks


def test_build_markdown_chunks_splits_by_heading_and_hashes_content():
    chunks = build_markdown_chunks(
        "notes/example.md",
        "# Intro\nOpening text.\n\n## Detail\nMore text.\n",
    )

    assert [chunk["heading"] for chunk in chunks] == ["Intro", "Detail"]
    assert chunks[0]["id"] == "notes/example.md#chunk-0"
    assert chunks[0]["anchor"] == "intro"
    assert chunks[0]["content_hash"]
    assert "Opening text." in chunks[0]["content"]


def test_build_markdown_chunks_normalizes_callout_marker():
    chunks = build_markdown_chunks(
        "notes/callout.md",
        "> [!note] Remember\n> Keep this.\n",
    )

    assert chunks[0]["heading"] == "callout"
    assert chunks[0]["content"].splitlines()[0] == "> Remember"
