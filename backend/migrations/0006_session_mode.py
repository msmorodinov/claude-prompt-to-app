"""Add mode column, migrate app-builder sessions, remove app-builder app."""

from __future__ import annotations

import aiosqlite

VERSION = 6


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    cols = await cursor.fetchall()
    return any(c[1] == column for c in cols)


async def up(db: aiosqlite.Connection) -> None:
    if not await _column_exists(db, "sessions", "mode"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN mode TEXT DEFAULT 'normal'"
        )

    cursor = await db.execute(
        "SELECT id FROM apps WHERE slug = 'app-builder'"
    )
    builder_row = await cursor.fetchone()
    if builder_row:
        builder_id = builder_row[0]
        await db.execute(
            "UPDATE sessions SET mode = 'app-builder' WHERE app_id = ?",
            (builder_id,),
        )
        await db.execute(
            "UPDATE sessions SET app_id = NULL, prompt_version_id = NULL "
            "WHERE mode = 'app-builder'",
        )
        await db.execute(
            "DELETE FROM prompt_versions WHERE app_id = ?", (builder_id,)
        )
        await db.execute(
            "DELETE FROM apps WHERE id = ?", (builder_id,)
        )


async def down(db: aiosqlite.Connection) -> None:
    pass
