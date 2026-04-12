"""Add user_display_name to sessions."""

from __future__ import annotations

import aiosqlite

VERSION = 4


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    cols = await cursor.fetchall()
    return any(c[1] == column for c in cols)


async def up(db: aiosqlite.Connection) -> None:
    if not await _column_exists(db, "sessions", "user_display_name"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN user_display_name TEXT DEFAULT NULL"
        )


async def down(db: aiosqlite.Connection) -> None:
    pass
