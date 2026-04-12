"""Add user_id, status, message_count to sessions."""

from __future__ import annotations

import aiosqlite

VERSION = 1


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    cols = await cursor.fetchall()
    return any(c[1] == column for c in cols)


async def up(db: aiosqlite.Connection) -> None:
    if not await _column_exists(db, "sessions", "user_id"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN user_id TEXT DEFAULT 'anonymous'"
        )
    if not await _column_exists(db, "sessions", "status"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'idle'"
        )
    if not await _column_exists(db, "sessions", "message_count"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN message_count INTEGER DEFAULT 0"
        )


async def down(db: aiosqlite.Connection) -> None:
    pass  # SQLite < 3.35 cannot DROP COLUMN
