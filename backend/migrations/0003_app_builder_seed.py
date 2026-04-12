"""Seed app-builder app from app-builder-prompt.md."""

from __future__ import annotations

import logging
from pathlib import Path

import aiosqlite

VERSION = 3

logger = logging.getLogger(__name__)


async def up(db: aiosqlite.Connection) -> None:
    cursor = await db.execute("SELECT id FROM apps WHERE slug = 'app-builder'")
    if await cursor.fetchone():
        return

    builder_path = Path(__file__).parents[1] / "app-builder-prompt.md"
    if not builder_path.exists():
        logger.warning(
            "app-builder-prompt.md not found, skipping App Builder seed"
        )
        return

    body = builder_path.read_text()
    await db.execute(
        "INSERT INTO apps (slug, title, subtitle, is_active) VALUES (?, ?, ?, ?)",
        ("app-builder", "App Builder", "Design new apps interactively", 1),
    )
    app_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
    app_id = app_row[0]

    await db.execute(
        "INSERT INTO prompt_versions (app_id, body, change_note) VALUES (?, ?, ?)",
        (app_id, body, "Initial App Builder prompt"),
    )
    ver_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
    version_id = ver_row[0]

    await db.execute(
        "UPDATE apps SET current_version_id = ? WHERE id = ?",
        (version_id, app_id),
    )


async def down(db: aiosqlite.Connection) -> None:
    await db.execute(
        "DELETE FROM prompt_versions WHERE app_id IN (SELECT id FROM apps WHERE slug = 'app-builder')"
    )
    await db.execute("DELETE FROM apps WHERE slug = 'app-builder'")
