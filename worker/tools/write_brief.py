"""Write a completed brief to disk + register it as an artifact.

Uses contextvars to read the current run_id so the tool can insert an
artifacts row pointing back at the run that produced it. Falls back to a
loose insert if no run_id context is set (shouldn't happen in production).

Phase 5.0.1: the brief content is now stored in the `artifacts.content`
column as the authoritative source. We still write a disk copy to
ARTIFACTS_DIR as a belt-and-suspenders backup, but the web content
route reads from the DB column first and only falls back to disk for
legacy rows. This eliminates the 'DB and disk disagree' class of bugs
that caused the Phase 5.0 content endpoint 500.
"""
import re
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from config import config
from context import current_run_id
from db import insert_artifact

from .base import Tool


def _slug(s: str) -> str:
    s = re.sub(r"[^a-zA-Z0-9-]+", "-", s.lower()).strip("-")
    return s[:60] or "brief"


class WriteBriefTool(Tool):
    name = "write_brief"
    description = (
        "Save a completed research brief or report to disk as a markdown file, "
        "and register it as an artifact attached to this run. Use this when you "
        "have a final written deliverable to save. The returned path is where "
        "the file was written on the local filesystem."
    )
    parameters = {
        "type": "object",
        "properties": {
            "title": {
                "type": "string",
                "description": "Short title for the brief (used in filename and artifact name).",
            },
            "content": {
                "type": "string",
                "description": "The full markdown body of the brief.",
            },
        },
        "required": ["title", "content"],
    }

    async def execute(self, **kwargs: Any) -> dict:
        title = kwargs.get("title")
        content = kwargs.get("content")
        if not isinstance(title, str) or not title.strip():
            raise ValueError("write_brief requires a non-empty 'title' string")
        if not isinstance(content, str) or not content.strip():
            raise ValueError("write_brief requires a non-empty 'content' string")

        try:
            run_id = current_run_id.get()
        except LookupError:
            raise RuntimeError(
                "write_brief called outside a run context (current_run_id not set)"
            )

        artifacts_dir = Path(config.ARTIFACTS_DIR).resolve()
        artifacts_dir.mkdir(parents=True, exist_ok=True)

        ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
        filename = f"{ts}-{_slug(title)}.md"
        filepath = artifacts_dir / filename

        # Still write to disk as a backup — the DB column is the authoritative
        # source in Phase 5.0.1+, but the disk copy is a belt-and-suspenders
        # safety net until we trust the DB-only path completely.
        filepath.write_text(content, encoding="utf-8")
        size = filepath.stat().st_size
        content_bytes = len(content.encode("utf-8"))

        artifact_id = await insert_artifact(
            run_id=run_id,
            name=title,
            path=str(filepath),
            kind="report",
            mime_type="text/markdown",
            size=size,
            metadata={"filename": filename, "format": "markdown"},
            content=content,
            content_size=content_bytes,
        )

        return {
            "title": title,
            "path": str(filepath),
            "size_bytes": size,
            "artifact_id": str(artifact_id),
            "saved": True,
        }
